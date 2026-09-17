import type { ObjectKind } from "./model";

const wood = "#876b50", stone = "#899489", foliage = "#528263";
function Box({ at, size, color = wood }: { at: [number, number, number]; size: [number, number, number]; color?: string }) {
  return <mesh position={at} castShadow receiveShadow><boxGeometry args={size} /><meshStandardMaterial color={color} roughness={0.92} /></mesh>;
}
function Ball({ at, scale, color }: { at: [number, number, number]; scale: [number, number, number]; color: string }) {
  return <mesh position={at} scale={scale} castShadow><icosahedronGeometry args={[1, 1]} /><meshStandardMaterial color={color} roughness={0.9} /></mesh>;
}
function Pole({ at, height, radius = 0.035, color = wood }: { at: [number, number, number]; height: number; radius?: number; color?: string }) {
  return <mesh position={at} castShadow><cylinderGeometry args={[radius, radius * 1.2, height, 8]} /><meshStandardMaterial color={color} /></mesh>;
}

export function MoreElement({ kind, night }: { kind: ObjectKind; night: boolean }) {
  switch (kind) {
    case "willow": return <group>
      <Pole at={[0, 0.75, 0]} height={1.5} radius={0.11} />
      <Ball at={[0, 1.8, 0]} scale={[0.9, 0.4, 0.85]} color="#7ba368" />
      {Array.from({ length: 12 }, (_, i) => {
        const a = i * Math.PI / 6;
        return <Ball key={i} at={[Math.cos(a) * 0.7, 1.28, Math.sin(a) * 0.7]} scale={[0.19, 0.7, 0.18]} color={i % 2 ? "#739e58" : "#5e915b"} />;
      })}
    </group>;
    case "plum": return <group>
      <Pole at={[0, 0.65, 0]} height={1.3} radius={0.075} color="#62504b" />
      {[-1, 1].map((s) => <group key={s} position={[s * 0.18, 1.05, 0]} rotation={[0, 0, s * -0.65]}>
        <Pole at={[0, 0, 0]} height={0.9} radius={0.04} color="#62504b" />
        {[0, 1, 2, 3].map((i) => <Ball key={i} at={[(i % 2 - 0.5) * 0.15, i * 0.2 - 0.2, 0]}
          scale={[0.19, 0.15, 0.18]} color={i % 2 ? "#c55b73" : "#e294a5"} />)}
      </group>)}
    </group>;
    case "hydrangea": return <group>
      <Ball at={[0, 0.25, 0]} scale={[0.48, 0.27, 0.42]} color="#486f52" />
      {[[-0.22, 0.49, 0], [0.21, 0.5, 0.1], [0, 0.57, -0.17]].map((p, i) =>
        <Ball key={i} at={p as [number, number, number]} scale={[0.24, 0.22, 0.24]} color={i % 2 ? "#b8c8ee" : "#889ed4"} />)}
    </group>;
    case "fern": return <group>{Array.from({ length: 9 }, (_, i) => <group key={i} rotation={[0, i * 2.4, 0]}>
      <mesh position={[0.2, 0.2, 0]} rotation={[0, 0, -0.7]} scale={[0.055, 0.35, 0.055]}>
        <sphereGeometry args={[1, 6, 5]} /><meshStandardMaterial color={i % 2 ? "#4e8657" : "#75a16c"} />
      </mesh>
    </group>)}</group>;
    case "lotus": return <group>
      {[[-0.15, 0.023, 0], [0.18, 0.02, 0.08]].map((p, i) => <mesh key={i} position={p as [number, number, number]} rotation={[-Math.PI / 2, 0, i]}>
        <circleGeometry args={[0.27, 20, 0.15, 5.8]} /><meshStandardMaterial color="#56947b" side={2} />
      </mesh>)}
      {Array.from({ length: 7 }, (_, i) => <group key={i} rotation={[0, i * Math.PI * 2 / 7, 0]}>
        <Ball at={[0.08, 0.13, 0]} scale={[0.14, 0.06, 0.055]} color={i % 2 ? "#f0bccb" : "#f8dfdb"} />
      </group>)}
    </group>;
    case "reed": return <group>{Array.from({ length: 9 }, (_, i) => <group key={i}
      position={[Math.cos(i * 2.4) * 0.2, 0, Math.sin(i * 2.4) * 0.2]} rotation={[0, i, (i % 3 - 1) * 0.18]}>
      <Pole at={[0, 0.46, 0]} height={0.92} radius={0.012} color="#7f9257" />
      <Ball at={[0, 0.96, 0]} scale={[0.035, 0.18, 0.035]} color="#c9c6a1" />
    </group>)}</group>;
    case "bonsai": return <group>
      <Box at={[0, 0.12, 0]} size={[0.72, 0.24, 0.5]} color="#597b80" />
      <Box at={[0, 0.244, 0]} size={[0.62, 0.01, 0.4]} color="#464b39" />
      <Pole at={[0, 0.5, 0]} height={0.56} radius={0.045} />
      {[[-0.24, 0.64, 0], [0.22, 0.79, 0], [0, 0.96, 0]].map((p, i) =>
        <Ball key={i} at={p as [number, number, number]} scale={[0.28, 0.12, 0.24]} color="#396a56" />)}
    </group>;
    case "stonepath": return <group>{[-0.62, 0, 0.62].map((x) => <Box key={x} at={[x, 0.035, 0]} size={[0.57, 0.07, 0.67]} color="#a3aba1" />)}</group>;
    case "wooddeck": return <group>
      <Box at={[0, 0.12, 0]} size={[1.9, 0.24, 1.65]} color="#5a6255" />
      {Array.from({ length: 9 }, (_, i) => <Box key={i} at={[(i - 4) * 0.21, 0.26, 0]} size={[0.19, 0.04, 1.65]} color={i % 2 ? "#b49a75" : "#a18965"} />)}
    </group>;
    case "wall": return <group>
      <Box at={[0, 0.14, 0]} size={[2.2, 0.28, 0.32]} color="#707d70" />
      <Box at={[0, 0.8, 0]} size={[2.15, 1.2, 0.2]} color="#dce2d7" />
      <Box at={[0, 1.43, 0]} size={[2.3, 0.12, 0.42]} color="#48615b" />
    </group>;
    case "gate": return <group>
      {[-0.8, 0.8].map((x) => <Box key={x} at={[x, 0.85, 0]} size={[0.13, 1.7, 0.14]} />)}
      <Box at={[0, 1.72, 0]} size={[2.05, 0.17, 0.32]} color="#4b6257" />
      {[-0.5, -0.25, 0, 0.25, 0.5].map((x) => <Box key={x} at={[x, 0.54, 0]} size={[0.07, 0.9, 0.06]} />)}
      <Box at={[0, 0.93, 0]} size={[1.35, 0.06, 0.08]} />
    </group>;
    case "pergola": return <group>
      {[-0.9, 0.9].flatMap((x) => [-0.75, 0.75].map((z) => <Box key={`${x}/${z}`} at={[x, 0.85, z]} size={[0.09, 1.7, 0.09]} />))}
      {[-0.75, -0.25, 0.25, 0.75].map((z) => <Box key={z} at={[0, 1.73, z]} size={[2.3, 0.08, 0.1]} />)}
      {[-0.7, 0, 0.7].map((x) => <Ball key={x} at={[x, 1.8, -0.5]} scale={[0.46, 0.15, 0.42]} color={foliage} />)}
      {[-0.8, -0.4, 0, 0.4, 0.8].map((x) => <Ball key={x} at={[x, 1.46, -0.6]} scale={[0.07, 0.22, 0.07]} color="#b4a3c6" />)}
    </group>;
    case "stonebridge": return <group>
      <Box at={[0, 0.3, 0]} size={[2.3, 0.14, 0.8]} color="#b1b7a8" />
      {[-0.9, 0.9].map((x) => <Box key={x} at={[x, 0.15, 0]} size={[0.35, 0.3, 0.8]} color={stone} />)}
    </group>;
    case "tallrock": return <Ball at={[0, 0.65, 0]} scale={[0.45, 0.8, 0.42]} color="#727d7a" />;
    case "pebble": return <group>{Array.from({ length: 7 }, (_, i) =>
      <Ball key={i} at={[Math.cos(i * 2.4) * 0.28, 0.06, Math.sin(i * 2.4) * 0.28]}
        scale={[0.12, 0.08, 0.1]} color={i % 2 ? "#b2b8ad" : "#8c9b96"} />)}</group>;
    case "paperlantern": return <group>
      <Pole at={[0, 0.72, 0]} height={1.44} radius={0.045} />
      <Box at={[0.2, 1.44, 0]} size={[0.48, 0.05, 0.06]} />
      <mesh position={[0.34, 1.15, 0]} castShadow>
        <sphereGeometry args={[0.23, 12, 10]} /><meshStandardMaterial color="#eadab0" emissive="#f3c277" emissiveIntensity={night ? 1.1 : 0} />
      </mesh>
      {[0.98, 1.3].map((y) => <mesh key={y} position={[0.34, y, 0]}><cylinderGeometry args={[0.13, 0.13, 0.025, 12]} /><meshStandardMaterial color="#635d4f" /></mesh>)}
    </group>;
    case "groundlamp": return <group>
      <Box at={[0, 0.06, 0]} size={[0.38, 0.12, 0.38]} color="#506762" />
      <mesh position={[0, 0.26, 0]}><boxGeometry args={[0.25, 0.29, 0.25]} /><meshStandardMaterial color="#eee1bd" emissive="#f3c277" emissiveIntensity={night ? 1.3 : 0} /></mesh>
      <Box at={[0, 0.43, 0]} size={[0.4, 0.06, 0.4]} color="#506762" />
    </group>;
    case "teatable": return <group>
      <Box at={[0, 0.34, 0]} size={[0.95, 0.065, 0.65]} />
      {[-0.36, 0.36].map((x) => <Box key={x} at={[x, 0.16, 0]} size={[0.06, 0.32, 0.45]} />)}
      <Ball at={[0, 0.46, 0]} scale={[0.12, 0.1, 0.12]} color="#446e76" />
      {[-0.28, 0.28].map((x) => <mesh key={x} position={[x, 0.41, 0.1]}><cylinderGeometry args={[0.05, 0.035, 0.07, 10]} /><meshStandardMaterial color="#e0e6d7" /></mesh>)}
    </group>;
    case "cushion": return <group>
      <Box at={[0, 0.07, 0]} size={[0.54, 0.14, 0.54]} color="#587c92" />
      <Box at={[0, 0.143, 0]} size={[0.44, 0.007, 0.44]} color="#698e9f" />
    </group>;
    case "umbrella": return <group>
      <Pole at={[0, 0.86, 0]} height={1.72} radius={0.03} />
      <mesh position={[0, 1.65, 0]} castShadow><coneGeometry args={[1.16, 0.38, 16]} /><meshStandardMaterial color="#b95555" side={2} /></mesh>
      <mesh position={[0, 1.48, 0]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[1.13, 16]} /><meshStandardMaterial color="#c58c78" side={2} /></mesh>
    </group>;
    default: return null;
  }
}
