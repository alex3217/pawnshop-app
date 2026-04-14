// File: apps/mobile/src/app/_layout.tsx

import { router, Stack, useSegments } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { clearSession, getRole, getToken } from "../lib/auth";
import type { Role } from "../lib/auth";

function BackButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.navButton,
        styles.backButton,
        pressed && styles.navButtonPressed,
      ]}
      hitSlop={8}
    >
      <Text style={styles.backChevron}>‹</Text>
      <Text style={styles.navButtonText}>Back</Text>
    </Pressable>
  );
}

function HomeButton() {
  return (
    <Pressable
      onPress={() => router.replace("/")}
      style={({ pressed }) => [
        styles.navButton,
        styles.homeButton,
        pressed && styles.navButtonPressed,
      ]}
      hitSlop={8}
    >
      <Text style={styles.navButtonText}>Home</Text>
    </Pressable>
  );
}

function LogoutButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.navButton,
        styles.logoutButton,
        pressed && styles.navButtonPressed,
      ]}
      hitSlop={8}
    >
      <Text style={styles.navButtonText}>Logout</Text>
    </Pressable>
  );
}

function HeaderActions({
  authenticated,
  onLogout,
  showHome,
}: {
  authenticated: boolean;
  onLogout: () => void;
  showHome: boolean;
}) {
  return (
    <View style={styles.headerActions}>
      {showHome ? <HomeButton /> : null}
      {authenticated ? <LogoutButton onPress={onLogout} /> : null}
    </View>
  );
}

export default function RootLayout() {
  const segments = useSegments();
  const [sessionReady, setSessionReady] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [role, setRole] = useState<Role | null>(null);

  useEffect(() => {
    let mounted = true;

    async function restoreSession() {
      try {
        const [token, savedRole] = await Promise.all([getToken(), getRole()]);

        if (!mounted) return;

        const normalizedRole: Role | null =
          savedRole === "CONSUMER" ||
          savedRole === "OWNER" ||
          savedRole === "ADMIN"
            ? savedRole
            : null;

        setAuthenticated(Boolean(token));
        setRole(normalizedRole);
      } finally {
        if (mounted) {
          setSessionReady(true);
        }
      }
    }

    restoreSession();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!sessionReady) return;

    const firstSegment = segments[0];
    const onAuthScreen =
      firstSegment === "login" || firstSegment === "register";

    // Keep the home screen accessible for authenticated users.
    // Only redirect them away from auth screens.
    if (authenticated && onAuthScreen) {
      router.replace("/");
    }
  }, [authenticated, segments, sessionReady]);

  async function onLogout() {
    await clearSession();
    setAuthenticated(false);
    setRole(null);
    router.replace("/login");
  }

  if (!sessionReady) {
    return (
      <View style={styles.bootScreen}>
        <ActivityIndicator size="large" color="#6ea8fe" />
        <Text style={styles.bootTitle}>Loading PawnShop…</Text>
        <Text style={styles.bootSubtitle}>
          Restoring your mobile session.
        </Text>
      </View>
    );
  }

  return (
    <Stack
      screenOptions={({ navigation, route }) => ({
        headerShown: true,
        headerTitleAlign: "center",
        headerShadowVisible: false,
        headerTintColor: "#eef2ff",
        headerStyle: styles.header,
        headerTitleStyle: styles.headerTitle,
        headerBackground: () => <View style={styles.headerBackground} />,
        contentStyle: styles.content,

        headerLeft:
          route.name === "index"
            ? () => null
            : () =>
                navigation.canGoBack() ? (
                  <BackButton onPress={() => navigation.goBack()} />
                ) : null,

        headerRight: () => (
          <HeaderActions
            authenticated={authenticated}
            onLogout={onLogout}
            showHome={route.name !== "index"}
          />
        ),

        headerLeftContainerStyle: styles.headerSide,
        headerRightContainerStyle: styles.headerSide,
      })}
    >
      <Stack.Screen
        name="index"
        options={{
          title: authenticated
            ? role === "ADMIN"
              ? "PawnShop Admin"
              : role === "OWNER"
                ? "PawnShop Owner"
                : "PawnShop"
            : "PawnShop",
        }}
      />
      <Stack.Screen
        name="login"
        options={{
          title: "Login",
        }}
      />
      <Stack.Screen
        name="register"
        options={{
          title: "Register",
        }}
      />
      <Stack.Screen
        name="auctions"
        options={{
          title: "Auctions",
        }}
      />
      <Stack.Screen
        name="auction/[id]"
        options={{
          title: "Auction",
        }}
      />
      <Stack.Screen
        name="shops"
        options={{
          title: "Shops",
        }}
      />
      <Stack.Screen
        name="shops/[id]"
        options={{
          title: "Shop",
        }}
      />
    </Stack>
  );
}

const styles = StyleSheet.create({
  bootScreen: {
    flex: 1,
    backgroundColor: "#0b1020",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 12,
  },
  bootTitle: {
    color: "#eef2ff",
    fontSize: 24,
    fontWeight: "800",
    textAlign: "center",
  },
  bootSubtitle: {
    color: "#a7b0d8",
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
  },
  header: {
    backgroundColor: "#0b1020",
  },
  headerBackground: {
    flex: 1,
    backgroundColor: "#0b1020",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  headerTitle: {
    color: "#eef2ff",
    fontWeight: "800",
    fontSize: 18,
  },
  headerSide: {
    paddingHorizontal: 10,
  },
  content: {
    backgroundColor: "#0b1020",
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  navButton: {
    minHeight: 34,
    borderRadius: 999,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 4,
  },
  navButtonPressed: {
    opacity: 0.75,
  },
  backButton: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  homeButton: {
    backgroundColor: "#1a2345",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  logoutButton: {
    backgroundColor: "rgba(255, 128, 143, 0.14)",
    borderWidth: 1,
    borderColor: "rgba(255, 128, 143, 0.24)",
  },
  backChevron: {
    color: "#eef2ff",
    fontSize: 18,
    fontWeight: "800",
    lineHeight: 18,
    marginTop: -1,
  },
  navButtonText: {
    color: "#eef2ff",
    fontSize: 14,
    fontWeight: "700",
  },
});