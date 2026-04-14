import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();

const EMAIL = process.env.ADMIN_SEED_EMAIL || "admin1@example.com";
const PASSWORD = process.env.ADMIN_SEED_PASSWORD || "password123";
const NAME = process.env.ADMIN_SEED_NAME || "Admin";
const ROLE_PREFERRED = process.env.ADMIN_SEED_ROLE || "ADMIN";

// If set to "1", store plaintext in the password field (not recommended unless your login code uses plaintext)
const STORE_PLAINTEXT_PASSWORD = process.env.ADMIN_SEED_PLAINTEXT === "1";

function getModelMeta(modelName) {
  const models = Prisma?.dmmf?.datamodel?.models || [];
  return models.find((m) => m.name.toLowerCase() === modelName.toLowerCase());
}

function getEnumValues(enumName) {
  const enums = Prisma?.dmmf?.datamodel?.enums || [];
  const en = enums.find((e) => e.name === enumName);
  return en ? en.values.map((v) => v.name) : null;
}

function chooseEnumValue(enumName, preferred) {
  const values = getEnumValues(enumName);
  if (!values || values.length === 0) return preferred;
  if (values.includes(preferred)) return preferred;
  const adminLike = values.find((v) => v.toUpperCase().includes("ADMIN"));
  return adminLike || values[0];
}

function scalarDefaultByType(type) {
  if (type === "String") return "seed";
  if (type === "Boolean") return true;
  if (type === "Int") return 0;
  if (type === "BigInt") return BigInt(0);
  if (type === "Float") return 0;
  if (type === "DateTime") return new Date();
  return null;
}

async function main() {
  // Your error shows prisma.user exists, so we use that directly.
  const delegate = prisma.user;

  const modelMeta = getModelMeta("User");
  if (!modelMeta) {
    throw new Error("Could not find Prisma model metadata for 'User' in Prisma.dmmf.");
  }

  const fieldNames = new Set(modelMeta.fields.map((f) => f.name));

  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  // Pick ONE password field that exists (priority order)
  const passwordField =
    ["passwordHash", "hashedPassword", "password"].find((f) => fieldNames.has(f)) || null;

  // Pick ONE role field that exists
  const roleField = ["userRole", "role"].find((f) => fieldNames.has(f)) || null;

  // Pick ONE active/enabled field that exists
  const activeField = ["enabled", "isActive", "active"].find((f) => fieldNames.has(f)) || null;

  // Build data only using real fields
  const data = {};

  if (fieldNames.has("email")) data.email = EMAIL;
  if (fieldNames.has("name")) data.name = NAME;

  // password
  if (passwordField) {
    data[passwordField] = STORE_PLAINTEXT_PASSWORD ? PASSWORD : passwordHash;
  }

  // role
  if (roleField) {
    const roleMeta = modelMeta.fields.find((f) => f.name === roleField);
    if (roleMeta?.kind === "enum") {
      data[roleField] = chooseEnumValue(roleMeta.type, ROLE_PREFERRED);
    } else {
      data[roleField] = ROLE_PREFERRED;
    }
  }

  // active/enabled
  if (activeField) data[activeField] = true;

  // Fill any other REQUIRED scalar fields with safe defaults (and only if they exist)
  for (const f of modelMeta.fields) {
    if (f.kind !== "scalar" && f.kind !== "enum") continue;
    if (!f.isRequired) continue;
    if (f.hasDefaultValue) continue;
    if (f.name === "id") continue;

    if (data[f.name] !== undefined) continue;

    if (f.kind === "enum") {
      data[f.name] = chooseEnumValue(f.type, ROLE_PREFERRED);
      continue;
    }

    const def = scalarDefaultByType(String(f.type));
    if (def === null) {
      throw new Error(`Required field '${f.name}' has unsupported type '${f.type}'. Add handling.`);
    }

    // Make nicer defaults for common fields
    if (f.name.toLowerCase().includes("name")) data[f.name] = NAME;
    else if (f.name.toLowerCase().includes("email")) data[f.name] = EMAIL;
    else data[f.name] = def;
  }

  // Upsert-ish (find by email then create/update)
  const existing = await delegate.findFirst({ where: fieldNames.has("email") ? { email: EMAIL } : {} });

  if (existing?.id) {
    const updated = await delegate.update({ where: { id: existing.id }, data });
    console.log("✅ Seed admin updated:", { id: updated.id, email: EMAIL });
  } else {
    const created = await delegate.create({ data });
    console.log("✅ Seed admin created:", { id: created.id, email: EMAIL });
  }

  console.log("➡️  Login with:", { email: EMAIL, password: PASSWORD });
  if (!passwordField) {
    console.log("⚠️  Note: No password field found on User; login may be impossible until schema adds one.");
  }
}

main()
  .catch((e) => {
    console.error("❌ Seed admin failed:", e?.message || e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
