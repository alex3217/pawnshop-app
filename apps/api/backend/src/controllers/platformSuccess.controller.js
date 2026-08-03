import { getPlatformSuccessOverview } from "../services/platformSuccess.service.js";

export async function getSuperAdminPlatformSuccess(_req, res) {
  const platformSuccess = await getPlatformSuccessOverview();
  return res.json({ success: true, platformSuccess });
}
