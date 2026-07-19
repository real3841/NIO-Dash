export function loadDrawerOpen(key: string, defaultOpen = false): boolean {
  try {
    const raw = localStorage.getItem(key);
    if (raw === "1") return true;
    if (raw === "0") return false;
  } catch {
    /* ignore */
  }
  return defaultOpen;
}

export function saveDrawerOpen(key: string, open: boolean): void {
  try {
    localStorage.setItem(key, open ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export const TREND_DRAWER_KEY = "nio_trend_drawer_open";
export const PATH_DRAWER_KEY = "nio_path_drawer_open";
