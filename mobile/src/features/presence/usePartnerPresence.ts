import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { disconnectPartner } from "../connection/connectionApi";
import { registerDeviceForNotifications } from "../notifications/registerDevice";
import { getSupabaseClient } from "../../config/supabase";
import { getLinkedPartner, getPresence, getRecentSessions, subscribeToPresence } from "./presenceApi";
import type { GameSession, PartnerProfile, Presence } from "./types";

type PartnerPresenceState = {
  partner: PartnerProfile | null;
  presence: Presence | null;
  sessions: GameSession[];
  loading: boolean;
  message: string | null;
  refresh: () => Promise<void>;
  disconnect: () => Promise<void>;
  signOut: () => Promise<void>;
};

export function usePartnerPresence(session: Session): PartnerPresenceState {
  const [partner, setPartner] = useState<PartnerProfile | null>(null);
  const [presence, setPresence] = useState<Presence | null>(null);
  const [sessions, setSessions] = useState<GameSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const linkedPartner = await getLinkedPartner(session.user.id);
      setPartner(linkedPartner);
      if (!linkedPartner) {
        setPresence(null);
        setSessions([]);
        return;
      }

      const [nextPresence, recentSessions] = await Promise.all([
        getPresence(linkedPartner.id),
        getRecentSessions(linkedPartner.id),
      ]);
      setPresence(nextPresence);
      setSessions(recentSessions);
    } catch {
      setPartner(null);
      setPresence(null);
      setSessions([]);
      setMessage("Your partner information could not be loaded. Pull to refresh and try again.");
    } finally {
      setLoading(false);
    }
  }, [session.user.id]);

  useEffect(() => {
    void refresh();
    void registerDeviceForNotifications(session)
      .then((registrationMessage) => { if (registrationMessage) setMessage(registrationMessage); })
      .catch(() => setMessage("Unable to register this device for notifications."));
  }, [refresh, session]);

  useEffect(() => {
    if (!partner) return;
    let active = true;
    const unsubscribe = subscribeToPresence(
      partner.id,
      (nextPresence) => {
        if (active) setPresence(nextPresence);
      },
      () => { if (active) setMessage("Live updates are reconnecting. Your last known status is still shown."); },
    );
    return () => {
      active = false;
      unsubscribe();
    };
  }, [partner]);

  const disconnect = useCallback(async () => {
    await disconnectPartner();
    await refresh();
  }, [refresh]);

  const signOut = useCallback(async () => {
    const { error } = await getSupabaseClient().auth.signOut();
    if (error) throw error;
  }, []);

  return { partner, presence, sessions, loading, message, refresh, disconnect, signOut };
}
