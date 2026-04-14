import { useState } from "react";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { register, saveSession } from "../lib/auth";

export default function RegisterScreen() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onRegister() {
    setError(null);
    setSubmitting(true);

    try {
      const { token, user } = await register(name, email, password, "CONSUMER");
      await saveSession(token, user.role);
      router.replace("/auctions");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Register</Text>

      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="Name"
        placeholderTextColor="#94a3b8"
      />

      <TextInput
        style={styles.input}
        autoCapitalize="none"
        value={email}
        onChangeText={setEmail}
        placeholder="Email"
        placeholderTextColor="#94a3b8"
      />

      <TextInput
        style={styles.input}
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        placeholder="Password"
        placeholderTextColor="#94a3b8"
      />

      <Pressable style={styles.button} onPress={onRegister} disabled={submitting}>
        <Text style={styles.buttonText}>
          {submitting ? "Creating..." : "Create Account"}
        </Text>
      </Pressable>

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0b1020",
    padding: 24,
    justifyContent: "center",
    gap: 12,
  },
  title: {
    color: "#eef2ff",
    fontSize: 28,
    fontWeight: "800",
    marginBottom: 8,
  },
  input: {
    backgroundColor: "#1a2345",
    color: "#eef2ff",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  button: {
    backgroundColor: "#6ea8fe",
    borderRadius: 999,
    paddingVertical: 14,
    marginTop: 8,
  },
  buttonText: {
    textAlign: "center",
    color: "#08111f",
    fontWeight: "800",
  },
  error: {
    color: "#ff808f",
    fontWeight: "700",
  },
});
