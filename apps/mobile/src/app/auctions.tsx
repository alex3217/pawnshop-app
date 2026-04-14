// File: apps/mobile/src/app/auctions.tsx

import { useCallback, useEffect, useState } from "react";
import { router } from "expo-router";
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

type Auction = {
  id: string;
  status: string;
  currentPrice: string;
  endsAt: string;
  extendedEndsAt?: string | null;
  item?: { title?: string | null };
  shop?: { name?: string | null };
};

type AuctionsResponse = {
  rows?: Auction[];
  error?: string;
};

export default function AuctionsScreen() {
  const [rows, setRows] = useState<Auction[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    setError(null);

    try {
      const res = await fetch(`${API_BASE}/auctions?status=LIVE`);
      const json = (await res.json().catch(() => ({}))) as AuctionsResponse;

      if (!res.ok) {
        throw new Error(json?.error || `Failed to load auctions (${res.status})`);
      }

      setRows(Array.isArray(json.rows) ? json.rows : []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load auctions");
      setRows([]);
    } finally {
      if (isRefresh) setRefreshing(false);
      else setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function openAuction(id: string) {
    router.push(`/auction/${id}`);
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Live Auctions</Text>

        <Pressable
          style={({ pressed }) => [
            styles.refreshButton,
            pressed && styles.buttonPressed,
          ]}
          onPress={() => load(true)}
          disabled={loading || refreshing}
        >
          <Text style={styles.refreshButtonText}>
            {refreshing ? "Refreshing..." : "Refresh"}
          </Text>
        </Pressable>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loading ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color="#6ea8fe" />
          <Text style={styles.muted}>Loading auctions…</Text>
        </View>
      ) : null}

      {!loading && rows.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No live auctions</Text>
          <Text style={styles.muted}>
            There are no live auctions available right now.
          </Text>
        </View>
      ) : null}

      {!loading && rows.length > 0 ? (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load(true)}
              tintColor="#6ea8fe"
            />
          }
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          contentContainerStyle={{ paddingBottom: 24 }}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>
                {item.item?.title || "Auction Item"}
              </Text>

              <Text style={styles.muted}>
                {item.shop?.name || "Unknown Shop"}
              </Text>

              <Text style={styles.price}>${item.currentPrice}</Text>

              <Text style={styles.meta}>
                Status: {item.status}
              </Text>

              <Text style={styles.meta}>
                Ends: {new Date(item.extendedEndsAt ?? item.endsAt).toLocaleString()}
              </Text>

              <Pressable
                style={({ pressed }) => [
                  styles.openButton,
                  pressed && styles.buttonPressed,
                ]}
                onPress={() => openAuction(item.id)}
              >
                <Text style={styles.openButtonText}>Open Auction</Text>
              </Pressable>
            </View>
          )}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0b1020",
    padding: 20,
    gap: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  title: {
    color: "#eef2ff",
    fontSize: 28,
    fontWeight: "800",
  },
  centerState: {
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingVertical: 40,
  },
  card: {
    backgroundColor: "#121935",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    gap: 6,
  },
  emptyCard: {
    backgroundColor: "#121935",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    gap: 8,
  },
  emptyTitle: {
    color: "#eef2ff",
    fontSize: 18,
    fontWeight: "700",
  },
  cardTitle: {
    color: "#eef2ff",
    fontSize: 18,
    fontWeight: "700",
  },
  muted: {
    color: "#a7b0d8",
  },
  meta: {
    color: "#a7b0d8",
    fontSize: 13,
  },
  price: {
    color: "#8df0cc",
    fontSize: 20,
    fontWeight: "800",
  },
  openButton: {
    marginTop: 8,
    backgroundColor: "#6ea8fe",
    borderRadius: 999,
    paddingVertical: 12,
  },
  openButtonText: {
    textAlign: "center",
    color: "#08111f",
    fontWeight: "800",
  },
  refreshButton: {
    backgroundColor: "#1a2345",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 14,
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
  },
});