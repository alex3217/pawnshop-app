import { prisma } from "../src/lib/prisma.js";
import { resolveEffectiveSellerPlan } from "../src/services/sellerPlan.service.js";
import { reconcileSellerSubscriptionAudit } from "../src/services/stripeSubscriptionWebhook.service.js";

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] || "").trim() : "";
}

const shopId = argumentValue("--shop-id");
const apply = process.argv.includes("--apply");

if (!shopId || shopId.length > 128 || shopId.includes("/")) {
  console.error("Usage: node scripts/reconcile-seller-subscription-audit.mjs --shop-id <explicit-shop-id> [--apply]");
  process.exitCode = 2;
} else {
  try {
    const shop = await prisma.pawnShop.findUnique({
      where: { id: shopId },
      select: {
        id: true,
        name: true,
        subscriptionPlan: true,
        subscriptionStatus: true,
        subscriptionBillingInterval: true,
        subscriptionCurrentPeriodEnd: true,
        cancelAtPeriodEnd: true,
        stripeSubscriptionId: true,
      },
    });

    if (!shop) throw Object.assign(new Error("Shop not found."), { code: "SHOP_NOT_FOUND" });

    const effective = resolveEffectiveSellerPlan(shop);
    console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", shop, effective }, null, 2));

    if (!apply) {
      console.log("Read-only inspection complete. Re-run with --apply to write only the reconciliation audit row.");
    } else {
      const audit = await reconcileSellerSubscriptionAudit({ shopId, prismaClient: prisma });
      console.log(JSON.stringify({ reconciled: true, auditId: audit.id, action: audit.action }, null, 2));
    }
  } catch (error) {
    console.error(JSON.stringify({ error: error?.message || String(error), code: error?.code || null }));
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}
