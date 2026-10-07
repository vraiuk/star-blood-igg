import { ABILITIES, ATTR_MAX, ATTRIBUTES, CHORD, EXCHANGE, KEEPER_RANKS, SLOTS, WORLD, attrCost, crownPos, type AbilityId, type AttrId } from '../data/balance';
import { ASPECT, type Aspect, NEST_ROLE, MAX_TIER, NESTS, type Family, type NestStats, type Price, type SpecId } from '../data/nests';
import {
  APOTHEOSIS_RANK, DEV_SLOTS, FORM_RANK, KEEPER_RUNES, MAX_SLOTS, PROPERTIES, RUNE_FORMS, RUNE_RANKS, RUNE_RANK_COLORS, runeRankCost, runeRankName,
  runeRankPower, runeColor, boonById, facetById, propertyById, removeCost, runeRankCd, runeRankLight, PROP_MAX_LV, propLvFactor, propUpgradable, propUpgradeCost, FACETS, FACET_MAX, FACET_RANKS, type FormId, type KeeperRuneId,
} from '../data/runes';
import { PATH_CAPSTONE, TREE_BRANCHES, TREE_PATHS, TREE_STAGES, branchById, pathCounts, type TreePath } from '../data/tree';
import type { Game } from '../sim/game';
import { VERSION_LABEL } from '../version';
import { gloss, installGlossary } from './glossary';
import type { GameEvent } from '../sim/types';
import { icon } from './icons';
import { QUESTS } from './quests';

/** Roman numerals for facet levels */
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI'];
const AB_IDS: AbilityId[] = ['spear', 'hammer', 'starfall', 'radiance', 'swarm', 'timestop'];
const RUNE_IDS: KeeperRuneId[] = ['spear', 'hammer', 'starfall', 'radiance', 'swarm', 'timestop', 'light'];

export type MenuTarget =
  | { kind: 'slot'; slotId: string }
  | { kind: 'structure'; id: number }
  | { kind: 'tree' };

/** Range preview the renderer draws while hovering a ring option. */
export interface RangePreview { x: number; r: number; underground: boolean; y?: number; merge?: { to: number; from: number[] } }

export interface HudCallbacks {
  onStart(): void;
  onRestart(): void;
  onOpenMeta(): void;
  onOpenStats(): void;
  onContinue(): void;
  onFeedback(): void;
  onGiveUp(): void;
  onCast(id: AbilityId): void;
  onCallNight(): void;
  onToggleSpeed(): void;
  onSpeed(step: 1 | -1): void;
  onQuitToMenu(): void;
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
  /** fixed place on the arc, so buttons never swap under the cursor */
  pos?: number;
  /** build option of this family: gets a − ★N + stepper for merge stars */
  fam?: Family;
  act: () => void;
}

/** DOM overlay. Reads game state; changes it only through Game commands. */
export class Hud {
  private root: HTMLElement;
  private amberNum!: HTMLElement;
  private starNum!: HTMLElement;
  private devNum!: HTMLElement;
  private khpFill!: HTMLElement;
  private khpText!: HTMLElement;
  private lightFill!: HTMLElement;
  private hpFill!: HTMLElement;
  private shieldFill!: HTMLElement;
  private hpBar!: HTMLElement;
  private growFill!: HTMLElement;
  private caption!: HTMLElement;
  private track!: HTMLElement;
  private stageCount!: HTMLElement;
  private nightInfo!: HTMLElement;
  private abTip!: HTMLElement;
  private chordEl!: HTMLElement;
  private abEls = {} as Record<AbilityId, { box: HTMLElement; cd: HTMLElement; lock: HTMLElement; charge: HTMLElement; cdt: HTMLElement; wasReady: boolean }>;
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
  private reviveBox!: HTMLElement;
  private questBox!: HTMLElement;
  private questIdx = 0;
  private questSig = '';
  private reviveSig = '';
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
      <div class="item" data-tip-title="Янтарь" data-tip="Смола Игг: падает с тварей, гусеницы и соты приносят её сами.<br><b>Тратится на:</b> новые гнёзда и их уровни, рост Древа (клик по Древу), годичные кольца, Возвышение гнёзд, воскрешение Хранителя."><img class="icon" src="${icon('amber')}"><span class="num" id="amber">0</span></div>
      <div class="item" data-tip-title="Звёздная Кровь" data-tip="Роняют Черви (крупные — больше).<br><b>Тратится на:</b> изучение и Повышение рун, Свойства у Наблюдателя (Скрижаль, R), специализации гнёзд, ранги и атрибуты Хранителя."><img class="icon" src="${icon('star')}"><span class="num star" id="star">0</span></div>
      <div class="item dev" data-tip-title="Малая Руна Развития" data-tip="Редкий дар с Червей. Открывает 4-й слот Свойства у любой руны или поднимает атрибут Хранителя (Скрижаль, R)."><img class="icon" src="${icon('rune')}"><span class="num" id="dev">0</span></div>
      <div class="item bars" data-tip-title="Здоровье и Свет" data-tip="Верхняя полоса — здоровье Хранителя, нижняя — <b>Свет</b>: его тратят руны. Свет восполняется сам и <b>быстрее всего у ствола Древа</b> — вернись к Древу, если Света мало.">
        <div class="kbar hp"><i></i><span></span></div>
        <div class="lightbar"><i></i></div></div>`;
    r.appendChild(res);
    this.amberNum = res.querySelector('#amber')!;
    this.starNum = res.querySelector('#star')!;
    this.devNum = res.querySelector('#dev')!;
    this.lightFill = res.querySelector('.lightbar > i')!;
    this.khpFill = res.querySelector('.kbar.hp > i')!;
    this.khpText = res.querySelector('.kbar.hp > span')!;

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
      box.addEventListener('mouseenter', () => this.showAbTip(id, box));
      box.addEventListener('mouseleave', () => this.abTip.classList.add('hidden'));
      box.innerHTML = `<img src="${icon(id)}"><div class="charge"></div><div class="cd"></div><span class="cdt"></span>
        <div class="lock"><img src="${icon('lock')}"><span class="lk">ст. ${def.unlockStage}</span></div>
        ${def.cost ? `<span class="cost">${def.cost}</span>` : ''}<span class="key">${def.key}</span>`;
      box.addEventListener('mousedown', (ev) => {
        ev.stopPropagation();
        // a rune not learned yet: open the Tablet right on it (that's where it's learned)
        if (!this.game().abilityUnlocked(id)) { this.openTabletAt(id); return; }
        this.cb.onCast(id);
      });
      abs.appendChild(box);
      this.abEls[id] = { box, cd: box.querySelector('.cd')!, lock: box.querySelector('.lock')!, charge: box.querySelector('.charge')!, cdt: box.querySelector('.cdt')!, wasReady: false };
    });
    r.appendChild(abs);
    this.chordEl = el('div', 'chord hidden');
    abs.appendChild(this.chordEl);
    this.abTip = el('div', 'abtip hidden');
    r.appendChild(this.abTip);

    const ctr = el('div');
    ctr.id = 'controls';
    this.keeperBtn = el('button', 'btn keeper', `<img src="${icon('rune')}"> Восходящий <span class="k">[R]</span>`);
    this.keeperBtn.addEventListener('mousedown', (e) => { e.stopPropagation(); this.togglePanel('keeper'); });
    // speed: − ×N + (no wrap-around from ×2 to ×5 by accident)
    const slower = el('button', 'btn spd', '−') as HTMLButtonElement;
    slower.dataset.tip = 'Медленнее [−]';
    slower.onclick = () => this.cb.onSpeed(-1);
    this.speedBtn = el('button', 'btn spdval', '×1') as HTMLButtonElement;
    this.speedBtn.dataset.tipTitle = 'Скорость игры';
    this.speedBtn.dataset.tip = 'Кнопки − и + (или клавиши − и +) меняют скорость: 1 · 1.25 · 1.5 · 2 · 5.';
    const faster = el('button', 'btn spd', '+') as HTMLButtonElement;
    faster.dataset.tip = 'Быстрее [+]';
    faster.onclick = () => this.cb.onSpeed(1);
    this.soundBtn = el('button', 'btn', '♪') as HTMLButtonElement;
    this.soundBtn.title = 'Звук [M]';
    this.soundBtn.onclick = () => this.cb.onToggleSound();
    ctr.append(this.keeperBtn, slower, this.speedBtn, faster, this.soundBtn);
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
    this.questBox = el('div', 'panel plain');
    this.questBox.id = 'quest';
    r.appendChild(this.questBox);
    this.reviveBox = el('div', 'panel plain hit');
    this.reviveBox.id = 'revive';
    this.reviveBox.addEventListener('mousedown', (e) => e.stopPropagation());
    r.appendChild(this.reviveBox);

    this.modal = el('div', 'screen modal hidden');
    installGlossary(r);
    this.modal.addEventListener('mousedown', (e) => e.stopPropagation());
    r.appendChild(this.modal);

    this.title = el('div', 'screen');
    r.appendChild(this.title);
    this.renderTitle();

    this.end = el('div', 'screen hidden');
    r.appendChild(this.end);

    this.pause = el('div', 'screen hidden');
    this.pause.id = 'pause';
    this.pause.innerHTML = `<div class="box"><h1>Пауза</h1><p>Тьма ждёт.</p><button class="btn gold" data-a="resume">Продолжить</button>
      <div class="row"><button class="btn" data-a="menu">Выйти в меню</button></div></div>
      <button class="btn giveup" data-a="giveup" title="Завершить забег: Древо падёт, Монеты Наблюдателя начислятся как обычно">Уйти в Вечность</button>`;
    this.pause.querySelector('[data-a=resume]')!.addEventListener('click', () => this.cb.onResume());
    this.pause.querySelector('[data-a=menu]')!.addEventListener('click', () => this.cb.onQuitToMenu());
    // tucked into a corner and needs a second click — never pressed by accident
    const give = this.pause.querySelector<HTMLButtonElement>('[data-a=giveup]')!;
    let armed = 0;
    give.addEventListener('click', () => {
      if (performance.now() - armed > 3000) {
        armed = performance.now();
        give.textContent = 'Точно? Нажми ещё раз';
        give.classList.add('armed');
        setTimeout(() => { if (performance.now() - armed >= 3000) { give.textContent = 'Уйти в Вечность'; give.classList.remove('armed'); } }, 3100);
        return;
      }
      give.textContent = 'Уйти в Вечность';
      give.classList.remove('armed');
      this.cb.onGiveUp();
    });
    r.appendChild(this.pause);
  }

  // ───────────────────────────── screens ─────────────────────────────

  renderTitle(pathName = 'Тропа Ростка', coins = 0, cont = '') {
    this.title.innerHTML = `
      <div class="box">
        <div class="kicker">Земли Теней</div>
        <h1>Звёздная Кровь</h1>
        <h2>ДРЕВО ИГГ</h2>
        <p>«Каждое Игг-Древо — это форпост людей в борьбе против Червей.»<br>Восходящий, посади Семя у границы Теней, вырасти его в Великое Игг-Древо и держи Круг — сколько сможешь.</p>
        <div class="keys">
          <span><b>A / D</b> — ходить, собирать Янтарь и Кровь</span><span><b>Клик</b> по руне у земли — призвать гнездо</span>
          <span><b>1–6</b> — руны Хранителя</span><span><b>Клик</b> по Древу — стадии и рост</span>
          <span><b>Q / E</b> — переключать гнёзда и руны призыва · <b>1–4</b> — действие в меню</span>
          <span><b>X ×2</b> — Жертва Света: последний шанс спасти Древо</span>
          <span><b>R</b> — Скрижаль: руны и лавка Наблюдателя</span><span><b>Пробел</b> — призвать ночь · <b>F</b> ×2 · <b>Esc</b></span>
        </div>
        <div class="row">
          ${cont ? `<button class="btn gold" data-a="continue">Продолжить · ${cont}</button>` : ''}
          <button class="btn ${cont ? '' : 'gold'}" data-a="start">${cont ? 'Новый забег' : 'Хранить Древо'}</button>
          <button class="btn" data-a="meta"><img class="icon" src="${icon('tree')}"> Древо Игг · ${coins} Монет</button>
          <button class="btn" data-a="stats">Статистика</button>
          <button class="btn" data-a="feedback" data-tip="Написать автору: что понравилось, что сломано, чего хочется дальше">Отзыв · что дальше?</button>
        </div>
        <div class="stat">${pathName}</div>
        <div class="ver">${VERSION_LABEL}</div>
      </div>`;
    this.title.querySelector('[data-a=start]')!.addEventListener('click', () => this.cb.onStart());
    this.title.querySelector('[data-a=continue]')?.addEventListener('click', () => this.cb.onContinue());
    this.title.querySelector('[data-a=feedback]')?.addEventListener('click', () => this.cb.onFeedback());
    this.title.querySelector('[data-a=meta]')!.addEventListener('click', () => this.cb.onOpenMeta());
    this.title.querySelector('[data-a=stats]')!.addEventListener('click', () => this.cb.onOpenStats());
  }

  /** Online co-op: no Observer's tasks (their rewards would pay out once per player), time never stops for one player. */
  coop = false;
  resetQuests() { this.questIdx = this.coop ? QUESTS.length : 0; this.questSig = ''; }

  hideTitle() { this.title.classList.add('hidden'); this.root.classList.remove('title-mode'); this.inRun = true; }
  showTitle() { this.title.classList.remove('hidden'); this.root.classList.add('title-mode'); this.inRun = false; this.modal.classList.add('hidden'); this.modalSig = ''; }
  /** a run is under way (the title is gone): only then may choices pop up */
  inRun = false;
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
        <p class="stat">★ дожить до 10-й ночи · ★★ с Игг-Древом · ★★★ с Великим Игг-Древом и здоровьем > 50%. Дальше — бесконечная ночь за рекордом.</p>
        <div class="row"><button class="btn gold" data-a="again">Ещё раз</button><button class="btn" data-a="meta"><img class="icon" src="${icon('tree')}"> Древо Игг</button>
          <button class="btn" data-a="feedback" data-tip="Отзыв автору с данными этого забега: что было интересно, где застрял, чего не хватило">Оставить отзыв</button></div>
      </div>`;
    this.end.querySelector('[data-a=again]')!.addEventListener('click', () => this.cb.onRestart());
    this.end.querySelector('[data-a=meta]')!.addEventListener('click', () => this.cb.onOpenMeta());
    this.end.querySelector('[data-a=feedback]')!.addEventListener('click', () => this.cb.onFeedback());
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
        case 'rush':
          this.showBanner(`Натиск! ${g.night(e.night).title}`, `Тьма идёт без передышки. +${e.amber} Янтаря, +${e.star} Звёздной Крови · рассвет отложен`, true, 3.5);
          break;
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
        case 'keeperDown': this.say('Восходящий пал! Четверть Звёздной Крови рассыпалась на месте гибели.', true); break;
        case 'pickup':
          if (e.kind === 'star') this.once('star', 'Получена Звёздная Кровь. Обменяй её на специализацию гнезда или ранг Восходящего.');
          break;
        case 'rankUp': this.say(`Восходящий достиг ранга «${KEEPER_RANKS[e.rank].name}». Открыт слот руны.`); break;
        case 'shield': this.say('Нагрудник Светоносных закрыл Древо щитом!'); break;
        case 'secondWind': this.say('Второе дыхание! Древо вернулось из тьмы.'); break;
        case 'rune': {
          const p = propertyById(e.id);
          const b = boonById(e.id);
          if (e.id.startsWith('propUp:')) {
            this.say(`Свойство «${propertyById(e.id.slice(7))?.name ?? ''}» прокачано.`);
          } else if (e.id.startsWith('rank:')) {
            const rid = e.id.slice(5) as KeeperRuneId;
            this.say(`Руна «${KEEPER_RUNES[rid].name}» повышена до ранга «${runeRankName(g.state.keeper.runeRank[rid])}».`);
          } else if (e.id.startsWith('slot:')) {
            this.say(`В руне «${KEEPER_RUNES[e.id.slice(5) as KeeperRuneId].name}» открыт новый слот Свойства.`);
          } else if (e.id.startsWith('facetUp:')) {
            const f = facetById(e.id.slice(8));
            this.say(`Огранка: Грань «${f?.name ?? ''}» стала сильнее — уровень ${ROMAN[g.facetLv(e.id.slice(8))]}.`);
          } else if (e.id.startsWith('facet:')) {
            this.say(`Грань «${facetById(e.id.slice(6))?.name ?? ''}» повёрнута.`);
          } else if (e.id.startsWith('learn:')) {
            this.say(`Восходящий изучил руну «${ABILITIES[e.id.slice(6) as AbilityId].name}».`);
          } else if (e.id.startsWith('form:')) {
            const [, rid, f] = e.id.split(':') as [string, 'spear' | 'hammer' | 'starfall', FormId];
            this.say(`Руна «${KEEPER_RUNES[rid].name}» приняла Форму «${RUNE_FORMS[rid][f].name}».`);
          } else if (p) this.say(`Свойство «${p.name}» вставлено в руну «${KEEPER_RUNES[p.rune].name}».`);
          else if (b) this.say(`Получена ${b.category} (${RUNE_RANKS[b.rank]}): «${b.name}».`);
          break;
        }
        case 'wrath':
          this.say(e.up ? `Гнев Тьмы растёт: твари ×${e.value.toFixed(2)}. Круг слишком силён — Тьма отвечает.` : `Гнев Тьмы стихает: ×${e.value.toFixed(2)}.`, e.up);
          break;
        case 'tunnelOpen':
          if (!this.once('tunnel', 'Червь прорыл Лаз! Твари ныряют в него и выходят за строем. Встань Хранителем на выход (красная метка) — он засыплет Лаз; Игг-Молот обрушит его сразу.')) this.say('Червь прорыл Лаз за строем!', true);
          break;
        case 'treeDanger':
          this.showBanner('Древо в опасности!', 'Хранитель, защити Древо любой ценой. Крайняя мера — Жертва Света [X ×2]: взрыв света отбросит тварей.', true, 3.5);
          break;
        case 'sacrifice':
          this.say('Жертва Света! Хранитель пал, отбросив тьму. Воскрешение этой ночью втрое дороже.', true);
          break;
        case 'plateBreak':
          if (!this.once('plates', 'Панцирь Тирана сбит! Тварь обнажена: броня пропала, урон по ней +25%.')) this.say('Панцирь Тирана сбит!');
          break;
        case 'tunnelSealed': if (e.by !== 'worn') this.say(e.by === 'hammer' ? 'Молот обрушил Лаз — твари внутри засыпаны.' : 'Хранитель засыпал Лаз.'); break;
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
    this.callout(text);
  }

  /**
   * When the Observer talks about a part of the interface, that part blinks for a few
   * seconds, so the player sees where to click (the Tablet, the Tree, a rune, Light…).
   */
  private callout(text: string) {
    const plain = text.replace(/<[^>]+>/g, ' ');
    const rules: Array<[RegExp, string]> = [
      [/Скрижал|\[R\]|Повышени|Восхождени|Свойств|Грань|Грани|Огранк|изучи|Изучи/, '.btn.keeper'],
      [/Древ[оа] (?:раст|выр)|Вырасти Древо|вложи Янтарь|рост Древа|кольц|Уклон|ветв|Обмен/, '#treebar'],
      [/[Пп]ризов[иу] ночь|[Пп]ризвать ночь|Натиск|Пробел/, '#callnight'],
      [/Копь/, '#abilities .ab:nth-child(1)'],
      [/Молот/, '#abilities .ab:nth-child(2)'],
      [/Звездопад|Сверхзвезд/, '#abilities .ab:nth-child(3)'],
      [/Сияни/, '#abilities .ab:nth-child(4)'],
      [/Зов Роя/, '#abilities .ab:nth-child(5)'],
      [/Остановк/, '#abilities .ab:nth-child(6)'],
      [/Янтар/, '#res .item:nth-child(1)'],
      [/Звёздн(?:ая|ой|ую) Кров/, '#res .item:nth-child(2)'],
      [/Руна Развития|Руны Развития|Руной Развития/, '#res .item.dev'],
      [/Свет[ау]?(?![а-яё])|здоровь/, '#res .item.bars'],
      [/[Сс]корост/, '#controls .spdval'],
    ];
    for (const [re, sel] of rules) {
      if (!re.test(plain)) continue;
      const el = document.querySelector(sel) as HTMLElement | null;
      if (!el) continue;
      el.classList.remove('callout');
      void el.offsetWidth;
      el.classList.add('callout');
      const prev = this.calloutTimers.get(el);
      if (prev) clearTimeout(prev);
      this.calloutTimers.set(el, setTimeout(() => el.classList.remove('callout'), 4500));
    }
  }
  private calloutTimers = new Map<HTMLElement, ReturnType<typeof setTimeout>>();

  /** Rich hover card of an ability: what it does now, with live numbers. */
  private showAbTip(id: AbilityId, box: HTMLElement) {
    const g = this.game();
    const k = g.state.keeper;
    const def = ABILITIES[id];
    const rr = k.runeRank[id];
    const mult = g.abilityMult(id);
    const form = id === 'spear' || id === 'hammer' || id === 'starfall' ? k.forms[id] : null;
    const formDef = form ? RUNE_FORMS[id as 'spear' | 'hammer' | 'starfall'][form] : null;
    const rows: Array<[string, string]> = [];
    const n0 = (v: number) => String(Math.round(v));
    if (id === 'spear') {
      if (form === 'B') rows.push(['Управление', `<b style="color:#ffe58a">удерживай ${ABILITIES.spear.key}</b>`], ['Урон луча', `${n0((ABILITIES.spear.damage * 2.2 * mult) / 1.6)} в секунду`], ['Тянет Света', `${n0(g.abilityCost('spear') * 1.6)} в секунду`]);
      else if (form === 'A') rows.push(['Урон', `${n0(ABILITIES.spear.damage * 0.8 * mult)} × 5 копий`]);
      else rows.push(['Урон', n0(ABILITIES.spear.damage * mult)], ['Пробивает', `${ABILITIES.spear.pierce + g.mods.spearPierce + (rr >= 1 ? 1 : 0) + (rr >= 3 ? 1 : 0)} тварей`]);
    } else if (id === 'hammer') {
      rows.push(['Прыжок', `до ${n0(ABILITIES.hammer.leap * g.runeArea('hammer'))} (к курсору)`], ['Урон', n0(ABILITIES.hammer.damage * mult)], ['Радиус', n0(ABILITIES.hammer.radius * (1 + g.mods.hammerRadius) * g.runeArea('hammer'))], ['Оглушение', `${ABILITIES.hammer.stun} с`], ['Ломает броню', `${ABILITIES.hammer.armorBreak} с`]);
    } else if (id === 'starfall') {
      rows.push(['Урон звезды', n0(ABILITIES.starfall.damage * mult)], ['Звёзд', String(ABILITIES.starfall.meteors + g.mods.starfallMeteors)], ['Заряд', `${Math.floor(k.charge)}/${ABILITIES.starfall.chargeMax} (убийства)`]);
    } else if (id === 'radiance') {
      rows.push(['Длительность', `${(ABILITIES.radiance.duration * g.runeArea('radiance')).toFixed(1)} с`], ['Круг', `+${Math.round(ABILITIES.radiance.radius * 100)}%`], ['Ожог Червей', `×${ABILITIES.radiance.burn}`]);
    } else if (id === 'timestop') {
      rows.push(['Время стоит', `${(ABILITIES.timestop.duration * g.runeArea('timestop')).toFixed(1)} с (боссы вдвое меньше)`], ['Восстановление', `${ABILITIES.timestop.nights} ноч.${k.timeStopNights ? ` · осталось ${k.timeStopNights}` : ''}`]);
    } else {
      rows.push(['Длительность', `${(ABILITIES.swarm.duration * g.runeArea('swarm')).toFixed(1)} с`], ['Охват', n0(g.swarmReach())], ['Ускорение гнёзд', `+${Math.round(ABILITIES.swarm.haste * 100)}%`]);
    }
    if (def.cost) rows.push(['Свет', String(g.abilityCost(id))]);
    if (id !== 'starfall' && id !== 'timestop') rows.push(['Перезарядка', `${g.abilityCooldown(id).toFixed(1)} с`]);
    const props = g.runeProps(id);
    const facets = k.facets.map((f) => facetById(f)).filter((f) => f && f.rune === id);
    const locked = !g.abilityUnlocked(id);
    this.abTip.innerHTML = `<div class="hd"><img src="${icon(id)}"><div><b>${def.name}</b><span style="color:${runeColor(rr)}">${runeRankName(rr)} · сила ×${runeRankPower(rr).toFixed(2)}</span></div><span class="key">${def.key}</span></div>
      <div class="ds">${formDef ? `<b>${formDef.name}:</b> ${formDef.desc}` : def.desc}</div>
      ${locked ? `<div class="lockline">${g.abilityAvailable(id) ? `Изучить в Скрижали [R] за ★${def.learn} или даром Наблюдателя` : `Откроется на стадии Древа ${def.unlockStage}`}</div>` : ''}
      <div class="st">${rows.map(([a, b]) => `<span>${a}</span><b>${b}</b>`).join('')}</div>
      ${props.length ? `<div class="tags">${props.map((p) => `<i style="--c:${RUNE_RANK_COLORS[p.rank]}">${p.name}</i>`).join('')}</div>` : ''}
      ${facets.length ? `<div class="tags">${facets.map((f) => `<i style="--c:#b48cff">◆ ${f!.name}</i>`).join('')}</div>` : ''}`;
    const r = box.getBoundingClientRect();
    const pr = this.abTip.parentElement!.getBoundingClientRect();
    this.abTip.classList.remove('hidden');
    const w = this.abTip.offsetWidth;
    this.abTip.style.left = `${Math.max(8, Math.min(pr.width - w - 8, r.left - pr.left + r.width / 2 - w / 2))}px`;
    this.abTip.style.bottom = `${pr.bottom - r.top + 10}px`;
  }

  /** Open the Keeper's Tablet scrolled to one rune's block (learn / promote it there). */
  openTabletAt(rid: KeeperRuneId) {
    this.togglePanel('keeper', true);
    requestAnimationFrame(() => {
      const el = this.panel.querySelector(`[data-rune="${rid}"]`) as HTMLElement | null;
      if (!el) return;
      el.scrollIntoView({ block: 'center' });
      el.classList.add('flashrune');
      setTimeout(() => el.classList.remove('flashrune'), 1400);
    });
  }

  /** A one-off Observer line from outside (e.g. key confirmations). */
  observerSay(text: string) { this.say(text, true); }

  /** Show a tip only the first time; returns whether it was shown. */
  private once(key: string, text: string): boolean {
    if (this.seen.has(key)) return false;
    this.seen.add(key);
    this.say(text);
    return true;
  }

  // ───────────────────────────── ring menu ───────────────────────────

  get menuOpen() { return this.menuTarget !== null || this.panelKind !== null; }
  /** The Ascended just fell: time stands until the player chooses. */
  private deathHold = false;
  private deathSeen = false;
  get deathPause() { return this.deathHold; }
  releaseDeath() { this.deathHold = false; this.reviveSig = ''; }

  /** The Keeper's Tablet freezes time so runes can be bought calmly in a crowded night. */
  get tabletOpen() { return this.panelKind === 'keeper'; }
  /** Any side panel (Tablet or the Tree) stops time so it can be read calmly. */
  get panelOpen() { return this.panelKind !== null; }
  /** A nest's / slot's ring menu is open: time stands while you decide on an upgrade. */
  get ringOpen() { return this.menuTarget !== null && this.menuTarget.kind !== 'tree'; }
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
    this.ringAnimKey = '';
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
  private sellArmed = -1e9;
  private dawnSeenAt = -1;
  /** the node the ring last opened on (its pop-in animation plays once per node) */
  private ringAnimKey = '';
  /** merge stars a new nest of each family is built with (the − ★N + steppers) */
  private buildStars: Partial<Record<Family, number>> = {};
  ringKey(key: string): boolean {
    if (!this.menuTarget) return false;
    const i = this.ringOpts.findIndex((o) => o.key.toLowerCase() === key && !o.locked);
    if (i < 0) return false;
    // releasing a nest from the keyboard needs a second press (no accidental sales)
    if (this.ringOpts[i].danger && performance.now() - this.sellArmed > 1500) {
      this.sellArmed = performance.now();
      this.say('Нажми 4 ещё раз, чтобы отпустить гнездо');
      return true;
    }
    this.ringOpts[i].act();
    this.ringSig = '';
    return true;
  }

  private statDelta(label: string, a: number | undefined, b: number | undefined, unit = '', fmt = (v: number) => String(Math.round(v))) {
    if (b === undefined && !a) return '';
    if (a === undefined || a === 0) return `<div>${label}: <b class="up">${fmt(b!)}${unit}</b></div>`;
    if (b === undefined || Math.abs(a - b) < 0.01) return `<div>${label}: <b>${fmt(a)}${unit}</b></div>`;
    return `<div>${label}: <b>${fmt(a)}${unit}</b> → <b class="up">${fmt(b)}${unit}</b></div>`;
  }

  private statsBlock(fam: Family, cur: NestStats | null, next: NestStats) {
    const f = (v: number) => (v < 10 ? v.toFixed(1) : String(Math.round(v)));
    const pct = (v: number) => `${Math.round(v * 100)}`;
    const rows = [
      next.damage || cur?.damage ? this.statDelta('Урон', cur?.damage || undefined, next.damage || undefined, '', f) : '',
      next.rate ? this.statDelta('Раз в', cur?.rate, next.rate, ' с', (v) => v.toFixed(2)) : '',
      next.range && fam !== 'beetle' ? this.statDelta(fam === 'caterpillar' || fam === 'termite' ? 'Охват' : 'Дальность', cur?.range, next.range) : '',
      next.light ? this.statDelta('Свет', cur?.light, next.light) : '',
      next.burn ? this.statDelta('Ожог', cur?.burn, next.burn, '/с', f) : '',
      next.slow ? this.statDelta('Замедление', cur?.slow, next.slow, '%', pct) : '',
      next.vuln ? this.statDelta('Высвечивание', cur?.vuln, next.vuln, '% урона', (v) => `+${Math.round(v * 100)}`) : '',
      next.heal ? this.statDelta('Лечит гнёзда', cur?.heal, next.heal, '/с') : '',
      next.workers ? this.statDelta('Сборщиц', cur?.workers, next.workers) : '',
      next.carry ? this.statDelta('Капель за ходку', cur?.carry, next.carry) : '',
      next.soldiers ? this.statDelta('Воинов', cur?.soldiers, next.soldiers) : '',
      next.income ? this.statDelta('Янтарь', cur?.income, next.income, '/с', (v) => v.toFixed(1)) : '',
      next.starIncome ? this.statDelta('Кровь', cur?.starIncome, next.starIncome, '/с', (v) => v.toFixed(2)) : '',
      next.healTree ? this.statDelta('Лечит Древо', cur?.healTree, next.healTree, '/с') : '',
      next.soldierHp ? this.statDelta('HP воина', cur?.soldierHp, next.soldierHp) : '',
      next.respawn ? this.statDelta('Вылупление', cur?.respawn, next.respawn, ' с') : '',
      next.speed ? this.statDelta('Скорость', cur?.speed, next.speed) : '',
      next.bonus ? this.statDelta('К добыче', cur?.bonus, next.bonus, '%', (v) => `+${Math.round(v * 100)}`) : '',
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
      const fams: Family[] = slot.underground ? ['spider'] : slot.crown ? ['hive', 'caterpillar', 'honeycomb', 'mender'] : ['hive', 'beetle', 'dragonfly', 'termite'];
      // each option has its own − ★N + stepper: build a nest already merged (★ = three fused)
      fams.forEach((fam, i) => {
        const stars = this.buildStars[fam] ?? 0;
        const def = NESTS[fam];
        const price = g.priceStars(fam, stars);
        const stats = g.nestStats({ family: fam, tier: 0, spec: null, merge: stars });
        opts.push({
          fam, icon: icon(fam), title: def.name + (stars ? ` ${'★'.repeat(stars)}` : ''),
          sub: `<b class="role">${NEST_ROLE[fam]}</b><br>${def.desc}${stars ? ` · сразу со ${'★'.repeat(stars)} — как ${Math.pow(3, stars)} гнёзд, слитых в одно` : ''}`, key: String(i + 1),
          body: this.statsBlock(fam, null, stats), price, ok: g.canPay(price),
          preview: { x: slot.x, r: fam === 'dragonfly' ? stats.light! : stats.range, underground: slot.underground, y: slot.y },
          // after building, stay on the same node: its upgrade menu opens right away
          act: () => {
            if (!g.buildStars(t.slotId, fam, stars)) return;
            const built = g.structureAt(t.slotId);
            if (built) this.openMenu({ kind: 'structure', id: built.id });
            else this.closeMenu();
          },
        });
      });
      const cp = slot.crown ? crownPos(s.tree.stage, Number(slot.id.slice(1)), s.tree.rings) : null;
      return { x: cp ? cp.x : slot.x, y: cp ? cp.y : slot.underground ? slot.y : WORLD.groundY - 10, title: slot.underground ? 'Корневой узел' : slot.crown ? 'Слот кроны Древа' : 'Руна призыва', opts };
    }
    if (t.kind !== 'structure') return null;
    const st = s.structures.find((q) => q.id === t.id);
    if (!st) return null;
    const def = NESTS[st.family];
    const cur = g.nestStats(st);
    const rng = (n: NestStats) => (st.family === 'dragonfly' ? n.light! : n.range);
    if (st.tier < 1 || st.tier === 2) {
      const price = g.upgradePrice(st)!;
      const next = g.nestStats({ family: st.family, tier: st.tier + 1, spec: st.spec, merge: st.merge, ascend: st.ascend, asp: st.asp });
      opts.push({
        icon: icon('upgrade'), title: st.tier === 2 ? `Мастерство: ${def.specs[st.spec!].name}` : `Уровень ${st.tier + 2}`,
        sub: st.tier === 2 ? 'Высшая форма специализации' : 'Сильнее и крепче', key: '1',
        body: this.statsBlock(st.family, cur, next), price, ok: g.canPay(price),
        preview: { x: st.x, r: rng(next), underground: st.underground, y: st.y },
        pos: 0,
        act: () => { g.upgrade(st.id); },
      });
    }
    if (st.tier === 1) {
      (['A', 'B'] as SpecId[]).forEach((sp) => {
        const spec = def.specs[sp];
        const price = g.specPrice(st, sp);
        const next = g.nestStats({ family: st.family, tier: 2, spec: sp, merge: st.merge, ascend: st.ascend, asp: st.asp });
        opts.push({
          icon: icon(st.family), title: spec.name, sub: `${spec.desc} · <i>${spec.perk}</i>`, key: sp === 'A' ? '1' : '2',
          body: this.statsBlock(st.family, cur, next), price, ok: g.canPay(price),
          preview: { x: st.x, r: rng(next), underground: st.underground, y: st.y },
          pos: sp === 'A' ? 0 : 1,
          act: () => { g.specialize(st.id, sp); },
        });
      });
    }
    const partners = g.mergePartners(st);
    if (partners) {
      opts.push({
        icon: icon('merge'), title: `Слияние ★${st.merge + 1}`, sub: 'Три одинаковых гнезда → одно: сила ×2, освобождает 2 слота', key: '3',
        body: (() => {
          const res = g.mergeResult(st, partners);
          const nm = (x: { tier: number; spec: SpecId | null; ascend: number }) => `ур.${x.tier + 1}${x.spec ? ` ${def.specs[x.spec].name}` : ''}${x.ascend ? ` +${x.ascend}` : ''}`;
          const next = g.nestStats({ family: st.family, tier: res.tier, spec: res.spec, merge: res.merge, ascend: res.ascend, asp: st.asp });
          // honest comparison: three nests together vs the one that remains
          const dps = (n: NestStats) => (n.damage * (n.volley ?? 1)) / Math.max(0.1, n.rate || 1) + (n.burn ?? 0);
          const now3 = [st, ...partners].reduce((acc, x) => acc + dps(g.nestStats(x)), 0);
          const after = dps(next);
          const cmp = now3 > 0 ? `<div>Урон в секунду: сейчас 3 гнезда <b>${Math.round(now3)}</b> → после <b class="${after >= now3 ? 'up' : 'down'}">${Math.round(after)}</b></div>
            <div style="opacity:.8">${after < now3 ? 'Одно гнездо слабее трёх, но освобождает 2 слота, а каждое улучшение в нём теперь стоит ×2.1.' : 'Одно сильнее трёх и освобождает 2 слота.'}</div>` : '';
          return `<div class="stats"><div>Поглотит: <b>${partners.map(nm).join(' и ')}</b></div>
            <div>Останется: <b class="up">${nm(res)} ${'★'.repeat(res.merge)}</b> — лучшее из трёх</div>${cmp}</div>${this.statsBlock(st.family, cur, next)}`;
        })(),
        price: { amber: 0, star: 0 }, ok: true, pos: 2, act: () => { g.mergeNests(st.id); },
        // hovering shows which two nests will be absorbed
        preview: { x: st.x, r: 0, underground: st.underground, y: st.y, merge: { to: st.id, from: partners.map((p) => p.id) } },
      });
    }
    if (st.tier >= MAX_TIER - 1) {
      const c = g.ascendCost(st);
      const next = g.nestStats({ family: st.family, tier: st.tier, spec: st.spec, merge: st.merge, ascend: st.ascend + 1, asp: st.asp });
      opts.push({
        icon: icon('upgrade'), title: `Возвышение ${st.ascend + 1}`, sub: 'Бесконечный рост: +12% силы', key: '1', pos: 0,
        body: this.statsBlock(st.family, cur, next), price: { amber: c, star: 0 }, ok: g.state.amber >= c, act: () => { g.ascendNest(st.id); },
      });
    }
    // the ring always has the same four buttons in the same places; what isn't available
    // yet is shown greyed with what it needs
    const lockedOpt = (pos: number, key: string, ic: string, title: string, sub: string): RingOpt => ({
      icon: ic, title, sub, key, body: '', price: null, ok: false, locked: true, pos, act: () => {},
    });
    if (!opts.some((o) => o.pos === 0)) opts.push(lockedOpt(0, '1', icon('upgrade'), 'Улучшение', 'Гнездо на пределе'));
    if (!opts.some((o) => o.pos === 1)) {
      opts.push(lockedOpt(1, '2', icon(st.family), st.tier < 1 ? 'Специализация' : `Другая ветвь: ${def.specs[st.spec === 'A' ? 'B' : 'A'].name}`,
        st.tier < 1 ? 'На 2-м уровне гнездо выбирает одну из двух специализаций (1 или 2)' : 'Специализация выбрана — другую ветвь не взять'));
    }
    if (!opts.some((o) => o.pos === 2)) {
      const same = s.structures.filter((o) => o !== st && o.family === st.family && o.merge === st.merge && o.crown === st.crown).length;
      opts.push(lockedOpt(2, '3', icon('merge'), `Слияние ★${st.merge + 1}`,
        `Нужно 3 гнезда «${def.name}» с одинаковым числом ★ (сейчас ${same + 1} из 3). Два сольются в это: урон и прочность ×2.1, +6% дальности, освобождаются 2 слота`));
    }
    const sv = g.sellValue(st);
    opts.push({
      icon: icon('sell'), title: 'Отпустить', sub: 'Вернуть 60% вложенного · с клавиатуры — нажми 4 дважды', key: '4', danger: true,
      body: '', price: sv, ok: true, pos: 3, act: () => { if (g.sell(st.id)) this.closeMenu(); },
    });
    // one notation each: «ур. N (+A)» for the level, ★ for merges
    const name = (st.spec ? `${def.name}: ${def.specs[st.spec].name}` : def.name) + (st.merge ? ` ${'★'.repeat(st.merge)}` : '');
    const y = st.underground || st.crown ? st.y : WORLD.groundY - (st.family === 'beetle' ? 12 : 26);
    return { x: st.x, y, title: `${name} · ур. ${st.tier + 1}${st.ascend ? ` +${st.ascend}` : ''}`, opts };
  }

  private renderRing() {
    const g = this.game();
    const data = this.buildRingOptions();
    if (!data) { this.closeMenu(); return; }
    this.ringOpts = data.opts;
    const sc = this.scale;
    const tgt = this.menuTarget?.kind === 'structure' ? g.state.structures.find((x) => x.id === (this.menuTarget as { id: number }).id) : undefined;
    const sig = data.title + JSON.stringify(this.buildStars) + JSON.stringify(tgt?.asp ?? null) + (tgt ? Math.floor(g.state.amber) : '')
      + data.opts.map((o) => o.title + o.ok + JSON.stringify(o.price)).join('|');
    if (sig !== this.ringSig) {
      this.ringSig = sig;
      const fixed = data.opts.every((o) => o.pos !== undefined);
      const n = fixed ? 4 : data.opts.length;
      // the build ring is roomier: every option has a − ★N + stepper under its price
      const building = data.opts.some((o) => o.fam);
      const R = building ? 44 : 30;
      // KR-style ring: options on an upper arc around the target
      const spread = n <= 1 ? 0 : Math.min(building ? 170 : 150, (building ? 58 : 50) * (n - 1));
      let html = `<div class="ring-title">${data.title} <span style="opacity:.6">⏸</span></div><div class="ring-circle"></div>`;
      data.opts.forEach((o, i) => {
        const at = fixed ? o.pos! : i;
        const ang = (-90 - spread / 2 + (n <= 1 ? 0 : (spread / (n - 1)) * at)) * (Math.PI / 180);
        const ox = Math.cos(ang) * R;
        const oy = Math.sin(ang) * R;
        html += `<div class="ropt ${o.ok ? '' : 'no'} ${o.locked ? 'locked' : ''} ${o.danger ? 'danger' : ''}" data-i="${i}" style="left:calc(${ox} * var(--u));top:calc(${oy} * var(--u))">
          <img src="${o.icon}"><span class="rk">${o.key}</span>
          <span class="rp">${o.price ? priceHtml(o.price, g).replace(/<img[^>]*>/g, (m) => m) : ''}</span></div>`;
      });
      // point upgrades under a built nest's ring: ⚔ damage · ◎ reach · ⚡ speed
      if (this.menuTarget?.kind === 'structure') {
        const st = g.state.structures.find((x) => x.id === (this.menuTarget as { id: number }).id);
        if (st) {
          html += `<div class="aspects" style="top:calc(18 * var(--u))">${(['dmg', 'rng', 'spd'] as Aspect[]).map((key) => {
            const a = ASPECT[key];
            const lv = st.asp?.[key] ?? 0;
            const cost = g.aspectCost(st, key);
            return `<button class="aspect ${g.state.amber >= cost ? '' : 'no'}" data-asp="${key}" data-tip-title="${a.icon} ${a.name} · ур. ${lv} → ${lv + 1}" data-tip="${a.desc}. Точечное улучшение: дешевле Возвышения, но качает только это.">${a.icon}${lv ? `<i>${lv}</i>` : ''}<span><img class="icon" src="${icon('amber')}">${cost}</span></button>`;
          }).join('')}</div>`;
        }
      }
      // − ★N + under every build option
      data.opts.forEach((o, i) => {
        if (!o.fam) return;
        const ang = (-90 - spread / 2 + (n <= 1 ? 0 : (spread / (n - 1)) * i)) * (Math.PI / 180);
        const n0 = this.buildStars[o.fam] ?? 0;
        const ox = Math.cos(ang) * R, oy = Math.sin(ang) * R;
        // ★N above the icon, + / − stacked on its left
        html += `<div class="starlbl ${n0 ? 'on' : ''}" data-tip-title="Звёзды Слияния" data-tip="С каким числом ★ строится это гнездо. Меняется кнопками ▲ ▼ слева." style="left:calc(${ox} * var(--u));top:calc(${oy - 16} * var(--u))">★${n0}</div>
          <div class="starstep" style="left:calc(${ox - 15} * var(--u));top:calc(${oy} * var(--u))">
          <button data-fam="${o.fam}" data-d="1" data-tip-title="Звёзды Слияния ▲" data-tip="Построить сразу со звездой: каждая ★ — как 3 гнезда, слитых в одно (урон и прочность ×2.1). Цена ×3 за звезду.">▲</button>
          <button data-fam="${o.fam}" data-d="-1" ${n0 > 0 ? '' : 'disabled'} data-tip="Меньше звёзд">▼</button></div>`;
      });
      // the pop-in animation plays only when the menu opens on a new node — re-renders
      // (prices, ★ steppers, affordability) must not make every button blink
      const key = JSON.stringify(this.menuTarget);
      this.ring.classList.toggle('still', key === this.ringAnimKey);
      this.ringAnimKey = key;
      this.ring.innerHTML = html;
      this.ring.querySelectorAll<HTMLButtonElement>('.aspect').forEach((b) => {
        b.addEventListener('mousedown', (ev) => ev.stopPropagation());
        b.addEventListener('click', (ev) => {
          ev.stopPropagation();
          const t = this.menuTarget;
          if (t?.kind === 'structure') g.upgradeAspect(t.id, b.dataset.asp as Aspect);
          this.ringSig = '';
          this.renderRing();
        });
      });
      this.ring.querySelectorAll<HTMLButtonElement>('.starstep button').forEach((b) => {
        b.addEventListener('mousedown', (ev) => ev.stopPropagation());
        b.addEventListener('click', (ev) => {
          ev.stopPropagation();
          const fam = b.dataset.fam as Family;
          this.buildStars[fam] = Math.max(0, (this.buildStars[fam] ?? 0) + Number(b.dataset.d));
          this.ringSig = '';
          this.renderRing();
        });
      });
      this.ring.querySelectorAll<HTMLElement>('.ropt').forEach((node) => {
        const i = Number(node.dataset.i);
        node.addEventListener('mouseenter', () => { this.hoverOpt = i; this.showCard(); });
        node.addEventListener('mouseleave', () => { if (this.hoverOpt === i) { this.hoverOpt = -1; this.showCard(); } });
        node.addEventListener('click', () => {
          this.ringOpts[i]?.act();
          this.ringSig = '';
          this.renderRevive(g);
    this.updateQuest(g);
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
      const cur = TREE_STAGES[s.tree.stage];
      html += `<h3>Древо Игг</h3><div class="sub">Сейчас: <b>${cur.name}</b> · стадия ${s.tree.stage + 1} из ${TREE_STAGES.length}</div>`;
      // ── the action first: grow (or add a growth ring)
      if (need > 0) {
        const nextSt = TREE_STAGES[s.tree.stage + 1];
        const give = Math.min(need, s.amber);
        const br = TREE_BRANCHES[s.tree.stage + 1];
        html += `<div class="growcard">
          <div class="gc-head">Следующая стадия: <b>${nextSt.name}</b></div>
          <div class="gc-un">${nextSt.unlocks.join(' · ')} · сила гнёзд ×${nextSt.power}${br ? `<br>Ветвь на выбор: <i>${br[0].name}</i> или <i>${br[1].name}</i>` : ''}</div>
          <div class="growrow"><div class="bar thin grow"><i style="width:${(s.tree.growth / cur.growCost) * 100}%"></i></div>
            <span><img class="icon" src="${icon('amber')}"> ${s.tree.growth} / ${cur.growCost}</span></div>
          <div class="row">${btn(give >= need ? `Вырастить Древо (−${give})` : give > 0 ? `Напитать (−${give})` : `Нужно ещё ${need} Янтаря`, give > 0, () => { g.feed(give); })}
            ${btn('+10', s.amber >= 10 && need > 10, () => { g.feed(10); }, '')}</div>
        </div>`;
      } else {
        const rc = g.ringCost();
        html += `<div class="growcard"><div class="gc-head">Великое Игг-Древо в полной силе</div>
          <div class="gc-un">Теперь оно наращивает <b>годичные кольца</b>: каждое +7% силы гнёзд и +10% здоровья Древа, Древо растёт, а каждые 2 кольца открывают новый слот кроны.${s.tree.rings ? `<br>Колец: <b>${s.tree.rings}</b> · сила гнёзд ×${g.treePower().toFixed(2)}` : ''}</div>
          <div class="row">${btn(`Годичное кольцо №${s.tree.rings + 1} (<img class="icon" src="${icon('amber')}"> ${rc})`, s.amber >= rc, () => { g.addRing(); })}</div></div>`;
      }
      // ── the Observer's exchange: Amber ↔ Star Blood
      html += `<div class="sub">Обмен у Наблюдателя:</div><div class="row left exch">
        ${btn(`${EXCHANGE.amberPerStar} <img class="icon" src="${icon('amber')}"> → 1 <img class="icon" src="${icon('star')}">`, s.amber >= EXCHANGE.amberPerStar, () => { g.exchange('buyStar', 1); }, 'tiny')}
        ${btn('×10', s.amber >= EXCHANGE.amberPerStar * 10, () => { g.exchange('buyStar', 10); }, 'tiny')}
        ${btn(`1 <img class="icon" src="${icon('star')}"> → ${EXCHANGE.starToAmber} <img class="icon" src="${icon('amber')}">`, s.star >= 1, () => { g.exchange('sellStar', 1); }, 'tiny')}
        ${btn('×10', s.star >= 10, () => { g.exchange('sellStar', 10); }, 'tiny')}</div>`;
      // ── Уклоны Древа
      const counts = pathCounts(s.tree.branches);
      html += `<div class="sub">Уклон Древа — ${PATH_CAPSTONE} ветви одного пути превращают его в особое Древо:</div><div class="paths">${(Object.keys(TREE_PATHS) as TreePath[]).map((p) => {
        const d = TREE_PATHS[p];
        const n = counts[p];
        const done = n >= PATH_CAPSTONE;
        const mine = s.tree.branches.map((id) => branchById(id)).filter((b) => b && b.path === p).map((b) => b!.name);
        return `<div class="pathc ${done ? 'done' : ''}" style="--c:${d.color}">
          <div class="ph"><b>${d.name}</b><span>${'●'.repeat(n)}${'○'.repeat(Math.max(0, PATH_CAPSTONE - n))}</span></div>
          <div class="pb">${mine.length ? mine.join(' · ') : 'ветвей пока нет'}</div>
          <div class="pc"><i>${done ? `✦ ${d.tree}` : `→ ${d.tree}`}</i>${d.capstone.split(', ').map((x) => `<span>${x}</span>`).join('')}</div>
        </div>`;
      }).join('')}</div>`;
      // ── reference: the whole ladder (current at the top of the list, compact)
      html += `<div class="sub">Все стадии:</div><div class="ladder">`;
      TREE_STAGES.forEach((st, i) => {
        const state = i < s.tree.stage ? 'done' : i === s.tree.stage ? 'cur' : 'next';
        const brs = TREE_BRANCHES[i];
        const chosen = brs?.find((x) => s.tree.branches.includes(x.id));
        html += `<div class="step ${state}">
          <div class="dot">${i + 1}</div>
          <div class="body"><div class="nm">${st.name}</div>
            <div class="un">${st.unlocks.join(' · ')} · сила гнёзд ×${st.power}</div>
            ${brs ? `<div class="br">Ветвь: ${chosen ? `<b style="color:${TREE_PATHS[chosen.path].color}">${chosen.name}</b>` : brs.map((b) => `<i>${b.name}</i>`).join(' / ')}</div>` : ''}
          </div></div>`;
      });
      html += `</div>`;
    } else if (this.panelKind === 'keeper') {
      const k = s.keeper;
      const rank = KEEPER_RANKS[k.rank];
      const next = KEEPER_RANKS[k.rank + 1];
      html += `<h3>Скрижаль Восходящего ${this.coop ? '' : '<small style="opacity:.6;font-size:11px">⏸ время стоит</small>'}</h3><div class="sub">Ранг: <b style="color:${RUNE_RANK_COLORS[k.rank]}">${rank.name}</b> · HP ${Math.ceil(k.hp)}/${g.keeperMaxHp()} · Свет ${g.maxLight()} · сила умений ×${rank.power}</div>`;
      html += `<div class="ranks">${KEEPER_RANKS.map((r, i) => `<span class="${i <= k.rank ? 'on' : ''}" style="--c:${RUNE_RANK_COLORS[i]}">${r.name}</span>`).join('<i></i>')}</div>`;
      if (next) html += `<div class="row">${btn(`Восхождение: ${next.name} (<img class="icon" src="${icon('star')}"> ${next.cost})`, s.star >= next.cost, () => { g.ascend(); })}</div>`;
      html += `<div class="sub">Защита ${Math.round(g.keeperGuard() * 100)}% · сияние ${Math.round(g.keeperAura())}/с — сжигает тварей вплотную</div>`;
      html += `<div class="attrs">`;
      for (const id of Object.keys(ATTRIBUTES) as AttrId[]) {
        const lv = k.attrs[id];
        const a = ATTRIBUTES[id];
        html += `<div class="attr"><b>${a.name}</b><span class="pips">${'◆'.repeat(lv)}${'◇'.repeat(ATTR_MAX - lv)}</span><small>${a.desc}</small>`;
        if (lv < ATTR_MAX) {
          html += btn(`<img class="icon" src="${icon('star')}"> ${attrCost(lv)}`, s.star >= attrCost(lv), () => { g.raiseAttr(id); }, 'tiny');
          if (s.devRunes > 0) html += btn(`<img class="icon" src="${icon('rune')}"> 1`, true, () => { g.raiseAttr(id, true); }, 'tiny');
        }
        html += `</div>`;
      }
      html += `</div>`;
      if (s.devRunes > 0) html += `<div class="sub hotline"><img class="icon" src="${icon('rune')}"> Малых Рун Развития: <b>${s.devRunes}</b> — открой ею 4-й слот руны («+слот») или подними атрибут (кнопка с этим значком)</div>`;
      html += `<div class="sub">Сокровищница Наблюдателя продаёт только Свойства. В руне 3 слота, 4-й открывает Малая Руна Развития.</div>`;
      for (const rid of RUNE_IDS) {
        const def = KEEPER_RUNES[rid];
        const unlocked = rid === 'light' || g.abilityUnlocked(rid);
        const props = g.runeProps(rid);
        const cap = k.slots[rid];
        const rr = k.runeRank[rid];
        const hasForms = rid === 'spear' || rid === 'hammer' || rid === 'starfall';
        // only runes that can't even be learned yet are dimmed
        const learnable = !unlocked && g.abilityAvailable(rid as AbilityId);
        html += `<div class="rblock ${unlocked || learnable ? '' : 'dim'} ${learnable ? 'learn' : ''}" data-rune="${rid}"><div class="rhead"><img src="${icon(def.icon)}"><b>${def.name}</b>
          <span class="rrank" style="--c:${runeColor(rr)}">${runeRankName(rr)} · ×${runeRankPower(rr).toFixed(2)}</span><span class="cap">${props.length}/${cap}</span>`;
        html += `</div>`;
        if (unlocked) {
          const cost = runeRankCost(rr + 1);
          html += `<div class="row left">${btn(`Повышение → ${runeRankName(rr + 1)} (<img class="icon" src="${icon('star')}"> ${cost})`, s.star >= cost, () => { g.promoteRune(rid); }, 'tiny')}
            <span class="hint">${rr + 1 === FORM_RANK && hasForms ? 'выбор Формы' : rr + 1 === APOTHEOSIS_RANK ? (hasForms ? 'Апофеоз + Грань' : 'выбор Грани') : rr + 1 < APOTHEOSIS_RANK ? 'выбор Грани' : 'Огранка Грани'} · сила ×${(runeRankPower(rr + 1) / runeRankPower(rr)).toFixed(2)} · ${rid === 'light' ? 'Свойства высших рангов' : `откат +${Math.round((runeRankCd(rr + 1) / runeRankCd(rr) - 1) * 100)}%`}${rid !== 'light' && rid !== 'starfall' ? ` · Свет +${Math.round((runeRankLight(rr + 1) / runeRankLight(rr) - 1) * 100)}%` : ''}</span></div>`;
        }
        if ((rid === 'spear' || rid === 'hammer' || rid === 'starfall') && unlocked) {
          const forms = RUNE_FORMS[rid];
          const cur = k.forms[rid];
          if (cur) {
            html += `<div class="form on"><b>Форма: ${forms[cur].name}</b><small>${forms[cur].desc}${rr >= APOTHEOSIS_RANK ? `<br><i>${forms[cur].apo}</i>` : ''}</small></div>`;
          } else {
            // the Form is chosen in the rank-up window at «Серебро» (shown here for reference)
            html += `<div class="sub">Форма на ранге «${runeRankName(FORM_RANK)}»: <b>${forms.A.name}</b> или <b>${forms.B.name}</b></div>`;
          }
        }
        if (unlocked) {
          const mine = k.facets.map((id) => facetById(id)).filter((f) => f && f.rune === rid);
          const next = FACET_RANKS.find((r) => r > rr);
          const opts = next !== undefined ? FACETS.filter((f) => f.rune === rid && f.rank === next) : [];
          html += `<div class="sub">Грани: ${mine.length ? mine.map((f) => `<b title="${f!.desc}">${f!.name}${g.facetLv(f!.id) > 1 ? ` ${ROMAN[g.facetLv(f!.id)]}` : ''}</b>`).join(' · ') : '—'}${next !== undefined ? ` · на «${runeRankName(next)}»: ${opts.map((f) => {
            const on = !f.requires || k.props[rid].includes(f.requires);
            return `<span title="${f.desc}" style="${on ? '' : 'opacity:.45'}">${f.name}${f.requires ? ` (резонанс: ${propertyById(f.requires)?.name})` : ''}</span>`;
          }).join(', ')}` : ''}</div>`;
        }
        html += `<div class="slots">`;
        for (let i = 0; i < cap; i++) {
          const p = props[i];
          if (p) {
            const rc = removeCost(p);
            const lv = g.propLevel(rid, i);
            let up = '';
            if (propUpgradable(p) && lv < PROP_MAX_LV) {
              const uc = propUpgradeCost(p, lv);
              actions.push(() => { g.upgradeProperty(rid, i); });
              up = `<button class="up ${s.star >= uc ? '' : 'no'}" data-i="${actions.length - 1}" title="Прокачать до ${ROMAN[lv + 1]}: эффект ×${propLvFactor(lv + 1).toFixed(1)} от базового">▲ ${uc} <img class="icon" src="${icon('star')}"></button>`;
            }
            actions.push(() => { g.removeProperty(rid, i); });
            html += `<span class="slot full" style="--c:${RUNE_RANK_COLORS[p.rank]}" title="${p.desc}${lv > 1 ? ` · уровень ${ROMAN[lv]}: ×${propLvFactor(lv).toFixed(1)}` : ''}">${p.name}${lv > 1 ? ` <b>${ROMAN[lv]}</b>` : ''}${up}<button class="rm ${s.star >= rc ? '' : 'no'}" data-i="${actions.length - 1}" title="Вынуть Свойство за ${rc} Звёздной Крови">✕ ${rc} <img class="icon" src="${icon('star')}"></button></span>`;
          } else html += `<span class="slot">пусто</span>`;
        }
        if (cap < DEV_SLOTS) {
          // the 4th slot sits right among the slots: open it with a Lesser Rune of Development
          if (s.devRunes > 0) html += btn(`+ слот <img class="icon" src="${icon('rune')}"> 1`, true, () => { g.developRune(rid); }, 'tiny slotbtn');
          else html += `<span class="slot locked" data-tip-title="4-й слот" data-tip="Открывается Малой Руной Развития — редкий дар с Червей.">+</span>`;
        }
        else if (cap < MAX_SLOTS && unlocked) {
          const sp = g.slotPrice(rid)!;
          html += btn(`Выковать ${cap + 1}-й слот (${priceHtml(sp, g)})`, g.canPay(sp), () => { g.buyRuneSlot(rid); }, 'tiny');
        }
        html += `</div>`;
        if (unlocked) {
          html += `<div class="shop">`;
          for (const p of PROPERTIES.filter((x) => x.rune === rid)) {
            const owned = k.props[rid].filter((x) => x === p.id).length;
            const ok = g.canInstall(p) && s.star >= p.price;
            const rankLock = p.rank > rr;
            actions.push(() => { g.buyProperty(p.id); });
            html += `<div class="item ${ok ? '' : 'no'}" data-i="${actions.length - 1}" style="--c:${RUNE_RANK_COLORS[p.rank]}" title="${p.type} · ${RUNE_RANKS[p.rank]}">
              <span class="nm">${p.name}${p.stack > 1 ? ` <i>${owned}/${p.stack}</i>` : owned ? ' <i>✓</i>' : ''}</span><span class="ds">${rankLock ? `<b style="color:#ff9a8a">нужна руна ранга «${RUNE_RANKS[p.rank]}»</b> · ` : ''}${p.desc}</span>
              <span class="pr ${s.star >= p.price ? '' : 'no'}"><img src="${icon('star')}">${p.price}</span></div>`;
          }
          html += `</div>`;
        } else if (g.abilityAvailable(rid as AbilityId)) {
          const price = ABILITIES[rid as AbilityId].learn;
          html += `<div class="learnrow">${btn(`Изучить за <img class="icon" src="${icon('star')}"> ${price}`, s.star >= price, () => { g.learnAbility(rid as AbilityId); }, 'gold learnbtn')}
            <span class="hint">${ABILITIES[rid as AbilityId].desc}</span></div>
            <div class="sub">Или дождись дара Наблюдателя на рассвете.</div>`;
        } else {
          html += `<div class="sub">Изучить можно со стадии Древа ${ABILITIES[rid as AbilityId].unlockStage} — за Звёздную Кровь или даром Наблюдателя.</div>`;
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
      this.panel.innerHTML = gloss(html);
      this.panel.querySelectorAll<HTMLElement>('button[data-i], .item[data-i], .form[data-i]').forEach((b) => {
        b.addEventListener('click', (ev) => {
          ev.stopPropagation(); actions[Number(b.dataset.i)](); this.panelSig = ''; this.renderPanel(); });
      });
      this.panel.querySelector('.close')!.addEventListener('click', () => this.closeMenu());
    }
  }

  // ───────────────────────────── choice modal ────────────────────────

  get choiceOpen() { return !this.modal.classList.contains('hidden'); }

  private renderChoice() {
    const g = this.game();
    // nothing to choose while the title screen is up (the run hasn't started yet)
    // co-op: only my own picks (and shared ones, like a Tree branch) — the others choose on their screens
    const c = this.inRun && this.title.classList.contains('hidden') ? g.choiceFor(g.local) : null;
    if (!c || g.over) {
      if (!this.modal.classList.contains('hidden')) { this.modal.classList.add('hidden'); this.modalSig = ''; }
      return;
    }
    // let the night end on screen for a moment before the dawn window pops up
    if (c.kind === 'dawn' && !c.start) {
      const now = performance.now();
      if (this.dawnSeenAt < 0) this.dawnSeenAt = now;
      if (now - this.dawnSeenAt < 1300) return;
    } else this.dawnSeenAt = -1;
    const sig = JSON.stringify(c);
    if (sig === this.modalSig) return;
    this.dawnSeenAt = -1;
    this.modalSig = sig;
    // a choice pops over the Keeper's Tablet without closing it (e.g. a Facet after Повышение)
    if (this.panelKind === 'keeper' || this.panelKind === 'tree') { this.menuTarget = null; this.ring.classList.remove('show'); this.card.classList.remove('show'); }
    else this.closeMenu();
    let html = '';
    if (c.kind === 'dawn') {
      html = `<div class="tablet big"><div class="orbit-wrap"><div class="orbit">${'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃ'.split('').map((r, i) => `<span style="--i:${i}">${r}</span>`).join('')}</div></div>
        <div class="who">Скрижаль · Тот-Кто-Наблюдает</div>
        <h3>${c.start ? 'Восходящий! Наблюдатель видит тебя.' : 'Восходящий! Ночь пережита.'}</h3><div class="sub">${c.start ? 'Первый дар перед первой ночью' : 'Рулетка Наблюдателя'}: по дару для Восходящего, для созданий и для Древа. Выбери один.</div>
        <div class="cards">${c.offers.map((id, i) => {
          const p = propertyById(id);
          const b = boonById(id);
          const rank = p ? p.rank : b!.rank;
          const ic = p ? KEEPER_RUNES[p.rune].icon : b!.icon;
          const cat = p ? `${p.type} → ${KEEPER_RUNES[p.rune].name}` : b!.category;
          return `<div class="rcard rk${rank}" data-i="${i}" style="--c:${RUNE_RANK_COLORS[rank]}">
            <div class="rank">${RUNE_RANKS[rank]}</div><img src="${icon(ic)}"><div class="cat">${cat}</div>
            <div class="nm">${p ? p.name : b!.name}</div><div class="ds">${p ? p.desc : b!.desc}</div></div>`;
        }).join('')}</div>
        <div class="row"><button class="btn reroll" ${g.state.star >= g.rerollCost() ? '' : 'disabled'}>Перебросить <img class="icon" src="${icon('star')}"> ${g.rerollCost()}</button></div></div>`;
    } else if (c.kind === 'form') {
      const rune = KEEPER_RUNES[c.rune];
      const forms = RUNE_FORMS[c.rune as 'spear' | 'hammer' | 'starfall'];
      html = `<div class="tablet big"><div class="who">Скрижаль · Форма руны</div>
        <h3>«${rune.name}» достигла ранга «${runeRankName(c.rank)}»</h3>
        <div class="sub">Руна принимает Форму — она меняет сам способ применения. Все Свойства и Грани руны работают с любой Формой. На ранге «${runeRankName(APOTHEOSIS_RANK)}» Форма достигнет Апофеоза.</div>
        <div class="cards two">${(['A', 'B'] as FormId[]).map((f, i) => `<div class="rcard" data-i="${i}" style="--c:${runeColor(c.rank)}">
          <div class="rank">Форма</div><img src="${icon(rune.icon)}"><div class="nm">${forms[f].name}</div><div class="ds">${forms[f].desc}<br><i style="opacity:.75">${forms[f].apo}</i></div></div>`).join('')}</div></div>`;
    } else if (c.kind === 'facetUp') {
      const rune = KEEPER_RUNES[c.rune];
      html = `<div class="tablet big"><div class="who">Скрижаль · Огранка</div>
        <h3>«${rune.name}» — звёздный ранг «${runeRankName(c.rank)}»</h3>
        <div class="sub">Звёздная руна гранит одну из своих Граней: её эффект растёт (до уровня ${ROMAN[FACET_MAX]}).</div>
        <div class="cards">${c.offers.map((id, i) => {
          const f = facetById(id)!;
          const lv = g.facetLv(id);
          return `<div class="rcard" data-i="${i}" style="--c:#8fd0ff">
            <div class="rank">${ROMAN[lv]} → ${ROMAN[lv + 1]}</div><img src="${icon(rune.icon)}">
            <div class="nm">${f.name}</div><div class="ds">${f.desc}<br><i style="opacity:.75">Каждый уровень усиливает эффект</i></div></div>`;
        }).join('')}</div></div>`;
    } else if (c.kind === 'facet') {
      const rune = KEEPER_RUNES[c.rune];
      const formRune = c.rune === 'spear' || c.rune === 'hammer' || c.rune === 'starfall';
      const cur = formRune ? g.state.keeper.forms[c.rune as 'spear' | 'hammer' | 'starfall'] : null;
      const apoNote = c.rank === APOTHEOSIS_RANK && cur ? `<b style="color:#8fd0ff">${RUNE_FORMS[c.rune as 'spear' | 'hammer' | 'starfall'][cur].apo}</b> ` : '';
      html = `<div class="tablet big"><div class="who">Скрижаль · Грань руны</div>
        <h3>«${rune.name}» достигла ранга «${runeRankName(c.rank)}»</h3>
        <div class="sub">${apoNote}Руна поворачивается новой Гранью — она работает с любой Формой. Резонансные Грани открывают вставленные в руну Свойства.</div>
        <div class="cards">${c.offers.map((id, i) => {
          const f = facetById(id)!;
          const req = f.requires ? propertyById(f.requires) : undefined;
          return `<div class="rcard" data-i="${i}" style="--c:${req ? '#b48cff' : runeColor(c.rank)}">
            <div class="rank">${req ? `Резонанс: ${req.name}` : 'Грань'}</div><img src="${icon(rune.icon)}">
            <div class="nm">${f.name}</div><div class="ds">${f.desc}</div></div>`;
        }).join('')}</div></div>`;
    } else {
      const list = TREE_BRANCHES[c.stage];
      const counts = pathCounts(g.state.tree.branches);
      html = `<div class="branch-box"><div class="who">${TREE_STAGES[c.stage].name}</div>
        <h3>Древо растёт. Куда пустить новую ветвь?</h3><div class="sub">Каждая ветвь — шаг Уклона Древа. ${PATH_CAPSTONE} ветви одного Уклона превращают его в особое Древо.</div>
        <div class="cards">${list.map((b, i) => {
          const p = TREE_PATHS[b.path];
          const n = counts[b.path];
          const full = n + 1 >= PATH_CAPSTONE && n < PATH_CAPSTONE;
          return `<div class="rcard gold" data-i="${i}" style="--c:${p.color}">
          <div class="rank">${p.name} ${'●'.repeat(n + 1)}${'○'.repeat(Math.max(0, PATH_CAPSTONE - n - 1))}</div>
          <img src="${icon('tree')}"><div class="nm">${b.name}</div><div class="ds">${b.desc}</div>
          ${full ? `<div class="ds" style="color:${p.color}"><b>→ ${p.tree}:</b> ${p.capstone}</div>` : ''}</div>`;
        }).join('')}</div></div>`;
    }
    this.modal.innerHTML = gloss(html);
    this.modal.classList.remove('hidden');
    this.modal.querySelector('.reroll')?.addEventListener('click', () => { if (g.rerollDawn()) { this.modalSig = ''; this.renderChoice(); } });
    this.modal.querySelectorAll<HTMLElement>('.rcard').forEach((n) => {
      n.addEventListener('click', () => { g.choose(Number(n.dataset.i)); this.modalSig = ''; this.renderChoice(); });
    });
  }

  /** Number keys while a choice is open. */
  /**
   * Keys while a choice is open: swallowed, never picking anything — a rune hotkey pressed
   * as the window pops up must not choose a card by accident. Choices are made by clicking.
   */
  choiceKey(_key: string): boolean {
    return this.choiceOpen;
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
    const kmax = g.keeperMaxHp();
    this.khpFill.style.width = `${(Math.max(0, s.keeper.hp) / kmax) * 100}%`;
    this.khpText.textContent = s.keeper.alive ? `${Math.ceil(s.keeper.hp)}/${kmax}` : Number.isFinite(s.keeper.respawn) ? `пал · ${Math.ceil(s.keeper.respawn)}с` : 'пал';
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
      this.callBtn.classList.remove('hidden', 'rush', 'wait');
      this.callBtn.title = '';
      this.callBtn.innerHTML = `Призвать ночь <span style="opacity:.75">[Пробел] +${Math.floor(s.dayLeft)}</span>`;
    } else {
      const left = s.enemies.length + s.pending.length;
      this.nightInfo.innerHTML = s.phase === 'night' ? `${g.night(s.night).title}${s.night < total ? ` · ${s.night + 1}/${total}` : ' · ∞'} · тварей: <span class="t">${left}</span>${s.rushedDawns ? ` · <span style="color:#ffb070">Натиск ×${s.rushedDawns}</span>` : ''}${s.wrath > 1.01 ? ` · <span style="color:#ff8a8a">Гнев ×${s.wrath.toFixed(1)}</span>` : ''}` : '';
      if (g.canRush()) {
        const r = g.rushReward();
        this.callBtn.classList.remove('hidden', 'wait');
        this.callBtn.classList.add('rush');
        const html = `Натиск: ночь ${s.night + 2} <span style="opacity:.8">[Пробел] +${r.amber}<img class="icon" src="${icon('amber')}"> +${r.star}<img class="icon" src="${icon('star')}"></span>`;
        if (this.callBtn.innerHTML !== html) this.callBtn.innerHTML = html;
        this.callBtn.title = 'Призвать следующую ночь, не добивая эту. Награда сразу, пропущенный рассвет (дар и выбор рун) придёт на ближайшем рассвете.';
      } else this.callBtn.classList.add('hidden');
    }

    // Созвучие: rotating runes stacks power; Перегрев: spamming the spear costs more
    const kp = s.keeper;
    const chordTxt = kp.chordT > 0 && kp.chord > 0
      ? `Созвучие ${'●'.repeat(kp.chord)}${'○'.repeat(CHORD.max - kp.chord)} +${Math.round(CHORD.power * kp.chord * 100)}% силы · −${Math.round(CHORD.discount * kp.chord * 100)}% Света`
      : kp.chordT > 0 && kp.lastCast ? 'Созвучие: примени другую руну' : '';
    const heatPct = Math.round(Math.min(CHORD.heatMax, CHORD.heat * Math.max(0, kp.heat + 2 - CHORD.heatFree)) * 100);
    const heatTxt = kp.heatT > 0 && heatPct > 0 ? ` · Перегрев Копья +${heatPct}% Света` : '';
    const ct = chordTxt + heatTxt;
    if (this.chordEl.textContent !== ct) this.chordEl.textContent = ct;
    this.chordEl.classList.toggle('hidden', !ct);
    this.chordEl.classList.toggle('on', kp.chord > 0);
    for (const id of AB_IDS) {
      const el = this.abEls[id];
      const { box, cd, lock, charge, cdt } = el;
      const unlocked = g.abilityUnlocked(id);
      lock.style.display = unlocked ? 'none' : 'grid';
      if (!unlocked) {
        const lk = lock.querySelector('.lk')!;
        const t = g.abilityAvailable(id) ? `<img class="icon" src="${icon('star')}">${ABILITIES[id].learn}` : `ст.${ABILITIES[id].unlockStage}`;
        if (lk.innerHTML !== t) lk.innerHTML = t;
        box.classList.toggle('learnable', g.abilityAvailable(id) && s.star >= ABILITIES[id].learn);
      }
      const c = s.keeper.cooldowns[id];
      const nights = id === 'timestop' ? s.keeper.timeStopNights : 0;
      const frac = nights > 0 ? Math.min(1, nights / ABILITIES.timestop.nights) : c > 0 ? Math.min(1, c / Math.max(0.01, s.keeper.cdMax[id])) : 0;
      cd.style.transform = `scaleY(${frac})`;
      const txt = nights > 0 ? `${nights}н` : c > 0.5 ? String(Math.ceil(c)) : '';
      if (cdt.textContent !== txt) cdt.textContent = txt;
      let ready: boolean;
      if (id === 'starfall') {
        const ch = s.keeper.charge / ABILITIES.starfall.chargeMax;
        charge.style.height = `${ch * 100}%`;
        ready = unlocked && ch >= 1 && c <= 0;
      } else {
        ready = unlocked && c <= 0 && nights === 0 && (id !== 'timestop' || s.phase === 'night') && (s.keeper.light >= g.abilityCost(id) || s.keeper.freeCast > 0) && s.keeper.alive;
        box.classList.toggle('nolight', unlocked && s.keeper.light < g.abilityCost(id) && s.keeper.freeCast <= 0);
      }
      box.classList.toggle('ready', ready);
      if (ready && !el.wasReady && unlocked) {
        box.classList.remove('pop');
        void box.offsetWidth;
        box.classList.add('pop');
      }
      el.wasReady = ready;
      box.classList.toggle('aim', this.aiming === id);
    }
    const slotsFree = RUNE_IDS.some((r) => (r === 'light' || g.abilityUnlocked(r)) && PROPERTIES.some((p) => p.rune === r && s.star >= p.price && g.canInstall(p)));
    const canAscend = !!KEEPER_RANKS[s.keeper.rank + 1] && s.star >= KEEPER_RANKS[s.keeper.rank + 1].cost;
    // Amber left over before the night: the counter blinks — spend it
    const cheapest = Math.min(...SLOTS.filter((sl) => g.slotUnlocked(sl) && !g.structureAt(sl.id))
      .map((sl) => (sl.underground ? ['spider'] : sl.crown ? ['caterpillar', 'honeycomb', 'mender', 'hive'] : ['hive', 'beetle', 'dragonfly', 'termite']).map((f) => g.buildPrice(f as Family).amber))
      .flat(), Infinity);
    const spend = s.phase === 'day' && s.dayLeft < 12 && s.amber >= Math.min(cheapest, g.growNeed() > 0 ? g.growNeed() : Infinity);
    const amberItem = this.amberNum.parentElement as HTMLElement;
    if (amberItem.classList.contains('spendme') !== spend) amberItem.classList.toggle('spendme', spend);
    // how many things the Tablet can buy right now (shown as a badge on its button)
    const buyable = (canAscend ? 1 : 0) + (s.devRunes > 0 ? 1 : 0)
      + RUNE_IDS.filter((r) => (r === 'light' || g.abilityUnlocked(r)) && s.star >= runeRankCost(s.keeper.runeRank[r] + 1)).length
      + (Object.keys(ABILITIES) as AbilityId[]).filter((id) => !g.abilityUnlocked(id) && g.abilityAvailable(id) && s.star >= ABILITIES[id].learn).length;
    this.keeperBtn.classList.toggle('hot', canAscend || slotsFree || s.devRunes > 0 || buyable > 0);
    const badge = buyable > 0 ? String(buyable) : '';
    if (this.keeperBtn.dataset.badge !== badge) this.keeperBtn.dataset.badge = badge;
    this.keeperBtn.title = `Ранг ${KEEPER_RANKS[s.keeper.rank].name}${slotsFree ? ' · можно купить Свойство' : ''}`;

    this.renderRevive(g);
    this.updateQuest(g);
    if (this.menuTarget) this.renderRing();
    if (this.panelKind) this.renderPanel();
    this.renderChoice();

    this.bannerTimer -= dt;
    if (this.bannerTimer <= 0) this.banner.classList.remove('show');
    this.noticeTimer -= dt;
    if (this.noticeTimer <= 0) this.notice.classList.remove('show');
    this.updateTips(g);
  }

  /** Observer's tasks: one goal at a time with a highlight and a reward. */
  private updateQuest(g: Game) {
    while (this.questIdx < QUESTS.length && QUESTS[this.questIdx].done(g)) {
      const q = QUESTS[this.questIdx];
      g.grantReward(q.reward);
      this.say(`Задание выполнено: «${q.text}». Награда: ${q.reward} Янтаря.`);
      this.questIdx++;
    }
    document.querySelectorAll('.hl').forEach((n) => n.classList.remove('hl'));
    const q = QUESTS[this.questIdx];
    if (!q || g.over) { this.questBox.classList.remove('show'); return; }
    if (q.focus) document.querySelector(q.focus)?.classList.add('hl');
    const sig = `${this.questIdx}`;
    if (sig !== this.questSig) {
      this.questSig = sig;
      this.callout(`${q.text} ${q.hint ?? ''}`);
      this.questBox.innerHTML = `<div class="who">Задание Наблюдателя · ${this.questIdx + 1}/${QUESTS.length}</div>
        <div class="qt">${q.text}</div>${q.hint ? `<div class="qh">${q.hint}</div>` : ''}
        <div class="qr"><img class="icon" src="${icon('amber')}"> ${q.reward}</div>`;
    }
    this.questBox.classList.add('show');
  }

  private renderRevive(g: Game) {
    const s = g.state;
    const k = s.keeper;
    const show = !k.alive && s.phase === 'night' && !g.over;
    this.reviveBox.classList.toggle('show', show);
    if (!show) { this.reviveSig = ''; this.deathHold = false; this.deathSeen = false; return; }
    // the moment the Ascended falls, time stops so the choice can be made calmly
    if (!this.deathSeen) { this.deathSeen = true; this.deathHold = !this.coop; this.reviveSig = ''; }
    const cost = g.reviveCost();
    const t = g.sacrificeTarget();
    const tdesc = t ? (t.kind === 'rank' ? `ранг руны «${KEEPER_RUNES[t.rune].name}» (${RUNE_RANKS[k.runeRank[t.rune]]} → ${RUNE_RANKS[k.runeRank[t.rune] - 1]})` : `Свойство из руны «${KEEPER_RUNES[t.rune].name}»`) : '';
    const sig = `${cost}|${s.amber >= cost}|${tdesc}|${this.deathHold}`;
    if (sig === this.reviveSig) return;
    this.reviveSig = sig;
    this.reviveBox.innerHTML = `<h4>Восходящий пал</h4>
      <div class="sub">Без него Круг держится до рассвета. Вернуть сейчас:</div>
      <button class="btn gold" data-a="amber" ${s.amber >= cost ? '' : 'disabled'}>Воскрешение Древом <img class="icon" src="${icon('amber')}"> ${cost} <span class="k">[V]</span></button>
      ${t ? `<button class="btn" data-a="sac">Жертва Вечности: ${tdesc} <span class="k">[G]</span></button>` : ''}
      <div class="sub">…или ждать рассвета (бесплатно).</div>
      ${this.deathHold ? `<div class="sub" style="color:#8fd0ff">⏸ Время стоит, пока ты решаешь</div><button class="btn" data-a="wait">Держать Круг без него <span class="k">[Пробел]</span></button>` : ''}`;
    this.reviveBox.querySelector('[data-a=amber]')?.addEventListener('click', () => { g.revive('amber'); });
    this.reviveBox.querySelector('[data-a=sac]')?.addEventListener('click', () => { g.revive('sacrifice'); });
    this.reviveBox.querySelector('[data-a=wait]')?.addEventListener('click', () => { this.releaseDeath(); });
  }

  private bump(n: HTMLElement) {
    n.classList.remove('bump');
    void n.offsetWidth;
    n.classList.add('bump');
  }

  /** Context tips (the Observer's tutorial) for the first minutes. */
  private updateTips(g: Game) {
    const s = g.state;
    if (s.enemies.some((e) => e.kind === 'devourer')) this.once('devourer', 'Тень Пожирателя! Разрушив гнездо, она пожирает его и лечится, из пасти сыплются Копатели. Сбей панцирь Молотом и Звездопадом и не подпускай к гнёздам.');
    if (s.enemies.some((e) => e.kind === 'tyrant')) this.once('tyrant', 'Отродье Тирана идёт на прорыв! Сперва сбей шипастый панцирь — Молот бьёт по нему втрое, Звездопад вдвое; мелкие укусы гнёзд его лишь царапают.');
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
    if (this.questIdx < QUESTS.length) { const q = QUESTS[this.questIdx]; if (this.tip.innerHTML !== (q.hint ?? '')) this.tip.innerHTML = q.hint ?? ''; return; }
    const nestT2 = s.structures.find((x) => x.tier === 1);
    if (g.over || this.bannerTimer > 0.5 || this.choiceOpen) text = '';
    else if (!done('build')) text = 'Кликни по золотой <b>руне</b> у Древа — призови гнездо светоносных. <kbd>A</kbd>/<kbd>D</kbd> — ходить';
    else if (s.phase === 'night' && s.night === 0 && !done('spear')) text = '<kbd>1</kbd> — Копьё Игг-Света летит к курсору. Бьёт и во тьме';
    else if (s.drops.length > 0 && !done('collect')) text = 'Янтарь подбирает Восходящий — подойди к каплям (<kbd>A</kbd>/<kbd>D</kbd>)';
    else if (s.phase === 'day' && !done('feed') && s.amber >= g.growNeed() && s.night >= 1) text = 'Кликни по <b>Древу</b>: стадии роста открывают умения, руны и силу гнёзд';
    else if (s.night >= 1 && s.phase === 'day' && !done('spider')) text = 'Черви ползут под землёй — призови <b>Паука-ткача</b> на корневой узел';
    else if (s.star >= 6 && !this.tipsDone.has('shop') && s.phase === 'day') { text = '<kbd>R</kbd> — Скрижаль: купи у Наблюдателя Свойства для рун за Звёздную Кровь'; }
    else if (nestT2 && s.star >= 4 && !done('spec')) text = 'Гнездо 2 ур. можно <b>специализировать</b> — кликни по нему (нужна Звёздная Кровь)';
    else if (s.phase === 'day' && s.amber >= 60 && !done('upgrade') && s.night >= 1) text = 'Кликни по гнезду, чтобы усилить его <kbd>U</kbd>';
    if (this.tip.innerHTML !== text) this.tip.innerHTML = text;
  }
}
