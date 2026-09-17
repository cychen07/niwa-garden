import { useCallback, useEffect, useRef, useState } from "react";
import { newId, parseGarden, type GardenState } from "../game/model";

export const DRAFT_KEY = "niwa-active-draft";
export const RECOVERY_KEY = "niwa-previous-draft";
export interface DraftMeta { id: string; seconds: number; templateId: string | null; title: string; author: string }
export function readDraft(): { garden: GardenState; meta: DraftMeta } | null {
  try {
    const value = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "null");
    const garden = parseGarden(value?.garden), meta = value?.meta;
    if (!garden || !meta || typeof meta.id !== "string" || !/^[\w-]{8,80}$/.test(meta.id) ||
        !Number.isInteger(meta.seconds) || meta.seconds < 0 || meta.seconds > 31536000 ||
        typeof meta.title !== "string" || typeof meta.author !== "string" ||
        !(meta.templateId === null || ["dry", "tea", "pond", "court"].includes(meta.templateId))) return null;
    return { garden, meta };
  } catch { return null; }
}
const fresh = (templateId: string | null = null): DraftMeta => ({
  id: newId(), seconds: 0, templateId, title: "", author: "",
});
export function useDraft(garden: GardenState, active: boolean) {
  const [meta, setMeta] = useState<DraftMeta>(() => readDraft()?.meta ?? fresh());
  const current = useRef({ garden, meta, active });
  current.current = { garden, meta, active };
  const lastInput = useRef(performance.now());
  const [storageError, setStorageError] = useState(false);
  const persist = useCallback(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ garden: current.current.garden, meta: current.current.meta }));
      setStorageError(false);
    } catch { setStorageError(true); }
  }, []);
  useEffect(() => {
    const id = window.setTimeout(persist, 700);
    return () => clearTimeout(id);
  }, [garden, meta, persist]);
  useEffect(() => {
    const input = () => { if (current.current.active) lastInput.current = performance.now(); };
    const drag = (event: PointerEvent) => { if (event.buttons) input(); };
    const hide = () => { if (document.hidden) persist(); };
    const timer = setInterval(() => {
      if (current.current.active && !document.hidden && document.hasFocus() && performance.now() - lastInput.current < 30000) {
        setMeta((value) => ({ ...value, seconds: Math.min(31536000, value.seconds + 1) }));
      }
    }, 1000);
    window.addEventListener("pointerdown", input);
    window.addEventListener("pointermove", drag);
    window.addEventListener("keydown", input);
    window.addEventListener("wheel", input, { passive: true });
    window.addEventListener("pagehide", persist);
    document.addEventListener("visibilitychange", hide);
    return () => {
      clearInterval(timer);
      window.removeEventListener("pointerdown", input);
      window.removeEventListener("pointermove", drag);
      window.removeEventListener("keydown", input);
      window.removeEventListener("wheel", input);
      window.removeEventListener("pagehide", persist);
      document.removeEventListener("visibilitychange", hide);
    };
  }, [persist]);
  const start = (next: GardenState, templateId: string | null) => {
    // Save the recoverable project before replacing both scene and timing metadata.
    localStorage.setItem(RECOVERY_KEY, JSON.stringify({ garden: current.current.garden, meta: current.current.meta }));
    const nextMeta = { ...fresh(templateId), author: current.current.meta.author };
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ garden: next, meta: nextMeta }));
    setMeta(nextMeta);
  };
  return { meta, setMeta, persist, start, storageError };
}
