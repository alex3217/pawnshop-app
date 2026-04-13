import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { API_BASE } from "../lib/config";

type ScanPayload = {
  item?: {
    id?: string;
    title?: string;
    description?: string;
    price?: string | number;
    category?: string;
    condition?: string;
    pawnShopId?: string;
  };
  title?: string;
  description?: string;
  price?: string | number;
  category?: string;
  condition?: string;
  pawnShopId?: string;
  code?: string;
  source?: string;
};

type ScanResponse = {
  data?: ScanPayload;
  sold?: unknown;
  [key: string]: unknown;
};

async function resolveScanRequest(input: {
  token: string;
  shopId: string;
  code: string;
}): Promise<ScanResponse> {
  const response = await fetch(`${API_BASE}/items/scan`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${input.token}`,
    },
    body: JSON.stringify({
      shopId: input.shopId,
      code: input.code,
    }),
  });

  const text = await response.text();
  const json = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(
      json?.error || json?.message || `Request failed (${response.status})`
    );
  }

  return json;
}

export default function ScanIntakeScreen() {
  const [token, setToken] = useState("");
  const [shopId, setShopId] = useState("cmnv77wzu0002xxh3zoa64b7w");
  const [code, setCode] = useState("TEST-CODE-123");
  const [result, setResult] = useState<ScanResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onResolve() {
    const normalizedToken = token.trim();
    const normalizedShopId = shopId.trim();
    const normalizedCode = code.trim();

    if (!normalizedToken || !normalizedShopId || !normalizedCode) {
      setError("Token, shop id, and code are required.");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const data = await resolveScanRequest({
        token: normalizedToken,
        shopId: normalizedShopId,
        code: normalizedCode,
      });
      setResult(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Scan failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.badge}>Owner Intake</Text>
        <Text style={styles.title}>Scan Intake</Text>
        <Text style={styles.subtitle}>
          Resolve a code through the API and preview the prefilled item data.
        </Text>

        <View style={styles.form}>
          <TextInput
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
            value={token}
            onChangeText={setToken}
            placeholder="Bearer token"
            placeholderTextColor="#94a3b8"
            editable={!loading}
          />

          <TextInput
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
            value={shopId}
            onChangeText={setShopId}
            placeholder="Shop ID"
            placeholderTextColor="#94a3b8"
            editable={!loading}
          />

          <TextInput
            style={styles.input}
            autoCapitalize="characters"
            autoCorrect={false}
            value={code}
            onChangeText={setCode}
            placeholder="Scan code"
            placeholderTextColor="#94a3b8"
            editable={!loading}
          />

          <Pressable
            style={({ pressed }) => [
              styles.button,
              loading && styles.buttonDisabled,
              pressed && !loading ? styles.buttonPressed : null,
            ]}
            onPress={onResolve}
            disabled={loading}
          >
            <Text style={styles.buttonText}>
              {loading ? "Resolving..." : "Resolve Scan"}
            </Text>
          </Pressable>

          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>

        {result ? (
          <View style={styles.resultCard}>
            <Text style={styles.resultTitle}>Result</Text>
            <Text style={styles.resultText}>
              {JSON.stringify(result, null, 2)}
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#0b1020",
  },
  container: {
    padding: 24,
    gap: 14,
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
  resultCard: {
    marginTop: 12,
    padding: 14,
    borderRadius: 14,
    backgroundColor: "#121935",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    gap: 8,
  },
  resultTitle: {
    color: "#eef2ff",
    fontWeight: "800",
  },
  resultText: {
    color: "#a7b0d8",
    fontFamily: Platform.select({
      ios: "Menlo",
      android: "monospace",
      default: "monospace",
    }),
  },
});
