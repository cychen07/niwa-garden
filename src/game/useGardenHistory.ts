import { useCallback, useRef, useState } from "react";
import { loadGarden, type GardenState } from "./model";
import { readDraft } from "../community/useDraft";

export function useGardenHistory() {
  const [garden, setGarden] = useState(() => readDraft()?.garden ?? loadGarden());
  const current = useRef(garden);
  const before = useRef<GardenState | null>(null);
  const past = useRef<GardenState[]>([]);
  const future = useRef<GardenState[]>([]);
  const [availability, setAvailability] = useState({ canUndo: false, canRedo: false });

  const publish = useCallback(() => {
    setGarden(current.current);
    setAvailability({ canUndo: past.current.length > 0, canRedo: future.current.length > 0 });
  }, []);

  const begin = useCallback(() => {
    before.current ??= current.current;
  }, []);

  const finish = useCallback(() => {
    const snapshot = before.current;
    before.current = null;
    if (snapshot && snapshot !== current.current) {
      past.current = [...past.current.slice(-39), snapshot];
      future.current = [];
      publish();
    }
  }, [publish]);

  const update = useCallback((change: (state: GardenState) => GardenState) => {
    const next = change(current.current);
    if (next === current.current) return;
    if (!before.current) {
      past.current = [...past.current.slice(-39), current.current];
      future.current = [];
    }
    current.current = next;
    publish();
  }, [publish]);

  const cancel = useCallback(() => {
    if (before.current) {
      current.current = before.current;
      before.current = null;
      publish();
    }
  }, [publish]);

  const undo = useCallback(() => {
    finish();
    const previous = past.current.pop();
    if (!previous) return;
    future.current = [current.current, ...future.current].slice(0, 40);
    current.current = previous;
    publish();
  }, [finish, publish]);

  const redo = useCallback(() => {
    finish();
    const next = future.current.shift();
    if (!next) return;
    past.current = [...past.current.slice(-39), current.current];
    current.current = next;
    publish();
  }, [finish, publish]);

  const replace = useCallback((next: GardenState) => {
    before.current = null;
    past.current = [];
    future.current = [];
    current.current = next;
    publish();
  }, [publish]);
  return { garden, current, begin, finish, update, cancel, undo, redo, replace, ...availability };
}
