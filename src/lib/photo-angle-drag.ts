import type { PhotoAngle } from "./vehicle-photos";

const DRAG_ORDER: readonly PhotoAngle[] = ["front", "front45", "side", "rear45", "rear"];
const DRAG_STEP_PX = 64;

export function orderedPhotoAngles(available: readonly PhotoAngle[]): PhotoAngle[] {
  const included = new Set(available);
  return DRAG_ORDER.filter((angle) => included.has(angle));
}

export function angleAfterHorizontalDrag(
  ordered: readonly PhotoAngle[],
  initial: PhotoAngle,
  deltaX: number,
): PhotoAngle {
  if (ordered.length < 2) return initial;
  const initialIndex = Math.max(0, ordered.indexOf(initial));
  const steps = Math.round(-deltaX / DRAG_STEP_PX);
  const nextIndex = Math.max(0, Math.min(ordered.length - 1, initialIndex + steps));
  return ordered[nextIndex] ?? initial;
}
