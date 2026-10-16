export type StorageFileKind = "config" | "data";

export interface StorageFileEntry {
  id: string;
  label: string;
  path: string;
  kind: StorageFileKind;
  exists: boolean;
  sizeBytes: number | null;
  modifiedAt: number | null;
}

export interface StorageFilesResponse {
  ok: boolean;
  dataDir: string;
  userDataDir: string;
  envFile: string;
  files: StorageFileEntry[];
  error?: string;
}

export function formatFileSize(bytes: number | null): string {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export async function fetchStorageFiles(): Promise<StorageFilesResponse> {
  const res = await fetch("/api/storage-files");
  const data = (await res.json()) as StorageFilesResponse;
  if (!res.ok || !data.ok) {
    throw new Error(data.error ?? `无法加载文件列表 (${res.status})`);
  }
  return data;
}
