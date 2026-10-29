// The Treellis research picture: a rocket made with a model, shown the way Treellis
// shows it — a structure tree, a 3D viewport and a parameter panel, all linked.
// Three steps play through how a person and the model share the work: the model
// builds from a prompt, the person tweaks a part by hand, then asks the model to
// change one branch. Every node is a group in the scene, so its sliders really move it.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

type Node = { key: string; name: string; original?: string; kind: string; later?: boolean; children?: Node[] };
type Params = { t: number[]; r: number[]; s: number[]; radius: number; height: number; count: number; colour: string };

// The rocket as an assembly tree, like Treellis's AML.
const TREE: Node = {
  key: 'rocket', name: 'Rocket', kind: 'Union', children: [
    { key: 'nose', name: 'Nose', kind: 'Cone' },
    { key: 'body', name: 'Body', kind: 'Cylinder' },
    { key: 'window', name: 'Window', kind: 'Sphere' },
    { key: 'fins', name: 'Fins', kind: 'Repeat', children: [{ key: 'fin', name: 'Fin', kind: 'Extrude' }] },
    { key: 'engine', name: 'Engine', kind: 'Union', children: [
      { key: 'nozzle', name: 'Nozzle', kind: 'Cylinder' },
      { key: 'flames', name: 'Flames', kind: 'Repeat', later: true, children: [{ key: 'flame', name: 'Flame', kind: 'Cone', later: true }] },
    ] },
  ],
};
const NODES: Record<string, Node> = {};
(function index(n: Node) { NODES[n.key] = n; n.original = n.name; n.children?.forEach(index); })(TREE);
const leavesOf = (n: Node): string[] => (n.children ? n.children.flatMap(leavesOf) : [n.key]);
const COLOURS: Record<string, string> = { nose: '#3d6b35', body: '#f3efe2', window: '#6fb3a6', fin: '#7fa865', nozzle: '#a07a4f', flame: '#e8894a' };
const HL = new THREE.Color('#f0c35c');

const GLYPH: Record<string, string> = {
  Union: '<circle cx="3.5" cy="0" r="3.6"/><circle cx="8.5" cy="0" r="3.6"/>',
  Repeat: '<circle cx="2" cy="0" r="1.8"/><circle cx="6.5" cy="0" r="1.8"/><circle cx="11" cy="0" r="1.8"/>',
  Cone: '<path d="M5 -4.5 L9.5 4 L0.5 4Z"/>',
  Cylinder: '<rect x="1" y="-3.5" width="8" height="8" rx="1"/><ellipse cx="5" cy="-3.5" rx="4" ry="1.6"/>',
  Sphere: '<circle cx="5" cy="0" r="4.2"/>',
  Extrude: '<path d="M2 4 L4 -4 L10 -4 L8 4Z"/>',
};
const SLIDERS: Record<string, [string, number, number, number]> = {
  t0: ['Translate [x]', -1, 1, 0.01], t1: ['Translate [y]', -1, 1, 0.01], t2: ['Translate [z]', -1, 1, 0.01],
  r0: ['Rotate° [x]', -180, 180, 1], r1: ['Rotate° [y]', -180, 180, 1], r2: ['Rotate° [z]', -180, 180, 1],
  s0: ['Scale [x]', 0.2, 2, 0.01], s1: ['Scale [y]', 0.2, 2, 0.01], s2: ['Scale [z]', 0.2, 2, 0.01],
  radius: ['Radius ×', 0.3, 2, 0.01], height: ['Height ×', 0.3, 2, 0.01], count: ['Repeat count', 1, 6, 1],
};

// `play` resolves true if the step ran to the end, false if something cut it short.
export type TreellisScene = { play(n: number): Promise<boolean>; setTheme(): void; dispose(): void };

// `root` holds the tree svg, the parameter panel and the prompt; `canvas` is the viewport.
// `still` skips the steps and shows how things end; `onStep` hears which step is playing.
export function mountTreellis(
  root: HTMLElement,
  canvas: HTMLCanvasElement,
  { still = false, capture = false, onStep = (_n: number) => {} } = {},
): TreellisScene {
  const svg = root.querySelector<SVGSVGElement>('.tree-svg')!;
  const panel = root.querySelector<HTMLElement>('.params')!;
  const promptEl = root.querySelector<HTMLElement>('.prompt')!;
  const textEl = promptEl.querySelector<HTMLElement>('.text')!;
  const chipEl = promptEl.querySelector<HTMLElement>('.chip')!;
  const goEl = promptEl.querySelector<HTMLElement>('.go')!;

  const css = (name: string) => getComputedStyle(root).getPropertyValue(name).trim();
  let night = document.documentElement.dataset.theme === 'dark';
  // a tint of a part's colour toward the paper, for its tree node (deeper at night,
  // so the light text stays readable)
  const tint = (c: string) => '#' + new THREE.Color(c).lerp(new THREE.Color(css('--paper')), night ? 0.8 : 0.55).getHexString();

  // ---------- Scene ----------
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: capture });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(css('--paper'));
  scene.add(new THREE.HemisphereLight('#ffffff', '#b9c7a6', 1.6));
  const sun = new THREE.DirectionalLight('#fff3dc', 2.2);
  sun.position.set(-3, 6, 4);
  scene.add(sun);

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  camera.position.set(6.6, 4.2, 8.4);
  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0, 1.75, 0);
  controls.enablePan = false;
  controls.enableZoom = false;
  controls.minPolarAngle = 0.6;
  controls.maxPolarAngle = 1.45;
  controls.update();

  // Every tree node is a group in the scene (one per copy under a Repeat), so a
  // node's parameters map straight onto its transform, as editing the AML would.
  const objs: Record<string, THREE.Group[]> = {};
  const parts: { mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>; key: string }[] = [];
  const node = (key: string, parent: THREE.Object3D, at = [0, 0, 0], rot = [0, 0, 0]) => {
    const g = new THREE.Group();
    g.position.set(at[0], at[1], at[2]);
    g.rotation.set(rot[0], rot[1], rot[2]);
    g.userData.rest = { p: g.position.clone(), r: g.rotation.clone() };
    parent.add(g);
    (objs[key] ??= []).push(g);
    return g;
  };
  const part = (key: string, parent: THREE.Object3D, geo: THREE.BufferGeometry, at: number[], rot?: number[]) => {
    const g = node(key, parent, at, rot);
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: COLOURS[key], roughness: 0.7, flatShading: key === 'fin' }));
    mesh.userData.base = mesh.material.color.clone();
    g.add(mesh);
    g.userData.mesh = mesh;
    parts.push({ mesh, key });
    return g;
  };
  // A Repeat holds six copies and shows the first `count`, spaced evenly around the axis.
  const repeat = (key: string, parent: THREE.Object3D, offset: number, make: (pivot: THREE.Group) => void) => {
    const g = node(key, parent);
    g.userData.offset = offset;
    g.userData.pivots = Array.from({ length: 6 }, () => {
      const pivot = new THREE.Group();
      g.add(pivot);
      make(pivot);
      return pivot;
    });
    return g;
  };

  const rocket = node('rocket', scene, [0, 0.4, 0]);
  part('nose', rocket, new THREE.ConeGeometry(0.5, 0.95, 48), [0, 3.175, 0]);
  part('body', rocket, new THREE.CylinderGeometry(0.5, 0.5, 2.2, 48), [0, 1.6, 0]);
  part('window', rocket, new THREE.SphereGeometry(0.18, 32, 16).scale(1, 1, 0.45), [0, 2.2, 0.49]);
  const finShape = new THREE.Shape([[0, 0], [0.5, -0.2], [0.5, 0.25], [0, 0.95]].map(([x, y]) => new THREE.Vector2(x, y)));
  const finGeo = new THREE.ExtrudeGeometry(finShape, { depth: 0.07, bevelEnabled: false }).translate(0, 0, -0.035);
  repeat('fins', rocket, Math.PI / 6, (pivot) => part('fin', pivot, finGeo, [0.45, 0.55, 0]));
  const engine = node('engine', rocket);
  part('nozzle', engine, new THREE.CylinderGeometry(0.28, 0.4, 0.4, 32), [0, 0.3, 0]);
  const flameGeo = new THREE.ConeGeometry(0.1, 0.42, 20);
  repeat('flames', engine, Math.PI / 2, (pivot) => part('flame', pivot, flameGeo, [0.15, -0.12, 0], [Math.PI, 0, 0]));

  // A soft painted shadow instead of a real-time one.
  const blob = document.createElement('canvas');
  blob.width = blob.height = 128;
  const blobTex = new THREE.CanvasTexture(blob);
  const paintShadow = () => {
    const g = blob.getContext('2d')!;
    g.clearRect(0, 0, 128, 128);
    const grad = g.createRadialGradient(64, 64, 4, 64, 64, 64);
    grad.addColorStop(0, night ? 'rgba(0,0,0,.45)' : 'rgba(43,74,38,.26)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    blobTex.needsUpdate = true;
  };
  paintShadow();
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 2.8), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  scene.add(shadow);

  // Draw only while something changes: tweens, a drag, a hover, a resize.
  type Tween = { t0: number; dur: number; fn: (k: number) => void; done: () => void };
  const tweens = new Set<Tween>();
  let ticking = false;
  let frame = 0;
  const render = () => {
    if (ticking) return;
    ticking = true;
    frame = requestAnimationFrame(tick);
  };
  function tick(now: number) {
    for (const t of [...tweens]) {
      const k = Math.min(1, (now - t.t0) / t.dur);
      t.fn(k);
      if (k >= 1) { tweens.delete(t); t.done(); }
    }
    renderer.render(scene, camera);
    ticking = false;
    if (tweens.size) render();
  }
  const tween = (dur: number, fn: (k: number) => void) => new Promise<void>((done) => { tweens.add({ t0: performance.now(), dur, fn, done }); render(); });
  const backOut = (k: number) => 1 + 2.4 * (k - 1) ** 3 + 1.4 * (k - 1) ** 2;
  controls.addEventListener('change', render);
  const watcher = new ResizeObserver(() => {
    const { clientWidth: w, clientHeight: h } = canvas;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // pull back on narrow canvases, where the width is what runs out
    camera.zoom = Math.min(1, camera.aspect / 0.7);
    camera.updateProjectionMatrix();
    render();
  });
  watcher.observe(canvas);

  // ---------- Parameters of every node ----------
  const P: Record<string, Params> = {};
  const defaults = (key: string): Params => ({ t: [0, 0, 0], r: [0, 0, 0], s: [1, 1, 1], radius: 1, height: 1, count: 3, colour: COLOURS[key] });
  const rad = THREE.MathUtils.degToRad;
  function apply(key: string) {
    const p = P[key];
    for (const o of objs[key]) {
      const { rest, mesh, pivots, offset } = o.userData;
      o.position.set(rest.p.x + p.t[0], rest.p.y + p.t[1], rest.p.z + p.t[2]);
      o.rotation.set(rest.r.x + rad(p.r[0]), rest.r.y + rad(p.r[1]), rest.r.z + rad(p.r[2]));
      o.scale.set(p.s[0], p.s[1], p.s[2]);
      if (mesh) {
        mesh.scale.set(p.radius, NODES[key].kind === 'Sphere' ? p.radius : p.height, p.radius);
        mesh.userData.base.set(p.colour);
      }
      (pivots as THREE.Group[] | undefined)?.forEach((pv, i) => {
        pv.visible = i < p.count;
        pv.rotation.y = offset + (i / p.count) * Math.PI * 2;
      });
    }
    paint();
  }
  function resetParams() {
    for (const key of Object.keys(objs)) { P[key] = defaults(key); apply(key); }
    for (const n of Object.values(NODES)) n.name = n.original!;
  }

  // ---------- State shared by the three views ----------
  const state = { shown: new Set<string>(), by: {} as Record<string, 'ai' | 'you'>, scope: null as string | null, fresh: new Set<string>() };
  let hovered: string | null = null;
  let selected: string | null = null;
  let run = 0; // bumps whenever a step starts or the person takes over, so a playing step stops
  const kindLabel = (n: Node) => (n.kind === 'Repeat' ? `Repeat ×${P[n.key].count}` : n.kind);
  const badge = (by: string) => (by === 'you' ? 'YOU' : '✦ AI');

  // ---------- Structure tree, drawn like Treellis's: top-down, groups as hexagons,
  // primitives as boxes, each with a small glyph for what it is ----------
  const SW = 78, LH = 92, PAD = 8; // slot width, level height
  const HEX = { w: 74, h: 62 }, BOX = { w: 74, h: 48 };
  type Placed = { n: Node; depth: number; x: number; kids: Placed[] };
  function drawTree() {
    // leaves take one slot each, left to right; parents sit centred over their children
    let slot = 0;
    const place = (n: Node, depth: number): Placed | null => {
      if (!state.shown.has(n.key)) return null;
      const kids = (n.children ?? []).map((c) => place(c, depth + 1)).filter((k): k is Placed => !!k);
      const x = kids.length ? (kids[0].x + kids[kids.length - 1].x) / 2 : slot++;
      return { n, depth, x, kids };
    };
    const root = place(TREE, 0);
    const all: Placed[] = [];
    (function walk(t: Placed | null) { if (!t) return; all.push(t); t.kids.forEach(walk); })(root);
    const size = (t: Placed) => (t.n.children ? HEX : BOX);
    // always laid out on six slots, so the tree keeps one scale while it grows
    const slots = 6;
    const offset = (slots - Math.max(1, slot)) / 2;
    const at = (t: Placed) => [PAD + (t.x + offset) * SW + SW / 2, PAD + 22 + HEX.h / 2 + t.depth * LH];
    svg.setAttribute('viewBox', `0 0 ${PAD * 2 + slots * SW} ${PAD * 2 + 38 + HEX.h + 3 * LH}`);

    let out = '';
    // the branch the model was asked to edit
    const scopeT = all.find((t) => t.n.key === state.scope);
    if (scopeT) {
      const sub: Placed[] = [];
      (function walk(t: Placed) { sub.push(t); t.kids.forEach(walk); })(scopeT);
      const x0 = Math.min(...sub.map((t) => at(t)[0] - size(t).w / 2)) - 7;
      const x1 = Math.max(...sub.map((t) => at(t)[0] + size(t).w / 2)) + 7;
      const y0 = Math.min(...sub.map((t) => at(t)[1] - size(t).h / 2)) - 22;
      const y1 = Math.max(...sub.map((t) => at(t)[1] + size(t).h / 2)) + 20;
      out += `<rect class="scope" x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" rx="12"/>`;
    }
    for (const t of all) for (const k of t.kids) {
      const [x1, y1] = at(t), [x2, y2] = at(k);
      const sy = y1 + size(t).h / 2, ey = y2 - size(k).h / 2, my = (sy + ey) / 2;
      out += `<path class="edge" d="M${x1} ${sy}C${x1} ${my} ${x2} ${my} ${x2} ${ey}"/>`;
    }
    for (const t of all) {
      const [x, y] = at(t);
      const { w, h } = size(t);
      const group = !!t.n.children;
      const by = state.by[t.n.key] ?? 'ai';
      const shape = group
        ? `<polygon class="shape" points="0,${-h / 2} ${w / 2},${-h / 4} ${w / 2},${h / 4} 0,${h / 2} ${-w / 2},${h / 4} ${-w / 2},${-h / 4}"/>`
        : `<rect class="shape" x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="7"/>`;
      const cls = ['tnode', group && 'group', state.fresh.has(t.n.key) && 'fresh'].filter(Boolean).join(' ');
      const fill = group ? 'var(--group)' : tint(P[t.n.key].colour);
      out += `<g class="${cls}" data-key="${t.n.key}" transform="translate(${x} ${y})" style="--c:${fill}">
        ${shape}
        <text class="nm" x="0" y="-2" text-anchor="middle">${t.n.name}</text>
        <text class="kd" y="14">${kindLabel(t.n)}</text>
        <g class="glyph">${GLYPH[t.n.kind] ?? ''}</g>
        <text class="by ${by}" x="${w / 2}" y="${group ? h / 4 + 19 : h / 2 + 13}" text-anchor="end">${badge(by)}</text>
        ${t.n.key === selected ? `<g transform="translate(${w / 2 - 9} ${-h / 2 - 12})">
          <g class="act del" data-act="del" transform="translate(-40 0)"><title>Delete node</title><circle r="9"/><text y="5">×</text></g>
          <g class="act add" data-act="add" transform="translate(-20 0)"><title>Add a child</title><circle r="9"/><text y="5">+</text></g>
          <g class="act ai" data-act="ai"><title>Ask the model to edit this node</title><circle r="9"/><text y="4.6">✦</text></g>
        </g>` : ''}
      </g>`;
    }
    svg.innerHTML = out;
    fitText();
    state.fresh.clear();
    svg.querySelectorAll<SVGGElement>('.tnode').forEach((el) => {
      el.addEventListener('pointerenter', () => setHover(el.dataset.key!));
      el.addEventListener('pointerleave', () => setHover(null));
      el.addEventListener('click', () => { run++; select(el.dataset.key!); });
    });
    svg.querySelectorAll<SVGGElement>('.act').forEach((el) => el.addEventListener('click', (e) => {
      e.stopPropagation();
      if (el.dataset.act === 'ai' && selected) { run++; askAbout(selected); }
    }));
    paint();
  }

  // Keep each node's words inside it: centre the type and its glyph as one line,
  // and squeeze any line that is still wider than the node.
  function fitText() {
    svg.querySelectorAll<SVGGElement>('.tnode').forEach((el) => {
      const room = (el.classList.contains('group') ? HEX.w : BOX.w) - 10;
      const squeeze = (text: SVGTextElement, w: number) => {
        if (w <= room) return;
        text.setAttribute('textLength', String(room));
        text.setAttribute('lengthAdjust', 'spacingAndGlyphs');
      };
      const nm = el.querySelector<SVGTextElement>('.nm')!;
      squeeze(nm, nm.getComputedTextLength());
      const kd = el.querySelector<SVGTextElement>('.kd')!;
      const glyph = el.querySelector<SVGGElement>('.glyph')!;
      const gw = glyph.childElementCount ? 13 : 0;
      const full = kd.getComputedTextLength();
      const tw = Math.min(full, room - gw);
      if (tw < full) { kd.setAttribute('textLength', String(tw)); kd.setAttribute('lengthAdjust', 'spacingAndGlyphs'); }
      const x0 = -(tw + gw) / 2;
      kd.setAttribute('x', String(x0));
      glyph.setAttribute('transform', `translate(${x0 + tw + 3} 10.5)`);
    });
  }

  // ---------- Parameter panel: every parameter of the selected node ----------
  // field names: t0..s2 address one axis of a transform, the rest are plain parameters
  const axis = (f: string) => /^[trs][012]$/.test(f);
  const get = (p: Params, f: string) => (axis(f) ? (p[f[0] as 't' | 'r' | 's'] as number[])[+f[1]] : (p[f as 'radius'] as number));
  const set = (p: Params, f: string, v: number | string) => {
    if (axis(f)) (p[f[0] as 't' | 'r' | 's'] as number[])[+f[1]] = +v;
    else if (f === 'colour') p.colour = String(v);
    else p[f as 'radius' | 'height' | 'count'] = +v;
  };
  const show = (f: string, v: number | string) => (f === 'count' ? String(v) : f[0] === 'r' && axis(f) ? Math.round(+v) + '°' : (+v).toFixed(2));
  function drawPanel() {
    const n = selected ? NODES[selected] : null;
    if (!n || !state.shown.has(n.key)) {
      panel.innerHTML = '<p class="hint">Select a node in the tree, or a part in the viewport, to see and change its parameters.</p>';
      return;
    }
    const p = P[n.key];
    const by = state.by[n.key] ?? 'ai';
    const row = (f: string) => {
      const [label, min, max, step] = SLIDERS[f];
      const v = get(p, f);
      return `<label class="param"><span>${label}</span><input type="range" data-f="${f}" min="${min}" max="${max}" step="${step}" value="${v}"><output>${show(f, v)}</output></label>`;
    };
    const shapeRows = ({ Cone: ['radius', 'height'], Cylinder: ['radius', 'height'], Sphere: ['radius'], Repeat: ['count'] } as Record<string, string[]>)[n.kind] ?? [];
    panel.innerHTML = `
      <div class="phead" style="--c:${n.children ? 'var(--group)' : tint(p.colour)}"><svg viewBox="0 0 22 24"><polygon points="11,1 21,6.5 21,17.5 11,23 1,17.5 1,6.5"/></svg><input class="pname" value="${n.name}" aria-label="Name"><span class="pby ${by}">${badge(by)}</span></div>
      <p class="pkind">${kindLabel(n)}</p>
      ${n.children ? '' : `<label class="param"><span>Colour</span><input type="color" data-f="colour" value="${p.colour}"><span></span></label>`}
      ${shapeRows.length ? `<p class="group-h">Shape</p>${shapeRows.map(row).join('')}` : ''}
      <p class="group-h">Transform</p>
      ${['t0', 't1', 't2', 'r0', 'r1', 'r2', 's0', 's1', 's2'].map(row).join('')}`;
    panel.querySelectorAll<HTMLInputElement>('[data-f]').forEach((input) => input.addEventListener('input', () => {
      run++;
      const f = input.dataset.f!;
      set(p, f, input.value);
      const out = input.nextElementSibling;
      if (out?.tagName === 'OUTPUT') out.textContent = show(f, input.value);
      byHand(n.key);
      apply(n.key);
      if (f === 'colour' || f === 'count') drawTree();
      if (f === 'count') panel.querySelector('.pkind')!.textContent = kindLabel(n);
    }));
    panel.querySelector<HTMLInputElement>('.pname')!.addEventListener('input', (e) => {
      run++;
      n.name = (e.target as HTMLInputElement).value || n.original!;
      byHand(n.key);
      drawTree();
    });
  }
  // Anything changed by hand is marked as yours, in the tree and in the panel.
  function byHand(key: string) {
    if (state.by[key] === 'you') return;
    state.by[key] = 'you';
    drawTree();
    const b = panel.querySelector('.pby');
    if (b && selected === key) { b.className = 'pby you'; b.textContent = badge('you'); }
  }
  // Keep the panel's sliders in step when a step moves a parameter.
  function syncPanel() {
    if (!selected) return;
    const p = P[selected];
    panel.querySelectorAll<HTMLInputElement>('input[type=range][data-f]').forEach((input) => {
      const v = get(p, input.dataset.f!);
      input.value = String(v);
      input.nextElementSibling!.textContent = show(input.dataset.f!, v);
    });
  }

  // ---------- Linking: hover lights, click selects ----------
  function paint() {
    const key = hovered ?? selected;
    const lit = new Set(key ? leavesOf(NODES[key]) : []);
    for (const { mesh, key: k } of parts) mesh.material.color.copy(lit.has(k) ? HL : mesh.userData.base);
    svg.querySelectorAll<SVGGElement>('.tnode').forEach((el) => {
      el.classList.toggle('on', el.dataset.key === key);
      el.classList.toggle('sel', el.dataset.key === selected);
    });
    render();
  }
  function setHover(key: string | null) { if (key !== hovered) { hovered = key; paint(); } }
  function select(key: string | null) { selected = key; drawTree(); drawPanel(); }
  // Point the prompt at one node: the model may only change that branch.
  function askAbout(key: string) {
    state.scope = key;
    chipEl.textContent = '@' + NODES[key].name;
    drawTree();
  }

  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const seen = (o: THREE.Object3D | null) => { for (; o; o = o.parent) if (!o.visible) return false; return true; };
  const pick = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(parts.filter((p) => seen(p.mesh)).map((p) => p.mesh))[0];
    return hit ? parts.find((p) => p.mesh === hit.object)!.key : null;
  };
  let down: number[] | null = null;
  const onMove = (e: PointerEvent) => { if (!e.buttons) setHover(pick(e)); };
  const onLeave = () => setHover(null);
  const onDown = (e: PointerEvent) => (down = [e.clientX, e.clientY]);
  const onUp = (e: PointerEvent) => {
    if (down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) < 4) { run++; select(pick(e)); }
  };
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerleave', onLeave);
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointerup', onUp);

  function setShown(key: string, on: boolean) {
    if (on) state.shown.add(key);
    else state.shown.delete(key);
    for (const o of objs[key]) o.visible = on;
  }
  // Grow a node's copies in from nothing, then settle on its own scale.
  const pop = (key: string) => {
    const os = objs[key];
    os.forEach((o) => { o.visible = true; o.scale.setScalar(0.001); });
    return tween(420, (k) => {
      const s = P[key].s.map((v) => Math.max(0.001, v * backOut(k)));
      os.forEach((o) => o.scale.set(s[0], s[1], s[2]));
      if (k >= 1) apply(key);
    });
  };

  // ---------- The three steps ----------
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  // Jump straight to how things stand when step `n` begins (4: after all three).
  function snapTo(n: number) {
    tweens.clear();
    resetParams();
    Object.keys(NODES).forEach((k) => setShown(k, n >= 2 && (!NODES[k].later || n >= 4)));
    state.by = n >= 3 ? { fins: 'you' } : {};
    if (n >= 3) { P.fins.t[1] = 0.35; apply('fins'); }
    state.scope = null;
    selected = hovered = null;
    chipEl.textContent = '';
    textEl.textContent = '';
    goEl.textContent = 'Generate';
    promptEl.classList.remove('busy');
    drawTree();
    drawPanel();
  }

  async function type(text: string, live: () => boolean) {
    for (let i = 1; i <= text.length; i++) {
      textEl.textContent = text.slice(0, i);
      await sleep(42);
      if (!live()) return false;
    }
  }

  async function play(n: number): Promise<boolean> {
    const id = ++run;
    const live = () => id === run;
    onStep(n);
    snapTo(n);

    if (n === 1) {
      await sleep(400);
      await type('Generate a simple rocket', live);
      if (!live()) return false;
      promptEl.classList.add('busy');
      goEl.textContent = 'Generating…';
      await sleep(700);
      // The model answers part by part, each with its node in the tree.
      for (const key of ['rocket', 'nose', 'body', 'window', 'fins', 'fin', 'engine', 'nozzle']) {
        if (!live()) return false;
        setShown(key, true);
        state.fresh.add(key);
        drawTree();
        if (!NODES[key].children) pop(key);
        await sleep(260);
      }
      promptEl.classList.remove('busy');
      goEl.textContent = 'Generate';
      textEl.textContent = '';
    }

    if (n === 2) {
      await sleep(500);
      if (!live()) return false;
      select('fins');
      await sleep(800);
      if (!live()) return false;
      byHand('fins');
      await tween(1100, (k) => {
        if (!live()) return false;
        P.fins.t[1] = 0.35 * (1 - (1 - k) ** 3);
        apply('fins');
        syncPanel();
      });
    }

    if (n === 3) {
      await sleep(500);
      if (!live()) return false;
      select('engine');
      await sleep(700);
      if (!live()) return false;
      svg.querySelector('.act.ai')?.classList.add('press');
      await sleep(350);
      if (!live()) return false;
      askAbout('engine');
      await sleep(400);
      await type('add three flames under the nozzle', live);
      if (!live()) return false;
      promptEl.classList.add('busy');
      goEl.textContent = 'Editing…';
      await sleep(800);
      if (!live()) return false;
      for (const key of ['flames', 'flame']) { setShown(key, true); state.fresh.add(key); }
      drawTree();
      select('flames');
      await pop('flame');
      if (!live()) return false;
      promptEl.classList.remove('busy');
      goEl.textContent = 'Generate';
      await sleep(1400);
      if (!live()) return false;
      state.scope = null;
      chipEl.textContent = '';
      textEl.textContent = '';
      drawTree();
    }
    return live();
  }

  if (still) snapTo(4);

  return {
    play,
    setTheme() {
      night = document.documentElement.dataset.theme === 'dark';
      (scene.background as THREE.Color).set(css('--paper'));
      paintShadow();
      drawTree();
      drawPanel();
    },
    dispose() {
      run++;
      tweens.clear();
      cancelAnimationFrame(frame);
      watcher.disconnect();
      controls.dispose();
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointerup', onUp);
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        for (const mat of [m.material ?? []].flat() as THREE.Material[]) mat.dispose();
      });
      blobTex.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
