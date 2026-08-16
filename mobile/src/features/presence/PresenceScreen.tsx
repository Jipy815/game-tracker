import { useEffect, useState } from "react";
import {
  Alert,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { GameSession, PartnerProfile, Presence } from "./types";
import { colors, formatElapsed, formatLastSeen, radius } from "../../shared/ui/theme";

type Props = {
  partner: PartnerProfile;
  presence: Presence | null;
  sessions: GameSession[];
  message: string | null;
  refresh: () => Promise<void>;
  disconnect: () => Promise<void>;
  signOut: () => Promise<void>;
};

export default function PresenceScreen({ partner, presence, sessions, message, refresh, disconnect, signOut }: Props) {
  const [refreshing, setRefreshing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [, setTick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setTick((value) => value + 1), 30_000);
    return () => clearInterval(timer);
  }, []);

  const isPlaying = presence?.status === "playing";
  const trackerActive = Boolean(
    presence?.updated_at && presence.status !== "offline" && Date.now() - new Date(presence.updated_at).getTime() < 90_000,
  );
  const partnerName = partner.display_name ?? partner.email ?? "Your partner";

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const confirmDisconnect = () => Alert.alert(
    "Disconnect partner?",
    "You’ll need a new code from the desktop app to connect again.",
    [
      { text: "Cancel", style: "cancel" },
      { text: "Disconnect", style: "destructive", onPress: () => void disconnect().catch(() => Alert.alert("Couldn’t disconnect", "Please check your connection and try again.")) },
    ],
  );

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={colors.accent} />}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>GAME PRESENCE</Text>
            <Text style={styles.title}>{partnerName}</Text>
          </View>
          <Pressable accessibilityLabel="Open settings" accessibilityRole="button" onPress={() => setShowSettings((value) => !value)} style={styles.settingsButton}>
            <Text style={styles.settingsText}>{showSettings ? "Close" : "Settings"}</Text>
          </Pressable>
        </View>

        {showSettings ? <View style={styles.settingsCard}>
          <Text style={styles.settingsTitle}>Connection</Text>
          <Text style={styles.settingsCopy}>Connected with {partnerName}. Disconnecting stops both accounts from seeing each other’s presence.</Text>
          <Pressable accessibilityRole="button" onPress={confirmDisconnect} style={styles.dangerButton}><Text style={styles.dangerButtonText}>Disconnect partner</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={() => void signOut().catch(() => Alert.alert("Couldn’t sign out", "Please try again."))} style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>Sign out</Text></Pressable>
        </View> : null}

        <View style={[styles.presenceCard, isPlaying ? styles.playingCard : !trackerActive && styles.offlineCard]}>
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, { backgroundColor: isPlaying ? colors.success : trackerActive ? colors.warning : colors.textMuted }]} />
            <Text style={styles.statusLabel}>{isPlaying ? "CURRENTLY PLAYING" : trackerActive ? "ONLINE" : "TRACKER OFFLINE"}</Text>
          </View>
          <Text style={styles.mainStatus}>
            {isPlaying ? presence?.current_game ?? "A game" : trackerActive ? "Not playing right now" : "Not actively reporting"}
          </Text>
          {isPlaying && presence?.current_executable ? <Text style={styles.executable}>{presence.current_executable}</Text> : null}
          {isPlaying && presence?.started_at ? <Text style={styles.duration}>Playing for {formatElapsed(presence.started_at)}</Text> : null}
          <Text style={styles.lastSeen}>{formatLastSeen(presence?.updated_at ?? null)}</Text>
        </View>

        <View style={styles.trackerRow}>
          <View style={[styles.trackerIcon, { backgroundColor: trackerActive ? "rgba(81,211,155,0.16)" : "rgba(170,180,207,0.14)" }]}><Text>{trackerActive ? "●" : "○"}</Text></View>
          <View style={styles.trackerCopy}><Text style={styles.trackerTitle}>{trackerActive ? "Desktop tracker is active" : "Desktop tracker is offline"}</Text><Text style={styles.trackerBody}>{trackerActive ? "Presence is being updated automatically." : "It will update when your partner starts the Windows tracker."}</Text></View>
        </View>

        {message ? <View accessibilityLiveRegion="polite" style={styles.message}><Text style={styles.messageText}>{message}</Text></View> : null}

        <Text style={styles.sectionTitle}>Recent activity</Text>
        {sessions.length === 0 ? <View style={styles.emptyCard}><Text style={styles.emptyTitle}>No recent activity</Text><Text style={styles.emptyCopy}>Game sessions will appear here once the desktop tracker detects a supported game.</Text></View> : sessions.map((game) => <SessionCard key={game.id} session={game} />)}
      </ScrollView>
    </SafeAreaView>
  );
}

function SessionCard({ session }: { session: GameSession }) {
  const started = new Date(session.start_time);
  return <View style={styles.sessionCard}>
    <View style={styles.sessionIcon}><Text style={styles.sessionIconText}>◈</Text></View>
    <View style={styles.sessionCopy}>
      <Text style={styles.sessionTitle}>{session.game_name}</Text>
      <Text style={styles.sessionMeta}>{session.executable_name ?? "Game session"} · {started.toLocaleDateString()}</Text>
    </View>
    <Text style={styles.sessionDuration}>{session.end_time ? formatElapsed(session.start_time) : "Playing"}</Text>
  </View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 42 },
  header: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginBottom: 24, marginTop: 8 },
  eyebrow: { color: colors.accent, fontSize: 11, fontWeight: "800", letterSpacing: 1.2 },
  title: { color: colors.text, fontSize: 28, fontWeight: "800", letterSpacing: -0.6, marginTop: 4, maxWidth: 260 },
  settingsButton: { borderColor: colors.border, borderRadius: radius.pill, borderWidth: 1, paddingHorizontal: 13, paddingVertical: 9 },
  settingsText: { color: colors.text, fontSize: 13, fontWeight: "700" },
  settingsCard: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.card, borderWidth: 1, marginBottom: 16, padding: 18 },
  settingsTitle: { color: colors.text, fontSize: 17, fontWeight: "800" },
  settingsCopy: { color: colors.textMuted, fontSize: 14, lineHeight: 20, marginTop: 7 },
  dangerButton: { alignItems: "center", borderColor: colors.danger, borderRadius: radius.control, borderWidth: 1, marginTop: 16, padding: 13 },
  dangerButtonText: { color: colors.danger, fontWeight: "800" },
  secondaryButton: { alignItems: "center", padding: 14 },
  secondaryButtonText: { color: colors.textMuted, fontWeight: "700" },
  presenceCard: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.card, borderWidth: 1, padding: 22 },
  playingCard: { borderColor: "rgba(81,211,155,0.55)" },
  offlineCard: { opacity: 0.85 },
  statusRow: { alignItems: "center", flexDirection: "row" },
  statusDot: { borderRadius: radius.pill, height: 9, marginRight: 8, width: 9 },
  statusLabel: { color: colors.textMuted, fontSize: 11, fontWeight: "800", letterSpacing: 1 },
  mainStatus: { color: colors.text, fontSize: 27, fontWeight: "800", letterSpacing: -0.6, marginTop: 16 },
  executable: { color: colors.accent, fontFamily: "monospace", fontSize: 13, marginTop: 8 },
  duration: { color: colors.success, fontSize: 15, fontWeight: "700", marginTop: 11 },
  lastSeen: { color: colors.textMuted, fontSize: 13, marginTop: 16 },
  trackerRow: { alignItems: "center", flexDirection: "row", marginTop: 18 },
  trackerIcon: { alignItems: "center", borderRadius: radius.pill, height: 36, justifyContent: "center", marginRight: 11, width: 36 },
  trackerCopy: { flex: 1 },
  trackerTitle: { color: colors.text, fontSize: 14, fontWeight: "800" },
  trackerBody: { color: colors.textMuted, fontSize: 13, lineHeight: 19, marginTop: 2 },
  message: { backgroundColor: "rgba(255,200,87,0.12)", borderColor: "rgba(255,200,87,0.35)", borderRadius: radius.control, borderWidth: 1, marginTop: 18, padding: 13 },
  messageText: { color: colors.warning, fontSize: 13, lineHeight: 19 },
  sectionTitle: { color: colors.text, fontSize: 18, fontWeight: "800", marginBottom: 12, marginTop: 30 },
  emptyCard: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.card, borderWidth: 1, padding: 20 },
  emptyTitle: { color: colors.text, fontSize: 16, fontWeight: "800" },
  emptyCopy: { color: colors.textMuted, fontSize: 14, lineHeight: 20, marginTop: 6 },
  sessionCard: { alignItems: "center", backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.control, borderWidth: 1, flexDirection: "row", marginBottom: 10, padding: 14 },
  sessionIcon: { alignItems: "center", backgroundColor: colors.surfaceMuted, borderRadius: 10, height: 38, justifyContent: "center", marginRight: 11, width: 38 },
  sessionIconText: { color: colors.accent },
  sessionCopy: { flex: 1 },
  sessionTitle: { color: colors.text, fontSize: 15, fontWeight: "800" },
  sessionMeta: { color: colors.textMuted, fontSize: 12, marginTop: 3 },
  sessionDuration: { color: colors.textMuted, fontSize: 12, fontWeight: "700", marginLeft: 8 },
});
