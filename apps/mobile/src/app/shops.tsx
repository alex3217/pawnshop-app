// File: apps/mobile/src/app/shops.tsx

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "expo-router";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { API_BASE } from "../lib/config";

type Shop = {
  id: string;
  name: string;
  address?: string | null;
  phone?: string | null;
  description?: string | null;
  hours?: string | null;
};

type ShopsResponse =
  | Shop[]
  | {
      data?: Shop[] | null;
      error?: string;
      message?: string;
    }
  | null;

function getErrorMessage(json: ShopsResponse, status: number): string {
  if (json && typeof json === "object" && !Array.isArray(json)) {
    if (typeof json.error === "string" && json.error.trim()) return json.error;
    if (typeof json.message === "string" && json.message.trim()) return json.message;
  }

  return `Failed to load shops (${status})`;
}

function normalizeShops(json: ShopsResponse): Shop[] {
  if (Array.isArray(json)) return json;

  if (json && typeof json === "object" && Array.isArray(json.data)) {
    return json.data;
  }

  return [];
}

export default function ShopsScreen() {
  const router = useRouter();

  const [rows, setRows] = useState<Shop[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setError(null);

    try {
      const res = await fetch(`${API_BASE}/shops`);
      const json: ShopsResponse = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(getErrorMessage(json, res.status));
      }

      setRows(normalizeShops(json));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load shops");
      setRows([]);
    } finally {
      if (isRefresh) {
        setRefreshing(false);
      } else {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openShop = useCallback(
    (shopId: string) => {
      router.push({
        pathname: "/shops/[id]",
        params: { id: shopId },
      } as never);
    },
    [router]
  );

  const emptyComponent = useMemo(
    () => (
      <View style={styles.card}>
        <Text style={styles.cardTitle}>No shops found</Text>
        <Text style={styles.muted}>There are no shops available right now.</Text>
      </View>
    ),
    []
  );

  const renderShop = useCallback(
    ({ item }: { item: Shop }) => (
      <Pressable
        style={({ pressed }) => [
          styles.card,
          pressed ? styles.buttonPressed : null,
        ]}
        onPress={() => openShop(item.id)}
      >
        <View style={styles.cardTopRow}>
          <Text style={styles.cardTitle}>{item.name}</Text>
          <View style={styles.pill}>
            <Text style={styles.pillText}>Open Shop</Text>
          </View>
        </View>

        <Text style={styles.muted}>{item.address || "No address listed"}</Text>

        {item.phone ? <Text style={styles.meta}>Phone: {item.phone}</Text> : null}
        {item.hours ? <Text style={styles.meta}>Hours: {item.hours}</Text> : null}
        {item.description ? (
          <Text style={styles.description}>{item.description}</Text>
        ) : null}
      </Pressable>
    ),
    [openShop]
  );

  if (loading) {
    return (
      <View style={styles.centerState}>
        <ActivityIndicator size="large" color="#6ea8fe" />
        <Text style={styles.muted}>Loading shops...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Shops</Text>
        </View>

        <View style={styles.centerState}>
          <Text style={styles.error}>{error}</Text>

          <Pressable
            style={({ pressed }) => [
              styles.refreshButton,
              styles.retryButton,
              pressed ? styles.buttonPressed : null,
            ]}
            onPress={() => void load()}
          >
            <Text style={styles.refreshButtonText}>Retry</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Shops</Text>
          <Text style={styles.subtitle}>
            Browse local pawn shops and open their inventory.
          </Text>
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.refreshButton,
            pressed ? styles.buttonPressed : null,
          ]}
          onPress={() => void load(true)}
          disabled={refreshing}
        >
          <Text style={styles.refreshButtonText}>
            {refreshing ? "Refreshing..." : "Refresh"}
          </Text>
        </Pressable>
      </View>

      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        renderItem={renderShop}
        ListEmptyComponent={emptyComponent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void load(true)}
            tintColor="#6ea8fe"
          />
        }
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0b1020",
    padding: 20,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  title: {
    color: "#eef2ff",
    fontSize: 28,
    fontWeight: "800",
  },
  subtitle: {
    color: "#a7b0d8",
    fontSize: 14,
    marginTop: 4,
    maxWidth: 240,
    lineHeight: 20,
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
  },
  listContent: {
    paddingBottom: 24,
  },
  separator: {
    height: 12,
  },
  card: {
    backgroundColor: "#121935",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  cardTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
    gap: 10,
  },
  cardTitle: {
    color: "#eef2ff",
    fontSize: 18,
    fontWeight: "700",
    flex: 1,
  },
  muted: {
    color: "#a7b0d8",
  },
  meta: {
    color: "#a7b0d8",
    fontSize: 13,
    marginTop: 4,
  },
  description: {
    color: "#c7d2fe",
    fontSize: 13,
    lineHeight: 19,
    marginTop: 8,
  },
  pill: {
    backgroundColor: "rgba(110,168,254,0.14)",
    borderWidth: 1,
    borderColor: "rgba(110,168,254,0.28)",
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  pillText: {
    color: "#6ea8fe",
    fontSize: 12,
    fontWeight: "700",
  },
  refreshButton: {
    backgroundColor: "#1a2345",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  retryButton: {
    marginTop: 14,
  },
  refreshButtonText: {
    color: "#eef2ff",
    fontWeight: "700",
  },
  buttonPressed: {
    opacity: 0.82,
  },
  error: {
    color: "#ff808f",
    fontWeight: "700",
    textAlign: "center",
  },
});