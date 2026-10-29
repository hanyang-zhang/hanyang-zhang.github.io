// All page content lives here. Add a news item, paper or project by editing
// this file — the page templates never need to change.

export const profile = {
  name: 'Hanyang Zhang',
  status: 'Applying to PhD programs in HCI',
  location: 'Sydney, Australia',
  timezone: 'Australia/Sydney',
  tagline: 'I study how people and AI make things together — and how AI can support people without taking over.',
  // The hero sentence after the name, one entry per line (lines alternate indent).
  lede: ['is an HCI researcher', 'designing AI that', 'supports people', 'without taking over.'],
  bio: [
    'I’m a Master of Computer Science student at the University of Sydney, working with Prof. Eduardo Velloso. My research sits in Human–Computer Interaction, with a focus on human–AI co-creation and social computing.',
    'I design and build systems, then study them with people: in live lectures, in creative communities online, and in the tools in between. Before Sydney, I studied Printing Engineering at Xi’an University of Technology and worked as a research assistant on LLM tools for power-system engineers.',
  ],
  interests: ['Human–Computer Interaction', 'Human–AI Co-Creation', 'Social Computing', 'LLMs & MLLMs'],
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
  { date: 'Jul 2026', text: 'Began deploying Pelita in COMP5047 Pervasive Computing at the University of Sydney.' },
  { date: 'Jul 2026', text: 'Wrapped up my master’s thesis on AI assistance in live lecture note-taking.' },
  { date: '2026', text: 'Awarded the Engineering Vacation Research Internship Program Scholarship.' },
];

export const publications = [
  {
    title: 'Routing by Geometry: Weak-to-Strong LLM Inference with MAGE',
    authors: ['Jiaxin Li', 'Lefan Lai', 'Yixiang Chen', 'Hanyang Zhang', 'Jinrong Fu', 'Piotr Koniusz', 'Xuming Hu'],
    venue: 'ICLR 2027',
    status: 'Under review',
  },
  {
    title: 'Look Before You Compress: FORESIGHT for Training-Free Visual Token Compression',
    authors: ['Lefan Lai', 'Jiaxin Li', 'Yixiang Chen', 'Hanyang Zhang', 'Yue Feng', 'Enyu Liu', 'Mark Billinghurst', 'Burkhard C. Wünsche'],
    venue: 'AAAI 2027',
    status: 'Under review',
  },
];

export const research = [
  {
    title: 'AI Art Wagers in Chinese Online Art Communities',
    when: '2026 —',
    venue: 'Targeting FAccT ’27',
    summary:
      'On Xiaohongshu, suspicions of AI use can escalate into public wagers with money on the line, drawing demonstrations, and negotiated judging rules. I trace how these challenges unfold — how people set rules, present evidence, and live with the outcome.',
  },
  {
    title: 'Pelita: AI Assistance Embedded in Course Materials',
    when: '2026 —',
    venue: 'Targeting DIS ’27',
    summary:
      'A web-based learning platform that weaves course materials, contextual AI help, and learners’ own notes together. Currently deployed in a real university course.',
  },
  {
    title: 'Supporting Without Taking Over: AI Assistance in Live Lecture Note-Taking',
    when: '2025 — 2026',
    venue: 'Master’s thesis · 97/100',
    summary:
      'I built LecNote, a full-stack platform whose AI help is grounded in selected slide regions, and ran a within-subjects study (N = 12) comparing learner-initiated and system-initiated assistance.',
  },
  {
    title: 'Treellis: Progressive Human–AI Co-Creation of 3D Models',
    when: '2026',
    venue: 'UIST ’26',
    award: 'Best Paper Award',
    summary:
      'A system for progressively editing AI-generated 3D models. I contributed to parts of the implementation and the appendix, acknowledged in the paper.',
  },
  {
    title: 'U²-SE-DIM: Deep Image Matting for Pre-Press',
    when: '2021 — 2022',
    venue: 'Undergraduate thesis',
    summary:
      'An automatic matting framework combining U²-Net trimap generation with an attention-enhanced Deep Image Matting network.',
  },
];

export const projects = [
  {
    title: 'Campus Sound Identity',
    kind: 'Installation',
    summary: 'A cardboard “vending machine” that trades your mood for a sound of campus — prototyped and tested Wizard-of-Oz style.',
  },
  {
    title: 'Task Treemap',
    kind: 'Tool',
    summary: 'A to-do list drawn as a treemap: size is priority, colour is how long a task has been waiting.',
  },
  {
    title: 'HCI Deadlines',
    kind: 'Web',
    summary: 'A countdown of upcoming HCI conference deadlines.',
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
