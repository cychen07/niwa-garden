import { useEffect, useRef, useState } from "react";
import { ArrowLeft, BookOpen, Check, Clock3, Heart, Lightbulb, RefreshCw, Trash2, X } from "lucide-react";
import { templates, type GardenTemplate, type HintModule } from "../game/templates";
import type { ObjectKind } from "../game/model";
import { api, duration, type Work, type WorkDetail } from "./client";
import { Catalogue } from "./Catalogue";
import { GardenPreview, SceneThumb } from "./GardenPreview";

export type LibraryTab = "catalog" | "templates" | "gallery";
export function Library({ initialTab, onClose, onChoose, onChallenge }: {
  initialTab: LibraryTab; onClose: () => void; onChoose: (kind: ObjectKind) => void;
  onChallenge: (template: GardenTemplate) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [tab, setTab] = useState(initialTab);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} className="studio" aria-label="庭院工坊" onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <header className="studio-header"><strong>庭景 <span>工坊</span></strong>
      <nav aria-label="工坊页面">
        {([{ id: "catalog", name: "物品目录" }, { id: "templates", name: "庭院范例" }, { id: "gallery", name: "作品广场" }] as const)
          .map((item) => <button key={item.id} aria-current={tab === item.id ? "page" : undefined}
            onClick={() => setTab(item.id)}>{item.name}</button>)}
      </nav>
      <button className="icon-command" aria-label="返回建造" title="返回建造" onClick={onClose}><X /></button>
    </header>
    <div className="studio-body">
      {tab === "catalog" && <Catalogue onChoose={onChoose} />}
      {tab === "templates" && <Examples onChallenge={onChallenge} />}
      {tab === "gallery" && <Gallery />}
    </div>
  </dialog>;
}

function Examples({ onChallenge }: { onChallenge: (template: GardenTemplate) => void }) {
  const [selected, setSelected] = useState<GardenTemplate | null>(null);
  const [hints, setHints] = useState(false);
  const [module, setModule] = useState<HintModule | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState("");
  if (!selected) return <section className="collection-page">
    <div className="collection-heading"><div><small>04 GARDEN STUDIES</small><h2>四种庭院，四种秩序</h2></div><BookOpen /></div>
    <div className="garden-grid">
      {templates.map((template, index) => <button className="garden-card" key={template.id} onClick={() => {
        setSelected(template); setModule(null); setHints(false); setConfirm(false); setError("");
      }} aria-label={`观摩${template.name}`}>
        <SceneThumb garden={template.garden} environment={template.environment} />
        <div className="garden-card-caption"><small>0{index + 1} / {template.style}</small><h3>{template.name}</h3>
          <span>{template.garden.size} × {template.garden.size} · {template.difficulty} · 3 个模块</span></div>
      </button>)}
    </div>
  </section>;
  return <div className="study-layout">
    <section className="study-scene">
      <button className="back-command" onClick={() => setSelected(null)}><ArrowLeft />全部范例</button>
      <GardenPreview key={selected.id} garden={selected.garden} environment={selected.environment} focus={module?.focus} />
    </section>
    <aside className="study-notes">
      <small>{selected.style} / {selected.difficulty}</small><h2>{selected.name}</h2>
      <p className="work-meta">{selected.garden.size} × {selected.garden.size} · {selected.garden.objects.length} 件物品</p>
      <button className={`command hint-command ${hints ? "selected" : ""}`} aria-expanded={hints}
        onClick={() => { setHints(!hints); setModule(null); }}><Lightbulb />搭建提示</button>
      {hints && <section className="hint-section">
        <h3>选一个小模块</h3>
        <div className="hint-options">{selected.modules.map((item) => <button key={item.id} aria-pressed={module?.id === item.id}
          onClick={() => setModule(item)}>{module?.id === item.id && <Check />}{item.name}</button>)}</div>
        {module && <article className="hint-content" aria-live="polite">
          <h3>{module.name}</h3><p className="hint-materials">{module.materials}</p>
          <ol>{module.steps.map((step) => <li key={step}>{step}</li>)}</ol>
        </article>}
      </section>}
      <div className="challenge-entry">
        {!confirm ? <button className="command" onClick={() => setConfirm(true)}>从空庭试搭</button> : <>
          <p>新建同尺寸空庭，计时重新开始。当前草稿将保留为上一份草稿。</p>
          <div className="inline-actions"><button className="command" onClick={() => setConfirm(false)}>取消</button>
            <button className="command primary" onClick={() => {
              try { onChallenge(selected); } catch { setError("无法备份当前草稿，未开始新庭院"); }
            }}>开始试搭</button></div>
        </>}
        {error && <p role="alert">{error}</p>}
      </div>
    </aside>
  </div>;
}

function Gallery() {
  const [sort, setSort] = useState("new");
  const [works, setWorks] = useState<Work[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [selected, setSelected] = useState<WorkDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const detailController = useRef<AbortController | null>(null);
  useEffect(() => () => detailController.current?.abort(), []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(""); setWorks([]);
    api<{ works: Work[]; hasMore: boolean }>(`/works?sort=${sort}&mine=${sort === "mine" ? 1 : 0}`, { signal: controller.signal })
      .then((data) => { setWorks(data.works); setHasMore(data.hasMore); })
      .catch((error) => { if (!controller.signal.aborted) setError(error.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [sort, retry]);
  const open = async (work: Work) => {
    detailController.current?.abort();
    const controller = new AbortController(); detailController.current = controller;
    setDetailLoading(true); setError(""); setConfirmDelete(false);
    try { setSelected(await api<WorkDetail>(`/works/${work.id}`, { signal: controller.signal })); }
    catch (error) { if (!controller.signal.aborted) setError((error as Error).message); }
    finally { if (!controller.signal.aborted) setDetailLoading(false); }
  };
  const appreciate = async () => {
    if (!selected || busy) return;
    setBusy(true); setError("");
    try {
      const result = await api<Work>(`/works/${selected.id}/like`, { method: "POST", body: JSON.stringify({ liked: !selected.liked }) });
      setSelected({ ...selected, ...result });
      setWorks((items) => items.map((item) => item.id === result.id ? result : item));
    } catch (error) { setError((error as Error).message); } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!selected || busy) return;
    setBusy(true); setError("");
    try {
      await api(`/works/${selected.id}`, { method: "DELETE" });
      setSelected(null); setRetry((value) => value + 1);
    } catch (error) { setError((error as Error).message); } finally { setBusy(false); }
  };
  if (selected) return <div className="study-layout">
    <section className="study-scene"><button className="back-command" disabled={busy} onClick={() => { setSelected(null); setError(""); }}><ArrowLeft />全部作品</button>
      <GardenPreview garden={selected.garden} environment={selected.environment} /></section>
    <aside className="study-notes"><small>玩家作品</small><h2>{selected.title}</h2><p>{selected.author}</p>
      <p className="work-meta"><Clock3 />创作记录 {duration(selected.seconds)}</p>
      <p className="work-meta">{selected.size} × {selected.size} · {selected.objectCount} 件物品</p>
      <p className="work-meta">{new Date(selected.createdAt).toLocaleDateString("zh-CN")}</p>
      {selected.templateId && <p>参考：{templates.find((item) => item.id === selected.templateId)?.name}</p>}
      <button className={`command ${selected.liked ? "selected" : ""}`} disabled={busy || selected.mine} onClick={appreciate}>
        <Heart fill={selected.liked ? "currentColor" : "none"} />{selected.likes} 份心意</button>
      {selected.mine && <div className="challenge-entry">{confirmDelete ? <>
        <p>移除广场中的作品？本地草稿不会删除。</p><div className="inline-actions">
          <button className="command" onClick={() => setConfirmDelete(false)}>取消</button>
          <button className="command danger" disabled={busy} onClick={remove}>确认移除</button></div>
      </> : <button className="command" onClick={() => setConfirmDelete(true)}><Trash2 />移除作品</button>}</div>}
      {error && <p role="alert" className="error-message">{error}</p>}
    </aside>
  </div>;
  return <section className="collection-page">
    <div className="collection-heading"><div><small>COMMUNITY GARDENS</small><h2>看看别人的庭院</h2></div>
      <button className="icon-command" title="刷新作品" aria-label="刷新作品" disabled={busy || detailLoading} onClick={() => setRetry((value) => value + 1)}><RefreshCw /></button></div>
    <div className="category-tabs">{[["new", "最新作品"], ["likes", "心意最多"], ["mine", "我的作品"]].map(([id, name]) =>
      <button key={id} aria-pressed={sort === id} disabled={busy || detailLoading} onClick={() => setSort(id)}>{name}</button>)}</div>
    {loading || detailLoading ? <p className="empty-state" role="status">正在打开庭院…</p> : null}
    {error && <div className="error-message" role="alert">{error}<button className="command" onClick={() => setRetry((value) => value + 1)}>重试</button></div>}
    {!loading && !error && works.length === 0 && <p className="empty-state">还没有作品，第一座庭院正在等你。</p>}
    <div className="garden-grid">
      {works.map((work) => <button className="garden-card" key={work.id} disabled={detailLoading || busy} onClick={() => open(work)} aria-label={`查看${work.title}`}>
        <img className="work-thumbnail" src={work.thumbnailUrl} alt={work.title} loading="lazy" />
        <div className="garden-card-caption"><small>{work.author}{work.mine ? " · 我的作品" : ""}</small><h3>{work.title}</h3>
          <span><Clock3 />{duration(work.seconds)}<Heart />{work.likes}</span></div>
      </button>)}
    </div>
    {hasMore && !loading && <button className="command load-more" disabled={busy} onClick={async () => {
      setBusy(true);
      try {
        const data = await api<{ works: Work[]; hasMore: boolean }>(`/works?sort=${sort}&mine=${sort === "mine" ? 1 : 0}&offset=${works.length}`);
        setWorks((items) => [...items, ...data.works.filter((w) => !items.some((item) => item.id === w.id))]); setHasMore(data.hasMore);
      } catch (error) { setError((error as Error).message); } finally { setBusy(false); }
    }}>更多作品</button>}
  </section>;
}
