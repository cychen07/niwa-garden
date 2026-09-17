import {
  Camera,
  CloudRain,
  CloudSun,
  Grid2X2,
  MousePointer2,
  Orbit,
  Paintbrush,
  Redo2,
  RotateCcw,
  RotateCw,
  Scaling,
  Scan,
  Save,
  Snowflake,
  Sun,
  Trash2,
  Undo2,
  X,
  ZoomIn,
  ZoomOut,
  BookOpen,
  LayoutGrid,
  GalleryHorizontalEnd,
  Send,
  History,
  Clock3,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { GameScene } from "./game/GameScene";
import { GardenSizeControl } from "./GardenSizeControl";
import { AmbientMusic } from "./AmbientMusic";
import { TemplateReference } from "./TemplateReference";
import {
  BuildCatalog,
  defaultTools,
  groupForObject,
  type BuildGroup,
} from "./BuildCatalog";
import type { CameraActionKind } from "./game/camera";
import {
  SAVE_KEY,
  createInitialGarden,
  applyBrush,
  newId,
  resizeGarden,
  transformObject,
  type EditorMode,
  type EnvironmentState,
  type GardenPoint,
  type GardenObject,
  type Tool,
} from "./game/model";
import { useGardenHistory } from "./game/useGardenHistory";
import { blankGarden, templates } from "./game/templates";
import { Library, type LibraryTab } from "./community/Library";
import { PublishDialog } from "./community/PublishDialog";
import { useDraft, RECOVERY_KEY, DRAFT_KEY } from "./community/useDraft";
import { duration } from "./community/client";
import { parseGarden } from "./game/model";
import { Onboarding, shouldShowOnboarding } from "./Onboarding";
import "./community/studio.css";

const seasons: { value: EnvironmentState["season"]; label: string }[] = [
  { value: "spring", label: "春" },
  { value: "summer", label: "夏" },
  { value: "autumn", label: "秋" },
  { value: "winter", label: "冬" },
];

const weatherOptions: {
  value: EnvironmentState["weather"];
  label: string;
  icon: LucideIcon;
}[] = [
  { value: "clear", label: "晴", icon: CloudSun },
  { value: "rain", label: "雨", icon: CloudRain },
  { value: "snow", label: "雪", icon: Snowflake },
];

export default function App() {
  const { garden, current: gardenRef, begin, finish, cancel, update, undo, redo, replace, canUndo, canRedo } = useGardenHistory();
  const [group, setGroup] = useState<BuildGroup>("ground");
  const [tool, setTool] = useState<Tool>(defaultTools.ground);
  const [catalogOpen, setCatalogOpen] = useState(
    () => !window.matchMedia("(max-width: 920px)").matches,
  );
  const [mode, setMode] = useState<EditorMode>("orbit");
  const [diameter, setDiameter] = useState(1.2);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = garden.objects.find((object) => object.id === selectedId);
  const [placement, setPlacement] = useState({ rotation: 0, scale: 1 });
  const [cameraAction, setCameraAction] = useState<{ id: number; kind: CameraActionKind }>({ id: 0, kind: "reset" });
  const sliderActive = useRef(false);
  const [environment, setEnvironment] = useState<EnvironmentState>({
    hour: 15,
    season: "autumn",
    weather: "clear",
  });
  const [environmentOpen, setEnvironmentOpen] = useState(false);
  const [sizeActive, setSizeActive] = useState(false);
  const [library, setLibrary] = useState<LibraryTab | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [onboarding, setOnboarding] = useState(shouldShowOnboarding);
  const draft = useDraft(garden, !library && !publishing && !sizeActive && !onboarding);
  const activeTemplate = templates.find((template) => template.id === draft.meta.templateId) ?? null;
  const [toast, setToast] = useState("");
  const toastTimer = useRef<number | null>(null);

  const notify = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), 1800);
  }, []);

  useEffect(
    () => () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    },
    [],
  );

  useEffect(() => {
    const endSlider = () => {
      if (sliderActive.current) { finish(); sliderActive.current = false; }
    };
    const cancelSlider = () => {
      if (sliderActive.current) { cancel(); sliderActive.current = false; }
    };
    const keyboard = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement)?.closest("dialog[open]")) return;
      if (event.key === "Escape") {
        cancelSlider();
        setSelectedId(null);
        setEnvironmentOpen(false);
        setCatalogOpen(false);
        setMode("orbit");
      }
      if ((event.target as HTMLElement)?.matches("input, textarea")) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo(); else undo();
      }
    };
    window.addEventListener("pointerup", endSlider);
    window.addEventListener("pointercancel", cancelSlider);
    window.addEventListener("blur", endSlider);
    window.addEventListener("keydown", keyboard);
    return () => {
      window.removeEventListener("pointerup", endSlider);
      window.removeEventListener("pointercancel", cancelSlider);
      window.removeEventListener("blur", endSlider);
      window.removeEventListener("keydown", keyboard);
    };
  }, [finish, cancel, undo, redo]);

  const brush = (from: GardenPoint, to: GardenPoint, seconds: number, id: string, finalSample = false) => {
    const previous = gardenRef.current;
    update((state) => applyBrush(state, from, to, tool, diameter, seconds, id, finalSample));
    return gardenRef.current !== previous;
  };
  const place = (point: GardenPoint) => {
    if (tool.kind !== "place") return;
    if (gardenRef.current.objects.length >= 500) { notify("庭院最多可放置500件物品"); return; }
    const object: GardenObject = { id: newId(), kind: tool.value, ...point, ...placement };
    update((state) => ({ ...state, objects: [...state.objects, object] }));
    setSelectedId(object.id);
    setMode("select");
    setCatalogOpen(false);
  };
  const move = (id: string, point: GardenPoint) => {
    update((state) => transformObject(state, id, point));
  };
  const chooseTool = (next: Tool) => {
    finish();
    setTool(next);
    setMode("build");
    setSelectedId(null);
    setEnvironmentOpen(false);
    if (window.matchMedia("(max-width: 920px)").matches) setCatalogOpen(false);
  };

  const chooseGroup = (nextGroup: BuildGroup) => {
    finish();
    setEnvironmentOpen(false);
    if (nextGroup === group) {
      setCatalogOpen((open) => !open);
      return;
    }
    setGroup(nextGroup);
    setMode("orbit");
    setSelectedId(null);
    setCatalogOpen(true);
  };

  const applySize = (size: number) => {
    finish();
    update((state) => resizeGarden(state, size));
    setSelectedId(null);
  };
  const onSizeActive = useCallback((active: boolean) => {
    setSizeActive(active);
    if (active) { finish(); setEnvironmentOpen(false); setCatalogOpen(false); }
  }, [finish]);
  const save = () => {
    finish();
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(gardenRef.current));
      draft.persist();
      notify("庭院已保存");
    } catch {
      notify("保存失败，浏览器存储不可用或已满");
    }
  };

  const reset = () => {
    finish();
    update(() => createInitialGarden());
    setSelectedId(null);
    notify("已恢复初始庭院");
  };

  const capture = () => {
    const canvas = document.querySelector<HTMLCanvasElement>(".garden-canvas canvas");
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const link = document.createElement("a");
      link.download = `niwa-${new Date().toISOString().slice(0, 10)}.png`;
      link.href = URL.createObjectURL(blob);
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      notify("庭院图片已导出");
    }, "image/png");
  };

  const hourLabel = `${String(Math.floor(environment.hour)).padStart(2, "0")}:${environment.hour % 1 ? "30" : "00"}`;
  const transformed = mode === "select" ? selected : tool.kind === "place" ? placement : null;
  const transform = (patch: Partial<typeof placement>) => {
    if (mode === "select" && selected) update((state) => transformObject(state, selected.id, patch));
    else setPlacement((value) => ({ ...value, ...patch }));
  };
  const sliderEvents = {
    onPointerDown: () => { begin(); sliderActive.current = true; },
    onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) {
        begin(); sliderActive.current = true;
      }
    },
    onKeyUp: () => { finish(); sliderActive.current = false; },
    onBlur: () => { finish(); sliderActive.current = false; },
  };

  return (
    <main className={`app-shell season-${environment.season} mode-${mode}${catalogOpen ? " catalog-open" : ""}${sizeActive ? " size-adjusting" : ""}`}>
      <div className="editor-scene">
      <GameScene
        garden={garden}
        environment={environment}
        tool={tool}
        mode={mode}
        diameter={diameter}
        selectedId={selectedId}
        placement={placement}
        cameraAction={cameraAction}
        onBegin={begin}
        onFinish={finish}
        onCancel={cancel}
        onBrush={brush}
        onPlace={place}
        onSelect={setSelectedId}
        onMove={move}
        still={library !== null || onboarding}
        readOnly={sizeActive || publishing || onboarding}
      />
      </div>

      <header className="topbar">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">
            庭
          </span>
          <div>
            <h1>庭景</h1>
            <p>NIWA STUDY</p>
          </div>
        </div>

        <div className="project-controls">
          <div className="project-title">
            <span title={draft.meta.title || "無住庵"}>{draft.meta.title || "無住庵"}</span>
            <i aria-hidden="true" />
            <small>{garden.objects.length} 景</small>
            <small>{garden.size} × {garden.size}</small>
          </div>
          <GardenSizeControl garden={garden} disabled={!!library || publishing}
            onResize={applySize} onActiveChange={onSizeActive} />
        </div>

        <nav className="top-actions" aria-label="作品操作">
          <button type="button" title="撤销" aria-label="撤销" onClick={undo} disabled={!canUndo}>
            <Undo2 />
          </button>
          <button type="button" title="重做" aria-label="重做" onClick={redo} disabled={!canRedo}>
            <Redo2 />
          </button>
          <span className="action-divider" />
          <button type="button" title="恢复初始庭院" aria-label="恢复初始庭院" onClick={reset}>
            <RotateCcw />
          </button>
          <button type="button" title="保存庭院" aria-label="保存庭院" onClick={save}>
            <Save />
          </button>
          <button type="button" title="导出图片" aria-label="导出图片" onClick={capture}>
            <Camera />
          </button>
        </nav>
      </header>

      <nav className="view-tools" aria-label="操作模式与视角">
        <div className="mode-buttons">
          {([
            { value: "build", label: "建造模式", title: "建造模式", icon: Paintbrush },
            { value: "select", label: "选取与移动", title: "选取与移动", icon: MousePointer2 },
            { value: "orbit", label: "旋转视角", title: "旋转视角（空格拖动或中键）", icon: Orbit },
          ] as const).map(({ value, label, title, icon: Icon }) => (
            <button key={value} type="button" title={title} aria-label={label} aria-pressed={mode === value}
              className={mode === value ? "active" : ""} onClick={() => { finish(); setMode(value); }}>
              <Icon />
            </button>
          ))}
        </div>
        <span className="action-divider" />
        {([
          { kind: "out", label: "缩小视角", icon: ZoomOut },
          { kind: "in", label: "放大视角", icon: ZoomIn },
          { kind: "top", label: "正俯视", icon: Grid2X2 },
          { kind: "reset", label: "复位视角", icon: Scan },
        ] as const).map(({ kind, label, icon: Icon }) => (
          <button key={kind} type="button" title={label} aria-label={label}
            onClick={() => setCameraAction((action) => ({ id: action.id + 1, kind }))}><Icon /></button>
        ))}
      </nav>

      <nav className="creation-nav" aria-label="创作与作品">
        {([{ id: "catalog", name: "物品目录", Icon: LayoutGrid }, { id: "templates", name: "庭院范例", Icon: BookOpen },
          { id: "gallery", name: "作品广场", Icon: GalleryHorizontalEnd }] as const).map(({ id, name, Icon }) =>
          <button key={id} title={name} aria-label={name} onClick={() => {
            finish(); draft.persist(); setEnvironmentOpen(false); setLibrary(id);
          }}><Icon /><span>{name}</span></button>)}
        <button title="发布作品" aria-label="发布作品" onClick={() => {
          finish(); setSelectedId(null); setMode("orbit"); setEnvironmentOpen(false); setPublishing(true);
        }}><Send /><span>发布作品</span></button>
        <button title="恢复上一份草稿" aria-label="恢复上一份草稿" onClick={() => {
          try {
            const previous = JSON.parse(localStorage.getItem(RECOVERY_KEY) ?? "null");
            const restored = parseGarden(previous?.garden);
            if (!restored || !previous.meta) { notify("暂无上一份草稿"); return; }
            if (!window.confirm("切换到上一份草稿？当前草稿也会保留，可再次切换。")) return;
            localStorage.setItem(RECOVERY_KEY, JSON.stringify({ garden: gardenRef.current, meta: draft.meta }));
            localStorage.setItem(DRAFT_KEY, JSON.stringify(previous));
            replace(restored); draft.setMeta(previous.meta); setSelectedId(null);
            notify("已恢复上一份草稿");
          } catch { notify("草稿恢复失败，当前庭院未变更"); }
        }}><History /></button>
      </nav>
      <div className="creation-clock"><Clock3 /><span>{duration(draft.meta.seconds)}</span>
        {draft.storageError && <span role="status">草稿未能自动保存</span>}</div>

      {activeTemplate && !library && <TemplateReference template={activeTemplate} />}

      <BuildCatalog
        group={group}
        open={catalogOpen}
        tool={tool}
        onGroup={chooseGroup}
        onTool={chooseTool}
        onClose={() => setCatalogOpen(false)}
      />

      {mode === "build" && tool.kind !== "place" && (
        <section className="tool-settings" aria-label="画笔设置">
          <Paintbrush aria-hidden="true" />
          <label htmlFor="brush-size">直径</label>
          <input id="brush-size" aria-label="画笔直径" type="range" min="0.4" max="4" step="0.1"
            value={diameter} onChange={(event) => setDiameter(Number(event.target.value))} />
          <output htmlFor="brush-size">{diameter.toFixed(1)}</output>
        </section>
      )}
      {transformed && mode !== "orbit" && (
        <section className="tool-settings transform-settings" aria-label="物件调整">
          <label title="旋转">
            <RotateCw aria-hidden="true" />
            <span>方向</span>
            <input type="range" aria-label="物件旋转" min="0" max="315" step="45"
              value={Math.round(((transformed.rotation * 180 / Math.PI) % 360 + 360) % 360)}
              {...sliderEvents} onChange={(event) => transform({ rotation: Number(event.target.value) * Math.PI / 180 })} />
            <output>{Math.round(((transformed.rotation * 180 / Math.PI) % 360 + 360) % 360)}°</output>
          </label>
          <label title="缩放">
            <Scaling aria-hidden="true" />
            <span>大小</span>
            <input type="range" aria-label="物件缩放" min="0.4" max="2" step="0.05"
              value={transformed.scale} {...sliderEvents} onChange={(event) => transform({ scale: Number(event.target.value) })} />
            <output>{transformed.scale.toFixed(2)}×</output>
          </label>
          {selected && mode === "select" && <button type="button" aria-label="删除选中物件" title="删除选中物件"
            onClick={() => {
              update((state) => ({ ...state, objects: state.objects.filter((object) => object.id !== selected.id) }));
              setSelectedId(null);
            }}><Trash2 /></button>}
        </section>
      )}

      <button
        type="button"
        className={`environment-trigger ${environmentOpen ? "active" : ""}`}
        aria-label="光景设置"
        title="光景设置"
        onClick={() => setEnvironmentOpen((open) => !open)}
      >
        <Sun />
        <span>{hourLabel}</span>
      </button>

      <AmbientMusic />

      <aside className={`environment-panel ${environmentOpen ? "open" : ""}`} aria-hidden={!environmentOpen} inert={!environmentOpen}>
        <div className="panel-header">
          <div>
            <p>光景</p>
            <strong>{hourLabel}</strong>
          </div>
          <button type="button" title="关闭" aria-label="关闭光景设置" onClick={() => setEnvironmentOpen(false)}>
            <X />
          </button>
        </div>

        <label className="time-control">
          <span>时刻</span>
          <input
            type="range"
            min="0"
            max="23.5"
            step="0.5"
            value={environment.hour}
            onChange={(event) =>
              setEnvironment((current) => ({ ...current, hour: Number(event.target.value) }))
            }
          />
        </label>

        <div className="control-label">季节</div>
        <div className="segmented season-control">
          {seasons.map((item) => (
            <button
              key={item.value}
              type="button"
              className={environment.season === item.value ? "active" : ""}
              aria-pressed={environment.season === item.value}
              onClick={() => setEnvironment((current) => ({ ...current, season: item.value }))}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="control-label">天候</div>
        <div className="segmented weather-control">
          {weatherOptions.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.value}
                type="button"
                className={environment.weather === item.value ? "active" : ""}
                title={item.label}
                aria-label={item.label}
                aria-pressed={environment.weather === item.value}
                onClick={() => setEnvironment((current) => ({ ...current, weather: item.value }))}
              >
                <Icon />
              </button>
            );
          })}
        </div>
      </aside>

      {library && <Library initialTab={library} onClose={() => setLibrary(null)} onChoose={(kind) => {
        setGroup(groupForObject(kind));
        chooseTool({ kind: "place", value: kind });
        setCatalogOpen(!window.matchMedia("(max-width: 920px)").matches);
        setLibrary(null);
      }} onChallenge={(template) => {
        const next = blankGarden(template.garden.size);
        draft.start(next, template.id);
        replace(next); setSelectedId(null); setEnvironment(template.environment);
        setGroup("ground"); chooseTool(defaultTools.ground);
        setCatalogOpen(!window.matchMedia("(max-width: 920px)").matches);
        setLibrary(null);
        setCameraAction((action) => ({ id: action.id + 1, kind: "reset" }));
        notify(`开始试搭：${template.name}`);
      }} />}
      {publishing && <PublishDialog garden={garden} environment={environment} meta={draft.meta}
        onMeta={draft.setMeta} onClose={() => setPublishing(false)}
        onGallery={() => { setPublishing(false); setLibrary("gallery"); }} />}
      {onboarding && <Onboarding onClose={() => setOnboarding(false)} />}

      <div className={`toast ${toast ? "show" : ""}`} role="status">
        {toast}
      </div>
    </main>
  );
}
