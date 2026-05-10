// File: apps/web/src/services/integrations.ts

import { api } from "./apiClient";
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
  | "CONNECTED"
  | "PAUSED"
  | "ERROR"
  | "ARCHIVED";

export type IntegrationAuthType =
  | "NONE"
  | "API_KEY"
  | "BEARER_TOKEN"
  | "BASIC"
  | "CUSTOM_HEADER";

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

export type SavedInventoryIntegration = {
  id: string;
  ownerId?: string;
  shopId: string;
  shopName?: string | null;
  name: string;
  type: IntegrationKind | string;
  provider?: string | null;
  status: IntegrationStatus | string;
  baseUrl?: string | null;
  inventoryEndpoint?: string | null;
  authType?: IntegrationAuthType | string;
  credentialHint?: string | null;
  syncFrequencyMinutes?: number | null;
  lastSyncAt?: string | null;
  nextSyncAt?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt?: string;
  updatedAt?: string;
};

export type InventorySyncJob = {
  id: string;
  integrationId: string;
  shopId: string;
  status: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  createdCount?: number;
  updatedCount?: number;
  skippedCount?: number;
  errorCount?: number;
  errorSummary?: Record<string, unknown> | null;
  createdAt?: string;
  updatedAt?: string;
};

export type InventoryFieldMapping = {
  id: string;
  integrationId: string;
  externalField: string;
  internalField: string;
  transformRule?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type CreateInventoryFieldMappingInput = {
  externalField: string;
  internalField: string;
  transformRule?: string;
};

export type CreateInventoryIntegrationInput = {
  shopId: string;
  name: string;
  type: IntegrationKind;
  provider?: string;
  status?: IntegrationStatus;
  baseUrl?: string;
  inventoryEndpoint?: string;
  authType?: IntegrationAuthType;
  apiKey?: string;
  bearerToken?: string;
  credentialHint?: string;
  syncFrequencyMinutes?: number | null;
  metadata?: Record<string, unknown>;
};

export type OwnerIntegrationOverview = {
  shops: Shop[];
  connectors: OwnerIntegrationConnector[];
  integrations: SavedInventoryIntegration[];
  readyCount: number;
  plannedCount: number;
  savedCount: number;
};

type ApiObject = Record<string, unknown>;

function isObject(value: unknown): value is ApiObject {
  return typeof value === "object" && value !== null;
}

function asIntegrationArray(data: unknown): SavedInventoryIntegration[] {
  if (Array.isArray(data)) return data as SavedInventoryIntegration[];
  if (!isObject(data)) return [];

  if (Array.isArray(data.integrations)) {
    return data.integrations as SavedInventoryIntegration[];
  }

  if (Array.isArray(data.data)) {
    return data.data as SavedInventoryIntegration[];
  }

  if (isObject(data.data) && Array.isArray(data.data.integrations)) {
    return data.data.integrations as SavedInventoryIntegration[];
  }

  return [];
}

function unwrapIntegration(data: unknown): SavedInventoryIntegration {
  if (!isObject(data)) throw new Error("Invalid integration response.");

  const nested = isObject(data.data) ? data.data : null;
  const integration =
    data.integration ??
    nested?.integration ??
    nested ??
    data;

  if (!isObject(integration)) {
    throw new Error("Invalid integration response.");
  }

  return integration as SavedInventoryIntegration;
}

function unwrapJobs(data: unknown): InventorySyncJob[] {
  if (Array.isArray(data)) return data as InventorySyncJob[];
  if (!isObject(data)) return [];

  if (Array.isArray(data.jobs)) return data.jobs as InventorySyncJob[];

  if (isObject(data.data) && Array.isArray(data.data.jobs)) {
    return data.data.jobs as InventorySyncJob[];
  }

  return [];
}

function unwrapMappings(data: unknown): InventoryFieldMapping[] {
  if (Array.isArray(data)) return data as InventoryFieldMapping[];
  if (!isObject(data)) return [];

  if (Array.isArray(data.mappings)) {
    return data.mappings as InventoryFieldMapping[];
  }

  if (isObject(data.data) && Array.isArray(data.data.mappings)) {
    return data.data.mappings as InventoryFieldMapping[];
  }

  return [];
}

function unwrapMapping(data: unknown): InventoryFieldMapping {
  if (!isObject(data)) throw new Error("Invalid mapping response.");

  const nested = isObject(data.data) ? data.data : null;
  const mapping = data.mapping ?? nested?.mapping ?? nested ?? data;

  if (!isObject(mapping)) throw new Error("Invalid mapping response.");

  return mapping as InventoryFieldMapping;
}

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
    status: "READY",
    description:
      "Create an API connector record, test configuration, and run placeholder sync jobs.",
    primaryActionLabel: "Create API connector below",
    primaryHref: "/owner/integrations",
    bullets: [
      "Base URL and endpoint configuration",
      "API key or bearer token hint masking",
      "Test and sync job history",
    ],
  },
  {
    id: "webhook-push",
    kind: "WEBHOOK_PUSH",
    name: "Webhook Push Connector",
    status: "READY",
    description:
      "Create webhook connector records and prepare event logging for inventory pushes.",
    primaryActionLabel: "Create webhook connector below",
    primaryHref: "/owner/integrations",
    bullets: [
      "Webhook receiver endpoint exists",
      "Payload/event persistence foundation",
      "Future signature verification support",
    ],
  },
  {
    id: "sftp-feed",
    kind: "SFTP_FEED",
    name: "SFTP / Vendor Feed",
    status: "NEEDS_SETUP",
    description:
      "Prepare recurring inventory feed configuration for a future SFTP worker.",
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
    status: "NEEDS_SETUP",
    description:
      "Prepare named integrations for common pawnshop and retail inventory systems.",
    primaryActionLabel: "Plan POS connector",
    primaryHref: "/owner/integrations",
    bullets: [
      "Provider-specific setup flows",
      "Credential encryption roadmap",
      "One-click sync health checks",
    ],
  },
];

export async function getInventoryIntegrations(
  signal?: AbortSignal,
): Promise<SavedInventoryIntegration[]> {
  const data = await api.get<unknown>("/integrations/mine", { signal });
  return asIntegrationArray(data);
}

export async function createInventoryIntegration(
  input: CreateInventoryIntegrationInput,
  signal?: AbortSignal,
): Promise<SavedInventoryIntegration> {
  if (!input.shopId) throw new Error("Choose a shop first.");
  if (!input.name.trim()) throw new Error("Enter an integration name.");

  const data = await api.post<unknown>(
    "/integrations",
    {
      shopId: input.shopId,
      name: input.name.trim(),
      type: input.type,
      provider: input.provider?.trim() || undefined,
      status: input.status || "NEEDS_SETUP",
      baseUrl: input.baseUrl?.trim() || undefined,
      inventoryEndpoint: input.inventoryEndpoint?.trim() || undefined,
      authType: input.authType || "NONE",
      apiKey: input.apiKey?.trim() || undefined,
      bearerToken: input.bearerToken?.trim() || undefined,
      credentialHint: input.credentialHint?.trim() || undefined,
      syncFrequencyMinutes: input.syncFrequencyMinutes || undefined,
      metadata: input.metadata,
    },
    { signal },
  );

  return unwrapIntegration(data);
}

export async function testInventoryIntegration(
  id: string,
  signal?: AbortSignal,
): Promise<InventorySyncJob | null> {
  if (!id) throw new Error("Missing integration id.");

  const data = await api.post<unknown>(
    `/integrations/${encodeURIComponent(id)}/test`,
    undefined,
    { signal },
  );

  return isObject(data) && isObject(data.job)
    ? (data.job as InventorySyncJob)
    : null;
}

export async function syncInventoryIntegration(
  id: string,
  signal?: AbortSignal,
): Promise<{
  integration: SavedInventoryIntegration;
  job: InventorySyncJob | null;
}> {
  if (!id) throw new Error("Missing integration id.");

  const data = await api.post<unknown>(
    `/integrations/${encodeURIComponent(id)}/sync`,
    undefined,
    { signal },
  );

  return {
    integration: unwrapIntegration(data),
    job: isObject(data) && isObject(data.job) ? (data.job as InventorySyncJob) : null,
  };
}


export async function getInventoryIntegrationMappings(
  id: string,
  signal?: AbortSignal,
): Promise<InventoryFieldMapping[]> {
  if (!id) throw new Error("Missing integration id.");

  const data = await api.get<unknown>(
    `/integrations/${encodeURIComponent(id)}/mappings`,
    { signal },
  );

  return unwrapMappings(data);
}

export async function createInventoryIntegrationMapping(
  id: string,
  input: CreateInventoryFieldMappingInput,
  signal?: AbortSignal,
): Promise<InventoryFieldMapping> {
  if (!id) throw new Error("Missing integration id.");
  if (!input.externalField.trim()) throw new Error("Enter an external field.");
  if (!input.internalField.trim()) throw new Error("Choose an internal field.");

  const data = await api.post<unknown>(
    `/integrations/${encodeURIComponent(id)}/mappings`,
    {
      externalField: input.externalField.trim(),
      internalField: input.internalField.trim(),
      transformRule: input.transformRule?.trim() || undefined,
    },
    { signal },
  );

  return unwrapMapping(data);
}

export async function deleteInventoryIntegrationMapping(
  integrationId: string,
  mappingId: string,
  signal?: AbortSignal,
): Promise<void> {
  if (!integrationId) throw new Error("Missing integration id.");
  if (!mappingId) throw new Error("Missing mapping id.");

  await api.delete<unknown>(
    `/integrations/${encodeURIComponent(integrationId)}/mappings/${encodeURIComponent(mappingId)}`,
    { signal },
  );
}

export async function getInventoryIntegrationJobs(
  id: string,
  signal?: AbortSignal,
): Promise<InventorySyncJob[]> {
  if (!id) throw new Error("Missing integration id.");

  const data = await api.get<unknown>(
    `/integrations/${encodeURIComponent(id)}/jobs`,
    { signal },
  );

  return unwrapJobs(data);
}

export async function archiveInventoryIntegration(
  id: string,
  signal?: AbortSignal,
): Promise<SavedInventoryIntegration> {
  if (!id) throw new Error("Missing integration id.");

  const data = await api.delete<unknown>(
    `/integrations/${encodeURIComponent(id)}`,
    { signal },
  );

  return unwrapIntegration(data);
}

export async function getOwnerIntegrationOverview(
  signal?: AbortSignal,
): Promise<OwnerIntegrationOverview> {
  const [shops, integrations] = await Promise.all([
    getMyShops(signal),
    getInventoryIntegrations(signal),
  ]);

  const connectors = OWNER_INTEGRATION_CONNECTORS;

  return {
    shops,
    connectors,
    integrations,
    readyCount: connectors.filter((connector) => connector.status === "READY")
      .length,
    plannedCount: connectors.filter((connector) => connector.status !== "READY")
      .length,
    savedCount: integrations.length,
  };
}
