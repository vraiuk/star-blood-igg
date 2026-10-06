import Peer, { type DataConnection } from 'peerjs';
import type { ModPatch } from '../data/mods';
import { Game, MAX_KEEPERS } from '../sim/game';
import { VERSION } from '../version';

/**
 * Online co-op over WebRTC (PeerJS for signalling).
 *
 * One shared lobby, no rooms: everybody who opens the page knocks on the same well-known
 * peer id. If nobody answers, this tab claims that id and becomes the host; the others join
 * it (up to MAX_KEEPERS players in all).
 *
 * Lockstep with a host clock: the host runs the simulation in real time and, every tick,
 * stamps the commands it got so far (its own and the guests') with the tick number. Guests
 * replay exactly those frames in order — the simulation is deterministic, so every peer sees
 * the same world. Nobody ever waits for a slow guest; a guest's own input just comes back
 * one round-trip later. A digest every few seconds catches peers that drift apart.
 */

/** Same build only: a different simulation would desync at once. */
const LOBBY_ID = `star-blood-igg-coop-${VERSION.replace(/\W/g, '-')}${import.meta.env?.DEV ? '-dev' : ''}`;
/** Ticks between state digests. */
const DIGEST_EVERY = 120;
/** A guest keeps this many ticks in hand against network jitter. */
const GUEST_BUFFER = 4;
/** Give up on a host that doesn't answer. */
const CONNECT_TIMEOUT = 9000;
/** The signalling server drops a socket now and then (often right after another one closed): retry. */
const NET_RETRIES = 4;
const isNetError = (t: string) => t === 'network' || t === 'server-error' || t === 'socket-error' || t === 'socket-closed';
/**
 * Our own peer id for guests. Without one PeerJS first fetches an id over HTTP from the
 * signalling server — a request ad/tracker blockers and some networks cut ("server-error");
 * with it only the WebSocket is needed, same as for the host.
 */
const guestId = () => `igg-${typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36)}`;
/** What went wrong, for the lobby line (the type alone says little). */
const why = (err: { type: string; message?: string }) => `${err.type}${err.message ? `: ${err.message}` : ''}`;

/** What a run is started with — the same on every peer. */
export interface StartInfo {
  seed: number;
  players: number;
  path: number;
  meta: ModPatch[];
  startRune: boolean;
}

/** A command as stamped into a frame: tick offset, player, method, args, choice signature. */
type FrameCmd = [number, number, string, unknown[], string?];

type Msg =
  | { t: 'lobby'; ids: string[]; you: number; running: boolean }
  | { t: 'full' }
  | { t: 'start'; info: StartInfo; you: number }
  | { t: 'cmd'; m: string; a: unknown[]; s?: string }
  | { t: 'f'; at: number; n: number; c: FrameCmd[] }
  | { t: 'h'; tick: number; h: number }
  | { t: 'pause'; on: boolean };

export type Role = 'connecting' | 'host' | 'guest' | 'offline' | 'lost';

export interface LobbyView {
  role: Role;
  /** players in the lobby, host first (peer ids) */
  ids: string[];
  /** our seat in the lobby / in the running game (-1: waiting for the next run) */
  you: number;
  /** a run is under way on the host */
  running: boolean;
  /** human-readable state line */
  note: string;
}

export interface CoopEvents {
  /** the lobby changed (players, role, status) */
  lobby(v: LobbyView): void;
  /** a run starts on every peer: build the Game from `info`, play as keeper `you` */
  start(info: StartInfo, you: number): void;
  /** the host paused / resumed */
  paused(on: boolean): void;
  /** the peers' worlds drifted apart */
  desync(tick: number): void;
}

export class Coop {
  role: Role = 'connecting';
  private peer: Peer | null = null;
  /** host: guests in join order; guest: the link to the host */
  private guests: DataConnection[] = [];
  private host: DataConnection | null = null;
  /** host: seat of each guest in the running game */
  private seats = new Map<DataConnection, number>();
  private lobbyIds: string[] = [];
  private you = 0;
  private running = false;
  private note = 'Ищем лобби…';

  // lockstep
  private game: Game | null = null;
  private tick = 0;
  /** host: commands waiting for the next tick */
  private inbox: Array<[number, string, unknown[], string?]> = [];
  /** host: frames run since the last flush */
  private out: FrameCmd[] = [];
  private outAt = 0;
  private outN = 0;
  private digests: Array<{ tick: number; h: number }> = [];
  /** guest: received frames not yet run */
  private frames: FrameCmd[][] = [];
  private expect = new Map<number, number>();
  private acc = 0;

  constructor(private ev: CoopEvents) {}

  // ───────────────────────────── lobby ─────────────────────────────

  private retries = 0;

  /** Retry a flaky signalling step a few times before falling back to solo play. */
  private retryOr(err: { type: string; message?: string }, again: () => void) {
    if (isNetError(err.type) && this.retries < NET_RETRIES) {
      this.retries++;
      this.setNote('connecting', `Сигнальный сервер не отвечает, пробуем ещё раз (${this.retries}/${NET_RETRIES})…`);
      setTimeout(again, 400 * this.retries + Math.random() * 300);
      return;
    }
    this.offline(`Сеть недоступна (${why(err)}). Проверь блокировщик рекламы для 0.peerjs.com. Можно играть одному.`);
  }

  /** Find the shared lobby: join its host or become it. */
  connect() {
    this.reset();
    this.setNote('connecting', 'Ищем лобби…');
    const me = new Peer(guestId(), { debug: 1 });
    this.peer = me;
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      this.offline('Хост не отвечает (сеть или NAT). Можно играть одному.');
    }, CONNECT_TIMEOUT);
    me.on('error', (err) => {
      if (settled) return;
      if (err.type === 'peer-unavailable') {
        // nobody holds the lobby: take it
        settled = true;
        clearTimeout(timer);
        me.destroy();
        setTimeout(() => this.becomeHost(), 250);
        return;
      }
      settled = true;
      clearTimeout(timer);
      me.destroy();
      this.retryOr(err, () => this.connect());
    });
    me.on('open', () => {
      const conn = me.connect(LOBBY_ID, { reliable: true, serialization: 'json' });
      conn.on('open', () => {
        if (settled) { conn.close(); return; }
        settled = true;
        clearTimeout(timer);
        this.host = conn;
        this.retries = 0;
        this.role = 'guest';
        this.setNote('guest', 'В лобби. Ждём, когда хост начнёт.');
      });
      conn.on('data', (d) => this.fromHost(d as Msg));
      conn.on('close', () => this.hostLost());
      conn.on('error', () => this.hostLost());
    });
  }

  private becomeHost() {
    const p = new Peer(LOBBY_ID, { debug: 1 });
    this.peer = p;
    p.on('open', () => {
      this.role = 'host';
      this.retries = 0;
      this.lobbyIds = [p.id];
      this.you = 0;
      this.setNote('host', 'Ты хост лобби. Остальные подключатся, открыв эту же страницу.');
    });
    p.on('error', (err) => {
      if (err.type === 'unavailable-id' && this.role === 'connecting') {
        // someone else claimed the lobby a moment earlier: join them instead
        p.destroy();
        setTimeout(() => this.connect(), 300 + Math.random() * 700);
        return;
      }
      if (this.role === 'connecting') { p.destroy(); this.retryOr(err, () => this.becomeHost()); }
    });
    p.on('disconnected', () => { if (!p.destroyed) p.reconnect(); });
    p.on('connection', (conn) => {
      conn.on('open', () => {
        if (this.guests.length >= MAX_KEEPERS - 1) {
          conn.send({ t: 'full' } satisfies Msg);
          setTimeout(() => conn.close(), 500);
          return;
        }
        this.guests.push(conn);
        this.retries = 0;
        this.broadcastLobby();
      });
      conn.on('data', (d) => this.fromGuest(conn, d as Msg));
      const gone = () => this.guestLeft(conn);
      conn.on('close', gone);
      conn.on('error', gone);
    });
  }

  private offline(note: string) {
    this.peer?.destroy();
    this.peer = null;
    this.role = 'offline';
    this.lobbyIds = ['solo'];
    this.you = 0;
    this.setNote('offline', note);
  }

  private hostLost() {
    if (this.role !== 'guest') return;
    this.role = 'lost';
    this.game = null;
    this.setNote('lost', 'Хост вышел из игры. Обнови страницу, чтобы найти лобби заново.');
  }

  private guestLeft(conn: DataConnection) {
    if (!this.guests.includes(conn)) return;
    this.guests = this.guests.filter((c) => c !== conn);
    const seat = this.seats.get(conn);
    this.seats.delete(conn);
    // the Ascended of a player who left stops where they stood
    if (seat !== undefined && this.game) this.inbox.push([seat, 'setMove', [0]]);
    this.broadcastLobby();
  }

  private broadcastLobby() {
    if (this.role !== 'host') return;
    this.lobbyIds = [this.peer?.id ?? 'host', ...this.guests.map((c) => c.peer)];
    for (const c of this.guests) {
      const seat = this.running ? this.seats.get(c) ?? -1 : this.guests.indexOf(c) + 1;
      c.send({ t: 'lobby', ids: this.lobbyIds, you: seat, running: this.running } satisfies Msg);
    }
    this.emitLobby();
  }

  private setNote(role: Role, note: string) {
    this.role = role;
    this.note = note;
    this.emitLobby();
  }

  private emitLobby() {
    this.ev.lobby({ role: this.role, ids: this.lobbyIds, you: this.you, running: this.running, note: this.note });
  }

  /** Can this peer start a run (host or alone)? */
  get canStart() { return this.role === 'host' || this.role === 'offline'; }
  get isGuest() { return this.role === 'guest'; }

  /** Host: start a run with everyone in the lobby. */
  start(info: Omit<StartInfo, 'players'>) {
    if (!this.canStart) return;
    const players = 1 + this.guests.length;
    const full: StartInfo = { ...info, players };
    this.seats.clear();
    this.guests.forEach((c, i) => {
      this.seats.set(c, i + 1);
      c.send({ t: 'start', info: full, you: i + 1 } satisfies Msg);
    });
    this.running = true;
    this.you = 0;
    this.broadcastLobby();
    this.ev.start(full, 0);
  }

  /** Host: the run is over — newcomers may take a seat in the next one. */
  ended() {
    if (!this.running) return;
    this.running = false;
    this.broadcastLobby();
  }

  /** Host: pause or resume everyone. */
  setPaused(on: boolean) {
    if (this.role !== 'host') return;
    for (const c of this.guests) c.send({ t: 'pause', on } satisfies Msg);
  }

  // ───────────────────────────── messages ──────────────────────────

  private fromHost(m: Msg) {
    switch (m.t) {
      case 'lobby':
        this.lobbyIds = m.ids;
        this.you = m.you;
        this.running = m.running;
        this.note = m.you < 0 ? 'Игра уже идёт — ты в очереди на следующий забег.' : 'В лобби. Ждём, когда хост начнёт.';
        this.emitLobby();
        break;
      case 'full':
        this.role = 'lost';
        this.setNote('lost', `В лобби уже ${MAX_KEEPERS} хранителя. Попробуй позже.`);
        break;
      case 'start':
        this.you = m.you;
        this.running = true;
        this.ev.start(m.info, m.you);
        break;
      case 'f':
        for (let i = 0; i < m.n; i++) this.frames.push([]);
        for (const c of m.c) this.frames[this.frames.length - m.n + c[0]].push(c);
        break;
      case 'h':
        this.expect.set(m.tick, m.h);
        break;
      case 'pause':
        this.ev.paused(m.on);
        break;
      default: break;
    }
  }

  private fromGuest(conn: DataConnection, m: Msg) {
    if (m.t !== 'cmd' || !this.game) return;
    const seat = this.seats.get(conn);
    if (seat === undefined || !Game.COMMANDS.has(m.m) || !Array.isArray(m.a)) return;
    this.inbox.push([seat, m.m, m.a, m.s]);
  }

  // ───────────────────────────── lockstep ──────────────────────────

  /** Attach the freshly built Game of a run. */
  attach(game: Game) {
    this.game = game;
    this.tick = 0;
    this.inbox = [];
    this.out = [];
    this.outAt = 0;
    this.outN = 0;
    this.digests = [];
    this.frames = [];
    this.expect.clear();
    this.acc = 0;
  }

  /** Send a command of the local player (guests: to the host; host: into the next tick). */
  send(method: string, args: unknown[], sig?: string) {
    if (!this.game) return;
    if (this.role === 'guest') this.host?.send({ t: 'cmd', m: method, a: args, s: sig } satisfies Msg);
    else this.inbox.push([this.you, method, args, sig]);
  }

  /** Run one tick of the simulation with these commands (same on every peer). */
  private runTick(g: Game, cmds: Iterable<[number, string, unknown[], string?]>) {
    for (const [p, m, a, s] of cmds) g.exec(p, m, a, s);
    // a pending choice holds the world still, but ticks keep counting so picks can arrive
    if (!g.choice && !g.over) g.step();
    this.tick++;
  }

  /** Host: advance `n` ticks now, stamping the queued commands into the first one. */
  hostTicks(n: number) {
    const g = this.game;
    if (!g) return;
    for (let i = 0; i < n; i++) {
      const cmds = this.inbox.splice(0);
      for (const [p, m, a, s] of cmds) this.out.push([this.outN, p, m, a, s]);
      if (this.outN === 0) this.outAt = this.tick;
      this.outN++;
      this.runTick(g, cmds);
      if (this.tick % DIGEST_EVERY === 0) this.digests.push({ tick: this.tick, h: g.digest() });
    }
  }

  /** Host: ship the frames of this animation frame to every guest. */
  flush() {
    if (this.role !== 'host' || (!this.outN && !this.digests.length)) return;
    const frame: Msg = { t: 'f', at: this.outAt, n: this.outN, c: this.out };
    for (const c of this.guests) {
      if (!this.seats.has(c)) continue;
      if (this.outN) c.send(frame);
      for (const d of this.digests) c.send({ t: 'h', tick: d.tick, h: d.h } satisfies Msg);
    }
    this.out = [];
    this.outN = 0;
    this.digests = [];
  }

  /** Guest: run the received frames at real-time pace, catching up when they pile up. */
  guestTicks(dt: number) {
    const g = this.game;
    if (!g) return 0;
    this.acc += dt;
    let want = Math.floor(this.acc / (1 / 60));
    this.acc -= want / 60;
    const backlog = this.frames.length - want;
    if (backlog > GUEST_BUFFER * 2) want += backlog - GUEST_BUFFER;
    if (want > this.frames.length) { want = this.frames.length; this.acc = 0; }
    for (let i = 0; i < want; i++) {
      const f = this.frames.shift()!;
      this.runTick(g, f.map((c) => [c[1], c[2], c[3], c[4]] as [number, string, unknown[], string?]));
      const h = this.expect.get(this.tick);
      if (h !== undefined) {
        this.expect.delete(this.tick);
        if (h !== g.digest()) this.ev.desync(this.tick);
      }
    }
    return want;
  }

  /** Guest: ticks received but not yet run (≈ delay behind the host). */
  get lag() { return this.frames.length; }

  private reset() {
    this.peer?.destroy();
    this.peer = null;
    this.guests = [];
    this.host = null;
    this.seats.clear();
    this.running = false;
    this.game = null;
  }
}

/**
 * Wrap a Game so the UI's commands go through the network instead of mutating the world
 * directly; everything else (reads, previews) passes straight through.
 */
export function commandProxy(game: Game, coop: Coop): Game {
  return new Proxy(game, {
    get(target, prop) {
      if (typeof prop === 'string' && Game.COMMANDS.has(prop)) {
        return (...args: unknown[]) => {
          const sig = prop === 'choose' || prop === 'rerollDawn' ? target.choiceSig() : undefined;
          coop.send(prop, args, sig);
          // optimistic: the command lands one tick (host) or one round-trip (guest) later
          return prop === 'feed' ? 0 : true;
        };
      }
      const v = Reflect.get(target, prop, target) as unknown;
      return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(target) : v;
    },
  });
}
