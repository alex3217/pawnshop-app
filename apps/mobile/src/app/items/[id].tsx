// File: apps/mobile/src/app/items/[id].tsx

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { API_BASE } from "../../lib/config";

type ShopLike = {
  id: string;
  name?: string | null;
  phone?: string | null;
  address?: string | null;
  description?: string | null;
  hours?: string | null;
};

type Item = {
  id: string;
  pawnShopId?: string | null;
  title?: string | null;
  name?: string | null;
  description?: string | null;
  price?: number | string | null;
  priceCents?: number | null;
  category?: string | null;
  condition?: string | null;
  status?: string | null;
  images?: string[] | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  shop?: ShopLike | null;
};

type ItemEnvelope = {
  item?: Item | null;
  shop?: ShopLike | null;
  data?: Item | { item?: Item | null; shop?: ShopLike | null } | null;
  error?: string;
  message?: string;
};

type ItemResponse = Item | ItemEnvelope | null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

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

function getErrorMessage(json: ItemResponse, status: number): string {
  if (isRecord(json)) {
    if ("error" in json && typeof json.error === "string" && json.error.trim()) {
      return json.error;
    }

    if ("message" in json && typeof json.message === "string" && json.message.trim()) {
      return json.message;
    }
  }

  return `Failed to load item (${status})`;
}

function extractItem(json: ItemResponse): Item | null {
  if (!isRecord(json)) return null;

  // Shape: { item: {...} }
  if ("item" in json && isRecord(json.item) && typeof json.item.id === "string") {
    return json.item as Item;
  }

  // Shape: { data: { item: {...}, shop: {...} } }
  if ("data" in json && isRecord(json.data)) {
    if ("item" in json.data && isRecord(json.data.item) && typeof json.data.item.id === "string") {
      return json.data.item as Item;
    }

    // Shape: { data: {...itemFields} }
    if ("id" in json.data && typeof json.data.id === "string") {
      return json.data as Item;
    }
  }

  // Shape: direct item object with nested shop
  if ("id" in json && typeof json.id === "string") {
    return json as Item;
  }

  return null;
}

function extractShop(json: ItemResponse, item: Item | null): ShopLike | null {
  if (item?.shop && isRecord(item.shop) && typeof item.shop.id === "string") {
    return item.shop;
  }

  if (!isRecord(json)) return null;

  if ("shop" in json && isRecord(json.shop) && typeof json.shop.id === "string") {
    return json.shop as ShopLike;
  }

  if ("data" in json && isRecord(json.data) && "shop" in json.data && isRecord(json.data.shop) && typeof json.data.shop.id === "string") {
    return json.data.shop as ShopLike;
  }

  return null;
}

function normalizePhoneForDial(phone?: string | null): string | null {
  if (!phone) return null;
  const cleaned = phone.replace(/[^\d+]/g, "");
  return cleaned || null;
}

function formatDate(value?: string | null): string | null {
  if (!value) return null;
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toLocaleDateString();
}

function normalizeImageUris(images?: string[] | null): string[] {
  if (!Array.isArray(images)) return [];

  return images
    .map((img) => (typeof img === "string" ? img.trim() : ""))
    .filter(Boolean)
    .filter(
      (img) =>
        img.startsWith("http://") ||
        img.startsWith("https://") ||
        img.startsWith("data:image/")
    );
}

export default function ItemDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const itemId = normalizeRouteId(params.id);

  const [item, setItem] = useState<Item | null>(null);
  const [shop, setShop] = useState<ShopLike | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rawResponse, setRawResponse] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (isRefresh = false) => {
      if (!itemId) {
        setError("Missing item id.");
        setItem(null);
        setShop(null);
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
        const res = await fetch(`${API_BASE}/items/${itemId}`);
        const text = await res.text();
        setRawResponse(text);

        let json: ItemResponse = null;
        try {
          json = text ? (JSON.parse(text) as ItemResponse) : null;
        } catch {
          throw new Error(`Item response was not valid JSON (${res.status})`);
        }

        if (!res.ok) {
          throw new Error(getErrorMessage(json, res.status));
        }

        const nextItem = extractItem(json);
        const nextShop = extractShop(json, nextItem);

        if (!nextItem) {
          throw new Error("Unable to parse item response.");
        }

        setItem(nextItem);
        setShop(nextShop);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load item");
        setItem(null);
        setShop(null);
      } finally {
        if (isRefresh) {
          setRefreshing(false);
        } else {
          setLoading(false);
        }
      }
    },
    [itemId]
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

  const onOpenShop = useCallback(() => {
    const targetShopId = shop?.id || item?.pawnShopId;
    if (!targetShopId) return;

    router.push(`/shops/${targetShopId}` as never);
  }, [item?.pawnShopId, router, shop?.id]);

  const imageUris = normalizeImageUris(item?.images);
  const createdDate = formatDate(item?.createdAt);
  const updatedDate = formatDate(item?.updatedAt);
  const hasShopLink = Boolean(shop?.id || item?.pawnShopId);
  const hasCallablePhone = Boolean(normalizePhoneForDial(shop?.phone));

  const detailRows = useMemo(() => {
    if (!item) return [];

    return [
      item.status ? `Status: ${item.status}` : null,
      item.category ? `Category: ${item.category}` : null,
      item.condition ? `Condition: ${item.condition}` : null,
      `Images: ${imageUris.length}`,
      createdDate ? `Created: ${createdDate}` : null,
      updatedDate ? `Updated: ${updatedDate}` : null,
    ].filter(Boolean) as string[];
  }, [createdDate, imageUris.length, item, updatedDate]);

  const imageHeader = useMemo(() => {
    if (!imageUris.length) {
      return (
        <View style={styles.imagePlaceholder}>
          <Text style={styles.imagePlaceholderText}>No image available</Text>
        </View>
      );
    }

    return (
      <FlatList
        data={imageUris}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(uri, index) => `${uri}-${index}`}
        ItemSeparatorComponent={() => <View style={{ width: 10 }} />}
        renderItem={({ item: uri }) => (
          <Image source={{ uri }} style={styles.image} resizeMode="cover" />
        )}
        contentContainerStyle={styles.imageList}
      />
    );
  }, [imageUris]);

  const header = useMemo(() => {
    if (!item) return null;

    return (
      <View style={styles.headerCard}>
        {imageHeader}

        <Text style={styles.title}>{item.title || item.name || "Untitled item"}</Text>
        <Text style={styles.price}>{formatPrice(item)}</Text>

        {item.description ? (
          <Text style={styles.description}>{item.description}</Text>
        ) : (
          <Text style={styles.muted}>No description provided.</Text>
        )}

        <View style={styles.buttonRow}>
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

          {hasShopLink ? (
            <Pressable
              style={({ pressed }) => [
                styles.actionButton,
                styles.shopButton,
                pressed ? styles.buttonPressed : null,
              ]}
              onPress={onOpenShop}
            >
              <Text style={styles.actionButtonText}>View Shop</Text>
            </Pressable>
          ) : null}

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

        {shop ? (
          <View style={styles.shopCard}>
            <Text style={styles.sectionTitle}>Shop</Text>
            <Text style={styles.shopName}>{shop.name || "Shop"}</Text>
            {shop.address ? <Text style={styles.meta}>{shop.address}</Text> : null}
            {shop.phone ? <Text style={styles.meta}>Phone: {shop.phone}</Text> : null}
            {shop.hours ? <Text style={styles.meta}>Hours: {shop.hours}</Text> : null}
            {shop.description ? (
              <Text style={styles.shopDescription}>{shop.description}</Text>
            ) : null}
          </View>
        ) : null}

        <Text style={styles.sectionTitle}>Item Details</Text>
      </View>
    );
  }, [hasCallablePhone, hasShopLink, imageHeader, item, load, onCallShop, onOpenShop, refreshing, shop]);

  if (loading) {
    return (
      <View style={styles.centerState}>
        <ActivityIndicator size="large" color="#6ea8fe" />
        <Text style={styles.muted}>Loading item...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <ScrollView contentContainerStyle={styles.errorContainer}>
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

        {rawResponse ? (
          <View style={styles.debugCard}>
            <Text style={styles.debugTitle}>Raw Response</Text>
            <Text style={styles.debugText}>{rawResponse}</Text>
          </View>
        ) : null}
      </ScrollView>
    );
  }

  if (!item) {
    return (
      <ScrollView contentContainerStyle={styles.errorContainer}>
        <Text style={styles.error}>Item not found.</Text>
        {rawResponse ? (
          <View style={styles.debugCard}>
            <Text style={styles.debugTitle}>Raw Response</Text>
            <Text style={styles.debugText}>{rawResponse}</Text>
          </View>
        ) : null}
      </ScrollView>
    );
  }

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.listContent}
      data={detailRows}
      keyExtractor={(row) => row}
      ListHeaderComponent={header}
      ListEmptyComponent={
        <View style={styles.card}>
          <Text style={styles.cardTitle}>No extra item details</Text>
          <Text style={styles.muted}>This item has limited metadata right now.</Text>
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
      renderItem={({ item: row }) => (
        <View style={styles.card}>
          <Text style={styles.metaDetail}>{row}</Text>
        </View>
      )}
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
  errorContainer: {
    flexGrow: 1,
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
  imageList: {
    paddingBottom: 4,
    marginBottom: 14,
  },
  image: {
    width: 220,
    height: 160,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  imagePlaceholder: {
    height: 160,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  imagePlaceholderText: {
    color: "#a7b0d8",
    fontSize: 14,
    fontWeight: "600",
  },
  title: {
    color: "#eef2ff",
    fontSize: 28,
    fontWeight: "800",
    marginBottom: 8,
  },
  price: {
    color: "#6ea8fe",
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 10,
  },
  description: {
    color: "#c7d2fe",
    fontSize: 14,
    lineHeight: 20,
  },
  muted: {
    color: "#a7b0d8",
    textAlign: "center",
  },
  buttonRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 14,
  },
  actionButton: {
    minHeight: 40,
    borderRadius: 999,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
    marginBottom: 10,
  },
  refreshButton: {
    backgroundColor: "#1a2345",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  shopButton: {
    backgroundColor: "rgba(110,168,254,0.16)",
    borderWidth: 1,
    borderColor: "rgba(110,168,254,0.28)",
  },
  callButton: {
    backgroundColor: "rgba(255, 128, 143, 0.14)",
    borderWidth: 1,
    borderColor: "rgba(255, 128, 143, 0.24)",
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
  sectionTitle: {
    color: "#eef2ff",
    fontSize: 18,
    fontWeight: "700",
    marginTop: 16,
    marginBottom: 8,
  },
  shopCard: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 14,
    padding: 14,
    marginTop: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  shopName: {
    color: "#eef2ff",
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 6,
  },
  shopDescription: {
    color: "#c7d2fe",
    fontSize: 13,
    lineHeight: 19,
    marginTop: 8,
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
  cardTitle: {
    color: "#eef2ff",
    fontSize: 17,
    fontWeight: "700",
    marginBottom: 6,
  },
  meta: {
    color: "#a7b0d8",
    fontSize: 13,
    marginTop: 4,
  },
  metaDetail: {
    color: "#c7d2fe",
    fontSize: 14,
    lineHeight: 20,
  },
  error: {
    color: "#ff808f",
    fontWeight: "700",
    textAlign: "center",
  },
  debugCard: {
    marginTop: 18,
    width: "100%",
    backgroundColor: "#121935",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  debugTitle: {
    color: "#6ea8fe",
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 8,
    textTransform: "uppercase",
  },
  debugText: {
    color: "#c7d2fe",
    fontSize: 12,
    lineHeight: 18,
  },
  buttonPressed: {
    opacity: 0.82,
  },
});