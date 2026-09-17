import { terrainGrid, type GardenState, type GardenObject, type ObjectKind, type GardenPoint, type EnvironmentState } from "./model.ts";

export interface HintModule {
  id: string;
  name: string;
  focus: GardenPoint;
  materials: string;
  steps: string[];
}
export interface GardenTemplate {
  id: string;
  name: string;
  style: string;
  difficulty: string;
  garden: GardenState;
  environment: EnvironmentState;
  modules: HintModule[];
}
export function blankGarden(size: number): GardenState {
  const { side } = terrainGrid(size);
  return { version: 3, size, terrain: { heights: Array(side ** 2).fill(0.16), surfaces: Array(side ** 2).fill("grass") }, objects: [], marks: [] };
}
function make(id: string, size: number, surface: (x: number, z: number) => "grass" | "moss" | "sand" | "water",
  objects: [ObjectKind, number, number, number?, number?][]): GardenState {
  const garden = blankGarden(size);
  const { side, cellSize, min } = terrainGrid(size);
  garden.terrain.surfaces = garden.terrain.surfaces.map((_, i) => surface(min + i % side * cellSize, min + Math.floor(i / side) * cellSize));
  garden.objects = objects.map(([kind, x, z, rotation = 0, scale = 1], i): GardenObject => ({ id: `${id}-${i}`, kind, x, z, rotation, scale }));
  return garden;
}
const wallRow = (start: number, end: number, z: number): [ObjectKind, number, number][] =>
  Array.from({ length: Math.floor((end - start) / 2.1) + 1 }, (_, i) => ["wall", start + i * 2.1, z]);

const dry = make("dry", 13, (x, z) => z < 0.6 || z > 9.9 || x < 0.1 ? "moss" : "sand", [
  ...wallRow(0, 10.5, -0.8), ["pine", 0.6, 0.5, 0, 1.2], ["pine", 10, 0.7, 0, 0.85],
  ["tallrock", 3.2, 4.3, 0.5, 1.2], ["rock", 4.2, 4.9, 0.4, 1.1], ["rock", 2.4, 5.1, 1, 0.75],
  ["tallrock", 8, 6.2, 0.7, 0.75], ["rock", 8.7, 6.8, 0, 0.6],
  ["fern", 2.8, 4.8], ["fern", 8.3, 6.4, 0, 0.7], ["lantern", 0.4, 8.8],
  ["wooddeck", 4, 10.5], ["wooddeck", 5.9, 10.5], ["cushion", 4, 10.5], ["cushion", 5.8, 10.5],
]);
for (let x = 0.8; x < 10.5; x += 1.2) dry.marks.push({
  id: `dry-lines-${x}`, kind: "rake", width: 1.05, points: [{ x, z: 1 }, { x: x + 0.18, z: 5 }, { x, z: 9.4 }],
});

const tea = make("tea", 13, (x, z) => Math.abs(x - (3 + Math.sin(z * 0.65))) < 0.5 ? "sand" : "moss", [
  ...wallRow(0, 10.5, -0.8), ["gate", 3.1, 10.5], ["pavilion", 6.3, 2.5, 0, 1.3],
  ["stepping", 3.3, 8.6, 1.15], ["stepping", 2.1, 6.8, 1.6], ["stepping", 2.6, 4.9, 1],
  ["stepping", 4.1, 3.9, 0.2], ["basin", 1, 5.3], ["shishi", 0.2, 6.4],
  ["rock", 0.7, 4.5], ["pebble", 1.5, 5.7], ["bamboo", 0, 2], ["bamboo", 0.5, 3.1],
  ["maple", 9, 5.4, 0.7, 1.3], ["fern", 8.4, 6.3], ["azalea", 6.5, 8.8],
  ["lantern", 4.3, 7.2, 0, 0.8], ["paperlantern", 7.3, 4.3], ["fence", 10, 8, Math.PI / 2],
  ["fence", 10, 6, Math.PI / 2], ["teatable", 6.3, 2.6, 0, 0.75],
]);
const pond = make("pond", 17, (x, z) => {
  const inPond = ((x - 5) / 4.1) ** 2 + ((z - 5.2) / 4.9) ** 2 < 1;
  const bridgeBank = ((x - 5) / 1.8) ** 2 + ((z - 0.5) / 4.25) ** 2 < 1 ||
    ((x - 5) / 1.8) ** 2 + ((z - 11) / 4.8) ** 2 < 1;
  if (inPond) return bridgeBank ? "moss" : "water";
  return Math.abs(Math.hypot((x - 5) / 1.1, z - 5.2) - 5.9) < 0.48 ? "sand" : "grass";
}, [
  ["pavilion", -0.7, 2, 0, 1.2], ["willow", 10.4, 2, 0, 1.1], ["cherry", 0, 10, 0, 1.3],
  ["bridge", 5, 5.5, Math.PI / 2, 2], ["rock", 3.2, 2.8, 0, 1.3], ["tallrock", 2.3, 3.8],
  ["lotus", 7.2, 3.8], ["lotus", 7.8, 4.3], ["lotus", 6.8, 2.7],
  ["reed", 8.6, 8.7], ["iris", 8.8, 7.8], ["iris", 1.1, 6.3],
  ["pebble", 1.2, 7.1], ["pebble", 1.6, 7.8], ["stonepath", 4.8, 11.5],
  ["stonepath", 6.6, 11.1, -0.25], ["bench", 8, 10.7, -0.5], ["groundlamp", 9.5, 10.1],
  ["groundlamp", 10.8, 8.6], ["pagoda", -0.6, 7.3], ["hydrangea", -1.3, 5.5],
  ["pine", 8.8, -1.2], ["pine", 2, -1.4], ["azalea", 5, -0.7], ["umbrella", -0.8, -0.3, 0, 0.85],
]);
const court = make("court", 7, (x, z) => x > 6.8 ? "sand" : z > 6.8 ? "grass" : "moss", [
  ...wallRow(2.7, 7, 1.9), ["wall", 1.9, 3.3, Math.PI / 2], ["wall", 1.9, 5.5, Math.PI / 2],
  ["plum", 3.1, 3.1, 0.4, 1.1], ["basin", 6.1, 3.4], ["bamboo", 7.1, 2.8, 0, 0.85],
  ["fern", 3.5, 4.3], ["rock", 4.3, 3.5], ["stonepath", 5.4, 5.7, 0.5, 0.9],
  ["wooddeck", 4.7, 7.25], ["teatable", 4.6, 7.25, 0, 0.75], ["cushion", 5.5, 7.3, 0, 0.8],
  ["paperlantern", 6.6, 6.9], ["bonsai", 3.9, 7.2, 0, 0.7], ["pebble", 6.6, 3.8],
]);

export const templates: GardenTemplate[] = [
  { id: "dry", name: "白砂听松", style: "枯山水", difficulty: "入门", garden: dry,
    environment: { hour: 14, season: "summer", weather: "clear" }, modules: [
      { id: "stones", name: "三石组", focus: { x: 3.2, z: 4.5 }, materials: "立石 ×1 · 景石 ×2 · 蕨丛 ×1", steps: ["先放立石，缩放到1.2倍，旋转约30°。", "在右前方1格处放1.1倍景石，左前方放0.75倍景石。", "三块石头组成不等边三角形，在主石脚边补一丛蕨。"] },
      { id: "sand", name: "平行砂纹", focus: { x: 6, z: 5 }, materials: "白砂 · 砂纹画笔（直径1.05）", steps: ["在两侧苔地之间铺满白砂，保留前方平台。", "画笔直径约1，沿同一方向由后往前慢慢拖。", "相邻笔之间间隔约1.2格，先留出石组周边再补细节。"] },
      { id: "edge", name: "观景边缘", focus: { x: 5, z: 10.5 }, materials: "木平台 ×2 · 坐垫 ×2 · 白墙 ×6", steps: ["将两块木平台横向拼接，中心距离约1.9格。", "各放一个坐垫，朝向砂地保留空白视线。", "后方白墙以2.1格间距连成一排，角落用松树遮住接缝。"] },
    ] },
  { id: "tea", name: "竹露茶径", style: "露地茶庭", difficulty: "进阶", garden: tea,
    environment: { hour: 15, season: "autumn", weather: "clear" }, modules: [
      { id: "path", name: "曲折飞石", focus: { x: 3, z: 6.5 }, materials: "木庭门 ×1 · 飞石 ×4", steps: ["将庭门放在入口，先在心里连到茶亭入口。", "沿S形路线摆四组飞石，每组中心间隔约1.8格。", "旋转角度依次约65°、90°、55°、10°，避免一条直线望到底。"] },
      { id: "water", name: "蹲踞水钵", focus: { x: 1, z: 5.5 }, materials: "水钵 ×1 · 鹿威 ×1 · 景石 ×1 · 卵石簇 ×1", steps: ["在飞石左侧约1格处放水钵，给人留出停脚空间。", "鹿威摆在侧后方，与水钵间隔约1格。", "大石靠后、卵石靠前，用苔藓围住整个小组。"] },
      { id: "tea-house", name: "茶亭与遮景", focus: { x: 6.3, z: 2.5 }, materials: "茶亭 ×1 · 竹 ×2 · 枫 ×1", steps: ["茶亭放在步道终点，缩放1.3倍。", "入口朝向最后一组飞石，两丛竹放在背侧。", "枫树放在相对的侧边，让茶亭与树冠形成高低对比。"] },
    ] },
  { id: "pond", name: "春池回游", style: "池泉回游式", difficulty: "进阶", garden: pond,
    environment: { hour: 13, season: "spring", weather: "clear" }, modules: [
      { id: "pond", name: "曲岸池水", focus: { x: 5, z: 5 }, materials: "池水 · 卵石簇 ×2 · 立石 ×1", steps: ["用大笔刷铺出约8×10格的椭圆池面。", "切换小笔刷，收窄局部水面，让池岸稍有曲折。", "在一侧放主石，另一侧用两组卵石收边，避免左右完全对称。"] },
      { id: "bridge", name: "桥与水生植物", focus: { x: 5.5, z: 5.5 }, materials: "朱桥 ×1 · 睡莲 ×3 · 鸢尾 ×2", steps: ["朱桥旋转90°，缩放2倍，放在池中央的窄处。", "三丛睡莲疏密不等地放在桥的一侧，不占满水面。", "鸢尾贴岸摆放，保留桥端可通行的空地。"] },
      { id: "walk", name: "回游休息点", focus: { x: 8, z: 10.7 }, materials: "方石步道 ×2 · 长凳 ×1 · 地灯 ×2", steps: ["沿池岸外侧留约1格宽的路。", "两段石板路轻微转向，连到长凳正前方。", "地灯沿路线间隔约1.8格，长凳面向池心。"] },
    ] },
  { id: "court", name: "一坪梅影", style: "坪庭", difficulty: "入门", garden: court,
    environment: { hour: 16, season: "spring", weather: "clear" }, modules: [
      { id: "enclosure", name: "小院围合", focus: { x: 3, z: 3 }, materials: "白墙 ×5 · 梅树 ×1", steps: ["选7×7庭院，白墙在后方和左侧组成L形。", "墙之间保持约2.1格中心距离。", "梅树偏左摆在墙前，不放正中央，让中部有留白。"] },
      { id: "basin", name: "竹下水景", focus: { x: 6.4, z: 3.5 }, materials: "水钵 ×1 · 竹 ×1 · 卵石簇 ×1", steps: ["水钵位于右后角，但离墙约1格。", "竹放在水钵背后，缩放0.85倍。", "卵石靠水钵前方，补一点白砂将水景与苔地分开。"] },
      { id: "seat", name: "一人茶席", focus: { x: 4.9, z: 7.2 }, materials: "木平台 ×1 · 茶桌 ×1 · 坐垫 ×1 · 盆栽松 ×1", steps: ["木平台靠前摆，和苔地之间用石板步道衔接。", "茶桌缩放0.75倍，坐垫放侧边约0.9格处。", "小盆栽放另一端，纸灯放平台外侧。"] },
    ] },
];
