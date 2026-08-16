import { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from "react-native";
import { signInWithPassword } from "./authApi";
import { colors, radius } from "../../shared/ui/theme";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const signIn = async () => {
    if (!email.trim() || !password) {
      setError("Enter both your email and password.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await signInWithPassword(email.trim(), password);
    } catch {
      setError("We couldn’t sign you in. Check your credentials and connection, then try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.safe}>
        <View style={styles.container}>
          <Text style={styles.eyebrow}>GAME PRESENCE</Text>
          <Text style={styles.title}>See their game,{"\n"}as it happens.</Text>
          <Text style={styles.subtitle}>Sign in with your own account to connect with your partner securely.</Text>
          <View style={styles.form}>
            <Text style={styles.label}>Email</Text>
            <TextInput accessibilityLabel="Email" autoCapitalize="none" autoComplete="email" keyboardType="email-address" onChangeText={setEmail} placeholder="you@example.com" placeholderTextColor={colors.textMuted} style={styles.input} value={email} />
            <Text style={[styles.label, styles.passwordLabel]}>Password</Text>
            <TextInput accessibilityLabel="Password" autoComplete="current-password" onChangeText={setPassword} placeholder="Your password" placeholderTextColor={colors.textMuted} secureTextEntry style={styles.input} value={password} />
            {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
            <Pressable accessibilityRole="button" disabled={submitting} onPress={() => void signIn()} style={({ pressed }) => [styles.button, (pressed || submitting) && styles.buttonPressed]}>
              {submitting ? <ActivityIndicator color={colors.background} /> : <Text style={styles.buttonText}>Sign in</Text>}
            </Pressable>
          </View>
          <Text style={styles.footnote}>Use the email and password created in Supabase Authentication. Accounts are never shared between partners.</Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { backgroundColor: colors.background, flex: 1 },
  container: { flex: 1, justifyContent: "center", padding: 24 },
  eyebrow: { color: colors.accent, fontSize: 12, fontWeight: "800", letterSpacing: 1.4 },
  title: { color: colors.text, fontSize: 35, fontWeight: "800", letterSpacing: -1, lineHeight: 41, marginTop: 14 },
  subtitle: { color: colors.textMuted, fontSize: 16, lineHeight: 24, marginTop: 14 },
  form: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.card, borderWidth: 1, marginTop: 28, padding: 20 },
  label: { color: colors.textMuted, fontSize: 13, fontWeight: "700", marginBottom: 8 },
  passwordLabel: { marginTop: 16 },
  input: { backgroundColor: colors.background, borderColor: colors.border, borderRadius: radius.control, borderWidth: 1, color: colors.text, fontSize: 16, paddingHorizontal: 14, paddingVertical: 14 },
  error: { color: colors.danger, fontSize: 13, lineHeight: 19, marginTop: 12 },
  button: { alignItems: "center", backgroundColor: colors.accent, borderRadius: radius.control, justifyContent: "center", marginTop: 20, minHeight: 52 },
  buttonPressed: { opacity: 0.75 },
  buttonText: { color: colors.background, fontSize: 16, fontWeight: "800" },
  footnote: { color: colors.textMuted, fontSize: 12, lineHeight: 18, marginTop: 18, textAlign: "center" },
});
