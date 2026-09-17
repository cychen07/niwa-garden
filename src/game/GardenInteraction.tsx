import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, type RefObject } from "react";
import { Plane, Vector2, Vector3, type Group, type Mesh, type Object3D } from "three";
import { CENTER, distance, heightAt, inGarden, newId, type EditorMode, type GardenPoint, type GardenState, type Tool } from "./model";

export interface InteractionProps {
  garden: GardenState;
  mode: EditorMode;
  tool: Tool;
  onBegin: () => void;
  onFinish: () => void;
  onCancel: () => void;
  onBrush: (from: GardenPoint, to: GardenPoint, seconds: number, id: string, finalSample?: boolean) => boolean;
  onPlace: (point: GardenPoint) => void;
  onSelect: (id: string | null) => void;
  onMove: (id: string, point: GardenPoint) => void;
}

type Gesture =
  | { kind: "brush"; pointer: number; id: string; last: GardenPoint; tip: GardenPoint; pending: GardenPoint[]; inside: boolean }
  | { kind: "move"; pointer: number; id: string; offset: GardenPoint; height: number };

export function GardenInteraction(props: InteractionProps & {
  terrainRef: RefObject<Mesh | null>;
  objectsRef: RefObject<Group | null>;
  onHover: (point: GardenPoint | null) => void;
  onBusy: (busy: boolean) => void;
}) {
  const { camera, gl, raycaster } = useThree();
  const latest = useRef(props);
  latest.current = props;
  const active = useRef<Gesture | null>(null);
  const elapsed = useRef(0);
  const flushRef = useRef<(seconds: number) => void>(() => {});
  const interruptRef = useRef<() => void>(() => {});

  useEffect(() => {
    const canvas = gl.domElement;
    const touches = new Set<number>();
    const ndc = new Vector2();
    const point3 = new Vector3();
    const plane = new Plane(new Vector3(0, 1, 0), 0);
    let spacePressed = false;

    const setRay = (event: PointerEvent) => {
      const bounds = canvas.getBoundingClientRect();
      ndc.set((event.clientX - bounds.left) / bounds.width * 2 - 1, -(event.clientY - bounds.top) / bounds.height * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
    };
    const pickGround = (): GardenPoint | null => {
      const terrain = latest.current.terrainRef.current;
      const hit = terrain ? raycaster.intersectObject(terrain, false)[0] : null;
      return hit ? { x: hit.point.x + CENTER, z: hit.point.z + CENTER } : null;
    };
    const pickObject = () => {
      const objects = latest.current.objectsRef.current;
      if (!objects) return null;
      const hit = raycaster.intersectObjects(objects.children, true)[0];
      let object: Object3D | null = hit?.object ?? null;
      while (object && object !== objects) {
        if (typeof object.userData.objectId === "string") return object.userData.objectId as string;
        object = object.parent;
      }
      return null;
    };
    const flush = (seconds: number, finishRake = false) => {
      const gesture = active.current;
      if (gesture?.kind !== "brush" || !gesture.inside) return;
      const pending = gesture.pending.splice(0);
      const tool = latest.current.tool;
      if (finishRake && tool.kind === "rake" &&
          distance(pending.at(-1) ?? gesture.last, gesture.tip) > 0.000001) {
        pending.push(gesture.tip);
      }
      if (!pending.length && tool.kind !== "height" && tool.kind !== "smooth") return;
      if (!pending.length) pending.push(gesture.last);
      pending.forEach((point, index) => {
        const accepted = latest.current.onBrush(gesture.last, point, seconds / pending.length, gesture.id,
          finishRake && tool.kind === "rake" && index === pending.length - 1);
        // Keep rejected rake movement relative to the last accepted sample.
        if (accepted || tool.kind !== "rake") gesture.last = point;
      });
    };
    flushRef.current = flush;
    const end = (cancel = false) => {
      const gesture = active.current;
      if (!gesture) return;
      if (!cancel) flush(Math.max(0.016, elapsed.current), true);
      active.current = null;
      elapsed.current = 0;
      if (canvas.hasPointerCapture(gesture.pointer)) canvas.releasePointerCapture(gesture.pointer);
      if (cancel) latest.current.onCancel();
      else latest.current.onFinish();
      latest.current.onBusy(false);
    };
    interruptRef.current = () => end(true);
    const down = (event: PointerEvent) => {
      if (event.pointerType === "touch") {
        touches.add(event.pointerId);
        if (touches.size > 1) { end(true); return; }
      }
      if (event.button !== 0 || active.current || latest.current.mode === "orbit") return;
      if (spacePressed && event.pointerType !== "touch") return;
      setRay(event);
      const point = pickGround();
      const { mode, tool, garden } = latest.current;
      if (mode === "select") {
        const id = pickObject();
        latest.current.onSelect(id);
        const item = garden.objects.find((object) => object.id === id);
        if (!item) return;
        if (event.pointerType !== "touch") event.stopImmediatePropagation();
        plane.constant = -heightAt(garden, item);
        const intersection = raycaster.ray.intersectPlane(plane, point3);
        const anchor = point ?? (intersection ? { x: intersection.x + CENTER, z: intersection.z + CENTER } : item);
        latest.current.onBegin();
        active.current = {
          kind: "move", pointer: event.pointerId, id: item.id,
          offset: { x: item.x - anchor.x, z: item.z - anchor.z }, height: heightAt(garden, item),
        };
      } else {
        if (!point || !inGarden(point, garden.size)) return;
        if (event.pointerType !== "touch") event.stopImmediatePropagation();
        if (tool.kind === "place") {
          latest.current.onPlace(point);
          latest.current.onHover(null);
          return;
        }
        latest.current.onBegin();
        active.current = { kind: "brush", pointer: event.pointerId, id: newId(), last: point, tip: point, pending: [point], inside: true };
        flush(0.04);
      }
      elapsed.current = 0;
      canvas.setPointerCapture(event.pointerId);
      latest.current.onBusy(true);
      event.preventDefault();
    };
    const move = (event: PointerEvent) => {
      if (touches.size > 1) return;
      setRay(event);
      const point = pickGround();
      latest.current.onHover(point);
      const gesture = active.current;
      if (!gesture || gesture.pointer !== event.pointerId) return;
      if (gesture.kind === "brush") {
        if (!point) {
          flush(0.016, true);
          gesture.inside = false;
          // Re-entry must start a new subpath, not bridge across empty space.
          gesture.id = newId();
          return;
        }
        if (!gesture.inside) gesture.last = point;
        gesture.tip = point;
        gesture.inside = true;
        if (distance(gesture.pending.at(-1) ?? gesture.last, point) > 0.01) gesture.pending.push(point);
      } else {
        plane.constant = -gesture.height;
        const projected = raycaster.ray.intersectPlane(plane, point3);
        const anchor = point ?? (projected ? { x: projected.x + CENTER, z: projected.z + CENTER } : null);
        if (anchor) latest.current.onMove(gesture.id, { x: anchor.x + gesture.offset.x, z: anchor.z + gesture.offset.z });
      }
    };
    const up = (event: PointerEvent) => {
      touches.delete(event.pointerId);
      const gesture = active.current;
      if (gesture?.pointer === event.pointerId) {
        if (gesture.kind === "brush" && gesture.inside && latest.current.tool.kind === "rake") {
          setRay(event);
          const point = pickGround();
          if (point) gesture.tip = point;
        }
        end();
      }
      if (event.pointerType === "touch") latest.current.onHover(null);
    };
    const cancel = (event: PointerEvent) => {
      touches.delete(event.pointerId);
      if (active.current?.pointer === event.pointerId) end(true);
      latest.current.onHover(null);
    };
    const blur = () => { spacePressed = false; end(); touches.clear(); latest.current.onHover(null); };
    const leave = () => { if (!active.current) latest.current.onHover(null); };
    const isTextInput = (target: EventTarget | null) =>
      target instanceof HTMLElement &&
      (target.matches("input, textarea, select") || target.isContentEditable);
    const key = (event: KeyboardEvent) => {
      if (event.code === "Space" && !isTextInput(event.target)) {
        event.preventDefault();
        spacePressed = true;
      }
      if (event.key === "Escape") { end(true); latest.current.onHover(null); }
    };
    const keyUp = (event: KeyboardEvent) => {
      if (event.code === "Space" && !isTextInput(event.target)) {
        event.preventDefault();
        spacePressed = false;
      }
    };
    const lostCapture = () => end();
    const wheel = (event: WheelEvent) => {
      if (!active.current) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    const visibility = () => { if (document.hidden) { spacePressed = false; blur(); } };
    canvas.addEventListener("pointerdown", down, true);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerleave", leave);
    canvas.addEventListener("lostpointercapture", lostCapture);
    canvas.addEventListener("wheel", wheel, { capture: true, passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("blur", blur);
    window.addEventListener("keydown", key);
    window.addEventListener("keyup", keyUp);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      canvas.removeEventListener("pointerdown", down, true);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerleave", leave);
      canvas.removeEventListener("lostpointercapture", lostCapture);
      canvas.removeEventListener("wheel", wheel, true);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("blur", blur);
      window.removeEventListener("keydown", key);
      window.removeEventListener("keyup", keyUp);
      document.removeEventListener("visibilitychange", visibility);
      flushRef.current = () => {};
      interruptRef.current = () => {};
    };
  }, [camera, gl, raycaster]);

  useEffect(() => { interruptRef.current(); }, [props.mode, props.tool, props.garden.size]);

  useFrame((_, delta) => {
    if (!active.current) return;
    elapsed.current += delta;
    if (elapsed.current < 1 / 30) return;
    flushRef.current(Math.min(0.25, elapsed.current));
    elapsed.current = 0;
  });
  return null;
}
