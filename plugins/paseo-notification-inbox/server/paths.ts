import os from "node:os";
import path from "node:path";

export const PLUGIN_ID = "paseo-notification-inbox";

/** Daemon-side data directory. The SDK exposes none, so follow the Paseo home convention. */
export function dataFile(env: NodeJS.ProcessEnv = process.env): string {
  const dir =
    env.PASEO_NOTIFICATION_INBOX_DIR ??
    path.join(env.PASEO_HOME ?? path.join(os.homedir(), ".paseo"), "plugin-data", PLUGIN_ID);
  return path.join(dir, "notifications.json");
}
