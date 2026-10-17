export type UiLook = "classic" | "new";

const KEY = "nio_ui_look";

export function readUiLook(): UiLook {
  try {
    return localStorage.getItem(KEY) === "classic" ? "classic" : "new";
  } catch {
    return "new";
  }
}

export function applyUiLook(look: UiLook): void {
  document.documentElement.classList.toggle("look-classic", look === "classic");
  try {
    localStorage.setItem(KEY, look);
  } catch {
    /* 这次打开仍然生效 */
  }
  window.dispatchEvent(new CustomEvent<UiLook>("nio-ui-look", { detail: look }));
}
