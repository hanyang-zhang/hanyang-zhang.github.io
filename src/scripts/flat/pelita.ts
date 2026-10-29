// Pelita, drawn as its own web interface. The visitor points at a part of slide 97,
// the chat explains that part, and "+ Add to Notes" files it under My notes.
// Coordinates are in the SVG's 480 × 360 space (see pelita.svg).

const NS = 'http://www.w3.org/2000/svg';

// What a learner can point at: the selection box around it, and what Pelita says.
const PARTS: Record<string, { box: number[]; title: string; lines: string[] }> = {
  mcu: { box: [158, 98, 52, 84], title: 'Microcontroller', lines: ['Its pins give only a little', 'current, so it switches the', 'motor through a transistor.'] },
  transistor: { box: [248, 126, 36, 34], title: 'Transistor', lines: ['A switch the pin controls.', 'Pin HIGH: current flows', 'through the motor.'] },
  motor: { box: [255, 95, 25, 26], title: 'Motor', lines: ['A coil that spins when', 'current flows. It needs more', 'than a pin can give.'] },
  diode: { box: [279, 96, 22, 22], title: 'Flyback diode', lines: ['When the transistor turns', 'off, the motor’s current', 'loops safely through it.'] },
};
const ORDER = Object.keys(PARTS);
const SLOT = 40; // height of one kept note
const MAX_KEPT = 4;

const keptNote = (title: string, i: number) => `<g class="kept" transform="translate(0 ${i * SLOT})">
  <rect x="362" y="152" width="98" height="34" rx="5" fill="#e4eed6"/>
  <rect x="366" y="158" width="13" height="8" rx="2" fill="#f4c6c0"/>
  <text x="372.5" y="164" font-size="5" font-weight="700" fill="#c8432f" text-anchor="middle">97</text>
  <text x="383" y="164.4" font-size="7" font-weight="700" fill="#24352a">${title}</text>
  <path d="M366 173h84M366 180h56" stroke="#8fae7f" stroke-width="2.6" stroke-linecap="round"/>
</g>`;

export function mountPelita(svg: SVGSVGElement, mark: (n: number) => void, calm: boolean) {
  const stage = svg.parentElement!;
  const box = svg.querySelector('#sel-box')!;
  const handles = [...svg.querySelectorAll('#sel .h')];
  const lines = ['#ans-title', '#ans-1', '#ans-2', '#ans-3'].map((s) => svg.querySelector(s)!);
  const keepBtn = svg.querySelector<SVGGElement>('#keep')!;
  const kept = svg.querySelector('#kept')!;
  let current = 'diode';
  const saved: string[] = [];
  let busy = false;

  const wait = (ms: number) => new Promise((r) => setTimeout(r, calm ? 0 : ms));
  const tween = (ms: number, f: (t: number) => void) =>
    new Promise<void>((done) => {
      if (calm) return f(1), done();
      const t0 = performance.now();
      const tick = (now: number) => {
        const t = Math.min(1, (now - t0) / ms);
        f(1 - Math.pow(1 - t, 3));
        t < 1 ? requestAnimationFrame(tick) : done();
      };
      requestAnimationFrame(tick);
    });

  const place = ([x, y, w, h]: number[]) => {
    box.setAttribute('x', `${x}`);
    box.setAttribute('y', `${y}`);
    box.setAttribute('width', `${w}`);
    box.setAttribute('height', `${h}`);
    [[x, y], [x + w, y], [x, y + h], [x + w, y + h]].forEach(([hx, hy], i) => {
      handles[i].setAttribute('x', `${hx - 2.5}`);
      handles[i].setAttribute('y', `${hy - 2.5}`);
    });
  };

  const explain = async (key: string) => {
    const part = PARTS[key];
    lines.forEach((l) => l.classList.add('gone'));
    await wait(220);
    lines[0].textContent = part.title;
    part.lines.forEach((t, i) => (lines[i + 1].textContent = t));
    for (const l of lines) {
      l.classList.remove('gone');
      await wait(140);
    }
    keepBtn.classList.toggle('done', saved.includes(key));
  };

  const point = async (key: string) => {
    if (busy) return;
    busy = true;
    stage.classList.remove('idle');
    mark(1);
    const from = [...PARTS[current].box];
    const to = PARTS[key].box;
    current = key;
    await tween(380, (t) => place(from.map((v, i) => v + (to[i] - v) * t)));
    mark(2);
    await explain(key);
    busy = false;
  };

  const keep = async () => {
    if (busy || saved.includes(current)) return;
    busy = true;
    mark(3);
    if (saved.length === MAX_KEPT) saved.shift();
    saved.push(current);
    // The title flies from the chat over to the notes.
    const ghost = document.createElementNS(NS, 'text');
    ghost.textContent = PARTS[current].title;
    ghost.setAttribute('font-size', '7');
    ghost.setAttribute('font-weight', '700');
    ghost.setAttribute('fill', '#3d6b35');
    svg.append(ghost);
    const slot = 152 + (saved.length - 1) * SLOT;
    await tween(520, (t) => {
      ghost.setAttribute('x', `${44 + (383 - 44) * t}`);
      ghost.setAttribute('y', `${240 + (slot + 12 - 240) * t - Math.sin(t * Math.PI) * 30}`);
    });
    ghost.remove();
    kept.innerHTML = saved.map((k, i) => keptNote(PARTS[k].title, i)).join('');
    [...kept.children].slice(0, -1).forEach((g) => ((g as SVGElement).style.animation = 'none'));
    keepBtn.classList.add('done');
    busy = false;
  };

  svg.querySelectorAll<SVGElement>('.spot').forEach((s) => s.addEventListener('click', () => point(s.dataset.part!)));
  keepBtn.addEventListener('click', keep);
  keepBtn.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      keep();
    }
  });

  // The steps beside the picture drive it too: Point moves on to the next part.
  return (n: number) => {
    if (n === 1) point(ORDER[(ORDER.indexOf(current) + 1) % ORDER.length]);
    if (n === 2 && !busy) {
      stage.classList.remove('idle');
      mark(2);
      explain(current);
    }
    if (n === 3) keep();
  };
}
