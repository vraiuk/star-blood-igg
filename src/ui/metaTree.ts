import './metaTree.css';
import { META_BRANCH_NAMES, META_NODES, PATHS, type MetaBranch, type MetaNode } from '../data/meta';
import { buyNode, canBuy, respec, writeSave, type MetaSave } from '../state/save';
import { PAL, dither, disc, lerp, makeCanvas, rect, ring, seeded, type Ctx } from '../render/pixel';

/*
 * «Древо Игг» — the meta-progression screen. A literal pixel-art tree on a 640×360 canvas:
 * trunk nodes up the trunk, four crown branches (creature families), roots below the ground.
 * Nodes are invisible HTML buttons laid over the canvas (mouse + keyboard), the art is canvas.
 */

const W = 640;
const H = 360;
const GROUND = 254;
const CX = 320;
const TRUNK_TOP = 74;
const FLOW_MS = 600;

type Pt = { x: number; y: number };
type NodeState = 'bought' | 'flow' | 'buy' | 'poor' | 'locked';

interface NodeView {
  n: MetaNode;
  x: number;
  y: number;
  /** half-size of the node shape */
  r: number;
  /** bark path from the parent (or fork / trunk base) to this node */
  path: Pt[];
  /** bark width at the start / end of the path */
  w0: number;
  w1: number;
  /** where the cost badge goes */
  badge: 'below' | 'right' | 'left';
}

const trunkX = (y: number) => CX + Math.round(Math.sin((GROUND - y) / 38) * 2.5);
const mirror = (p: Pt): Pt => ({ x: W - p.x, y: p.y });

const TRUNK_Y = [238, 210, 176, 124, 76];
const FORK_Y: Record<'hive' | 'beetle' | 'dragonfly' | 'spider', number> = { beetle: 194, spider: 194, hive: 148, dragonfly: 148 };
const BEETLE_PTS: Pt[] = [{ x: 286, y: 184 }, { x: 254, y: 172 }, { x: 222, y: 165 }, { x: 186, y: 152 }];
const HIVE_PTS: Pt[] = [{ x: 292, y: 126 }, { x: 266, y: 102 }, { x: 238, y: 82 }, { x: 206, y: 62 }];
const ROOT_PTS: Pt[] = [{ x: 320, y: 274 }, { x: 284, y: 290 }, { x: 322, y: 306 }, { x: 286, y: 322 }, { x: 326, y: 340 }];
const CROWN_PTS: Record<'hive' | 'beetle' | 'dragonfly' | 'spider', Pt[]> = {
  beetle: BEETLE_PTS, spider: BEETLE_PTS.map(mirror), hive: HIVE_PTS, dragonfly: HIVE_PTS.map(mirror),
};
/** where the branch name label sits (canvas coords, centre of text) */
const LABEL_AT: Record<MetaBranch, Pt> = {
  trunk: { x: CX, y: 58 }, hive: { x: 196, y: 44 }, dragonfly: { x: 444, y: 44 },
  beetle: { x: 168, y: 134 }, spider: { x: 472, y: 134 }, roots: { x: 236, y: 268 },
};

const OBSERVER_LINES = [
  'Восходящий! Тот-Кто-Наблюдает принимает Монеты в обмен на силу Древа.',
  'Сделка заключена. Древо запомнит твою щедрость.',
  'Свет течёт по ветвям… Наблюдатель доволен.',
  'Ещё одна почка раскрылась. Тьма это заметила.',
  'Сила не даётся даром, Восходящий. Но тебе — почти даром.',
];

// ───────────────────────────── geometry ─────────────────────────────

function bezier(a: Pt, b: Pt, bow: number, down = false): Pt[] {
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  let nx = -dy / len, ny = dx / len;
  if (down ? ny < 0 : ny > 0) { nx = -nx; ny = -ny; }
  const cx = mx + nx * bow, cy = my + ny * bow;
  const steps = Math.ceil(len * 1.6);
  const out: Pt[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, u = 1 - t;
    const p = { x: Math.round(u * u * a.x + 2 * u * t * cx + t * t * b.x), y: Math.round(u * u * a.y + 2 * u * t * cy + t * t * b.y) };
    const last = out[out.length - 1];
    if (!last || last.x !== p.x || last.y !== p.y) out.push(p);
  }
  return out;
}

function trunkPath(y0: number, y1: number): Pt[] {
  const out: Pt[] = [];
  for (let y = y0; y >= y1; y--) out.push({ x: trunkX(y), y });
  return out;
}

const trunkW = (y: number) => lerp(12, 5, (GROUND - y) / (GROUND - TRUNK_TOP));

function buildLayout(): NodeView[] {
  const views: NodeView[] = [];
  const count: Partial<Record<MetaBranch, number>> = {};
  for (const n of META_NODES) count[n.branch] = (count[n.branch] ?? 0) + 1;
  const byId = new Map<string, NodeView>();
  for (const n of META_NODES) {
    const r = n.capstone ? 9 : 6;
    const c = count[n.branch] ?? 1;
    let v: NodeView;
    if (n.branch === 'trunk') {
      const y = TRUNK_Y[n.tier] ?? TRUNK_TOP - n.tier * 10;
      const y0 = n.tier === 0 ? GROUND + 4 : (TRUNK_Y[n.tier - 1] ?? y + 30);
      v = { n, x: trunkX(y), y, r, path: trunkPath(y0, y), w0: trunkW(y0), w1: trunkW(y), badge: 'right' };
    } else if (n.branch === 'roots') {
      const p = ROOT_PTS[n.tier] ?? { x: 300, y: 340 };
      const from = n.tier === 0 ? { x: trunkX(GROUND), y: GROUND + 2 } : (ROOT_PTS[n.tier - 1] ?? p);
      v = {
        n, x: p.x, y: p.y, r, path: bezier(from, p, 5, true),
        w0: lerp(7, 2, n.tier / c), w1: lerp(7, 2, (n.tier + 1) / c), badge: p.x < 305 ? 'left' : 'right',
      };
    } else {
      const pts = CROWN_PTS[n.branch];
      const p = pts[n.tier] ?? pts[pts.length - 1];
      const fy = FORK_Y[n.branch];
      const from = n.tier === 0 ? { x: trunkX(fy), y: fy } : (pts[n.tier - 1] ?? p);
      v = {
        n, x: p.x, y: p.y, r, path: bezier(from, p, 4),
        w0: lerp(6, 2.5, n.tier / c), w1: lerp(6, 2.5, (n.tier + 1) / c), badge: 'below',
      };
    }
    views.push(v);
    byId.set(n.id, v);
  }
  return views;
}

// ───────────────────────────── pixel helpers ─────────────────────────

/** Node silhouette: disc, or diamond for capstones. */
function shape(c: Ctx, x: number, y: number, r: number, color: string, diamond: boolean) {
  if (r <= 0) return;
  if (!diamond) { disc(c, x, y, r, color); return; }
  c.fillStyle = color;
  for (let dy = -r; dy <= r; dy++) {
    const w = r - Math.abs(dy);
    c.fillRect(x - w, y + dy, w * 2 + 1, 1);
  }
}

function outline(c: Ctx, x: number, y: number, r: number, color: string, diamond: boolean) {
  if (!diamond) { ring(c, x, y, r, color); return; }
  c.fillStyle = color;
  for (let dy = -r; dy <= r; dy++) {
    const w = r - Math.abs(dy);
    c.fillRect(x - w, y + dy, 1, 1);
    c.fillRect(x + w, y + dy, 1, 1);
  }
}

const DIGITS = ['111101101101111', '010110010010111', '111001111100111', '111001111001111', '101101111001001',
  '111100111001111', '111100111101111', '111001010010010', '111101111101111', '111101111001111'];

function digits(c: Ctx, x: number, y: number, s: string, color: string) {
  c.fillStyle = color;
  for (let i = 0; i < s.length; i++) {
    const g = DIGITS[s.charCodeAt(i) - 48];
    if (!g) continue;
    for (let k = 0; k < 15; k++) if (g[k] === '1') c.fillRect(x + i * 4 + (k % 3), y + Math.floor(k / 3), 1, 1);
  }
}

function tinyCoin(c: Ctx, x: number, y: number, dim: boolean) {
  disc(c, x + 2, y + 2, 2, dim ? '#3a3650' : PAL.gold2);
  rect(c, x + 1, y + 1, 2, 2, dim ? '#4a4560' : PAL.gold4);
  rect(c, x + 2, y + 2, 1, 1, dim ? '#2a2640' : PAL.gold1);
}

let coinUrl = '';
/** 12×12 Observer's coin: a gold disc with an open eye. */
function coinIcon(): string {
  if (coinUrl) return coinUrl;
  const [cv, c] = makeCanvas(12, 12);
  disc(c, 6, 6, 5, PAL.gold1);
  disc(c, 6, 6, 4, PAL.gold3);
  rect(c, 3, 3, 2, 1, PAL.gold5);
  rect(c, 3, 4, 1, 1, PAL.gold4);
  // eye
  rect(c, 3, 6, 7, 1, PAL.gold0);
  rect(c, 4, 5, 5, 1, PAL.gold0);
  rect(c, 4, 7, 5, 1, PAL.gold0);
  rect(c, 5, 5, 3, 3, '#c9b6ff');
  rect(c, 6, 6, 1, 1, '#1a1030');
  rect(c, 8, 9, 2, 1, PAL.gold2);
  coinUrl = cv.toDataURL();
  return coinUrl;
}

/** Russian plural for «монета». */
function coinsWord(n: number): string {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return 'Монет';
  if (b === 1) return 'Монета';
  if (b >= 2 && b <= 4) return 'Монеты';
  return 'Монет';
}

// ───────────────────────────── static layers ─────────────────────────

function paintBackground(): HTMLCanvasElement {
  const [cv, c] = makeCanvas(W, H);
  const sky = [PAL.sky0, PAL.sky1, PAL.sky2, PAL.sky3, PAL.sky4];
  const moon = { x: CX, y: 118, r: 120 };
  for (let y = 0; y < GROUND; y++) {
    const f = (y / GROUND) * (sky.length - 1);
    for (let x = 0; x < W; x++) {
      // soft halo behind the crown so the tree reads as a silhouette
      const d = Math.hypot(x - moon.x, (y - moon.y) * 1.25) / moon.r;
      const g = Math.max(0, 1 - d) * 1.4;
      const ff = Math.min(sky.length - 1.001, f + g);
      const i = Math.floor(ff);
      c.fillStyle = dither(x, y, ff - i) ? sky[i + 1] : sky[i];
      c.fillRect(x, y, 1, 1);
    }
  }
  const rnd = seeded(77);
  for (let i = 0; i < 150; i++) {
    const x = Math.floor(rnd() * W), y = Math.floor(rnd() * (GROUND - 60));
    const k = rnd();
    rect(c, x, y, 1, 1, k > 0.9 ? '#ffffff' : k > 0.6 ? '#c9b6ff' : '#5c5a88');
    if (k > 0.97) { rect(c, x - 1, y, 3, 1, '#8a84c0'); rect(c, x, y - 1, 1, 3, '#8a84c0'); rect(c, x, y, 1, 1, '#ffffff'); }
  }
  // distant hills
  for (let x = 0; x < W; x++) {
    const h1 = 26 + Math.sin(x / 47) * 9 + Math.sin(x / 13 + 2) * 3;
    const h2 = 14 + Math.sin(x / 31 + 1) * 6 + Math.sin(x / 7) * 1.5;
    rect(c, x, GROUND - h1, 1, h1, PAL.far0);
    rect(c, x, GROUND - h2, 1, h2, PAL.mid1);
  }
  // ground
  const dirt = [PAL.dirt2, PAL.dirt1, PAL.dirt0, PAL.void];
  for (let y = GROUND; y < H; y++) {
    const f = ((y - GROUND) / (H - GROUND)) * (dirt.length - 1);
    const i = Math.min(dirt.length - 2, Math.floor(f));
    for (let x = 0; x < W; x++) {
      c.fillStyle = dither(x, y, f - i) ? dirt[i + 1] : dirt[i];
      c.fillRect(x, y, 1, 1);
    }
  }
  rect(c, 0, GROUND, W, 2, PAL.grassDark2);
  rect(c, 0, GROUND + 2, W, 1, PAL.grassDark);
  for (let i = 0; i < 260; i++) {
    const x = Math.floor(rnd() * W), h = 1 + Math.floor(rnd() * 3);
    rect(c, x, GROUND - h, 1, h, rnd() > 0.5 ? PAL.grassDark2 : PAL.grassDark);
  }
  for (let i = 0; i < 40; i++) {
    const x = Math.floor(rnd() * W), y = GROUND + 8 + Math.floor(rnd() * (H - GROUND - 10));
    rect(c, x, y, 2 + Math.floor(rnd() * 3), 1 + Math.floor(rnd() * 2), PAL.rock);
    rect(c, x, y, 1, 1, PAL.rockHi);
  }
  return cv;
}

interface Leaf { x: number; y: number; big: boolean; owner: string; tone: number }

function makeLeaves(views: NodeView[]): Leaf[] {
  const rnd = seeded(1337);
  const leaves: Leaf[] = [];
  const crown = views.filter((v) => v.n.branch !== 'roots' && (v.n.branch !== 'trunk' || v.n.tier >= 3));
  for (const v of crown) {
    const n = v.n.capstone ? 44 : 30;
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2, d = 7 + rnd() * 19;
      const x = Math.round(v.x + Math.cos(a) * d * 1.2), y = Math.round(v.y + Math.sin(a) * d * 0.8 - 3);
      if (y > GROUND - 40) continue;
      if (views.some((o) => Math.hypot(o.x - x, o.y - y) < o.r + 3)) continue;
      leaves.push({ x, y, big: rnd() > 0.55, owner: v.n.id, tone: rnd() });
    }
  }
  return leaves;
}

/** Thick pixel bark along a path: dark outline, fill, shadow and moon-lit rim. */
function bark(c: Ctx, path: Pt[], w0: number, w1: number, pass: 0 | 1 | 2 | 3, underground: boolean) {
  const n = path.length;
  for (let i = 0; i < n; i++) {
    const p = path[i];
    const w = lerp(w0, w1, n > 1 ? i / (n - 1) : 0);
    if (pass === 0) {
      const s = Math.round(w + 2);
      c.fillStyle = PAL.bark0;
      c.fillRect(p.x - (s >> 1), p.y - (s >> 1), s, s);
      continue;
    }
    if (pass === 1) {
      const s = Math.max(1, Math.round(w));
      c.fillStyle = underground ? '#2a1a16' : PAL.wood1;
      c.fillRect(p.x - (s >> 1), p.y - (s >> 1), s, s);
      continue;
    }
    const a = path[Math.max(0, i - 2)], b = path[Math.min(n - 1, i + 2)];
    let nx = -(b.y - a.y), ny = b.x - a.x;
    const l = Math.hypot(nx, ny) || 1;
    nx /= l; ny /= l;
    if (nx + ny > 0) { nx = -nx; ny = -ny; }
    if (pass === 2) {
      const s = Math.max(1, Math.round(w * 0.45));
      c.fillStyle = underground ? '#1a100e' : PAL.wood0;
      c.fillRect(Math.round(p.x - nx * w * 0.28) - (s >> 1), Math.round(p.y - ny * w * 0.28) - (s >> 1), s, s);
    } else if (w >= 3) {
      c.fillStyle = underground ? '#3b2618' : PAL.gold0;
      c.fillRect(Math.round(p.x + nx * (w * 0.5 - 1)), Math.round(p.y + ny * (w * 0.5 - 1)), 1, 1);
    }
  }
}

interface Stroke { path: Pt[]; w0: number; w1: number; under: boolean }

function decorStrokes(): Stroke[] {
  const base = { x: trunkX(GROUND), y: GROUND + 2 };
  const out: Stroke[] = [];
  const roots: Array<[Pt, Pt, number]> = [
    [base, { x: 254, y: 268 }, 5], [{ x: 254, y: 268 }, { x: 206, y: 284 }, 3], [{ x: 206, y: 284 }, { x: 170, y: 306 }, 2],
    [base, { x: 386, y: 268 }, 5], [{ x: 386, y: 268 }, { x: 434, y: 284 }, 3], [{ x: 434, y: 284 }, { x: 470, y: 306 }, 2],
    [{ x: 386, y: 268 }, { x: 372, y: 300 }, 2], [{ x: 372, y: 300 }, { x: 384, y: 330 }, 1.5],
    [{ x: 254, y: 268 }, { x: 236, y: 300 }, 2], [{ x: 434, y: 284 }, { x: 446, y: 318 }, 1.5],
    [{ x: 206, y: 284 }, { x: 214, y: 318 }, 1.5],
  ];
  for (const [a, b, w] of roots) out.push({ path: bezier(a, b, 4, true), w0: w, w1: Math.max(1, w * 0.55), under: true });
  // root flare at the trunk base
  out.push({ path: bezier({ x: CX - 2, y: GROUND - 10 }, { x: CX - 14, y: GROUND + 1 }, 2, true), w0: 5, w1: 3, under: false });
  out.push({ path: bezier({ x: CX + 3, y: GROUND - 10 }, { x: CX + 15, y: GROUND + 1 }, 2, true), w0: 5, w1: 3, under: false });
  // twigs off crown tips
  const twigs: Array<[Pt, Pt]> = [
    [HIVE_PTS[3], { x: 186, y: 50 }], [HIVE_PTS[2], { x: 228, y: 64 }], [HIVE_PTS[1], { x: 248, y: 96 }],
    [BEETLE_PTS[3], { x: 168, y: 150 }], [BEETLE_PTS[2], { x: 214, y: 150 }], [BEETLE_PTS[1], { x: 246, y: 186 }],
    [{ x: trunkX(TRUNK_Y[4]), y: TRUNK_Y[4] }, { x: 306, y: 54 }],
  ];
  for (const [a, b] of twigs) {
    out.push({ path: bezier(a, b, 2), w0: 2, w1: 1, under: false });
    out.push({ path: bezier(mirror(a), mirror(b), 2), w0: 2, w1: 1, under: false });
  }
  return out;
}

// ───────────────────────────── screen ─────────────────────────────

interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string }
interface Mote { x: number; y: number; vy: number; ph: number }

/**
 * Opens the full-screen Igg-Tree meta-progression screen inside `root` (the 640×360-unit UI layer).
 * Buying (`buyNode`), respec (`respec`) and path selection (`writeSave`) persist the save directly.
 * The overlay removes itself on «Назад» / Escape and then calls `onClose`.
 */
export function openMetaTree(root: HTMLElement, save: MetaSave, onClose: () => void): void {
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const views = buildLayout();
  const viewById = new Map(views.map((v) => [v.n.id, v]));
  const leaves = makeLeaves(views);
  const decor = decorStrokes();
  const bg = paintBackground();
  const [treeCv, tc] = makeCanvas(W, H);

  const flowing = new Map<string, number>();
  const particles: Particle[] = [];
  const shocks: Array<{ x: number; y: number; t0: number; diamond: boolean; r: number }> = [];
  const motes: Mote[] = [];
  const mrnd = seeded(5);
  for (let i = 0; i < 46; i++) motes.push({ x: 150 + mrnd() * 340, y: 30 + mrnd() * 220, vy: 3 + mrnd() * 7, ph: mrnd() * 6.28 });
  let hover: string | null = null;
  let nudge: { id: string; t0: number } | null = null;
  let quote = 0;

  // ── DOM ──
  const el = document.createElement('div');
  el.className = 'mt-screen';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'Древо Игг');
  el.innerHTML = `
    <canvas class="mt-cv" width="${W}" height="${H}"></canvas>
    <div class="mt-labels"></div>
    <div class="mt-nodes"></div>
    <header class="mt-head">
      <div class="mt-kicker">Тот-Кто-Наблюдает</div>
      <h1>Древо Игг</h1>
      <div class="mt-coins"><img alt="" src="${coinIcon()}"><span>Монеты Наблюдателя:</span><b class="mt-coin-n"></b></div>
      <p class="mt-quote"></p>
    </header>
    <div class="mt-legend">
      <div><i class="sw bought"></i>Пробуждено</div>
      <div><i class="sw buy"></i>Можно пробудить</div>
      <div><i class="sw locked"></i>Скрыто во тьме</div>
      <div class="mt-progress"></div>
    </div>
    <aside class="mt-side">
      <h2>Тропы</h2>
      <div class="mt-paths"></div>
    </aside>
    <div class="mt-actions">
      <button class="btn mt-respec" type="button">Сбросить (вернуть всё)</button>
      <button class="btn gold mt-back" type="button">Назад</button>
    </div>
    <div class="mt-tip" aria-live="polite"></div>`;
  root.appendChild(el);

  const q = <T extends Element>(sel: string) => el.querySelector(sel) as T;
  const cv = q<HTMLCanvasElement>('.mt-cv');
  const c = cv.getContext('2d')!;
  c.imageSmoothingEnabled = false;
  const tip = q<HTMLDivElement>('.mt-tip');
  const coinN = q<HTMLElement>('.mt-coin-n');
  const coinsRow = q<HTMLElement>('.mt-coins');
  const quoteEl = q<HTMLElement>('.mt-quote');
  const progressEl = q<HTMLElement>('.mt-progress');
  const pathsEl = q<HTMLElement>('.mt-paths');
  const labelsEl = q<HTMLElement>('.mt-labels');
  const respecBtn = q<HTMLButtonElement>('.mt-respec');
  const u = (v: number) => `calc(${v} * var(--u))`;

  const owned = (id: string) => save.nodes.includes(id);
  const stateOf = (n: MetaNode): NodeState => {
    if (flowing.has(n.id)) return 'flow';
    if (owned(n.id)) return 'bought';
    if (n.requires && !owned(n.requires)) return 'locked';
    return canBuy(save, n) ? 'buy' : 'poor';
  };

  // node hit buttons
  const btns = new Map<string, HTMLButtonElement>();
  for (const v of views) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'mt-node' + (v.n.capstone ? ' cap' : '');
    const s = v.r * 2 + 6;
    b.style.left = u(v.x - s / 2);
    b.style.top = u(v.y - s / 2);
    b.style.width = b.style.height = u(s);
    b.addEventListener('mouseenter', () => setHover(v.n.id));
    b.addEventListener('focus', () => setHover(v.n.id));
    b.addEventListener('mouseleave', () => { if (hover === v.n.id && document.activeElement !== b) setHover(null); });
    b.addEventListener('blur', () => { if (hover === v.n.id) setHover(null); });
    b.addEventListener('click', () => tryBuy(v));
    q<HTMLElement>('.mt-nodes').appendChild(b);
    btns.set(v.n.id, b);
  }

  // branch labels
  const branchOrder: MetaBranch[] = ['trunk', 'hive', 'dragonfly', 'beetle', 'spider', 'roots'];
  const labelEls = new Map<MetaBranch, HTMLElement>();
  for (const br of branchOrder) {
    const l = document.createElement('div');
    l.className = 'mt-label';
    l.style.left = u(LABEL_AT[br].x);
    l.style.top = u(LABEL_AT[br].y);
    labelsEl.appendChild(l);
    labelEls.set(br, l);
  }

  // ── rendering ──
  function rebuildTree() {
    tc.clearRect(0, 0, W, H);
    tc.drawImage(bg, 0, 0);
    const strokes: Stroke[] = [...decor, ...views.map((v) => ({ path: v.path, w0: v.w0, w1: v.w1, under: v.n.branch === 'roots' }))];
    // trunk above the last trunk node (crown tip)
    strokes.push({ path: trunkPath(TRUNK_Y[4], TRUNK_Y[4] - 6), w0: trunkW(TRUNK_Y[4]), w1: 3, under: false });
    for (const pass of [0, 1, 2, 3] as const) for (const s of strokes) bark(tc, s.path, s.w0, s.w1, pass, s.under);
    // sap veins
    for (const v of views) {
      const st = stateOf(v.n);
      if (st === 'bought') vein(tc, v.path, v.path.length, v.n.branch === 'trunk' ? 2 : 1);
      else if (st === 'buy' || st === 'poor') {
        tc.fillStyle = st === 'buy' ? PAL.gold1 : PAL.gold0;
        for (let i = 0; i < v.path.length; i += 3) tc.fillRect(v.path[i].x, v.path[i].y, 1, 1);
      }
    }
    // foliage
    for (const lf of leaves) {
      const lit = stateOf(viewById.get(lf.owner)!.n) === 'bought';
      const col = lit
        ? (lf.tone > 0.8 ? PAL.gold4 : lf.tone > 0.45 ? PAL.gold3 : PAL.gold2)
        : (lf.tone > 0.7 ? '#34386a' : lf.tone > 0.35 ? '#262f58' : '#1b2444');
      const edge = lit ? PAL.gold1 : '#0d1226';
      if (lf.big) {
        rect(tc, lf.x - 1, lf.y, 3, 1, col); rect(tc, lf.x, lf.y - 1, 1, 3, col);
        rect(tc, lf.x, lf.y + 2, 1, 1, edge);
      } else {
        rect(tc, lf.x, lf.y, 2, 1, col); rect(tc, lf.x, lf.y + 1, 1, 1, edge);
      }
    }
  }

  function vein(ctx: Ctx, path: Pt[], upto: number, w: number) {
    const n = Math.min(path.length, upto);
    ctx.fillStyle = PAL.gold2;
    for (let i = 0; i < n; i++) ctx.fillRect(path[i].x - (w >> 1), path[i].y - (w >> 1), w + 1, w + 1);
    ctx.fillStyle = PAL.gold4;
    for (let i = 0; i < n; i++) ctx.fillRect(path[i].x, path[i].y, 1, 1);
  }

  function glow(x: number, y: number, r: number, a: number, rgb = '255,200,80') {
    if (a <= 0) return;
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${rgb},${a})`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    c.fillStyle = g;
    c.fillRect(x - r, y - r, r * 2, r * 2);
  }

  function drawNode(v: NodeView, st: NodeState, t: number) {
    const { x, y, r } = v;
    const dia = !!v.n.capstone;
    const pulse = reduced ? 0.7 : 0.5 + 0.5 * Math.sin(t / 260);
    if (st === 'bought') {
      shape(c, x, y, r + 1, PAL.gold0, dia);
      shape(c, x, y, r, PAL.gold2, dia);
      shape(c, x, y, r - 1, PAL.gold3, dia);
      shape(c, x, y, r - 3, PAL.gold4, dia);
      shape(c, x, y, Math.max(1, r - 5), PAL.gold5, dia);
      rect(c, x - Math.ceil(r / 2), y - Math.ceil(r / 2), 1, 1, PAL.white);
      if (dia) {
        const k = reduced ? 4 : 3 + Math.round(2 * pulse);
        rect(c, x, y - r - 1 - k, 1, k, PAL.gold5); rect(c, x, y + r + 2, 1, k, PAL.gold5);
        rect(c, x - r - 1 - k, y, k, 1, PAL.gold5); rect(c, x + r + 2, y, k, 1, PAL.gold5);
      }
    } else if (st === 'buy' || st === 'flow') {
      c.globalAlpha = 0.35 + 0.65 * pulse;
      outline(c, x, y, r + 2, PAL.gold3, dia);
      c.globalAlpha = 0.25 * pulse;
      outline(c, x, y, r + 3, PAL.gold4, dia);
      c.globalAlpha = 1;
      shape(c, x, y, r + 1, PAL.bark0, dia);
      shape(c, x, y, r, PAL.gold2, dia);
      shape(c, x, y, r - 1, '#1c1208', dia);
      shape(c, x, y, dia ? 3 : 2, st === 'flow' ? PAL.gold4 : PAL.gold1, dia);
      rect(c, x, y, 1, 1, PAL.gold3);
    } else if (st === 'poor') {
      shape(c, x, y, r + 1, PAL.bark0, dia);
      shape(c, x, y, r, PAL.gold0, dia);
      shape(c, x, y, r - 1, '#140d10', dia);
      shape(c, x, y, dia ? 2 : 1, PAL.gold1, dia);
    } else {
      shape(c, x, y, r + 1, PAL.shade0, dia);
      shape(c, x, y, r, '#2a2640', dia);
      shape(c, x, y, r - 1, PAL.shade1, dia);
      shape(c, x, y, dia ? 2 : 1, '#2a2640', dia);
    }
    if (st !== 'bought' && st !== 'flow') drawBadge(v, st);
  }

  function drawBadge(v: NodeView, st: NodeState) {
    const s = String(v.n.cost);
    const bw = 5 + 2 + s.length * 4 - 1;
    let bx: number, by: number;
    if (v.badge === 'below') { bx = v.x - Math.floor(bw / 2); by = v.y + v.r + 3; }
    else if (v.badge === 'right') { bx = v.x + v.r + 4; by = v.y - 2; }
    else { bx = v.x - v.r - 4 - bw; by = v.y - 2; }
    const dim = st === 'locked';
    rect(c, bx - 2, by - 2, bw + 4, 9, 'rgba(5,5,14,0.82)');
    rect(c, bx - 2, by - 2, bw + 4, 1, dim ? '#2a2640' : st === 'buy' ? PAL.gold1 : '#5a2430');
    tinyCoin(c, bx, by, dim);
    digits(c, bx + 7, by, s, dim ? '#4a4560' : st === 'buy' ? PAL.gold4 : '#ff7a7a');
  }

  function burst(x: number, y: number, n: number, speed: number) {
    const cols = [PAL.gold3, PAL.gold4, PAL.gold5, PAL.white, PAL.gold2];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = speed * (0.35 + Math.random() * 0.65);
      particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 15, life: 0, max: 0.5 + Math.random() * 0.5, color: cols[i % cols.length] });
    }
  }

  let last = performance.now();
  let raf = 0;
  function frame(now: number) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    // finished sap flows
    let dirty = false;
    for (const [id, t0] of flowing) {
      if (now - t0 >= FLOW_MS) {
        flowing.delete(id);
        dirty = true;
        const v = viewById.get(id)!;
        burst(v.x, v.y, v.n.capstone ? 46 : 26, v.n.capstone ? 90 : 60);
        shocks.push({ x: v.x, y: v.y, t0: now, diamond: !!v.n.capstone, r: v.r });
      }
    }
    if (dirty) rebuildTree();

    c.globalCompositeOperation = 'source-over';
    c.drawImage(treeCv, 0, 0);

    // twinkle
    if (!reduced) {
      const tr = seeded(Math.floor(now / 400));
      for (let i = 0; i < 6; i++) rect(c, Math.floor(tr() * W), Math.floor(tr() * 180), 1, 1, '#ffffff');
    }

    // glows under nodes
    c.globalCompositeOperation = 'lighter';
    for (const v of views) {
      if (stateOf(v.n) !== 'bought') continue;
      const fl = reduced ? 1 : 0.85 + 0.15 * Math.sin(now / 500 + v.x);
      glow(v.x, v.y, v.r * (v.n.capstone ? 4 : 3), 0.32 * fl);
    }
    c.globalCompositeOperation = 'source-over';

    // sap flowing
    for (const [id, t0] of flowing) {
      const v = viewById.get(id)!;
      const p = Math.min(1, (now - t0) / FLOW_MS);
      const k = Math.max(1, Math.floor(p * v.path.length));
      vein(c, v.path, k, v.n.branch === 'trunk' ? 2 : 1);
      const head = v.path[k - 1];
      c.globalCompositeOperation = 'lighter';
      glow(head.x, head.y, 12, 0.7);
      c.globalCompositeOperation = 'source-over';
      disc(c, head.x, head.y, 2, PAL.gold5);
      if (Math.random() < 0.6) particles.push({ x: head.x, y: head.y, vx: (Math.random() - 0.5) * 20, vy: -10 - Math.random() * 15, life: 0, max: 0.4, color: PAL.gold4 });
    }

    for (const v of views) drawNode(v, stateOf(v.n), now);

    // hover / focus / nudge rings
    const hv = hover ? viewById.get(hover) : undefined;
    if (hv) {
      c.globalAlpha = 0.9;
      outline(c, hv.x, hv.y, hv.r + 4, '#ffffff', !!hv.n.capstone);
      c.globalAlpha = 1;
    }
    if (nudge) {
      const a = 1 - (now - nudge.t0) / 900;
      const nv = viewById.get(nudge.id);
      if (a <= 0 || !nv) nudge = null;
      else {
        c.globalAlpha = a * (0.5 + 0.5 * Math.sin(now / 60));
        outline(c, nv.x, nv.y, nv.r + 4, '#ffffff', !!nv.n.capstone);
        outline(c, nv.x, nv.y, nv.r + 5, PAL.gold4, !!nv.n.capstone);
        c.globalAlpha = 1;
      }
    }

    // shockwaves
    for (let i = shocks.length - 1; i >= 0; i--) {
      const s = shocks[i];
      const p = (now - s.t0) / 450;
      if (p >= 1) { shocks.splice(i, 1); continue; }
      c.globalAlpha = 1 - p;
      outline(c, s.x, s.y, Math.round(s.r + 2 + p * 16), PAL.gold4, s.diamond);
      c.globalAlpha = 1;
    }

    // motes (fireflies of sap)
    if (!reduced) {
      for (const m of motes) {
        m.y -= m.vy * dt;
        m.ph += dt * 2;
        if (m.y < 26) { m.y = 230 + Math.random() * 20; m.x = 150 + Math.random() * 340; }
        const a = 0.35 + 0.35 * Math.sin(m.ph * 1.7);
        c.globalAlpha = a;
        rect(c, m.x + Math.sin(m.ph) * 3, m.y, 1, 1, PAL.gold4);
      }
      c.globalAlpha = 1;
    }

    // particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const pt = particles[i];
      pt.life += dt;
      if (pt.life >= pt.max) { particles.splice(i, 1); continue; }
      pt.vy += 60 * dt;
      pt.vx *= 0.97;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      c.globalAlpha = 1 - pt.life / pt.max;
      rect(c, pt.x, pt.y, pt.life < pt.max * 0.4 ? 2 : 1, pt.life < pt.max * 0.4 ? 2 : 1, pt.color);
    }
    c.globalAlpha = 1;

    raf = requestAnimationFrame(frame);
  }

  // ── HTML state ──
  function renderHud() {
    coinN.textContent = String(save.coins);
    quoteEl.textContent = `«${OBSERVER_LINES[quote]}»`;
    const total = views.length;
    progressEl.innerHTML = `Пробуждено: <b>${save.nodes.length}</b> / ${total}`;
    respecBtn.disabled = save.nodes.length === 0;
    for (const br of branchOrder) {
      const all = views.filter((v) => v.n.branch === br);
      const got = all.filter((v) => owned(v.n.id)).length;
      const l = labelEls.get(br)!;
      l.innerHTML = `${META_BRANCH_NAMES[br]} <b>${got}/${all.length}</b>`;
      l.classList.toggle('full', got === all.length);
    }
    for (const v of views) {
      const b = btns.get(v.n.id)!;
      const st = stateOf(v.n);
      b.dataset.state = st;
      b.setAttribute('aria-label', `${v.n.name}. ${v.n.desc}. ${stateText(v.n, st)}`);
    }
    renderPaths();
    renderTip();
  }

  function stateText(n: MetaNode, st: NodeState): string {
    if (st === 'bought' || st === 'flow') return 'Пробуждено';
    if (st === 'locked') return `Сначала: ${n.requires ? viewById.get(n.requires)?.n.name ?? n.requires : '—'}`;
    if (st === 'poor') return `Не хватает Монет (ещё ${n.cost - save.coins})`;
    return 'Нажми, чтобы пробудить';
  }

  function renderPaths() {
    pathsEl.innerHTML = '';
    PATHS.forEach((p, i) => {
      const locked = i > save.pathUnlocked;
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'mt-path' + (i === save.path ? ' sel' : '') + (locked ? ' locked' : '');
      row.disabled = locked;
      const stars = save.bestStars[i] ?? 0;
      const starHtml = [0, 1, 2].map((k) => `<i class="${k < stars ? 'on' : 'off'}">★</i>`).join('');
      row.innerHTML = `
        <span class="nm"><em>${['I', 'II', 'III'][i] ?? i + 1}</em>${p.name}</span>
        <span class="st">${starHtml}</span>
        <small>${locked ? 'Пройди предыдущую Тропу' : p.desc}</small>`;
      if (!locked) row.addEventListener('click', () => {
        if (save.path === i) return;
        save.path = i;
        writeSave(save);
        renderPaths();
      });
      pathsEl.appendChild(row);
    });
  }

  function setHover(id: string | null) {
    hover = id;
    renderTip();
  }

  function renderTip() {
    const v = hover ? viewById.get(hover) : undefined;
    if (!v) { tip.classList.remove('show'); return; }
    const st = stateOf(v.n);
    tip.className = `mt-tip show st-${st}`;
    tip.innerHTML = `
      <div class="br">${META_BRANCH_NAMES[v.n.branch]}${v.n.capstone ? ' · <span class="cap">Вершина</span>' : ''}</div>
      <h3>${v.n.name}</h3>
      <p>${v.n.desc}</p>
      <div class="cost"><img alt="" src="${coinIcon()}"><b>${v.n.cost}</b> ${coinsWord(v.n.cost)} Наблюдателя</div>
      <div class="state">${stateText(v.n, st)}</div>`;
    // place beside the node, on the outer side of the tree
    const scale = el.clientWidth / W || 1;
    const tw = tip.offsetWidth / scale, th = tip.offsetHeight / scale;
    const gap = v.r + 10;
    let tx = v.x <= CX - 4 ? v.x - gap - tw : v.x + gap;
    if (v.n.branch === 'roots') tx = v.badge === 'left' ? v.x - gap - 24 - tw : v.x + gap + 24;
    if (v.n.branch === 'trunk') tx = v.x + gap + 22;
    tx = Math.max(4, Math.min(W - 4 - tw, tx));
    const ty = Math.max(4, Math.min(H - 4 - th, v.y - th / 2));
    tip.style.left = u(Math.round(tx));
    tip.style.top = u(Math.round(ty));
  }

  function flash(node: HTMLElement, cls: string) {
    node.classList.remove(cls);
    void node.offsetWidth;
    node.classList.add(cls);
  }

  function tryBuy(v: NodeView) {
    const st = stateOf(v.n);
    if (st === 'bought' || st === 'flow') return;
    if (st === 'locked') {
      if (v.n.requires) nudge = { id: v.n.requires, t0: performance.now() };
      flash(tip, 'shake');
      return;
    }
    if (!buyNode(save, v.n.id)) {
      flash(coinsRow, 'deny');
      flash(tip, 'shake');
      return;
    }
    flowing.set(v.n.id, reduced ? performance.now() - FLOW_MS : performance.now());
    quote = 1 + Math.floor(Math.random() * (OBSERVER_LINES.length - 1));
    flash(coinsRow, 'spend');
    rebuildTree();
    renderHud();
  }

  respecBtn.addEventListener('click', () => {
    if (!save.nodes.length) return;
    for (const id of save.nodes) {
      const v = viewById.get(id);
      if (v) burst(v.x, v.y, 10, 35);
    }
    flowing.clear();
    respec(save);
    quote = 0;
    flash(coinsRow, 'spend');
    rebuildTree();
    renderHud();
  });

  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    cancelAnimationFrame(raf);
    window.removeEventListener('keydown', onKey, true);
    el.remove();
    onClose();
  }
  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  }
  q<HTMLButtonElement>('.mt-back').addEventListener('click', close);
  window.addEventListener('keydown', onKey, true);

  rebuildTree();
  renderHud();
  raf = requestAnimationFrame(frame);
}
