export function clamp(min: number, value: number, max: number) {
  return Math.min(Math.max(value, min), max)
};
export function closestNumber(value: number, x: number, y: number) {
  return Math.abs(value - x) <= Math.abs(value - y) ? x : y
}
