// AI wager scene for the research lightbox. One drawing in four layers, a stake, a
// magnifier and a few tags, eased between six states that follow the stages of a wager.
// `mountWager` returns controls to change stage, recolour the backdrop and tear it down.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const INK = '#24352a', INK3 = '#8a968a', RED = '#e0484f', TEAL = '#52c7bf';

// A rounded label drawn to a canvas: a dot, a word, and an optional right-hand note.
function pillTexture(text: string, { note = '', dot = RED, width = 560 } = {}) {
  const cv = document.createElement('canvas');
  cv.width = width;
  cv.height = 96;
  const x = cv.getContext('2d')!;
  x.fillStyle = 'rgba(251,250,244,.96)';
  x.beginPath();
  x.roundRect(4, 4, width - 8, 88, 44);
  x.fill();
  x.strokeStyle = 'rgba(36,53,42,.18)';
  x.lineWidth = 3;
  x.stroke();
  x.fillStyle = dot;
  x.beginPath();
  x.arc(50, 48, 12, 0, 7);
  x.fill();
  x.font = '600 38px "JetBrains Mono", Menlo, monospace';
  x.textBaseline = 'middle';
  x.fillStyle = INK;
  x.fillText(text, 80, 50);
  if (note) {
    x.fillStyle = INK3;
    x.textAlign = 'right';
    x.fillText(note, width - 32, 50);
  }
  return cv;
}

function bubbleTexture() {
  const cv = document.createElement('canvas');
  cv.width = 360;
  cv.height = 260;
  const x = cv.getContext('2d')!;
  x.fillStyle = '#ffffff';
  x.strokeStyle = 'rgba(36,53,42,.15)';
  x.lineWidth = 4;
  x.beginPath();
  x.roundRect(10, 10, 340, 180, 56);
  x.moveTo(90, 186);
  x.lineTo(70, 250);
  x.lineTo(150, 186);
  x.fill();
  x.font = '700 104px Inter, Helvetica, Arial';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillStyle = RED;
  x.fillText('AI?', 180, 104);
  return cv;
}

function sprite(canvas: HTMLCanvasElement, w: number) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, opacity: 0 }));
  sp.scale.set(w, (w * canvas.height) / canvas.width, 1);
  sp.renderOrder = 10;
  sp.visible = false;
  return sp;
}

export type WagerScene = { setStep(n: number): void; setBackground(colour: string): void; dispose(): void };

// `still` jumps straight to each state (for a resting view or a pre-rendered picture);
// `thumb` frames it for the small preview, without the labels nobody could read there;
// `capture` keeps the frame readable for screenshots.
export async function mountWager(
  canvas: HTMLCanvasElement,
  { background = '#eef2e6', step: first = 1, still = false, thumb = false, capture = false } = {},
): Promise<WagerScene> {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: capture });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(background);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.55;

  const camera = new THREE.PerspectiveCamera(27, 1, 0.1, 100);
  camera.position.set(8.6, 7.4, 10.2);
  const zoom = thumb ? 1.12 : 1;
  const target = new THREE.Vector3(0.1, thumb ? 2.15 : 1.75, 0);

  const sun = new THREE.DirectionalLight('#fff3dc', 2.6);
  sun.position.set(-3.5, 9, 4.5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.radius = 8;
  sun.shadow.bias = -0.0004;
  Object.assign(sun.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5 });
  scene.add(sun, new THREE.HemisphereLight('#ffffff', '#c9d6b8', 0.6));

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ color: '#2b4a26', opacity: 0.1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const loader = new THREE.TextureLoader();
  const load = (name: string) =>
    new Promise<THREE.Texture>((ok, fail) =>
      loader.load(`/research/wager/${name}`, (t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = 8;
        ok(t);
      }, undefined, fail),
    );
  const maps = await Promise.all(['l1-sketch.svg', 'l2-lineart.svg', 'l3-flats.svg', 'l4-final.svg'].map(load));

  // Everything sits in one group turned most of the way toward the camera, so the
  // drawing reads upright.
  const world = new THREE.Group();
  world.rotation.y = Math.atan2(camera.position.x - target.x, camera.position.z - target.z) - 0.38;
  scene.add(world);

  // Layers: pulled apart while the evidence is shown, stacked into one drawing otherwise.
  const S = 2.5, T = 0.05, TILT = 0.34, H = (S + 0.12) / 2;
  const layers = [
    { label: 'SKETCH', time: '00:12', glass: false },
    { label: 'LINEART', time: '00:41', glass: false },
    { label: 'FLATS', time: '01:26', glass: true },
    { label: 'FINAL', time: '02:58', glass: false },
  ].map((L, i) => ({
    ...L,
    map: maps[i],
    apart: new THREE.Vector3(-0.75 + i * 0.5, 0.3 + i * 0.92, 0.45 - i * 0.3),
    stacked: new THREE.Vector3(0, 1.45 + i * 0.06, 0),
  }));
  const sheets = layers.map((L) => {
    const g = new THREE.Group();
    g.position.copy(L.stacked);
    g.rotation.x = TILT;
    const slab = new THREE.Mesh(
      new RoundedBoxGeometry(S + 0.12, T, S + 0.12, 4, 0.025),
      L.glass
        ? new THREE.MeshPhysicalMaterial({ color: '#ffffff', transmission: 1, roughness: 0.05, thickness: 0.15, ior: 1.45, clearcoat: 1 })
        : new THREE.MeshStandardMaterial({ color: '#fbfaf4', roughness: 0.85 }),
    );
    slab.castShadow = !L.glass;
    slab.receiveShadow = true;
    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(S, S),
      new THREE.MeshStandardMaterial({ map: L.map, transparent: L.glass, roughness: 0.6, depthWrite: !L.glass }),
    );
    face.rotation.x = -Math.PI / 2;
    face.position.y = T / 2 + 0.002;
    face.receiveShadow = true;
    face.castShadow = L.glass;
    g.add(slab, face);
    world.add(g);
    return g;
  });
  const onSheet = (i: number, x: number, y: number, z: number) => new THREE.Vector3(x, y, z).applyMatrix4(sheets[i].matrix);

  // Exploded-view guides between matching corners, rebuilt as the layers move.
  const dash = new THREE.LineDashedMaterial({ color: INK3, dashSize: 0.06, gapSize: 0.05, transparent: true, opacity: 0 });
  const CORNERS = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  const guides: { line: THREE.Line; i: number; sx: number; sz: number }[] = [];
  for (let i = 0; i < 3; i++)
    for (const [sx, sz] of CORNERS) {
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), dash);
      world.add(line);
      guides.push({ line, i, sx, sz });
    }

  // Step 4: recording timestamps beside each layer.
  const stamps = layers.map((L) => {
    const sp = sprite(pillTexture(L.label, { note: L.time }), 2.0);
    world.add(sp);
    return sp;
  });

  // Step 1: the accusation.
  const bubble = sprite(bubbleTexture(), 0.95);
  world.add(bubble);

  // Step 3: the terms, floating around the drawing.
  const rules = [
    { text: 'STAKE', at: [-2.35, 2.75, 0.4] },
    { text: 'LIVESTREAM', at: [-2.55, 1.85, 0.6] },
    { text: 'WHO VOTES', at: [2.45, 2.6, 0.2] },
    { text: 'VOID IF …', at: [2.55, 1.7, 0.4] },
  ].map(({ text, at }) => {
    const sp = sprite(pillTexture(text, { dot: TEAL, width: 470 }), 1.7);
    sp.userData.at = new THREE.Vector3(...at);
    world.add(sp);
    return sp;
  });

  // Step 5: two tallies race for a moment, then settle on the result.
  const barGeo = new RoundedBoxGeometry(0.42, 1, 0.42, 4, 0.12);
  barGeo.translate(0, 0.5, 0);
  const bars = [
    { colour: TEAL, at: [1.95, 0, -0.55], label: 'HUMAN' },
    { colour: '#c3cbbb', at: [2.5, 0, -0.85], label: 'AI' },
  ].map(({ colour, at, label }, i) => {
    const m = new THREE.Mesh(barGeo, new THREE.MeshStandardMaterial({ color: colour, roughness: 0.55 }));
    m.position.set(...at);
    m.scale.set(1, 0.001, 1);
    m.castShadow = true;
    m.visible = false;
    world.add(m);
    const tag = sprite(pillTexture(label, { dot: colour, width: 330 }), 1.0);
    tag.userData.dx = i ? 0.3 : -0.3;
    tag.userData.dy = i ? 0.62 : 0.3;
    world.add(tag);
    return { m, tag, phase: i * 2.4, result: [1.5, 0.8][i] };
  });

  // The stake: a matching stack on each side, merged into one when it changes hands.
  const face = document.createElement('canvas');
  face.width = face.height = 512;
  const fc = face.getContext('2d')!;
  const grad = fc.createRadialGradient(190, 170, 20, 256, 256, 260);
  grad.addColorStop(0, '#ffe39a');
  grad.addColorStop(1, '#d9a032');
  fc.fillStyle = grad;
  fc.fillRect(0, 0, 512, 512);
  fc.strokeStyle = 'rgba(120,80,10,.45)';
  fc.lineWidth = 14;
  fc.beginPath();
  fc.arc(256, 256, 200, 0, Math.PI * 2);
  fc.stroke();
  fc.fillStyle = 'rgba(120,80,10,.6)';
  fc.font = '700 250px Inter, Helvetica, Arial';
  fc.textAlign = 'center';
  fc.textBaseline = 'middle';
  fc.fillText('¥', 256, 270);
  const faceTex = new THREE.CanvasTexture(face);
  faceTex.colorSpace = THREE.SRGBColorSpace;
  const gold = new THREE.MeshPhysicalMaterial({ color: '#e2ac40', metalness: 1, roughness: 0.3 });
  const goldFace = new THREE.MeshPhysicalMaterial({ map: faceTex, metalness: 0.85, roughness: 0.32 });
  const coinGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.085, 72);
  const coins: THREE.Mesh[] = [];
  for (const [side, x, z] of [[0, -1.2, 2.3], [1, 2.6, 1.2]])
    for (let k = 0; k < 4; k++) {
      const m = new THREE.Mesh(coinGeo, [gold, goldFace, gold]);
      const jitter = new THREE.Vector3(Math.sin((k + side * 4) * 2.1) * 0.025, 0, Math.cos((k + side * 4) * 1.7) * 0.025);
      m.userData.rest = new THREE.Vector3(x, 0.045 + k * 0.087, z).add(jitter);
      m.userData.merged = new THREE.Vector3(1.0, 0.045 + (side * 4 + k) * 0.087, 2.55).add(jitter);
      m.userData.drop = k * 0.35 + side * 0.2;
      m.scale.setScalar(0.001);
      m.visible = false;
      m.castShadow = m.receiveShadow = true;
      world.add(m);
      coins.push(m);
    }

  // A magnifier: drifts in at the accusation, hovers over the evidence, scans during the vote.
  const mag = new THREE.Group();
  const rim = new THREE.MeshPhysicalMaterial({ color: '#2f4a36', metalness: 0.3, roughness: 0.35, clearcoat: 1 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.045, 24, 96), rim);
  const lens = new THREE.Mesh(
    new THREE.CylinderGeometry(0.41, 0.41, 0.05, 96),
    new THREE.MeshPhysicalMaterial({ color: '#ffffff', transmission: 1, roughness: 0, thickness: 0.5, ior: 1.6, clearcoat: 1 }),
  );
  lens.rotation.x = Math.PI / 2;
  const handle = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.6, 8, 24), rim);
  handle.position.set(0, -0.78, 0);
  [ring, lens, handle].forEach((m) => {
    m.castShadow = true;
    mag.add(m);
  });
  // Held over the drawing, handle towards it; held beside the layers, handle away from them.
  const OVER = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.95, 0.1, -0.75));
  const BESIDE = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.6, 0.35, 0.7));
  mag.quaternion.copy(OVER);
  mag.scale.setScalar(0.001);
  mag.visible = false;
  world.add(mag);

  const controls = new OrbitControls(camera, canvas);
  controls.target.copy(target);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.enableZoom = false;
  controls.minPolarAngle = 0.55;
  controls.maxPolarAngle = 1.2;
  const base = Math.atan2(camera.position.x - target.x, camera.position.z - target.z);
  controls.minAzimuthAngle = base - 0.6;
  controls.maxAzimuthAngle = base + 0.6;

  const resize = () => {
    const { clientWidth: w, clientHeight: h } = canvas;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Pull back on narrow canvases (phones), where the width is what runs out.
    camera.zoom = zoom * Math.min(1, camera.aspect / 1.15);
    camera.updateProjectionMatrix();
  };
  resize();
  const watcher = new ResizeObserver(resize);
  watcher.observe(canvas);

  let step = first;
  let snap = true; // jump straight to the first state
  let entered = 0; // time the current step began
  const timer = new THREE.Timer();
  const tmp = new THREE.Vector3();

  const fade = (sp: THREE.Sprite, on: boolean, a: number) => {
    sp.material.opacity += ((on ? 1 : 0) - sp.material.opacity) * a;
    sp.visible = sp.material.opacity > 0.01;
  };
  const grow = (o: THREE.Object3D, on: boolean, a: number) => {
    const s = o.scale.x + ((on ? 1 : 0) - o.scale.x) * a;
    o.scale.setScalar(Math.max(s, 0.001));
    o.visible = s > 0.01;
  };

  renderer.setAnimationLoop(() => {
    timer.update();
    const dt = Math.min(timer.getDelta(), 0.05);
    const t = timer.getElapsed();
    // A still preview jumps straight to each state instead of easing into it.
    const since = still ? Infinity : t - entered;
    const ease = (rate) => (snap || still ? 1 : 1 - Math.exp(-rate * dt));
    const bob = still ? 0 : 1;
    const apart = step === 4 || step === 5;

    sheets.forEach((g, i) => {
      tmp.copy(apart ? layers[i].apart : layers[i].stacked);
      tmp.y += Math.sin(t * 0.6 + i * 0.7) * 0.025 * bob;
      g.position.lerp(tmp, ease(apart ? 2.6 : 3.4));
      g.updateMatrix();
    });

    dash.opacity += ((apart ? 0.7 : 0) - dash.opacity) * ease(4);
    for (const { line, i, sx, sz } of guides) {
      line.geometry.setFromPoints([onSheet(i, sx * H, T / 2, sz * H), onSheet(i + 1, sx * H, T / 2, sz * H)]);
      line.computeLineDistances();
    }

    stamps.forEach((sp, i) => {
      sp.position.copy(onSheet(i, -H - 1.05, 0.1, 0.35));
      fade(sp, !thumb && step === 4 && since > 0.4 + i * 0.15, ease(5));
    });

    bubble.position.copy(onSheet(3, 1.05, 0.4, -1.25));
    bubble.position.y += Math.sin(t * 1.4) * 0.04 * bob;
    fade(bubble, step === 1 && since > 1.2, ease(5));

    rules.forEach((sp, i) => {
      const on = step === 3 && since > 0.3 + i * 0.25;
      tmp.copy(sp.userData.at);
      tmp.y += (on ? 0 : -0.25) + Math.sin(t * 0.9 + i) * 0.03 * bob;
      sp.position.lerp(tmp, snap ? 1 : ease(5));
      fade(sp, on, ease(5));
    });

    bars.forEach(({ m, tag, phase, result }) => {
      const on = step === 5;
      const race = Number.isFinite(since) ? Math.sin(since * 4 + phase) * 0.45 * Math.exp(-since * 1.1) : 0;
      const h = on ? result + race : 0.001;
      m.scale.y += (h - m.scale.y) * ease(3);
      m.visible = m.scale.y > 0.01;
      tag.position.set(m.position.x + tag.userData.dx, m.scale.y + tag.userData.dy, m.position.z);
      fade(tag, on, ease(5));
    });

    coins.forEach((m) => {
      const on = step >= 2;
      if (on && !m.visible) m.position.copy(m.userData.rest).add(tmp.set(0, 2.4 + m.userData.drop * 3, 0));
      const spot = step === 6 ? m.userData.merged : m.userData.rest;
      const ready = since > m.userData.drop || step !== 2;
      if (ready || !on) m.position.lerp(spot, ease(step === 6 ? 2.2 : 5));
      grow(m, on && ready, ease(8));
    });

    const showMag = step === 1 || step === 4 || step === 5;
    if (step === 1) {
      tmp.copy(onSheet(3, 1.05 + Math.cos(t * 0.6) * 0.2 * bob, 0.8, 0.05 + Math.sin(t * 0.6) * 0.15 * bob));
    } else if (step === 5) {
      // Scan up and down a line clear of every layer's right edge, never through them.
      const s = (Math.sin(t * 0.7) + 1) / 2;
      const x = layers[3].apart.x + H + 0.75;
      tmp.copy(onSheet(3, x - layers[3].apart.x, 0.6, -0.2)).lerp(onSheet(1, x - layers[1].apart.x, 0.6, -0.2), bob ? s : 0.3);
    } else {
      tmp.copy(onSheet(3, 0.95, 0.9 + Math.sin(t * 0.5) * 0.05 * bob, -0.55));
    }
    if (showMag && !mag.visible) mag.position.copy(tmp).add(new THREE.Vector3(2.2, 0.6, 0));
    // Travel in an arc: lifted while far from the spot, so it clears the layers' edges.
    if (!still) tmp.y += Math.min(mag.position.distanceTo(tmp), 2) * 0.9;
    mag.position.lerp(tmp, ease(2.4));
    mag.quaternion.slerp(step === 5 ? BESIDE : OVER, ease(2));
    grow(mag, showMag, ease(4));

    snap = false;
    controls.update();
    renderer.render(scene, camera);
  });

  return {
    setStep(n) {
      if (n === step) return;
      step = n;
      entered = timer.getElapsed();
      if (still) snap = true;
    },
    setBackground(colour) {
      (scene.background as THREE.Color).set(colour);
    },
    dispose() {
      renderer.setAnimationLoop(null);
      watcher.disconnect();
      controls.dispose();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        for (const mat of [m.material ?? []].flat() as THREE.Material[]) {
          for (const v of Object.values(mat)) if (v instanceof THREE.Texture) v.dispose();
          mat.dispose();
        }
      });
      maps.forEach((t) => t.dispose());
      scene.environment?.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
