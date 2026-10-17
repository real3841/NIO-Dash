export type UiLook = "classic" | "new" | "adjust";

const KEY = "nio_ui_look";

export function readUiLook(): UiLook {
  try {
    const saved = localStorage.getItem(KEY);
    return saved === "classic" || saved === "adjust" ? saved : "new";
  } catch {
    return "new";
  }
}

export function applyUiLook(look: UiLook): void {
  document.documentElement.classList.toggle("look-classic", look === "classic");
  document.documentElement.classList.toggle("look-adjust", look === "adjust");
  try {
    localStorage.setItem(KEY, look);
  } catch {
    /* 这次打开仍然生效 */
  }
  window.dispatchEvent(new CustomEvent<UiLook>("nio-ui-look", { detail: look }));
}
