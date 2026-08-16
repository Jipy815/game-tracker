import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Button, Platform, StyleSheet, Text, View } from "react-native";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseClient } from "../src/supabase";

type Profile = { id: string; display_name: string | null; email: string | null };
type Presence = { status: string; current_game: string | null; started_at: string | null };

const selectionKey = (userId: string) => `game-presence:selected-partner:${userId}`;

async function registerDevice(session: Session): Promise<string | null> {
  if (!Device.isDevice) {
    return "Push notifications require a physical device.";
  }
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Default",
      importance: Notifications.AndroidImportance.MAX,
    });
  }

  const existing = await Notifications.getPermissionsAsync();
  const permissions = existing.status === "granted" ? existing : await Notifications.requestPermissionsAsync();
  if (permissions.status !== "granted") {
    return "Notification permission was not granted.";
  }

  const projectId = Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) {
    return "EXPO_PUBLIC_EAS_PROJECT_ID is required for push-token registration.";
  }

  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  const { error } = await getSupabaseClient().from("devices").upsert(
    {
      user_id: session.user.id,
      push_token: token,
      platform: "expo",
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "user_id,push_token" },
  );
  return error ? "Unable to register this device for notifications." : null;
}

export default function PresenceScreen({ session }: { session: Session }) {
  const [partner, setPartner] = useState<Profile | null>(null);
  const [selectedPartnerId, setSelectedPartnerId] = useState<string | null>(null);
  const [presence, setPresence] = useState<Presence | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const loadPartner = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    const client = getSupabaseClient();
    const { data: ownProfile, error: ownError } = await client
      .from("profiles")
      .select("partner_id")
      .eq("id", session.user.id)
      .single();
    if (ownError || !ownProfile?.partner_id) {
      setPartner(null);
      setSelectedPartnerId(null);
      setMessage("No partner is linked to this account yet.");
      setLoading(false);
      return;
    }

    const { data: linkedProfile, error: partnerError } = await client
      .from("profiles")
      .select("id, display_name, email")
      .eq("id", ownProfile.partner_id)
      .single();
    if (partnerError || !linkedProfile) {
      setMessage("Your linked partner could not be loaded.");
      setLoading(false);
      return;
    }

    setPartner(linkedProfile);
    const stored = await AsyncStorage.getItem(selectionKey(session.user.id));
    setSelectedPartnerId(stored === linkedProfile.id ? stored : null);
    setLoading(false);
  }, [session.user.id]);

  useEffect(() => {
    void loadPartner();
    void registerDevice(session).then((registrationMessage) => {
      if (registrationMessage) setMessage(registrationMessage);
    });
  }, [loadPartner, session]);

  useEffect(() => {
    if (!selectedPartnerId) {
      setPresence(null);
      return;
    }

    const client = getSupabaseClient();
    let active = true;
    const loadPresence = async () => {
      const { data, error } = await client
        .from("presence")
        .select("status, current_game, started_at")
        .eq("user_id", selectedPartnerId)
        .maybeSingle();
      if (active) {
        if (error) setMessage("Unable to load partner presence.");
        else setPresence(data);
      }
    };

    void loadPresence();
    const channel = client
      .channel(`partner-presence:${selectedPartnerId}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "presence",
        filter: `user_id=eq.${selectedPartnerId}`,
      }, (payload) => {
        if (!active) return;
        if (payload.eventType === "DELETE") setPresence(null);
        else setPresence(payload.new as Presence);
      })
      .subscribe((status) => {
        if (active && (status === "CHANNEL_ERROR" || status === "TIMED_OUT")) {
          setMessage("Realtime connection failed; the app will retry automatically.");
        }
      });

    return () => {
      active = false;
      void client.removeChannel(channel);
    };
  }, [selectedPartnerId]);

  const selectPartner = async () => {
    if (!partner) return;
    await AsyncStorage.setItem(selectionKey(session.user.id), partner.id);
    setSelectedPartnerId(partner.id);
  };

  const changePartner = async () => {
    await AsyncStorage.removeItem(selectionKey(session.user.id));
    setSelectedPartnerId(null);
  };

  const signOut = async () => {
    await AsyncStorage.removeItem(selectionKey(session.user.id));
    await getSupabaseClient().auth.signOut();
  };

  if (loading) return <View style={styles.container}><ActivityIndicator /></View>;
  if (!partner) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Game Presence</Text>
        <Text>{message}</Text>
        <Button title="Refresh" onPress={() => void loadPartner()} />
        <Button title="Sign out" onPress={() => void signOut()} />
      </View>
    );
  }

  if (!selectedPartnerId) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Select partner</Text>
        <Text style={styles.partner}>{partner.display_name ?? partner.email ?? "Linked partner"}</Text>
        <Text>This account can monitor only the partner linked by the trusted server.</Text>
        <Button title="Monitor this partner" onPress={() => void selectPartner()} />
        <Button title="Sign out" onPress={() => void signOut()} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{partner.display_name ?? partner.email ?? "Partner"}</Text>
      <Text style={styles.status}>{presence?.status === "playing" ? "● Playing" : "Offline"}</Text>
      {presence?.current_game ? <Text style={styles.game}>{presence.current_game}</Text> : null}
      {presence?.started_at ? <Text>Started: {new Date(presence.started_at).toLocaleTimeString()}</Text> : null}
      {message ? <Text style={styles.message}>{message}</Text> : null}
      <Button title="Change partner" onPress={() => void changePartner()} />
      <Button title="Sign out" onPress={() => void signOut()} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24, gap: 12 },
  title: { fontSize: 28, fontWeight: "700" },
  partner: { fontSize: 20, fontWeight: "600" },
  status: { fontSize: 20, fontWeight: "600", color: "#237a3b" },
  game: { fontSize: 24, fontWeight: "700" },
  message: { color: "#8a5a00", textAlign: "center" },
});
