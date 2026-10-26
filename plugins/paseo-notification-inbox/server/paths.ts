import os from "node:os";
import path from "node:path";

export const PLUGIN_ID = "paseo-notification-inbox";

/** Daemon-side data directory. The SDK exposes none, so follow the Paseo home convention. */
function dataDir(env: NodeJS.ProcessEnv): string {
  return (
    env.PASEO_NOTIFICATION_INBOX_DIR ??
    path.join(env.PASEO_HOME ?? path.join(os.homedir(), ".paseo"), "plugin-data", PLUGIN_ID)
  );
}

export function dataFile(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(dataDir(env), "notifications.json");
}

/** View settings (role filter), shared by every client of this daemon. */
export function settingsFile(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(dataDir(env), "settings.json");
}
