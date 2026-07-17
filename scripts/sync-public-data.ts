import fs from "node:fs";
import path from "node:path";
import { getDataDir, getPublicDataDir } from "./paths.js";
import { isDirectCliInvocation } from "./cli-main.js";

export function syncPublicData(): void {
  if (process.env.NIO_APP_MODE === "electron") return;
  const srcDir = getDataDir();
  const publicData = getPublicDataDir();
  if (!fs.existsSync(srcDir)) return;
  fs.mkdirSync(publicData, { recursive: true });
  for (const name of [
    "vehicle.json",
    "history.json",
    "last-fetch.json",
    "change.json",
    "last-fetch-change.json",
    "checkin.json",
    "last-fetch-checkin.json",
  ]) {
    const src = path.join(srcDir, name);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(publicData, name));
    }
  }
}

if (isDirectCliInvocation("sync-public-data.ts")) {
  syncPublicData();
}
