import { getSupabaseClient } from "../../config/supabase";

function normalizeCode(code: string): string {
  return code.replace(/\s/g, "").toUpperCase();
}

export async function redeemPartnerCode(code: string): Promise<void> {
  const { error } = await getSupabaseClient().rpc("redeem_partner_connection_code", {
    submitted_code: normalizeCode(code),
  });
  if (error) throw error;
}

export async function disconnectPartner(): Promise<void> {
  const { error } = await getSupabaseClient().rpc("disconnect_partner");
  if (error) throw error;
}
