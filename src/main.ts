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
import { Coop, commandProxy, type StartInfo } from './net/coop';
import { CoopPanel } from './ui/coop';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const uiRoot = document.getElementById('ui') as HTMLElement;
const ctx = canvas.getContext('2d')!;
ctx.imageSmoothingEnabled = false;

const save = loadSave();
/** What this peer would start a run with (as the host: for everyone). */
const runInfo = (): Omit<StartInfo, 'players'> => ({
  seed: (Math.random() * 1e9) | 0,
  meta: metaPatches(save),
  startRune: hasStartRune(save),
  path: Math.min(save.path, save.pathUnlocked),
});
const newGame = (info: StartInfo = { ...runInfo(), players: 1 }) => new Game(info);

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
const SPEEDS = [1, 1.25, 1.5, 2, 5];
const nextSpeed = () => SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
let lastRecord = false;

const titleInfo = () => {
  const p = Math.min(save.path, save.pathUnlocked);
  hud.renderTitle(`${PATHS[p].name} · рекорд: ${save.bestNight[p] ?? 0} ноч. · Монеты Наблюдателя: ${save.coins}`, save.coins);
  // the title was rebuilt: put the lobby back into it
  if (lobby) coopPanel.renderLobby(lobby);
};

// ───────────────────────────── co-op ───────────────────────────────

const coopPanel = new CoopPanel(uiRoot);
let lobby: import('./net/coop').LobbyView | null = null;
const coop = new Coop({
  lobby(v) { lobby = v; coopPanel.renderLobby(v); },
  start(info, you) { beginRun(info, you); },
  paused(on) { coopPanel.hostPaused = on; },
  desync() { coopPanel.desync = true; },
});
/** The UI and the input talk to this: commands go out over the network, reads pass through. */
let cmd = commandProxy(game, coop);

/** A run starts on this peer (the host started it, or a guest got the start message). */
function beginRun(info: StartInfo, you: number) {
  logQuit();
  game = newGame(info);
  game.setLocal(you);
  cmd = commandProxy(game, coop);
  coop.attach(game);
  logged = false;
  hud.resetQuests();
  hud.hideEnd();
  hud.closeMenu();
  renderer.resetCamera(game.state.tree.radius);
  started = true;
  endShown = false;
  coopPanel.hostPaused = false;
  coopPanel.desync = false;
  lastMove = 0;
  setPaused(false);
  audio.start();
  hud.hideTitle();
}

/** A guest leaves the run (the others play on): back to a fresh lobby search. */
function leaveRun() { logQuit(); location.reload(); }

const hud: Hud = new Hud(uiRoot, () => cmd, {
  onStart() {
    if (coop.canStart) coop.start(runInfo());
  },
  onRestart() {
    if (coop.canStart) { coop.start(runInfo()); return; }
    // a guest waits for the host's next run in the lobby
    hud.hideEnd();
    hud.closeMenu();
    if (!game.over) { leaveRun(); return; }
    started = false;
    hud.showTitle();
    titleInfo();
  },
  onGiveUp() {
    setPaused(false);
    if (coop.isGuest) leaveRun();
    else cmd.surrender();
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
      if (game.over) { hud.hideEnd(); started = false; hud.showTitle(); titleInfo(); }
    });
  },
  onCast(id) { beginAim(id); },
  onCallNight() { cmd.callNight(); },
  onToggleSpeed() { if (!coop.isGuest) { speed = nextSpeed(); hud.setSpeed(speed); } },
  onToggleSound() { hud.setSound(audio.toggle()); },
  onResume() { setPaused(false); },
  onMenuClosed() { view.selectedSlot = null; view.preview = null; },
  onPreview(p) { view.preview = p; },
});
hud.coop = true;
hud.resetQuests();
titleInfo();
coop.connect();

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
/** the walk direction last sent (commands are only sent when it changes) */
let lastMove: -1 | 0 | 1 = 0;
let lastMoveAt = 0;

function wantedMove(): -1 | 0 | 1 {
  const l = held.has('a') || held.has('arrowleft') || held.has('ф');
  const r = held.has('d') || held.has('arrowright') || held.has('в');
  return l === r ? 0 : l ? -1 : 1;
}

function updateMove() {
  const m = wantedMove();
  if (m === lastMove) return;
  lastMove = m;
  lastMoveAt = performance.now();
  cmd.setMove(m);
}

function setPaused(p: boolean) {
  paused = p;
  hud.setPaused(p);
  // the host's pause holds the whole world; a guest's is just the menu
  coop.setPaused(p);
}

/** Abilities that need a target point enter aim mode on click; the hammer casts at once. */
function beginAim(id: AbilityId) {
  hud.closeMenu();
  // the Starfall and the Hammer's leap are aimed with the next click
  if (id !== 'starfall' && id !== 'hammer') { cmd.cast(id, game.state.keeper.x); return; }
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
const ALIAS: Record<string, string> = { г: 'u', ы: 's', й: 'q', ц: 'w', у: 'e', к: 'r', е: 't', а: 'f', ь: 'm', ф: 'a', в: 'd', и: 'b', м: 'v', п: 'g' };

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
    cmd.cast(ABILITY_KEYS[k], view.mouseX, view.mouseY);
    cancelAim();
  }
  if (k === ' ') {
    e.preventDefault();
    if (hud.deathPause) hud.releaseDeath();
    else cmd.callNight();
  }
  if (k === 'f' && !coop.isGuest) { speed = nextSpeed(); hud.setSpeed(speed); }
  if (k === 'm') hud.setSound(audio.toggle());
  if (k === 'r' || k === 'b') hud.togglePanel('keeper');
  if (k === 'v') cmd.revive('amber');
  if (k === 'g') cmd.revive('sacrifice');
  if (k === 't') hud.togglePanel('tree');
  if (k === 'q') cycleNode(-1);
  if (k === 'e') cycleNode(1);
});
window.addEventListener('keyup', (e) => {
  const k = ALIAS[e.key.toLowerCase()] ?? e.key.toLowerCase();
  held.delete(k);
  // releasing the spear key lets go of the Piercing Beam
  if (ABILITY_KEYS[k] === 'spear') cmd.releaseBeam();
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
    cmd.cast(view.aiming, mx, my);
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

/**
 * Q / E — previous / next build node (like Shift+Tab / Tab): surface left→right, then the
 * crown, then the root nodes; opens the node's menu (build or upgrade).
 */
function cycleNode(step: 1 | -1) {
  const s = game.state;
  const xOf = (sl: (typeof SLOTS)[number]) => (sl.crown ? crownPos(s.tree.stage, Number(sl.id.slice(1)), s.tree.rings).x : sl.x);
  const layer = (sl: (typeof SLOTS)[number]) => (sl.crown ? 1 : sl.underground ? 2 : 0);
  const nodes = SLOTS.filter((sl) => game.slotUnlocked(sl) || game.structureAt(sl.id))
    .sort((a, b) => layer(a) - layer(b) || xOf(a) - xOf(b));
  if (!nodes.length) return;
  const t = hud.target;
  const curId = t?.kind === 'slot' ? t.slotId : t?.kind === 'structure' ? s.structures.find((x) => x.id === t.id)?.slotId : undefined;
  const i = curId ? nodes.findIndex((n) => n.id === curId) : -1;
  const next = nodes[(i < 0 ? (step > 0 ? 0 : nodes.length - 1) : (i + step + nodes.length) % nodes.length)];
  const st = game.structureAt(next.id);
  hud.openMenu(st ? { kind: 'structure', id: st.id } : { kind: 'slot', slotId: next.id });
  view.selectedSlot = next.id;
}

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
  const coins = coinsForRun(s.night, stars, game.path + 1);
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
/** when a held rune key last asked for a cast (the answer takes a tick or a round-trip) */
const holdCastAt: Partial<Record<AbilityId, number>> = {};
let acc = 0;
let time = 0;

function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  time += dt;
  // hold-to-cast: a held rune key fires again as soon as the rune is ready;
  // the Piercing Beam is held while its key is down (co-op: at most one request per rune in flight)
  if (started && !paused && !game.over && !game.choice && !hud.target && !hud.tabletOpen) {
    for (const [key, id] of Object.entries(ABILITY_KEYS)) {
      if (!held.has(key)) continue;
      if (id === 'spear' && game.state.keeper.forms.spear === 'B') continue;
      if (game.abilityReady(id) && now - (holdCastAt[id] ?? 0) > 150) { holdCastAt[id] = now; cmd.cast(id, view.mouseX, view.mouseY); }
    }
  }
  // co-op lockstep: the host runs the world (its pause holds everyone), guests replay its frames;
  // a pending choice (dawn rune, tree branch) holds the world still on every peer
  const running = started && !game.over;
  if (running && coop.isGuest) {
    coop.guestTicks(dt);
  } else if (running && !paused) {
    acc += dt * speed;
    let n = 0;
    while (acc >= STEP && n < 60) { acc -= STEP; n++; }
    coop.hostTicks(n);
  } else {
    acc = 0;
  }
  coop.flush();
  const frozen = !started || game.over || !!game.choice || (coop.isGuest ? coopPanel.hostPaused : paused);
  // keep the walk in sync if a command got lost in a death or a channel
  const me = game.state.keeper;
  if (running && me.alive && me.move !== lastMove && me.channel <= 0 && now - lastMoveAt > 300) { lastMoveAt = now; cmd.setMove(lastMove); }
  hud.inRun = started;
  const events = game.drainEvents();
  // my own Ascended's fall and hits are mine to hear and see in the HUD
  const mine = events.filter((e) => !('k' in e) || e.k === game.local);
  // the Ascended falls: back to normal speed so the moment isn't missed
  if (speed !== 1 && mine.some((e) => e.type === 'keeperDown')) { speed = 1; hud.setSpeed(1); }
  if (events.length) {
    renderer.onEvents(events, game);
    hud.onEvents(mine);
    audio.play(mine);
    audio.setPhase(game.state.phase);
  }
  coopPanel.update(game, started, coop.lag);
  if (game.over && !endShown && started) {
    endShown = true;
    hud.closeMenu();
    coop.ended();
    const coins = finishRun();
    // let the Tree fall and its light go out before the summary
    setTimeout(() => hud.showEnd(coins, save.bestNight[game.path] ?? 0, lastRecord), 3600);
  }
  // paused worlds drift slowly; a lost run plays the Tree's fall in real time
  renderer.render(game, view, time, frozen && started && !game.over ? dt * 0.15 : dt);
  hud.update(dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// debug hooks for automated playtests
(window as unknown as Record<string, unknown>).__igg = {
  get game() { return game; },
  coop,
  save,
  start: () => { if (!started) hud.hideTitle(); started = true; },
  setSpeed: (x: number) => { speed = x; },
};
