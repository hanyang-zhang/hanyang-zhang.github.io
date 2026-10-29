import * as THREE from 'three';
import {
  FIELD_L,
  NEAR_Z,
  fogChunk,
  toColors,
  windChunk,
  wrapInstances,
  type World,
  type WorldContext,
} from './shared';

/*
 * A Minecraft-like voxel meadow: 16px textures drawn at load time, grass
 * blocks on gentle hills, oak trees, swaying tall grass and flowers, and
 * square clouds drifting overhead.
 */

const W = 48; // blocks across
const L = FIELD_L; // blocks deep (wraps with the scrolling field)
const X0 = -W / 2;
const Z0 = NEAR_Z - L;

// Deterministic pseudo-random numbers, so the world looks the same each visit.
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- 16×16 textures ----------
type Painter = (x: number, y: number, r: () => number) => string | null;

function texture(paint: Painter, seed: number, w = 16, h = 16) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  const r = mulberry32(seed);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const col = paint(x, y, r);
      if (col) {
        ctx.fillStyle = col;
        ctx.fillRect(x, y, 1, 1);
      }
    }
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestMipmapNearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const pick = (r: () => number, ...cols: string[]) => cols[Math.floor(r() * cols.length)];
const GRASS = ['#5f9f35', '#6aac3c', '#578f31', '#73b545', '#4f8a2c'];
const DIRT = ['#8a5c38', '#7a4f2f', '#96673f', '#6e4729', '#a07048'];

function blockTextures() {
  const top = texture((_x, _y, r) => pick(r, ...GRASS), 1);
  // Grass on top, with a ragged edge hanging down into the dirt.
  const edge = Array.from({ length: 16 }, (_, i) => 3 + ((i * 7) % 3) + (i % 5 === 0 ? 1 : 0));
  const side = texture((x, y, r) => (y < edge[x] ? pick(r, ...GRASS) : pick(r, ...DIRT)), 2);
  const dirt = texture((_x, _y, r) => pick(r, ...DIRT), 3);
  const bark = texture((x, _y, r) => (x % 4 === 0 ? '#4e3620' : pick(r, '#6b4a2b', '#5d4026', '#755232')), 4);
  const rings = texture((x, y) => {
    const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
    return d > 6.5 ? '#6b4a2b' : Math.floor(d) % 2 ? '#b8915a' : '#a07c48';
  }, 5);
  const leaves = texture((_x, _y, r) => (r() < 0.12 ? '#2b5e1c' : pick(r, '#3f8a2a', '#4a9831', '#367a24', '#55a338')), 6);
  return { top, side, dirt, bark, rings, leaves };
}

// Tall grass, a poppy and a dandelion, side by side in one 48×16 atlas.
function plantAtlas() {
  return texture(
    (x, y, r) => {
      const tile = Math.floor(x / 16);
      const lx = x % 16;
      if (tile === 0) {
        const blade = [2, 5, 7, 10, 13].some((b) => Math.abs(lx - b - (15 - y) * (b < 8 ? -0.12 : 0.12)) < 0.8);
        return blade && y > 2 + (lx % 4) ? pick(r, '#5f9f35', '#6aac3c', '#4f8a2c') : null;
      }
      const stem = lx === 7 && y > 7;
      const leaf = y === 11 && (lx === 6 || lx === 8);
      if (stem || leaf) return '#3f7f25';
      const head = y >= 3 && y <= 7 && lx >= 5 && lx <= 9 && !((y === 3 || y === 7) && (lx === 5 || lx === 9));
      if (!head) return null;
      if (tile === 1) return lx === 7 && y === 5 ? '#2a1a12' : pick(r, '#d8261c', '#c01f17', '#e43a2a');
      return lx === 7 && y === 5 ? '#e0a10f' : pick(r, '#f6d22a', '#ffe14a', '#f2c414');
    },
    7,
    48,
    16,
  );
}

const DAY = { sky: '#9ec7ff', fog: '#c6dcff', plant: '#ffffff', cloud: '#ffffff' };
const NIGHT = { sky: '#0c1328', fog: '#121b33', plant: '#4a5a80', cloud: '#2a3352' };

export function buildVoxelWorld({ scene, shared, small }: WorldContext): World {
  const r = mulberry32(42);
  const tex = blockTextures();

  // ---------- Terrain ----------
  // Gentle rolling hills, 1–3 blocks high.
  const heightAt = (x: number, z: number) =>
    Math.round(1.6 + Math.sin(x * 0.21) * 0.8 + Math.cos(z * 0.17 + x * 0.05) * 0.9 + Math.sin((x + z) * 0.09) * 0.5);

  const heights: number[][] = [];
  const grassCells: [number, number, number][] = [];
  const dirtCells: [number, number, number][] = [];
  for (let i = 0; i < W; i++) {
    heights[i] = [];
    for (let k = 0; k < L; k++) {
      const h = Math.max(1, heightAt(i, k));
      heights[i][k] = h;
      grassCells.push([i, h - 1, k]);
      for (let y = 0; y < h - 1; y++) dirtCells.push([i, y, k]);
    }
  }

  const box = new THREE.BoxGeometry(1, 1, 1);
  const lambert = (map: THREE.Texture) => {
    const m = new THREE.MeshLambertMaterial({ map });
    wrapInstances(m, shared);
    return m;
  };
  const sideMat = lambert(tex.side);
  const grassMats = [sideMat, sideMat, lambert(tex.top), lambert(tex.dirt), sideMat, sideMat];
  const dirtMat = lambert(tex.dirt);
  const barkMat = lambert(tex.bark);
  const ringMat = lambert(tex.rings);
  const logMats = [barkMat, barkMat, ringMat, ringMat, barkMat, barkMat];
  const leafMat = lambert(tex.leaves);

  const m4 = new THREE.Matrix4();
  function blocks(cells: [number, number, number][], material: THREE.Material | THREE.Material[]) {
    const mesh = new THREE.InstancedMesh(box, material, cells.length);
    cells.forEach(([x, y, z], i) => mesh.setMatrixAt(i, m4.makeTranslation(X0 + x + 0.5, y + 0.5, Z0 + z + 0.5)));
    mesh.frustumCulled = false;
    scene.add(mesh);
    return mesh;
  }
  blocks(grassCells, grassMats);
  blocks(dirtCells, dirtMat);

  // ---------- Oak trees ----------
  const logs: [number, number, number][] = [];
  const leaves: [number, number, number][] = [];
  const treeCount = small ? 7 : 13;
  for (let n = 0; n < treeCount; n++) {
    const i = 2 + Math.floor(r() * (W - 4));
    const k = 2 + Math.floor(r() * (L - 4));
    if (Math.abs(X0 + i) < 6) continue; // keep the middle clear
    const base = heights[i][k];
    const trunk = 4 + Math.floor(r() * 2);
    for (let y = 0; y < trunk; y++) logs.push([i, base + y, k]);
    const top = base + trunk;
    for (let dy = -2; dy <= 1; dy++) {
      const rad = dy < 0 ? 2 : 1;
      for (let dx = -rad; dx <= rad; dx++)
        for (let dz = -rad; dz <= rad; dz++) {
          const corner = Math.abs(dx) === rad && Math.abs(dz) === rad;
          if (corner && (dy === 1 || r() < 0.5)) continue;
          if (dx === 0 && dz === 0 && dy < 0) continue; // trunk goes through
          leaves.push([i + dx, top + dy, k + dz]);
        }
    }
  }
  blocks(logs, logMats);
  blocks(leaves, leafMat);

  // ---------- Tall grass & flowers (crossed quads that sway) ----------
  const plantCount = small ? 900 : 2000;
  const quad = new THREE.InstancedBufferGeometry();
  // two quads crossing in an X, 1 block tall
  const s = 0.45;
  quad.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([-s, 0, -s, s, 0, s, s, 1, s, -s, 1, -s, -s, 0, s, s, 0, -s, s, 1, -s, -s, 1, s], 3),
  );
  quad.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1], 2));
  quad.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
  const pOff = new Float32Array(plantCount * 3);
  const pData = new Float32Array(plantCount * 2);
  for (let n = 0; n < plantCount; n++) {
    const i = Math.floor(r() * W);
    const k = Math.floor(r() * L);
    pOff.set([X0 + i + 0.5, heights[i][k], Z0 + k + 0.5], n * 3);
    const roll = r();
    pData.set([roll < 0.82 ? 0 : roll < 0.91 ? 1 : 2, r()], n * 2);
  }
  quad.setAttribute('aOffset', new THREE.InstancedBufferAttribute(pOff, 3));
  quad.setAttribute('aData', new THREE.InstancedBufferAttribute(pData, 2));
  quad.instanceCount = plantCount;

  const plantUniforms = { ...shared, uAtlas: { value: plantAtlas() }, uLight: { value: new THREE.Color() } };
  const plants = new THREE.Mesh(
    quad,
    new THREE.ShaderMaterial({
      uniforms: plantUniforms,
      side: THREE.DoubleSide,
      vertexShader: /* glsl */ `
        ${windChunk}
        attribute vec3 aOffset;
        attribute vec2 aData; // tile, rand
        varying vec2 vUv;
        varying float vDepth;
        void main() {
          vec3 origin = wrapField(aOffset);
          vec3 p = position;
          vec2 bend = bendAt(origin.xz, aData.y) * 0.35;
          p.xz += bend * p.y;
          vec4 mv = modelViewMatrix * vec4(origin + p, 1.0);
          vDepth = -mv.z;
          vUv = vec2((aData.x + uv.x) / 3.0, uv.y);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uAtlas;
        uniform vec3 uLight;
        ${fogChunk}
        varying vec2 vUv;
        varying float vDepth;
        void main() {
          vec4 c = texture2D(uAtlas, vUv);
          if (c.a < 0.5) discard;
          gl_FragColor = vec4(applyFog(c.rgb * uLight, vDepth), 1.0);
          #include <colorspace_fragment>
        }`,
    }),
  );
  plants.frustumCulled = false;
  scene.add(plants);

  // ---------- Square clouds ----------
  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.92, fog: false });
  const cloudCells: [number, number][] = [];
  for (let i = 0; i < 40; i++)
    for (let k = 0; k < 14; k++) {
      const v = Math.sin(i * 0.55) + Math.cos(k * 0.9 + i * 0.2) + Math.sin(i * 0.17 + k * 0.4) * 1.2;
      if (v > 1.1) cloudCells.push([i, k]);
    }
  const clouds = new THREE.InstancedMesh(new THREE.BoxGeometry(4, 1.2, 4), cloudMat, cloudCells.length);
  cloudCells.forEach(([i, k], n) => clouds.setMatrixAt(n, m4.makeTranslation(i * 4 - 80, 13, -38 - k * 4)));
  clouds.frustumCulled = false;
  scene.add(clouds);

  // ---------- Light ----------
  const hemi = new THREE.HemisphereLight(0xffffff, 0x7a6a50, 1.7);
  const sun = new THREE.DirectionalLight(0xffffff, 1.9);
  sun.position.set(-5, 10, 7);
  scene.add(hemi, sun);

  const day = toColors(DAY);
  const night = toColors(NIGHT);
  return {
    groundY: 2,
    applyPalette(t) {
      shared.uFog.value.lerpColors(day.fog, night.fog, t);
      plantUniforms.uLight.value.lerpColors(day.plant, night.plant, t);
      cloudMat.color.lerpColors(day.cloud, night.cloud, t);
      hemi.intensity = 1.7 * (1 - t) + 0.45 * t;
      hemi.color.setRGB(1 - 0.4 * t, 1 - 0.3 * t, 1);
      sun.intensity = 1.9 * (1 - t) + 0.25 * t;
      sun.color.setRGB(1 - 0.45 * t, 1 - 0.3 * t, 1);
    },
    update(time) {
      clouds.position.x = (time * 0.6) % 40;
    },
  };
}
