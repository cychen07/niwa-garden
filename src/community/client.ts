import type { EnvironmentState, GardenState } from "../game/model";

export interface Work {
  id: string; title: string; author: string; seconds: number; templateId: string | null;
  size: number; objectCount: number; createdAt: string; updatedAt: string;
  mine: boolean; liked: boolean; likes: number; thumbnailUrl: string;
}
export interface WorkDetail extends Work { garden: GardenState; environment: EnvironmentState }
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options, credentials: "same-origin",
    headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...options.headers },
    signal: options.signal ?? AbortSignal.timeout(15000),
  });
  const value = await response.json().catch(() => null);
  if (!response.ok || !value) throw new Error(value?.error ?? "暂时连不上作品广场，请稍后再试");
  return value as T;
}
export const duration = (seconds: number) => seconds < 60 ? `${seconds}秒` :
  seconds < 3600 ? `${Math.floor(seconds / 60)}分${seconds % 60 ? `${seconds % 60}秒` : ""}` :
    `${Math.floor(seconds / 3600)}小时${Math.floor(seconds % 3600 / 60)}分`;

export function thumbnail(): string {
  const source = document.querySelector<HTMLCanvasElement>(".editor-scene canvas");
  if (!source) throw new Error("庭院画面尚未准备好");
  const canvas = document.createElement("canvas");
  const ratio = Math.min(1, 800 / source.width);
  canvas.width = Math.round(source.width * ratio);
  canvas.height = Math.round(source.height * ratio);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("无法生成作品封面");
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.82);
}
