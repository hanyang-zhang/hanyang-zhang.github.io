import * as THREE from 'three';
import { buildGrassWorld, type GrassOptions } from './worlds/grass';
import { buildVoxelWorld } from './worlds/voxel';
import { buildCanopyWorld } from './worlds/canopy';
import { sharedUniforms, type World, type WorldContext } from './worlds/shared';

/*
 * The living background behind the page. This file is the engine — renderer,
 * camera, pointer, scrolling, day/night and the render loop. The scenery comes
 * from a "world" (see ./worlds), picked by the style below.
 *
 * Styles: canopy (default), meadow, ghibli, pixel, minecraft — try `?style=meadow`.
 */

interface Style {
  camera: { pos: [number, number, number]; look: [number, number, number]; fov: number };
  portrait?: { pos: [number, number, number]; look: [number, number, number] };
  fog: [number, number];
  pixel?: number; // >0: render at 1/pixel resolution with a dithered, posterised palette
  world: (ctx: WorldContext) => World;
}

const meadowGrass: GrassOptions = {
  day: {
    base: '#2c5326', tip: '#b4cf6e', glow: '#eef2a8', ground: '#33561f', fog: '#cfdcae',
    leaf: '#4c7a2e', trunk: '#6b4b32', sky: '#cfdcae', zenith: '#a9c8d8',
  },
  night: {
    base: '#06140f', tip: '#37624e', glow: '#7fa894', ground: '#07140e', fog: '#0b1713',
    leaf: '#10261d', trunk: '#1b1712', sky: '#0b1713', zenith: '#050b10',
  },
  bladeWidth: 1,
  bladeDensity: 1,
  sky: false,
  bands: 0,
  roundTrees: false,
  sideTrees: 0,
  forest: true,
};

const STYLES: Record<string, Style> = {
  meadow: {
    // Low enough to look across the field; the forest hides the horizon.
    camera: { pos: [0, 4.4, 11], look: [0, 0.9, 0], fov: 40 },
    fog: [14, 46],
    world: (ctx) => buildGrassWorld(ctx, meadowGrass),
  },
  ghibli: {
    camera: { pos: [0, 3.1, 11], look: [0, 1.8, 0], fov: 42 },
    fog: [10, 36],
    world: (ctx) =>
      buildGrassWorld(ctx, {
        day: {
          base: '#2f6a2b', tip: '#c3e27c', glow: '#fff4bf', ground: '#3b6d27', fog: '#e4f0ea',
          leaf: '#5a9a3c', trunk: '#7a5236', sky: '#e4f0ea', zenith: '#5fa6dc',
        },
        night: {
          base: '#081a1c', tip: '#2e5e5a', glow: '#94c8bb', ground: '#071517', fog: '#18323f',
          leaf: '#13302d', trunk: '#1d1a17', sky: '#18323f', zenith: '#070f22',
        },
        bladeWidth: 1.35,
        bladeDensity: 0.8,
        sky: true,
        bands: 4,
        roundTrees: true,
        sideTrees: 18,
        forest: false,
      }),
  },
  pixel: {
    camera: { pos: [0, 4.6, 11], look: [0, 1.2, 0], fov: 42 },
    fog: [12, 34],
    pixel: 4,
    world: (ctx) =>
      buildGrassWorld(ctx, {
        ...meadowGrass,
        day: { ...meadowGrass.day, base: '#2f5f2a', tip: '#a8d462', glow: '#f2f7a0', sky: '#d7e2b8', fog: '#d7e2b8' },
        bladeWidth: 1.6,
        bladeDensity: 0.45,
        sky: true,
        sideTrees: 18,
        forest: false,
      }),
  },
  // From above, like an aerial photo of a forest, with a flock of egrets.
  canopy: {
    // Like a photo taken from a hillside: near crowns large, far ones fading
    // into dark green haze.
    camera: { pos: [0, 16, 20], look: [0, 3, -10], fov: 42 },
    portrait: { pos: [0, 20, 12], look: [0, 2, -2] },
    fog: [30, 80],
    world: buildCanopyWorld,
  },
  minecraft: {
    // Higher up, looking over the blocky landscape rather than standing in it.
    camera: { pos: [0, 13, 21], look: [0, 2, -2], fov: 40 },
    fog: [24, 48],
    world: buildVoxelWorld,
  },
};

export function initMeadow(canvas: HTMLCanvasElement) {
  const styleName = new URLSearchParams(location.search).get('style') ?? 'canopy';
  const style = STYLES[styleName] ?? STYLES.canopy;

  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: !style.pixel, powerPreference: 'high-performance' });
  } catch {
    canvas.dataset.failed = 'true';
    return;
  }

  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const small = matchMedia('(max-width: 760px)').matches;
  if (style.pixel) {
    renderer.setPixelRatio(1 / style.pixel);
    canvas.style.imageRendering = 'pixelated';
  } else {
    renderer.setPixelRatio(Math.min(devicePixelRatio, small ? 1.5 : 1.75));
  }

  const isNight = () => document.documentElement.dataset.theme === 'dark';
  const shared = sharedUniforms(isNight() ? 1 : 0, renderer.getPixelRatio());
  shared.uFogNear.value = style.fog[0];
  shared.uFogFar.value = style.fog[1];

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xffffff, style.fog[0], style.fog[1]);
  const camera = new THREE.PerspectiveCamera(style.camera.fov, 1, 0.1, 140);
  const camBase = new THREE.Vector3(...style.camera.pos);
  const lookAt = new THREE.Vector3(...style.camera.look);

  const world = style.world({ scene, shared, small, defines: style.pixel ? { PIXEL: '' } : {} });
  const wrap = world.wrap ?? { length: 40, near: 12 };
  shared.uWrap.value.set(wrap.length, wrap.near);
  const surfaceAt = world.surfaceAt ?? (() => world.groundY);

  // ---------- Motes: sunlit dust by day, fireflies by night ----------
  // One pool of particles. By day about half of them are soft golden specks
  // drifting up through the light. At night they are fireflies: most loiter in
  // loose groups of very different sizes that gather and drift apart, a few
  // migrate between groups, and about a third wander alone. Each flashes on its
  // own rhythm, and now and then a ripple of flashes spreads through a group.
  // The pointer startles a group, which darts apart and slowly regathers.
  const moteCount = small ? 160 : 320;
  const mPos = new Float32Array(moteCount * 3);
  const mData = new Float32Array(moteCount * 4);
  // Place things mostly where they'll be seen: beside the content card, which
  // covers the middle of the view (the visible half-width grows with depth).
  const camZ = style.camera.pos[2];
  const besideCard = (z: number, from: number, to: number) =>
    (Math.random() < 0.5 ? -1 : 1) * (from + Math.random() * (to - from)) * 0.62 * Math.max(camZ - z, 4);

  for (let i = 0; i < moteCount; i++) {
    // scattered through the scenery, a little above whatever is beneath them
    const z = wrap.near - Math.random() * wrap.length;
    const x = besideCard(z, 0.3, 1.1);
    mPos.set([x, surfaceAt(x, z) + 0.3 + Math.random() * 2.2, z], i * 3);
    // phase, speed, size, rand (rand < 0.65 also shows by day)
    mData.set([Math.random() * 6.28, 0.4 + Math.random() * 0.8, 0.6 + Math.random() * 1.2, Math.random()], i * 4);
  }

  // Firefly groups: centres drift and scroll with the scenery, and each
  // group's spread breathes in and out. They're moved on the CPU so the
  // pointer can be tested against them; `scatter` rises when the pointer
  // passes over a group and decays as it regathers.
  const groupCount = small ? 14 : 26;
  const groups = Array.from({ length: groupCount }, () => {
    const z = wrap.near - Math.random() * Math.min(wrap.length, 50);
    const x = besideCard(z, 0.55, 0.95);
    return {
      x,
      z,
      y: surfaceAt(x, z) + 1 + Math.random() * 1.2,
      seed: Math.random() * 10,
      spread: 0.6 + Math.random() * 1.8, // tight knots to loose clouds
      breath: 0.6 + Math.random() * 0.8,
    };
  });
  const groupPos = groups.map(() => new THREE.Vector3());
  const groupSpread = new Array<number>(groupCount).fill(1);
  const scatter = new Array<number>(groupCount).fill(0);

  const moteGeo = new THREE.BufferGeometry();
  moteGeo.setAttribute('position', new THREE.BufferAttribute(mPos, 3));
  moteGeo.setAttribute('aData', new THREE.BufferAttribute(mData, 4));
  const motes = new THREE.Points(
    moteGeo,
    new THREE.ShaderMaterial({
      uniforms: {
        ...shared,
        uGroups: { value: groupPos },
        uSpread: { value: groupSpread },
        uScatter: { value: scatter },
      },
      transparent: true,
      depthWrite: false, // depth-tested, so low fireflies slip in and out of the crowns
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        uniform float uTime;
        uniform float uNight;
        uniform float uPixelRatio;
        uniform float uScroll;
        uniform vec2 uWrap;
        uniform vec3 uGroups[${groupCount}];
        uniform float uSpread[${groupCount}];
        uniform float uScatter[${groupCount}];
        uniform float uFogNear;
        uniform float uFogFar;
        attribute vec4 aData; // phase, speed, size, rand
        varying float vAlpha;
        varying float vNight;

        float h1(float x) { return fract(sin(x * 127.1) * 43758.5453); }
        // smooth 1D value noise in [-1, 1]
        float vn(float x) {
          float i = floor(x), f = fract(x);
          f = f * f * (3.0 - 2.0 * f);
          return mix(h1(i), h1(i + 1.0), f) * 2.0 - 1.0;
        }
        // a lazy, never-repeating meander
        vec3 meander(float t, float seed) {
          return vec3(
            vn(t + seed * 13.1) + 0.5 * vn(t * 2.3 + seed * 7.7),
            (vn(t * 0.8 + seed * 3.3) + 0.5 * vn(t * 1.9 + seed * 5.1)) * 0.45,
            vn(t + seed * 29.3) + 0.5 * vn(t * 2.1 + seed * 17.9)
          ) / 1.5;
        }
        // groups have very different sizes: low indices collect more members
        int pickGroup(float r) {
          return int(floor(pow(fract(r), 1.8) * ${groupCount.toFixed(1)}));
        }

        void main() {
          float w = aData.w;
          float t = uTime * aData.y + aData.x;
          // scroll along with the scenery beneath, wrapping the same way it does
          vec3 p = position;
          p.z = mod(p.z + uScroll, uWrap.x) - (uWrap.x - uWrap.y);

          // Day: rise slowly on the warm air, drift with the breeze, and fade
          // in and out over each mote's little life.
          float life = fract(uTime * 0.025 * aData.y + w * 7.0);
          vec3 dayP = p + vec3(sin(t * 0.4) * 0.6 + life * 1.0, life * 1.2, cos(t * 0.3) * 0.5);

          // ---- Night ----
          // Uneven pace: mostly lazy, now and then a quick dart or a pause.
          float pace = uTime * (0.1 + aData.y * 0.08) + 1.6 * vn(uTime * 0.13 + aData.x);
          bool loner = w > 0.7;

          // Which group: fixed for most; migrants move to a new group every
          // half-minute or so, flying an arc between the two.
          float seed = fract(w * 7.31);
          bool migrant = fract(w * 3.17) < 0.2;
          float period = 35.0 + fract(w * 5.3) * 40.0;
          float ph = uTime / period + fract(w * 11.1);
          float epoch = migrant ? floor(ph) : 0.0;
          float hop = migrant ? smoothstep(0.8, 1.0, fract(ph)) : 0.0;
          int g0 = pickGroup(seed + epoch * 0.371);
          int g1 = pickGroup(seed + (epoch + 1.0) * 0.371);
          vec3 centre = mix(uGroups[g0], uGroups[g1], hop) + vec3(0.0, sin(hop * 3.1416) * 1.2, 0.0);
          float spread = mix(uSpread[g0], uSpread[g1], hop);
          float s = loner ? 0.0 : mix(uScatter[g0], uScatter[g1], hop);

          vec3 local = meander(pace, w) * spread;
          // startled: dart off in a direction of its own that swerves as it goes
          vec3 away = normalize(vec3(sin(w * 91.0 + uTime * 0.7), cos(w * 57.0) * 0.5, cos(w * 73.0 + uTime * 0.6)));
          local += away * s * 3.5 + meander(pace * 3.0, w + 1.0) * s * 1.2;

          vec3 nightP = loner ? p + meander(pace * 0.6, w) * 3.0 : centre + local;

          // Height layers: some skim low between the crowns, some fly high.
          float layer = fract(w * 19.7);
          nightP.y += layer < 0.35 ? -1.4 : layer > 0.85 ? 1.8 : 0.0;

          p = mix(dayP, nightP, uNight);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          float depthFade = 1.0 - smoothstep(uFogNear, uFogFar, -mv.z);

          float twinkle = 0.65 + 0.35 * sin(uTime * 1.3 + aData.x * 5.0);
          float dayAlpha = step(w, 0.65) * sin(life * 3.1416) * twinkle * 0.95;

          // A firefly flash: a quick light, a slower fade, then a long dark.
          float rate = 2.5 + fract(w * 23.3) * 3.5;
          float f = fract(uTime / rate + fract(w * 31.7));
          float flash = smoothstep(0.0, 0.03, f) * (1.0 - smoothstep(0.05, 0.3, f));
          // Now and then a ripple of flashes spreads out from a group's centre.
          float gf = float(g0);
          float wavePeriod = 7.0 + fract(gf * 0.618) * 8.0;
          float since = fract(uTime / wavePeriod + fract(gf * 0.37)) * wavePeriod;
          float ripple = loner ? 0.0 : exp(-pow((since - length(local) / 2.2) / 0.16, 2.0));
          float glow = max(flash, ripple);
          float nightAlpha = (0.24 + glow * 1.4) * (layer < 0.35 ? 0.7 : 1.0) + s * 0.6;
          vAlpha = mix(dayAlpha, nightAlpha, uNight) * depthFade;
          vNight = uNight;

          gl_PointSize = aData.z * mix(140.0, 150.0, uNight) * uPixelRatio / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying float vAlpha;
        varying float vNight;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          // day: a soft out-of-focus speck; night: a bright core with a halo
          float soft = smoothstep(0.5, 0.0, d);
          float glow = mix(soft * soft, pow(soft, 2.2) + smoothstep(0.12, 0.0, d), vNight);
          vec3 col = mix(vec3(1.0, 0.93, 0.7), vec3(0.85, 1.0, 0.45), vNight);
          gl_FragColor = vec4(col * glow * vAlpha, 1.0);
        }`,
    }),
  );
  motes.frustumCulled = false;
  scene.add(motes);

  // ---------- Day <-> night ----------
  function applyPalette(t: number) {
    world.applyPalette(t);
    (scene.fog as THREE.Fog).color.copy(shared.uFog.value);
    renderer.setClearColor(shared.uFog.value);
  }
  let nightTarget = shared.uNight.value;
  applyPalette(nightTarget);
  window.addEventListener('themechange', () => {
    nightTarget = isNight() ? 1 : 0;
    if (reduceMotion) shared.uNight.value = nightTarget;
    requestRender();
  });

  // ---------- Pointer: project onto the ground ----------
  const raycaster = new THREE.Raycaster();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -world.groundY);
  let pointerInside = false;
  const ndc = new THREE.Vector2();
  const mouseTarget = new THREE.Vector3(0, 0, 100);
  const lastMouse = new THREE.Vector3(0, 0, 100);
  const vel = new THREE.Vector2();
  const hit = new THREE.Vector3();
  let mouseStrengthTarget = 0;
  let parallax = 0;
  window.addEventListener('pointermove', (e) => {
    ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    if (raycaster.ray.intersectPlane(groundPlane, hit) && hit.distanceTo(camera.position) < 40) {
      if (mouseStrengthTarget === 0) {
        shared.uMouse.value.copy(hit); // don't sweep in from far away
        lastMouse.copy(hit);
      }
      mouseTarget.copy(hit);
      mouseStrengthTarget = 1;
    } else {
      mouseStrengthTarget = 0;
    }
    parallax = ndc.x;
    pointerInside = true;
    world.pointer?.(raycaster.ray);
  });
  document.documentElement.addEventListener('pointerleave', () => {
    mouseStrengthTarget = 0;
    pointerInside = false;
    world.pointer?.(null);
  });

  // ---------- Size & loop ----------
  function resize() {
    const w = innerWidth;
    const h = innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camBase.set(...style.camera.pos);
    lookAt.set(...style.camera.look);
    if (w / h < 1) {
      // Portrait: only the top strip of the screen shows the scene (the sheet
      // covers the rest), so look down at nearby ground and shift the view up.
      camera.fov = 50;
      if (style.portrait) {
        camBase.set(...style.portrait.pos);
        lookAt.set(...style.portrait.look);
      } else {
        camBase.y = world.groundY + 4.2;
        camBase.z = 8.5;
        lookAt.set(0, world.groundY + 0.5, 2);
      }
      camera.setViewOffset(w, h, 0, h * 0.3, w, h);
    } else {
      camera.fov = style.camera.fov;
      camera.clearViewOffset();
    }
    camera.position.copy(camBase);
    camera.lookAt(lookAt);
    camera.updateProjectionMatrix();
    requestRender();
  }
  window.addEventListener('resize', resize);
  resize();

  // Move the firefly groups, let each one gather and loosen, and startle any
  // the pointer passes over (tested on screen, so it matches what you see).
  const projected = new THREE.Vector3();
  function updateClouds(time: number, scroll: number, dt: number) {
    const halfW = innerWidth / 2;
    const halfH = innerHeight / 2;
    groups.forEach((g, i) => {
      const z = g.z + Math.cos(time * 0.04 + g.seed * 1.3) * 3 + Math.sin(time * 0.11 + g.seed) * 1;
      groupPos[i].set(
        g.x + Math.sin(time * 0.05 + g.seed) * 3 + Math.sin(time * 0.13 + g.seed * 2) * 1.2,
        g.y + Math.sin(time * 0.17 + g.seed) * 0.5,
        ((((z + scroll) % wrap.length) + wrap.length) % wrap.length) - (wrap.length - wrap.near),
      );
      // gathers in, then loosens, over a minute or two
      groupSpread[i] = g.spread * (0.45 + 1.1 * (0.5 + 0.5 * Math.sin(time * 0.045 * g.breath + g.seed)));

      let near = false;
      if (pointerInside && shared.uNight.value > 0.5) {
        projected.copy(groupPos[i]).project(camera);
        const dx = (projected.x - ndc.x) * halfW;
        const dy = (projected.y - ndc.y) * halfH;
        near = projected.z < 1 && dx * dx + dy * dy < 100 * 100;
      }
      // startle fast, settle back over a few seconds
      scatter[i] = near ? Math.min(1, scatter[i] + dt * 5) : Math.max(0, scatter[i] - dt * 0.35);
    });
  }

  const timer = new THREE.Timer();
  let running = false;
  let frame = 0;

  function render() {
    timer.update();
    const dt = Math.min(timer.getDelta(), 0.05);
    const t = (shared.uTime.value += reduceMotion ? 0 : dt);
    const scroll = (shared.uScroll.value = scrollY * 0.006);

    shared.uNight.value += (nightTarget - shared.uNight.value) * Math.min(1, dt * 2.5);
    applyPalette(shared.uNight.value);

    // Smooth the pointer, and derive how fast it is moving across the ground.
    const m = shared.uMouse.value;
    m.lerp(mouseTarget, Math.min(1, dt * 8));
    if (dt > 0) {
      vel.x += ((m.x - lastMouse.x) / dt - vel.x) * Math.min(1, dt * 10);
      vel.y += ((m.z - lastMouse.z) / dt - vel.y) * Math.min(1, dt * 10);
      if (vel.length() > 4) vel.setLength(4);
      shared.uMouseVel.value.copy(vel);
    }
    lastMouse.copy(m);
    updateClouds(t, scroll, dt);
    shared.uMouseStrength.value += (mouseStrengthTarget - shared.uMouseStrength.value) * Math.min(1, dt * 3);

    world.update(t, scroll);

    camera.position.x += (camBase.x + parallax * 0.6 - camera.position.x) * Math.min(1, dt * 2);
    camera.lookAt(lookAt);

    renderer.render(scene, camera);
  }

  function loop() {
    render();
    frame = requestAnimationFrame(loop);
  }

  function start() {
    if (running || reduceMotion) return;
    running = true;
    timer.update();
    loop();
  }
  function stop() {
    running = false;
    cancelAnimationFrame(frame);
  }
  // With reduced motion we only re-render on demand (scroll, theme, resize).
  function requestRender() {
    if (reduceMotion) requestAnimationFrame(render);
  }
  window.addEventListener('scroll', requestRender, { passive: true });
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));

  render();
  canvas.dataset.ready = 'true';
  start();
}
