export const GARDEN_SIZE = 11;
export const CENTER = (GARDEN_SIZE - 1) / 2;
export const SEGMENTS = 64;
export const GRID_SIDE = SEGMENTS + 1;
export const CELL_SIZE = GARDEN_SIZE / SEGMENTS;
export const GARDEN_SIZES = [7, 9, 11, 13, 15, 17, 19] as const;
export const MIN_GARDEN_SIZE = GARDEN_SIZES[0];
export const MAX_GARDEN_SIZE = GARDEN_SIZES[GARDEN_SIZES.length - 1];
export const SAVE_KEY = "niwa-garden-v3";
export const PREVIOUS_SAVE_KEY = "niwa-garden-v2";
export const LEGACY_SAVE_KEY = "niwa-garden-v1";

export type SurfaceKind = "grass" | "moss" | "sand" | "water";
export const OBJECT_KINDS = [
  "maple", "pine", "bamboo", "rock", "lantern", "basin", "bridge",
  "cherry", "azalea", "iris", "stepping", "fence", "torii", "pavilion", "bench", "pagoda", "shishi",
  "willow", "plum", "hydrangea", "fern", "lotus", "reed", "bonsai",
  "stonepath", "wooddeck", "wall", "gate", "pergola", "stonebridge", "tallrock", "pebble",
  "paperlantern", "groundlamp", "teatable", "cushion", "umbrella",
] as const;
export type ObjectKind = typeof OBJECT_KINDS[number];
const OBJECT_RADII: Record<ObjectKind, number> = {
  maple: 0.9, pine: 0.75, bamboo: 0.55, rock: 0.65, lantern: 0.45, basin: 0.65, bridge: 1,
  cherry: 1.05, azalea: 0.75, iris: 0.5, stepping: 1, fence: 1, torii: 1.25,
  pavilion: 1.85, bench: 0.75, pagoda: 0.55, shishi: 0.8,
  willow: 1.2, plum: 0.8, hydrangea: 0.6, fern: 0.55, lotus: 0.45, reed: 0.5, bonsai: 0.65,
  stonepath: 1, wooddeck: 1.4, wall: 1.3, gate: 1.2, pergola: 1.5, stonebridge: 1.3,
  tallrock: 0.65, pebble: 0.5, paperlantern: 0.45, groundlamp: 0.3,
  teatable: 0.7, cushion: 0.4, umbrella: 1.3,
};
export type Season = "spring" | "summer" | "autumn" | "winter";
export type Weather = "clear" | "rain" | "snow";
export type EditorMode = "build" | "select" | "orbit";

export type Tool =
  | { kind: "surface"; value: SurfaceKind }
  | { kind: "height"; delta: 1 | -1 }
  | { kind: "smooth" }
  | { kind: "rake" }
  | { kind: "place"; value: ObjectKind }
  | { kind: "erase" };

export interface GardenTile {
  x: number;
  z: number;
  height: number;
  surface: SurfaceKind;
  rake: number;
}

export interface GardenObject {
  id: string;
  kind: ObjectKind;
  x: number;
  z: number;
  rotation: number;
  scale: number;
}

export interface GardenState {
  version: 3;
  size: number;
  terrain: {
    heights: number[];
    surfaces: SurfaceKind[];
  };
  objects: GardenObject[];
  marks: RakeMark[];
}

export interface GardenPoint {
  x: number;
  z: number;
}

export interface RakeMark {
  id: string;
  kind: "rake" | "clear";
  width: number;
  points: GardenPoint[];
  clip?: { min: number; max: number };
}

export interface EnvironmentState {
  hour: number;
  season: Season;
  weather: Weather;
}

export const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));
export const gardenBounds = (size: number) => ({ min: CENTER - size / 2, max: CENTER + size / 2 });
export function terrainGrid(size: number) {
  const segments = Math.round(SEGMENTS * size / GARDEN_SIZE / 2) * 2;
  return { segments, side: segments + 1, cellSize: size / segments, ...gardenBounds(size) };
}
export const inGarden = ({ x, z }: GardenPoint, size = GARDEN_SIZE) => {
  const { min, max } = gardenBounds(size);
  return x >= min && x <= max && z >= min && z <= max;
};
export const sampleCoordinate = (index: number, size = GARDEN_SIZE) => {
  const { cellSize, min } = terrainGrid(size);
  return index * cellSize + min;
};
export const distance = (a: GardenPoint, b: GardenPoint) => Math.hypot(b.x - a.x, b.z - a.z);
export const newId = () => globalThis.crypto?.randomUUID?.() ??
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

export function createInitialGarden(): GardenState {
  const heights: number[] = [];
  const surfaces: SurfaceKind[] = [];
  for (let z = 0; z < GRID_SIDE; z += 1) {
    for (let x = 0; x < GRID_SIDE; x += 1) {
      const px = sampleCoordinate(x) - CENTER;
      const pz = sampleCoordinate(z) - CENTER;
      const inPond = ((px - 3.35) / 2.25) ** 2 + ((pz + 0.35) / 3.15) ** 2 < 1;
      const inSand = ((px + 2.25) / 3.05) ** 2 + ((pz - 0.15) / 3.55) ** 2 < 1;
      const onMossPath = Math.abs(px + pz * 0.35) < 0.72 && pz > 1.25;

      let surface: SurfaceKind = "grass";
      if (inPond) surface = "water";
      else if (inSand) surface = "sand";
      else if (onMossPath) surface = "moss";

      heights.push(0.16 + 0.55 * Math.exp(-((px + 2.8) ** 2 + (pz + 3.9) ** 2) / 4));
      surfaces.push(surface);
    }
  }

  const objects: GardenObject[] = [
    { id: "maple-1", kind: "maple", x: 1, z: 1, rotation: 0.4, scale: 1.18 },
    { id: "pine-1", kind: "pine", x: 8, z: 1, rotation: -0.2, scale: 1.05 },
    { id: "bamboo-1", kind: "bamboo", x: 9, z: 8, rotation: 0, scale: 1 },
    { id: "rock-1", kind: "rock", x: 3, z: 5, rotation: 0.2, scale: 1.05 },
    { id: "rock-2", kind: "rock", x: 4, z: 4, rotation: 1.2, scale: 0.72 },
    { id: "lantern-1", kind: "lantern", x: 6, z: 7, rotation: 0, scale: 0.92 },
    { id: "basin-1", kind: "basin", x: 8, z: 8, rotation: 0.4, scale: 0.9 },
    { id: "bridge-1", kind: "bridge", x: 8, z: 5, rotation: Math.PI / 2, scale: 1 },
  ];

  return {
    version: 3,
    size: GARDEN_SIZE,
    terrain: { heights, surfaces },
    objects,
    marks: [
      { id: "initial-rake-1", kind: "rake", width: 1.5, points: [{ x: 1, z: 2 }, { x: 1.5, z: 5 }, { x: 1, z: 8 }] },
      { id: "initial-rake-2", kind: "rake", width: 1.5, points: [{ x: 3, z: 2 }, { x: 3.5, z: 5 }, { x: 3, z: 8 }] },
    ],
  };
}

function gridPosition(point: GardenPoint, size: number) {
  const { cellSize, min, segments, side } = terrainGrid(size);
  const x = clamp((point.x - min) / cellSize, 0, segments);
  const z = clamp((point.z - min) / cellSize, 0, segments);
  const ix = Math.min(segments - 1, Math.floor(x));
  const iz = Math.min(segments - 1, Math.floor(z));
  return { ix, iz, fx: x - ix, fz: z - iz, side };
}

export function heightAt(garden: GardenState, point: GardenPoint): number {
  const { ix, iz, fx, fz, side } = gridPosition(point, garden.size);
  const h = garden.terrain.heights;
  const a = h[iz * side + ix];
  const b = h[iz * side + ix + 1];
  const c = h[(iz + 1) * side + ix];
  const d = h[(iz + 1) * side + ix + 1];
  return (a * (1 - fx) + b * fx) * (1 - fz) + (c * (1 - fx) + d * fx) * fz;
}

export function surfaceAt(garden: GardenState, point: GardenPoint): SurfaceKind {
  const { cellSize, min, segments, side } = terrainGrid(garden.size);
  const x = Math.round(clamp((point.x - min) / cellSize, 0, segments));
  const z = Math.round(clamp((point.z - min) / cellSize, 0, segments));
  return garden.terrain.surfaces[z * side + x];
}

export function objectHeightAt(garden: GardenState, item: Pick<GardenObject, "kind" | "x" | "z">): number {
  let height = heightAt(garden, item);
  if (!["cushion", "teatable", "bonsai"].includes(item.kind)) return height;
  for (const deck of garden.objects) {
    if (deck.kind !== "wooddeck" && deck.kind !== "pavilion") continue;
    const dx = item.x - deck.x, dz = item.z - deck.z;
    const x = dx * Math.cos(deck.rotation) - dz * Math.sin(deck.rotation);
    const z = dx * Math.sin(deck.rotation) + dz * Math.cos(deck.rotation);
    if (Math.abs(x) <= 0.95 * deck.scale && Math.abs(z) <= 0.825 * deck.scale) {
      height = Math.max(height, heightAt(garden, deck) + (deck.kind === "wooddeck" ? 0.28 : 0.263) * deck.scale);
    }
  }
  return height;
}

function extendMark(
  garden: GardenState,
  from: GardenPoint,
  to: GardenPoint,
  id: string,
  kind: RakeMark["kind"],
  width: number,
  minSpacing = 0.025,
): GardenState {
  const last = garden.marks.at(-1);
  if (last?.id === id) {
    if (distance(last.points.at(-1)!, to) < minSpacing) return garden;
    return {
      ...garden,
      marks: [...garden.marks.slice(0, -1), { ...last, points: [...last.points, to] }],
    };
  }
  return { ...garden, marks: [...garden.marks, { id, kind, width, points: [from, to] }] };
}

export function applyBrush(
  garden: GardenState,
  from: GardenPoint,
  to: GardenPoint,
  tool: Tool,
  diameter: number,
  seconds: number,
  strokeId: string,
  finalSample = false,
): GardenState {
  if (!inGarden(from, garden.size) || !inGarden(to, garden.size)) return garden;
  const { cellSize, min, segments, side } = terrainGrid(garden.size);
  const radius = clamp(diameter / 2, 0.18, 2.5);
  if (tool.kind === "place") return garden;
  if (tool.kind === "rake") {
    if (distance(from, to) < (finalSample ? 0.000001 : 0.015)) return garden;
    return extendMark(garden, from, to, strokeId, "rake", diameter, finalSample ? 0.000001 : 0.025);
  }
  if (tool.kind === "erase") {
    const dx = to.x - from.x, dz = to.z - from.z;
    const lengthSquared = dx * dx + dz * dz;
    const objects = garden.objects.filter((item) => {
      const t = lengthSquared ? clamp(((item.x - from.x) * dx + (item.z - from.z) * dz) / lengthSquared, 0, 1) : 0;
      return distance(item, { x: from.x + dx * t, z: from.z + dz * t }) > radius;
    });
    return objects.length === garden.objects.length ? garden : { ...garden, objects };
  }

  // Distance-based sampling fills gaps even when pointer events skip many cells.
  const steps = Math.max(1, Math.ceil(distance(from, to) / Math.min(radius * 0.25, cellSize / 2)));
  const heights = tool.kind === "surface" ? garden.terrain.heights : [...garden.terrain.heights];
  const surfaces = tool.kind === "surface" ? [...garden.terrain.surfaces] : garden.terrain.surfaces;
  let changed = false;
  for (let s = 1; s <= steps; s += 1) {
    const px = from.x + (to.x - from.x) * s / steps;
    const pz = from.z + (to.z - from.z) * s / steps;
    const minX = clamp(Math.floor((px - radius - min) / cellSize), 0, segments);
    const maxX = clamp(Math.ceil((px + radius - min) / cellSize), 0, segments);
    const minZ = clamp(Math.floor((pz - radius - min) / cellSize), 0, segments);
    const maxZ = clamp(Math.ceil((pz + radius - min) / cellSize), 0, segments);
    for (let z = minZ; z <= maxZ; z += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const d = Math.hypot(x * cellSize + min - px, z * cellSize + min - pz) / radius;
        if (d > 1) continue;
        const index = z * side + x;
        if (tool.kind === "surface") {
          if (surfaces[index] !== tool.value) {
            surfaces[index] = tool.value;
            changed = true;
          }
        } else {
          const falloff = (1 - d * d) ** 2;
          let value = heights[index];
          if (tool.kind === "height") {
            value = clamp(value + tool.delta * falloff * Math.min(seconds, 0.25) / steps * 0.9, -0.08, 2.2);
          } else {
            const neighbors = [
              z * side + Math.max(0, x - 1), z * side + Math.min(segments, x + 1),
              Math.max(0, z - 1) * side + x, Math.min(segments, z + 1) * side + x,
            ];
            const average = neighbors.reduce((sum, n) => sum + garden.terrain.heights[n], 0) / 4;
            value += (average - value) * Math.min(1, seconds * 12 / steps) * falloff;
          }
          if (Math.abs(value - heights[index]) > 0.000001) {
            heights[index] = value;
            changed = true;
          }
        }
      }
    }
  }
  let next = changed ? { ...garden, terrain: { heights, surfaces } } : garden;
  if (tool.kind === "surface" && garden.marks.some((mark) => mark.kind === "rake")) {
    next = extendMark(next, from, to, strokeId, "clear", diameter);
  }
  return next;
}

export function transformObject(
  garden: GardenState,
  id: string,
  patch: Partial<Pick<GardenObject, "x" | "z" | "rotation" | "scale">>,
): GardenState {
  const item = garden.objects.find((object) => object.id === id);
  if (!item) return garden;
  const { min, max } = gardenBounds(garden.size);
  const next = {
    ...item, ...patch,
    x: clamp(patch.x ?? item.x, min + 0.2, max - 0.2),
    z: clamp(patch.z ?? item.z, min + 0.2, max - 0.2),
    scale: clamp(patch.scale ?? item.scale, 0.4, 2),
  };
  if (next.x === item.x && next.z === item.z && next.scale === item.scale && next.rotation === item.rotation) return garden;
  return { ...garden, objects: garden.objects.map((object) => object.id === id ? next : object) };
}

function resizedObjectPosition(item: GardenObject, size: number): GardenPoint {
  const { min, max } = gardenBounds(size);
  const inset = Math.min(size / 2, OBJECT_RADII[item.kind] * item.scale + 0.05);
  return { x: clamp(item.x, min + inset, max - inset), z: clamp(item.z, min + inset, max - inset) };
}

export function resizeGarden(garden: GardenState, size: number): GardenState {
  if (!GARDEN_SIZES.some((allowed) => allowed === size) || size === garden.size) return garden;
  const { side, cellSize, min, max } = terrainGrid(size);
  const heights: number[] = [], surfaces: SurfaceKind[] = [];
  // Resample in world coordinates so existing objects and the central composition stay put.
  for (let z = 0; z < side; z += 1) {
    for (let x = 0; x < side; x += 1) {
      const point = { x: min + x * cellSize, z: min + z * cellSize };
      heights.push(clamp(heightAt(garden, point), -0.08, 2.2));
      surfaces.push(inGarden(point, garden.size) ? surfaceAt(garden, point) : "grass");
    }
  }
  const shrinking = size < garden.size;
  return {
    ...garden, size, terrain: { heights, surfaces },
    objects: shrinking ? garden.objects.map((item) => ({
      ...item, ...resizedObjectPosition(item, size),
    })) : garden.objects,
    marks: shrinking ? garden.marks.map((mark) => ({
      ...mark,
      clip: { min: Math.max(mark.clip?.min ?? min, min), max: Math.min(mark.clip?.max ?? max, max) },
    })) : garden.marks,
  };
}

export function displacedObjectCount(garden: GardenState, size: number): number {
  if (size >= garden.size) return 0;
  return garden.objects.filter((item) => {
    const position = resizedObjectPosition(item, size);
    return position.x !== item.x || position.z !== item.z;
  }).length;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const isSurface = (value: unknown): value is SurfaceKind =>
  typeof value === "string" && ["grass", "moss", "sand", "water"].includes(value);
const isPoint = (value: unknown, size = MAX_GARDEN_SIZE): value is GardenPoint =>
  isRecord(value) && finite(value.x) && finite(value.z) && inGarden({ x: value.x, z: value.z }, size);
const isObject = (value: unknown): value is GardenObject =>
  isRecord(value) && isPoint(value) && typeof value.id === "string" &&
  typeof value.kind === "string" && OBJECT_KINDS.some((kind) => kind === value.kind) &&
  finite(value.rotation) && finite(value.scale) && value.scale >= 0.4 && value.scale <= 2;

export function parseGarden(value: unknown): GardenState | null {
  if (!isRecord(value) || !Array.isArray(value.objects) || !value.objects.every(isObject)) return null;
  if (new Set(value.objects.map((item) => item.id)).size !== value.objects.length) return null;
  if (value.version === 2 || value.version === 3) {
    const size = value.version === 2 ? GARDEN_SIZE : value.size;
    if (!finite(size) || !GARDEN_SIZES.some((allowed) => allowed === size)) return null;
    if (!value.objects.every((item) => inGarden(item, size))) return null;
    const { side } = terrainGrid(size);
    const terrain = value.terrain;
    if (!isRecord(terrain) || !Array.isArray(terrain.heights) || !Array.isArray(terrain.surfaces) ||
        terrain.heights.length !== side ** 2 || terrain.surfaces.length !== side ** 2 ||
        !terrain.heights.every((h) => finite(h) && h >= -0.08 && h <= 2.2) ||
        !terrain.surfaces.every(isSurface) || !Array.isArray(value.marks)) return null;
    const marks: RakeMark[] = [];
    for (const mark of value.marks) {
      if (!isRecord(mark) || typeof mark.id !== "string" || !["rake", "clear"].includes(String(mark.kind)) ||
          !finite(mark.width) || mark.width < 0.35 || mark.width > 5 ||
          !Array.isArray(mark.points) || mark.points.length < 2 || !mark.points.every((point) => isPoint(point))) return null;
      let clip: RakeMark["clip"];
      if (mark.clip !== undefined) {
        if (!isRecord(mark.clip) || !finite(mark.clip.min) || !finite(mark.clip.max) ||
            mark.clip.min >= mark.clip.max || mark.clip.min < gardenBounds(MAX_GARDEN_SIZE).min ||
            mark.clip.max > gardenBounds(MAX_GARDEN_SIZE).max) return null;
        clip = { min: mark.clip.min, max: mark.clip.max };
      }
      marks.push({ id: mark.id, kind: mark.kind as RakeMark["kind"], width: mark.width, points: mark.points, ...(clip ? { clip } : {}) });
    }
    return {
      version: 3, size, terrain: { heights: terrain.heights, surfaces: terrain.surfaces },
      objects: value.objects, marks,
    };
  }

  if (value.version !== undefined && value.version !== 1) return null;
  if (!Array.isArray(value.tiles) || value.tiles.length !== GARDEN_SIZE ** 2 ||
      !value.objects.every((item) => inGarden(item))) return null;
  const tiles = new Map<number, GardenTile>();
  for (const tile of value.tiles) {
    if (!isRecord(tile) || !finite(tile.x) || !finite(tile.z) || !Number.isInteger(tile.x) ||
        !Number.isInteger(tile.z) || tile.x < 0 || tile.x > 10 || tile.z < 0 || tile.z > 10 ||
        !finite(tile.height) || tile.height < 0 || tile.height > 3 || !isSurface(tile.surface) || !finite(tile.rake)) return null;
    tiles.set(tile.z * GARDEN_SIZE + tile.x, tile as unknown as GardenTile);
  }
  if (tiles.size !== GARDEN_SIZE ** 2) return null;
  const garden = createInitialGarden();
  garden.objects = value.objects;
  garden.marks = [];
  garden.terrain.heights = garden.terrain.heights.map((_, index) => {
    const x = clamp(sampleCoordinate(index % GRID_SIDE), 0, 10);
    const z = clamp(sampleCoordinate(Math.floor(index / GRID_SIDE)), 0, 10);
    const ix = Math.min(9, Math.floor(x)), iz = Math.min(9, Math.floor(z));
    const fx = x - ix, fz = z - iz;
    const h = (a: number, b: number) => tiles.get(b * GARDEN_SIZE + a)!.height;
    return 0.16 + 0.22 * ((h(ix, iz) * (1 - fx) + h(ix + 1, iz) * fx) * (1 - fz) +
      (h(ix, iz + 1) * (1 - fx) + h(ix + 1, iz + 1) * fx) * fz);
  });
  garden.terrain.surfaces = garden.terrain.surfaces.map((_, index) => {
    const x = Math.round(clamp(sampleCoordinate(index % GRID_SIDE), 0, 10));
    const z = Math.round(clamp(sampleCoordinate(Math.floor(index / GRID_SIDE)), 0, 10));
    return tiles.get(z * GARDEN_SIZE + x)!.surface;
  });
  tiles.forEach((tile) => {
    if (tile.surface !== "sand" || !tile.rake) return;
    const angle = (tile.rake - 1) * Math.PI / 4;
    garden.marks.push({
      id: `legacy-${tile.x}-${tile.z}`, kind: "rake", width: 0.65,
      points: [-0.35, 0.35].map((d) => ({ x: tile.x + Math.cos(angle) * d, z: tile.z + Math.sin(angle) * d })),
    });
  });
  return garden;
}

export function loadGarden(): GardenState {
  try {
    for (const key of [SAVE_KEY, PREVIOUS_SAVE_KEY, LEGACY_SAVE_KEY]) {
      try {
        const saved = localStorage.getItem(key);
        const parsed = saved ? parseGarden(JSON.parse(saved)) : null;
        if (parsed) return parsed;
      } catch {
        // Try the untouched legacy save when the latest save is unreadable.
      }
    }
  } catch {
    // Storage can be unavailable in private or embedded browser contexts.
  }
  return createInitialGarden();
}
