import { useEffect, useRef, useState } from "react";
import { Scan, ZoomIn, ZoomOut } from "lucide-react";
import { GameScene } from "../game/GameScene";
import type { EnvironmentState, GardenPoint, GardenState } from "../game/model";

const noop = () => {};
const defaultEnvironment: EnvironmentState = { hour: 14, season: "spring", weather: "clear" };
export function GardenPreview({ garden, environment = defaultEnvironment, still = false, focus }: {
  garden: GardenState; environment?: EnvironmentState; still?: boolean; focus?: GardenPoint | null;
}) {
  const [action, setAction] = useState<{ id: number; kind: "reset" | "in" | "out" }>({ id: 0, kind: "reset" });
  return <div className={still ? "scene-thumb" : "preview-stage"}>
    <GameScene garden={garden} environment={environment} tool={{ kind: "rake" }} mode="orbit" diameter={1}
      selectedId={null} placement={{ rotation: 0, scale: 1 }} cameraAction={action} readOnly compact still={still} focus={focus}
      onBegin={noop} onFinish={noop} onCancel={noop} onBrush={() => false} onPlace={noop} onSelect={noop} onMove={noop} />
    {!still && <nav className="preview-controls" aria-label="观摩视角">
      {([{ kind: "out", label: "缩小范例", Icon: ZoomOut }, { kind: "in", label: "放大范例", Icon: ZoomIn },
        { kind: "reset", label: "复位范例", Icon: Scan }] as const).map(({ kind, label, Icon }) =>
        <button key={kind} title={label} aria-label={label} onClick={() => setAction((value) => ({ id: value.id + 1, kind }))}><Icon /></button>)}
    </nav>}
  </div>;
}
export function SceneThumb({ garden, environment }: { garden: GardenState; environment: EnvironmentState }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { rootMargin: "20px" });
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return <div ref={ref} className="thumb-viewport" aria-hidden="true">
    {visible && <GardenPreview garden={garden} environment={environment} still />}
  </div>;
}
