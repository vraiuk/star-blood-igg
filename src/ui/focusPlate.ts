import { WORLD } from '../data/balance';
import { INWORLD } from '../data/worlds';
import type { Game } from '../sim/game';
import type { Focus } from '../sim/interact';
import { icon } from './icons';

/**
 * In-world labels (spec §3, §7): the focus plate above the object the Keeper stands at —
 * icon, name, one line of role, price as amber drops (filled = poured), option arrows and the
 * key hint — plus the purse count above the Keeper and the Treasury count above the hollow.
 * Display only: reads `Game.focus()` and state.
 */
export class FocusPlate {
  private plate: HTMLElement;
  private purse: HTMLElement;
  private treasury: HTMLElement;
  private sig = '';

  constructor(root: HTMLElement, private project: () => (x: number, y: number) => [number, number]) {
    this.plate = document.createElement('div');
    this.plate.id = 'fplate';
    this.purse = document.createElement('div');
    this.purse.className = 'wlabel purse';
    this.treasury = document.createElement('div');
    this.treasury.className = 'wlabel treasury';
    root.append(this.plate, this.purse, this.treasury);
    this.hide();
  }

  hide() {
    this.plate.classList.remove('show');
    this.purse.classList.remove('show');
    this.treasury.classList.remove('show');
    this.sig = '';
  }

  private iconOf(g: Game, f: Focus): string {
    if (f.kind === 'treasury') return 'amber';
    if (f.kind === 'altar') return 'tree';
    if (f.kind === 'stone') return 'rune';
    if (f.kind === 'well' && !f.options.length) return 'roots';
    if (f.kind === 'nest') {
      const st = g.state.structures.find((x) => `nest:${x.id}` === f.id);
      return st?.family ?? 'rune';
    }
    return f.options[f.optionIndex]?.id ?? 'rune';
  }

  /** Price as drops: ≤ 20 drops one by one, more as a bar with «37/90». */
  private priceHtml(g: Game, f: Focus): string {
    if (f.verbs.pour !== 'pledge' || f.price <= 0) return '';
    const s = g.state;
    const have = s.keeper.purse + f.pledged + (f.kind === 'altar' ? s.amber : 0);
    const left = Math.max(0, f.price - f.pledged);
    const short = have < f.price;
    const star = f.star ? ` <span class="fp-star ${s.star >= f.star ? '' : 'no'}"><img src="${icon('star')}">${f.star}</span>` : '';
    const rest = left > 0 ? ` <span class="fp-left ${short ? 'no' : ''}">ещё ${left}</span>` : '';
    if (f.price <= 20) {
      let d = '';
      for (let i = 0; i < f.price; i++) d += `<i class="${i < f.pledged ? 'f' : ''}"></i>`;
      return `<div class="fp-price"><span class="drops">${d}</span>${rest}${star}</div>`;
    }
    const pct = Math.min(100, (f.pledged / f.price) * 100);
    return `<div class="fp-price"><span class="bar"><i style="width:${pct.toFixed(1)}%"></i></span><span class="num">${f.pledged}/${f.price}</span>${rest}${star}</div>`;
  }

  private hint(g: Game, f: Focus): string {
    if (!f.canAct) return `<div class="fp-why">${f.reason ?? ''}</div>`;
    const k = (key: string, what: string) => `<span><kbd>${key}</kbd> ${what}</span>`;
    const parts: string[] = [];
    if (f.verbs.take) parts.push(k('W', 'взять'));
    if (f.verbs.pour === 'deposit') parts.push(k('S', 'сдать'));
    if (f.verbs.pour === 'pledge') parts.push(k('S', 'держи — влить'));
    if (f.verbs.sell) parts.push(k('X', 'держи — продать'));
    const sell = f.sellT > 0 ? `<div class="fp-sell"><i style="width:${Math.min(100, (f.sellT / INWORLD.sellHold) * 100).toFixed(0)}%"></i></div>` : '';
    void g;
    return `<div class="fp-hint">${parts.join(' ')}</div>${sell}`;
  }

  update(g: Game) {
    const s = g.state;
    const k = s.keeper;
    const proj = this.project();
    const f = k.alive && !g.over ? g.focus() : null;
    if (f) {
      const opts = f.options.length > 1
        ? `<div class="fp-opt"><kbd>Q</kbd> ◀ <b>${f.options[f.optionIndex].label}</b> ▶ <kbd>E</kbd> <span class="n">${f.optionIndex + 1}/${f.options.length}</span></div>`
        : f.options.length === 1 && f.kind === 'nest' ? `<div class="fp-opt"><b>${f.options[0].label}</b></div>` : '';
      const extra = f.kind === 'treasury' ? `<div class="fp-role">В Казне <b>${s.amber}</b> · кошель ${k.purse}/${g.purseCap()}</div>` : '';
      const html = `<div class="fp-head"><img src="${icon(this.iconOf(g, f))}"><b>${f.label}</b></div>
        <div class="fp-role">${f.role}</div>${extra}${opts}${this.priceHtml(g, f)}${this.hint(g, f)}`;
      if (html !== this.sig) { this.sig = html; this.plate.innerHTML = html; }
      const y = f.underground && f.kind !== 'well' && f.kind !== 'nest' ? WORLD.groundY - 30 : WORLD.groundY - 50;
      const [px, py] = proj(f.x, y);
      this.plate.style.left = `${px}px`;
      this.plate.style.top = `${py}px`;
      this.plate.classList.add('show');
      this.plate.classList.toggle('dim', !f.canAct);
    } else {
      this.plate.classList.remove('show');
      this.sig = '';
    }
    // the purse rides above the Keeper
    if (k.alive && !g.over) {
      const [px, py] = proj(k.x, WORLD.groundY - 30);
      const cap = g.purseCap();
      const txt = `<img src="${icon('amber')}">${k.purse}<span class="cap">/${cap}</span>`;
      if (this.purse.innerHTML !== txt) this.purse.innerHTML = txt;
      this.purse.classList.toggle('full', k.purse >= cap);
      this.purse.style.left = `${px}px`;
      this.purse.style.top = `${py}px`;
      this.purse.classList.toggle('show', !f || f.kind !== 'treasury');
    } else this.purse.classList.remove('show');
    // the Treasury count over the hollow when the Keeper is near (not when the plate shows it)
    const hx = WORLD.treeX + INWORLD.treasury;
    const near = Math.abs(k.x - hx) < 90 && f?.kind !== 'treasury' && !g.over;
    if (near) {
      const [px, py] = proj(hx, WORLD.groundY - 18);
      const txt = `<img src="${icon('amber')}">${s.amber}`;
      if (this.treasury.innerHTML !== txt) this.treasury.innerHTML = txt;
      this.treasury.style.left = `${px}px`;
      this.treasury.style.top = `${py}px`;
    }
    this.treasury.classList.toggle('show', near);
  }
}
