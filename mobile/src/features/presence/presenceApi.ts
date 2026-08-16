import { getSupabaseClient } from "../../config/supabase";
import type { PartnerProfile, Presence } from "./types";

export async function getLinkedPartner(userId: string): Promise<PartnerProfile | null> {
  const client = getSupabaseClient();
  const { data: ownProfile, error: ownError } = await client
    .from("profiles")
    .select("partner_id")
    .eq("id", userId)
    .single();

  if (ownError) throw ownError;
  if (!ownProfile?.partner_id) return null;

  const { data: partner, error: partnerError } = await client
    .from("profiles")
    .select("id, display_name, email")
    .eq("id", ownProfile.partner_id)
    .single();

  if (partnerError) throw partnerError;
  return partner as PartnerProfile;
}

export async function getPresence(partnerId: string): Promise<Presence | null> {
  const { data, error } = await getSupabaseClient()
    .from("presence")
    .select("status, current_game, started_at")
    .eq("user_id", partnerId)
    .maybeSingle();

  if (error) throw error;
  return data as Presence | null;
}

export function subscribeToPresence(
  partnerId: string,
  onChange: (presence: Presence | null) => void,
  onConnectionError: () => void,
): () => void {
  const client = getSupabaseClient();
  const channel = client
    .channel(`partner-presence:${partnerId}`)
    .on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "presence",
      filter: `user_id=eq.${partnerId}`,
    }, (payload) => {
      onChange(payload.eventType === "DELETE" ? null : payload.new as Presence);
    })
    .subscribe((status) => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") onConnectionError();
    });

  return () => { void client.removeChannel(channel); };
}
