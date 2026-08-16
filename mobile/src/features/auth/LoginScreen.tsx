import { useState } from "react";
import { ActivityIndicator, Button, StyleSheet, Text, TextInput, View } from "react-native";
import { signInWithPassword } from "./authApi";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const signIn = async () => {
    if (!email.trim() || !password) {
      setError("Enter both email and password.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await signInWithPassword(email.trim(), password);
    } catch {
      setError("Unable to sign in. Check your credentials, connection, and Supabase configuration.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Game Presence</Text>
      <Text style={styles.subtitle}>Sign in to view your linked partner's game activity.</Text>
      <TextInput
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        placeholder="Email"
        style={styles.input}
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        autoComplete="current-password"
        placeholder="Password"
        secureTextEntry
        style={styles.input}
        value={password}
        onChangeText={setPassword}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {submitting ? <ActivityIndicator /> : <Button title="Sign in" onPress={() => void signIn()} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 24, gap: 12 },
  title: { fontSize: 30, fontWeight: "700" },
  subtitle: { color: "#555", marginBottom: 12 },
  input: { borderColor: "#bbb", borderWidth: 1, borderRadius: 6, padding: 12 },
  error: { color: "#b00020" },
});
