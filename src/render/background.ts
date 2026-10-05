import { WORLD } from '../data/balance';
import { BAYER4, type Ctx, PAL, disc, ellipse, line, makeCanvas, rect, seeded } from './pixel';

const W = WORLD.width;
const H = WORLD.height;
const GY = WORLD.groundY;

function hex(c: string): [number, number, number] {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Paint a vertical dithered gradient through `stops` between y0..y1. */
function ditherGradient(c: Ctx, x0: number, y0: number, w: number, y1: number, stops: string[]) {
  const img = c.getImageData(x0, y0, w, y1 - y0);
  const cols = stops.map(hex);
  for (let y = 0; y < y1 - y0; y++) {
    const t = (y / (y1 - y0)) * (cols.length - 1);
    const i = Math.min(cols.length - 2, Math.floor(t));
    const f = t - i;
    for (let x = 0; x < w; x++) {
      const pick = f * 16 > BAYER4[((y + y0) & 3) * 4 + ((x + x0) & 3)] + 0.5 ? cols[i + 1] : cols[i];
      const o = (y * w + x) * 4;
      img.data[o] = pick[0]; img.data[o + 1] = pick[1]; img.data[o + 2] = pick[2]; img.data[o + 3] = 255;
    }
  }
  c.putImageData(img, x0, y0);
}

export interface Backdrop {
  sky: HTMLCanvasElement;
  far: HTMLCanvasElement;
  mid: HTMLCanvasElement;
  ground: HTMLCanvasElement;
  eclipse: { x: number; y: number; r: number };
}

/** Pre-renders the static parallax layers once. */
export function buildBackdrop(): Backdrop {
  const eclipse = { x: 492, y: 66, r: 23 };
  return { sky: buildSky(eclipse), far: buildFar(), mid: buildMid(), ground: buildGround(), eclipse };
}

function buildSky(ec: { x: number; y: number; r: number }) {
  const [cv, c] = makeCanvas(W, GY);
  ditherGradient(c, 0, 0, W, GY, [PAL.sky0, PAL.sky1, PAL.sky2, PAL.sky3, PAL.sky4, '#311f4a']);
  const r = seeded(7);
  // stars
  for (let i = 0; i < 170; i++) {
    const x = r() * W, y = r() * GY * 0.7;
    const b = r();
    rect(c, x, y, 1, 1, b > 0.92 ? '#d9d4ff' : b > 0.6 ? '#7c79b8' : '#3d3b6e');
    if (b > 0.97) {
      rect(c, x - 1, y, 3, 1, '#5e5aa0');
      rect(c, x, y - 1, 1, 3, '#5e5aa0');
      rect(c, x, y, 1, 1, '#ffffff');
    }
  }
  // faint nebula streaks
  for (let i = 0; i < 900; i++) {
    const t = r();
    const x = 280 + t * 340 + (r() - 0.5) * 40;
    const y = 30 + Math.sin(t * 5) * 18 + t * 40 + (r() - 0.5) * 30;
    rect(c, x, y, 1, 1, r() > 0.5 ? '#2c2050' : '#241a44');
  }
  // eclipse halo (dithered rings)
  for (let rr = ec.r + 14; rr > ec.r; rr--) {
    const v = 1 - (rr - ec.r) / 14;
    for (let a = 0; a < 360; a += 1.2) {
      const x = Math.round(ec.x + Math.cos((a * Math.PI) / 180) * rr);
      const y = Math.round(ec.y + Math.sin((a * Math.PI) / 180) * rr);
      if (v * v * 16 > BAYER4[(y & 3) * 4 + (x & 3)]) rect(c, x, y, 1, 1, v > 0.8 ? '#6a3fb0' : '#3b2468');
    }
  }
  disc(c, ec.x, ec.y, ec.r, '#020206');
  for (let a = 0; a < 360; a += 0.8) {
    const x = ec.x + Math.cos((a * Math.PI) / 180) * (ec.r + 0.5);
    const y = ec.y + Math.sin((a * Math.PI) / 180) * (ec.r + 0.5);
    rect(c, x, y, 1, 1, a > 200 && a < 340 ? '#b48cff' : '#8a5ee0');
  }
  return cv;
}

/** Ruined aqueducts and cathedral spires (wider than the screen for parallax). */
function buildFar() {
  const FW = W + 24;
  const [cv, c] = makeCanvas(FW, GY);
  const r = seeded(11);
  // distant spires band
  for (let x = 0; x < FW; x += 3) {
    const h = 10 + Math.abs(Math.sin(x * 0.05) * 14) + r() * 8;
    rect(c, x, 168 - h, 3, h + 70, '#111230');
  }
  // cathedral clusters
  const spire = (cx: number, base: number, h: number, w: number) => {
    rect(c, cx - w / 2, base - h, w, h, PAL.far0);
    for (let i = 0; i < w / 2; i++) rect(c, cx - w / 2 + i, base - h - (w / 2 - i) * 2.2, w - i * 2, 3, PAL.far0);
    line(c, cx, base - h - w * 1.2, cx, base - h - w * 1.2 - 10, PAL.far0);
    rect(c, cx - w / 2, base - h, 1, h, PAL.far1);
    // windows
    for (let wy = base - h + 6; wy < base - 8; wy += 9) {
      if (r() > 0.55) {
        rect(c, cx - 1, wy, 2, 4, r() > 0.6 ? PAL.farLit : '#3a2d64');
      }
    }
  };
  for (const [x0, x1, top] of [[18, 170, 40], [470, 650, 52]] as const) {
    for (let i = 0; i < 9; i++) {
      const cx = x0 + r() * (x1 - x0);
      const h = 40 + r() * (150 - top) * (1 - Math.abs((cx - (x0 + x1) / 2) / (x1 - x0)));
      spire(cx, 172, h, 6 + Math.floor(r() * 6));
    }
  }
  // the ritual tower under the eclipse
  spire(496, 172, 84, 10);
  rect(c, 494, 96, 4, 4, '#a070ff');
  // aqueduct: two tiers of arches
  const aq = (y: number, pierW: number, span: number, h: number, col: string, hi: string) => {
    rect(c, 0, y, FW, 6, col);
    rect(c, 0, y, FW, 1, hi);
    for (let x = -((y * 7) % span); x < FW; x += span) {
      rect(c, x, y + 6, pierW, h, col);
      // arch: fill the spandrel above a semicircular opening
      const open = span - pierW;
      const spring = open * 0.55;
      for (let i = 0; i < open; i++) {
        const t = (i + 0.5) / open;
        const fill = Math.round(spring * (1 - Math.sqrt(1 - (2 * t - 1) ** 2))) + 1;
        rect(c, x + pierW + i, y + 6, 1, fill, col);
      }
      if (r() > 0.85) rect(c, x + pierW + 2, y + 6, span - pierW - 4, h, '#0e0f26');
    }
  };
  aq(112, 5, 30, 62, '#17183e', '#2a2b62');
  aq(150, 4, 20, 30, PAL.far0, '#232456');
  // broken gaps in the aqueduct
  for (let i = 0; i < 4; i++) {
    const gx = 60 + r() * (FW - 120);
    rect(c, gx, 110, 10 + r() * 12, 14, 'rgba(0,0,0,0)');
    c.clearRect(gx, 108, 8 + r() * 10, 12);
  }
  return cv;
}

/** Dead forest and thorn silhouettes. */
function buildMid() {
  const MW = W + 40;
  const [cv, c] = makeCanvas(MW, GY);
  const r = seeded(23);
  const tree = (x: number, base: number, h: number, col: string) => {
    line(c, x, base, x, base - h, col, 2);
    for (let y = base - h + 4; y < base - 6; y += 3 + Math.floor(r() * 3)) {
      const len = (1 - (base - y) / h) * 10 + 2;
      const dir = r() > 0.5 ? 1 : -1;
      line(c, x, y, x + dir * len, y - len * 0.5, col);
      if (r() > 0.5) line(c, x, y + 1, x - dir * len * 0.7, y - len * 0.3, col);
    }
  };
  for (let i = 0; i < 70; i++) tree(r() * MW, 214, 26 + r() * 40, '#0e1028');
  // rolling hill band
  for (let x = 0; x < MW; x++) {
    const h = 18 + Math.sin(x * 0.03) * 6 + Math.sin(x * 0.11) * 3;
    rect(c, x, 214 - h, 1, h + 30, PAL.mid1);
  }
  for (let i = 0; i < 60; i++) tree(r() * MW, 226, 20 + r() * 34, PAL.mid0);
  for (let x = 0; x < MW; x++) {
    const h = 6 + Math.sin(x * 0.05 + 2) * 3 + Math.sin(x * 0.17) * 2;
    rect(c, x, 230 - h, 1, h + 10, PAL.mid0);
  }
  // low fog (dithered)
  const img = c.getImageData(0, 180, MW, 56);
  for (let y = 0; y < 56; y++) {
    const v = Math.sin((y / 56) * Math.PI) * 0.35;
    for (let x = 0; x < MW; x++) {
      if (v * 16 > BAYER4[(y & 3) * 4 + (x & 3)] + Math.sin(x * 0.02 + y * 0.1) * 3 + 3) {
        const o = (y * MW + x) * 4;
        img.data[o] = 28; img.data[o + 1] = 30; img.data[o + 2] = 64; img.data[o + 3] = 255;
      }
    }
  }
  c.putImageData(img, 0, 180);
  return cv;
}

/** Surface crust and underground cross-section. */
function buildGround() {
  const [cv, c] = makeCanvas(W, H);
  ditherGradient(c, 0, GY, W, H, [PAL.dirt2, PAL.dirt1, PAL.dirt1, PAL.dirt0, '#08060b']);
  const r = seeded(31);
  // strata lines
  for (let i = 0; i < 14; i++) {
    const y0 = GY + 10 + r() * (H - GY - 20);
    let y = y0;
    for (let x = 0; x < W; x += 2) {
      y += (r() - 0.5) * 1.2;
      y += (y0 - y) * 0.05;
      rect(c, x, y, 2, 1, r() > 0.5 ? PAL.dirt2 : '#1a1320');
    }
  }
  // rocks
  for (let i = 0; i < 70; i++) {
    const x = r() * W, y = GY + 8 + r() * (H - GY - 10);
    const s = 2 + r() * 6;
    ellipse(c, x, y, s, s * 0.6, PAL.rock);
    rect(c, x - s * 0.5, y - s * 0.5, s * 0.6, 1, PAL.rockHi);
  }
  // small buried crystals that catch the root glow
  for (let i = 0; i < 26; i++) {
    const x = r() * W, y = GY + 20 + r() * (H - GY - 30);
    rect(c, x, y, 1, 2, '#3a2c55');
    rect(c, x, y, 1, 1, '#6d55a0');
  }
  // worm tunnels (faint)
  for (let side = 0; side < 2; side++) {
    let y = WORLD.wormLaneY;
    for (let i = 0; i < 230; i++) {
      const x = side === 0 ? i : W - i;
      y += Math.sin(i * 0.07 + side) * 0.35;
      ellipse(c, x, y, 3, 6, '#0a070d');
    }
  }
  // surface crust
  rect(c, 0, GY, W, 3, '#1b1726');
  rect(c, 0, GY + 3, W, 2, '#141019');
  for (let x = 0; x < W; x++) {
    if (r() > 0.6) rect(c, x, GY - 1, 1, 1, '#1b1726');
  }
  return cv;
}
