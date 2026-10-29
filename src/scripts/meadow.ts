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
  shared.uGroundY.value = world.groundY;

  // ---------- Motes: pollen by day, fireflies by night ----------
  const moteCount = small ? 90 : 180;
  const mPos = new Float32Array(moteCount * 3);
  const mData = new Float32Array(moteCount * 4);
  for (let i = 0; i < moteCount; i++) {
    mPos.set([(Math.random() - 0.5) * 30, 0.4 + Math.random() * 2.4, Math.random() * 22 - 14], i * 3);
    mData.set([Math.random() * 6.28, 0.4 + Math.random() * 0.8, 0.6 + Math.random() * 1.2, Math.random()], i * 4);
  }
  const moteGeo = new THREE.BufferGeometry();
  moteGeo.setAttribute('position', new THREE.BufferAttribute(mPos, 3));
  moteGeo.setAttribute('aData', new THREE.BufferAttribute(mData, 4));
  const motes = new THREE.Points(
    moteGeo,
    new THREE.ShaderMaterial({
      uniforms: shared,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        uniform float uTime;
        uniform float uNight;
        uniform float uPixelRatio;
        uniform float uGroundY;
        attribute vec4 aData; // phase, speed, size, rand
        varying float vAlpha;
        void main() {
          float t = uTime * aData.y + aData.x;
          vec3 p = position + vec3(sin(t * 0.7) * 0.9, uGroundY + sin(t * 1.3) * 0.35, cos(t * 0.5) * 0.9);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          float blink = pow(sin(uTime * (0.8 + aData.w) + aData.x * 3.0) * 0.5 + 0.5, 3.0);
          vAlpha = mix(0.28, 0.35 + blink * 1.1, uNight) * (1.0 - smoothstep(14.0, 26.0, -mv.z));
          gl_PointSize = aData.z * mix(28.0, 110.0, uNight) * uPixelRatio / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uNight;
        varying float vAlpha;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float glow = smoothstep(0.5, 0.0, d);
          glow = mix(glow, pow(glow, 2.2) + smoothstep(0.12, 0.0, d), uNight);
          vec3 col = mix(vec3(1.0, 0.98, 0.85), vec3(0.85, 1.0, 0.45), uNight);
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
    world.pointer?.(raycaster.ray);
  });
  document.documentElement.addEventListener('pointerleave', () => {
    mouseStrengthTarget = 0;
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
