// File: apps/web/src/services/integrations.ts

import { getMyShops, type Shop } from "./shops";

export type IntegrationKind =
  | "CSV_UPLOAD"
  | "API_PULL"
  | "WEBHOOK_PUSH"
  | "SFTP_FEED"
  | "POS_SYSTEM"
  | "MOBILE_SCAN";

export type IntegrationStatus =
  | "READY"
  | "COMING_SOON"
  | "NEEDS_SETUP"
  | "CONNECTED";

export type OwnerIntegrationConnector = {
  id: string;
  kind: IntegrationKind;
  name: string;
  status: IntegrationStatus;
  description: string;
  primaryActionLabel: string;
  primaryHref: string;
  secondaryActionLabel?: string;
  secondaryHref?: string;
  bullets: string[];
};

export type OwnerIntegrationOverview = {
  shops: Shop[];
  connectors: OwnerIntegrationConnector[];
  readyCount: number;
  comingSoonCount: number;
};

export const OWNER_INTEGRATION_CONNECTORS: OwnerIntegrationConnector[] = [
  {
    id: "csv-upload",
    kind: "CSV_UPLOAD",
    name: "CSV / Excel Inventory Upload",
    status: "READY",
    description:
      "Upload inventory files and import item listings into a selected shop.",
    primaryActionLabel: "Open bulk upload",
    primaryHref: "/owner/bulk-upload",
    secondaryActionLabel: "View inventory",
    secondaryHref: "/owner/inventory",
    bullets: [
      "Uses your existing CSV import workflow",
      "Creates inventory import jobs",
      "Shows created, failed, and skipped rows",
    ],
  },
  {
    id: "mobile-scan",
    kind: "MOBILE_SCAN",
    name: "Mobile Scan Console",
    status: "READY",
    description:
      "Scan barcodes, QR codes, SKUs, and pawn tags from a phone or scanner.",
    primaryActionLabel: "Open scan console",
    primaryHref: "/owner/scan-console",
    secondaryActionLabel: "Create item",
    secondaryHref: "/owner/items/new",
    bullets: [
      "Phone camera scanner support where available",
      "Manual barcode and SKU fallback",
      "Prefills item creation from scan results",
    ],
  },
  {
    id: "api-pull",
    kind: "API_PULL",
    name: "API Pull Connector",
    status: "COMING_SOON",
    description:
      "Connect an external POS or inventory API so the platform can pull inventory on a schedule.",
    primaryActionLabel: "Plan API connector",
    primaryHref: "/owner/integrations",
    bullets: [
      "Base URL and endpoint configuration",
      "API key or bearer token auth",
      "Scheduled sync every 15, 30, or 60 minutes",
    ],
  },
  {
    id: "webhook-push",
    kind: "WEBHOOK_PUSH",
    name: "Webhook Push Connector",
    status: "COMING_SOON",
    description:
      "Let an external inventory system push item changes to your marketplace in near real time.",
    primaryActionLabel: "Plan webhook connector",
    primaryHref: "/owner/integrations",
    bullets: [
      "Signed webhook URLs",
      "Create, update, and archive item events",
      "Event logs and retry visibility",
    ],
  },
  {
    id: "sftp-feed",
    kind: "SFTP_FEED",
    name: "SFTP / Vendor Feed",
    status: "COMING_SOON",
    description:
      "Import recurring inventory files from a secure vendor feed or file drop.",
    primaryActionLabel: "Plan feed connector",
    primaryHref: "/owner/integrations",
    bullets: [
      "Scheduled file ingestion",
      "Field mapping templates",
      "Sync logs by shop and file",
    ],
  },
  {
    id: "pos-system",
    kind: "POS_SYSTEM",
    name: "POS System Integration",
    status: "COMING_SOON",
    description:
      "Future named integrations for common pawnshop and retail inventory systems.",
    primaryActionLabel: "Review options",
    primaryHref: "/owner/integrations",
    bullets: [
      "Provider-specific setup flows",
      "Credential encryption",
      "One-click sync health checks",
    ],
  },
];

export async function getOwnerIntegrationOverview(
  signal?: AbortSignal,
): Promise<OwnerIntegrationOverview> {
  const shops = await getMyShops(signal);
  const connectors = OWNER_INTEGRATION_CONNECTORS;

  return {
    shops,
    connectors,
    readyCount: connectors.filter((connector) => connector.status === "READY")
      .length,
    comingSoonCount: connectors.filter(
      (connector) => connector.status === "COMING_SOON",
    ).length,
  };
}
