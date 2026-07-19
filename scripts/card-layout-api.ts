import fs from "node:fs";
import path from "node:path";
import type http from "node:http";
import { writeJsonAtomic } from "./atomic-write.js";

function json(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

export function getCardLayoutFile(dataDir: string): string {
  return path.join(path.dirname(dataDir), "card-layout.json");
}

export async function handleCardLayoutRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  method: string,
  layoutFile: string,
): Promise<boolean> {
  if (method === "GET") {
    try {
      if (!fs.existsSync(layoutFile)) {
        json(res, 200, {});
        return true;
      }
      const raw = fs.readFileSync(layoutFile, "utf8").trim();
      json(res, 200, raw ? JSON.parse(raw) : {});
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      json(res, 500, { ok: false, error: message });
    }
    return true;
  }

  if (method === "PUT") {
    try {
      const raw = await readBody(req);
      const body = JSON.parse(raw) as unknown;
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        json(res, 400, { ok: false, error: "invalid_body" });
        return true;
      }
      fs.mkdirSync(path.dirname(layoutFile), { recursive: true });
      writeJsonAtomic(layoutFile, body);
      json(res, 200, { ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      json(res, 500, { ok: false, error: message });
    }
    return true;
  }

  return false;
}
