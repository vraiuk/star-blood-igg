import { Audio } from './audio/audio';
import { ABILITIES, SLOTS, WORLD, crownPos, treeScale, type AbilityId } from './data/balance';
import { PATHS, coinsForRun } from './data/meta';
import { Renderer, type ViewState } from './render/renderer';
import { treeHeight } from './render/tree';
import { Game, STEP } from './sim/game';
import { hasStartRune, loadSave, metaPatches, writeSave } from './state/save';
import { Hud, type MenuTarget } from './ui/hud';
import { openMetaTree } from './ui/metaTree';
import { buildRunLog, saveRunLog } from './state/runlog';
import { openStats } from './ui/stats';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const uiRoot = document.getElementById('ui') as HTMLElement;
const ctx = canvas.getContext('2d')!;
ctx.imageSmoothingEnabled = false;

const save = loadSave();
const newGame = () => new Game({
  seed: (Math.random() * 1e9) | 0,
  meta: metaPatches(save),
  startRune: hasStartRune(save),
  path: Math.min(save.path, save.pathUnlocked),
});

let game = newGame();
let started = false;
let paused = false;
let metaOpen = false;
let speed = 1;
let scale = 2;
const audio = new Audio();
const renderer = new Renderer(ctx);
const view: ViewState = { hoverSlot: null, selectedSlot: null, hoverTree: false, mouseX: 320, mouseY: 200, aiming: null, preview: null };
let endShown = false;
const SPEEDS = [1, 2, 5];
const nextSpeed = () => SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
let lastRecord = false;

const titleInfo = () => {
  const p = Math.min(save.path, save.pathUnlocked);
  hud.renderTitle(`${PATHS[p].name} · рекорд: ${save.bestNight[p] ?? 0} ноч. · Монеты Наблюдателя: ${save.coins}`, save.coins);
};

const hud: Hud = new Hud(uiRoot, () => game, {
  onStart() {
    game = newGame();
    logged = false;
    hud.resetQuests();
    renderer.resetCamera(game.state.tree.radius);
    started = true;
    endShown = false;
    audio.start();
    hud.hideTitle();
  },
  onRestart() {
    logQuit();
    hud.hideEnd();
    hud.closeMenu();
    game = newGame();
    logged = false;
    hud.resetQuests();
    renderer.resetCamera(game.state.tree.radius);
    endShown = false;
  },
  onOpenStats() {
    metaOpen = true;
    openStats(uiRoot, () => { metaOpen = false; });
  },
  onOpenMeta() {
    metaOpen = true;
    openMetaTree(uiRoot, save, () => {
      metaOpen = false;
      titleInfo();
      if (game.over) { hud.hideEnd(); started = false; game = newGame(); hud.showTitle(); }
    });
  },
  onCast(id) { beginAim(id); },
  onCallNight() { game.callNight(); },
  onToggleSpeed() { speed = nextSpeed(); hud.setSpeed(speed); },
  onToggleSound() { hud.setSound(audio.toggle()); },
  onResume() { setPaused(false); },
  onMenuClosed() { view.selectedSlot = null; view.preview = null; },
  onPreview(p) { view.preview = p; },
});
titleInfo();

// ───────────────────────────── layout ──────────────────────────────

let cssW = 1280;
let cssH = 720;
function fit() {
  cssW = Math.floor(Math.min(window.innerWidth, (window.innerHeight * 16) / 9));
  cssH = Math.floor((cssW * 9) / 16);
  scale = cssW / 640;
  document.documentElement.style.setProperty('--s', String(scale));
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  ctx.imageSmoothingEnabled = false;
  hud.setScale(scale);
}
window.addEventListener('resize', fit);
fit();

// ───────────────────────────── input ───────────────────────────────

const held = new Set<string>();

function updateMove() {
  const l = held.has('a') || held.has('arrowleft') || held.has('ф');
  const r = held.has('d') || held.has('arrowright') || held.has('в');
  game.setMove(l === r ? 0 : l ? -1 : 1);
}

function setPaused(p: boolean) {
  paused = p;
  hud.setPaused(p);
}

/** Abilities that need a target point enter aim mode on click; the hammer casts at once. */
function beginAim(id: AbilityId) {
  hud.closeMenu();
  // the Starfall and the Hammer's leap are aimed with the next click
  if (id !== 'starfall' && id !== 'hammer') { game.cast(id, game.state.keeper.x); return; }
  hud.aiming = id;
  view.aiming = id;
}

function cancelAim() {
  hud.aiming = null;
  view.aiming = null;
}

const ABILITY_KEYS: Record<string, AbilityId> = Object.fromEntries(
  (Object.keys(ABILITIES) as AbilityId[]).map((id) => [ABILITIES[id].key, id]),
);
// Cyrillic layout aliases for letter hotkeys
const ALIAS: Record<string, string> = { г: 'u', ы: 's', й: 'q', у: 'e', к: 'r', е: 't', а: 'f', ь: 'm', ф: 'a', в: 'd', и: 'b', м: 'v', п: 'g' };

window.addEventListener('keydown', (e) => {
  if (metaOpen) return;
  const k = ALIAS[e.key.toLowerCase()] ?? e.key.toLowerCase();
  if (!started) {
    if (k === 'enter') { e.preventDefault(); (uiRoot.querySelector('.screen [data-a=start]') as HTMLButtonElement)?.click(); }
    return;
  }
  if (hud.choiceOpen) { hud.choiceKey(k); return; }
  if (k === 'escape') {
    if (view.aiming) cancelAim();
    else if (hud.menuOpen) hud.closeMenu();
    else if (!game.over) setPaused(!paused);
    return;
  }
  if (paused || game.over) return;
  held.add(k);
  updateMove();
  if (hud.target && hud.ringKey(k)) return;
  if (ABILITY_KEYS[k] && !e.repeat) {
    game.cast(ABILITY_KEYS[k], view.mouseX, view.mouseY);
    cancelAim();
  }
  if (k === ' ') {
    e.preventDefault();
    if (hud.deathPause) hud.releaseDeath();
    else game.callNight();
  }
  if (k === 'f') { speed = nextSpeed(); hud.setSpeed(speed); }
  if (k === 'm') hud.setSound(audio.toggle());
  if (k === 'r' || k === 'b') hud.togglePanel('keeper');
  if (k === 'v') game.revive('amber');
  if (k === 'g') game.revive('sacrifice');
  if (k === 't') hud.togglePanel('tree');
});
window.addEventListener('keyup', (e) => {
  const k = ALIAS[e.key.toLowerCase()] ?? e.key.toLowerCase();
  held.delete(k);
  updateMove();
});
window.addEventListener('blur', () => { held.clear(); updateMove(); });

function toWorld(ev: MouseEvent): [number, number] {
  const r = canvas.getBoundingClientRect();
  return renderer.camera.toWorld(ev.clientX - r.left, ev.clientY - r.top, r.width, r.height);
}
hud.setProjector((x, y) => renderer.camera.toScreen(x, y, cssW, cssH));

/** Clickable height of surface nests (matches their sprites). */
const PICK_H: Record<string, number> = { hive: 42, beetle: 20, dragonfly: 36, termite: 22, spider: 12 };

function pick(mx: number, my: number): MenuTarget | null {
  const s = game.state;
  // the crown first: on a young tree its slots hang low, right above the surface nests
  for (const st of s.structures) {
    if (st.crown && Math.hypot(mx - st.x, my - st.y - 3) < 10) return { kind: 'structure', id: st.id };
  }
  for (const sl of SLOTS) {
    if (!sl.crown || !game.slotUnlocked(sl) || game.structureAt(sl.id)) continue;
    const p = crownPos(s.tree.stage, Number(sl.id.slice(1)), s.tree.rings);
    if (Math.hypot(mx - p.x, my - p.y) < 10) return { kind: 'slot', slotId: sl.id };
  }
  for (const st of s.structures) {
    if (st.crown || Math.abs(mx - st.x) > 10) continue;
    if (st.underground ? Math.abs(my - st.y) < 12 : my > WORLD.groundY - PICK_H[st.family] && my < WORLD.groundY + 6) {
      return { kind: 'structure', id: st.id };
    }
  }
  for (const sl of SLOTS) {
    if (sl.crown || !game.slotUnlocked(sl) || game.structureAt(sl.id) || Math.abs(mx - sl.x) > 10) continue;
    if (sl.underground ? Math.abs(my - sl.y) < 12 : my > WORLD.groundY - 30 && my < WORLD.groundY + 10) {
      return { kind: 'slot', slotId: sl.id };
    }
  }
  const th = treeHeight(s.tree.stage) * treeScale(s.tree.rings);
  if (Math.abs(mx - WORLD.treeX) < 10 + th * 0.3 && my > WORLD.groundY - th && my < WORLD.groundY + 8) return { kind: 'tree' };
  return null;
}

canvas.addEventListener('mousemove', (ev) => {
  const [mx, my] = toWorld(ev);
  view.mouseX = mx;
  view.mouseY = my;
  const t = started && !game.over && !hud.choiceOpen ? pick(mx, my) : null;
  view.hoverSlot = t?.kind === 'slot' ? t.slotId : null;
  view.hoverTree = t?.kind === 'tree';
  canvas.style.cursor = view.aiming ? 'crosshair' : t ? 'pointer' : 'default';
});

canvas.addEventListener('mousedown', (ev) => {
  if (!started || paused || game.over || hud.choiceOpen) return;
  const [mx, my] = toWorld(ev);
  if (ev.button === 2) { cancelAim(); hud.closeMenu(); return; }
  if (view.aiming) {
    game.cast(view.aiming, mx, my);
    cancelAim();
    return;
  }
  const t = pick(mx, my);
  if (!t) { hud.closeMenu(); return; }
  hud.openMenu(t);
  if (t.kind === 'slot') view.selectedSlot = t.slotId;
  else if (t.kind === 'structure') view.selectedSlot = game.state.structures.find((s) => s.id === t.id)?.slotId ?? null;
  else view.selectedSlot = null;
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// ───────────────────────────── run end ─────────────────────────────

/** Record a run that was left unfinished (restart / closing the tab). */
let logged = false;
function logQuit() {
  if (!started || logged || game.over || game.state.night === 0) return;
  logged = true;
  saveRunLog(buildRunLog(game, 'quit'));
}
window.addEventListener('pagehide', logQuit);

function finishRun() {
  const s = game.state;
  if (!logged) { logged = true; saveRunLog(buildRunLog(game, 'lost')); }
  const stars = game.stars();
  const coins = Math.round(coinsForRun(s.night, stars, game.path + 1) * (game.retired ? 1.5 : 1));
  const prevBest = save.bestNight[game.path] ?? 0;
  save.bestNight[game.path] = Math.max(prevBest, s.night);
  lastRecord = s.night > prevBest;
  save.coins += coins;
  save.earned += coins;
  save.runs++;
  save.bestStars[game.path] = Math.max(save.bestStars[game.path] ?? 0, stars);
  if (stars > 0 && game.path === save.pathUnlocked && save.pathUnlocked < PATHS.length - 1) save.pathUnlocked++;
  writeSave(save);
  titleInfo();
  return coins;
}

// ───────────────────────────── loop ────────────────────────────────

let last = performance.now();
let acc = 0;
let time = 0;

function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  time += dt;
  // choices (dawn rune, tree branch) pause the world
  const frozen = !started || paused || game.over || !!game.choice || metaOpen || hud.tabletOpen || hud.deathPause;
  if (!frozen) {
    acc += dt * speed;
    while (acc >= STEP) {
      game.step();
      acc -= STEP;
      if (game.over || game.choice) { acc = 0; break; }
    }
  } else {
    acc = 0;
  }
  const events = game.drainEvents();
  if (events.length) {
    renderer.onEvents(events, game);
    hud.onEvents(events);
    audio.play(events);
    audio.setPhase(game.state.phase);
  }
  if (game.over && !endShown && started) {
    endShown = true;
    hud.closeMenu();
    const coins = finishRun();
    setTimeout(() => hud.showEnd(coins, save.bestNight[game.path] ?? 0, lastRecord), game.retired ? 300 : 1400);
  }
  renderer.render(game, view, time, frozen && started ? dt * 0.15 : dt);
  hud.update(dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// debug hooks for automated playtests
(window as unknown as Record<string, unknown>).__igg = {
  get game() { return game; },
  save,
  start: () => { if (!started) hud.hideTitle(); started = true; },
  setSpeed: (x: number) => { speed = x; },
};
