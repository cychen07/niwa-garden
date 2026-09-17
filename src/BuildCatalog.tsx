import { Canvas } from "@react-three/fiber";
import {
  ChevronDown,
  ChevronUp,
  CircleDot,
  Eraser,
  Fence,
  Flower2,
  Gem,
  House,
  Lamp,
  Landmark,
  Leaf,
  Mountain,
  Paintbrush,
  Sofa,
  Sprout,
  Trees,
  Waves,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { catalog, type Category } from "./game/catalog";
import { GardenObjectMesh } from "./game/GameScene";
import type { ObjectKind, Tool } from "./game/model";

export type BuildGroup = "ground" | "terrain" | "plants" | "structures" | "decor";

interface BuildItem {
  label: string;
  detail: string;
  section: string;
  tool: Tool;
  icon?: LucideIcon;
  swatch?: string;
}

export const buildGroups: {
  id: BuildGroup;
  label: string;
  description: string;
  icon: LucideIcon;
}[] = [
  { id: "ground", label: "地面", description: "铺设材质与砂纹", icon: Paintbrush },
  { id: "terrain", label: "地形", description: "塑造起伏与清理", icon: Mountain },
  { id: "plants", label: "植栽", description: "乔木与花草", icon: Trees },
  { id: "structures", label: "构筑", description: "道路、围合与建筑", icon: House },
  { id: "decor", label: "摆件", description: "石景、灯饰与生活", icon: Gem },
];

const categoryIcons: Record<Category, LucideIcon> = {
  "全部": Gem,
  "乔木": Trees,
  "花草": Flower2,
  "石与水": Gem,
  "道路围合": Fence,
  "建筑": Landmark,
  "灯饰": Lamp,
  "庭院生活": Sofa,
};

const objectGroup: Partial<Record<Category, BuildGroup>> = {
  "乔木": "plants",
  "花草": "plants",
  "道路围合": "structures",
  "建筑": "structures",
  "石与水": "decor",
  "灯饰": "decor",
  "庭院生活": "decor",
};

const manualItems: Partial<Record<BuildGroup, BuildItem[]>> = {
  ground: [
    { label: "草地", detail: "庭院的基础草地", section: "地面", tool: { kind: "surface", value: "grass" }, swatch: "#70804d" },
    { label: "苔藓", detail: "阴湿、柔软的绿色地被", section: "地面", tool: { kind: "surface", value: "moss" }, swatch: "#496447" },
    { label: "白砂", detail: "枯山水常用的浅色砂地", section: "地面", tool: { kind: "surface", value: "sand" }, swatch: "#c8b98c" },
    { label: "池水", detail: "绘制池塘与曲折水岸", section: "地面", tool: { kind: "surface", value: "water" }, swatch: "#477f8a" },
    { label: "砂纹", detail: "在白砂上拖出连续纹路", section: "地面", tool: { kind: "rake" }, icon: Waves },
  ],
  terrain: [
    { label: "抬高", detail: "按住并拖动以抬高地形", section: "地形", tool: { kind: "height", delta: 1 }, icon: ChevronUp },
    { label: "降低", detail: "按住并拖动以降低地形", section: "地形", tool: { kind: "height", delta: -1 }, icon: ChevronDown },
    { label: "平滑", detail: "柔化突兀的地形起伏", section: "地形", tool: { kind: "smooth" }, icon: Waves },
    { label: "移除物件", detail: "拖过庭院，移除范围内的物件", section: "地形", tool: { kind: "erase" }, icon: Eraser },
  ],
};

const objectItems = catalog.map((item): BuildItem & { group: BuildGroup } => ({
  label: item.name,
  detail: item.detail,
  section: item.category,
  tool: { kind: "place", value: item.kind },
  icon: categoryIcons[item.category],
  group: objectGroup[item.category] ?? "decor",
}));

const groupItems = (group: BuildGroup) =>
  manualItems[group] ?? objectItems.filter((item) => item.group === group);

export const defaultTools: Record<BuildGroup, Tool> = {
  ground: groupItems("ground")[0].tool,
  terrain: groupItems("terrain")[0].tool,
  plants: groupItems("plants")[0].tool,
  structures: groupItems("structures")[0].tool,
  decor: groupItems("decor")[0].tool,
};

export function groupForObject(kind: ObjectKind): BuildGroup {
  const category = catalog.find((item) => item.kind === kind)?.category;
  return category ? objectGroup[category] ?? "decor" : "decor";
}

const sameTool = (a: Tool, b: Tool) => JSON.stringify(a) === JSON.stringify(b);

const compactScale: Partial<Record<ObjectKind, number>> = {
  pavilion: 0.62,
  pergola: 0.68,
  torii: 0.72,
  wall: 0.72,
  gate: 0.76,
  bridge: 0.78,
  stonebridge: 0.78,
  wooddeck: 0.72,
  willow: 0.75,
  cherry: 0.8,
  umbrella: 0.8,
  groundlamp: 1.45,
  iris: 1.35,
  lotus: 1.35,
  cushion: 1.35,
  pebble: 1.25,
};

function ObjectPreview({ kind }: { kind: ObjectKind }) {
  return (
    <div className="catalog-object-preview" aria-hidden="true">
      <Canvas
        orthographic
        frameloop="always"
        dpr={[1, 1.5]}
        camera={{ position: [3.8, 3.1, 4.4], zoom: 34, near: 0.1, far: 30 }}
      >
        <ambientLight intensity={1.6} />
        <directionalLight position={[4, 6, 3]} intensity={2.2} />
        <GardenObjectMesh
          item={{
            id: "catalog-preview",
            kind,
            x: 5,
            z: 5,
            rotation: -0.45,
            scale: compactScale[kind] ?? 1,
          }}
          y={-0.5}
          season="autumn"
          night={false}
        />
      </Canvas>
    </div>
  );
}

export function BuildCatalog({
  group,
  open,
  tool,
  onGroup,
  onTool,
  onClose,
}: {
  group: BuildGroup;
  open: boolean;
  tool: Tool;
  onGroup: (group: BuildGroup) => void;
  onTool: (tool: Tool) => void;
  onClose: () => void;
}) {
  const items = useMemo(() => groupItems(group), [group]);
  const sections = useMemo(() => [...new Set(items.map((item) => item.section))], [items]);
  const [sectionByGroup, setSectionByGroup] = useState<Record<BuildGroup, string>>({
    ground: "地面",
    terrain: "地形",
    plants: "乔木",
    structures: "道路围合",
    decor: "石与水",
  });
  const section = sections.includes(sectionByGroup[group]) ? sectionByGroup[group] : sections[0];
  const activeItem = items.find((item) => sameTool(item.tool, tool));
  const [hovered, setHovered] = useState<BuildItem | null>(null);
  const preview = hovered ?? activeItem ?? items[0];
  const currentGroup = buildGroups.find((item) => item.id === group)!;

  useEffect(() => {
    if (!activeItem) return;
    setSectionByGroup((value) =>
      value[group] === activeItem.section ? value : { ...value, [group]: activeItem.section },
    );
  }, [activeItem, group]);

  useEffect(() => setHovered(null), [group, section]);

  return (
    <div className={`catalog-dock${open ? " open" : ""}`}>
      <nav className="tool-rail" aria-label="建造分类">
        {buildGroups.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              className={group === item.id ? "active" : ""}
              title={item.label}
              aria-label={item.label}
              aria-pressed={group === item.id && open}
              onClick={() => onGroup(item.id)}
            >
              <Icon />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <section
        className="catalog-panel"
        aria-label={`${currentGroup.label}目录`}
        aria-hidden={!open}
        inert={!open}
      >
        <header className="catalog-header">
          <div>
            <small>素材</small>
            <strong>{currentGroup.label}</strong>
            <span>{currentGroup.description}</span>
          </div>
          <button type="button" aria-label="收起素材目录" title="收起" onClick={onClose}>
            <X />
          </button>
        </header>

        {sections.length > 1 && (
          <div className="catalog-sections" role="tablist" aria-label={`${currentGroup.label}二级分类`}>
            {sections.map((value) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={section === value}
                onClick={() => setSectionByGroup((current) => ({ ...current, [group]: value }))}
              >
                {value}
              </button>
            ))}
          </div>
        )}

        <div className="catalog-preview-card">
          {open && preview.tool.kind === "place" ? (
            <ObjectPreview kind={preview.tool.value} />
          ) : preview.swatch ? (
            <span className="catalog-preview-swatch" style={{ "--swatch": preview.swatch } as CSSProperties} />
          ) : preview.icon ? (
            <preview.icon aria-hidden="true" />
          ) : null}
          <div>
            <strong>{preview.label}</strong>
            <small>{preview.detail}</small>
          </div>
        </div>

        <div className="catalog-item-grid">
          {items.filter((item) => item.section === section).map((item) => {
            const Icon = item.icon;
            const active = sameTool(tool, item.tool);
            return (
              <button
                key={item.label}
                type="button"
                className={active ? "active" : ""}
                title={item.detail}
                aria-label={item.label}
                aria-pressed={active}
                onPointerEnter={() => setHovered(item)}
                onPointerLeave={() => setHovered(null)}
                onFocus={() => setHovered(item)}
                onBlur={() => setHovered(null)}
                onClick={() => onTool(item.tool)}
              >
                {item.swatch ? (
                  <span className="material-swatch" style={{ "--swatch": item.swatch } as CSSProperties} />
                ) : Icon ? (
                  <Icon />
                ) : null}
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
