import { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Line, Text } from '@react-three/drei';
import * as THREE from 'three';

interface Pt { lat: number; lng: number; alt: number; ts?: number; }

interface Props {
  points: Pt[];
  /** vertical exaggeration */
  zScale?: number;
}

/** Converts lat/lng/alt to local meters (x east, z south, y up) centered on first point. */
function toLocal(points: Pt[]) {
  if (points.length === 0) return [] as THREE.Vector3[];
  const lat0 = points[0].lat * Math.PI / 180;
  const mPerDegLat = 111_132;
  const mPerDegLng = 111_320 * Math.cos(lat0);
  const minAlt = Math.min(...points.map((p) => p.alt || 0));
  return points.map((p) => new THREE.Vector3(
    (p.lng - points[0].lng) * mPerDegLng,
    (p.alt || 0) - minAlt,
    -(p.lat - points[0].lat) * mPerDegLat,
  ));
}

function PathAndPacer({ vectors, zScale }: { vectors: THREE.Vector3[]; zScale: number }) {
  const scaled = useMemo(() => vectors.map((v) => new THREE.Vector3(v.x, v.y * zScale, v.z)), [vectors, zScale]);
  const ball = useRef<THREE.Mesh>(null);
  const tRef = useRef(0);

  useFrame((_, delta) => {
    if (scaled.length < 2 || !ball.current) return;
    tRef.current = (tRef.current + delta * 0.06) % 1;
    const idx = Math.floor(tRef.current * (scaled.length - 1));
    const p = scaled[idx];
    ball.current.position.copy(p);
  });

  if (scaled.length < 2) return null;

  return (
    <>
      <Line points={scaled} color="hsl(142, 70%, 50%)" lineWidth={3} />
      <mesh position={scaled[0]}><sphereGeometry args={[6, 16, 16]} /><meshStandardMaterial color="#22c55e" emissive="#22c55e" emissiveIntensity={0.6} /></mesh>
      <mesh position={scaled[scaled.length - 1]}><sphereGeometry args={[6, 16, 16]} /><meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={0.6} /></mesh>
      <mesh ref={ball}><sphereGeometry args={[5, 16, 16]} /><meshStandardMaterial color="#f59e0b" emissive="#f59e0b" emissiveIntensity={0.9} /></mesh>
    </>
  );
}

function GroundGrid({ size }: { size: number }) {
  return (
    <>
      <gridHelper args={[size, 20, '#334155', '#1e293b']} position={[0, -0.1, 0]} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.2, 0]} receiveShadow>
        <planeGeometry args={[size, size]} />
        <meshStandardMaterial color="#0b1220" roughness={1} />
      </mesh>
    </>
  );
}

export default function Replay3D({ points, zScale = 2 }: Props) {
  const vectors = useMemo(() => toLocal(points), [points]);
  const extent = useMemo(() => {
    if (vectors.length === 0) return 200;
    const xs = vectors.map((v) => v.x);
    const zs = vectors.map((v) => v.z);
    const ex = Math.max(Math.abs(Math.min(...xs)), Math.abs(Math.max(...xs)));
    const ez = Math.max(Math.abs(Math.min(...zs)), Math.abs(Math.max(...zs)));
    return Math.max(200, Math.max(ex, ez) * 2.2);
  }, [vectors]);

  if (points.length < 2) {
    return <div className="text-xs text-muted-foreground p-4 text-center">No track data to replay.</div>;
  }

  const camDist = extent * 0.9;
  return (
    <div className="h-[360px] w-full rounded-lg overflow-hidden bg-[#0b1220] border border-border/30">
      <Canvas camera={{ position: [camDist, camDist * 0.7, camDist], fov: 45 }} shadows>
        <ambientLight intensity={0.5} />
        <directionalLight position={[200, 400, 200]} intensity={1.2} castShadow />
        <GroundGrid size={extent} />
        <PathAndPacer vectors={vectors} zScale={zScale} />
        <Text position={[0, 30, 0]} fontSize={14} color="#94a3b8">N ↑</Text>
        <OrbitControls enableDamping makeDefault />
      </Canvas>
    </div>
  );
}
