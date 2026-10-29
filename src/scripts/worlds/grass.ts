import * as THREE from 'three';
import {
  FIELD_L,
  FIELD_W,
  NEAR_Z,
  fogChunk,
  pixelChunk,
  toColors,
  windChunk,
  wrapZ,
  type Palette,
  type World,
  type WorldContext,
} from './shared';

/*
 * A stylised meadow: ~80k instanced grass blades, wildflowers, cartoon trees
 * along the sides and (optionally) a dense forest closing off the horizon.
 */

type Key = 'base' | 'tip' | 'glow' | 'ground' | 'fog' | 'leaf' | 'trunk' | 'sky' | 'zenith';

export interface GrassOptions {
  day: Palette<Key>;
  night: Palette<Key>;
  bladeWidth: number;
  bladeDensity: number;
  sky: boolean; // painted sky with clouds (only visible when the camera looks up)
  bands: number; // >0: cel-shade the grass into this many tones
  roundTrees: boolean; // smooth canopies instead of faceted ones
  sideTrees: number; // trees that scroll past on both sides
  forest: boolean; // a dense tree line far away
}

function bladeGeometry(segments: number) {
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i < segments; i++) {
    const y = i / segments;
    pos.push(-0.5, y, 0, 0.5, y, 0);
  }
  pos.push(0, 1, 0);
  for (let i = 0; i < segments - 1; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const last = (segments - 1) * 2;
  idx.push(last, last + 1, segments * 2);

  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  return geo;
}

function toonRamp(steps: number) {
  const data = new Uint8Array(steps * 4);
  for (let i = 0; i < steps; i++) data.fill(Math.round(70 + (185 * i) / (steps - 1)), i * 4, i * 4 + 4);
  const tex = new THREE.DataTexture(data, steps, 1);
  tex.minFilter = tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

const rng = (a: number, b: number) => a + Math.random() * (b - a);

export function buildGrassWorld({ scene, shared, small, defines }: WorldContext, opts: GrassOptions): World {
  const pixel = 'PIXEL' in defines;

  // ---------- Sky ----------
  const skyUniforms = { ...shared, uHorizon: { value: new THREE.Color() }, uZenith: { value: new THREE.Color() } };
  if (opts.sky) {
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(80, 32, 16),
      new THREE.ShaderMaterial({
        uniforms: skyUniforms,
        defines,
        side: THREE.BackSide,
        depthWrite: false,
        vertexShader: /* glsl */ `
          varying vec3 vDir;
          void main() {
            vDir = normalize(position);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uHorizon;
          uniform vec3 uZenith;
          uniform float uTime;
          uniform float uNight;
          varying vec3 vDir;
          ${pixelChunk}
          float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float n2(vec2 p) {
            vec2 i = floor(p), f = fract(p);
            vec2 u = f * f * (3.0 - 2.0 * f);
            return mix(mix(h2(i), h2(i + vec2(1, 0)), u.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), u.x), u.y);
          }
          float fbm(vec2 p) {
            float v = 0.0, a = 0.5;
            for (int i = 0; i < 5; i++) { v += a * n2(p); p *= 2.03; a *= 0.5; }
            return v;
          }
          void main() {
            float y = max(vDir.y, 0.0);
            vec3 col = mix(uHorizon, uZenith, pow(smoothstep(0.0, 0.55, y), 0.8));

            // Big soft cumulus: fbm on the sky plane, drifting with the wind.
            vec2 uv = vDir.xz / (vDir.y + 0.12) * 1.4 + vec2(uTime * 0.025, uTime * 0.008);
            float c = fbm(uv);
            float cloud = smoothstep(0.5, 0.68, c) * smoothstep(0.0, 0.12, y);
            float shade = smoothstep(0.5, 0.85, fbm(uv + vec2(0.06, -0.09)));
            vec3 cloudCol = mix(vec3(1.0, 0.99, 0.95), vec3(0.78, 0.84, 0.92), shade * 0.8);
            cloudCol = mix(cloudCol, vec3(0.16, 0.24, 0.32), uNight * 0.85);
            col = mix(col, cloudCol, cloud * 0.95);

            // Stars at night.
            vec2 sp = floor(vDir.xz / (vDir.y + 0.2) * 90.0);
            float star = step(0.996, h2(sp)) * uNight * smoothstep(0.1, 0.4, y) * (1.0 - cloud);
            col += star * (0.6 + 0.4 * sin(uTime * 2.0 + h2(sp) * 40.0));

            gl_FragColor = vec4(finish(col), 1.0);
          }`,
      }),
    );
    sky.renderOrder = -1;
    sky.frustumCulled = false;
    scene.add(sky);
  }

  // ---------- Ground ----------
  const groundUniforms = { ...shared, uGround: { value: new THREE.Color() } };
  scene.add(
    new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200).rotateX(-Math.PI / 2),
      new THREE.ShaderMaterial({
        uniforms: groundUniforms,
        defines,
        vertexShader: /* glsl */ `
          varying float vDepth;
          void main() {
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            vDepth = -mv.z;
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uGround;
          ${fogChunk}
          ${pixelChunk}
          varying float vDepth;
          void main() { gl_FragColor = vec4(finish(applyFog(uGround, vDepth)), 1.0); }`,
      }),
    ),
  );

  // ---------- Grass ----------
  const bladeCount = Math.round((small ? 32000 : 80000) * opts.bladeDensity);
  const grassGeo = bladeGeometry(5);
  const offsets = new Float32Array(bladeCount * 3);
  const params = new Float32Array(bladeCount * 4);
  for (let i = 0; i < bladeCount; i++) {
    const x = (Math.random() - 0.5) * FIELD_W;
    const z = Math.random() * FIELD_L - (FIELD_L - NEAR_Z);
    offsets.set([x, 0, z], i * 3);
    // taller patches, so the field isn't a uniform carpet
    const patch = 0.5 + 0.5 * Math.sin(x * 0.35 + Math.cos(z * 0.27) * 2.0) * Math.cos(z * 0.21);
    const height = 0.45 + Math.random() * 0.45 + patch * 0.55;
    const width = (0.07 + Math.random() * 0.06) * opts.bladeWidth;
    params.set([height, width, Math.random() * Math.PI * 2, Math.random()], i * 4);
  }
  grassGeo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(offsets, 3));
  grassGeo.setAttribute('aParams', new THREE.InstancedBufferAttribute(params, 4));
  grassGeo.instanceCount = bladeCount;

  const grassUniforms = {
    ...shared,
    uBase: { value: new THREE.Color() },
    uTip: { value: new THREE.Color() },
    uGlow: { value: new THREE.Color() },
    uBands: { value: opts.bands },
  };
  const grass = new THREE.Mesh(
    grassGeo,
    new THREE.ShaderMaterial({
      uniforms: grassUniforms,
      defines,
      side: THREE.DoubleSide,
      vertexShader: /* glsl */ `
        ${windChunk}
        attribute vec3 aOffset;
        attribute vec4 aParams; // height, width, angle, rand
        varying float vY;
        varying float vRand;
        varying float vGust;
        varying float vDepth;
        varying float vPatch;
        void main() {
          float h = aParams.x, w = aParams.y, ang = aParams.z, r = aParams.w;
          float y = position.y;
          vec3 origin = wrapField(aOffset);

          float c = cos(ang), s = sin(ang);
          float x = position.x * w * (1.0 - y * 0.9);
          vec3 p = vec3(x * c, y * h, x * s);

          vec2 bend = bendAt(origin.xz, r);
          float k = y * y;
          p.xz += bend * k * h;
          p.y *= 1.0 - 0.2 * k * length(bend);

          vec4 mv = modelViewMatrix * vec4(origin + p, 1.0);
          vDepth = -mv.z;
          vY = y;
          vRand = r;
          vGust = gustAt(origin.xz - vec2(0.0, uScroll)) * y;
          vPatch = noise((origin.xz - vec2(0.0, uScroll)) * 0.09);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uBase;
        uniform vec3 uTip;
        uniform vec3 uGlow;
        uniform float uBands;
        ${fogChunk}
        ${pixelChunk}
        varying float vY;
        varying float vRand;
        varying float vGust;
        varying float vDepth;
        varying float vPatch;
        void main() {
          // drifts of sun-bleached, yellower grass between the greener patches
          vec3 tip = mix(uTip, uTip * vec3(1.14, 1.06, 0.72), smoothstep(0.45, 0.85, vPatch));
          float t = smoothstep(0.0, 1.0, vY);
          if (uBands > 0.0) t = floor(t * uBands + vRand * 0.6) / uBands;
          vec3 col = mix(uBase, tip, t);
          col *= 0.86 + vRand * 0.24;
          col = mix(col, uGlow, vGust * (uBands > 0.0 ? 0.65 : 0.5));
          col *= mix(0.72, 1.0, smoothstep(0.0, 0.35, vY)); // soft contact shadow at the root
          gl_FragColor = vec4(finish(applyFog(col, vDepth)), 1.0);
        }`,
    }),
  );
  grass.frustumCulled = false;
  scene.add(grass);

  // ---------- Wildflowers ----------
  const flowerCount = small ? 700 : 1600;
  const fPos = new Float32Array(flowerCount * 3);
  const fData = new Float32Array(flowerCount * 4); // height, rand, colour index, size
  for (let i = 0; i < flowerCount; i++) {
    fPos.set([(Math.random() - 0.5) * FIELD_W, 0, Math.random() * FIELD_L - (FIELD_L - NEAR_Z)], i * 3);
    fData.set([0.7 + Math.random() * 0.7, Math.random(), Math.floor(Math.random() * 4), 0.7 + Math.random() * 0.6], i * 4);
  }
  const flowerGeo = new THREE.BufferGeometry();
  flowerGeo.setAttribute('position', new THREE.BufferAttribute(fPos, 3));
  flowerGeo.setAttribute('aData', new THREE.BufferAttribute(fData, 4));
  const flowers = new THREE.Points(
    flowerGeo,
    new THREE.ShaderMaterial({
      uniforms: shared,
      defines,
      vertexShader: /* glsl */ `
        ${windChunk}
        uniform float uPixelRatio;
        uniform float uNight;
        attribute vec4 aData;
        varying vec3 vColor;
        varying float vDepth;
        void main() {
          vec3 origin = wrapField(position);
          vec2 bend = bendAt(origin.xz, aData.y);
          vec3 p = origin + vec3(bend.x * aData.x, aData.x * (1.0 - 0.2 * length(bend)), bend.y * aData.x);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          vDepth = -mv.z;
          int ci = int(aData.z);
          vColor = ci == 0 ? vec3(1.0, 0.99, 0.94)
                 : ci == 1 ? vec3(0.98, 0.84, 0.36)
                 : ci == 2 ? vec3(0.96, 0.72, 0.78)
                 :           vec3(0.80, 0.74, 0.93);
          vColor *= mix(1.0, 0.32, uNight);
          gl_PointSize = aData.w * 150.0 * uPixelRatio / vDepth;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        ${fogChunk}
        ${pixelChunk}
        varying vec3 vColor;
        varying float vDepth;
        void main() {
          vec2 uv = gl_PointCoord - 0.5;
          float a = atan(uv.y, uv.x);
          float petals = 0.36 + 0.1 * cos(a * 5.0);
          float d = length(uv);
          if (d > petals) discard;
          vec3 col = mix(vec3(0.98, 0.78, 0.25), vColor, smoothstep(0.06, 0.12, d));
          gl_FragColor = vec4(finish(applyFog(col, vDepth)), 1.0);
        }`,
    }),
  );
  flowers.frustumCulled = false;
  scene.add(flowers);

  // ---------- Trees ----------
  const hemi = new THREE.HemisphereLight(0xffffff, 0x445522, 1.6);
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.2);
  sun.position.set(-6, 10, 4);
  scene.add(hemi, sun);

  const ramp = toonRamp(pixel ? 2 : 3);
  const leafMat = new THREE.MeshToonMaterial({ gradientMap: ramp });
  const trunkMat = new THREE.MeshToonMaterial({ gradientMap: ramp });
  const trunkGeo = new THREE.CylinderGeometry(0.12, 0.22, 1.8, 7).translate(0, 0.9, 0);
  const blobGeo = new THREE.IcosahedronGeometry(1, opts.roundTrees ? 4 : 1);

  // Every tree is a trunk plus a few overlapping canopy blobs, all instanced.
  const tree = new THREE.Object3D();
  const part = new THREE.Object3D();
  const tint = new THREE.Color();
  function plantTrees(count: number, place: () => { x: number; z: number; s: number }) {
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, count);
    const blobs = new THREE.InstancedMesh(blobGeo, leafMat, count * 4);
    for (let i = 0; i < count; i++) {
      const { x, z, s } = place();
      tree.position.set(x, 0, z);
      tree.rotation.set(0, rng(0, Math.PI * 2), 0);
      tree.scale.setScalar(s);
      tree.updateMatrix();
      trunks.setMatrixAt(i, tree.matrix);
      for (let b = 0; b < 4; b++) {
        part.position.set(rng(-0.7, 0.7), 2.0 + rng(0, 1.1), rng(-0.6, 0.6));
        part.scale.setScalar(b === 3 && Math.random() < 0.4 ? 0 : rng(0.7, 1.15));
        part.updateMatrix();
        blobs.setMatrixAt(i * 4 + b, tree.matrix.clone().multiply(part.matrix));
        blobs.setColorAt(i * 4 + b, tint.setScalar(rng(0.82, 1.15)));
      }
    }
    trunks.frustumCulled = blobs.frustumCulled = false;
    scene.add(trunks, blobs);
    return [trunks, blobs];
  }

  // Trees scroll past with the grass. Each group wraps over its own stretch of
  // z, recycling beside/behind the camera and in the fog far away.
  const scrolling: { mesh: THREE.InstancedMesh; base: Float32Array; length: number; near: number }[] = [];
  function scrollingTrees(count: number, place: () => { x: number; z: number; s: number }, length: number, near: number) {
    for (const mesh of plantTrees(count, place)) {
      scrolling.push({ mesh, base: Float32Array.from(mesh.instanceMatrix.array), length, near });
    }
  }

  if (opts.sideTrees) {
    const n = small ? Math.ceil(opts.sideTrees / 2) : opts.sideTrees;
    let i = 0;
    scrollingTrees(n, () => ({ x: (i++ % 2 ? 1 : -1) * rng(6.5, 17), z: rng(0, 30), s: rng(1.1, 1.9) }), 30, 4);
  }

  // A deep forest on both sides of the meadow: up close the trees pass by, and
  // far away they crowd together into a tree line that hides the sky.
  if (opts.forest) {
    const side = () => (Math.random() < 0.5 ? -1 : 1);
    scrollingTrees(
      small ? 160 : 320,
      () => ({ x: side() * rng(8, 46), z: rng(0, 42), s: rng(1.5, 2.7) }),
      42,
      6,
    );
  }

  // ---------- Palette ----------
  const day = toColors(opts.day);
  const night = toColors(opts.night);
  return {
    groundY: 0,
    applyPalette(t) {
      grassUniforms.uBase.value.lerpColors(day.base, night.base, t);
      grassUniforms.uTip.value.lerpColors(day.tip, night.tip, t);
      grassUniforms.uGlow.value.lerpColors(day.glow, night.glow, t);
      groundUniforms.uGround.value.lerpColors(day.ground, night.ground, t);
      skyUniforms.uHorizon.value.lerpColors(day.sky, night.sky, t);
      skyUniforms.uZenith.value.lerpColors(day.zenith, night.zenith, t);
      shared.uFog.value.lerpColors(day.fog, night.fog, t);
      leafMat.color.lerpColors(day.leaf, night.leaf, t);
      trunkMat.color.lerpColors(day.trunk, night.trunk, t);
      sun.intensity = 2.2 * (1 - t) + 0.35 * t;
      hemi.intensity = 1.6 * (1 - t) + 0.9 * t;
      sun.color.setRGB(1, 0.95 - 0.1 * t, 0.84 + 0.16 * t);
    },
    update(_time, scroll) {
      for (const { mesh, base, length, near } of scrolling) {
        const arr = mesh.instanceMatrix.array as Float32Array;
        for (let i = 14; i < arr.length; i += 16) arr[i] = wrapZ(base[i], scroll, length, near);
        mesh.instanceMatrix.needsUpdate = true;
      }
    },
  };
}
