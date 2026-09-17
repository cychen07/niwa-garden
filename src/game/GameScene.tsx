import { Line, OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Color,
  MOUSE,
  TOUCH,
  MathUtils,
  type Mesh,
  type BufferAttribute,
  type Group,
  type Points,
} from "three";
import {
  CENTER,
  GARDEN_SIZE,
  gardenBounds,
  clamp,
  heightAt,
  objectHeightAt,
  type EnvironmentState,
  type GardenObject,
  type GardenState,
  type GardenPoint,
  type Season,
} from "./model";
import { GardenInteraction, type InteractionProps } from "./GardenInteraction";
import { Terrain, toWorld } from "./Terrain";
import { Azalea, BambooFence, Bench, Cherry, Iris, Pagoda, Pavilion, Shishi, SteppingStones, Torii } from "./GardenElements";
import { MoreElement } from "./MoreElements";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { cameraFrame, CAMERA_TARGET, DEFAULT_CAMERA_POSITION, MIN_CAMERA_ELEVATION, TOP_CAMERA_POSITION, type CameraActionKind } from "./camera";

export interface GameSceneProps extends InteractionProps {
  environment: EnvironmentState;
  diameter: number;
  selectedId: string | null;
  placement: { rotation: number; scale: number };
  cameraAction: { id: number; kind: CameraActionKind };
  readOnly?: boolean;
  compact?: boolean;
  still?: boolean;
  focus?: GardenPoint | null;
}

function CameraControls({ mode, busy, action, gardenSize, compact, still, focus }: {
  mode: GameSceneProps["mode"]; busy: boolean; action: GameSceneProps["cameraAction"]; gardenSize: number;
  compact?: boolean; still?: boolean; focus?: GardenPoint | null;
}) {
  const { camera, size, invalidate } = useThree();
  const controls = useRef<OrbitControlsImpl>(null);
  const lastAction = useRef(0);
  const { zoom, offsetY } = cameraFrame(size.width, size.height, gardenSize, compact);

  useEffect(() => {
    if (camera.type === "OrthographicCamera") {
      camera.zoom = zoom;
      if ("setViewOffset" in camera) {
        (camera as import("three").OrthographicCamera).setViewOffset(
          size.width, size.height, 0, offsetY, size.width, size.height,
        );
      }
      camera.updateProjectionMatrix();
      invalidate();
    }
  }, [camera, zoom, size.width, size.height, offsetY, invalidate]);

  useEffect(() => {
    if (!focus || !controls.current) return;
    const target = controls.current.target;
    camera.position.x += focus.x - CENTER - target.x;
    camera.position.z += focus.z - CENTER - target.z;
    target.set(focus.x - CENTER, 0.45, focus.z - CENTER);
    camera.zoom = zoom * 1.65;
    camera.updateProjectionMatrix();
    controls.current.update();
  }, [focus, camera, zoom]);

  useEffect(() => {
    if (!action.id || lastAction.current === action.id) return;
    lastAction.current = action.id;
    const orbit = controls.current;
    const damping = orbit?.enableDamping ?? false;
    if (action.kind === "reset" || action.kind === "top") {
      // Flush orbit momentum before snapping to an exact view.
      if (orbit) { orbit.enableDamping = false; orbit.update(); }
      camera.position.set(...(action.kind === "top" ? TOP_CAMERA_POSITION : DEFAULT_CAMERA_POSITION));
      orbit?.target.set(...CAMERA_TARGET);
      camera.zoom = zoom;
    } else {
      camera.zoom = clamp(camera.zoom * (action.kind === "in" ? 1.2 : 1 / 1.2), zoom * 0.75, zoom * 3);
    }
    camera.updateProjectionMatrix();
    orbit?.update();
    if (orbit) orbit.enableDamping = damping;
    invalidate();
  }, [action, camera, zoom, invalidate]);

  return <OrbitControls
    ref={controls} makeDefault enabled={!still} enablePan={false} enableDamping={!busy}
    mouseButtons={{ LEFT: MOUSE.ROTATE, RIGHT: undefined, MIDDLE: MOUSE.ROTATE }}
    touches={{ ONE: mode === "orbit" ? TOUCH.ROTATE : undefined, TWO: TOUCH.DOLLY_ROTATE }}
    minPolarAngle={0} maxPolarAngle={Math.PI / 2 - MIN_CAMERA_ELEVATION}
    minZoom={zoom * 0.75} maxZoom={zoom * 3}
    zoomSpeed={0.65} rotateSpeed={0.5} target={CAMERA_TARGET}
  />;
}

const maplePalette: Record<Season, string[]> = {
  spring: ["#e8a6ad", "#f0c1bd", "#c87983"],
  summer: ["#477443", "#5f8a50", "#789d59"],
  autumn: ["#b73f2c", "#d86532", "#d89b3a"],
  winter: ["#9ea8a2", "#c6d3ce", "#6e7b76"],
};

function Maple({ season }: { season: Season }) {
  const colors = maplePalette[season];
  const winterScale = season === "winter" ? 0.66 : 1;
  return (
    <group>
      <mesh castShadow position={[0, 0.58, 0]}>
        <cylinderGeometry args={[0.1, 0.17, 1.2, 7]} />
        <meshStandardMaterial color="#72513b" roughness={1} />
      </mesh>
      <mesh castShadow position={[-0.2, 1.02, 0]} rotation={[0, 0, -0.58]}>
        <cylinderGeometry args={[0.04, 0.07, 0.68, 6]} />
        <meshStandardMaterial color="#76513a" roughness={1} />
      </mesh>
      {[
        [-0.34, 1.32, 0.05, 0],
        [0.2, 1.48, 0.05, 1],
        [0.42, 1.21, -0.08, 2],
        [-0.06, 1.68, -0.04, 1],
        [-0.5, 1.08, -0.05, 2],
      ].map(([x, y, z, colorIndex], index) => (
        <mesh
          key={index}
          castShadow
          position={[x, y, z]}
          scale={[0.62 * winterScale, 0.48 * winterScale, 0.6 * winterScale]}
          rotation={[index * 0.37, index * 0.61, 0]}
        >
          <dodecahedronGeometry args={[0.62, 0]} />
          <meshStandardMaterial color={colors[colorIndex]} roughness={0.92} />
        </mesh>
      ))}
    </group>
  );
}

function Pine({ season }: { season: Season }) {
  const color = season === "winter" ? "#46645c" : season === "autumn" ? "#3f6750" : "#315c46";
  return (
    <group>
      <mesh castShadow position={[0, 0.7, 0]}>
        <cylinderGeometry args={[0.1, 0.16, 1.4, 7]} />
        <meshStandardMaterial color="#604536" roughness={1} />
      </mesh>
      {[0.8, 1.16, 1.48].map((y, index) => (
        <mesh key={y} castShadow position={[0, y, 0]}>
          <coneGeometry args={[0.68 - index * 0.13, 0.8, 8]} />
          <meshStandardMaterial color={color} roughness={0.95} />
        </mesh>
      ))}
      {season === "winter" &&
        [0.82, 1.17, 1.5].map((y, index) => (
          <mesh key={`snow-${y}`} position={[0, y + 0.26, 0]}>
            <coneGeometry args={[0.62 - index * 0.12, 0.12, 8]} />
            <meshStandardMaterial color="#dbe4df" roughness={1} />
          </mesh>
        ))}
    </group>
  );
}

function Bamboo() {
  return (
    <group>
      {[
        [-0.24, 1.2, 0.06, 1],
        [0, 1.5, -0.05, 1.15],
        [0.22, 1.27, 0.08, 0.96],
        [-0.08, 1.05, 0.25, 0.88],
      ].map(([x, y, z, scale], index) => (
        <group key={index} position={[x, 0, z]} scale={scale}>
          <mesh castShadow position={[0, y / 2, 0]}>
            <cylinderGeometry args={[0.035, 0.048, y, 7]} />
            <meshStandardMaterial color={index % 2 ? "#65854d" : "#78954d"} roughness={0.8} />
          </mesh>
          {[0.38, 0.78, 1.12].map((node) =>
            node < y ? (
              <mesh key={node} position={[0, node, 0]}>
                <cylinderGeometry args={[0.052, 0.052, 0.025, 8]} />
                <meshStandardMaterial color="#47683e" />
              </mesh>
            ) : null,
          )}
        </group>
      ))}
      {[
        [-0.38, 0.96, 0.02, -0.7],
        [0.34, 1.24, 0.02, 0.7],
        [0.1, 0.78, 0.3, 0.2],
      ].map(([x, y, z, rotation], index) => (
        <mesh key={index} castShadow position={[x, y, z]} rotation={[0, rotation, 0.35]}>
          <sphereGeometry args={[0.22, 7, 5]} />
          <meshStandardMaterial color="#5c8346" roughness={1} />
        </mesh>
      ))}
    </group>
  );
}

function Rock() {
  return (
    <group>
      <mesh castShadow receiveShadow position={[0, 0.25, 0]} scale={[0.66, 0.5, 0.56]}>
        <dodecahedronGeometry args={[0.65, 0]} />
        <meshStandardMaterial color="#777b74" roughness={0.96} />
      </mesh>
      <mesh position={[-0.18, 0.44, 0.28]} scale={[0.18, 0.08, 0.13]}>
        <sphereGeometry args={[1, 7, 4]} />
        <meshStandardMaterial color="#6f805f" roughness={1} />
      </mesh>
    </group>
  );
}

function Lantern({ night }: { night: boolean }) {
  return (
    <group>
      <mesh castShadow position={[0, 0.08, 0]}>
        <cylinderGeometry args={[0.28, 0.34, 0.16, 8]} />
        <meshStandardMaterial color="#77796e" roughness={1} />
      </mesh>
      <mesh castShadow position={[0, 0.5, 0]}>
        <cylinderGeometry args={[0.09, 0.14, 0.76, 7]} />
        <meshStandardMaterial color="#85877d" roughness={1} />
      </mesh>
      <mesh castShadow position={[0, 0.92, 0]}>
        <boxGeometry args={[0.46, 0.34, 0.46]} />
        <meshStandardMaterial
          color={night ? "#d5b874" : "#93958c"}
          emissive={night ? "#f4b74d" : "#000000"}
          emissiveIntensity={night ? 1.6 : 0}
          roughness={0.86}
        />
      </mesh>
      <mesh castShadow position={[0, 1.15, 0]} rotation={[0, Math.PI / 4, 0]}>
        <coneGeometry args={[0.43, 0.22, 4]} />
        <meshStandardMaterial color="#6d7069" roughness={1} />
      </mesh>
      {night && <pointLight position={[0, 0.98, 0]} color="#ffb95a" intensity={1.3} distance={3} />}
    </group>
  );
}

function Basin() {
  return (
    <group>
      <mesh castShadow position={[0, 0.2, 0]}>
        <cylinderGeometry args={[0.38, 0.32, 0.4, 9]} />
        <meshStandardMaterial color="#797d74" roughness={1} />
      </mesh>
      <mesh position={[0, 0.405, 0]}>
        <cylinderGeometry args={[0.29, 0.29, 0.025, 9]} />
        <meshPhysicalMaterial color="#4d8e96" roughness={0.12} metalness={0.1} />
      </mesh>
      <mesh castShadow position={[0.18, 0.74, -0.1]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.035, 0.045, 0.7, 7]} />
        <meshStandardMaterial color="#75904f" roughness={0.8} />
      </mesh>
    </group>
  );
}

function Bridge() {
  return (
    <group>
      {Array.from({ length: 7 }, (_, index) => {
        const progress = index / 6;
        const x = -0.72 + progress * 1.44;
        const y = 0.2 + Math.sin(progress * Math.PI) * 0.22;
        const tilt = Math.cos(progress * Math.PI) * -0.22;
        return (
          <mesh key={index} castShadow position={[x, y, 0]} rotation={[0, 0, tilt]}>
            <boxGeometry args={[0.25, 0.09, 0.72]} />
            <meshStandardMaterial color="#a34b34" roughness={0.82} />
          </mesh>
        );
      })}
      {[-0.42, 0.42].map((z) => (
        <group key={z}>
          <mesh castShadow position={[0, 0.62, z]}>
            <boxGeometry args={[1.72, 0.07, 0.07]} />
            <meshStandardMaterial color="#8e3b2d" roughness={0.84} />
          </mesh>
          {[-0.68, 0, 0.68].map((x) => (
            <mesh key={x} castShadow position={[x, 0.42, z]}>
              <cylinderGeometry args={[0.035, 0.045, 0.56, 7]} />
              <meshStandardMaterial color="#8e3b2d" roughness={0.84} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

export function GardenObjectMesh({
  item,
  y,
  season,
  night,
  ghost = false,
}: {
  item: GardenObject;
  y: number;
  season: Season;
  night: boolean;
  ghost?: boolean;
}) {
  const group = useRef<Group>(null);
  useEffect(() => {
    if (!ghost) return;
    group.current?.traverse((object) => {
      if ("material" in object) {
        const mesh = object as Mesh;
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        materials.forEach((material) => { material.transparent = true; material.opacity = 0.5; material.depthWrite = false; });
      }
    });
  }, [ghost]);
  const content = ({
    maple: <Maple season={season} />,
    pine: <Pine season={season} />,
    bamboo: <Bamboo />,
    rock: <Rock />,
    lantern: <Lantern night={night} />,
    basin: <Basin />,
    bridge: <Bridge />,
    cherry: <Cherry season={season} />,
    azalea: <Azalea season={season} />,
    iris: <Iris />,
    stepping: <SteppingStones />,
    fence: <BambooFence />,
    torii: <Torii />,
    pavilion: <Pavilion />,
    bench: <Bench />,
    pagoda: <Pagoda />,
    shishi: <Shishi />,
  } as Partial<Record<GardenObject["kind"], React.ReactNode>>)[item.kind] ?? <MoreElement kind={item.kind} night={night} />;

  return (
    <group
      ref={group}
      userData={ghost ? {} : { objectId: item.id }}
      position={[item.x - CENTER, y, item.z - CENTER]}
      rotation={[0, item.rotation, 0]}
      scale={item.scale}
    >
      {content}
    </group>
  );
}

function WeatherParticles({ weather, gardenSize }: { weather: EnvironmentState["weather"]; gardenSize: number }) {
  const points = useRef<Points>(null);
  const count = weather === "rain" ? 850 : 500;
  const positions = useMemo(() => {
    const values = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      values[i * 3] = MathUtils.randFloatSpread(gardenSize + 4);
      values[i * 3 + 1] = Math.random() * 10 + 1;
      values[i * 3 + 2] = MathUtils.randFloatSpread(gardenSize + 4);
    }
    return values;
  }, [count, gardenSize]);

  useFrame((_, delta) => {
    if (!points.current) return;
    const attribute = points.current.geometry.attributes.position as BufferAttribute;
    const speed = weather === "rain" ? 8 : 1.15;
    for (let i = 0; i < attribute.count; i += 1) {
      let y = attribute.getY(i) - delta * speed;
      if (y < -0.2) y = 9 + Math.random() * 3;
      attribute.setY(i, y);
      if (weather === "snow") {
        attribute.setX(i, attribute.getX(i) + Math.sin(y * 1.8 + i) * delta * 0.08);
      }
    }
    attribute.needsUpdate = true;
  });

  if (weather === "clear") return null;

  return (
    <points ref={points}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        color={weather === "rain" ? "#b8d8df" : "#f3f7f4"}
        size={weather === "rain" ? 0.035 : 0.075}
        transparent
        opacity={0.78}
        depthWrite={false}
      />
    </points>
  );
}

function FloatingLeaves({ season }: { season: Season }) {
  const group = useRef<Group>(null);

  useFrame((state, delta) => {
    if (!group.current || (season !== "spring" && season !== "autumn")) return;
    group.current.rotation.y += delta * 0.04;
    group.current.position.y = 0.15 + Math.sin(state.clock.elapsedTime * 0.7) * 0.08;
  });

  if (season !== "spring" && season !== "autumn") return null;
  const color = season === "spring" ? "#e8acb5" : "#c65b32";

  return (
    <group ref={group}>
      {Array.from({ length: 18 }, (_, index) => {
        const angle = index * 2.399;
        const radius = 1.8 + (index % 5) * 0.72;
        return (
          <mesh
            key={index}
            position={[Math.cos(angle) * radius, 0.6 + (index % 4) * 0.45, Math.sin(angle) * radius]}
            rotation={[angle, angle * 0.5, angle]}
          >
            <planeGeometry args={[0.1, 0.055]} />
            <meshStandardMaterial color={color} side={2} />
          </mesh>
        );
      })}
    </group>
  );
}

function SurfaceRing({ garden, point, radius, color }: {
  garden: GardenState; point: GardenPoint; radius: number; color: string;
}) {
  const { min, max } = gardenBounds(garden.size);
  const points = Array.from({ length: 65 }, (_, index): [number, number, number] => {
    const angle = index / 64 * Math.PI * 2;
    const p = { x: clamp(point.x + Math.cos(angle) * radius, min, max), z: clamp(point.z + Math.sin(angle) * radius, min, max) };
    return toWorld(p, heightAt(garden, p) + 0.028);
  });
  return <Line points={points} color={color} lineWidth={1.7} depthTest={false} renderOrder={5} />;
}

function Scene(props: GameSceneProps) {
  const { garden, environment, mode, tool, diameter, selectedId, placement, cameraAction } = props;
  const [hovered, setHovered] = useState<GardenPoint | null>(null);
  const [busy, setBusy] = useState(false);
  const terrainRef = useRef<Mesh>(null);
  const objectsRef = useRef<Group>(null);
  useEffect(() => { setHovered(null); }, [garden.size, props.readOnly]);
  const selected = garden.objects.find((object) => object.id === selectedId);
  const dayFactor = Math.max(0, Math.sin(((environment.hour - 6) / 12) * Math.PI));
  const night = environment.hour < 6.5 || environment.hour > 18.5;
  const sky =
    environment.hour < 5 || environment.hour > 20
      ? "#172131"
      : environment.hour < 8
        ? "#cc8e76"
        : environment.hour > 17.5
          ? "#c97860"
          : "#adc8c7";
  const fog = new Color(sky).lerp(new Color("#d9ded5"), dayFactor * 0.12);
  return (
    <>
      <color attach="background" args={[sky]} />
      <fog attach="fog" args={[fog, Math.max(32, garden.size * 2 + 8), 80]} />
      <hemisphereLight
        intensity={0.38 + dayFactor * 1.15}
        color={night ? "#6d83ae" : "#f2e6cd"}
        groundColor="#283529"
      />
      <directionalLight
        castShadow
        onUpdate={(light) => light.shadow.camera.updateProjectionMatrix()}
        position={[7 * garden.size / GARDEN_SIZE, 10 * garden.size / GARDEN_SIZE, 5 * garden.size / GARDEN_SIZE]}
        color={night ? "#9db2dc" : "#ffe2b0"}
        intensity={0.25 + dayFactor * 2.1}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-far={Math.max(30, garden.size * 3)}
        shadow-camera-left={-Math.max(8, garden.size * 0.75)}
        shadow-camera-right={Math.max(8, garden.size * 0.75)}
        shadow-camera-top={Math.max(8, garden.size * 0.75)}
        shadow-camera-bottom={-Math.max(8, garden.size * 0.75)}
      />

      <mesh name="garden-foundation" position={[0, -0.31, 0]} receiveShadow>
        <boxGeometry args={[garden.size + 0.36, 0.3, garden.size + 0.36]} />
        <meshStandardMaterial color="#555f56" roughness={0.95} />
      </mesh>
      <mesh name="garden-plinth" position={[0, -0.49, 0]} receiveShadow>
        <boxGeometry args={[garden.size + 0.36, 0.06, garden.size + 0.36]} />
        <meshStandardMaterial color="#35413b" roughness={0.9} />
      </mesh>

      <Terrain garden={garden} meshRef={terrainRef} />
      <group ref={objectsRef}>
        {garden.objects.map((item) => (
          <GardenObjectMesh
            key={item.id}
            item={item}
            y={objectHeightAt(garden, item)}
            season={environment.season}
            night={night}
          />
        ))}
      </group>
      {selected && mode === "select" && <SurfaceRing garden={garden} point={selected} radius={selected.scale * 0.65} color="#f6cf78" />}
      {hovered && mode === "build" && <>
        <SurfaceRing garden={garden} point={hovered} radius={tool.kind === "place" ? placement.scale * 0.65 : diameter / 2} color={tool.kind === "erase" ? "#ec8b75" : "#f6f3dc"} />
        {tool.kind === "place" && <GardenObjectMesh
          key={`ghost-${tool.value}`} ghost
          item={{ id: "preview", kind: tool.value, ...hovered, ...placement }}
          y={objectHeightAt(garden, { ...hovered, kind: tool.value })} season={environment.season} night={night}
        />}
      </>}
      {!props.readOnly && <GardenInteraction {...props} terrainRef={terrainRef} objectsRef={objectsRef} onHover={setHovered} onBusy={setBusy} />}

      {!props.still && <FloatingLeaves season={environment.season} />}
      {!props.still && <WeatherParticles weather={environment.weather} gardenSize={garden.size} />}
      <CameraControls mode={mode} busy={busy} action={cameraAction} gardenSize={garden.size}
        compact={props.compact} still={props.still} focus={props.focus} />
    </>
  );
}

export function GameScene(props: GameSceneProps) {
  return (
    <Canvas
      className="garden-canvas"
      frameloop={props.still ? "demand" : "always"}
      orthographic
      shadows
      dpr={[1, 1.75]}
      camera={{ position: DEFAULT_CAMERA_POSITION, zoom: 52, near: 0.1, far: 100 }}
      gl={{ antialias: true, alpha: false, preserveDrawingBuffer: true }}
      onContextMenu={(event) => event.preventDefault()}
      role="application"
      aria-label="庭院画布"
    >
      <Scene {...props} />
    </Canvas>
  );
}
