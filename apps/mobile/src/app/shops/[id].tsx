import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { API_BASE } from "../../lib/config";

type Shop = {
  id: string;
  name: string;
  address?: string | null;
  phone?: string | null;
  description?: string | null;
  hours?: string | null;
};

type Item = {
  id: string;
  title?: string | null;
  name?: string | null;
  description?: string | null;
  status?: string | null;
  price?: number | string | null;
  priceCents?: number | null;
  category?: string | null;
  condition?: string | null;
  images?: string[] | null;
};

type ShopItemsResponse = {
  shop?: Shop | null;
  items?: Item[] | null;
  error?: string;
  message?: string;
};

function normalizeRouteId(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function formatPrice(item: Item): string {
  if (typeof item.price === "number" && Number.isFinite(item.price)) {
    return `$${item.price.toFixed(2)}`;
  }

  if (typeof item.price === "string" && item.price.trim()) {
    const parsed = Number(item.price);
    if (Number.isFinite(parsed)) {
      return `$${parsed.toFixed(2)}`;
    }
  }

  if (typeof item.priceCents === "number" && Number.isFinite(item.priceCents)) {
    return `$${(item.priceCents / 100).toFixed(2)}`;
  }

  return "Price unavailable";
}

function normalizePhoneForDial(phone?: string | null): string | null {
  if (!phone) return null;
  const cleaned = phone.replace(/[^\d+]/g, "");
  return cleaned || null;
}

export default function ShopDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const shopId = normalizeRouteId(params.id);

  const [shop, setShop] = useState<Shop | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (isRefresh = false) => {
      if (!shopId) {
        setError("Missing shop id.");
        setShop(null);
        setItems([]);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError(null);

      try {
        const res = await fetch(`${API_BASE}/shops/${shopId}/items`);
        const json: ShopItemsResponse | null = await res.json().catch(() => null);

        if (!res.ok) {
          const message =
            json && typeof json === "object"
              ? json.error || json.message || `Failed to load shop (${res.status})`
              : `Failed to load shop (${res.status})`;

          throw new Error(message);
        }

        setShop(json?.shop ?? null);
        setItems(Array.isArray(json?.items) ? json.items : []);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load shop");
        setShop(null);
        setItems([]);
      } finally {
        if (isRefresh) {
          setRefreshing(false);
        } else {
          setLoading(false);
        }
      }
    },
    [shopId]
  );

  useEffect(() => {
    void load();
  }, [load]);

  const onCallShop = useCallback(async () => {
    const phone = normalizePhoneForDial(shop?.phone);
    if (!phone) return;

    const url = `tel:${phone}`;
    const supported = await Linking.canOpenURL(url);

    if (supported) {
      await Linking.openURL(url);
    }
  }, [shop?.phone]);

  const openItem = useCallback(
    (itemId: string) => {
      router.push(`/items/${itemId}` as never);
    },
    [router]
  );

  const header = useMemo(() => {
    if (!shop) return null;

    const itemCount = items.length;
    const hasCallablePhone = Boolean(normalizePhoneForDial(shop.phone));

    return (
      <View style={styles.headerCard}>
        <View style={styles.headerTopRow}>
          <View style={styles.headerTextBlock}>
            <Text style={styles.title}>{shop.name}</Text>
            <Text style={styles.meta}>{shop.address || "No address listed"}</Text>
            {shop.phone ? <Text style={styles.meta}>Phone: {shop.phone}</Text> : null}
            {shop.hours ? <Text style={styles.meta}>Hours: {shop.hours}</Text> : null}
          </View>

          <View style={styles.badge}>
            <Text style={styles.badgeText}>
              {itemCount} item{itemCount === 1 ? "" : "s"}
            </Text>
          </View>
        </View>

        {shop.description ? (
          <Text style={styles.description}>{shop.description}</Text>
        ) : null}

        <View style={styles.headerButtons}>
          <Pressable
            style={({ pressed }) => [
              styles.actionButton,
              styles.refreshButton,
              pressed ? styles.buttonPressed : null,
            ]}
            onPress={() => void load(true)}
          >
            <Text style={styles.actionButtonText}>
              {refreshing ? "Refreshing..." : "Refresh"}
            </Text>
          </Pressable>

          {hasCallablePhone ? (
            <Pressable
              style={({ pressed }) => [
                styles.actionButton,
                styles.callButton,
                pressed ? styles.buttonPressed : null,
              ]}
              onPress={() => void onCallShop()}
            >
              <Text style={styles.actionButtonText}>Call Shop</Text>
            </Pressable>
          ) : null}
        </View>

        <Text style={styles.sectionTitle}>Available Items</Text>
        <Text style={styles.sectionSubtitle}>
          Tap any item to open its detail page.
        </Text>
      </View>
    );
  }, [items.length, load, onCallShop, refreshing, shop]);

  const renderItem = useCallback(
    ({ item }: { item: Item }) => {
      const imageCount = Array.isArray(item.images) ? item.images.length : 0;

      return (
        <Pressable
          style={({ pressed }) => [
            styles.card,
            pressed ? styles.buttonPressed : null,
          ]}
          onPress={() => openItem(item.id)}
        >
          <View style={styles.itemTopRow}>
            <Text style={styles.cardTitle}>
              {item.title || item.name || "Untitled item"}
            </Text>

            <View style={styles.itemPill}>
              <Text style={styles.itemPillText}>View Item</Text>
            </View>
          </View>

          <Text style={styles.price}>{formatPrice(item)}</Text>

          <View style={styles.metaGroup}>
            {item.status ? <Text style={styles.meta}>Status: {item.status}</Text> : null}
            {item.category ? <Text style={styles.meta}>Category: {item.category}</Text> : null}
            {item.condition ? <Text style={styles.meta}>Condition: {item.condition}</Text> : null}
            <Text style={styles.meta}>Images: {imageCount}</Text>
          </View>

          {item.description ? (
            <Text style={styles.itemDescription}>{item.description}</Text>
          ) : null}
        </Pressable>
      );
    },
    [openItem]
  );

  if (loading) {
    return (
      <View style={styles.centerState}>
        <ActivityIndicator size="large" color="#6ea8fe" />
        <Text style={styles.muted}>Loading shop...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centerState}>
        <Text style={styles.error}>{error}</Text>

        <Pressable
          style={({ pressed }) => [
            styles.actionButton,
            styles.refreshButton,
            styles.retryButton,
            pressed ? styles.buttonPressed : null,
          ]}
          onPress={() => void load()}
        >
          <Text style={styles.actionButtonText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.listContent}
      data={items}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={header}
      ListEmptyComponent={
        <View style={styles.card}>
          <Text style={styles.cardTitle}>No items available</Text>
          <Text style={styles.muted}>
            This shop does not have any available items right now.
          </Text>
        </View>
      }
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void load(true)}
          tintColor="#6ea8fe"
        />
      }
      renderItem={renderItem}
      showsVerticalScrollIndicator={false}
    />
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#0b1020",
  },
  listContent: {
    padding: 20,
    paddingBottom: 32,
  },
  centerState: {
    flex: 1,
    backgroundColor: "#0b1020",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  headerCard: {
    backgroundColor: "#121935",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    marginBottom: 16,
  },
  headerTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  headerTextBlock: {
    flex: 1,
    paddingRight: 12,
  },
  badge: {
    backgroundColor: "rgba(110,168,254,0.14)",
    borderWidth: 1,
    borderColor: "rgba(110,168,254,0.28)",
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  badgeText: {
    color: "#6ea8fe",
    fontSize: 12,
    fontWeight: "700",
  },
  title: {
    color: "#eef2ff",
    fontSize: 28,
    fontWeight: "800",
    marginBottom: 8,
  },
  sectionTitle: {
    color: "#eef2ff",
    fontSize: 18,
    fontWeight: "700",
    marginTop: 16,
  },
  sectionSubtitle: {
    color: "#a7b0d8",
    fontSize: 13,
    marginTop: 4,
  },
  description: {
    color: "#c7d2fe",
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
  },
  headerButtons: {
    flexDirection: "row",
    marginTop: 14,
  },
  actionButton: {
    minHeight: 40,
    borderRadius: 999,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  refreshButton: {
    backgroundColor: "#1a2345",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  callButton: {
    backgroundColor: "rgba(110,168,254,0.16)",
    borderWidth: 1,
    borderColor: "rgba(110,168,254,0.28)",
  },
  retryButton: {
    marginRight: 0,
    marginTop: 14,
  },
  actionButtonText: {
    color: "#eef2ff",
    fontSize: 14,
    fontWeight: "700",
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
  itemTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 6,
  },
  cardTitle: {
    color: "#eef2ff",
    fontSize: 17,
    fontWeight: "700",
    flex: 1,
  },
  itemPill: {
    backgroundColor: "rgba(110,168,254,0.14)",
    borderWidth: 1,
    borderColor: "rgba(110,168,254,0.28)",
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  itemPillText: {
    color: "#6ea8fe",
    fontSize: 12,
    fontWeight: "700",
  },
  price: {
    color: "#6ea8fe",
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 8,
  },
  metaGroup: {
    marginBottom: 4,
  },
  muted: {
    color: "#a7b0d8",
    textAlign: "center",
  },
  meta: {
    color: "#a7b0d8",
    fontSize: 13,
    marginTop: 4,
  },
  itemDescription: {
    color: "#c7d2fe",
    fontSize: 13,
    lineHeight: 19,
    marginTop: 8,
  },
  error: {
    color: "#ff808f",
    fontWeight: "700",
    textAlign: "center",
  },
  buttonPressed: {
    opacity: 0.82,
  },
});
