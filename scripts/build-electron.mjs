import * as esbuild from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

await esbuild.build({
  entryPoints: [path.join(root, "electron/main.ts")],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  outfile: path.join(root, "electron-dist/main.cjs"),
  external: ["electron"],
  sourcemap: true,
});

const iconSrc = path.join(root, "electron", "icons");
const iconDst = path.join(root, "electron-dist", "icons");
if (fs.existsSync(iconSrc)) {
  fs.mkdirSync(iconDst, { recursive: true });
  for (const name of fs.readdirSync(iconSrc)) {
    fs.copyFileSync(path.join(iconSrc, name), path.join(iconDst, name));
  }
}

console.log("已打包 electron-dist/main.cjs");
