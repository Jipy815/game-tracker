import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { registerDeviceForNotifications } from "../notifications/registerDevice";
import { partnerSelection } from "../../shared/storage/partnerSelection";
import { getLinkedPartner, getPresence, subscribeToPresence } from "./presenceApi";
import type { PartnerProfile, Presence } from "./types";
import { getSupabaseClient } from "../../config/supabase";

type PartnerPresenceState = {
  partner: PartnerProfile | null;
  selectedPartnerId: string | null;
  presence: Presence | null;
  loading: boolean;
  message: string | null;
  refresh: () => Promise<void>;
  selectPartner: () => Promise<void>;
  changePartner: () => Promise<void>;
  signOut: () => Promise<void>;
};

export function usePartnerPresence(session: Session): PartnerPresenceState {
  const [partner, setPartner] = useState<PartnerProfile | null>(null);
  const [selectedPartnerId, setSelectedPartnerId] = useState<string | null>(null);
  const [presence, setPresence] = useState<Presence | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const linkedPartner = await getLinkedPartner(session.user.id);
      setPartner(linkedPartner);
      if (!linkedPartner) {
        setSelectedPartnerId(null);
        setMessage("No partner is linked to this account yet.");
        return;
      }

      const savedPartnerId = await partnerSelection.get(session.user.id);
      setSelectedPartnerId(savedPartnerId === linkedPartner.id ? savedPartnerId : null);
    } catch {
      setPartner(null);
      setSelectedPartnerId(null);
      setMessage("Your linked partner could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [session.user.id]);

  useEffect(() => {
    void refresh();
    void registerDeviceForNotifications(session).then((registrationMessage) => {
      if (registrationMessage) setMessage(registrationMessage);
    }).catch(() => setMessage("Unable to register this device for notifications."));
  }, [refresh, session]);

  useEffect(() => {
    if (!selectedPartnerId) {
      setPresence(null);
      return;
    }

    let active = true;
    void getPresence(selectedPartnerId).then((nextPresence) => {
      if (active) setPresence(nextPresence);
    }).catch(() => {
      if (active) setMessage("Unable to load partner presence.");
    });

    const unsubscribe = subscribeToPresence(
      selectedPartnerId,
      (nextPresence) => { if (active) setPresence(nextPresence); },
      () => { if (active) setMessage("Realtime connection failed; the app will retry automatically."); },
    );
    return () => {
      active = false;
      unsubscribe();
    };
  }, [selectedPartnerId]);

  const selectPartner = useCallback(async () => {
    if (!partner) return;
    try {
      await partnerSelection.save(session.user.id, partner.id);
      setSelectedPartnerId(partner.id);
    } catch {
      setMessage("Unable to save your partner selection.");
    }
  }, [partner, session.user.id]);

  const changePartner = useCallback(async () => {
    try {
      await partnerSelection.clear(session.user.id);
      setSelectedPartnerId(null);
    } catch {
      setMessage("Unable to clear your partner selection.");
    }
  }, [session.user.id]);

  const signOut = useCallback(async () => {
    try {
      await partnerSelection.clear(session.user.id);
      const { error } = await getSupabaseClient().auth.signOut();
      if (error) throw error;
    } catch {
      setMessage("Unable to sign out. Please try again.");
    }
  }, [session.user.id]);

  return { partner, selectedPartnerId, presence, loading, message, refresh, selectPartner, changePartner, signOut };
}
