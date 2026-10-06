import { PAL, disc, ellipse, line, makeCanvas, rect, ring } from '../render/pixel';

type Painter = (c: CanvasRenderingContext2D) => void;

const PAINTERS: Record<string, Painter> = {
  blood: (c) => {
    rect(c, 7, 2, 2, 1, PAL.blood2);
    rect(c, 6, 3, 4, 2, PAL.blood2);
    rect(c, 5, 5, 6, 3, PAL.blood1);
    rect(c, 4, 8, 8, 2, PAL.blood1);
    rect(c, 5, 10, 6, 2, PAL.blood0);
    rect(c, 6, 12, 4, 1, PAL.blood0);
    rect(c, 7, 13, 2, 1, PAL.blood0);
    rect(c, 6, 4, 1, 3, PAL.white);
    rect(c, 11, 3, 1, 1, PAL.gold5);
    rect(c, 12, 2, 1, 1, PAL.gold4);
  },
  light: (c) => {
    disc(c, 8, 8, 3, PAL.gold4);
    rect(c, 7, 7, 2, 2, PAL.gold5);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      line(c, 8 + Math.cos(a) * 5, 8 + Math.sin(a) * 5, 8 + Math.cos(a) * 7, 8 + Math.sin(a) * 7, i % 2 ? PAL.gold2 : PAL.gold3);
    }
  },
  tree: (c) => {
    line(c, 8, 14, 8, 8, PAL.gold2, 2);
    line(c, 8, 9, 4, 5, PAL.gold2);
    line(c, 8, 9, 12, 5, PAL.gold2);
    disc(c, 8, 5, 3, PAL.gold3);
    disc(c, 4, 6, 2, PAL.gold3);
    disc(c, 12, 6, 2, PAL.gold3);
    rect(c, 7, 3, 2, 1, PAL.gold5);
    line(c, 8, 14, 5, 15, PAL.gold1);
    line(c, 8, 14, 11, 15, PAL.gold1);
  },
  treeDim: (c) => {
    line(c, 8, 14, 8, 8, '#4a4560', 2);
    line(c, 8, 9, 4, 5, '#4a4560');
    line(c, 8, 9, 12, 5, '#4a4560');
    disc(c, 8, 5, 3, '#3a3650');
    disc(c, 4, 6, 2, '#3a3650');
    disc(c, 12, 6, 2, '#3a3650');
  },
  spear: (c) => {
    line(c, 3, 13, 11, 5, PAL.gold2, 2);
    line(c, 3, 13, 11, 5, PAL.gold4, 1);
    rect(c, 11, 3, 2, 2, PAL.gold5);
    rect(c, 13, 2, 1, 1, PAL.white);
    rect(c, 10, 4, 1, 1, PAL.gold5);
    rect(c, 12, 5, 1, 1, PAL.gold5);
    for (let i = 0; i < 3; i++) rect(c, 2 + i, 14 - i, 1, 1, PAL.gold1);
  },
  flash: (c) => {
    ring(c, 8, 8, 6, PAL.gold3);
    disc(c, 8, 8, 3, PAL.gold4);
    rect(c, 7, 7, 2, 2, PAL.white);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.78;
      rect(c, 8 + Math.cos(a) * 4.5, 8 + Math.sin(a) * 4.5, 1, 1, PAL.gold5);
    }
  },
  roots: (c) => {
    rect(c, 1, 9, 14, 1, PAL.gold1);
    for (const [x, h] of [[4, 5], [8, 8], [12, 6]]) {
      line(c, x, 9, x, 9 - h, PAL.gold3, 1);
      rect(c, x, 9 - h - 1, 1, 1, PAL.gold5);
    }
    line(c, 8, 10, 6, 14, PAL.gold2);
    line(c, 8, 10, 10, 14, PAL.gold2);
    line(c, 4, 10, 2, 13, PAL.gold2);
    line(c, 12, 10, 14, 13, PAL.gold2);
  },
  hive: (c) => {
    line(c, 5, 15, 6, 10, PAL.wood2, 2);
    line(c, 11, 15, 10, 10, PAL.wood2, 2);
    rect(c, 5, 8, 6, 3, PAL.wood3);
    ellipse(c, 8, 5, 3, 4, PAL.gold1);
    ellipse(c, 8, 5, 2, 3, PAL.gold2);
    rect(c, 6, 4, 4, 1, PAL.gold0);
    rect(c, 7, 4, 2, 2, PAL.gold5);
    rect(c, 2, 3, 1, 1, PAL.gold5); rect(c, 13, 6, 1, 1, PAL.gold5); rect(c, 12, 1, 1, 1, PAL.gold4);
  },
  beetle: (c) => {
    ellipse(c, 7, 9, 6, 5, '#3a2416');
    ellipse(c, 6, 8, 5, 4, '#6a4426');
    line(c, 7, 4, 7, 13, '#3a2416');
    ellipse(c, 13, 11, 2, 2, '#3a2416');
    line(c, 14, 10, 15, 7, PAL.cloak2);
    for (const x of [3, 7, 11]) line(c, x, 13, x - 1, 15, PAL.bark0);
    rect(c, 3, 6, 1, 1, PAL.gold3); rect(c, 10, 6, 1, 1, PAL.gold3); rect(c, 6, 9, 2, 2, PAL.gold4);
  },
  dragonfly: (c) => {
    line(c, 8, 15, 8, 9, PAL.wood2, 2);
    ellipse(c, 8, 8, 4, 2, PAL.wood1);
    disc(c, 8, 6, 2, PAL.gold4);
    rect(c, 8, 5, 1, 1, PAL.white);
    line(c, 1, 3, 6, 3, PAL.gold3);
    rect(c, 2, 1, 2, 1, PAL.gold5); rect(c, 4, 1, 2, 1, PAL.gold5);
    line(c, 10, 2, 15, 2, PAL.gold3);
    rect(c, 11, 0, 2, 1, PAL.gold5); rect(c, 13, 0, 1, 1, PAL.gold5);
  },
  spider: (c) => {
    rect(c, 0, 2, 16, 1, PAL.dirt3);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; line(c, 8, 9, 8 + Math.cos(a) * 7, 9 + Math.sin(a) * 5, '#5a5470'); }
    for (const dx of [-1, 1]) for (const dy of [0, 2]) line(c, 8, 8, 8 + dx * 5, 6 + dy * 2, PAL.shade0);
    disc(c, 8, 7, 2, PAL.shade1);
    disc(c, 8, 10, 3, PAL.gold1);
    disc(c, 8, 10, 2, PAL.gold4);
    rect(c, 7, 6, 1, 1, '#ff6a6a'); rect(c, 9, 6, 1, 1, '#ff6a6a');
  },
  amber: (c) => {
    rect(c, 7, 2, 2, 2, PAL.gold4);
    ellipse(c, 8, 9, 5, 5, PAL.gold1);
    ellipse(c, 8, 8, 4, 4, PAL.gold2);
    rect(c, 5, 6, 2, 3, PAL.gold4);
    rect(c, 5, 6, 1, 1, PAL.gold5);
    rect(c, 9, 10, 1, 1, PAL.gold0);
  },
  star: (c) => {
    rect(c, 7, 1, 2, 14, PAL.blood2);
    rect(c, 1, 7, 14, 2, PAL.blood2);
    rect(c, 6, 4, 4, 8, PAL.blood1);
    rect(c, 4, 6, 8, 4, PAL.blood1);
    rect(c, 7, 7, 2, 2, PAL.white);
  },
  hammer: (c) => {
    line(c, 3, 14, 9, 8, PAL.wood3, 2);
    rect(c, 7, 2, 7, 6, PAL.gold2);
    rect(c, 7, 2, 7, 1, PAL.gold5);
    rect(c, 8, 4, 5, 2, PAL.gold4);
    rect(c, 1, 10, 1, 1, PAL.gold5); rect(c, 14, 11, 1, 1, PAL.gold5); rect(c, 3, 3, 1, 1, PAL.gold4);
  },
  starfall: (c) => {
    for (const [x, y] of [[4, 3], [10, 1], [13, 7]]) {
      line(c, x - 3, y - 3, x, y, '#ff7a4a');
      rect(c, x, y, 2, 2, PAL.gold5);
    }
    rect(c, 1, 13, 14, 1, PAL.gold1);
    for (let i = 2; i < 14; i += 3) rect(c, i, 12, 1, 1, '#ff7a3a');
    disc(c, 7, 11, 2, PAL.gold4);
  },
  caterpillar: (c) => {
    line(c, 3, 15, 4, 4, PAL.wood2, 2);
    line(c, 4, 4, 11, 3, PAL.wood2);
    ellipse(c, 11, 7, 2, 3, '#d8d0c0');
    for (let i = 0; i < 5; i++) rect(c, 6 + i * 2, 13 - (i === 2 ? 1 : 0), 2, 2, i % 2 ? '#5aa63a' : '#9be35a');
    rect(c, 14, 13, 1, 1, PAL.gold4);
  },
  termite: (c) => {
    for (let i = 0; i < 10; i++) { const w = Math.round((1 - i / 10) * 6 + 1); rect(c, 8 - w, 15 - i, w * 2, 1, i % 3 === 0 ? '#8a5a2a' : '#6a4422'); }
    rect(c, 7, 4, 2, 1, PAL.gold4);
    rect(c, 2, 13, 4, 2, PAL.gold2); rect(c, 6, 13, 1, 1, '#f0e0c0');
    rect(c, 11, 13, 4, 2, PAL.gold2); rect(c, 10, 13, 1, 1, '#f0e0c0');
  },
  honeycomb: (c) => {
    for (const [dx, dy] of [[8, 4], [4, 7], [12, 7], [8, 10], [4, 13], [12, 13]]) { rect(c, dx - 2, dy - 1, 4, 3, PAL.gold2); rect(c, dx - 1, dy - 1, 2, 1, PAL.gold4); }
  },
  mender: (c) => {
    ellipse(c, 8, 9, 5, 4, '#3a8a3a'); ellipse(c, 7, 8, 4, 3, '#5ac85a');
    rect(c, 6, 3, 5, 2, '#9cff8a'); rect(c, 7, 2, 2, 4, '#9cff8a');
    line(c, 4, 12, 2, 14, '#2a5a2a'); line(c, 12, 12, 14, 14, '#2a5a2a');
  },
  radiance: (c) => {
    line(c, 8, 15, 8, 9, PAL.gold2, 2);
    disc(c, 8, 6, 4, PAL.gold3);
    disc(c, 8, 6, 2, PAL.gold5);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; rect(c, 8 + Math.cos(a) * 7, 6 + Math.sin(a) * 6, 1, 1, PAL.gold5); }
  },
  swarm: (c) => {
    for (const [x, y] of [[4, 5], [11, 4], [8, 9], [3, 11], [12, 11]]) { rect(c, x, y, 2, 2, PAL.gold3); rect(c, x - 1, y - 1, 1, 1, PAL.gold5); rect(c, x + 2, y - 1, 1, 1, PAL.gold5); }
    rect(c, 7, 13, 3, 2, '#9cff8a');
  },
  timestop: (c) => {
    // an hourglass of amber light inside a frozen ring
    for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; rect(c, 8 + Math.cos(a) * 7, 8 + Math.sin(a) * 7, 1, 1, i % 2 ? '#8fd0ff' : '#d8f0ff'); }
    rect(c, 5, 3, 6, 1, PAL.gold3); rect(c, 5, 12, 6, 1, PAL.gold3);
    line(c, 5, 4, 8, 8, '#b8e4ff'); line(c, 11, 4, 8, 8, '#b8e4ff');
    line(c, 8, 8, 5, 11, '#b8e4ff'); line(c, 8, 8, 11, 11, '#b8e4ff');
    rect(c, 7, 5, 3, 1, PAL.gold5); rect(c, 6, 10, 5, 1, PAL.gold4); rect(c, 8, 8, 1, 2, PAL.gold5);
  },
  merge: (c) => {
    disc(c, 4, 11, 2, PAL.gold2); disc(c, 12, 11, 2, PAL.gold2); disc(c, 8, 5, 3, PAL.gold4);
    line(c, 5, 10, 7, 7, PAL.gold3); line(c, 11, 10, 9, 7, PAL.gold3);
    rect(c, 8, 4, 1, 1, PAL.white);
  },
  lock: (c) => {
    rect(c, 4, 7, 8, 7, '#4a4560');
    rect(c, 5, 3, 1, 5, '#6a6585'); rect(c, 10, 3, 1, 5, '#6a6585'); rect(c, 5, 3, 6, 1, '#6a6585');
    rect(c, 7, 9, 2, 3, '#1a1830');
  },
  rune: (c) => {
    rect(c, 3, 1, 10, 14, '#1b2a5a');
    rect(c, 3, 1, 10, 1, '#6fa8ff'); rect(c, 3, 14, 10, 1, '#6fa8ff');
    line(c, 8, 3, 8, 12, '#bfe0ff');
    line(c, 8, 5, 11, 8, '#bfe0ff');
    line(c, 8, 8, 5, 11, '#bfe0ff');
  },
  upgrade: (c) => {
    line(c, 8, 3, 3, 9, PAL.gold4, 2);
    line(c, 8, 3, 13, 9, PAL.gold4, 2);
    line(c, 8, 8, 4, 13, PAL.gold2, 2);
    line(c, 8, 8, 12, 13, PAL.gold2, 2);
  },
  sell: (c) => {
    rect(c, 4, 4, 8, 8, '#3a2230');
    line(c, 5, 5, 11, 11, '#ff7a7a', 2);
    line(c, 11, 5, 5, 11, '#ff7a7a', 2);
  },
  feed: (c) => {
    PAINTERS.tree(c);
    rect(c, 12, 10, 3, 3, PAL.blood1);
    rect(c, 13, 10, 1, 1, PAL.blood2);
  },
};

const cache = new Map<string, string>();

/** Returns a data URL of a 16×16 pixel icon. */
export function icon(name: keyof typeof PAINTERS | string): string {
  const hit = cache.get(name);
  if (hit) return hit;
  const [cv, c] = makeCanvas(16, 16);
  PAINTERS[name]?.(c);
  const url = cv.toDataURL();
  cache.set(name, url);
  return url;
}
