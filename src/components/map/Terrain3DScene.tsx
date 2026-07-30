import { useEffect, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import type { LatLngTuple } from 'leaflet';
import type { RouteStation } from '@/lib/map-data';

const TILE = {
  zoom: 13,
  x: 6857,
  y: 3770,
  west: 121.3330078125,
  east: 121.376953125,
  north: 14.179186142354176,
  south: 14.136575651477944,
};

type TerrainModel = {
  group: THREE.Group;
  minElevation: number;
  maxElevation: number;
  sampleCount: number;
};

interface Terrain3DSceneProps {
  routePath: LatLngTuple[];
  stations: RouteStation[];
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Unable to load ${src}`));
    image.src = src;
  });
}

function terrariumElevation(data: Uint8ClampedArray, width: number, x: number, y: number) {
  const pixel = (Math.max(0, Math.min(width - 1, y)) * width + Math.max(0, Math.min(width - 1, x))) * 4;
  return data[pixel] * 256 + data[pixel + 1] + data[pixel + 2] / 256 - 32768;
}

function routeTilePosition(lat: number, lng: number) {
  const scale = 2 ** TILE.zoom;
  const tileX = ((lng + 180) / 360) * scale;
  const latitudeRadians = lat * Math.PI / 180;
  const tileY = (1 - Math.asinh(Math.tan(latitudeRadians)) / Math.PI) / 2 * scale;
  return {
    u: tileX - TILE.x,
    v: tileY - TILE.y,
  };
}

function disposeGroup(group: THREE.Group) {
  group.traverse((object) => {
    if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
      object.geometry?.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach((material) => {
        if (material instanceof THREE.MeshStandardMaterial && material.map) material.map.dispose();
        material.dispose();
      });
    }
  });
}

async function buildTerrain(
  routePath: LatLngTuple[],
  stations: RouteStation[],
  sampleCount: number,
): Promise<TerrainModel> {
  const [demImage, mapImage] = await Promise.all([
    loadImage('/terrain/kalisungan-dem.png'),
    loadImage('/terrain/kalisungan-map.png'),
  ]);

  const demCanvas = document.createElement('canvas');
  demCanvas.width = demImage.naturalWidth;
  demCanvas.height = demImage.naturalHeight;
  const demContext = demCanvas.getContext('2d', { willReadFrequently: true });
  if (!demContext) throw new Error('Canvas elevation decoding is unavailable.');
  demContext.drawImage(demImage, 0, 0);
  const demPixels = demContext.getImageData(0, 0, demCanvas.width, demCanvas.height).data;

  const centerLatitude = (TILE.north + TILE.south) / 2;
  const earthCircumference = 2 * Math.PI * 6378137;
  const widthMeters = earthCircumference * Math.cos(centerLatitude * Math.PI / 180) / (2 ** TILE.zoom);
  const heightMeters = widthMeters;
  const elevations = new Float32Array(sampleCount * sampleCount);
  let minElevation = Number.POSITIVE_INFINITY;
  let maxElevation = Number.NEGATIVE_INFINITY;

  for (let row = 0; row < sampleCount; row++) {
    const v = row / (sampleCount - 1);
    const sourceY = Math.round(v * (demCanvas.height - 1));
    for (let column = 0; column < sampleCount; column++) {
      const u = column / (sampleCount - 1);
      const sourceX = Math.round(u * (demCanvas.width - 1));
      const elevation = terrariumElevation(demPixels, demCanvas.width, sourceX, sourceY);
      elevations[row * sampleCount + column] = elevation;
      minElevation = Math.min(minElevation, elevation);
      maxElevation = Math.max(maxElevation, elevation);
    }
  }

  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(sampleCount * sampleCount * 3);
  const uvs = new Float32Array(sampleCount * sampleCount * 2);
  let positionOffset = 0;
  let uvOffset = 0;
  for (let row = 0; row < sampleCount; row++) {
    const v = row / (sampleCount - 1);
    for (let column = 0; column < sampleCount; column++) {
      const u = column / (sampleCount - 1);
      positions[positionOffset++] = (u - 0.5) * widthMeters;
      positions[positionOffset++] = elevations[row * sampleCount + column] - minElevation;
      positions[positionOffset++] = (v - 0.5) * heightMeters;
      uvs[uvOffset++] = u;
      uvs[uvOffset++] = 1 - v;
    }
  }

  const triangleCount = (sampleCount - 1) * (sampleCount - 1) * 2;
  const indices = new Uint16Array(triangleCount * 3);
  let indexOffset = 0;
  for (let row = 0; row < sampleCount - 1; row++) {
    for (let column = 0; column < sampleCount - 1; column++) {
      const topLeft = row * sampleCount + column;
      const topRight = topLeft + 1;
      const bottomLeft = topLeft + sampleCount;
      const bottomRight = bottomLeft + 1;
      indices[indexOffset++] = topLeft;
      indices[indexOffset++] = bottomLeft;
      indices[indexOffset++] = topRight;
      indices[indexOffset++] = topRight;
      indices[indexOffset++] = bottomLeft;
      indices[indexOffset++] = bottomRight;
    }
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();

  const mapTexture = new THREE.Texture(mapImage);
  mapTexture.colorSpace = THREE.SRGBColorSpace;
  mapTexture.anisotropy = 2;
  mapTexture.needsUpdate = true;
  const terrainMaterial = new THREE.MeshStandardMaterial({
    map: mapTexture,
    roughness: 0.96,
    metalness: 0,
  });
  const terrain = new THREE.Mesh(geometry, terrainMaterial);

  const sampleElevation = (u: number, v: number) => {
    const sourceX = Math.round(Math.max(0, Math.min(1, u)) * (demCanvas.width - 1));
    const sourceY = Math.round(Math.max(0, Math.min(1, v)) * (demCanvas.height - 1));
    return terrariumElevation(demPixels, demCanvas.width, sourceX, sourceY);
  };
  const toWorldPoint = (lat: number, lng: number, lift = 0) => {
    const { u, v } = routeTilePosition(lat, lng);
    return new THREE.Vector3(
      (u - 0.5) * widthMeters,
      sampleElevation(u, v) - minElevation + lift,
      (v - 0.5) * heightMeters,
    );
  };

  const group = new THREE.Group();
  group.add(terrain);

  const validRoute = routePath.filter(([lat, lng]) => {
    const { u, v } = routeTilePosition(lat, lng);
    return Number.isFinite(lat) && Number.isFinite(lng) && u >= 0 && u <= 1 && v >= 0 && v <= 1;
  });
  if (validRoute.length >= 2) {
    const stride = Math.max(1, Math.ceil(validRoute.length / 240));
    const routePoints = validRoute
      .filter((_, index) => index % stride === 0 || index === validRoute.length - 1)
      .map(([lat, lng]) => toWorldPoint(lat, lng, 12));
    const curve = new THREE.CatmullRomCurve3(routePoints, false, 'centripetal');
    const routeGeometry = new THREE.TubeGeometry(
      curve,
      Math.min(480, Math.max(48, routePoints.length * 3)),
      7,
      5,
      false,
    );
    const routeMaterial = new THREE.MeshBasicMaterial({ color: '#0ea5e9' });
    group.add(new THREE.Mesh(routeGeometry, routeMaterial));
  }

  stations.forEach((station) => {
    const position = toWorldPoint(station.lat, station.lng, 22);
    const color = station.kind === 'peak' ? '#dc2626' : station.kind === 'jump_off' ? '#f59e0b' : '#16a34a';
    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(18, 10, 8),
      new THREE.MeshBasicMaterial({ color }),
    );
    marker.position.copy(position);
    group.add(marker);
  });

  return { group, minElevation, maxElevation, sampleCount };
}

function TerrainContent({
  routePath,
  stations,
  onReady,
}: Terrain3DSceneProps & { onReady: (model: TerrainModel) => void }) {
  const [model, setModel] = useState<TerrainModel | null>(null);
  const sampleCount = useMemo(() => {
    if (typeof window === 'undefined') return 96;
    return window.innerWidth < 768 ? 96 : 160;
  }, []);

  useEffect(() => {
    let active = true;
    let builtModel: TerrainModel | null = null;
    void buildTerrain(routePath, stations, sampleCount)
      .then((nextModel) => {
        builtModel = nextModel;
        if (active) {
          setModel(nextModel);
          onReady(nextModel);
        }
        else disposeGroup(nextModel.group);
      })
      .catch((error) => console.error('Unable to build 3D terrain', error));
    return () => {
      active = false;
      if (builtModel) disposeGroup(builtModel.group);
    };
  }, [onReady, routePath, sampleCount, stations]);

  if (!model) return null;
  return <primitive object={model.group} />;
}

export default function Terrain3DScene({ routePath, stations }: Terrain3DSceneProps) {
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  const [stats, setStats] = useState<TerrainModel | null>(null);
  return (
    <div className="relative h-full w-full" data-testid="terrain-3d-view">
      <Canvas
        frameloop="demand"
        dpr={[1, isMobile ? 1.15 : 1.4]}
        gl={{ antialias: !isMobile, powerPreference: 'high-performance', alpha: false }}
        style={{ width: '100%', height: '100%', background: '#dbe6df' }}
      >
        <color attach="background" args={['#dbe6df']} />
        <ambientLight intensity={1.3} />
        <directionalLight position={[1800, 3500, 2200]} intensity={2.2} />
        <hemisphereLight args={['#e8f2f0', '#52634d', 1.1]} />
        <PerspectiveCamera
          makeDefault
          position={isMobile ? [0, 5200, 7200] : [0, 2350, 3300]}
          fov={isMobile ? 52 : 43}
          near={5}
          far={16000}
        />
        <TerrainContent routePath={routePath} stations={stations} onReady={setStats} />
        <OrbitControls
          makeDefault
          target={[0, 260, 0]}
          enableDamping={false}
          enablePan
          minDistance={900}
          maxDistance={isMobile ? 10500 : 6500}
          minPolarAngle={0.25}
          maxPolarAngle={1.45}
        />
      </Canvas>
      {stats && (
        <div className="pointer-events-none absolute left-2 top-2 rounded bg-white/90 px-2 py-1 text-[10px] font-medium text-slate-700 shadow">
          {Math.round(stats.minElevation)}-{Math.round(stats.maxElevation)} m elevation · {stats.sampleCount}×{stats.sampleCount} mesh
        </div>
      )}
    </div>
  );
}
