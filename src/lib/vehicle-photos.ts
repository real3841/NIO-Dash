import { useEffect, useState } from "react";

export const PHOTO_ANGLES = [
  { id: "side", label: "侧面" },
  { id: "front45", label: "前 45°" },
  { id: "rear45", label: "后 45°" },
  { id: "front", label: "正前" },
  { id: "rear", label: "正后" },
] as const;

export type PhotoAngle = (typeof PHOTO_ANGLES)[number]["id"];
export type PhotoMap = Record<PhotoAngle, number | null>;

/** 热点在照片里的位置（百分比）。按官网配置器同款构图估的，别的构图会偏一点 */
export const PHOTO_SPOTS: Record<PhotoAngle, Record<string, [number, number]>> = {
  side: {
    lights: [6, 47],
    hood: [22, 43],
    tyre_fl: [19.5, 66],
    door_fl: [49, 46],
    door_rl: [67, 45],
    port: [83, 43],
    tyre_rl: [78, 66],
    cabin: [55, 27],
  },
  front45: {
    lights: [35, 49],
    hood: [30, 43],
    tyre_fl: [46, 68],
    door_fl: [64, 45],
    door_rl: [78, 43],
    port: [84, 41],
    tyre_rl: [82, 62],
    cabin: [55, 27],
  },
  rear45: {
    tail: [17, 47],
    tyre_rr: [37, 67],
    door_rr: [51, 45],
    door_fr: [66, 45],
    tyre_fr: [85, 64],
    cabin: [50, 27],
  },
  front: {
    lights: [34, 49],
    hood: [50, 43],
    tyre_fr: [31, 78],
    tyre_fl: [69, 78],
    cabin: [50, 30],
  },
  rear: {
    tail: [62, 40],
    tyre_rl: [35, 70],
    tyre_rr: [73, 67],
    cabin: [60, 30],
  },
};

const EVENT = "nio-vehicle-photos";

export async function fetchVehiclePhotos(): Promise<PhotoMap | null> {
  try {
    const res = await fetch(`/api/vehicle-photos?_=${Date.now()}`);
    if (!res.ok) return null;
    const body = (await res.json()) as { photos?: PhotoMap };
    return body.photos ?? null;
  } catch {
    return null;
  }
}

async function finish(res: Response): Promise<PhotoMap> {
  const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; photos?: PhotoMap };
  if (!res.ok || !body.photos) throw new Error(body.error ?? `保存失败 (${res.status})`);
  window.dispatchEvent(new CustomEvent<PhotoMap>(EVENT, { detail: body.photos }));
  return body.photos;
}

export async function uploadVehiclePhoto(angle: PhotoAngle, file: File): Promise<PhotoMap> {
  return finish(await fetch(`/api/vehicle-photos/${angle}`, { method: "PUT", body: file }));
}

export async function deleteVehiclePhoto(angle: PhotoAngle): Promise<PhotoMap> {
  return finish(await fetch(`/api/vehicle-photos/${angle}`, { method: "DELETE" }));
}

export function photoUrl(angle: PhotoAngle, version: number): string {
  return `/api/vehicle-photos/${angle}?v=${version}`;
}

export function useVehiclePhotos(): PhotoMap | null {
  const [photos, setPhotos] = useState<PhotoMap | null>(null);
  useEffect(() => {
    let alive = true;
    void fetchVehiclePhotos().then((p) => alive && setPhotos(p));
    const onChange = (event: Event) => setPhotos((event as CustomEvent<PhotoMap>).detail);
    window.addEventListener(EVENT, onChange);
    return () => {
      alive = false;
      window.removeEventListener(EVENT, onChange);
    };
  }, []);
  return photos;
}

const cutoutCache = new Map<string, Promise<string>>();
const CUTOUT_CACHE_LIMIT = PHOTO_ANGLES.length;

function cachedCutout(url: string): Promise<string> | null {
  const cached = cutoutCache.get(url);
  if (!cached) return null;
  cutoutCache.delete(url);
  cutoutCache.set(url, cached);
  return cached;
}

function rememberCutout(url: string, job: Promise<string>): Promise<string> {
  cutoutCache.set(url, job);
  while (cutoutCache.size > CUTOUT_CACHE_LIMIT) {
    const oldest = cutoutCache.keys().next().value;
    if (typeof oldest !== "string") break;
    cutoutCache.delete(oldest);
  }
  void job.catch(() => {
    if (cutoutCache.get(url) === job) cutoutCache.delete(url);
  });
  return job;
}

/**
 * 去掉和图片边缘连着的白底，车身里的反光不动。
 * 白底附近的浅灰（地面阴影）按亮度变成半透明。
 */
export function cutoutWhiteBackground(url: string): Promise<string> {
  const cached = cachedCutout(url);
  if (cached) return cached;
  const job = new Promise<string>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 1400 / img.naturalWidth);
      const w = Math.round(img.naturalWidth * scale);
      const h = Math.round(img.naturalHeight * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) {
        resolve(url);
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      const data = ctx.getImageData(0, 0, w, h);
      const p = data.data;
      const isBackground = (i: number) => {
        const r = p[i], g = p[i + 1], b = p[i + 2];
        const min = Math.min(r, g, b);
        return min > 168 && Math.max(r, g, b) - min < 20;
      };
      const seen = new Uint8Array(w * h);
      const queue = new Int32Array(w * h);
      let head = 0;
      let tail = 0;
      const push = (x: number, y: number) => {
        const k = y * w + x;
        if (seen[k] || !isBackground(k * 4)) return;
        seen[k] = 1;
        queue[tail++] = k;
      };
      for (let x = 0; x < w; x++) {
        push(x, 0);
        push(x, h - 1);
      }
      for (let y = 0; y < h; y++) {
        push(0, y);
        push(w - 1, y);
      }
      while (head < tail) {
        const k = queue[head++];
        const x = k % w;
        const y = (k - x) / w;
        if (x > 0) push(x - 1, y);
        if (x < w - 1) push(x + 1, y);
        if (y > 0) push(x, y - 1);
        if (y < h - 1) push(x, y + 1);
      }
      for (let k = 0; k < w * h; k++) {
        if (!seen[k]) continue;
        const i = k * 4;
        const min = Math.min(p[i], p[i + 1], p[i + 2]);
        const alpha = Math.max(0, Math.min(1, (252 - min) / 84));
        p[i] = p[i + 1] = p[i + 2] = 10;
        p[i + 3] = Math.round(alpha * alpha * 170);
      }
      ctx.putImageData(data, 0, 0);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => reject(new Error("图片加载失败"));
    img.src = url;
  });
  return rememberCutout(url, job);
}
