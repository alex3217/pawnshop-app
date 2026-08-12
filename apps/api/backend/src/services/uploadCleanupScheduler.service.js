import { cleanupStaleUploadAssets } from "./uploadAssets.service.js";

const INTERVAL_MS = 15 * 60 * 1000;
let timer = null;
let running = false;

export function startUploadCleanupScheduler({ storage, logger = console } = {}) {
  if (timer || process.env.DURABLE_UPLOADS_ENABLED !== "true") return timer;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const result = await cleanupStaleUploadAssets({ storage, logger });
      if (result.examined) logger.info?.("[upload-assets]", { event: "cleanup_completed", ...result });
    } catch (error) {
      logger.error?.("[upload-assets]", { event: "cleanup_failed", reason: error?.name || "Error" });
    } finally {
      running = false;
    }
  };
  timer = setInterval(tick, INTERVAL_MS);
  timer.unref?.();
  void tick();
  return timer;
}

export function stopUploadCleanupScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
  running = false;
}
