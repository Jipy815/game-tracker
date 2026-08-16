import { createClient } from "npm:@supabase/supabase-js@2";

type QueueItem = {
  id: string;
  payload: {
    user_id?: string;
    status?: string;
    current_game?: string | null;
  };
  attempts: number;
};

const MAX_ATTEMPTS = 5;
const STALE_CLAIM_MINUTES = 15;

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function errorMessage(value: unknown): string {
  return value instanceof Error ? value.message.slice(0, 500) : String(value).slice(0, 500);
}

function retryAt(attempt: number): string {
  const minutes = Math.min(60, 2 ** Math.max(0, attempt - 1));
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

async function sendExpoNotifications(tokens: string[], message: string) {
  const result = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(tokens.map((to) => ({
      to,
      title: "Game Presence",
      body: message,
      sound: "default",
    }))),
  });

  if (!result.ok) {
    throw new Error(`Expo push request failed with HTTP ${result.status}`);
  }

  const payload = await result.json();
  const tickets = Array.isArray(payload?.data) ? payload.data : [];
  if (tickets.length !== tokens.length) {
    throw new Error("Expo returned an incomplete notification response");
  }
  const invalidTokens = tickets.flatMap((ticket: { status?: string; details?: { error?: string } }, index: number) =>
    ticket.status === "error" && ticket.details?.error === "DeviceNotRegistered" ? [tokens[index]] : [],
  );
  const errors = tickets.filter((ticket: { status?: string; details?: { error?: string } }) =>
    ticket.status === "error" && ticket.details?.error !== "DeviceNotRegistered",
  );

  if (errors.length > 0) {
    throw new Error("Expo rejected one or more push notifications");
  }

  return invalidTokens;
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return response({ error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return response({ error: "Server configuration is incomplete" }, 500);
  }

  if (request.headers.get("Authorization") !== `Bearer ${serviceRoleKey}`) {
    return response({ error: "Unauthorized" }, 401);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Recover rows abandoned by an interrupted function invocation before claiming fresh work.
  const staleBefore = new Date(Date.now() - STALE_CLAIM_MINUTES * 60_000).toISOString();
  const { error: staleRecoveryError } = await supabase
    .from("notification_queue")
    .update({ status: "pending", claimed_at: null, next_attempt_at: new Date().toISOString() })
    .eq("status", "processing")
    .lt("claimed_at", staleBefore);
  if (staleRecoveryError) {
    return response({ error: "Unable to recover stale notification work" }, 500);
  }

  const { data: items, error: claimError } = await supabase.rpc("claim_notification_queue", { batch_size: 25 });
  if (claimError) {
    return response({ error: "Unable to claim notification work" }, 500);
  }

  const summary = { claimed: items?.length ?? 0, sent: 0, retried: 0, failed: 0 };
  for (const item of (items ?? []) as QueueItem[]) {
    try {
      const userId = item.payload?.user_id;
      if (!userId || !item.payload?.status) {
        throw new Error("Notification payload is missing user_id or status");
      }

      const { data: sourceProfile, error: profileError } = await supabase
        .from("profiles")
        .select("partner_id")
        .eq("id", userId)
        .maybeSingle();
      if (profileError) {
        throw new Error("Could not load the source profile");
      }
      if (!sourceProfile?.partner_id) {
        throw new Error("No linked partner is available for this notification");
      }

      const { data: devices, error: deviceError } = await supabase
        .from("devices")
        .select("push_token")
        .eq("user_id", sourceProfile.partner_id)
        .eq("platform", "expo");
      if (deviceError) {
        throw new Error("Could not load recipient devices");
      }

      const tokens = [...new Set((devices ?? []).map((device) => device.push_token).filter(Boolean))];
      if (tokens.length === 0) {
        throw new Error("The linked partner has no registered Expo device");
      }

      const message = item.payload.status === "playing"
        ? `Your partner started playing ${item.payload.current_game ?? "a game"}`
        : `Your partner is now ${item.payload.status}`;
      const invalidTokens = await sendExpoNotifications(tokens, message);
      if (invalidTokens.length > 0) {
        await supabase
          .from("devices")
          .delete()
          .eq("user_id", sourceProfile.partner_id)
          .in("push_token", invalidTokens);
      }

      const { error: completeError } = await supabase
        .from("notification_queue")
        .update({ status: "sent", processed: true, processed_at: new Date().toISOString(), last_error: null })
        .eq("id", item.id);
      if (completeError) {
        throw new Error("Could not record the sent notification");
      }
      summary.sent += 1;
    } catch (cause) {
      const terminal = item.attempts >= MAX_ATTEMPTS;
      const { error: updateError } = await supabase
        .from("notification_queue")
        .update({
          status: terminal ? "failed" : "pending",
          processed: false,
          processed_at: null,
          claimed_at: null,
          next_attempt_at: terminal ? new Date().toISOString() : retryAt(item.attempts),
          last_error: errorMessage(cause),
        })
        .eq("id", item.id);

      if (updateError) {
        return response({ error: "Could not record notification processing failure" }, 500);
      }
      if (terminal) summary.failed += 1;
      else summary.retried += 1;
    }
  }

  return response({ ok: true, ...summary });
});
