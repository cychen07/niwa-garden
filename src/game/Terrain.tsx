import { useFrame } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, type RefObject } from "react";
import {
  BufferAttribute, BufferGeometry, CanvasTexture, CatmullRomCurve3, Color,
  DoubleSide, Mesh, MeshStandardMaterial, PlaneGeometry, Vector3,
} from "three";
import { CENTER, gardenBounds, terrainGrid, type GardenState, type RakeMark } from "./model";

const colors = {
  grass: new Color("#7c965d"),
  moss: new Color("#476a49"),
  sand: new Color("#e3d5b0"),
  water: new Color("#579aa4"),
};

function drawMark(context: CanvasRenderingContext2D, mark: RakeMark, resolution: number, gardenSize: number) {
  const pixels = resolution / gardenSize;
  const { min } = gardenBounds(gardenSize);
  context.save();
  if (mark.clip) {
    context.beginPath();
    context.rect((mark.clip.min - min) * pixels, (mark.clip.min - min) * pixels,
      (mark.clip.max - mark.clip.min) * pixels, (mark.clip.max - mark.clip.min) * pixels);
    context.clip();
  }
  const path = mark.points.map((point) => new Vector3(point.x, 0, point.z));
  const length = path.reduce((total, point, index) => index ? total + point.distanceTo(path[index - 1]) : 0, 0);
  const points = length < 0.01 ? path : new CatmullRomCurve3(path, false, "centripetal")
    .getSpacedPoints(Math.max(2, Math.min(2048, Math.ceil(length / 0.04))));
  const teeth = mark.kind === "clear" ? 1 : Math.max(3, Math.min(15, Math.round(mark.width / 0.14)));
  context.strokeStyle = mark.kind === "clear" ? "#000" : "#fff";
  context.lineCap = "round";
  context.lineJoin = "round";
  context.lineWidth = mark.kind === "clear" ? mark.width * pixels : Math.max(1.2, pixels * 0.018);
  for (let tooth = 0; tooth < teeth; tooth += 1) {
    const offset = teeth === 1 ? 0 : (tooth / (teeth - 1) - 0.5) * mark.width * 0.88;
    context.beginPath();
    points.forEach((point, index) => {
      const next = points[Math.min(index + 1, points.length - 1)];
      const previous = points[Math.max(0, index - 1)];
      const dx = next.x - previous.x, dz = next.z - previous.z;
      const norm = Math.hypot(dx, dz) || 1;
      const x = (point.x - min - dz / norm * offset) * pixels;
      const z = (point.z - min + dx / norm * offset) * pixels;
      if (index === 0) context.moveTo(x, z);
      else context.lineTo(x, z);
    });
    context.stroke();
  }
  context.restore();
}

export function Terrain({ garden, meshRef }: { garden: GardenState; meshRef: RefObject<Mesh | null> }) {
  const size = garden.size;
  const geometry = useMemo(() => {
    const { segments, side } = terrainGrid(size);
    const result = new PlaneGeometry(size, size, segments, segments);
    result.rotateX(-Math.PI / 2);
    const count = side ** 2;
    result.setAttribute("color", new BufferAttribute(new Float32Array(count * 3), 3));
    result.setAttribute("sandWeight", new BufferAttribute(new Float32Array(count), 1));
    result.setAttribute("waterWeight", new BufferAttribute(new Float32Array(count), 1));
    return result;
  }, [size]);
  const rake = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size > 11 ? 2048 : 1024;
    return { canvas, texture: new CanvasTexture(canvas) };
  }, [size]);
  const clock = useMemo(() => ({ value: 0 }), []);
  const material = useMemo(() => {
    const result = new MeshStandardMaterial({ vertexColors: true, roughness: 0.92 });
    result.onBeforeCompile = (shader) => {
      shader.uniforms.uRakeMap = { value: rake.texture };
      shader.uniforms.uGardenTime = clock;
      shader.vertexShader = `
        attribute float sandWeight;
        attribute float waterWeight;
        varying vec2 vGardenUv;
        varying float vSand;
        varying float vWater;
      ` + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", `
        #include <begin_vertex>
        vGardenUv = vec2(position.x / ${size.toFixed(1)} + 0.5, 0.5 - position.z / ${size.toFixed(1)});
        vSand = sandWeight;
        vWater = waterWeight;
      `);
      shader.fragmentShader = `
        uniform sampler2D uRakeMap;
        uniform float uGardenTime;
        varying vec2 vGardenUv;
        varying float vSand;
        varying float vWater;
      ` + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace("#include <color_fragment>", `
        #include <color_fragment>
        float groove = texture2D(uRakeMap, vGardenUv).r;
        float edge = texture2D(uRakeMap, vGardenUv + vec2(0.0012, 0.0012)).r;
        diffuseColor.rgb *= 1.0 - groove * vSand * 0.28 + edge * vSand * 0.10;
        float ripple = sin(vGardenUv.x * 140.0 + sin(vGardenUv.y * 70.0 + uGardenTime * 0.6) * 2.0 + uGardenTime);
        diffuseColor.rgb += vWater * (0.03 + 0.04 * pow(max(0.0, ripple), 10.0));
      `);
      shader.fragmentShader = shader.fragmentShader.replace("#include <roughnessmap_fragment>", `
        #include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.28, vWater);
      `);
    };
    result.customProgramCacheKey = () => `niwa-continuous-terrain-v3-${size}`;
    return result;
  }, [clock, rake.texture, size]);

  useLayoutEffect(() => {
    const position = geometry.attributes.position;
    const color = geometry.attributes.color;
    const sand = geometry.attributes.sandWeight;
    const water = geometry.attributes.waterWeight;
    garden.terrain.heights.forEach((height, index) => {
      position.setY(index, height);
      const surface = garden.terrain.surfaces[index];
      const c = colors[surface];
      const variation = surface === "water" ? 1 : 0.97 + Math.sin(index * 12.98) * 0.018;
      color.setXYZ(index, c.r * variation, c.g * variation, c.b * variation);
      sand.setX(index, surface === "sand" ? 1 : 0);
      water.setX(index, surface === "water" ? 1 : 0);
    });
    position.needsUpdate = color.needsUpdate = sand.needsUpdate = water.needsUpdate = true;
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
  }, [garden.terrain, geometry]);

  useLayoutEffect(() => {
    const context = rake.canvas.getContext("2d");
    if (!context) return;
    context.fillStyle = "#000";
    context.fillRect(0, 0, rake.canvas.width, rake.canvas.height);
    garden.marks.forEach((mark) => drawMark(context, mark, rake.canvas.width, size));
    rake.texture.needsUpdate = true;
  }, [garden.marks, rake, size]);

  useFrame((state) => { clock.value = state.clock.elapsedTime; });
  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
    rake.texture.dispose();
  }, [geometry, material, rake]);

  return (
    <>
      <mesh ref={meshRef} name="garden-terrain" geometry={geometry} material={material} receiveShadow />
      <TerrainSkirt garden={garden} />
    </>
  );
}

function TerrainSkirt({ garden }: { garden: GardenState }) {
  const geometry = useMemo(() => {
    const { segments, side } = terrainGrid(garden.size);
    const perimeter: number[] = [];
    for (let x = 0; x <= segments; x += 1) perimeter.push(x);
    for (let z = 1; z <= segments; z += 1) perimeter.push(z * side + segments);
    for (let x = segments - 1; x >= 0; x -= 1) perimeter.push(segments * side + x);
    for (let z = segments - 1; z >= 0; z -= 1) perimeter.push(z * side);
    const positions: number[] = [], indices: number[] = [];
    perimeter.forEach((index, i) => {
      const x = index % side / segments * garden.size - garden.size / 2;
      const z = Math.floor(index / side) / segments * garden.size - garden.size / 2;
      positions.push(x, garden.terrain.heights[index], z, x, -0.2, z);
      if (i) indices.push(i * 2 - 2, i * 2 - 1, i * 2, i * 2, i * 2 - 1, i * 2 + 1);
    });
    const last = (perimeter.length - 1) * 2;
    indices.push(last, last + 1, 0, 0, last + 1, 1);
    const result = new BufferGeometry();
    result.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
    result.setIndex(indices);
    result.computeVertexNormals();
    return result;
  }, [garden.terrain.heights, garden.size]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh geometry={geometry}><meshStandardMaterial color="#5b6348" side={DoubleSide} roughness={1} /></mesh>;
}

export function toWorld(point: { x: number; z: number }, y: number): [number, number, number] {
  return [point.x - CENTER, y, point.z - CENTER];
}
