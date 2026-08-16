import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { redeemPartnerCode } from "./connectionApi";
import { colors, radius } from "../../shared/ui/theme";

type Props = {
  onConnected: () => Promise<void>;
  onSignOut: () => Promise<void>;
};

export default function ConnectPartnerScreen({ onConnected, onSignOut }: Props) {
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = async () => {
    const normalized = code.replace(/\s/g, "").toUpperCase();
    if (normalized.length !== 10) {
      setError("Enter the 10-character code shown on your partner’s desktop.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await redeemPartnerCode(normalized);
      setSuccess(true);
      await onConnected();
    } catch {
      setError("That code is invalid, expired, already used, or either account is already connected.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.safe} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.container}>
          <View style={styles.eyebrow}><Text style={styles.eyebrowText}>GAME PRESENCE</Text></View>
          <Text style={styles.title}>{success ? "You’re connected" : "Connect with your partner"}</Text>
          <Text style={styles.subtitle}>
            {success
              ? "Your partner’s live game activity is ready."
              : "Enter the one-time code shown in the Windows desktop app. It expires after 15 minutes."}
          </Text>

          {!success ? <View style={styles.card}>
            <Text style={styles.label}>Connection code</Text>
            <TextInput
              accessibilityLabel="Connection code"
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={12}
              onChangeText={(value) => setCode(value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase())}
              placeholder="ABCDE 12345"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
              value={code}
            />
            {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
            <Pressable accessibilityRole="button" disabled={submitting} onPress={() => void connect()} style={({ pressed }) => [styles.primaryButton, (pressed || submitting) && styles.buttonPressed]}>
              {submitting ? <ActivityIndicator color={colors.background} /> : <Text style={styles.primaryButtonText}>Connect</Text>}
            </Pressable>
          </View> : <View style={styles.successCard}>
            <Text style={styles.successIcon}>✓</Text>
            <Text style={styles.successText}>Accounts linked securely</Text>
          </View>}

          <Pressable accessibilityRole="button" onPress={() => void onSignOut()} style={styles.textButton}>
            <Text style={styles.textButtonText}>Sign out</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1, justifyContent: "center", padding: 24 },
  eyebrow: { alignSelf: "flex-start", backgroundColor: colors.surfaceMuted, borderRadius: radius.pill, paddingHorizontal: 11, paddingVertical: 6 },
  eyebrowText: { color: colors.accent, fontSize: 11, fontWeight: "800", letterSpacing: 1.2 },
  title: { color: colors.text, fontSize: 34, fontWeight: "800", letterSpacing: -0.8, marginTop: 20 },
  subtitle: { color: colors.textMuted, fontSize: 16, lineHeight: 24, marginTop: 12, marginBottom: 30 },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.card, padding: 20 },
  label: { color: colors.textMuted, fontSize: 13, fontWeight: "700", marginBottom: 9 },
  input: { backgroundColor: colors.background, borderColor: colors.border, borderWidth: 1, borderRadius: radius.control, color: colors.text, fontSize: 20, fontWeight: "800", letterSpacing: 2, paddingHorizontal: 16, paddingVertical: 15, textAlign: "center" },
  error: { color: colors.danger, fontSize: 13, lineHeight: 19, marginTop: 12 },
  primaryButton: { alignItems: "center", backgroundColor: colors.accent, borderRadius: radius.control, marginTop: 18, minHeight: 52, justifyContent: "center" },
  buttonPressed: { opacity: 0.75 },
  primaryButtonText: { color: colors.background, fontSize: 16, fontWeight: "800" },
  successCard: { alignItems: "center", backgroundColor: colors.surface, borderColor: colors.success, borderWidth: 1, borderRadius: radius.card, padding: 28 },
  successIcon: { color: colors.success, fontSize: 42, fontWeight: "700" },
  successText: { color: colors.text, fontSize: 17, fontWeight: "700", marginTop: 8 },
  textButton: { alignItems: "center", marginTop: 24, padding: 10 },
  textButtonText: { color: colors.textMuted, fontSize: 14, fontWeight: "700" },
});
