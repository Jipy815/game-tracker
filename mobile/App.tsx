import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import LoginScreen from "./src/features/auth/LoginScreen";
import { useAuthSession } from "./src/features/auth/useAuthSession";
import PresenceScreen from "./src/features/presence/PresenceScreen";
import { isSupabaseConfigured } from "./src/config/supabase";

export default function App() {
  const { session, loading } = useAuthSession();

  if (!isSupabaseConfigured) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Configuration required</Text>
        <Text>Copy mobile/.env.example to mobile/.env and add your public Supabase values.</Text>
      </View>
    );
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator /></View>;
  }

  return session ? <PresenceScreen session={session} /> : <LoginScreen />;
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", padding: 24, gap: 12 },
  title: { fontSize: 20, fontWeight: "700" },
});
