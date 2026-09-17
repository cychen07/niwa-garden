import { useEffect, useRef, useState } from "react";
import { Check, Send, X } from "lucide-react";
import { api, duration, thumbnail, type Work } from "./client";
import type { DraftMeta } from "./useDraft";
import type { EnvironmentState, GardenState } from "../game/model";

export function PublishDialog({ garden, environment, meta, onMeta, onClose, onGallery }: {
  garden: GardenState; environment: EnvironmentState; meta: DraftMeta;
  onMeta: (meta: DraftMeta) => void; onClose: () => void; onGallery: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [image, setImage] = useState("");
  const [title, setTitle] = useState(meta.title);
  const [author, setAuthor] = useState(meta.author);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [published, setPublished] = useState<Work | null>(null);
  useEffect(() => {
    dialog.current?.showModal();
    let second = 0;
    const frame = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => {
        try { setImage(thumbnail()); } catch (error) { setError((error as Error).message); }
      });
    });
    return () => { cancelAnimationFrame(frame); cancelAnimationFrame(second); };
  }, []);
  return <dialog ref={dialog} className="publish-dialog" aria-labelledby="publish-title"
    onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}>
    <form onSubmit={async (event) => {
      event.preventDefault();
      if (busy || !consent || !image) return;
      setBusy(true); setError("");
      const next = { ...meta, title: title.trim(), author: author.trim() };
      onMeta(next);
      try {
        setPublished(await api<Work>("/works", { method: "POST", body: JSON.stringify({
          ...next, draftId: meta.id, garden, environment, consent, thumbnail: image,
        }) }));
      } catch (error) { setError((error as Error).message); } finally { setBusy(false); }
    }}>
      <header className="panel-header"><h2 id="publish-title">{published ? "庭院已入册" : "发布作品"}</h2>
        <button type="button" disabled={busy} title="关闭发布" aria-label="关闭发布" onClick={onClose}><X /></button></header>
      {image && <img className="publish-preview" src={image} alt="当前庭院封面" />}
      {published ? <div className="publish-success"><Check /><h3>{published.title}</h3>
        <p>{published.author} · {duration(published.seconds)}</p>
        <button type="button" className="command primary" onClick={onGallery}>去作品广场</button>
      </div> : <>
        <label className="field">作品名称<input required maxLength={40} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="给这座庭院一个名字" /></label>
        <label className="field">署名<input required maxLength={24} value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="你的昵称" /></label>
        <p className="work-meta">本次创作记录 {duration(meta.seconds)} · {garden.objects.length} 件物品</p>
        <label className="consent"><input type="checkbox" required checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>公开庭院、署名与创作时长，供其他玩家查看。</span></label>
        {garden.objects.length === 0 && <p className="error-message">先在庭院中放置至少一件物品。</p>}
        {error && <p role="alert" className="error-message">{error}</p>}
        <footer className="dialog-actions"><button type="button" disabled={busy} onClick={onClose}>取消</button>
          <button type="submit" className="primary" disabled={busy || !consent || !image || !garden.objects.length}>
            <Send />{busy ? "发布中…" : "确认发布"}</button></footer>
      </>}
    </form>
  </dialog>;
}
