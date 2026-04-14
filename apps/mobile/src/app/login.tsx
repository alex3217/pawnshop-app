// File: apps/mobile/src/app/login.tsx

import { useState } from "react";
import { router } from "expo-router";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { login, saveSession } from "../lib/auth";

export default function LoginScreen() {
  const [email, setEmail] = useState("testconsumer@example.com");
  const [password, setPassword] = useState("TestPass123");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onLogin() {
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedPassword = password;

    if (!normalizedEmail || !normalizedPassword) {
      setError("Email and password are required.");
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      const { token, user } = await login(normalizedEmail, normalizedPassword);
      await saveSession(token, user.role);
      router.replace("/auctions");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.container}>
        <Text style={styles.badge}>Buyer Access</Text>
        <Text style={styles.title}>Login</Text>
        <Text style={styles.subtitle}>
          Sign in to browse auctions and place bids from mobile.
        </Text>

        <View style={styles.form}>
          <TextInput
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="username"
            value={email}
            onChangeText={setEmail}
            placeholder="Email"
            placeholderTextColor="#94a3b8"
            editable={!submitting}
            returnKeyType="next"
          />

          <TextInput
            style={styles.input}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="password"
            value={password}
            onChangeText={setPassword}
            placeholder="Password"
            placeholderTextColor="#94a3b8"
            editable={!submitting}
            returnKeyType="done"
            onSubmitEditing={onLogin}
          />

          <Pressable
            style={({ pressed }) => [
              styles.button,
              submitting && styles.buttonDisabled,
              pressed && !submitting && styles.buttonPressed,
            ]}
            onPress={onLogin}
            disabled={submitting}
          >
            <Text style={styles.buttonText}>
              {submitting ? "Logging In..." : "Login"}
            </Text>
          </Pressable>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.testCard}>
            <Text style={styles.testTitle}>Dev test account</Text>
            <Text style={styles.testText}>testconsumer@example.com</Text>
            <Text style={styles.testText}>TestPass123</Text>
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#0b1020",
  },
  container: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
    gap: 12,
  },
  badge: {
    color: "#6ea8fe",
    fontWeight: "700",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  title: {
    color: "#eef2ff",
    fontSize: 30,
    fontWeight: "800",
  },
  subtitle: {
    color: "#a7b0d8",
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 8,
  },
  form: {
    gap: 12,
    marginTop: 8,
  },
  input: {
    backgroundColor: "#1a2345",
    color: "#eef2ff",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  button: {
    backgroundColor: "#6ea8fe",
    borderRadius: 999,
    paddingVertical: 14,
    marginTop: 4,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonDisabled: {
    opacity: 0.65,
  },
  buttonText: {
    textAlign: "center",
    color: "#08111f",
    fontWeight: "800",
    fontSize: 16,
  },
  error: {
    color: "#ff808f",
    fontWeight: "700",
    lineHeight: 22,
  },
  testCard: {
    marginTop: 12,
    padding: 14,
    borderRadius: 14,
    backgroundColor: "#121935",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    gap: 4,
  },
  testTitle: {
    color: "#eef2ff",
    fontWeight: "800",
    marginBottom: 2,
  },
  testText: {
    color: "#a7b0d8",
  },
});