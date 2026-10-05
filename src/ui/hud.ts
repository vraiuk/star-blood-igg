import { ABILITIES, KEEPER_RANKS, SLOTS, WORLD, type AbilityId } from '../data/balance';
import { NESTS, type Family, type NestStats, type Price, type SpecId } from '../data/nests';
import {
  KEEPER_RUNES, MAX_SLOTS, PROPERTIES, RUNE_RANKS, RUNE_RANK_COLORS, boonById, propertyById, type KeeperRuneId,
} from '../data/runes';
import { TREE_BRANCHES, TREE_STAGES } from '../data/tree';
import { ROOT_SLOT_Y } from '../render/sprites';
import type { Game } from '../sim/game';
import type { GameEvent } from '../sim/types';
import { icon } from './icons';

const AB_IDS: AbilityId[] = ['spear', 'hammer', 'starfall'];
const RUNE_IDS: KeeperRuneId[] = ['spear', 'hammer', 'starfall', 'light'];

export type MenuTarget =
  | { kind: 'slot'; slotId: string }
  | { kind: 'structure'; id: number }
  | { kind: 'tree' };

/** Range preview the renderer draws while hovering a ring option. */
export interface RangePreview { x: number; r: number; underground: boolean; }

export interface HudCallbacks {
  onStart(): void;
  onRestart(): void;
  onOpenMeta(): void;
  onCast(id: AbilityId): void;
  onCallNight(): void;
  onToggleSpeed(): void;
  onToggleSound(): void;
  onResume(): void;
  onMenuClosed(): void;
  onPreview(p: RangePreview | null): void;
}

const el = (tag: string, cls = '', html = '') => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
};

const priceHtml = (p: Price, g: Game) => {
  const a = p.amber ? `<span class="pa ${g.state.amber >= p.amber ? '' : 'no'}"><img src="${icon('amber')}">${p.amber}</span>` : '';
  const s = p.star ? `<span class="ps ${g.state.star >= p.star ? '' : 'no'}"><img src="${icon('star')}">${p.star}</span>` : '';
  return a + s || '<span class="pa">—</span>';
};

interface RingOpt {
  icon: string;
  title: string;
  sub: string;
  body: string;
  price: Price | null;
  ok: boolean;
  key: string;
  danger?: boolean;
  locked?: boolean;
  preview?: RangePreview;
  act: () => void;
}

/** DOM overlay. Reads game state; changes it only through Game commands. */
export class Hud {
  private root: HTMLElement;
  private amberNum!: HTMLElement;
  private starNum!: HTMLElement;
  private devNum!: HTMLElement;
  private lightFill!: HTMLElement;
  private hpFill!: HTMLElement;
  private shieldFill!: HTMLElement;
  private hpBar!: HTMLElement;
  private growFill!: HTMLElement;
  private caption!: HTMLElement;
  private track!: HTMLElement;
  private stageCount!: HTMLElement;
  private nightInfo!: HTMLElement;
  private abEls = {} as Record<AbilityId, { box: HTMLElement; cd: HTMLElement; lock: HTMLElement; charge: HTMLElement }>;
  private callBtn!: HTMLButtonElement;
  private speedBtn!: HTMLButtonElement;
  private soundBtn!: HTMLButtonElement;
  private keeperBtn!: HTMLElement;
  private ring!: HTMLElement;
  private card!: HTMLElement;
  private panel!: HTMLElement;
  private modal!: HTMLElement;
  private banner!: HTMLElement;
  private notice!: HTMLElement;
  private tip!: HTMLElement;
  private title!: HTMLElement;
  private end!: HTMLElement;
  private pause!: HTMLElement;
  private menuTarget: MenuTarget | null = null;
  private panelKind: 'tree' | 'keeper' | null = null;
  private ringSig = '';
  private panelSig = '';
  private modalSig = '';
  private ringOpts: RingOpt[] = [];
  private hoverOpt = -1;
  private lastAmber = -1;
  private lastStar = -1;
  private lastStage = -1;
  private bannerTimer = 0;
  private noticeTimer = 0;
  private tipsDone = new Set<string>();
  private seen = new Set<string>();
  private scale = 2;
  aiming: AbilityId | null = null;

  constructor(root: HTMLElement, private game: () => Game, private cb: HudCallbacks) {
    this.root = root;
    this.root.classList.add('title-mode');
    this.build();
  }

  setScale(s: number) { this.scale = s; }

  private project: (x: number, y: number) => [number, number] = (x, y) => [x * this.scale, y * this.scale];
  /** World → stage CSS px (provided by the camera). */
  setProjector(fn: (x: number, y: number) => [number, number]) { this.project = fn; }

  private build() {
    const r = this.root;
    const res = el('div', 'panel');
    res.id = 'res';
    res.innerHTML = `
      <div class="item" title="Янтарь — смола Игг. Гнёзда, уровни 1–3, рост Древа"><img class="icon" src="${icon('amber')}"><span class="num" id="amber">0</span></div>
      <div class="item" title="Звёздная Кровь — с Червей. Специализации, Свойства рун у Наблюдателя, ранги"><img class="icon" src="${icon('star')}"><span class="num star" id="star">0</span></div>
      <div class="item dev" title="Малые Руны Развития: открывают 4-й слот руны"><img class="icon" src="${icon('rune')}"><span class="num" id="dev">0</span></div>
      <div class="item" title="Свет Восходящего — на умения. У ствола Древа течёт быстрее, у края Круга — медленно"><img class="icon" src="${icon('light')}"><div class="lightbar"><i></i></div></div>`;
    r.appendChild(res);
    this.amberNum = res.querySelector('#amber')!;
    this.starNum = res.querySelector('#star')!;
    this.devNum = res.querySelector('#dev')!;
    this.lightFill = res.querySelector('.lightbar > i')!;

    const tb = el('div', 'panel plain hit');
    tb.id = 'treebar';
    tb.title = 'Древо Игг — клик: стадии и рост';
    tb.innerHTML = `
      <div class="medal"><img src="${icon('tree')}"></div>
      <div class="bar hp"><i></i><s></s><b></b></div>
      <div class="bar thin grow"><i></i></div>
      <div class="caption"></div>`;
    tb.addEventListener('mousedown', (e) => { e.stopPropagation(); this.togglePanel('tree'); });
    r.appendChild(tb);
    this.hpBar = tb.querySelector('.bar.hp')!;
    this.hpFill = tb.querySelector('.bar.hp > i')!;
    this.shieldFill = tb.querySelector('.bar.hp > s')!;
    this.growFill = tb.querySelector('.bar.grow > i')!;
    this.caption = tb.querySelector('.caption')!;

    const push = el('div', 'panel');
    push.id = 'push';
    push.title = 'Круг света: насколько Древо оттеснило тьму';
    push.innerHTML = `<div class="track"></div><span class="count"></span>`;
    r.appendChild(push);
    this.track = push.querySelector('.track')!;
    this.stageCount = push.querySelector('.count')!;
    this.nightInfo = el('div');
    this.nightInfo.id = 'night';
    r.appendChild(this.nightInfo);

    const abs = el('div');
    abs.id = 'abilities';
    AB_IDS.forEach((id) => {
      const def = ABILITIES[id];
      const box = el('div', `ab hit ${id === 'starfall' ? 'ult' : ''}`);
      box.title = `${def.name}: ${def.desc}`;
      box.innerHTML = `<img src="${icon(id)}"><div class="charge"></div><div class="cd"></div>
        <div class="lock"><img src="${icon('lock')}"><span>ст. ${def.unlockStage}</span></div>
        ${def.cost ? `<span class="cost">${def.cost}</span>` : ''}<span class="key">${def.key}</span>`;
      box.addEventListener('mousedown', (ev) => { ev.stopPropagation(); this.cb.onCast(id); });
      abs.appendChild(box);
      this.abEls[id] = { box, cd: box.querySelector('.cd')!, lock: box.querySelector('.lock')!, charge: box.querySelector('.charge')! };
    });
    r.appendChild(abs);

    const ctr = el('div');
    ctr.id = 'controls';
    this.keeperBtn = el('button', 'btn keeper', `<img src="${icon('rune')}"> Восходящий <span class="k">[R]</span>`);
    this.keeperBtn.addEventListener('mousedown', (e) => { e.stopPropagation(); this.togglePanel('keeper'); });
    this.speedBtn = el('button', 'btn', '×1') as HTMLButtonElement;
    this.speedBtn.title = 'Скорость [F]';
    this.speedBtn.onclick = () => this.cb.onToggleSpeed();
    this.soundBtn = el('button', 'btn', '♪') as HTMLButtonElement;
    this.soundBtn.title = 'Звук [M]';
    this.soundBtn.onclick = () => this.cb.onToggleSound();
    ctr.append(this.keeperBtn, this.speedBtn, this.soundBtn);
    r.appendChild(ctr);

    this.callBtn = el('button', 'btn gold', '') as HTMLButtonElement;
    this.callBtn.id = 'callnight';
    this.callBtn.onclick = () => this.cb.onCallNight();
    r.appendChild(this.callBtn);

    this.ring = el('div');
    this.ring.id = 'ring';
    this.ring.addEventListener('mousedown', (e) => e.stopPropagation());
    r.appendChild(this.ring);
    this.card = el('div', 'panel plain');
    this.card.id = 'card';
    r.appendChild(this.card);

    this.panel = el('div', 'panel plain side');
    this.panel.id = 'sidepanel';
    this.panel.addEventListener('mousedown', (e) => e.stopPropagation());
    r.appendChild(this.panel);

    this.banner = el('div');
    this.banner.id = 'banner';
    r.appendChild(this.banner);
    this.notice = el('div', 'tablet');
    this.notice.id = 'notice';
    r.appendChild(this.notice);
    this.tip = el('div');
    this.tip.id = 'tip';
    r.appendChild(this.tip);

    this.modal = el('div', 'screen modal hidden');
    this.modal.addEventListener('mousedown', (e) => e.stopPropagation());
    r.appendChild(this.modal);

    this.title = el('div', 'screen');
    r.appendChild(this.title);
    this.renderTitle();

    this.end = el('div', 'screen hidden');
    r.appendChild(this.end);

    this.pause = el('div', 'screen hidden');
    this.pause.id = 'pause';
    this.pause.innerHTML = `<div class="box"><h1>Пауза</h1><p>Тьма ждёт.</p><button class="btn gold">Продолжить</button></div>`;
    this.pause.querySelector('button')!.addEventListener('click', () => this.cb.onResume());
    r.appendChild(this.pause);
  }

  // ───────────────────────────── screens ─────────────────────────────

  renderTitle(pathName = 'Тропа Ростка', coins = 0) {
    this.title.innerHTML = `
      <div class="box">
        <div class="kicker">Земли Теней</div>
        <h1>Звёздная Кровь</h1>
        <h2>ДРЕВО ИГГ</h2>
        <p>«Каждое Игг-Древо — это форпост людей в борьбе против Червей.»<br>Восходящий, посади Семя у границы Теней, вырасти его в Великое Игг-Древо и держи Круг — сколько сможешь.</p>
        <div class="keys">
          <span><b>A / D</b> — ходить, собирать Янтарь и Кровь</span><span><b>Клик</b> по руне у земли — призвать гнездо</span>
          <span><b>1 2 3</b> — Копьё, Молот, Звездопад</span><span><b>Клик</b> по Древу — стадии и рост</span>
          <span><b>R</b> — Скрижаль: руны и лавка Наблюдателя</span><span><b>Пробел</b> — призвать ночь · <b>F</b> ×2 · <b>Esc</b></span>
        </div>
        <div class="row">
          <button class="btn gold" data-a="start">Хранить Древо</button>
          <button class="btn" data-a="meta"><img class="icon" src="${icon('tree')}"> Древо Игг · ${coins} Монет</button>
        </div>
        <div class="stat">${pathName}</div>
      </div>`;
    this.title.querySelector('[data-a=start]')!.addEventListener('click', () => this.cb.onStart());
    this.title.querySelector('[data-a=meta]')!.addEventListener('click', () => this.cb.onOpenMeta());
  }

  hideTitle() { this.title.classList.add('hidden'); this.root.classList.remove('title-mode'); }
  showTitle() { this.title.classList.remove('hidden'); this.root.classList.add('title-mode'); }
  setPaused(p: boolean) { this.pause.classList.toggle('hidden', !p); }
  setSpeed(x: number) { this.speedBtn.textContent = `×${x}`; }
  setSound(on: boolean) { this.soundBtn.textContent = on ? '♪' : '♪̸'; this.soundBtn.style.opacity = on ? '1' : '0.5'; }

  showEnd(coins: number, best: number, record: boolean) {
    const g = this.game();
    const s = g.state;
    const stars = g.stars();
    const won = stars > 0;
    const st = Array.from({ length: 3 }, (_, i) => `<span class="${i < stars ? 'on' : 'off'}">★</span>`).join('');
    this.end.innerHTML = `
      <div class="box">
        <h1>Древо угасло</h1>
        <h2>${record ? 'НОВЫЙ РЕКОРД · ' : ''}ПЕРЕЖИТО НОЧЕЙ: ${s.night} · РЕКОРД: ${best}</h2>
        ${won ? `<div class="stars">${st}</div><p class="stat">Звёзды за 10-ю ночь (Тот-Кто-Посадил-новое-Древо)</p>` : '<p>Тьма сомкнулась над Кругом до 10-й ночи.</p>'}
        <div class="tablet inline">Восходящий! Тот-Кто-Наблюдает награждает тебя: <b>+${coins} Монет</b>.</div>
        <div class="stat">Древо: <b>${TREE_STAGES[s.tree.stage].name}</b> · Тварей: <b>${s.stats.kills}</b> · Янтарь: <b>${s.stats.amberCollected}</b> · Звёздная Кровь: <b>${s.stats.starCollected}</b></div>
        <p class="stat">★ дожить до 10-й ночи · ★★ с Малым Игг-Древом · ★★★ с Великим Игг-Древом и здоровьем > 50%. Дальше — бесконечная ночь за рекордом.</p>
        <div class="row"><button class="btn gold" data-a="again">Ещё раз</button><button class="btn" data-a="meta"><img class="icon" src="${icon('tree')}"> Древо Игг</button></div>
      </div>`;
    this.end.querySelector('[data-a=again]')!.addEventListener('click', () => this.cb.onRestart());
    this.end.querySelector('[data-a=meta]')!.addEventListener('click', () => this.cb.onOpenMeta());
    this.end.classList.remove('hidden');
  }

  hideEnd() { this.end.classList.add('hidden'); }

  // ───────────────────────────── events ──────────────────────────────

  onEvents(events: GameEvent[]) {
    const g = this.game();
    for (const e of events) {
      switch (e.type) {
        case 'nightStart': {
          const def = g.night(e.night);
          this.showBanner(def.title, def.hint, true, 4.5);
          break;
        }
        case 'milestone':
          this.showBanner('Тот-Кто-Посадил-новое-Древо!', `Десять ночей позади. ${'★'.repeat(e.stars)} Дальше — Бесконечная ночь: держись за рекорд.`, false, 6);
          break;
        case 'dawn':
          this.showBanner('Рассвет', `Тьма отступила. Рассветный дар: +${e.gift} Янтаря`, false, 2.6);
          break;
        case 'treeGrew':
          this.showBanner(TREE_STAGES[e.stage].name, TREE_STAGES[e.stage].unlocks.join(' · '), false, 3.5);
          break;
        case 'treeHit':
          this.hpBar.classList.remove('hurt');
          void this.hpBar.offsetWidth;
          this.hpBar.classList.add('hurt');
          break;
        case 'denied': this.say(e.reason, true); break;
        case 'keeperDown': this.say('Восходящий пал. Возрождение у Древа через 6 с', true); break;
        case 'pickup':
          if (e.kind === 'star') this.once('star', 'Получена Звёздная Кровь. Обменяй её на специализацию гнезда или ранг Восходящего.');
          break;
        case 'rankUp': this.say(`Восходящий достиг ранга «${KEEPER_RANKS[e.rank].name}». Открыт слот руны.`); break;
        case 'shield': this.say('Нагрудник Светоносных закрыл Древо щитом!'); break;
        case 'secondWind': this.say('Второе дыхание! Древо вернулось из тьмы.'); break;
        case 'rune': {
          const p = propertyById(e.id);
          const b = boonById(e.id);
          if (p) this.say(`Свойство «${p.name}» вставлено в руну «${KEEPER_RUNES[p.rune].name}».`);
          else if (b) this.say(`Получена ${b.category} (${RUNE_RANKS[b.rank]}): «${b.name}».`);
          break;
        }
        case 'devRune': this.say('С Червя выпала Малая Руна Развития! Открой ею 4-й слот руны [R].'); break;
        case 'structureLost':
          if (this.menuTarget?.kind === 'structure' && !g.state.structures.some((s) => s.id === (this.menuTarget as { id: number }).id)) this.closeMenu();
          break;
        default: break;
      }
    }
  }

  private showBanner(title: string, hint: string, night: boolean, secs: number) {
    this.banner.className = night ? 'night show' : 'show';
    this.banner.innerHTML = `<div class="title">${title}</div><div class="rule"></div><div class="hint">${hint}</div>`;
    this.bannerTimer = secs;
  }

  /** The Observer's voice: an azure Tablet notice. */
  say(text: string, warn = false) {
    this.notice.className = `tablet show ${warn ? 'warn' : ''}`;
    this.notice.innerHTML = warn ? text : `<span class="who">Тот-Кто-Наблюдает:</span> ${text}`;
    this.noticeTimer = warn ? 1.6 : 4;
  }

  private once(key: string, text: string) {
    if (this.seen.has(key)) return;
    this.seen.add(key);
    this.say(text);
  }

  // ───────────────────────────── ring menu ───────────────────────────

  get menuOpen() { return this.menuTarget !== null || this.panelKind !== null; }
  get target() { return this.menuTarget; }

  openMenu(t: MenuTarget) {
    if (t.kind === 'tree') { this.closeMenu(); this.togglePanel('tree', true); return; }
    this.panelKind = null;
    this.panel.classList.remove('show');
    this.menuTarget = t;
    this.ringSig = '';
    this.hoverOpt = -1;
    this.ring.classList.add('show');
    this.renderRing();
  }

  closeMenu() {
    const had = this.menuTarget !== null || this.panelKind !== null;
    this.menuTarget = null;
    this.ring.classList.remove('show');
    this.card.classList.remove('show');
    this.panelKind = null;
    this.panel.classList.remove('show');
    this.cb.onPreview(null);
    if (had) this.cb.onMenuClosed();
  }

  /** Keyboard shortcut for the ring: key matches an option's hotkey. */
  ringKey(key: string): boolean {
    if (!this.menuTarget) return false;
    const i = this.ringOpts.findIndex((o) => o.key.toLowerCase() === key);
    if (i < 0) return false;
    this.ringOpts[i].act();
    this.ringSig = '';
    return true;
  }

  private statDelta(label: string, a: number | undefined, b: number | undefined, unit = '', fmt = (v: number) => String(Math.round(v))) {
    if (b === undefined && a === undefined) return '';
    if (a === undefined || a === 0) return `<div>${label}: <b class="up">${fmt(b!)}${unit}</b></div>`;
    if (b === undefined || Math.abs(a - b) < 0.01) return `<div>${label}: <b>${fmt(a)}${unit}</b></div>`;
    return `<div>${label}: <b>${fmt(a)}${unit}</b> → <b class="up">${fmt(b)}${unit}</b></div>`;
  }

  private statsBlock(fam: Family, cur: NestStats | null, next: NestStats) {
    const f = (v: number) => (v < 10 ? v.toFixed(1) : String(Math.round(v)));
    const pct = (v: number) => `${Math.round(v * 100)}`;
    const rows = [
      fam !== 'beetle' || next.damage ? this.statDelta('Урон', cur?.damage, next.damage || undefined, '', f) : '',
      next.rate ? this.statDelta('Раз в', cur?.rate, next.rate, ' с', (v) => v.toFixed(2)) : '',
      next.range && fam !== 'beetle' ? this.statDelta('Дальность', cur?.range, next.range) : '',
      next.light ? this.statDelta('Свет', cur?.light, next.light) : '',
      next.burn ? this.statDelta('Ожог', cur?.burn, next.burn, '/с', f) : '',
      next.slow ? this.statDelta('Замедление', cur?.slow, next.slow, '%', pct) : '',
      next.vuln ? this.statDelta('Высвечивание', cur?.vuln, next.vuln, '% урона', (v) => `+${Math.round(v * 100)}`) : '',
      next.heal ? this.statDelta('Лечит гнёзда', cur?.heal, next.heal, '/с') : '',
      next.volley ? this.statDelta('Целей', cur?.volley, next.volley) : '',
      next.pierce ? this.statDelta('Пробивает', cur?.pierce, next.pierce) : '',
      next.chain ? this.statDelta('Цепь', cur?.chain, next.chain) : '',
      next.poison ? this.statDelta('Яд', cur?.poison, next.poison, '/с', f) : '',
      next.stun ? this.statDelta('Оглушение', cur?.stun, next.stun, ' с', (v) => v.toFixed(1)) : '',
      next.thorns ? this.statDelta('Шипы', cur?.thorns, next.thorns, '', f) : '',
      next.regen ? this.statDelta('Лечение', cur?.regen, next.regen, '/с') : '',
      fam !== 'spider' ? this.statDelta('Прочность', cur?.hp, next.hp) : '',
    ];
    return `<div class="stats">${rows.join('')}</div>`;
  }

  private buildRingOptions(): { x: number; y: number; title: string; opts: RingOpt[] } | null {
    const g = this.game();
    const s = g.state;
    const t = this.menuTarget;
    if (!t) return null;
    const opts: RingOpt[] = [];
    if (t.kind === 'slot') {
      const slot = SLOTS.find((sl) => sl.id === t.slotId)!;
      const fams: Family[] = slot.underground ? ['spider'] : ['hive', 'beetle', 'dragonfly'];
      fams.forEach((fam, i) => {
        const def = NESTS[fam];
        const price = g.buildPrice(fam);
        const stats = g.nestStats({ family: fam, tier: 0, spec: null });
        opts.push({
          icon: icon(fam), title: def.name, sub: def.desc, key: String(i + 1),
          body: this.statsBlock(fam, null, stats), price, ok: g.canPay(price),
          preview: { x: slot.x, r: fam === 'dragonfly' ? stats.light! : stats.range, underground: slot.underground },
          act: () => { if (g.build(t.slotId, fam)) this.closeMenu(); },
        });
      });
      return { x: slot.x, y: slot.underground ? ROOT_SLOT_Y : WORLD.groundY - 10, title: slot.underground ? 'Корневой узел' : 'Руна призыва', opts };
    }
    if (t.kind !== 'structure') return null;
    const st = s.structures.find((q) => q.id === t.id);
    if (!st) return null;
    const def = NESTS[st.family];
    const cur = g.nestStats(st);
    const rng = (n: NestStats) => (st.family === 'dragonfly' ? n.light! : n.range);
    if (st.tier < 2 || st.tier === 3) {
      const price = g.upgradePrice(st)!;
      const next = g.nestStats({ family: st.family, tier: st.tier + 1, spec: st.spec });
      opts.push({
        icon: icon('upgrade'), title: st.tier === 3 ? `Мастерство: ${def.specs[st.spec!].name}` : `Уровень ${st.tier + 2}`,
        sub: st.tier === 3 ? 'Высшая форма специализации' : 'Сильнее и крепче', key: 'U',
        body: this.statsBlock(st.family, cur, next), price, ok: g.canPay(price),
        preview: { x: st.x, r: rng(next), underground: st.underground },
        act: () => { g.upgrade(st.id); },
      });
    }
    if (st.tier === 2) {
      (['A', 'B'] as SpecId[]).forEach((sp) => {
        const spec = def.specs[sp];
        const price = g.specPrice(st, sp);
        const next = g.nestStats({ family: st.family, tier: 3, spec: sp });
        opts.push({
          icon: icon(st.family), title: spec.name, sub: `${spec.desc} · <i>${spec.perk}</i>`, key: sp === 'A' ? 'Q' : 'E',
          body: this.statsBlock(st.family, cur, next), price, ok: g.canPay(price),
          preview: { x: st.x, r: rng(next), underground: st.underground },
          act: () => { g.specialize(st.id, sp); },
        });
      });
    }
    const sv = g.sellValue(st);
    opts.push({
      icon: icon('sell'), title: 'Отпустить', sub: 'Вернуть 60% вложенного', key: 'S', danger: true,
      body: '', price: sv, ok: true, act: () => { if (g.sell(st.id)) this.closeMenu(); },
    });
    const name = st.spec ? `${def.name}: ${def.specs[st.spec].name}` : def.name;
    const y = st.underground ? ROOT_SLOT_Y : WORLD.groundY - (st.family === 'beetle' ? 12 : 26);
    return { x: st.x, y, title: `${name} · ур. ${st.tier + 1}`, opts };
  }

  private renderRing() {
    const g = this.game();
    const data = this.buildRingOptions();
    if (!data) { this.closeMenu(); return; }
    this.ringOpts = data.opts;
    const sc = this.scale;
    const sig = data.title + data.opts.map((o) => o.title + o.ok + JSON.stringify(o.price)).join('|');
    if (sig !== this.ringSig) {
      this.ringSig = sig;
      const n = data.opts.length;
      const R = 30;
      // KR-style ring: options on an upper arc around the target
      const spread = n <= 1 ? 0 : Math.min(150, 50 * (n - 1));
      let html = `<div class="ring-title">${data.title}</div><div class="ring-circle"></div>`;
      data.opts.forEach((o, i) => {
        const ang = (-90 - spread / 2 + (n <= 1 ? 0 : (spread / (n - 1)) * i)) * (Math.PI / 180);
        const ox = Math.cos(ang) * R;
        const oy = Math.sin(ang) * R;
        html += `<div class="ropt ${o.ok ? '' : 'no'} ${o.danger ? 'danger' : ''}" data-i="${i}" style="left:calc(${ox} * var(--u));top:calc(${oy} * var(--u))">
          <img src="${o.icon}"><span class="rk">${o.key}</span>
          <span class="rp">${o.price ? priceHtml(o.price, g).replace(/<img[^>]*>/g, (m) => m) : ''}</span></div>`;
      });
      this.ring.innerHTML = html;
      this.ring.querySelectorAll<HTMLElement>('.ropt').forEach((node) => {
        const i = Number(node.dataset.i);
        node.addEventListener('mouseenter', () => { this.hoverOpt = i; this.showCard(); });
        node.addEventListener('mouseleave', () => { if (this.hoverOpt === i) { this.hoverOpt = -1; this.showCard(); } });
        node.addEventListener('click', () => {
          this.ringOpts[i]?.act();
          this.ringSig = '';
          if (this.menuTarget) this.renderRing();
          this.showCard();
        });
      });
    }
    const [px, py] = this.project(data.x, data.y);
    this.ring.style.left = `${px}px`;
    this.ring.style.top = `${py}px`;
    void sc;
    this.showCard();
  }

  private showCard() {
    const o = this.ringOpts[this.hoverOpt];
    if (!o || !this.menuTarget) {
      this.card.classList.remove('show');
      this.cb.onPreview(null);
      return;
    }
    const g = this.game();
    this.card.innerHTML = `<h4>${o.title}</h4><div class="sub">${o.sub}</div>${o.body}
      <div class="price-row">${o.price ? priceHtml(o.price, g) : ''}<span class="hk">[${o.key}]</span></div>`;
    const r = this.ring.getBoundingClientRect();
    const root = this.root.getBoundingClientRect();
    const cx = r.left - root.left;
    const top = r.top - root.top - 46 * this.scale;
    this.card.style.left = `${Math.max(80 * this.scale, Math.min(560 * this.scale, cx))}px`;
    this.card.style.top = `${Math.max(36 * this.scale, top)}px`;
    this.card.classList.add('show');
    this.cb.onPreview(o.preview ?? null);
  }

  // ───────────────────────────── side panels ─────────────────────────

  togglePanel(kind: 'tree' | 'keeper', force = false) {
    if (this.panelKind === kind && !force) { this.closeMenu(); return; }
    this.menuTarget = null;
    this.ring.classList.remove('show');
    this.card.classList.remove('show');
    this.panelKind = kind;
    this.panelSig = '';
    this.panel.classList.add('show');
    this.renderPanel();
  }

  private renderPanel() {
    const g = this.game();
    const s = g.state;
    let html = '';
    const actions: Array<() => void> = [];
    const btn = (label: string, ok: boolean, act: () => void, cls = 'gold') => {
      actions.push(act);
      return `<button class="btn ${ok ? cls : ''}" ${ok ? '' : 'disabled'} data-i="${actions.length - 1}">${label}</button>`;
    };
    if (this.panelKind === 'tree') {
      const need = g.growNeed();
      html += `<h3>Древо Игг</h3><div class="sub">Стадии роста — как ранги Восхождения</div><div class="ladder">`;
      TREE_STAGES.forEach((st, i) => {
        const state = i < s.tree.stage ? 'done' : i === s.tree.stage ? 'cur' : 'next';
        const br = TREE_BRANCHES[i];
        const chosen = br?.find((b) => s.tree.branches.includes(b.id));
        html += `<div class="step ${state}">
          <div class="dot">${i + 1}</div>
          <div class="body"><div class="nm">${st.name}</div>
            <div class="un">${st.unlocks.join(' · ')} · сила гнёзд ×${st.power}</div>
            ${br ? `<div class="br">Ветвь: ${chosen ? `<b>${chosen.name}</b>` : `<i>${br[0].name}</i> или <i>${br[1].name}</i>`}</div>` : ''}
            ${i === s.tree.stage + 1 ? `<div class="cost"><img class="icon" src="${icon('amber')}"> ${TREE_STAGES[s.tree.stage].growCost}</div>` : ''}
          </div></div>`;
      });
      html += `</div>`;
      if (need > 0) {
        const give = Math.min(need, s.amber);
        html += `<div class="growrow"><div class="bar thin grow"><i style="width:${(s.tree.growth / TREE_STAGES[s.tree.stage].growCost) * 100}%"></i></div>
          <span>${s.tree.growth} / ${TREE_STAGES[s.tree.stage].growCost}</span></div>`;
        html += `<div class="row">${btn(give >= need ? `Вырастить Древо (−${give})` : `Напитать (−${give})`, give > 0, () => { g.feed(give); })}
          ${btn('+10', s.amber >= 10 && need > 10, () => { g.feed(10); }, '')}</div>`;
      } else {
        html += `<div class="sub">Золотое Игг-Древо в полной силе.</div>`;
      }
    } else if (this.panelKind === 'keeper') {
      const k = s.keeper;
      const rank = KEEPER_RANKS[k.rank];
      const next = KEEPER_RANKS[k.rank + 1];
      html += `<h3>Скрижаль Восходящего</h3><div class="sub">Ранг: <b style="color:${RUNE_RANK_COLORS[k.rank]}">${rank.name}</b> · HP ${Math.ceil(k.hp)}/${g.keeperMaxHp()} · Свет ${g.maxLight()} · сила умений ×${rank.power}</div>`;
      html += `<div class="ranks">${KEEPER_RANKS.map((r, i) => `<span class="${i <= k.rank ? 'on' : ''}" style="--c:${RUNE_RANK_COLORS[i]}">${r.name}</span>`).join('<i></i>')}</div>`;
      if (next) html += `<div class="row">${btn(`Восхождение: ${next.name} (<img class="icon" src="${icon('star')}"> ${next.cost})`, s.star >= next.cost, () => { g.ascend(); })}</div>`;
      if (s.devRunes > 0) html += `<div class="sub hotline"><img class="icon" src="${icon('rune')}"> Малых Рун Развития: <b>${s.devRunes}</b> — нажми «+слот» у руны</div>`;
      html += `<div class="sub">Сокровищница Наблюдателя продаёт только Свойства. В руне 3 слота, 4-й открывает Малая Руна Развития.</div>`;
      for (const rid of RUNE_IDS) {
        const def = KEEPER_RUNES[rid];
        const unlocked = rid === 'light' || g.abilityUnlocked(rid);
        const props = g.runeProps(rid);
        const cap = k.slots[rid];
        html += `<div class="rblock ${unlocked ? '' : 'dim'}"><div class="rhead"><img src="${icon(def.icon)}"><b>${def.name}</b><span class="cap">${props.length}/${cap}</span>`;
        if (s.devRunes > 0 && cap < MAX_SLOTS) html += btn('+слот', true, () => { g.developRune(rid); }, 'tiny');
        html += `</div><div class="slots">`;
        for (let i = 0; i < cap; i++) {
          const p = props[i];
          html += p ? `<span class="slot full" style="--c:${RUNE_RANK_COLORS[p.rank]}" title="${p.desc}">${p.name}</span>` : `<span class="slot">пусто</span>`;
        }
        if (cap < MAX_SLOTS) html += `<span class="slot locked" title="Нужна Малая Руна Развития">+</span>`;
        html += `</div>`;
        if (unlocked) {
          html += `<div class="shop">`;
          for (const p of PROPERTIES.filter((x) => x.rune === rid)) {
            const owned = k.props[rid].filter((x) => x === p.id).length;
            const ok = g.canInstall(p) && s.star >= p.price;
            actions.push(() => { g.buyProperty(p.id); });
            html += `<div class="item ${ok ? '' : 'no'}" data-i="${actions.length - 1}" style="--c:${RUNE_RANK_COLORS[p.rank]}" title="${p.type} · ${RUNE_RANKS[p.rank]}">
              <span class="nm">${p.name}${p.stack > 1 ? ` <i>${owned}/${p.stack}</i>` : owned ? ' <i>✓</i>' : ''}</span><span class="ds">${p.desc}</span>
              <span class="pr ${s.star >= p.price ? '' : 'no'}"><img src="${icon('star')}">${p.price}</span></div>`;
          }
          html += `</div>`;
        } else {
          html += `<div class="sub">Откроется на стадии Древа ${ABILITIES[rid as AbilityId].unlockStage}</div>`;
        }
        html += `</div>`;
      }
      const boons = k.boons.map((id) => boonById(id)).filter((b): b is NonNullable<typeof b> => !!b);
      if (boons.length) {
        html += `<div class="sub">Руны-Существа:</div><div class="runes small">${boons.map((r) => `<div class="rune" style="--c:${RUNE_RANK_COLORS[r.rank]}"><img src="${icon(r.icon)}"><div><b>${r.name}</b><small>${r.desc}</small></div></div>`).join('')}</div>`;
      }
    }
    html += `<button class="close">✕</button>`;
    if (html !== this.panelSig) {
      this.panelSig = html;
      this.panel.innerHTML = html;
      this.panel.querySelectorAll<HTMLElement>('button[data-i], .item[data-i]').forEach((b) => {
        b.addEventListener('click', () => { actions[Number(b.dataset.i)](); this.panelSig = ''; this.renderPanel(); });
      });
      this.panel.querySelector('.close')!.addEventListener('click', () => this.closeMenu());
    }
  }

  // ───────────────────────────── choice modal ────────────────────────

  get choiceOpen() { return !this.modal.classList.contains('hidden'); }

  private renderChoice() {
    const g = this.game();
    const c = g.choice;
    if (!c || g.over) {
      if (!this.modal.classList.contains('hidden')) { this.modal.classList.add('hidden'); this.modalSig = ''; }
      return;
    }
    const sig = JSON.stringify(c);
    if (sig === this.modalSig) return;
    this.modalSig = sig;
    this.closeMenu();
    let html = '';
    if (c.kind === 'dawn') {
      html = `<div class="tablet big"><div class="orbit-wrap"><div class="orbit">${'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃ'.split('').map((r, i) => `<span style="--i:${i}">${r}</span>`).join('')}</div></div>
        <div class="who">Скрижаль · Тот-Кто-Наблюдает</div>
        <h3>Восходящий! Ночь пережита.</h3><div class="sub">Рулетка Наблюдателя: выбери одну награду. Свойство встанет в свободный слот руны.</div>
        <div class="cards">${c.offers.map((id, i) => {
          const p = propertyById(id);
          const b = boonById(id);
          const rank = p ? p.rank : b!.rank;
          const ic = p ? KEEPER_RUNES[p.rune].icon : b!.icon;
          const cat = p ? `${p.type} → ${KEEPER_RUNES[p.rune].name}` : b!.category;
          return `<div class="rcard" data-i="${i}" style="--c:${RUNE_RANK_COLORS[rank]}">
            <div class="rank">${RUNE_RANKS[rank]}</div><img src="${icon(ic)}"><div class="cat">${cat}</div>
            <div class="nm">${p ? p.name : b!.name}</div><div class="ds">${p ? p.desc : b!.desc}</div><div class="hk">[${i + 1}]</div></div>`;
        }).join('')}</div></div>`;
    } else {
      const pair = TREE_BRANCHES[c.stage];
      html = `<div class="branch-box"><div class="who">${TREE_STAGES[c.stage].name}</div>
        <h3>Древо растёт. Куда пустить новую ветвь?</h3><div class="sub">Выбор навсегда для этого забега.</div>
        <div class="cards two">${pair.map((b, i) => `<div class="rcard gold" data-i="${i}">
          <img src="${icon('tree')}"><div class="nm">${b.name}</div><div class="ds">${b.desc}</div><div class="hk">[${i + 1}]</div></div>`).join('')}</div></div>`;
    }
    this.modal.innerHTML = html;
    this.modal.classList.remove('hidden');
    this.modal.querySelectorAll<HTMLElement>('.rcard').forEach((n) => {
      n.addEventListener('click', () => { g.choose(Number(n.dataset.i)); this.modalSig = ''; this.renderChoice(); });
    });
  }

  /** Number keys while a choice is open. */
  choiceKey(key: string): boolean {
    if (!this.choiceOpen) return false;
    const i = Number(key) - 1;
    if (Number.isInteger(i) && i >= 0 && i < 3) {
      this.game().choose(i);
      this.modalSig = '';
      this.renderChoice();
    }
    return true;
  }

  // ───────────────────────────── per-frame ───────────────────────────

  update(dt: number) {
    const g = this.game();
    const s = g.state;
    const stage = TREE_STAGES[s.tree.stage];

    if (s.amber !== this.lastAmber) {
      if (s.amber > this.lastAmber && this.lastAmber >= 0) this.bump(this.amberNum);
      this.amberNum.textContent = String(s.amber);
      this.lastAmber = s.amber;
    }
    if (s.star !== this.lastStar) {
      if (s.star > this.lastStar && this.lastStar >= 0) this.bump(this.starNum);
      this.starNum.textContent = String(s.star);
      this.lastStar = s.star;
    }
    this.lightFill.style.width = `${(s.keeper.light / g.maxLight()) * 100}%`;
    this.devNum.textContent = String(s.devRunes);
    (this.devNum.parentElement as HTMLElement).style.display = s.devRunes > 0 ? '' : 'none';
    this.lightFill.parentElement!.classList.toggle('near', g.lightRegenFactor() > 1.2);
    this.lightFill.parentElement!.classList.toggle('far', g.lightRegenFactor() < 0.6);
    const maxHp = g.treeMaxHp();
    this.hpFill.style.width = `${(Math.max(0, s.tree.hp) / maxHp) * 100}%`;
    this.shieldFill.style.width = `${Math.min(100, (s.tree.shield / maxHp) * 100)}%`;
    const need = stage.growCost;
    this.growFill.style.width = need ? `${(s.tree.growth / need) * 100}%` : '100%';
    const pct = Math.round((Math.max(0, s.tree.hp) / maxHp) * 100);
    const canGrow = need > 0 && s.amber >= g.growNeed();
    this.caption.innerHTML = `${stage.name} · ${pct}%${need ? ` <span class="dim">· рост ${s.tree.growth}/${need}</span>` : ''}${canGrow ? ' <span class="hot">· к росту!</span>' : ''}`;

    if (s.tree.stage !== this.lastStage) {
      this.lastStage = s.tree.stage;
      let h = '';
      for (let i = 0; i < TREE_STAGES.length; i++) {
        if (i > 0) h += `<span class="seg ${i <= s.tree.stage ? 'on' : ''}"></span>`;
        h += `<img src="${icon(i <= s.tree.stage ? 'tree' : 'treeDim')}">`;
      }
      this.track.innerHTML = h;
      this.stageCount.textContent = `${s.tree.stage + 1}/${TREE_STAGES.length}`;
    }

    const total = g.campaignNights;
    if (s.phase === 'day') {
      this.nightInfo.innerHTML = `День · до ночи <span class="t">${Math.ceil(s.dayLeft)}с</span> · ночь ${s.night + 1}${s.night < total ? `/${total}` : ' · ∞'}`;
      this.callBtn.classList.remove('hidden');
      this.callBtn.innerHTML = `Призвать ночь <span style="opacity:.75">[Пробел] +${Math.floor(s.dayLeft)}</span>`;
    } else {
      const left = s.enemies.length + s.pending.length;
      this.nightInfo.innerHTML = s.phase === 'night' ? `${g.night(s.night).title}${s.night < total ? ` · ${s.night + 1}/${total}` : ' · ∞'} · тварей: <span class="t">${left}</span>` : '';
      this.callBtn.classList.add('hidden');
    }

    for (const id of AB_IDS) {
      const def = ABILITIES[id];
      const { box, cd, lock, charge } = this.abEls[id];
      const unlocked = g.abilityUnlocked(id);
      lock.style.display = unlocked ? 'none' : 'grid';
      const c = s.keeper.cooldowns[id];
      cd.style.height = `${(c / def.cooldown) * 100}%`;
      let ready: boolean;
      if (id === 'starfall') {
        const ch = s.keeper.charge / ABILITIES.starfall.chargeMax;
        charge.style.height = `${ch * 100}%`;
        ready = unlocked && ch >= 1 && c <= 0;
      } else {
        ready = unlocked && c <= 0 && (s.keeper.light >= g.abilityCost(id) || s.keeper.freeCast > 0) && s.keeper.alive;
        box.classList.toggle('nolight', unlocked && s.keeper.light < g.abilityCost(id) && s.keeper.freeCast <= 0);
      }
      box.classList.toggle('ready', ready);
      box.classList.toggle('aim', this.aiming === id);
    }
    const slotsFree = RUNE_IDS.some((r) => (r === 'light' || g.abilityUnlocked(r)) && PROPERTIES.some((p) => p.rune === r && s.star >= p.price && g.canInstall(p)));
    const canAscend = !!KEEPER_RANKS[s.keeper.rank + 1] && s.star >= KEEPER_RANKS[s.keeper.rank + 1].cost;
    this.keeperBtn.classList.toggle('hot', canAscend || slotsFree || s.devRunes > 0);
    this.keeperBtn.title = `Ранг ${KEEPER_RANKS[s.keeper.rank].name}${slotsFree ? ' · можно купить Свойство' : ''}`;

    if (this.menuTarget) this.renderRing();
    if (this.panelKind) this.renderPanel();
    this.renderChoice();

    this.bannerTimer -= dt;
    if (this.bannerTimer <= 0) this.banner.classList.remove('show');
    this.noticeTimer -= dt;
    if (this.noticeTimer <= 0) this.notice.classList.remove('show');
    this.updateTips(g);
  }

  private bump(n: HTMLElement) {
    n.classList.remove('bump');
    void n.offsetWidth;
    n.classList.add('bump');
  }

  /** Context tips (the Observer's tutorial) for the first minutes. */
  private updateTips(g: Game) {
    const s = g.state;
    const done = (k: string) => this.tipsDone.has(k);
    const mark = (k: string) => this.tipsDone.add(k);
    if (s.structures.length > 0) mark('build');
    if (s.stats.amberCollected > 0) mark('collect');
    if (s.tree.stage > 0 || s.stats.amberToTree > 0) mark('feed');
    if (s.keeper.cooldowns.spear > 0) mark('spear');
    if (s.structures.some((x) => x.tier > 0)) mark('upgrade');
    if (s.structures.some((x) => x.spec)) mark('spec');
    if (s.structures.some((x) => x.family === 'spider')) mark('spider');
    if (Object.values(s.keeper.props).some((a) => a.length > 0)) mark('shop');
    let text = '';
    const nestT2 = s.structures.find((x) => x.tier === 2);
    if (g.over || this.bannerTimer > 0.5 || this.choiceOpen) text = '';
    else if (!done('build')) text = 'Кликни по золотой <b>руне</b> у Древа — призови гнездо светоносных. <kbd>A</kbd>/<kbd>D</kbd> — ходить';
    else if (s.phase === 'night' && s.night === 0 && !done('spear')) text = '<kbd>1</kbd> — Копьё Игг-Света летит к курсору. Бьёт и во тьме';
    else if (s.drops.length > 0 && !done('collect')) text = 'Янтарь подбирает Восходящий — подойди к каплям (<kbd>A</kbd>/<kbd>D</kbd>)';
    else if (s.phase === 'day' && !done('feed') && s.amber >= g.growNeed() && s.night >= 1) text = 'Кликни по <b>Древу</b>: стадии роста открывают умения, руны и силу гнёзд';
    else if (s.night >= 1 && s.phase === 'day' && !done('spider')) text = 'Черви ползут под землёй — призови <b>Паука-ткача</b> на корневой узел';
    else if (s.star >= 6 && !this.tipsDone.has('shop') && s.phase === 'day') { text = '<kbd>R</kbd> — Скрижаль: купи у Наблюдателя Свойства для рун за Звёздную Кровь'; }
    else if (nestT2 && s.star >= 4 && !done('spec')) text = 'Гнездо 3 ур. можно <b>специализировать</b> — кликни по нему (нужна Звёздная Кровь)';
    else if (s.phase === 'day' && s.amber >= 60 && !done('upgrade') && s.night >= 1) text = 'Кликни по гнезду, чтобы усилить его <kbd>U</kbd>';
    if (this.tip.innerHTML !== text) this.tip.innerHTML = text;
  }
}
