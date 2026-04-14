// File: apps/mobile/src/app/auction/[id].tsx

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { API_BASE } from "../../lib/config";
import { getToken } from "../../lib/auth";

type Auction = {
  id: string;
  status: string;
  currentPrice: string;
  minIncrement: string;
  endsAt: string;
  extendedEndsAt?: string | null;
  item?: { title?: string | null };
  shop?: { name?: string | null };
};

async function parseJsonSafe(res: Response) {
  const text = await res.text();
  return text ? JSON.parse(text) : {};
}

export default function AuctionDetailScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const auctionId = Array.isArray(params.id) ? params.id[0] : params.id;

  const [auction, setAuction] = useState<Auction | null>(null);
  const [bidAmount, setBidAmount] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const endTimeLabel = useMemo(() => {
    if (!auction) return "—";
    return new Date(auction.extendedEndsAt ?? auction.endsAt).toLocaleString();
  }, [auction]);

  const suggestedBid = useMemo(() => {
    if (!auction) return "";
    const current = Number(auction.currentPrice);
    const increment = Number(auction.minIncrement);
    if (!Number.isFinite(current) || !Number.isFinite(increment)) return "";
    return String(current + increment);
  }, [auction]);

  const load = useCallback(async () => {
    if (!auctionId) {
      setLoading(false);
      setMessage("Missing auction id.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/auctions/${auctionId}`);
      const json = await parseJsonSafe(res);

      if (!res.ok) {
        throw new Error(json?.error || "Failed to load auction");
      }

      setAuction(json as Auction);
      setBidAmount((prev) => (prev.trim() ? prev : suggestedBid || String(
        Number((json as Auction).currentPrice || 0) + Number((json as Auction).minIncrement || 0)
      )));
      setMessage(null);
    } catch (err: unknown) {
      setAuction(null);
      setMessage(err instanceof Error ? err.message : "Failed to load auction");
    } finally {
      setLoading(false);
    }
  }, [auctionId, suggestedBid]);

  useEffect(() => {
    load();
  }, [load]);

  async function placeBid() {
    if (!auctionId || !auction) return;

    if (auction.status !== "LIVE") {
      setMessage("This auction is not currently live.");
      return;
    }

    const amount = Number(bidAmount);
    const current = Number(auction.currentPrice);
    const increment = Number(auction.minIncrement);
    const minimumAllowed = current + increment;

    if (!Number.isFinite(amount) || amount <= 0) {
      setMessage("Enter a valid bid amount.");
      return;
    }

    if (Number.isFinite(minimumAllowed) && amount < minimumAllowed) {
      setMessage(`Bid must be at least $${minimumAllowed}.`);
      return;
    }

    const token = await getToken();
    if (!token) {
      setMessage("Please log in first.");
      return;
    }

    setSubmitting(true);
    setMessage(null);

    try {
      const res = await fetch(`${API_BASE}/auctions/${auctionId}/bids`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ amount }),
      });

      const json = await parseJsonSafe(res);

      if (!res.ok) {
        throw new Error(json?.error || "Bid failed");
      }

      setMessage("Bid placed!");
      await load();
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : "Bid failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.centerState}>
        <ActivityIndicator size="large" color="#6ea8fe" />
        <Text style={styles.text}>Loading auction…</Text>
      </View>
    );
  }

  if (!auction) {
    return (
      <View style={styles.centerState}>
        <Text style={styles.title}>Auction</Text>
        {message ? <Text style={styles.error}>{message}</Text> : <Text style={styles.text}>Auction not found.</Text>}
        <Pressable style={styles.secondaryButton} onPress={load}>
          <Text style={styles.secondaryButtonText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.card}>
          <Text style={styles.title}>{auction.item?.title ?? "Auction Item"}</Text>
          <Text style={styles.muted}>{auction.shop?.name ?? "Unknown Shop"}</Text>

          <Text style={styles.price}>${auction.currentPrice}</Text>

          <View style={styles.metaBlock}>
            <Text style={styles.meta}>Status: {auction.status}</Text>
            <Text style={styles.meta}>Minimum increment: ${auction.minIncrement}</Text>
            <Text style={styles.meta}>Ends: {endTimeLabel}</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Place a Bid</Text>
          <Text style={styles.muted}>
            Suggested bid: {suggestedBid ? `$${suggestedBid}` : "—"}
          </Text>

          <TextInput
            style={styles.input}
            value={bidAmount}
            onChangeText={setBidAmount}
            placeholder="Bid amount"
            placeholderTextColor="#94a3b8"
            keyboardType="decimal-pad"
            editable={!submitting}
          />

          <Pressable
            style={({ pressed }) => [
              styles.button,
              submitting && styles.buttonDisabled,
              pressed && !submitting && styles.buttonPressed,
            ]}
            onPress={placeBid}
            disabled={submitting}
          >
            <Text style={styles.buttonText}>
              {submitting ? "Placing Bid..." : "Place Bid"}
            </Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.secondaryButton,
              pressed && styles.buttonPressed,
            ]}
            onPress={load}
            disabled={submitting}
          >
            <Text style={styles.secondaryButtonText}>Refresh Auction</Text>
          </Pressable>

          {message ? (
            <Text style={message === "Bid placed!" ? styles.success : styles.error}>
              {message}
            </Text>
          ) : null}
        </View>
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
    padding: 20,
    gap: 16,
  },
  centerState: {
    flex: 1,
    backgroundColor: "#0b1020",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 12,
  },
  card: {
    backgroundColor: "#121935",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    gap: 10,
  },
  title: {
    color: "#eef2ff",
    fontSize: 28,
    fontWeight: "800",
  },
  sectionTitle: {
    color: "#eef2ff",
    fontSize: 18,
    fontWeight: "700",
  },
  text: {
    color: "#eef2ff",
    textAlign: "center",
  },
  muted: {
    color: "#a7b0d8",
  },
  metaBlock: {
    gap: 4,
  },
  meta: {
    color: "#a7b0d8",
    fontSize: 14,
  },
  price: {
    color: "#8df0cc",
    fontSize: 24,
    fontWeight: "800",
  },
  input: {
    backgroundColor: "#0f1730",
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
    marginTop: 4,
  },
  secondaryButton: {
    backgroundColor: "#1a2345",
    borderRadius: 999,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  buttonPressed: {
    opacity: 0.82,
  },
  buttonDisabled: {
    opacity: 0.65,
  },
  buttonText: {
    textAlign: "center",
    color: "#08111f",
    fontWeight: "800",
  },
  secondaryButtonText: {
    textAlign: "center",
    color: "#eef2ff",
    fontWeight: "700",
  },
  error: {
    color: "#ff808f",
    fontWeight: "700",
    lineHeight: 22,
  },
  success: {
    color: "#7ef2a7",
    fontWeight: "700",
    lineHeight: 22,
  },
});