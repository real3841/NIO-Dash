import fs from "node:fs";
import type http from "node:http";
import path from "node:path";

export const PHOTO_ANGLES = ["side", "front45", "rear45", "front", "rear"] as const;
export type PhotoAngle = (typeof PHOTO_ANGLES)[number];

const MAX_BYTES = 12 * 1024 * 1024;

function isAngle(value: string): value is PhotoAngle {
  return (PHOTO_ANGLES as readonly string[]).includes(value);
}

function photoDir(dataDir: string): string {
  return path.join(dataDir, "vehicle-photos");
}

function sniffType(buf: Buffer): "png" | "jpg" | "webp" | null {
  if (buf.length > 8 && buf.readUInt32BE(0) === 0x89504e47) return "png";
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  if (buf.length > 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
    return "webp";
  }
  return null;
}

const CONTENT_TYPE = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" } as const;

function findPhoto(dataDir: string, angle: PhotoAngle): { file: string; type: keyof typeof CONTENT_TYPE } | null {
  for (const type of ["png", "jpg", "webp"] as const) {
    const file = path.join(photoDir(dataDir), `${angle}.${type}`);
    if (fs.existsSync(file)) return { file, type };
  }
  return null;
}

function listPhotos(dataDir: string): Record<PhotoAngle, number | null> {
  const out = {} as Record<PhotoAngle, number | null>;
  for (const angle of PHOTO_ANGLES) {
    const found = findPhoto(dataDir, angle);
    out[angle] = found ? Math.round(fs.statSync(found.file).mtimeMs) : null;
  }
  return out;
}

function readBody(req: http.IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let settled = false;
    req.on("data", (chunk: Buffer) => {
      if (settled) return;
      size += chunk.length;
      if (size > MAX_BYTES) {
        settled = true;
        chunks.length = 0;
        reject(new Error("too_large"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (!settled) resolve(Buffer.concat(chunks));
    });
    req.on("error", (error) => {
      if (!settled) reject(error);
    });
  });
}

function send(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}

/** 只存在本机数据目录，不进安装包也不进仓库 */
export async function handleVehiclePhotoRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string,
  method: string,
  dataDir: string,
): Promise<boolean> {
  if (pathname === "/api/vehicle-photos" && method === "GET") {
    send(res, 200, { ok: true, photos: listPhotos(dataDir) });
    return true;
  }

  const match = /^\/api\/vehicle-photos\/([a-z0-9]+)$/.exec(pathname);
  if (!match) return false;
  const angle = match[1];
  if (!isAngle(angle)) {
    send(res, 404, { ok: false, error: "unknown_angle" });
    return true;
  }

  if (method === "GET") {
    const found = findPhoto(dataDir, angle);
    if (!found) {
      send(res, 404, { ok: false, error: "not_found" });
      return true;
    }
    res.writeHead(200, { "Content-Type": CONTENT_TYPE[found.type], "Cache-Control": "no-store" });
    fs.createReadStream(found.file).pipe(res);
    return true;
  }

  if (method === "PUT") {
    const declaredLength = Number(req.headers["content-length"]);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_BYTES) {
      req.resume();
      send(res, 413, { ok: false, error: "图片超过 12 MB" });
      return true;
    }
    let buf: Buffer;
    try {
      buf = await readBody(req);
    } catch (error) {
      const tooLarge = error instanceof Error && error.message === "too_large";
      send(res, tooLarge ? 413 : 400, {
        ok: false,
        error: tooLarge ? "图片超过 12 MB" : "图片读取失败",
      });
      return true;
    }
    const type = sniffType(buf);
    if (!type) {
      send(res, 400, { ok: false, error: "只支持 PNG / JPG / WebP" });
      return true;
    }
    fs.mkdirSync(photoDir(dataDir), { recursive: true });
    const old = findPhoto(dataDir, angle);
    if (old) fs.rmSync(old.file, { force: true });
    fs.writeFileSync(path.join(photoDir(dataDir), `${angle}.${type}`), buf);
    send(res, 200, { ok: true, photos: listPhotos(dataDir) });
    return true;
  }

  if (method === "DELETE") {
    const old = findPhoto(dataDir, angle);
    if (old) fs.rmSync(old.file, { force: true });
    send(res, 200, { ok: true, photos: listPhotos(dataDir) });
    return true;
  }

  send(res, 405, { ok: false, error: "method_not_allowed" });
  return true;
}
