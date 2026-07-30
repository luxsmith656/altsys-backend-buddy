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

const SOURCE_TILES = [
  { column: 0, row: 0, dem: '/terrain/kalisungan-dem-nw.png', map: '/terrain/kalisungan-map-nw.png' },
  { column: 1, row: 0, dem: '/terrain/kalisungan-dem-ne.png', map: '/terrain/kalisungan-map-ne.png' },
  { column: 0, row: 1, dem: '/terrain/kalisungan-dem-sw.png', map: '/terrain/kalisungan-map-sw.png' },
  { column: 1, row: 1, dem: '/terrain/kalisungan-dem-se.png', map: '/terrain/kalisungan-map-se.png' },
] as const;

type TerrainModel = {
  group: THREE.Group;
  minElevation: number;
  maxElevation: number;
  relief: number;
  sampleCount: number;
};

interface Terrain3DSceneProps {
  routePath: LatLngTuple[];
  stations: RouteStation[];
  relief: number;
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
  const clampedX = Math.max(0, Math.min(width - 1, x));
  const clampedY = Math.max(0, Math.min(width - 1, y));
  const pixel = (clampedY * width + clampedX) * 4;
  return data[pixel] * 256 + data[pixel + 1] + data[pixel + 2] / 256 - 32768;
}

function interpolateElevation(data: Uint8ClampedArray, width: number, x: number, y: number) {
  const x0 = Math.floor(Math.max(0, Math.min(width - 1, x)));
  const y0 = Math.floor(Math.max(0, Math.min(width - 1, y)));
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(width - 1, y0 + 1);
  const tx = x - x0;
  const ty = y - y0;
  const top = THREE.MathUtils.lerp(
    terrariumElevation(data, width, x0, y0),
    terrariumElevation(data, width, x1, y0),
    tx,
  );
  const bottom = THREE.MathUtils.lerp(
    terrariumElevation(data, width, x0, y1),
    terrariumElevation(data, width, x1, y1),
    tx,
  );
  return THREE.MathUtils.lerp(top, bottom, ty);
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
    if (!(object instanceof THREE.Mesh || object instanceof THREE.Line)) return;
    object.geometry?.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => {
      if (material instanceof THREE.MeshStandardMaterial && material.map) material.map.dispose();
      material.dispose();
    });
  });
}

async function loadTerrainMosaics() {
  const loaded = await Promise.all(
    SOURCE_TILES.flatMap((tile) => [loadImage(tile.dem), loadImage(tile.map)]),
  );
  const sourceSize = loaded[0].naturalWidth;
  const mosaicSize = sourceSize * 2;
  const demCanvas = document.createElement('canvas');
  const mapCanvas = document.createElement('canvas');
  demCanvas.width = mosaicSize;
  demCanvas.height = mosaicSize;
  mapCanvas.width = mosaicSize;
  mapCanvas.height = mosaicSize;
  const demContext = demCanvas.getContext('2d', { willReadFrequently: true });
  const mapContext = mapCanvas.getContext('2d', { willReadFrequently: true });
  if (!demContext || !mapContext) throw new Error('Canvas terrain decoding is unavailable.');

  SOURCE_TILES.forEach((tile, index) => {
    const x = tile.column * sourceSize;
    const y = tile.row * sourceSize;
    demContext.drawImage(loaded[index * 2], x, y);
    mapContext.drawImage(loaded[index * 2 + 1], x, y);
  });

  return {
    demCanvas,
    demPixels: demContext.getImageData(0, 0, mosaicSize, mosaicSize).data,
    mapCanvas,
    mapContext,
  };
}

function applyTerrainShading(
  mapContext: CanvasRenderingContext2D,
  demPixels: Uint8ClampedArray,
  size: number,
  widthMeters: number,
) {
  const image = mapContext.getImageData(0, 0, size, size);
  const pixels = image.data;
  const metersPerPixel = widthMeters / (size - 1);
  const lightX = -0.527;
  const lightY = 0.748;
  const lightZ = -0.403;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const west = terrariumElevation(demPixels, size, x - 1, y);
      const east = terrariumElevation(demPixels, size, x + 1, y);
      const north = terrariumElevation(demPixels, size, x, y - 1);
      const south = terrariumElevation(demPixels, size, x, y + 1);
      const elevation = terrariumElevation(demPixels, size, x, y);
      const dzdx = (east - west) / (2 * metersPerPixel);
      const dzdz = (south - north) / (2 * metersPerPixel);
      const normalX = -dzdx * 2.4;
      const normalY = 1;
      const normalZ = -dzdz * 2.4;
      const normalScale = 1 / Math.sqrt(normalX * normalX + normalY * normalY + normalZ * normalZ);
      const illumination = Math.max(
        0.08,
        (normalX * lightX + normalY * lightY + normalZ * lightZ) * normalScale,
      );
      const steepness = Math.min(1, Math.sqrt(dzdx * dzdx + dzdz * dzdz) * 2.5);
      const normalizedElevation = THREE.MathUtils.clamp((elevation - 30) / 640, 0, 1);
      const highR = normalizedElevation > 0.74 ? 166 : 117;
      const highG = normalizedElevation > 0.74 ? 173 : 165;
      const highB = normalizedElevation > 0.74 ? 130 : 82;
      let terrainR = 47 + (highR - 47) * normalizedElevation;
      let terrainG = 111 + (highG - 111) * normalizedElevation;
      let terrainB = 66 + (highB - 66) * normalizedElevation;
      if (steepness > 0.55) {
        const rockMix = Math.min(0.7, (steepness - 0.55) * 0.85);
        terrainR += (119 - terrainR) * rockMix;
        terrainG += (122 - terrainG) * rockMix;
        terrainB += (107 - terrainB) * rockMix;
      }

      const offset = (y * size + x) * 4;
      const terrainMix = 0.28 + steepness * 0.18;
      const shade = 0.62 + illumination * 0.58;
      const baseR = pixels[offset];
      const baseG = pixels[offset + 1];
      const baseB = pixels[offset + 2];
      pixels[offset] = THREE.MathUtils.clamp(
        (baseR * (1 - terrainMix) + terrainR * terrainMix) * shade,
        0,
        255,
      );
      pixels[offset + 1] = THREE.MathUtils.clamp(
        (baseG * (1 - terrainMix) + terrainG * terrainMix) * shade,
        0,
        255,
      );
      pixels[offset + 2] = THREE.MathUtils.clamp(
        (baseB * (1 - terrainMix) + terrainB * terrainMix) * shade,
        0,
        255,
      );
    }
  }
  mapContext.putImageData(image, 0, 0);
}

function buildTerrainSkirt(
  elevations: Float32Array,
  sampleCount: number,
  widthMeters: number,
  heightMeters: number,
  minElevation: number,
  relief: number,
) {
  const perimeter: number[] = [];
  for (let column = 0; column < sampleCount; column++) perimeter.push(column);
  for (let row = 1; row < sampleCount; row++) perimeter.push(row * sampleCount + sampleCount - 1);
  for (let column = sampleCount - 2; column >= 0; column--) {
    perimeter.push((sampleCount - 1) * sampleCount + column);
  }
  for (let row = sampleCount - 2; row > 0; row--) perimeter.push(row * sampleCount);

  const positions = new Float32Array(perimeter.length * 2 * 3);
  const uvs = new Float32Array(perimeter.length * 2 * 2);
  const indices = new Uint16Array(perimeter.length * 6);
  const baseY = -110;
  perimeter.forEach((sourceIndex, edgeIndex) => {
    const row = Math.floor(sourceIndex / sampleCount);
    const column = sourceIndex % sampleCount;
    const x = (column / (sampleCount - 1) - 0.5) * widthMeters;
    const z = (row / (sampleCount - 1) - 0.5) * heightMeters;
    const y = (elevations[sourceIndex] - minElevation) * relief;
    const vertexOffset = edgeIndex * 6;
    positions[vertexOffset] = x;
    positions[vertexOffset + 1] = y;
    positions[vertexOffset + 2] = z;
    positions[vertexOffset + 3] = x;
    positions[vertexOffset + 4] = baseY;
    positions[vertexOffset + 5] = z;
    const uvOffset = edgeIndex * 4;
    const u = edgeIndex / perimeter.length * 7;
    uvs[uvOffset] = u;
    uvs[uvOffset + 1] = 1;
    uvs[uvOffset + 2] = u;
    uvs[uvOffset + 3] = 0;

    const next = (edgeIndex + 1) % perimeter.length;
    const indexOffset = edgeIndex * 6;
    indices[indexOffset] = edgeIndex * 2;
    indices[indexOffset + 1] = next * 2;
    indices[indexOffset + 2] = edgeIndex * 2 + 1;
    indices[indexOffset + 3] = next * 2;
    indices[indexOffset + 4] = next * 2 + 1;
    indices[indexOffset + 5] = edgeIndex * 2 + 1;
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();

  const earthCanvas = document.createElement('canvas');
  earthCanvas.width = 128;
  earthCanvas.height = 128;
  const earthContext = earthCanvas.getContext('2d');
  if (earthContext) {
    const earthImage = earthContext.createImageData(128, 128);
    for (let y = 0; y < 128; y++) {
      for (let x = 0; x < 128; x++) {
        const grain = Math.sin(x * 0.31 + y * 0.08) * 9
          + Math.sin(y * 0.44) * 8
          + Math.sin((x + y) * 0.12) * 5;
        const stratum = Math.sin(y * 0.18 + Math.sin(x * 0.04) * 1.8) * 11;
        const offset = (y * 128 + x) * 4;
        earthImage.data[offset] = THREE.MathUtils.clamp(111 + grain + stratum, 0, 255);
        earthImage.data[offset + 1] = THREE.MathUtils.clamp(78 + grain * 0.55 + stratum * 0.4, 0, 255);
        earthImage.data[offset + 2] = THREE.MathUtils.clamp(47 + grain * 0.35, 0, 255);
        earthImage.data[offset + 3] = 255;
      }
    }
    earthContext.putImageData(earthImage, 0, 0);
  }
  const earthTexture = new THREE.CanvasTexture(earthCanvas);
  earthTexture.colorSpace = THREE.SRGBColorSpace;
  earthTexture.wrapS = THREE.RepeatWrapping;
  earthTexture.wrapT = THREE.RepeatWrapping;
  earthTexture.repeat.set(1, 2);
  const material = new THREE.MeshStandardMaterial({
    map: earthTexture,
    color: '#9a7958',
    roughness: 1,
    metalness: 0,
  });
  const skirt = new THREE.Mesh(geometry, material);
  skirt.castShadow = true;
  skirt.receiveShadow = true;
  return skirt;
}

async function buildTerrain(
  routePath: LatLngTuple[],
  stations: RouteStation[],
  sampleCount: number,
  relief: number,
): Promise<TerrainModel> {
  const { demCanvas, demPixels, mapCanvas, mapContext } = await loadTerrainMosaics();
  const centerLatitude = (TILE.north + TILE.south) / 2;
  const earthCircumference = 2 * Math.PI * 6378137;
  const widthMeters = earthCircumference * Math.cos(centerLatitude * Math.PI / 180) / (2 ** TILE.zoom);
  const heightMeters = widthMeters;
  applyTerrainShading(mapContext, demPixels, demCanvas.width, widthMeters);

  const elevations = new Float32Array(sampleCount * sampleCount);
  let minElevation = Number.POSITIVE_INFINITY;
  let maxElevation = Number.NEGATIVE_INFINITY;
  for (let row = 0; row < sampleCount; row++) {
    const v = row / (sampleCount - 1);
    for (let column = 0; column < sampleCount; column++) {
      const u = column / (sampleCount - 1);
      const elevation = interpolateElevation(
        demPixels,
        demCanvas.width,
        u * (demCanvas.width - 1),
        v * (demCanvas.height - 1),
      );
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
      positions[positionOffset++] = (elevations[row * sampleCount + column] - minElevation) * relief;
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

  const mapTexture = new THREE.CanvasTexture(mapCanvas);
  mapTexture.colorSpace = THREE.SRGBColorSpace;
  mapTexture.anisotropy = 6;
  mapTexture.minFilter = THREE.LinearMipmapLinearFilter;
  mapTexture.needsUpdate = true;
  const terrain = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      map: mapTexture,
      roughness: 0.88,
      metalness: 0,
    }),
  );
  terrain.castShadow = true;
  terrain.receiveShadow = true;

  const sampleElevation = (u: number, v: number) => interpolateElevation(
    demPixels,
    demCanvas.width,
    Math.max(0, Math.min(1, u)) * (demCanvas.width - 1),
    Math.max(0, Math.min(1, v)) * (demCanvas.height - 1),
  );
  const toWorldPoint = (lat: number, lng: number, lift = 0) => {
    const { u, v } = routeTilePosition(lat, lng);
    return new THREE.Vector3(
      (u - 0.5) * widthMeters,
      (sampleElevation(u, v) - minElevation) * relief + lift,
      (v - 0.5) * heightMeters,
    );
  };

  const group = new THREE.Group();
  group.add(terrain);
  group.add(buildTerrainSkirt(elevations, sampleCount, widthMeters, heightMeters, minElevation, relief));

  const validRoute = routePath.filter(([lat, lng]) => {
    const { u, v } = routeTilePosition(lat, lng);
    return Number.isFinite(lat) && Number.isFinite(lng) && u >= 0 && u <= 1 && v >= 0 && v <= 1;
  });
  if (validRoute.length >= 2) {
    const stride = Math.max(1, Math.ceil(validRoute.length / 260));
    const routePoints = validRoute
      .filter((_, index) => index % stride === 0 || index === validRoute.length - 1)
      .map(([lat, lng]) => toWorldPoint(lat, lng, 18));
    const curve = new THREE.CatmullRomCurve3(routePoints, false, 'centripetal');
    const routeGeometry = new THREE.TubeGeometry(
      curve,
      Math.min(520, Math.max(64, routePoints.length * 4)),
      9,
      6,
      false,
    );
    group.add(new THREE.Mesh(routeGeometry, new THREE.MeshBasicMaterial({ color: '#16b9f5' })));
  }

  stations.forEach((station) => {
    const position = toWorldPoint(station.lat, station.lng, 34);
    const color = station.kind === 'peak' ? '#ef4444' : station.kind === 'jump_off' ? '#f59e0b' : '#22c55e';
    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(23, 12, 10),
      new THREE.MeshBasicMaterial({ color }),
    );
    marker.position.copy(position);
    group.add(marker);
  });

  return { group, minElevation, maxElevation, relief, sampleCount };
}

function TerrainContent({
  routePath,
  stations,
  relief,
  onReady,
}: Terrain3DSceneProps & { onReady: (model: TerrainModel) => void }) {
  const [model, setModel] = useState<TerrainModel | null>(null);
  const sampleCount = useMemo(() => {
    if (typeof window === 'undefined') return 128;
    return window.innerWidth < 768 ? 128 : 224;
  }, []);

  useEffect(() => {
    let active = true;
    let builtModel: TerrainModel | null = null;
    setModel(null);
    void buildTerrain(routePath, stations, sampleCount, relief)
      .then((nextModel) => {
        builtModel = nextModel;
        if (active) {
          setModel(nextModel);
          onReady(nextModel);
        } else {
          disposeGroup(nextModel.group);
        }
      })
      .catch((error) => console.error('Unable to build 3D terrain', error));
    return () => {
      active = false;
      if (builtModel) disposeGroup(builtModel.group);
    };
  }, [onReady, relief, routePath, sampleCount, stations]);

  if (!model) return null;
  return <primitive object={model.group} />;
}

export default function Terrain3DScene({ routePath, stations, relief }: Terrain3DSceneProps) {
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  const [stats, setStats] = useState<TerrainModel | null>(null);
  return (
    <div className="relative h-full w-full" data-testid="terrain-3d-view">
      <Canvas
        frameloop="demand"
        dpr={[1, isMobile ? 1.2 : 1.5]}
        shadows={!isMobile}
        gl={{
          alpha: true,
          antialias: !isMobile,
          powerPreference: 'high-performance',
        }}
        style={{
          width: '100%',
          height: '100%',
          background: 'linear-gradient(180deg, #72b9e6 0%, #d7edf4 45%, #b5cbb8 100%)',
        }}
      >
        <fog attach="fog" args={['#c8dee2', 7200, 12500]} />
        <ambientLight intensity={0.5} />
        <directionalLight
          castShadow={!isMobile}
          position={[-2800, 4800, 2600]}
          intensity={3.1}
          color="#fff1cf"
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
          shadow-camera-left={-3600}
          shadow-camera-right={3600}
          shadow-camera-top={3600}
          shadow-camera-bottom={-3600}
          shadow-camera-near={50}
          shadow-camera-far={9500}
          shadow-bias={-0.0003}
        />
        <hemisphereLight args={['#d9efff', '#304b35', 0.82]} />
        <PerspectiveCamera
          makeDefault
          position={isMobile ? [2600, 4700, 7900] : [3500, 3200, 5700]}
          fov={isMobile ? 49 : 45}
          near={5}
          far={18000}
        />
        <TerrainContent routePath={routePath} stations={stations} relief={relief} onReady={setStats} />
        <OrbitControls
          makeDefault
          target={isMobile ? [-650, 720, 700] : [-850, 760, 750]}
          enableDamping={false}
          enablePan
          minDistance={850}
          maxDistance={isMobile ? 12000 : 9000}
          minPolarAngle={0.2}
          maxPolarAngle={1.48}
        />
      </Canvas>
      {stats && (
        <div className="pointer-events-none absolute left-2 top-2 rounded bg-white/90 px-2 py-1 text-[10px] font-medium text-slate-700 shadow">
          Real DEM | {stats.relief}x relief | {stats.sampleCount}x{stats.sampleCount} mesh | {Math.round(stats.minElevation)}-{Math.round(stats.maxElevation)} m
        </div>
      )}
    </div>
  );
}
