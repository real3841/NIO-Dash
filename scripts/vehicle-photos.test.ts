import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { handleVehiclePhotoRequest } from "./vehicle-photos";

test("an oversized photo upload returns 413 instead of resetting the connection", async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "nio-photo-test-"));
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url ?? "/", "http://127.0.0.1").pathname;
    void handleVehiclePhotoRequest(req, res, pathname, req.method ?? "GET", dataDir);
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address === "object");

  try {
    const result = await new Promise<{ status: number; body: string }>((resolve, reject) => {
      const req = http.request(
        {
          host: "127.0.0.1",
          port: address.port,
          path: "/api/vehicle-photos/side",
          method: "PUT",
          headers: { "Content-Length": 12 * 1024 * 1024 + 1 },
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk: Buffer) => chunks.push(chunk));
          res.on("end", () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }));
        },
      );
      req.on("error", reject);
      req.end(Buffer.alloc(12 * 1024 * 1024 + 1));
    });

    assert.equal(result.status, 413);
    assert.match(result.body, /12 MB/);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
