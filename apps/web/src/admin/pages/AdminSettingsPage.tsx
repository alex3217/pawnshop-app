import AdminOperationsPage from "./AdminOperationsPage";

export default function AdminSettingsPage() {
  return (
    <AdminOperationsPage
      eyebrow="Admin settings"
      title="Platform settings and policy controls"
      description="Review plan, subscription, and platform setting surfaces that affect marketplace behavior."
      primaryAction={{ label: "Open platform settings", to: "/super-admin/platform-settings" }}
      metrics={[
        { label: "Plan controls", value: "Connected", note: "Buyer and seller plan endpoints are available." },
        { label: "Admin scope", value: "Operational", note: "Routine settings link to admin-facing subscription data." },
        { label: "Sensitive settings", value: "Super Admin", note: "Platform settings remain governed by Super Admin." },
      ]}
      endpoints={[
        { label: "Seller plans", path: "/seller-plans", note: "Owner subscription plan catalog." },
        { label: "Buyer plans", path: "/buyer-plans", note: "Buyer subscription plan catalog." },
        { label: "Subscriptions", path: "/admin/subscriptions?limit=10", note: "Admin subscription records." },
      ]}
      checklist={[
        "Review plan configuration before changing subscription messaging.",
        "Use Super Admin settings for platform-wide changes.",
        "Confirm subscription data before owner support escalations.",
      ]}
      links={[
        { label: "Subscriptions", to: "/admin/subscriptions" },
        { label: "Super Admin pricing", to: "/super-admin/pricing" },
        { label: "Platform settings", to: "/super-admin/platform-settings" },
      ]}
    />
  );
}
