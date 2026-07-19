const VALID_SOURCES = new Set([
  "CAMERA",
  "HARDWARE_SCANNER",
  "MANUAL",
  "FILE_UPLOAD",
  "API",
]);

const VALID_DESTINATIONS = new Set([
  "SHOP_INVENTORY",
  "CUSTOMER_SELL",
  "CUSTOMER_PAWN",
  "CUSTOMER_MARKETPLACE",
  "DEALER_LISTING",
  "SHOP_TRANSFER",
]);

const VALID_CODE_TYPES = new Set([
  "UPC",
  "EAN",
  "SKU",
  "SERIAL",
  "QR",
  "PAWN_TAG",
  "BARCODE",
  "UNKNOWN",
]);

function normalizeEnumValue(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replaceAll("-", "_")
    .replaceAll(" ", "_");
}

function normalizeSource(value) {
  const normalized = normalizeEnumValue(value);

  const aliases = {
    SCAN_CONSOLE: "MANUAL",
    INLINE_SCANNER: "MANUAL",
    USB: "HARDWARE_SCANNER",
    BLUETOOTH: "HARDWARE_SCANNER",
  };

  const resolved = aliases[normalized] || normalized;
  return VALID_SOURCES.has(resolved) ? resolved : "MANUAL";
}

function normalizeDestination(value) {
  const normalized = normalizeEnumValue(value);

  const aliases = {
    INVENTORY: "SHOP_INVENTORY",
    SELL: "CUSTOMER_SELL",
    PAWN: "CUSTOMER_PAWN",
    MARKETPLACE: "CUSTOMER_MARKETPLACE",
    DEALER: "DEALER_LISTING",
    TRANSFER: "SHOP_TRANSFER",
  };

  const resolved = aliases[normalized] || normalized;

  return VALID_DESTINATIONS.has(resolved)
    ? resolved
    : "SHOP_INVENTORY";
}

function normalizeCodeType(value) {
  const normalized = normalizeEnumValue(value);

  const aliases = {
    SN: "SERIAL",
    SERIAL_NUMBER: "SERIAL",
    PAWN: "PAWN_TAG",
    PAWNTAG: "PAWN_TAG",
    UPC_A: "UPC",
    UPC_E: "UPC",
    EAN_8: "EAN",
    EAN_13: "EAN",
    EAN_14: "EAN",
    QR_CODE: "QR",
  };

  const resolved = aliases[normalized] || normalized;
  return VALID_CODE_TYPES.has(resolved) ? resolved : null;
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];

  return value
    .filter((entry) => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function normalizeMoney(value) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const number = Number(value);
  return Number.isFinite(number) && number >= 0
    ? number
    : undefined;
}


const CUSTOMER_INTAKE_LINKABLE_STATUSES =
  new Set([
    "SCANNED",
    "NEEDS_REVIEW",
    "APPROVED",
  ]);

const CUSTOMER_INTAKE_LINKAGE_CONFIG =
  Object.freeze({
    SUBMISSION: {
      linkField:
        "linkedSubmissionId",

      destinations:
        new Set([
          "CUSTOMER_SELL",
          "CUSTOMER_PAWN",
          "CUSTOMER_MARKETPLACE",
        ]),
    },

    MARKETPLACE_LISTING: {
      linkField:
        "linkedMarketplaceListingId",

      destinations:
        new Set([
          "CUSTOMER_MARKETPLACE",
        ]),
    },
  });

function normalizeLinkageId(
  value,
) {
  return String(
    value ||
    "",
  ).trim();
}

function createCustomerIntakeLinkageError(
  statusCode,
  message,
  linkageCode,
) {
  const error =
    new Error(
      message,
    );

  error.statusCode =
    statusCode;

  error.linkageCode =
    linkageCode;

  return error;
}

function getCustomerIntakeLinkageConfig(
  resourceType,
) {
  const normalizedType =
    normalizeEnumValue(
      resourceType,
    );

  const config =
    CUSTOMER_INTAKE_LINKAGE_CONFIG[
      normalizedType
    ];

  if (!config) {
    throw createCustomerIntakeLinkageError(
      400,
      "Invalid customer intake linkage resource type.",
      "CUSTOMER_INTAKE_LINKAGE_TYPE_INVALID",
    );
  }

  return {
    resourceType:
      normalizedType,

    ...config,
  };
}

export async function loadCustomerItemIntakeForLinkage({
  prismaClient,
  intakeId,
  customerId,
  resourceType,
}) {
  if (
    !prismaClient?.itemIntake
      ?.findUnique
  ) {
    throw new Error(
      "Item intake persistence is unavailable.",
    );
  }

  const normalizedIntakeId =
    normalizeLinkageId(
      intakeId,
    );

  const normalizedCustomerId =
    normalizeLinkageId(
      customerId,
    );

  if (!normalizedIntakeId) {
    throw createCustomerIntakeLinkageError(
      400,
      "Customer item intake ID is required.",
      "CUSTOMER_INTAKE_ID_REQUIRED",
    );
  }

  if (!normalizedCustomerId) {
    throw createCustomerIntakeLinkageError(
      401,
      "Authentication required.",
      "CUSTOMER_INTAKE_AUTH_REQUIRED",
    );
  }

  const config =
    getCustomerIntakeLinkageConfig(
      resourceType,
    );

  const intake =
    await prismaClient
      .itemIntake
      .findUnique({
        where: {
          id:
            normalizedIntakeId,
        },

        select: {
          id: true,
          shopId: true,
          customerId: true,
          destination: true,
          status: true,
          linkedSubmissionId: true,
          linkedMarketplaceListingId:
            true,
        },
      });

  if (
    !intake ||
    intake.customerId !==
      normalizedCustomerId ||
    intake.shopId
  ) {
    throw createCustomerIntakeLinkageError(
      404,
      "Customer item intake not found.",
      "CUSTOMER_INTAKE_NOT_FOUND",
    );
  }

  if (
    !CUSTOMER_INTAKE_LINKABLE_STATUSES
      .has(
        intake.status,
      )
  ) {
    throw createCustomerIntakeLinkageError(
      409,
      "This customer item intake cannot be linked in its current status.",
      "CUSTOMER_INTAKE_STATUS_NOT_LINKABLE",
    );
  }

  if (
    !config.destinations.has(
      intake.destination,
    )
  ) {
    throw createCustomerIntakeLinkageError(
      409,
      "This customer item intake destination cannot be linked to the requested resource.",
      "CUSTOMER_INTAKE_DESTINATION_MISMATCH",
    );
  }

  if (
    intake[
      config.linkField
    ]
  ) {
    throw createCustomerIntakeLinkageError(
      409,
      config.resourceType ===
        "SUBMISSION"
        ? "This customer item intake is already linked to a buyer submission."
        : "This customer item intake is already linked to a marketplace listing.",
      "CUSTOMER_INTAKE_ALREADY_LINKED",
    );
  }

  return intake;
}

export async function claimCustomerItemIntakeLink({
  prismaClient,
  intake,
  customerId,
  resourceType,
  resourceId,
}) {
  if (
    !prismaClient?.itemIntake
      ?.updateMany
  ) {
    throw new Error(
      "Item intake persistence is unavailable.",
    );
  }

  const normalizedCustomerId =
    normalizeLinkageId(
      customerId,
    );

  const normalizedResourceId =
    normalizeLinkageId(
      resourceId,
    );

  const config =
    getCustomerIntakeLinkageConfig(
      resourceType,
    );

  if (
    !intake?.id ||
    !normalizedCustomerId ||
    !normalizedResourceId
  ) {
    throw createCustomerIntakeLinkageError(
      400,
      "Customer intake linkage data is incomplete.",
      "CUSTOMER_INTAKE_LINKAGE_DATA_REQUIRED",
    );
  }

  const updated =
    await prismaClient
      .itemIntake
      .updateMany({
        where: {
          id:
            intake.id,

          shopId:
            null,

          customerId:
            normalizedCustomerId,

          destination:
            intake.destination,

          status:
            intake.status,

          [config.linkField]:
            null,
        },

        data: {
          [config.linkField]:
            normalizedResourceId,
        },
      });

  if (
    updated.count !==
      1
  ) {
    throw createCustomerIntakeLinkageError(
      409,
      "The customer item intake changed while it was being linked. Reload and try again.",
      "CUSTOMER_INTAKE_LINK_CONFLICT",
    );
  }

  return {
    intakeId:
      intake.id,

    resourceType:
      config.resourceType,

    resourceId:
      normalizedResourceId,

    linkField:
      config.linkField,
  };
}

export function analyzeScanCode(value, explicitType) {
  const rawCode = String(value || "").trim();

  if (!rawCode) {
    throw new Error("Scan code is required.");
  }

  let normalizedCode = rawCode.toUpperCase();
  let codeType = normalizeCodeType(explicitType);

  const prefixMatch = normalizedCode.match(
    /^(UPC|EAN|SKU|SERIAL|SN|QR|PAWN_TAG|PAWNTAG|PAWN|BARCODE)\s*[:#-]\s*(.+)$/,
  );

  if (prefixMatch) {
    codeType = normalizeCodeType(prefixMatch[1]);
    normalizedCode = String(prefixMatch[2] || "")
      .trim()
      .toUpperCase();
  }

  if (!normalizedCode) {
    throw new Error("Scan code is required.");
  }

  if (!codeType) {
    if (/^\d{12}$/.test(normalizedCode)) {
      codeType = "UPC";
    } else if (/^(?:\d{8}|\d{13}|\d{14})$/.test(normalizedCode)) {
      codeType = "EAN";
    } else if (/^HTTPS?:\/\//.test(normalizedCode)) {
      codeType = "QR";
    } else {
      codeType = "BARCODE";
    }
  }

  const fieldName = {
    UPC: "upc",
    EAN: "ean",
    SKU: "sku",
    SERIAL: "serialNumber",
    QR: "barcode",
    PAWN_TAG: "barcode",
    BARCODE: "barcode",
    UNKNOWN: "barcode",
  }[codeType];

  return {
    rawCode,
    normalizedCode,
    codeType,
    fieldName,
  };
}

export async function recordItemIntakeScan({
  prismaClient,
  shopId,
  capturedByUserId,
  code,
  input = {},
  existingItem = null,
}) {
  if (!prismaClient?.itemIntake) {
    throw new Error("Item intake persistence is unavailable.");
  }

  const normalizedShopId =
    String(shopId || "").trim() ||
    null;

  const customerId =
    String(input.customerId || "").trim() ||
    null;

  if (!normalizedShopId && !customerId) {
    throw new Error(
      "A shop or customer scan scope is required.",
    );
  }

  const duplicateScope =
    normalizedShopId
      ? {
          shopId:
            normalizedShopId,
        }
      : {
          shopId:
            null,

          customerId,
        };

  const analysis = analyzeScanCode(
    code,
    input.codeType,
  );

  const explicitSerialNumber = String(
    input.serialNumber || "",
  )
    .trim()
    .toUpperCase();

  const serialNumber =
    explicitSerialNumber ||
    (analysis.codeType === "SERIAL"
      ? analysis.normalizedCode
      : null);

  const duplicateFilters = [
    {
      normalizedCode: analysis.normalizedCode,
    },
  ];

  if (analysis.fieldName) {
    duplicateFilters.push({
      [analysis.fieldName]: analysis.normalizedCode,
    });
  }

  if (
    serialNumber &&
    analysis.fieldName !== "serialNumber"
  ) {
    duplicateFilters.push({
      serialNumber,
    });
  }

  const priorIntake = await prismaClient.itemIntake.findFirst({
    where: {
      ...duplicateScope,
      OR: duplicateFilters,
    },
    orderBy: {
      createdAt: "desc",
    },
    select: {
      id: true,
      status: true,
      normalizedCode: true,
      linkedItemId: true,
      linkedSubmissionId: true,
      linkedMarketplaceListingId:
        true,
      createdAt: true,
    },
  });

  const duplicateMatches = [];

  if (priorIntake) {
    duplicateMatches.push({
      type: "ITEM_INTAKE",
      id: priorIntake.id,
      status: priorIntake.status,
      linkedItemId: priorIntake.linkedItemId,
      linkedSubmissionId:
        priorIntake.linkedSubmissionId ||
        null,
      linkedMarketplaceListingId:
        priorIntake.linkedMarketplaceListingId ||
        null,
      createdAt:
        priorIntake.createdAt instanceof Date
          ? priorIntake.createdAt.toISOString()
          : priorIntake.createdAt || null,
    });
  }

  if (existingItem?.id) {
    duplicateMatches.push({
      type: "ITEM",
      id: existingItem.id,
      title: existingItem.title || null,
      status: existingItem.status || null,
    });
  }

  const duplicateFound = duplicateMatches.length > 0;

  const data = {
    shopId:
      normalizedShopId,

    capturedByUserId:
      capturedByUserId ||
      null,

    customerId,
    source: normalizeSource(
      input.intakeSource || input.source,
    ),
    destination: normalizeDestination(input.destination),
    status: duplicateFound
      ? "NEEDS_REVIEW"
      : "SCANNED",

    code: analysis.rawCode,
    normalizedCode: analysis.normalizedCode,
    codeType: analysis.codeType,

    title:
      existingItem?.title ||
      String(input.title || "").trim() ||
      `Scanned ${analysis.codeType} ${analysis.normalizedCode}`,

    description:
      existingItem?.description ||
      String(input.description || "").trim() ||
      `Created from scan code ${analysis.normalizedCode}`,

    category:
      existingItem?.category ||
      String(input.category || "").trim() ||
      null,

    condition:
      existingItem?.condition ||
      String(input.condition || "").trim() ||
      null,

    estimatedValue: normalizeMoney(
      input.estimatedValue ??
        input.price ??
        existingItem?.price,
    ),

    images: normalizeStringArray(input.images),
    documentUrls: normalizeStringArray(
      input.documentUrls,
    ),
    receiptUrls: normalizeStringArray(
      input.receiptUrls,
    ),

    duplicateStatus: duplicateFound
      ? "MATCH_FOUND"
      : "CLEAR",

    duplicateMatches: duplicateFound
      ? duplicateMatches
      : [],

    screeningStatus: "NOT_CHECKED",

    linkedItemId:
      existingItem?.id ||
      null,

    linkedSubmissionId:
      null,

    linkedMarketplaceListingId:
      null,

    metadata: {
      workflow:
        normalizedShopId
          ? "items-scan-v1"
          : "customer-item-scan-v1",

      duplicateScope:
        normalizedShopId
          ? "SHOP"
          : "CUSTOMER",

      priorIntakeId:
        priorIntake?.id ||
        null,

      existingItemMatch:
        Boolean(
          existingItem?.id,
        ),
    },
  };

  if (analysis.fieldName) {
    data[analysis.fieldName] =
      analysis.normalizedCode;
  }

  if (serialNumber) {
    data.serialNumber = serialNumber;
  }

  const intake = await prismaClient.itemIntake.create({
    data,
    select: {
      id: true,
      shopId: true,
      capturedByUserId: true,
      customerId: true,
      source: true,
      destination: true,
      status: true,
      code: true,
      normalizedCode: true,
      codeType: true,
      barcode: true,
      upc: true,
      ean: true,
      sku: true,
      serialNumber: true,
      duplicateStatus: true,
      duplicateMatches: true,
      screeningStatus: true,
      linkedItemId: true,
      linkedSubmissionId: true,
      linkedMarketplaceListingId:
        true,
      createdAt: true,
    },
  });

  return {
    intake,
    analysis,
    duplicateMatches,
  };
}
