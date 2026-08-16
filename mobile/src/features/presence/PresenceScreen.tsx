import { ActivityIndicator, Button, StyleSheet, Text, View } from "react-native";
import type { Session } from "@supabase/supabase-js";
import { usePartnerPresence } from "./usePartnerPresence";

export default function PresenceScreen({ session }: { session: Session }) {
  const { partner, selectedPartnerId, presence, loading, message, refresh, selectPartner, changePartner, signOut } = usePartnerPresence(session);

  if (loading) return <View style={styles.container}><ActivityIndicator /></View>;
  if (!partner) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Game Presence</Text>
        <Text>{message}</Text>
        <Button title="Refresh" onPress={() => void refresh()} />
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
        {message ? <Text style={styles.message}>{message}</Text> : null}
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
