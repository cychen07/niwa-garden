import { useMemo, useState } from "react";
import { Search, Trees, Flower2, Gem, Fence, Landmark, Lamp, Sofa, X } from "lucide-react";
import { catalog, categories, type Category } from "../game/catalog";
import type { ObjectKind } from "../game/model";
import { blankGarden } from "../game/templates";
import { GardenPreview } from "./GardenPreview";

const icons = { "乔木": Trees, "花草": Flower2, "石与水": Gem, "道路围合": Fence, "建筑": Landmark, "灯饰": Lamp, "庭院生活": Sofa, "全部": Gem };
export function Catalogue({ onChoose }: { onChoose: (kind: ObjectKind) => void }) {
  const [category, setCategory] = useState<Category>("全部");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(catalog[0]);
  const items = catalog.filter((item) => (category === "全部" || item.category === category) &&
    `${item.name}${item.detail}${item.category}`.includes(query.trim()));
  const garden = useMemo(() => ({
    ...blankGarden(7), objects: [{ id: "sample", kind: selected.kind, x: 5, z: 5, rotation: 0, scale: 1.8 }],
  }), [selected]);
  return <div className="catalogue-layout">
    <section className="catalogue-list">
      <div className="catalogue-search"><Search /><input aria-label="搜索物品" placeholder="搜索物品" value={query}
        onChange={(event) => setQuery(event.target.value)} />
        {query && <button title="清除搜索" aria-label="清除搜索" onClick={() => setQuery("")}><X /></button>}
      </div>
      <div className="category-tabs" role="tablist" aria-label="物品分类">
        {categories.map((value) => <button key={value} role="tab" aria-selected={category === value}
          onClick={() => setCategory(value)}>{value}</button>)}
      </div>
      <div className="catalogue-count">{items.length} 件物品</div>
      <div className="object-grid">
        {items.map((item) => {
          const Icon = icons[item.category];
          return <button key={item.kind} className={`object-tile ${selected.kind === item.kind ? "selected" : ""}`}
            aria-label={`预览${item.name}`} aria-pressed={selected.kind === item.kind} onClick={() => setSelected(item)} title={item.detail}>
            <Icon /><span>{item.name}</span><small>{item.category}</small>
          </button>;
        })}
      </div>
      {!items.length && <p className="empty-state">没有匹配的物品</p>}
    </section>
    <aside className="catalogue-detail">
      <GardenPreview key={selected.kind} garden={garden} />
      <div className="catalogue-description"><small>{selected.category}</small><h2>{selected.name}</h2>
        <p>{selected.detail}</p><button className="command primary" onClick={() => onChoose(selected.kind)}>放置物品</button>
      </div>
    </aside>
  </div>;
}
