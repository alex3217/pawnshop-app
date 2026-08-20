import { provisionStagingQaAccounts, validateStagingQaProvisioningEnvironment } from "./lib/staging-qa-account-provisioner.mjs";

async function main() {
  const { accounts } = validateStagingQaProvisioningEnvironment(process.env);
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  try {
    const result = await provisionStagingQaAccounts({ prisma, accounts });
    console.log("Staging QA accounts provisioned.", result);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  void error;
  console.error("Staging QA account provisioning failed. Review the staging-only safety requirements.");
  process.exitCode = 1;
});
