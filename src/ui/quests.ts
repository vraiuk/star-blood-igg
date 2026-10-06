import type { Game } from '../sim/game';

/**
 * Onboarding as the Observer's Tasks («Задание Наблюдателя Единства!»): one clear goal at a
 * time, the relevant UI element glows, a small reward on completion.
 */
export interface Quest {
  id: string;
  text: string;
  /** CSS selector of the UI element to highlight (optional) */
  focus?: string;
  /** world hint shown in the tip line */
  hint?: string;
  reward: number;
  done: (g: Game) => boolean;
}

const has = (g: Game, f: string, pred: (t: number) => boolean = () => true) =>
  g.state.structures.some((s) => s.family === f && pred(s.tier));

export const QUESTS: Quest[] = [
  { id: 'hive', text: 'Призови Улей светляков на золотой руне у Семени', hint: 'Кликни по руне со столбом света рядом с Древом', reward: 15, done: (g) => has(g, 'hive') },
  { id: 'beetle', text: 'Призови Светожука-щитоносца — он перекроет путь тварям', hint: 'Светожук ставится дальше от ствола, перед ульем', reward: 15, done: (g) => has(g, 'beetle') },
  { id: 'night', text: 'Призови ночь и переживи её', focus: '#callnight', hint: '<kbd>Пробел</kbd> — призвать ночь раньше (+Янтарь)', reward: 20, done: (g) => g.state.night >= 1 },
  { id: 'grow', text: 'Вырасти Древо: открой Древо и вложи Янтарь', focus: '#treebar', hint: 'Кликни по Древу или по полосе здоровья наверху', reward: 25, done: (g) => g.state.tree.stage >= 1 },
  { id: 'spider', text: 'Поставь Паука-ткача в корневой котёл', hint: 'Корневые узлы — светящиеся кольца под Древом', reward: 20, done: (g) => has(g, 'spider') },
  { id: 'upgrade', text: 'Усиль любое гнездо до 2-го уровня', hint: 'Кликни по гнезду → кольцо → «Уровень 2» [U]', reward: 20, done: (g) => g.state.structures.some((s) => s.tier >= 1) },
  { id: 'crown', text: 'Поставь гнездо в крону Древа (соты, лекари, гусеницы)', hint: 'Слоты кроны — кольца среди ветвей', reward: 25, done: (g) => g.state.structures.some((s) => s.crown) },
  { id: 'tablet', text: 'Открой Скрижаль Восходящего и купи Свойство или Повышение руны', focus: '.btn.keeper', hint: '<kbd>R</kbd> — Скрижаль. Звёздную Кровь роняют Черви', reward: 30,
    done: (g) => Object.values(g.state.keeper.props).some((p) => p.length > 0) || Object.values(g.state.keeper.runeRank).some((r) => r > 0) },
  { id: 'spec', text: 'Выбери специализацию гнезда на 3-м уровне', hint: 'Гнездо 2-го ур. → кольцо → два пути [Q]/[E]', reward: 40, done: (g) => g.state.structures.some((s) => s.spec) },
  { id: 'rank', text: 'Возвысь Восходящего до Бронзы', focus: '.btn.keeper', hint: 'Скрижаль [R] → «Восхождение»', reward: 40, done: (g) => g.state.keeper.rank >= 1 },
];

