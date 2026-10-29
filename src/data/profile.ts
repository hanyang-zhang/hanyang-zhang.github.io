// All page content lives here. Add a news item, paper or project by editing
// this file — the page templates never need to change.

// Sections listed here are hidden from the page; their content below is kept.
export const hiddenSections: string[] = ['news'];

export const profile = {
  name: 'Hanyang Zhang',
  nickname: 'Yuki',
  // Portrait shown beside the name: put the file in `public/` (e.g. public/photo.jpg)
  // and set this to '/photo.jpg'. Leave empty to show a placeholder.
  photo: '/photo.jpg',
  location: 'Sydney, Australia',
  timezone: 'Australia/Sydney',
  tagline: 'I study how people and AI make things together — and how AI can support people without taking over.',
  bio: [
    'I’m a Master of Computer Science student at the University of Sydney, working with Prof. Eduardo Velloso. My research sits in Human–Computer Interaction, with a focus on human–AI co-creation and social computing.',
    'I design and build systems, then study them with people: in live lectures, in creative communities online, and in the tools in between. Before Sydney, I studied Printing Engineering at Xi’an University of Technology and worked as a research assistant on LLM tools for power-system engineers.',
  ],
  interests: [
    'Human–Computer Interaction',
    'Human–AI Co-Creation',
    'Social Computing',
    'LLMs & MLLMs',
    'Interdisciplinary Research',
  ],
  // interests drawn with a slightly stronger chip
  highlightInterests: ['Interdisciplinary Research'],
  emails: [
    { label: 'Personal', address: 'hanyang.y.zhang@gmail.com' },
    { label: 'University', address: 'hzha0935@uni.sydney.edu.au' },
  ],
  // e.g. { label: 'GitHub', href: 'https://github.com/…' }
  links: [] as { label: string; href: string }[],
};

export const news = [
  { date: '2026', text: 'Treellis, a project I contributed to, received a Best Paper Award at UIST ’26.' },
  { date: 'Sep 2026', text: 'Started a new project on AI art wagers in Chinese online art communities.' },
  { date: 'Jul 2026', text: 'Began deploying Pelita in a course at the University of Sydney.' },
  { date: 'Jul 2026', text: 'Wrapped up my master’s thesis on AI assistance in live lecture note-taking.' },
  { date: '2026', text: 'Awarded the Engineering Vacation Research Internship Program Scholarship.' },
];

// Terms in the bio that open a small explainer card when clicked. Each facet
// is one discipline the field draws on, drawn in a process or overprint ink,
// listed closest-to-HCI first; hovering or clicking one opens a side panel of
// small pictures (`thumb` names a drawing in Thumb.astro).
export type Ink = 'c' | 'b' | 'm' | 'r' | 'y' | 'g';
export type Facet = { ink: Ink; icon: string; label: string; text: string; items: { thumb: string; label: string }[] };
export type Explainer = {
  id: string;
  title: string;
  aside: string;
  lede: string;
  badge?: { text: string; note: string; source: string; href: string };
  facets: Facet[];
  bridge: { label: string; text: string; highlight?: string };
};
export const explainers: Record<string, Explainer> = {
  'Printing Engineering': {
    id: 'printing',
    title: 'What is Printing Engineering?',
    aside: 'No, it isn’t fixing the office printer. (Though I can.)',
    lede: 'A surprisingly broad engineering degree about turning digital content into things people see, hold and step into.',
    badge: {
      text: 'XAUT’s programme: #1 in China',
      note: 'A+',
      source: 'ShanghaiRanking 2026',
      href: 'https://www.shanghairanking.cn/rankings/bcmr/2026/081703',
    },
    facets: [
      {
        ink: 'm',
        icon: 'design',
        label: 'Cross-media',
        text: 'Design across print, screen and interactive media.',
        items: [
          { thumb: 'interaction', label: 'Interaction design' },
          { thumb: 'vr', label: 'VR' },
          { thumb: 'graphic', label: 'Graphic design' },
          { thumb: 'publishing', label: 'Cross-media publishing' },
        ],
      },
      {
        ink: 'r',
        icon: 'software',
        label: 'Software',
        text: 'Programming, graphics, image processing and AI.',
        items: [
          { thumb: 'code', label: 'C & Java' },
          { thumb: 'teapot', label: 'Computer graphics' },
          { thumb: 'halftone', label: 'Image processing' },
          { thumb: 'ai', label: 'AI' },
          { thumb: 'workflow', label: 'Print production systems' },
        ],
      },
      {
        ink: 'y',
        icon: 'hardware',
        label: 'Hardware',
        text: 'Circuits, sensors and printed electronics.',
        items: [
          { thumb: 'pcb', label: 'Circuit boards' },
          { thumb: 'chip', label: 'Microcomputers & assembly' },
          { thumb: 'sensor', label: 'Sensors' },
          { thumb: 'flex', label: 'Printed electronics' },
        ],
      },
      {
        ink: 'b',
        icon: 'colour',
        label: 'Colour',
        text: 'How eyes see colour, from screen to paper.',
        items: [
          { thumb: 'cie', label: 'Colour science' },
          { thumb: 'gamut', label: 'Colour management' },
          { thumb: 'colourbar', label: 'Print quality control' },
          { thumb: 'eye', label: 'Visual perception' },
        ],
      },
      {
        ink: 'g',
        icon: 'machines',
        label: 'Mechanics',
        text: 'Engineering drawing, 3D printing and packaging.',
        items: [
          { thumb: 'print3d', label: '3D printing' },
          { thumb: 'cad', label: 'CAD' },
          { thumb: 'press', label: 'Printing presses' },
          { thumb: 'dieline', label: 'Packaging' },
        ],
      },
      {
        ink: 'c',
        icon: 'materials',
        label: 'Materials',
        text: 'Inks, papers and how they meet.',
        items: [
          { thumb: 'ink', label: 'Inks' },
          { thumb: 'paper', label: 'Paper & substrates' },
          { thumb: 'spread', label: 'Printability' },
        ],
      },
    ],
    bridge: {
      label: 'What it gave me',
      text: 'A habit of thinking across disciplines to connect code, colour, hardware and materials, and I like moving between them.',
      highlight: 'thinking across disciplines',
    },
  },
};

// While nothing is out yet, the page shows this note instead of a list, plus a
// line counting the papers marked `hidden` that are under review.
export const publicationsNote = 'Nothing published yet🥲 but I’m working on it!';

// `hidden: true` keeps a paper off the page (e.g. while under double-blind review).
export const publications = [
  {
    title: 'Routing by Geometry: Weak-to-Strong LLM Inference with MAGE',
    authors: ['Jiaxin Li', 'Lefan Lai', 'Yixiang Chen', 'Hanyang Zhang', 'Jinrong Fu', 'Piotr Koniusz', 'Xuming Hu'],
    venue: 'ICLR 2027',
    status: 'Under review',
    hidden: true,
  },
  {
    title: 'Look Before You Compress: FORESIGHT for Training-Free Visual Token Compression',
    authors: ['Lefan Lai', 'Jiaxin Li', 'Yixiang Chen', 'Hanyang Zhang', 'Yue Feng', 'Enyu Liu', 'Mark Billinghurst', 'Burkhard C. Wünsche'],
    venue: 'AAAI 2027',
    status: 'Under review',
    hidden: true,
  },
];

// Each tag's `kind` picks its badge style: a conference it's aimed at
// (`target`), one it appeared at (`venue`), what kind of work it is (`type`),
// a grade (`score`), or an award (`award`).
type Tag = { label: string; kind: 'target' | 'venue' | 'type' | 'score' | 'award' };

// Research entries take the same optional `image` and `focus` as projects below.
// `scene` opens an interactive 3D view instead of the picture (see WagerScene.astro
// and TreellisScene.astro).
export const research: { title: string; when: string; tags: Tag[]; summary: string; image?: string; focus?: string; scene?: 'wager' | 'treellis' | 'pelita' | 'lecnote' }[] = [
  {
    title: 'AI Art Wagers in Chinese Online Art Communities',
    when: '2026 —',
    tags: [{ label: 'Targeting FAccT ’27', kind: 'target' }],
    image: '/research/wager.jpg',
    focus: 'center 45%',
    scene: 'wager',
    summary:
      'On Xiaohongshu, suspicions of AI use can escalate into public wagers with money on the line, drawing demonstrations, and negotiated judging rules. I trace how these challenges unfold — how people set rules, present evidence, and live with the outcome.',
  },
  {
    title: 'Pelita: AI Assistance Embedded in Course Materials',
    when: '2026 —',
    tags: [{ label: 'Targeting DIS ’27', kind: 'target' }],
    image: '/research/pelita.svg',
    focus: 'center',
    scene: 'pelita',
    summary:
      'A web-based learning platform that weaves course materials, contextual AI help, and learners’ own notes together. Currently deployed in a real university course.',
  },
  {
    title: 'Supporting Without Taking Over: AI Assistance in Live Lecture Note-Taking',
    when: '2025 — 2026',
    tags: [
      { label: 'Master’s thesis', kind: 'type' },
      { label: '97/100', kind: 'score' },
    ],
    image: '/research/lecnote.svg',
    focus: 'center',
    scene: 'lecnote',
    summary:
      'I built LecNote, a full-stack platform whose AI help is grounded in selected slide regions, and ran a within-subjects study (N = 12) comparing learner-initiated and system-initiated assistance.',
  },
  {
    title: 'Treellis: Progressive Human–AI Co-Creation of 3D Models',
    when: '2026',
    tags: [
      { label: 'UIST ’26', kind: 'venue' },
      { label: 'Best Paper Award', kind: 'award' },
    ],
    image: '/research/treellis.jpg',
    scene: 'treellis',
    summary:
      'A system for progressively editing AI-generated 3D models. I contributed to parts of the implementation and the appendix, acknowledged in the paper.',
  },
  {
    title: 'U²-SE-DIM: Deep Image Matting for Pre-Press',
    when: '2021 — 2022',
    tags: [{ label: 'Undergraduate thesis', kind: 'type' }],
    image: '/research/matting.svg',
    focus: 'center',
    summary:
      'An automatic matting framework combining U²-Net trimap generation with an attention-enhanced Deep Image Matting network.',
  },
];

// The stages of an AI wager, listed beside its 3D scene; each one drives the scene.
export const wagerStages = [
  { title: 'Suspicion', text: 'Someone publicly suggests a creator’s work used AI.' },
  { title: 'Wager', text: 'One side puts money on it; the other accepts or walks away.' },
  { title: 'Rules', text: 'Stake, livestream format, who votes, what voids the bet.' },
  { title: 'Livestream', text: 'The creator draws live; files go to an intermediary.' },
  { title: 'Adjudication', text: 'Eligible viewers vote: AI or not.' },
  { title: 'Closure', text: 'The stake moves; apologies, deletions and replies follow.' },
];

// The three steps beside the Treellis scene: how a person and the model share the work.
export const treellisSteps = [
  { title: 'Prompt', text: 'You describe it; the model returns the rocket as parts, with their tree.' },
  { title: 'Tweak by hand', text: 'You select the fins and drag a slider. Only that part moves.' },
  { title: 'Ask AI about one part', text: 'You point the model at the Engine. It edits that branch and leaves the rest.' },
];

// The words beside the flat, clickable pictures of Pelita and LecNote (see FlatScene.astro).
export const flatScenes = {
  pelita: {
    eyebrow: 'How Pelita helps',
    hint: 'Click any part of the slide',
    steps: [
      { title: 'Point', text: 'Drag a box around any part of a slide: a diagram, a list, a photo.' },
      { title: 'Explain', text: 'Pelita explains just that part, checking this week’s slides before it answers.' },
      { title: 'Keep', text: 'Save what helps to your notes, then put it in your own words.' },
    ],
    note: 'Deployed in a University of Sydney course since July 2026.',
  },
  lecnote: {
    eyebrow: 'Two ways to help in a live lecture',
    hint: 'Flip the switch',
    steps: [
      { title: 'You ask', text: 'The learner boxes part of the live slide. LecNote adds one short hint about that region, and the notes stay theirs.' },
      { title: 'AI pushes', text: 'The system decides when to help: summaries arrive as the slides move on and pile onto the page.' },
    ],
    finding: 'In a within-subjects study (N = 12), comprehension was lower after the AI pushed, mostly on open-ended questions.',
  },
};

// Optional per project: `image` (a preview in public/, e.g. '/projects/treemap.png',
// opens full size when clicked), `focus` (which part the small preview keeps, as
// a CSS object-position) and `href` (where the title links to).
export const projects: { title: string; kind: string; summary: string; image?: string; focus?: string; href?: string }[] = [
  {
    title: 'Campus Sound Identity',
    kind: 'Installation',
    summary: 'A cardboard “vending machine” that trades your mood for a sound of campus — prototyped and tested Wizard-of-Oz style.',
    image: '/projects/campus-sound.jpg',
    focus: 'center 55%',
  },
  {
    title: 'Task Treemap',
    kind: 'Tool',
    summary: 'A to-do list drawn as a treemap: size is priority, colour is how long a task has been waiting.',
    image: '/projects/task-treemap.jpg',
  },
  {
    title: 'HCI Deadlines',
    kind: 'Web',
    summary: 'A countdown of upcoming HCI conference deadlines.',
    image: '/projects/hci-deadlines.jpg',
    focus: 'left top',
  },
];

export const education = [
  { place: 'The University of Sydney', what: 'Master of Computer Science (research component)', when: '2024 — 2026' },
  { place: 'Xi’an University of Technology', what: 'B.Eng. Printing Engineering · rank 5/88', when: '2018 — 2022' },
];

export const experience = [
  {
    place: 'Tsingluan Technology, Chengdu',
    what: 'Research Assistant, with the Sichuan Energy Internet Research Institute, Tsinghua University',
    when: '2022 — 2024',
  },
];

export const awards = [
  { what: 'Engineering Vacation Research Internship Program Scholarship', where: 'University of Sydney', when: '2026' },
  { what: '“Outstanding Student” Title and Scholarship', where: 'XAUT', when: '2018 — 2021' },
  { what: '“Dongfeng Printing” Scholarship, top 5%', where: 'XAUT', when: '2019 — 2020' },
  { what: 'Third Prize, “Internet+” Innovation & Entrepreneurship Competition', where: 'XAUT', when: '2020' },
];
