import { ActivityIndicator, SafeAreaView, StatusBar, StyleSheet, Text, View } from "react-native";
import type { Session } from "@supabase/supabase-js";
import LoginScreen from "./src/features/auth/LoginScreen";
import ConnectPartnerScreen from "./src/features/connection/ConnectPartnerScreen";
import { useAuthSession } from "./src/features/auth/useAuthSession";
import PresenceScreen from "./src/features/presence/PresenceScreen";
import { usePartnerPresence } from "./src/features/presence/usePartnerPresence";
import { isSupabaseConfigured } from "./src/config/supabase";
import { colors } from "./src/shared/ui/theme";

export default function App() {
  const { session, loading } = useAuthSession();

  if (!isSupabaseConfigured) {
    return <ConfigurationRequired />;
  }
  if (loading) {
    return <LoadingScreen />;
  }
  return session ? <AuthenticatedApp session={session} /> : <LoginScreen />;
}

function AuthenticatedApp({ session }: { session: Session }) {
  const state = usePartnerPresence(session);
  if (state.loading) return <LoadingScreen />;
  if (!state.partner) {
    return <ConnectPartnerScreen onConnected={state.refresh} onSignOut={state.signOut} />;
  }

  return <PresenceScreen
    partner={state.partner}
    presence={state.presence}
    sessions={state.sessions}
    message={state.message}
    refresh={state.refresh}
    disconnect={state.disconnect}
    signOut={state.signOut}
  />;
}

function LoadingScreen() {
  return <SafeAreaView style={styles.center}><StatusBar barStyle="light-content" /><ActivityIndicator color={colors.accent} size="large" /><Text style={styles.loadingText}>Loading Game Presence…</Text></SafeAreaView>;
}

function ConfigurationRequired() {
  return <SafeAreaView style={styles.center}><StatusBar barStyle="light-content" /><View style={styles.configurationCard}><Text style={styles.configurationTitle}>Configuration required</Text><Text style={styles.configurationCopy}>Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY to mobile/.env, then restart Expo with --clear.</Text></View></SafeAreaView>;
}

const styles = StyleSheet.create({
  center: { alignItems: "center", backgroundColor: colors.background, flex: 1, justifyContent: "center", padding: 24 },
  loadingText: { color: colors.textMuted, fontSize: 14, marginTop: 14 },
  configurationCard: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 20, borderWidth: 1, padding: 22 },
  configurationTitle: { color: colors.text, fontSize: 20, fontWeight: "800" },
  configurationCopy: { color: colors.textMuted, fontSize: 14, lineHeight: 21, marginTop: 9 },
});
