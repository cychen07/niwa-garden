export type CameraActionKind = "reset" | "in" | "out" | "top";
export const CAMERA_TARGET: [number, number, number] = [0, 0.45, 0];
export const DEFAULT_CAMERA_POSITION: [number, number, number] = [12, 17.45, 12];
export const TOP_CAMERA_POSITION: [number, number, number] = [0, 24, 0.0001];
export const MIN_CAMERA_ELEVATION = Math.PI / 12;

export function cameraFrame(width: number, height: number, gardenSize: number, compact = false) {
  const mobile = width <= 720;
  const top = compact ? 28 : mobile ? 244 : 146;
  const bottom = compact ? 58 : mobile ? 204 : 154;
  const horizontal = compact ? 28 : mobile ? 28 : 180;
  const availableHeight = Math.max(80, height - top - bottom);
  const zoom = Math.max(4, Math.min(
    (width - horizontal) / ((gardenSize + 1.8) * Math.SQRT2),
    availableHeight / (gardenSize + 3.3),
    compact ? Infinity : 58,
  ));
  return { zoom, offsetY: (bottom - top) / 2 };
}
