import { Check, Maximize2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { displacedObjectCount, MAX_GARDEN_SIZE, MIN_GARDEN_SIZE, type GardenState } from "./game/model";

const rangeKeys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"];

export function GardenSizeControl({ garden, disabled, onResize, onActiveChange }: {
  garden: GardenState;
  disabled: boolean;
  onResize: (size: number) => void;
  onActiveChange: (active: boolean) => void;
}) {
  const [size, setSize] = useState(garden.size);
  const [phase, setPhase] = useState<"idle" | "dragging" | "pending">("idle");
  const input = useRef<HTMLInputElement>(null);
  const pointer = useRef<number | null>(null);
  const dragging = useRef(false);
  const current = useRef(size);
  current.current = size;
  const actual = useRef(garden.size);
  actual.current = garden.size;

  const dismiss = () => {
    dragging.current = false;
    pointer.current = null;
    current.current = actual.current;
    setSize(actual.current);
    setPhase("idle");
  };
  useEffect(() => {
    dismiss();
  }, [garden.size, disabled]);
  useEffect(() => {
    onActiveChange(phase !== "idle");
  }, [phase, onActiveChange]);
  useEffect(() => () => onActiveChange(false), [onActiveChange]);
  useEffect(() => {
    const finish = (event?: Event) => {
      if (!dragging.current || (event instanceof PointerEvent && pointer.current !== event.pointerId)) return;
      dragging.current = false;
      pointer.current = null;
      setPhase(current.current === actual.current ? "idle" : "pending");
    };
    const cancel = (event: PointerEvent) => {
      if (pointer.current === event.pointerId) dismiss();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismiss();
    };
    const hide = () => { if (document.hidden) finish(); };
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("blur", finish);
    window.addEventListener("keydown", escape);
    document.addEventListener("visibilitychange", hide);
    return () => {
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("blur", finish);
      window.removeEventListener("keydown", escape);
      document.removeEventListener("visibilitychange", hide);
    };
  }, []);

  const shrinking = size < garden.size;
  const displaced = shrinking ? displacedObjectCount(garden, size) : 0;
  return <section className="garden-size-control" aria-label="庭院尺寸调整" data-phase={phase}>
    <div className="size-rail">
      <Maximize2 aria-hidden="true" />
      <input ref={input} id="garden-size" aria-label="庭院尺寸" title="庭院尺寸" type="range"
        min={MIN_GARDEN_SIZE} max={MAX_GARDEN_SIZE} step="2" value={size} disabled={disabled}
        aria-valuetext={`${size}乘${size}格`}
        aria-describedby={phase !== "idle" ? "garden-size-feedback" : undefined}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          pointer.current = event.pointerId;
          dragging.current = true;
          setPhase("dragging");
        }}
        onChange={(event) => {
          const next = Number(event.target.value);
          current.current = next;
          setSize(next);
          if (!dragging.current) setPhase(next === garden.size ? "idle" : "pending");
        }}
        onKeyDown={(event) => {
          if (rangeKeys.includes(event.key)) { dragging.current = true; setPhase("dragging"); }
          if (event.key === "Enter" && phase === "pending") {
            event.preventDefault();
            onResize(size);
            setPhase("idle");
          }
        }}
        onKeyUp={(event) => {
          if (!rangeKeys.includes(event.key)) return;
          dragging.current = false;
          setPhase(current.current === garden.size ? "idle" : "pending");
        }}
        onBlur={() => {
          if (pointer.current !== null) return;
          dragging.current = false;
          setPhase(current.current === garden.size ? "idle" : "pending");
        }}
      />
    </div>
    {phase !== "idle" && <div className="size-feedback" id="garden-size-feedback">
      <div className="size-feedback-heading" aria-live="polite">
        <output htmlFor="garden-size">{size} × {size}<small> 格</small></output>
        <span>共 {size * size} 格</span>
      </div>
      <p className="size-impact">
        {shrinking ? `裁去外围 ${garden.size * garden.size - size * size} 格地形和砂纹。` :
          size > garden.size ? `新增 ${size * size - garden.size * garden.size} 格草地，物品位置不变。` : "尺寸未改变。"}
        {shrinking && <><br />{displaced ? `${displaced} 件物品将移回院内，不会删除。` : "物品均保留在院内。"}</>}
      </p>
      <div className="size-confirmation" style={{ visibility: phase === "pending" ? "visible" : "hidden" }}
        inert={phase !== "pending"} aria-hidden={phase !== "pending"}>
        <button type="button" title="取消尺寸调整" aria-label="取消尺寸调整" onClick={() => { dismiss(); input.current?.focus(); }}>
          <X /><span>取消</span>
        </button>
        <button type="button" className="size-confirm" title="确认尺寸调整" aria-label="确认尺寸调整"
          onClick={() => {
            onResize(size);
            setPhase("idle");
            input.current?.focus();
          }}><Check /><span>确认</span></button>
      </div>
    </div>}
  </section>;
}
