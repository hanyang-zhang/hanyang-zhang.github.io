// LecNote in a live lecture, with one switch. "You ask": the learner boxes part of the
// slide and gets one small hint. "AI pushes": a card lands on the notes with every slide.
// Coordinates are in the SVG's 480 × 360 space (see lecnote.svg).

// What the system sends, one card per slide, landing over the learner's notes.
const CARDS: { x: number; y: number; r: number; title: string; lines?: number[]; chips?: string[] }[] = [
  { x: 60, y: 218, r: -3, title: 'Summary · slide 12', lines: [96, 72] },
  { x: 262, y: 216, r: 2.5, title: 'Key terms', chips: ['weights', 'bias', 'activation'] },
  { x: 114, y: 254, r: 1.5, title: 'Slide 13 · Backpropagation', lines: [100, 62] },
  { x: 282, y: 262, r: -2, title: 'Quick check', lines: [88, 68] },
];

const card = (c: (typeof CARDS)[number]) => {
  const w = 126;
  const h = 42;
  let body = '';
  if (c.chips) {
    let x = 9;
    for (const t of c.chips) {
      const cw = t.length * 3.5 + 9;
      body += `<rect x="${x}" y="21" width="${cw}" height="12" rx="6" fill="#fff" stroke="#9fbf8a" stroke-width=".8"/><text x="${x + cw / 2}" y="29.4" font-size="6.6" fill="#3d6b35" text-anchor="middle">${t}</text>`;
      x += cw + 4;
    }
  } else {
    body = c.lines!.map((lw, i) => `<path d="M10 ${24 + i * 8}h${lw}" stroke="#9fbf8a" stroke-width="3" stroke-linecap="round"/>`).join('');
  }
  return `<g transform="translate(${c.x} ${c.y}) rotate(${c.r} ${w / 2} ${h / 2})"><g class="drop">
    <rect width="${w}" height="${h}" rx="7" fill="#e4eed6" stroke="#3d6b35" stroke-width="1.4" filter="url(#lecnote-soft)"/>
    <path d="M12 7q1.2 3 4.2 4.2q-3 1.2-4.2 4.2q-1.2-3-4.2-4.2q3-1.2 4.2-4.2z" fill="#f0c35c" stroke="#24352a" stroke-width="1"/>
    <text x="21" y="14.6" font-size="7.8" font-weight="700" fill="#24352a">${c.title}</text>${body}</g></g>`;
};

export function mountLecnote(svg: SVGSVGElement, mark: (n: number) => void, calm: boolean) {
  const pushed = svg.querySelector('#pushed')!;
  const page = svg.querySelector('#page')!;
  const prog = svg.querySelector('#prog')!;
  const toggle = svg.querySelector('#switch')!;
  const lblAsk = svg.querySelector('#lbl-ask')!;
  const lblPush = svg.querySelector('#lbl-push')!;
  const wait = (ms: number) => new Promise((r) => setTimeout(r, calm ? 0 : ms));

  let mode: 'ask' | 'push' = 'ask';
  let run = 0; // bumps on every flip, so a pile still landing can tell it's stale

  const set = async (next: 'ask' | 'push') => {
    if (next === mode) return;
    mode = next;
    const ticket = ++run;
    svg.classList.toggle('push', mode === 'push');
    toggle.setAttribute('aria-checked', `${mode === 'push'}`);
    lblAsk.setAttribute('fill', mode === 'ask' ? '#fbfaf4' : '#6b7a6c');
    lblPush.setAttribute('fill', mode === 'push' ? '#fbfaf4' : '#6b7a6c');
    mark(mode === 'ask' ? 1 : 2);
    if (mode === 'ask') {
      pushed.querySelectorAll('.drop').forEach((d) => d.classList.add('lift'));
      await wait(300);
      if (ticket !== run) return;
      pushed.innerHTML = '';
      page.textContent = '12 / 30';
      prog.setAttribute('d', 'M70 196h134');
      return;
    }
    await wait(350);
    for (let i = 0; i < CARDS.length; i++) {
      if (ticket !== run) return;
      page.textContent = `${12 + i} / 30`;
      prog.setAttribute('d', `M70 196h${134 + i * 11}`);
      pushed.insertAdjacentHTML('beforeend', card(CARDS[i]));
      await wait(900);
    }
  };

  const flip = () => set(mode === 'ask' ? 'push' : 'ask');
  toggle.addEventListener('click', flip);
  toggle.addEventListener('keydown', (e) => {
    const k = (e as KeyboardEvent).key;
    if (k === 'Enter' || k === ' ') {
      e.preventDefault();
      flip();
    }
  });

  return {
    step: (n: number) => set(n === 1 ? 'ask' : 'push'),
    reset: () => set('ask'),
  };
}
