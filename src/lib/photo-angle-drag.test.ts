import assert from "node:assert/strict";
import test from "node:test";
import { angleAfterHorizontalDrag, orderedPhotoAngles } from "./photo-angle-drag";
import type { PhotoAngle } from "./vehicle-photos";

const allAngles: PhotoAngle[] = ["side", "front45", "rear45", "front", "rear"];

test("orders available photos from front to rear for horizontal dragging", () => {
  assert.deepEqual(orderedPhotoAngles(allAngles), ["front", "front45", "side", "rear45", "rear"]);
});

test("dragging left advances toward the rear and dragging right returns toward the front", () => {
  const ordered = orderedPhotoAngles(allAngles);
  assert.equal(angleAfterHorizontalDrag(ordered, "side", -80), "rear45");
  assert.equal(angleAfterHorizontalDrag(ordered, "side", 80), "front45");
});

test("small movements do not change angle and large movements stop at an available endpoint", () => {
  const ordered = orderedPhotoAngles(allAngles);
  assert.equal(angleAfterHorizontalDrag(ordered, "side", 20), "side");
  assert.equal(angleAfterHorizontalDrag(ordered, "side", -500), "rear");
});

test("dragging skips angles whose photos are unavailable", () => {
  const ordered = orderedPhotoAngles(["side", "front", "rear"]);
  assert.deepEqual(ordered, ["front", "side", "rear"]);
  assert.equal(angleAfterHorizontalDrag(ordered, "side", -80), "rear");
});
