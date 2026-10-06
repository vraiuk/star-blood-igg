import type { LobbyView } from '../net/coop';
import { KEEPER_COLORS } from '../render/sprites';
import type { Game } from '../sim/game';

/**
 * Co-op UI: the lobby block on the title screen and the roster of Ascended during a run.
 */

const CSS = `
.coop-lobby { margin: calc(6 * var(--u)) auto; padding: calc(5 * var(--u)) calc(8 * var(--u)); max-width: calc(300 * var(--u));
  border: 1px solid rgba(255, 210, 120, 0.35); background: rgba(10, 8, 20, 0.6); font-family: var(--text); font-size: calc(6.5 * var(--u)); color: var(--ink); }
.coop-lobby .who { display: flex; gap: calc(6 * var(--u)); justify-content: center; flex-wrap: wrap; margin-top: calc(3 * var(--u)); }
.coop-lobby .seat { display: inline-flex; align-items: center; gap: calc(3 * var(--u)); opacity: 0.95; }
.coop-lobby .seat.empty { opacity: 0.35; }
.coop-dot { display: inline-block; width: calc(5 * var(--u)); height: calc(5 * var(--u)); border: 1px solid #000; }
.coop-roster { position: absolute; left: calc(6 * var(--u)); bottom: calc(40 * var(--u)); pointer-events: none; font-family: var(--text);
  font-size: calc(6 * var(--u)); color: var(--ink); display: flex; flex-direction: column; gap: calc(2 * var(--u)); text-shadow: 0 1px 0 #000; }
.coop-roster .row { display: flex; align-items: center; gap: calc(3 * var(--u)); }
.coop-roster .dead { opacity: 0.45; text-decoration: line-through; }
.coop-roster .warn { color: #ff9a7a; }
.coop-roster.hidden { display: none; }
`;

/** Names of the seats, in cloak colour order. */
export const SEAT_NAMES = ['Бледный', 'Лазурный', 'Багряный', 'Нефритовый'];

const dot = (i: number) => `<span class="coop-dot" style="background:${(KEEPER_COLORS[i] ?? KEEPER_COLORS[0]).c1}"></span>`;

export class CoopPanel {
  private roster: HTMLElement;
  private sig = '';
  /** shown in the roster: the host paused / the peers drifted apart */
  hostPaused = false;
  desync = false;

  constructor(private root: HTMLElement) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    this.roster = document.createElement('div');
    this.roster.className = 'coop-roster hidden';
    root.appendChild(this.roster);
  }

  /** Put the lobby block into the title screen and set up its start button. */
  renderLobby(v: LobbyView) {
    const start = this.root.querySelector('.screen [data-a=start]') as HTMLButtonElement | null;
    if (!start) return;
    const box = start.closest('.box')!;
    let lobby = box.querySelector('.coop-lobby') as HTMLElement | null;
    if (!lobby) {
      lobby = document.createElement('div');
      lobby.className = 'coop-lobby';
      start.closest('.row')!.before(lobby);
    }
    const seats = Array.from({ length: 4 }, (_, i) => {
      const id = v.ids[i];
      const me = i === v.you && v.you >= 0 && v.role !== 'offline';
      return `<span class="seat${id ? '' : ' empty'}">${dot(i)} ${SEAT_NAMES[i]}${me ? ' (ты)' : ''}${i === 0 && id && v.role !== 'offline' ? ' · хост' : ''}</span>`;
    }).join('');
    lobby.innerHTML = `<div><b>Онлайн-кооп</b> · ${v.note}</div>${v.role === 'offline' ? '' : `<div class="who">${seats}</div>`}`;
    const n = v.ids.length;
    start.disabled = !(v.role === 'host' || v.role === 'offline');
    start.textContent = v.role === 'host' ? (n > 1 ? `Хранить Древо вместе (${n})` : 'Хранить Древо (пока один)')
      : v.role === 'offline' ? 'Хранить Древо одному'
      : v.role === 'guest' ? (v.running ? 'Игра идёт…' : 'Ждём хоста…')
      : v.role === 'lost' ? 'Нет связи' : 'Ищем лобби…';
  }

  /** Roster of the Ascended during a run (hidden in a solo run). */
  update(game: Game | null, inRun: boolean, lag: number) {
    const ks = game?.state.keepers ?? [];
    if (!game || !inRun || ks.length < 2) {
      if (this.sig !== 'off') { this.sig = 'off'; this.roster.classList.add('hidden'); }
      return;
    }
    const rows = ks.map((k, i) => `<div class="row${k.alive ? '' : ' dead'}">${dot(i)} ${SEAT_NAMES[i]}${i === game.local ? ' (ты)' : ''}</div>`).join('');
    const extra = (this.hostPaused ? '<div class="row warn">⏸ Хост поставил паузу</div>' : '')
      + (this.desync ? '<div class="row warn">⚠ Рассинхрон миров — перезапустите забег</div>' : '')
      + (lag > 20 ? `<div class="row warn">Отставание ${Math.round(lag / 60 * 1000)} мс</div>` : '');
    const sig = rows + extra;
    if (sig === this.sig) return;
    this.sig = sig;
    this.roster.innerHTML = sig;
    this.roster.classList.remove('hidden');
  }
}
