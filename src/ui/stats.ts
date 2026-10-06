import { ENEMIES, type EnemyKind } from '../data/balance';
import { clearRunLogs, downloadRunLogs, loadRunLogs, type RunLog } from '../state/runlog';
import { VERSION, VERSION_LABEL } from '../version';

/** Readable names of damage sources in run logs. */
const SRC: Record<string, string> = {
  spear: 'Копьё', hammer: 'Молот', starfall: 'Звездопад', radiance: 'Сияние', swarm: 'Зов Роя', timestop: 'Остановка',
  keeper: 'Аура Хранителя', tree: 'Древо (свет, искры)', hive: 'Ульи', beetle: 'Светожуки', dragonfly: 'Стрекозы',
  spider: 'Пауки', termite: 'Термиты', thorns: 'Шипы гнёзд', mender: 'Лекари', other: 'прочее',
};
const KEEPER_SRC = new Set(['spear', 'hammer', 'starfall', 'radiance', 'swarm', 'timestop', 'keeper']);

const bar = (label: string, v: number, max: number, color: string, extra = '') =>
  `<div class="st-bar"><span>${label}</span><i style="--w:${max > 0 ? (v / max) * 100 : 0}%;--c:${color}"></i><b>${extra}</b></div>`;

function summary(logs: RunLog[]): string {
  if (!logs.length) return '<p class="st-empty">Забегов пока нет. Сыграй — каждый забег записывается сюда.</p>';
  const avg = logs.reduce((a, l) => a + l.nights, 0) / logs.length;
  const best = Math.max(...logs.map((l) => l.nights));
  const dmg: Record<string, number> = {};
  const casts: Record<string, number> = {};
  const killers: Record<string, number> = {};
  for (const l of logs) {
    for (const [k, v] of Object.entries(l.dmg)) dmg[k] = (dmg[k] ?? 0) + v;
    for (const [k, v] of Object.entries(l.casts)) casts[k] = (casts[k] ?? 0) + v;
    for (const [k, v] of Object.entries(l.treeDmgBy)) killers[k] = (killers[k] ?? 0) + v;
  }
  const total = Object.values(dmg).reduce((a, v) => a + v, 0) || 1;
  const keeperTotal = Object.entries(dmg).filter(([k]) => KEEPER_SRC.has(k)).reduce((a, [, v]) => a + v, 0) || 1;
  const sorted = Object.entries(dmg).sort((a, b) => b[1] - a[1]);
  const maxD = sorted[0]?.[1] ?? 1;
  const keeperRows = sorted.filter(([k]) => KEEPER_SRC.has(k));
  const castRows = Object.entries(casts).sort((a, b) => b[1] - a[1]);
  const maxC = castRows[0]?.[1] ?? 1;
  const killRows = Object.entries(killers).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const maxK = killRows[0]?.[1] ?? 1;
  return `
    <div class="st-cards">
      <div><b>${logs.length}</b><span>забегов</span></div>
      <div><b>${avg.toFixed(1)}</b><span>ночей в среднем</span></div>
      <div><b>${best}</b><span>лучший</span></div>
      <div><b>${Math.round((keeperTotal / total) * 100)}%</b><span>урона — Хранитель</span></div>
    </div>
    <div class="st-cols">
      <div><h3>Весь урон</h3>${sorted.map(([k, v]) => bar(SRC[k] ?? k, v, maxD, KEEPER_SRC.has(k) ? '#8fd0ff' : '#ffc847', `${Math.round((v / total) * 100)}%`)).join('')}</div>
      <div><h3>Руны Хранителя</h3>${keeperRows.map(([k, v]) => bar(SRC[k] ?? k, v, keeperRows[0][1], '#8fd0ff', `${Math.round((v / keeperTotal) * 100)}%`)).join('') || '<p class="st-empty">—</p>'}
        <h3>Применения</h3>${castRows.map(([k, v]) => bar(SRC[k] ?? k, v, maxC, '#b48cff', String(Math.round(v / logs.length)) + '/забег')).join('') || '<p class="st-empty">—</p>'}
        <h3>Кто бил Древо</h3>${killRows.map(([k, v]) => bar(ENEMIES[k as EnemyKind]?.name ?? k, v, maxK, '#ff7a6a', String(Math.round(v)))).join('')}</div>
    </div>`;
}

function runRow(l: RunLog): string {
  const top = Object.entries(l.dmg).filter(([k]) => KEEPER_SRC.has(k)).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k]) => SRC[k] ?? k).join(', ');
  return `<tr><td>${l.version ? `v${l.version}` : '—'}</td><td>${new Date(l.date).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })} ${new Date(l.date).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</td>
    <td>${l.path}</td><td><b>${l.nights}</b>${l.result === 'quit' ? ' <small>(вышел)</small>' : ''}</td><td>${l.tree.stage}${l.tree.rings ? ` +${l.tree.rings}` : ''}</td>
    <td>${l.keeper.learned.length}</td><td>${top || '—'}</td><td>${l.keeperDeaths}</td><td>${l.rushes}</td></tr>`;
}

/** Statistics screen over the locally stored run logs. */
export function openStats(root: HTMLElement, onClose: () => void) {
  const el = document.createElement('div');
  el.className = 'screen st-screen';
  let onlyCurrent = true;
  const render = () => {
    const all = loadRunLogs();
    const logs = onlyCurrent ? all.filter((l) => l.version === VERSION) : all;
    el.innerHTML = `<div class="box st-box">
      <div class="kicker">Летопись Наблюдателя · ${VERSION_LABEL}</div><h1>Статистика забегов</h1>
      <div class="row"><button class="btn ${onlyCurrent ? 'gold' : ''}" data-a="cur">Эта версия (${all.filter((l) => l.version === VERSION).length})</button>
        <button class="btn ${onlyCurrent ? '' : 'gold'}" data-a="all">Все версии (${all.length})</button></div>
      ${summary(logs)}
      ${logs.length ? `<h3>Последние забеги</h3><div class="st-table"><table>
        <tr><th>Версия</th><th>Когда</th><th>Тропа</th><th>Ночей</th><th>Древо</th><th>Рун</th><th>Главные руны</th><th>Смертей</th><th>Натиск</th></tr>
        ${logs.slice().reverse().slice(0, 15).map(runRow).join('')}</table></div>` : ''}
      <div class="row">
        <button class="btn" data-a="dl" ${logs.length ? '' : 'disabled'}>Скачать JSON</button>
        <button class="btn" data-a="clear" ${logs.length ? '' : 'disabled'}>Очистить</button>
        <button class="btn gold" data-a="back">Назад</button>
      </div></div>`;
    el.querySelector('[data-a=dl]')?.addEventListener('click', () => downloadRunLogs());
    el.querySelector('[data-a=cur]')?.addEventListener('click', () => { onlyCurrent = true; render(); });
    el.querySelector('[data-a=all]')?.addEventListener('click', () => { onlyCurrent = false; render(); });
    el.querySelector('[data-a=clear]')?.addEventListener('click', () => { clearRunLogs(); render(); });
    el.querySelector('[data-a=back]')!.addEventListener('click', close);
  };
  const close = () => { el.remove(); window.removeEventListener('keydown', onKey, true); onClose(); };
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } };
  window.addEventListener('keydown', onKey, true);
  render();
  root.appendChild(el);
}
