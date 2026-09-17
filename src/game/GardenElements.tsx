import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { Group } from "three";
import type { Season } from "./model";

export function Cherry({ season }: { season: Season }) {
  const blossom = season === "spring";
  const winter = season === "winter";
  const colors = blossom ? ["#efb8cc", "#f7d8df", "#d88da9"] :
    winter ? ["#cbd9d3", "#e2e9e4", "#a4b7ad"] :
    season === "autumn" ? ["#c68b4b", "#d8a667", "#9e693b"] : ["#719654", "#93b96f", "#567c48"];
  return <group>
    <mesh castShadow position={[0, 0.68, 0]} rotation={[0, 0, 0.08]}>
      <cylinderGeometry args={[0.085, 0.16, 1.36, 8]} />
      <meshStandardMaterial color="#6a4b45" roughness={1} />
    </mesh>
    {[-1, 1].map((side) => <mesh key={side} castShadow position={[side * 0.2, 1.08, 0]} rotation={[0, 0, side * -0.65]}>
      <cylinderGeometry args={[0.045, 0.075, 0.76, 7]} />
      <meshStandardMaterial color="#70514b" roughness={1} />
    </mesh>)}
    {Array.from({ length: 9 }, (_, index) => {
      const angle = index * 2.4;
      const spread = index % 3 === 0 ? 0.13 : 0.5;
      return <mesh key={index} castShadow position={[Math.cos(angle) * spread, 1.42 + (index % 3) * 0.18, Math.sin(angle) * spread]}
        scale={[0.58, winter ? 0.22 : 0.4, 0.52]}>
        <icosahedronGeometry args={[1, 1]} />
        <meshStandardMaterial color={colors[index % colors.length]} roughness={1} />
      </mesh>;
    })}
  </group>;
}

export function Azalea({ season }: { season: Season }) {
  return <group>
    {[[-0.27, 0.21, 0], [0.25, 0.25, 0.06], [0, 0.31, -0.15]].map(([x, y, z], index) => <mesh
      key={index} castShadow position={[x, y, z]} scale={[0.4, 0.28, 0.37]}>
      <icosahedronGeometry args={[1, 1]} />
      <meshStandardMaterial color={season === "winter" ? "#718574" : "#3e724e"} roughness={1} />
    </mesh>)}
    {season !== "winter" && Array.from({ length: 12 }, (_, index) => {
      const angle = index * 2.4;
      const radius = index % 3 === 0 ? 0.18 : 0.4;
      return <mesh key={index} position={[Math.cos(angle) * radius, 0.39 + (index % 3) * 0.045, Math.sin(angle) * radius * 0.7]}>
        <icosahedronGeometry args={[0.085, 0]} />
        <meshStandardMaterial color={index % 2 ? "#df6d99" : "#f09dc0"} roughness={0.9} />
      </mesh>;
    })}
  </group>;
}

export function Iris() {
  return <group>
    {[-0.25, 0, 0.24].map((x, index) => <group key={x} position={[x, 0, index % 2 * 0.15]}>
      <mesh castShadow position={[0, 0.31 + index * 0.04, 0]}>
        <cylinderGeometry args={[0.012, 0.018, 0.64 + index * 0.08, 5]} />
        <meshStandardMaterial color="#527e50" />
      </mesh>
      {[-1, 1].map((side) => <mesh key={side} position={[side * 0.08, 0.26, 0]} rotation={[0.25, 0, side * -0.2]} scale={[0.045, 0.33, 0.023]}>
        <sphereGeometry args={[1, 5, 5]} /><meshStandardMaterial color="#528457" roughness={1} />
      </mesh>)}
      {[0, 1, 2].map((petal) => <group key={petal} position={[0, 0.66 + index * 0.08, 0]} rotation={[0, petal * Math.PI * 2 / 3, 0]}>
        <mesh position={[0, 0, 0.09]} rotation={[0.6, 0, 0]} scale={[0.075, 0.035, 0.16]}>
          <sphereGeometry args={[1, 7, 5]} /><meshStandardMaterial color={index % 2 ? "#7c83c2" : "#637abe"} />
        </mesh>
        <mesh position={[0, 0.06, 0.025]} scale={[0.035, 0.065, 0.025]}>
          <sphereGeometry args={[1, 6, 4]} /><meshStandardMaterial color="#e7c866" />
        </mesh>
      </group>)}
    </group>)}
  </group>;
}

export function SteppingStones() {
  return <group>
    {[-0.57, 0, 0.57].map((x, index) => <mesh key={x} castShadow receiveShadow
      position={[x, 0.045, index % 2 ? -0.08 : 0.07]} rotation={[0, index * 0.8, 0]} scale={[1, 1, 0.83]}>
      <cylinderGeometry args={[0.31, 0.33, 0.09, 7]} />
      <meshStandardMaterial color={index % 2 ? "#9aa197" : "#858e86"} roughness={1} />
    </mesh>)}
  </group>;
}

export function BambooFence() {
  return <group>
    {Array.from({ length: 9 }, (_, index) => <group key={index} position={[(index - 4) * 0.2, 0, 0]}>
      <mesh castShadow position={[0, 0.46, 0]}>
        <cylinderGeometry args={[0.035, 0.045, index % 4 === 0 ? 1.0 : 0.88, 7]} />
        <meshStandardMaterial color={index % 2 ? "#93a166" : "#abb576"} roughness={0.95} />
      </mesh>
      {[0.22, 0.68].map((height) => <mesh key={height} position={[0, height, 0.045]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.047, 0.009, 4, 8]} /><meshStandardMaterial color="#3d5140" />
      </mesh>)}
    </group>)}
    {[0.22, 0.68].map((height) => <mesh key={height} castShadow position={[0, height, -0.035]} rotation={[0, 0, Math.PI / 2]}>
      <cylinderGeometry args={[0.035, 0.035, 1.9, 7]} />
      <meshStandardMaterial color="#818f57" roughness={0.95} />
    </mesh>)}
  </group>;
}

export function Torii() {
  return <group>
    {[-0.72, 0.72].map((x) => <group key={x} position={[x, 0, 0]}>
      <mesh castShadow position={[0, 0.86, 0]}>
        <cylinderGeometry args={[0.075, 0.095, 1.72, 9]} /><meshStandardMaterial color="#b74635" roughness={0.8} />
      </mesh>
      <mesh castShadow position={[0, 0.13, 0]}>
        <cylinderGeometry args={[0.097, 0.11, 0.26, 9]} /><meshStandardMaterial color="#414540" roughness={1} />
      </mesh>
    </group>)}
    <mesh castShadow position={[0, 1.4, 0]}>
      <boxGeometry args={[1.95, 0.12, 0.14]} /><meshStandardMaterial color="#bd5039" roughness={0.8} />
    </mesh>
    <mesh castShadow position={[0, 1.76, 0]}>
      <boxGeometry args={[2.15, 0.16, 0.26]} /><meshStandardMaterial color="#b74635" roughness={0.8} />
    </mesh>
    <mesh castShadow position={[0, 1.89, 0]}>
      <boxGeometry args={[2.34, 0.12, 0.33]} /><meshStandardMaterial color="#353d39" roughness={0.95} />
    </mesh>
    <mesh castShadow position={[0, 1.55, 0.1]}>
      <boxGeometry args={[0.22, 0.34, 0.08]} /><meshStandardMaterial color="#d5b765" roughness={0.8} />
    </mesh>
  </group>;
}

export function Pavilion() {
  return <group>
    <mesh castShadow receiveShadow position={[0, 0.11, 0]}>
      <boxGeometry args={[2.12, 0.22, 1.82]} /><meshStandardMaterial color="#777d70" roughness={1} />
    </mesh>
    {Array.from({ length: 9 }, (_, i) => <mesh key={i} receiveShadow position={[(i - 4) * 0.22, 0.24, 0]}>
      <boxGeometry args={[0.205, 0.045, 1.65]} /><meshStandardMaterial color={i % 2 ? "#ae8b61" : "#9d7e5a"} roughness={0.9} />
    </mesh>)}
    {[-0.85, 0.85].flatMap((x) => [-0.7, 0.7].map((z) => <mesh key={`${x}:${z}`} castShadow position={[x, 0.96, z]}>
      <boxGeometry args={[0.1, 1.44, 0.1]} /><meshStandardMaterial color="#795e46" roughness={1} />
    </mesh>))}
    <mesh castShadow position={[0, 1.76, 0]} rotation={[0, Math.PI / 4, 0]} scale={[1, 1, 0.86]}>
      <coneGeometry args={[1.88, 0.72, 4]} /><meshStandardMaterial color="#4f6865" roughness={0.95} />
    </mesh>
    <mesh castShadow position={[0, 1.41, 0]}>
      <boxGeometry args={[2.68, 0.075, 2.3]} /><meshStandardMaterial color="#344f4c" roughness={0.95} />
    </mesh>
    <mesh castShadow position={[0, 2.11, 0]}>
      <boxGeometry args={[0.85, 0.085, 0.11]} /><meshStandardMaterial color="#314944" roughness={0.95} />
    </mesh>
    <mesh castShadow position={[0, 0.54, -0.6]}>
      <boxGeometry args={[1.68, 0.08, 0.32]} /><meshStandardMaterial color="#9f8058" roughness={1} />
    </mesh>
    <mesh castShadow position={[0, 0.065, 1.03]}>
      <boxGeometry args={[0.8, 0.13, 0.3]} /><meshStandardMaterial color="#858b7c" roughness={1} />
    </mesh>
  </group>;
}

export function Bench() {
  return <group>
    {[-0.46, 0.46].map((x) => <mesh key={x} castShadow position={[x, 0.18, 0]}>
      <boxGeometry args={[0.11, 0.36, 0.4]} /><meshStandardMaterial color="#4c5c53" roughness={1} />
    </mesh>)}
    {[-0.14, 0, 0.14].map((z, index) => <mesh key={z} castShadow position={[0, 0.4, z]}>
      <boxGeometry args={[1.35, 0.07, 0.12]} /><meshStandardMaterial color={index % 2 ? "#be995f" : "#a88c61"} roughness={0.9} />
    </mesh>)}
  </group>;
}

export function Pagoda() {
  return <group>
    <mesh castShadow position={[0, 0.09, 0]}>
      <boxGeometry args={[0.65, 0.18, 0.65]} /><meshStandardMaterial color="#858d82" roughness={1} />
    </mesh>
    {[0.42, 0.85, 1.25].map((height, index) => <group key={height}>
      <mesh castShadow position={[0, height - 0.13, 0]}>
        <boxGeometry args={[0.32 - index * 0.04, 0.28, 0.32 - index * 0.04]} />
        <meshStandardMaterial color="#a4ad9d" roughness={1} />
      </mesh>
      <mesh castShadow position={[0, height + 0.045, 0]} rotation={[0, Math.PI / 4, 0]}>
        <coneGeometry args={[0.53 - index * 0.08, 0.24, 4]} />
        <meshStandardMaterial color="#737f73" roughness={1} />
      </mesh>
    </group>)}
    <mesh castShadow position={[0, 1.53, 0]}><sphereGeometry args={[0.07, 8, 6]} /><meshStandardMaterial color="#929f8f" /></mesh>
  </group>;
}

export function Shishi() {
  const tube = useRef<Group>(null);
  useFrame((state) => { if (tube.current) tube.current.rotation.z = -0.22 + Math.max(0, Math.sin(state.clock.elapsedTime * 0.65)) ** 8 * 0.72; });
  return <group>
    <mesh castShadow position={[0, 0.08, 0]} scale={[0.6, 0.14, 0.38]}>
      <icosahedronGeometry args={[1, 1]} /><meshStandardMaterial color="#8a9387" roughness={1} />
    </mesh>
    {[-0.13, 0.13].map((z) => <mesh key={z} castShadow position={[0, 0.39, z]}>
      <cylinderGeometry args={[0.025, 0.033, 0.66, 7]} /><meshStandardMaterial color="#8a9a58" roughness={0.85} />
    </mesh>)}
    <group ref={tube} position={[0, 0.65, 0]}>
      <mesh castShadow rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.07, 0.07, 0.95, 9]} /><meshStandardMaterial color="#b3be76" roughness={0.85} />
      </mesh>
      <mesh position={[-0.479, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.052, 0.052, 0.005, 9]} /><meshStandardMaterial color="#3e5843" />
      </mesh>
    </group>
    <mesh castShadow position={[-0.56, 0.54, -0.22]}>
      <cylinderGeometry args={[0.03, 0.037, 1.08, 7]} /><meshStandardMaterial color="#8e9f5e" />
    </mesh>
    <mesh castShadow position={[-0.43, 1.03, -0.08]} rotation={[Math.PI / 2, 0, -0.2]}>
      <cylinderGeometry args={[0.03, 0.03, 0.39, 7]} /><meshStandardMaterial color="#a4b573" />
    </mesh>
    <mesh position={[-0.4, 0.86, 0.08]}>
      <cylinderGeometry args={[0.008, 0.01, 0.27, 5]} /><meshStandardMaterial color="#a1d2cf" transparent opacity={0.75} />
    </mesh>
  </group>;
}
