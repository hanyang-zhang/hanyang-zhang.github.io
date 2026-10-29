import * as THREE from 'three';

// The grass field is a strip that wraps around the camera while scrolling.
export const FIELD_W = 40; // x extent
export const FIELD_L = 40; // z extent (wraps)
export const NEAR_Z = 14; // field spans z in [NEAR_Z - FIELD_L, NEAR_Z]

export function sharedUniforms(night: number, pixelRatio: number) {
  return {
    uTime: { value: 0 },
    uScroll: { value: 0 },
    uMouse: { value: new THREE.Vector3(0, 0, 100) },
    uMouseVel: { value: new THREE.Vector2() },
    uMouseStrength: { value: 0 },
    uNight: { value: night },
    uFog: { value: new THREE.Color() },
    uFogNear: { value: 12 },
    uFogFar: { value: 34 },
    uPixelRatio: { value: pixelRatio },
    uWrap: { value: new THREE.Vector2(FIELD_L, NEAR_Z) }, // the world's scroll wrap: length, near edge
  };
}
export type Shared = ReturnType<typeof sharedUniforms>;

export interface WorldContext {
  scene: THREE.Scene;
  shared: Shared;
  small: boolean;
  defines: Record<string, string>;
}

/** A self-contained scene (grass meadow, voxel world, …) the engine can render. */
export interface World {
  /** Height of the walkable surface, used for the pointer. */
  groundY: number;
  /** Height of the top of the scenery at (x, z): motes float just above it. */
  surfaceAt?(x: number, z: number): number;
  /** How the scenery wraps while scrolling: z spans [near - length, near]. */
  wrap?: { length: number; near: number };
  /** Blend between day (0) and night (1); also sets `shared.uFog`. */
  applyPalette(t: number): void;
  update(time: number, scroll: number): void;
  /** Optional: the pointer's ray into the scene, or null when it leaves. */
  pointer?(ray: THREE.Ray | null): void;
}

export type Palette<K extends string> = Record<K, string>;

export function toColors<K extends string>(p: Palette<K>) {
  return Object.fromEntries(Object.entries(p).map(([k, v]) => [k, new THREE.Color(v as string)])) as Record<K, THREE.Color>;
}

/** Wrap a z position into the scrolling field (mirrors `wrapField` in GLSL). */
export function wrapZ(z: number, scroll: number, length = FIELD_L, near = NEAR_Z) {
  return ((((z + scroll) % length) + length) % length) - (length - near);
}

// Shared GLSL: noise + the wind/pointer bend, so everything sways together.
export const windChunk = /* glsl */ `
  uniform float uTime;
  uniform float uScroll;
  uniform vec3 uMouse;
  uniform vec2 uMouseVel;
  uniform float uMouseStrength;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }

  vec3 wrapField(vec3 o) {
    float z = mod(o.z + uScroll, ${FIELD_L.toFixed(1)}) - ${(FIELD_L - NEAR_Z).toFixed(1)};
    return vec3(o.x, o.y, z);
  }

  const vec2 WIND_DIR = vec2(0.9417, 0.3363);

  float gustAt(vec2 p) {
    float g = sin(dot(p, WIND_DIR) * 0.42 - uTime * 1.6) * 0.5 + 0.5;
    return g * g * g;
  }

  vec2 bendAt(vec2 world, float rand) {
    vec2 field = world - vec2(0.0, uScroll); // stable coordinates for noise
    float gust = gustAt(field);
    float n = noise(field * 0.16 + uTime * vec2(0.32, 0.11));
    float sway = (n - 0.5) * 0.7 + gust * 0.95 + sin(uTime * 2.1 + rand * 6.2831) * 0.07;
    vec2 bend = WIND_DIR * sway + vec2(cos(rand * 6.2831), sin(rand * 6.2831)) * 0.2;

    // The pointer brushes the grass like a hand: blades lean the way it moves,
    // and part only a little when it rests.
    vec2 away = world - uMouse.xz;
    float d = length(away);
    float fall = 1.0 - smoothstep(0.0, 2.0, d);
    fall *= fall;
    bend += uMouseVel * fall * 0.32;
    bend += (away / max(d, 0.001)) * fall * uMouseStrength * 0.3;

    float len = length(bend);
    return len > 1.15 ? bend * (1.15 / len) : bend;
  }
`;

export const fogChunk = /* glsl */ `
  uniform vec3 uFog;
  uniform float uFogNear;
  uniform float uFogFar;
  vec3 applyFog(vec3 c, float depth) {
    return mix(c, uFog, smoothstep(uFogNear, uFogFar, depth));
  }
`;

// Posterise + 4x4 Bayer dither, enabled by the PIXEL define.
export const pixelChunk = /* glsl */ `
  float bayer4(vec2 p) {
    ivec2 i = ivec2(mod(p, 4.0));
    float m[16] = float[16](0., 8., 2., 10., 12., 4., 14., 6., 3., 11., 1., 9., 15., 7., 13., 5.);
    return m[i.x + i.y * 4] / 16.0;
  }
  vec3 finish(vec3 c) {
  #ifdef PIXEL
    float d = bayer4(gl_FragCoord.xy) - 0.5;
    return floor(c * 6.0 + 0.5 + d * 0.85) / 6.0;
  #else
    return c;
  #endif
  }
`;

/** Make a standard material's instances wrap with the scrolling field. */
export function wrapInstances(material: THREE.Material, shared: Shared, length = FIELD_L, near = NEAR_Z) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uScroll = shared.uScroll;
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'uniform float uScroll;\nvoid main() {')
      .replace(
        '#include <project_vertex>',
        /* glsl */ `
        vec4 mvPosition = vec4(transformed, 1.0);
        mat4 wrapped = instanceMatrix;
        wrapped[3].z = mod(wrapped[3].z + uScroll, ${length.toFixed(1)}) - ${(length - near).toFixed(1)};
        mvPosition = modelViewMatrix * (wrapped * mvPosition);
        gl_Position = projectionMatrix * mvPosition;`,
      );
  };
}
