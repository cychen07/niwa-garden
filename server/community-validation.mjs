import { parseGarden } from "../src/game/model.ts";

export const fail = (status, message) => Object.assign(new Error(message), { status });

const text = (value, max) => typeof value === "string" && value.trim().length > 0 &&
  value.trim().length <= max && !/[\u0000-\u001f]/.test(value) ? value.trim() : null;

export function validateWork(data) {
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
  garden.marks = garden.marks.map(({ id, kind, width, points: markPoints, clip }) => ({
    id, kind, width, points: markPoints.map(({ x, z }) => ({ x, z })), ...(clip ? { clip } : {}),
  }));
  const environment = data.environment;
  if (!environment || !Number.isFinite(environment.hour) || environment.hour < 0 || environment.hour > 23.5 ||
      !["spring", "summer", "autumn", "winter"].includes(environment.season) ||
      !["clear", "rain", "snow"].includes(environment.weather)) throw fail(400, "光景数据无效");
  if (typeof data.thumbnail !== "string" || !/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(data.thumbnail)) {
    throw fail(400, "作品封面无效");
  }
  const thumbnail = Buffer.from(data.thumbnail.slice("data:image/jpeg;base64,".length), "base64");
  if (thumbnail.length > 500000 || thumbnail.length < 100 || thumbnail[0] !== 255 || thumbnail[1] !== 216 ||
      thumbnail.at(-2) !== 255 || thumbnail.at(-1) !== 217) throw fail(400, "作品封面无效或过大");
  const templateId = data.templateId ?? null;
  if (templateId !== null && !["dry", "tea", "pond", "court"].includes(templateId)) throw fail(400, "范例来源无效");
  return {
    title,
    author,
    garden,
    environment: { hour: environment.hour, season: environment.season, weather: environment.weather },
    seconds: data.seconds,
    draftId: data.draftId,
    templateId,
    thumbnail,
  };
}
