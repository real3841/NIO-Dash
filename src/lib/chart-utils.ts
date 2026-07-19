/** 按索引降采样，保留首尾 */
export function decimateIndices(count: number, maxPoints: number): number[] {
  if (count <= maxPoints || maxPoints < 2) {
    return Array.from({ length: count }, (_, i) => i);
  }
  const out: number[] = [];
  for (let i = 0; i < maxPoints; i++) {
    out.push(Math.round((i * (count - 1)) / (maxPoints - 1)));
  }
  return out;
}

/** 按可视宽度降采样折线点，保留首尾 */
export function decimateSeries<T>(points: T[], maxPoints: number): T[] {
  if (points.length <= maxPoints || maxPoints < 2) return points;
  return decimateIndices(points.length, maxPoints).map((i) => points[i]);
}
