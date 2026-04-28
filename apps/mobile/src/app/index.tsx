// File: apps/mobile/src/app/index.tsx

import { router } from "expo-router";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

type ActionButtonProps = {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary";
};

type InfoCardProps = {
  label: string;
  value: string;
};

function ActionButton({
  label,
  onPress,
  variant = "secondary",
}: ActionButtonProps) {
  const isPrimary = variant === "primary";

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        isPrimary ? styles.primaryButton : styles.secondaryButton,
        pressed ? styles.buttonPressed : null,
      ]}
    >
      <Text
        style={
          isPrimary ? styles.primaryButtonText : styles.secondaryButtonText
        }
      >
        {label}
      </Text>
    </Pressable>
  );
}

function InfoCard({ label, value }: InfoCardProps) {
  return (
    <View style={styles.infoCard}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

export default function HomeScreen() {
  const goToLogin = () => router.push("/login" as never);
  const goToRegister = () => router.push("/register" as never);
  const goToAuctions = () => router.push("/auctions" as never);
  const goToShops = () => router.push("/shops" as never);
  const goToScanIntake = () => router.push("/scan-intake" as never);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.badge}>PawnLoop Marketplace</Text>

      <Text style={styles.title}>Buy, browse, and bid from mobile.</Text>

      <Text style={styles.subtitle}>
        Your mobile buyer flow is live. Sign in, browse active auctions, explore
        shops, and send inquiries from one place.
      </Text>

      <View style={styles.actions}>
        <ActionButton
          label="Login"
          variant="primary"
          onPress={goToLogin}
        />

        <ActionButton
          label="Register"
          onPress={goToRegister}
        />

        <ActionButton
          label="Browse Auctions"
          onPress={goToAuctions}
        />

        <ActionButton
          label="Browse Shops"
          onPress={goToShops}
        />

        <ActionButton
          label="Scan Intake"
          onPress={goToScanIntake}
        />
      </View>

      <View style={styles.infoGrid}>
        <InfoCard label="Buyer Flow" value="Login · Browse · Bid" />
        <InfoCard label="Shop Discovery" value="Browse local inventory" />
        <InfoCard label="Contact" value="Send item inquiries" />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#0b1020",
  },
  container: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 24,
  },
  badge: {
    color: "#6ea8fe",
    fontWeight: "700",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 12,
  },
  title: {
    color: "#eef2ff",
    fontSize: 32,
    fontWeight: "800",
    lineHeight: 38,
    marginBottom: 12,
  },
  subtitle: {
    color: "#a7b0d8",
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 20,
  },
  actions: {
    marginBottom: 20,
  },
  button: {
    borderRadius: 999,
    paddingVertical: 14,
    paddingHorizontal: 18,
    marginBottom: 12,
  },
  buttonPressed: {
    opacity: 0.82,
  },
  primaryButton: {
    backgroundColor: "#6ea8fe",
  },
  secondaryButton: {
    backgroundColor: "#1a2345",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  primaryButtonText: {
    color: "#08111f",
    textAlign: "center",
    fontWeight: "800",
    fontSize: 16,
  },
  secondaryButtonText: {
    color: "#eef2ff",
    textAlign: "center",
    fontWeight: "700",
    fontSize: 16,
  },
  infoGrid: {
    gap: 10,
  },
  infoCard: {
    backgroundColor: "#121935",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 14,
    padding: 14,
  },
  infoLabel: {
    color: "#6ea8fe",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  infoValue: {
    color: "#eef2ff",
    fontSize: 16,
    fontWeight: "700",
  },
});