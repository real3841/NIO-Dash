import fs from "node:fs";
import path from "node:path";

/** 先写临时文件再 rename，避免写入中断导致 JSON 损坏 */
export function writeFileAtomic(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, content, "utf8");
  fs.renameSync(tmp, filePath);
}

export function writeJsonAtomic(filePath: string, data: unknown, spacing = 2): void {
  writeFileAtomic(filePath, JSON.stringify(data, null, spacing));
}
