import { createServer } from "node:http";
import { DatabaseSync } from "node:sqlite";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { mkdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, resolve, extname, sep } from "node:path";
import { parseGarden } from "../src/game/model.ts";

const hash = (value) => createHash("sha256").update(value).digest("hex");
const text = (value, max) => typeof value === "string" && value.trim().length > 0 &&
  value.trim().length <= max && !/[\u0000-\u001f]/.test(value) ? value.trim() : null;
const fail = (status, message) => Object.assign(new Error(message), { status });
function validateWork(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) throw fail(400, "作品数据无效");
  const title = text(data.title, 40), author = text(data.author, 24);
  if (!title || !author || !/^[\w-]{8,80}$/.test(data.draftId ?? "")) throw fail(400, "请填写作品名称和署名");
  if (!Number.isInteger(data.seconds) || data.seconds < 0 || data.seconds > 31536000) throw fail(400, "创作时长无效");
  if (data.consent !== true) throw fail(400, "请确认公开作品");
  const raw = data.garden;
  if (!raw || !Array.isArray(raw.objects) || raw.objects.length < 1 || raw.objects.length > 500 ||
      !Array.isArray(raw.marks) || raw.marks.length > 400) throw fail(400, "作品须包含1至500件物品");
  let points = 0;
  for (const mark of raw.marks) {
    if (!Array.isArray(mark?.points) || (points += mark.points.length) > 30000) throw fail(400, "砂纹数量超出上限");
  }
  const garden = parseGarden(raw);
  if (!garden) throw fail(400, "庭院数据无效");
  garden.objects = garden.objects.map(({ id, kind, x, z, rotation, scale }) => ({ id, kind, x, z, rotation, scale }));
  garden.marks = garden.marks.map(({ id, kind, width, points, clip }) => ({
    id, kind, width, points: points.map(({ x, z }) => ({ x, z })), ...(clip ? { clip } : {}),
  }));
  const environment = data.environment;
  if (!environment || !Number.isFinite(environment.hour) || environment.hour < 0 || environment.hour > 23.5 ||
      !["spring", "summer", "autumn", "winter"].includes(environment.season) ||
      !["clear", "rain", "snow"].includes(environment.weather)) throw fail(400, "光景数据无效");
  if (typeof data.thumbnail !== "string" || !/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(data.thumbnail)) throw fail(400, "作品封面无效");
  const thumbnail = Buffer.from(data.thumbnail.slice("data:image/jpeg;base64,".length), "base64");
  if (thumbnail.length > 500000 || thumbnail.length < 100 || thumbnail[0] !== 255 || thumbnail[1] !== 216 ||
      thumbnail.at(-2) !== 255 || thumbnail.at(-1) !== 217) throw fail(400, "作品封面无效或过大");
  const templateId = data.templateId ?? null;
  if (templateId !== null && !["dry", "tea", "pond", "court"].includes(templateId)) throw fail(400, "范例来源无效");
  return { title, author, garden, environment: { hour: environment.hour, season: environment.season, weather: environment.weather },
    seconds: data.seconds, draftId: data.draftId, templateId, thumbnail };
}

async function body(req) {
  if (!req.headers["content-type"]?.startsWith("application/json")) throw fail(415, "仅接受JSON");
  let bytes = 0;
  const chunks = [];
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > 2_000_000) throw fail(413, "作品数据过大");
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw fail(400, "JSON无效"); }
}

export function createCommunityServer({ dbPath, distDir = resolve("dist") }) {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS works (
      id TEXT PRIMARY KEY, owner TEXT NOT NULL, draft_id TEXT NOT NULL, title TEXT NOT NULL,
      author TEXT NOT NULL, seconds INTEGER NOT NULL, template_id TEXT,
      garden TEXT NOT NULL, environment TEXT NOT NULL, thumbnail BLOB NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(owner,draft_id));
    CREATE TABLE IF NOT EXISTS likes (
      work_id TEXT REFERENCES works(id) ON DELETE CASCADE, owner TEXT NOT NULL,
      PRIMARY KEY(work_id,owner));
    CREATE INDEX IF NOT EXISTS works_created ON works(created_at DESC);
  `);
  const rate = new Map();
  const server = createServer(async (req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    res.setHeader("Cache-Control", "no-store");
    const json = (status, value) => { res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" }); res.end(JSON.stringify(value)); };
    try {
      const url = new URL(req.url, "http://localhost");
      if (!url.pathname.startsWith("/api/")) {
        if (req.method !== "GET" && req.method !== "HEAD") throw fail(405, "请求方法无效");
        const candidate = resolve(distDir, "." + decodeURIComponent(url.pathname));
        if (!candidate.startsWith(resolve(distDir) + sep) && candidate !== resolve(distDir)) throw fail(404, "未找到");
        const file = existsSync(candidate) && extname(candidate) ? candidate : resolve(distDir, "index.html");
        if (!existsSync(file)) throw fail(404, "请先构建前端");
        const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml" };
        res.writeHead(200, { "Content-Type": types[extname(file)] ?? "application/octet-stream" });
        res.end(req.method === "HEAD" ? undefined : readFileSync(file)); return;
      }
      if (req.method !== "GET" && req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) throw fail(403, "请求来源不符");
      let token = req.headers.cookie?.split(";").map((s) => s.trim()).find((s) => s.startsWith("niwa_guest="))?.slice(11);
      if (!/^[a-f0-9]{64}$/.test(token ?? "")) {
        token = randomBytes(32).toString("hex");
        res.setHeader("Set-Cookie", `niwa_guest=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=31536000${process.env.COOKIE_SECURE === "1" ? "; Secure" : ""}`);
      }
      const owner = hash(token);
      const summary = (row) => ({
        id: row.id, title: row.title, author: row.author, seconds: row.seconds, templateId: row.template_id,
        size: JSON.parse(row.garden).size, objectCount: JSON.parse(row.garden).objects.length,
        createdAt: row.created_at, updatedAt: row.updated_at, mine: row.owner === owner,
        likes: Number(row.likes ?? 0), liked: !!row.liked, thumbnailUrl: `/api/works/${row.id}/thumbnail?v=${encodeURIComponent(row.updated_at)}`,
      });
      const select = `SELECT w.*, (SELECT COUNT(*) FROM likes l WHERE l.work_id=w.id) likes,
        EXISTS(SELECT 1 FROM likes l WHERE l.work_id=w.id AND l.owner=?) liked FROM works w`;
      if (req.method === "GET" && url.pathname === "/api/health") { json(200, { ok: true }); return; }
      if (req.method === "GET" && url.pathname === "/api/works") {
        const sort = url.searchParams.get("sort"), mine = url.searchParams.get("mine") === "1";
        const offset = Number(url.searchParams.get("offset") ?? 0);
        if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100000) throw fail(400, "分页参数无效");
        const where = mine ? " WHERE w.owner=?" : "";
        const params = mine ? [owner, owner] : [owner];
        const rows = db.prepare(`${select}${where} ORDER BY ${sort === "likes" ? "likes DESC," : ""} w.created_at DESC,w.id DESC LIMIT 13 OFFSET ?`).all(...params, offset);
        json(200, { works: rows.slice(0, 12).map(summary), hasMore: rows.length > 12 }); return;
      }
      if (req.method !== "GET") {
        const now = Date.now(), key = req.socket.remoteAddress ?? "local";
        if (rate.size > 10000) rate.clear();
        const entry = rate.get(key);
        const next = !entry || now > entry.until ? { count: 1, until: now + 60000 } : { ...entry, count: entry.count + 1 };
        rate.set(key, next);
        if (next.count > 60) throw fail(429, "操作太频繁，请稍后再试");
      }
      if (req.method === "POST" && url.pathname === "/api/works") {
        const work = validateWork(await body(req));
        const previous = db.prepare("SELECT id,created_at FROM works WHERE owner=? AND draft_id=?").get(owner, work.draftId);
        if (!previous && db.prepare("SELECT COUNT(*) n FROM works WHERE owner=?").get(owner).n >= 100) throw fail(429, "个人作品已达100件，请先整理作品");
        const id = previous?.id ?? randomUUID(), now = new Date().toISOString();
        db.prepare(`INSERT INTO works VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
          ON CONFLICT(owner,draft_id) DO UPDATE SET title=excluded.title,author=excluded.author,
          seconds=excluded.seconds,template_id=excluded.template_id,garden=excluded.garden,
          environment=excluded.environment,thumbnail=excluded.thumbnail,updated_at=excluded.updated_at`)
          .run(id, owner, work.draftId, work.title, work.author, work.seconds, work.templateId,
            JSON.stringify(work.garden), JSON.stringify(work.environment), work.thumbnail, previous?.created_at ?? now, now);
        json(previous ? 200 : 201, summary(db.prepare(`${select} WHERE w.id=?`).get(owner, id))); return;
      }
      const match = url.pathname.match(/^\/api\/works\/([a-f0-9-]{36})(?:\/(thumbnail|like))?$/);
      if (!match) throw fail(404, "未找到作品");
      const [, id, action] = match;
      const row = db.prepare(`${select} WHERE w.id=?`).get(owner, id);
      if (!row) throw fail(404, "作品已不存在");
      if (req.method === "GET" && action === "thumbnail") {
        res.writeHead(200, { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=60" }); res.end(row.thumbnail); return;
      }
      if (req.method === "GET" && !action) {
        json(200, { ...summary(row), garden: JSON.parse(row.garden), environment: JSON.parse(row.environment) }); return;
      }
      if (req.method === "POST" && action === "like") {
        const data = await body(req);
        if (typeof data?.liked !== "boolean") throw fail(400, "心意状态无效");
        if (row.owner === owner) throw fail(400, "不能为自己的作品点心意");
        if (data.liked) db.prepare("INSERT OR IGNORE INTO likes VALUES(?,?)").run(id, owner);
        else db.prepare("DELETE FROM likes WHERE work_id=? AND owner=?").run(id, owner);
        json(200, summary(db.prepare(`${select} WHERE w.id=?`).get(owner, id))); return;
      }
      if (req.method === "DELETE" && !action) {
        if (row.owner !== owner) throw fail(403, "只能移除自己发布的作品");
        db.prepare("DELETE FROM works WHERE id=? AND owner=?").run(id, owner); json(200, { ok: true }); return;
      }
      throw fail(405, "请求方法无效");
    } catch (error) {
      if (!res.headersSent) json(error.status ?? 500, { error: error.status ? error.message : "服务暂时不可用，请稍后重试" });
      else res.end();
      if (!error.status) console.error(error);
    }
  });
  server.on("close", () => db.close());
  return server;
}
