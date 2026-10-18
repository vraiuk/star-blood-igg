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
import { hideWorldTip, showWorldTip } from './ui/glossary';
import { VERSION_LABEL } from './version';
import { WORLDS, isWorldId, type WorldId } from './data/worlds';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const uiRoot = document.getElementById('ui') as HTMLElement;
const ctx = canvas.getContext('2d')!;
ctx.imageSmoothingEnabled = false;

const save = loadSave();
/** `?world=micro|medium|legacy` starts that world straight away (dev/tests); medium also opens on the title */
const urlWorld: WorldId | null = (() => {
  const w = new URLSearchParams(location.search).get('world');
  return isWorldId(w) ? w : null;
})();
/** the world of the current (or next) run */
let world: WorldId = urlWorld ?? 'micro';
const newGame = () => {
  // the meta tree and difficulty paths belong to the legacy game only
  const legacy = WORLDS[world].features.meta;
  const g = new Game({
    seed: (Math.random() * 1e9) | 0,
    world,
    meta: legacy ? metaPatches(save) : [],
    startRune: legacy && hasStartRune(save),
    path: legacy ? Math.min(save.path, save.pathUnlocked) : 0,
  });
  renderer?.setWorld();
  return g;
};

let renderer: Renderer | undefined;
let game = newGame();
let started = false;
let paused = false;
let metaOpen = false;
let speed = 1;
let scale = 2;
const audio = new Audio();
renderer = new Renderer(ctx);
const view: ViewState = { hoverSlot: null, selectedSlot: null, hoverTree: false, mouseX: 320, mouseY: 200, aiming: null, preview: null };
let endShown = false;
const ALL_SPEEDS = [1, 1.25, 1.5, 2, 5];
/** speeds this world offers (×5 only where `maxSpeed` allows) */
const speeds = () => ALL_SPEEDS.filter((x) => x <= game.world.maxSpeed);
let sacrificeArmed = 0;
const nextSpeed = () => { const l = speeds(); return l[(l.indexOf(speed) + 1) % l.length]; };
/** − / + step through the speeds without wrapping around */
const stepSpeed = (d: 1 | -1) => { const l = speeds(); return l[Math.max(0, Math.min(l.length - 1, l.indexOf(speed) + d))]; };
/** the in-world control scheme (spec §3): walk up and hold S / W / X; no mouse on the world */
const inWorld = () => game.world.features.inWorld;
let lastRecord = false;

/** A run in progress is saved at every dawn and can be continued from the title. */
const RUN_KEY = 'igg2-run-v1';
const savedRun = (): { night: number; world: WorldId; json: string } | null => {
  try {
    const json = localStorage.getItem(RUN_KEY);
    if (!json) return null;
    const d = JSON.parse(json) as { world?: string; state?: { night?: number } };
    return { night: d.state?.night ?? 0, world: isWorldId(d.world) ? d.world : 'legacy', json };
  } catch { return null; }
};
const storeRun = () => { try { localStorage.setItem(RUN_KEY, game.snapshot()); } catch { /* storage full */ } };
const dropRun = () => { try { localStorage.removeItem(RUN_KEY); } catch { /* ignore */ } };

const titleInfo = () => {
  const run = savedRun();
  const runWorld = run ? WORLDS[run.world].name : '';
  hud.renderTitle(save.runs ? `Забегов: ${save.runs}${save.microDone ? ' · Росток пройден' : ''}` : '', run ? `${runWorld} · ночь ${run.night + 1}` : '',
    { mediumOpen: save.microDone || urlWorld === 'medium', legacy: urlWorld === 'legacy' });
};

/** Start a fresh run in world `w`. */
function startRun(w: WorldId) {
  dropRun();
  world = w;
  game = newGame();
  logged = false;
  hud.resetQuests();
  renderer!.resetCamera(game.state.tree.radius);
  started = true;
  endShown = false;
  if (!speeds().includes(speed)) { speed = 1; hud.setSpeed(1); }
  audio.start();
  hud.hideTitle();
}

const hud: Hud = new Hud(uiRoot, () => game, {
  onContinue() {
    const run = savedRun();
    if (run) world = run.world;
    game = newGame();
    if (!run || !game.restore(run.json)) { dropRun(); titleInfo(); return; }
    renderer!.setWorld();
    logged = false;
    hud.resetQuests();
    renderer!.resetCamera(game.state.tree.radius);
    started = true;
    endShown = false;
    audio.start();
    hud.hideTitle();
  },
  onFeedback() {
    // a prefilled GitHub issue: the author sees the version and this run's numbers
    const s = game.state;
    const body = `Версия: ${VERSION_LABEL}\nМир: ${game.world.name}\nТропа: ${PATHS[game.path].name}\nНочей: ${s.night}\nДрево: ${s.tree.stage + 1}/6, колец ${s.tree.rings}\n\n**Что понравилось:**\n\n**Что сломано / непонятно:**\n\n**Чего хочется дальше:**\n`;
    window.open(`https://github.com/vraiuk/star-blood-igg/issues/new?title=${encodeURIComponent('Отзыв: ')}&body=${encodeURIComponent(body)}`, '_blank');
  },
  onStart(w) { startRun(w); },
  onRestart() {
    logQuit();
    hud.hideEnd();
    hud.closeMenu();
    game = newGame();
    logged = false;
    hud.resetQuests();
    renderer!.resetCamera(game.state.tree.radius);
    endShown = false;
  },
  onGiveUp() {
    setPaused(false);
    game.surrender();
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
  onSpeed(step) { speed = stepSpeed(step); hud.setSpeed(speed); },
  onQuitToMenu() {
    logQuit();
    setPaused(false);
    hud.closeMenu();
    hud.hideEnd();
    started = false;
    game = newGame();
    logged = false;
    hud.resetQuests();
    renderer!.resetCamera(game.state.tree.radius);
    hud.showTitle();
    titleInfo();
  },
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
  const dir = l === r ? 0 : l ? -1 : 1;
  // Shift + A/D (follow-camera worlds): free look — the camera pans, the keeper stands still
  const look = game.world.features.inWorld && held.has('shift');
  renderer?.camera.setFreeLook(look, look ? dir : 0);
  game.setMove(look ? 0 : dir);
}

function setPaused(p: boolean) {
  paused = p;
  hud.setPaused(p);
}

/** Abilities that need a target point enter aim mode on click; the hammer casts at once. */
function beginAim(id: AbilityId) {
  hud.closeMenu();
  // in the world there is no aiming: runes go ahead of the Keeper
  if (inWorld()) { game.castAhead(id); return; }
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
const ALIAS: Record<string, string> = { г: 'u', ы: 's', й: 'q', ц: 'w', у: 'e', к: 'r', е: 't', а: 'f', ь: 'm', ф: 'a', в: 'd', и: 'b', м: 'v', п: 'g', ч: 'x' };

/** Release every held in-world verb (key up, window blur, a window opening). */
function releaseVerbs() {
  game.setPour(false);
  game.setTake(false);
  game.setSell(false);
}

/** In-world key presses (spec §3): S pour, W take, Q/E option, X sell, 1/2/3 runes ahead. */
function inWorldKey(k: string, e: KeyboardEvent) {
  if (e.repeat) return;
  // S or W at the Tablet stone opens the Tablet (spec §4)
  if ((k === 's' || k === 'arrowdown' || k === 'w' || k === 'arrowup') && game.focus()?.kind === 'stone') { hud.togglePanel('keeper'); return; }
  if (k === 's' || k === 'arrowdown') game.setPour(true);
  else if (k === 'w' || k === 'arrowup') game.setTake(true);
  else if (k === 'x') game.setSell(true);
  else if (k === 'q') game.cycleOption(-1);
  else if (k === 'e') game.cycleOption(1);
  else if (game.runeForKey(k)) game.castKey(k);
  else if (k === ' ') { e.preventDefault(); game.callNight(); }
  else if (k === 'f') { speed = nextSpeed(); hud.setSpeed(speed); }
  else if (k === '-' || k === '_') { speed = stepSpeed(-1); hud.setSpeed(speed); }
  else if (k === '=' || k === '+') { speed = stepSpeed(1); hud.setSpeed(speed); }
  else if (k === 'm') hud.setSound(audio.toggle());
  else if ((k === 'r' || k === 'b') && game.world.features.tablet) hud.togglePanel('keeper');
}

window.addEventListener('keydown', (e) => {
  if (metaOpen) return;
  const k = ALIAS[e.key.toLowerCase()] ?? e.key.toLowerCase();
  if (!started) {
    if (k === 'enter') { e.preventDefault(); (uiRoot.querySelector<HTMLButtonElement>('.screen [data-a=continue]') ?? uiRoot.querySelector<HTMLButtonElement>('.screen [data-a=micro]'))?.click(); }
    return;
  }
  if (hud.choiceOpen) { releaseVerbs(); hud.choiceKey(k); return; }
  if (k === 'escape') {
    releaseVerbs();
    if (view.aiming) cancelAim();
    else if (hud.menuOpen) hud.closeMenu();
    else if (!game.over) setPaused(!paused);
    return;
  }
  if (paused || game.over) return;
  held.add(k);
  updateMove();
  if (inWorld()) {
    // the open Tablet closes with R / B, or S / W again at the stone
    if (hud.panelOpen) { if (['r', 'b', 's', 'w', 'arrowdown', 'arrowup'].includes(k)) hud.togglePanel('keeper'); return; }
    inWorldKey(k, e);
    if (k === ' ' || k.startsWith('arrow')) e.preventDefault();
    return;
  }
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
  if (k === '-' || k === '_') { speed = stepSpeed(-1); hud.setSpeed(speed); }
  if (k === '=' || k === '+') { speed = stepSpeed(1); hud.setSpeed(speed); }
  if (k === 'm') hud.setSound(audio.toggle());
  if (k === 'r' || k === 'b') hud.togglePanel('keeper');
  if (k === 'v') game.revive('amber');
  if (k === 'g') game.revive('sacrifice');
  if (k === 't') hud.togglePanel('tree');
  if (k === 'x') {
    // «Жертва Света» needs two presses within 2 s
    const now = performance.now();
    if (now - sacrificeArmed < 2000) { sacrificeArmed = 0; game.sacrificeKeeper(); }
    else { sacrificeArmed = now; hud.observerSay('Нажми X ещё раз — Жертва Света: Хранитель взорвётся светом и падёт'); }
  }
  if (k === 'q') cycleNode(-1);
  if (k === 'e') cycleNode(1);
});
window.addEventListener('keyup', (e) => {
  const k = ALIAS[e.key.toLowerCase()] ?? e.key.toLowerCase();
  held.delete(k);
  if (inWorld()) {
    if (k === 's' || k === 'arrowdown') game.setPour(false);
    if (k === 'w' || k === 'arrowup') game.setTake(false);
    if (k === 'x') game.setSell(false);
  }
  // releasing the spear key lets go of the Piercing Beam
  if (ABILITY_KEYS[k] === 'spear') game.releaseBeam();
  updateMove();
});
window.addEventListener('blur', () => { held.clear(); updateMove(); releaseVerbs(); audio.setBackground(true); });
window.addEventListener('focus', () => { if (!document.hidden) audio.setBackground(false); });
// a hidden tab goes silent and, mid-run, pauses
document.addEventListener('visibilitychange', () => {
  audio.setBackground(document.hidden);
  if (document.hidden && started && !game.over && !paused) setPaused(true);
});

function toWorld(ev: MouseEvent): [number, number] {
  const r = canvas.getBoundingClientRect();
  return renderer!.camera.toWorld(ev.clientX - r.left, ev.clientY - r.top, r.width, r.height);
}
hud.setProjector((x, y) => renderer!.camera.toScreen(x, y, cssW, cssH));

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

canvas.addEventListener('mouseleave', () => hideWorldTip());
canvas.addEventListener('mousedown', () => hideWorldTip());
canvas.addEventListener('mousemove', (ev) => {
  const [mx, my] = toWorld(ev);
  view.mouseX = mx;
  view.mouseY = my;
  // in the world the mouse doesn't touch the world (spec §3)
  if (inWorld()) { view.hoverSlot = null; view.hoverTree = false; canvas.style.cursor = 'default'; hideWorldTip(); return; }
  const t = started && !game.over && !hud.choiceOpen ? pick(mx, my) : null;
  view.hoverSlot = t?.kind === 'slot' ? t.slotId : null;
  view.hoverTree = t?.kind === 'tree';
  canvas.style.cursor = view.aiming ? 'crosshair' : t ? 'pointer' : 'default';
  // what a click here will do
  if (!t || hud.target || hud.panelOpen) hideWorldTip();
  else if (t.kind === 'tree') showWorldTip('Древо Игг', 'Клик — рост Древа: вложи Янтарь, Древо вырастет, Круг света станет шире, откроются руны и слоты.', ev);
  else if (t.kind === 'slot') {
    const sl = SLOTS.find((x) => x.id === t.slotId)!;
    showWorldTip(sl.underground ? 'Корневой узел' : sl.crown ? 'Слот кроны' : 'Руна призыва',
      `Клик — призвать сюда ${sl.underground ? 'Паука-ткача (бьёт Червей под землёй)' : sl.crown ? 'гнездо кроны (сборщики, соты, лекари, улей)' : 'гнездо: улей, Светожук, стрекозы или термиты'}.`, ev);
  } else if (t.kind === 'structure') showWorldTip('Гнездо', 'Клик — улучшить: уровень, специализация, Слияние, Возвышение.', ev);
});

canvas.addEventListener('mousedown', (ev) => {
  if (!started || paused || game.over || hud.choiceOpen || inWorld()) return;
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
let acc = 0;
let time = 0;

function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  time += dt;
  // choices (dawn rune, tree branch) pause the world
  // hold-to-cast: a held rune key fires again as soon as the rune is ready;
  // the Piercing Beam is held while its key is down
  if (started && !paused && !game.over && !game.choice && !hud.target && !hud.tabletOpen) {
    for (const [key, id] of Object.entries(ABILITY_KEYS)) {
      if (!held.has(key)) continue;
      if (id === 'spear' && game.state.keeper.forms.spear === 'B') continue;
      if (inWorld()) { if (game.runeForKey(key) && game.abilityReady(id)) game.castKey(key); continue; }
      if (game.abilityReady(id)) game.cast(id, view.mouseX, view.mouseY);
    }
  }
  // in the world: the camera leans toward the object being poured into / taken from
  if (inWorld()) {
    const it = game.state.interact;
    const f = started && !game.over ? game.focus() : null;
    renderer!.camera.setFocus(f && (it.pour || it.take || it.sell) ? f.x : null);
    // a window that freezes time also lets go of the held verbs
    if (paused || game.choice) releaseVerbs();
  }
  const frozen = !started || paused || game.over || !!game.choice || metaOpen || hud.panelOpen || hud.ringOpen || hud.deathPause;
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
  hud.inRun = started;
  const events = game.drainEvents();
  // the Ascended falls or the Tree is in danger: back to normal speed so the moment isn't missed
  if (speed !== 1 && events.some((e) => e.type === 'keeperDown' || e.type === 'treeDanger')) { speed = 1; hud.setSpeed(1); }
  // save the run at every dawn; a lost run has nothing to continue
  if (events.some((e) => e.type === 'dawn')) storeRun();
  if (events.some((e) => e.type === 'lost')) dropRun();
  if (events.length) {
    renderer!.onEvents(events, game);
    hud.onEvents(events);
    audio.play(events);
    audio.setPhase(game.state.phase);
  }
  if (game.over && !endShown && started) {
    endShown = true;
    hud.closeMenu();
    const coins = finishRun();
    // let the Tree fall and its light go out before the summary
    setTimeout(() => hud.showEnd(coins, save.bestNight[game.path] ?? 0, lastRecord), 3600);
  }
  // paused worlds drift slowly; a lost run plays the Tree's fall in real time
  renderer!.render(game, view, time, frozen && started && !game.over ? dt * 0.15 : dt);
  hud.update(dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// debug hooks for automated playtests
(window as unknown as Record<string, unknown>).__igg = {
  get game() { return game; },
  get camera() { return renderer!.camera; },
  save,
  start: () => { if (!started) hud.hideTitle(); started = true; },
  startWorld: (w: WorldId) => startRun(w),
  setSpeed: (x: number) => { speed = x; },
};

// `?world=…`: straight into that world (after everything above is initialised)
if (urlWorld) startRun(urlWorld);
