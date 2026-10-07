# v3: фидбек первой итерации → изменения

| Фидбек | Решение |
|---|---|
| Геймплей короткий, к концу монстры слабые | **10 ночей** вместо 5, две ночи с боссом (5 и 10). Здоровье тварей растёт круче. Новые твари: **бронированные** (плоская броня режет слабые попадания) и **элитные** |
| Не хватает валюты на классные постройки | Доход Янтаря примерно ×1.6, а топовые формы дорогие. Так появляется цель копить |
| Лучшие постройки перебафаны | Сила гнёзд пересчитана под «жирных» тварей. Луч остаётся ответом на броню |
| Стрекозы непонятные | Новая роль — **Высвечивание**: твари в их свете получают **+35% урона от всех** (видимая золотая обводка). Свет стрекоз жжёт Червей |
| Червей держат 2 паука, качать не нужно | Червей больше, появляются **бронированные** черви и **Рой личинок**. Черви кусают пауков (у паука есть прочность), поэтому охват и урон важны |
| Корни бесполезны, скиллы Хранителя слабые | **Корни убраны.** Урон Копья и Молота поднят примерно ×1.8, Звездопад сильнее |
| Камни-жуки непонятно зачем качать | Жук **притягивает** всех тварей ближнего боя (провокация), у него шипы с 1 уровня, полоса прочности видна всегда. С жирными тварями без прокачки он не держит |
| Свет Древа ночью должен жечь червей | **Любой свет жжёт Червей** (Игг-свет): постоянный урон, и он растёт со стадией Древа |
| Древо в начале крошечное, в конце огромное с широкой кроной | Росток в 1 пиксель → гигантская крона на весь экран. Радиус Круга от 70 до 440 |
| Камера отдаляется с ростом, карта больше | Мир 960×540. Камера плавно отдаляется: на старте показывает 640×360, в конце весь мир |
| Стадии Древа не по лору | Стадии из книг (см. разбор книг ниже) |
| Покупать у Наблюдателя улучшения за Звёздную Кровь | **Лавка Наблюдателя (Скрижаль)**: новые руны и грани для них за Звёздную Кровь |
| У каждой руны 3 слота улучшений, редкая руна даёт 4-й | Руны-Умения (Копьё, Молот, Звездопад) и Руна Света имеют по **3 слота граней**. Редкий дроп **Малая Руна Развития** открывает **4-й слот** |
| Свет восстанавливается быстрее у Древа | Реген Света ×1.8 у ствола, падает до ×0.3 за краем Круга |

## Бесконечный режим (v3.1)
Ночи 1–10 сделаны вручную: обучение, сюжет, боссы на 5-й и 10-й. На 10-й ночи веха
«Тот-Кто-Посадил-новое-Древо!» и звёзды. Дальше идёт **бесконечная ночь**: процедурный
генератор по бюджету угрозы (`src/data/nights.ts`, `ENDLESS`), босс каждые 5 ночей,
после 20-й боссов больше. Игра кончается только гибелью Древа, цель — рекорд ночей
(сохраняется по каждой Тропе).

Кривые (n — номер ночи с 0):
- здоровье тварей `(1 + 0.2n + 0.025n²) · 1.06^(n−9)`: ×4.8 к 10-й ночи, ×25 к 20-й, ×89 к 30-й;
- урон `(1 + 0.12n) · 1.03^(n−9)`;
- награды `1 + 0.04n` (Звёздная Кровь растёт как корень из этого множителя);
- бюджет угрозы генератора `90 + 11n`.

Ботами: сильный игрок доживает примерно до 27-й ночи (≈45 мин), «обычный» до 22–27.
Весь контент открывается к 10–12-й ночи.

## v3.2: второй плейтест
| Фидбек | Решение |
|---|---|
| Не видно HP Восходящего | Полоса HP над героем и в HUD рядом со Светом |
| Древо слишком дёшево апнулось до конца | Рост: 55 / 150 / 400 / 950 / 2000 Янтаря. Доход урезан, рост наград 2% за ночь |
| Игг-Луч перезаряжается слишком быстро | Перезарядка 1.7 → 2.8 с (мастерство 2.4 с) |
| Надоело бегать за добычей | **Кокон гусениц**: сборщицы сами несут добычу к Древу. Спец.: Шелкопряды (больше, быстрее, дальше) и Медовые (+35–60% к добыче). Корни Древа тянут добычу рядом со стволом |
| Мало сильных тварей | **Имаго-Жнец** (бронированный богомол, ломает гнёзда), больше Ледозубов и Стражей. Черви растут ещё на 6% за ночь |
| Звездопад без импакта | Удар 520 по радиусу 34, оглушение, горит 5 с, вспышка на весь экран. Перезарядка 70 с |
| Некуда девать ресурсы в конце | Янтарь → **Годичные кольца** Древа (бесконечно: +7% силы гнёзд, +10% HP). Кровь и Руны Развития → **Атрибуты** Сила/Дух/Тело (10/10) |
| Восходящий на «Небе» хлипкий | Ранги дороже (20/50/100/180), зато защита до 60%, сияние жжёт тварей вплотную до 140/с, HP до 500 |
| Ускорение | ×1 → ×2 → ×5 (клавиша F) |

Ботами: сильный игрок доживает до 17–19-й ночи (≈27 мин), «обычный» до 18-й или срывается на 3–4-й.

## v3.3: руны с тактикой и цена гибели
- **Ранги рун** (Свойство «Повышение» из книг) за Звёздную Кровь: 12/25/45/80. Урон ×1.35/1.8/2.4/3.2, площадь до ×1.5, перезарядка до −20%.
- **Формы** на «Серебре» (выбор 1 из 2) меняют тактику: Копьё — Веер Игг / Пронзающий луч; Молот — Сотрясение Тверди / Купол Сияния; Звездопад — Сверхзвезда / Звёздный ливень. На «Небе» — **Апофеоз** формы.
- **Гибель Восходящего**: бесплатного воскрешения ночью нет. Сгорает заряд Звездопада, четверть Звёздной Крови высыпается на месте гибели (её можно подобрать). Вернуть сразу: Янтарём (60 + 25 × ночь) или Жертвой Вечности (−1 ранг сильнейшей руны или последнее Свойство). Иначе ждать рассвета.

## v3.4: ритм бесконечной ночи, котёл корней, копьё по направлению
- **Ритм**: бесконечные ночи идут циклами по 5: Тихая ночь (бюджет ×0.55) → две средние темы
  (Охота Найтволков, Рой Фуражиров, Поступь Ледозубов, Жатва, смешанная) → пик (Ночь Червей,
  Натиск с фланга и т. п., ×1.3) → босс. Базовый бюджет поднят, так что «мясо» начинается раньше.
- **Котёл корней**: корневые узлы стоят двумя дугами вокруг корневого кома (5 внутренних и 6 внешних).
  Охват паука и укусы Червей считаются по 2D-расстоянию, поэтому все внутренние пауки разом бьют
  Червя у ствола.
- **Копьё** летит туда, куда смотрит Восходящий, без прицеливания мышью.

## v4: фидбек внешнего плейтестера (Данил) + решения
| Фидбек | Решение |
|---|---|
| Нет конца забега, глобальная прогрессия не работает | После каждой ночи с боссом — **Подвиг**: «Уйти в Вечность» (Монеты ×1.5) или продолжить |
| Золото сливается с землёй, собирать руками — смерть | Капли парят и светятся с лучом до земли. **В Круге летят к Древу сами**, за краем улетают в небо, если не подобрать |
| Гнёзда и точки стройки сливаются | Тёплый контур у гнёзд, ореол на земле, руны со столбом света |
| Нет онбординга | **Задания Наблюдателя**: 10 шагов с подсветкой и наградой |
| Ветвление на 4-м уровне поздно | Специализация на **3-м** уровне (2 базовых + выбор + мастерство) |
| Не видно лечения и работы светляков | Зелёные «+», вспышки улья, яркие светляки |
| Мало построек, хочется спавнеры (Две Короны) | **Термитник**: отряд Золотых Термитов держит край Круга и сам бьёт тварей, включая плевунов |
| Твари однообразны, плевуны с двух сторон | **Элитные модификаторы** (броня/скорость/реген/взрыв) с аурой и значком, **Имаго-Прыгун** (перепрыгивает), **Имаго-Землерой** (роет в тыл), Стрекозы **сбивают плевки** |
| Подземка мёртвая | Пауки бьют и наземных тварей над котлом; Землерой атакует через подземку |
| Дерево не используется | **Слоты кроны** (Древо как башня): Улей кроны, Кокон гусениц, Медовые соты, Жуки-лекари |
| Ролл бафов не под билд | Рулетка: **по одному варианту на класс** + **переброс** за Кровь |
| Великое Древо — постройки у края карты | Мир 1440×720, камера до 1120 px: твари идут из-за края экрана |
| Новые руны поддержки | **Сияние Игг [4]** и **Зов Роя [5]** |
| Небо (на потом) | Летуны + правило: никаких башен «только по воздуху» |

## v4.1: бесконечный рост и слияние
- **Слияние** (Свойство из книг): 3 одинаковых гнезда одного ранга слияния → 1 гнездо со звездой ★ (урон +110%, прочность ×2, +бойцы/сборщицы), 2 слота свободны. Можно сливать дальше.
- **Возвышение** гнёзд после мастерства: бесконечно, +12% силы за уровень, цена 220·1.4ⁿ Янтаря. Цвет свечения меняется каждые 5 уровней (и со звёздами слияния).
- **Звёздные ранги рун** после «Неба»: бесконечно, +15% силы, цена 80·1.45ⁿ Крови. Цвет Копья и звёзд меняется по рангу.
- **Пронзающий луч** стал поддерживаемым: Восходящий замирает на 1.6 с, урон идёт тиками по всей линии.
- Гусеницы собирают по всей карте (во тьме медленнее). Термиты и гусеницы светятся. Перезарядка на кнопках не вылезает за рамку.

## v4.2 — Гнев Тьмы, кольца, лазы, крылья
- «Гнев Тьмы»: adaptive endless multiplier (state.wrath) from how close creatures got and tree damage.
- Rings visibly grow the tree (treeScale) and unlock crown slots C5..C9 every 2 rings.
- Radiance/Swarm got their own properties (4th slot is never empty).
- Ability buttons: cooldown shutter inside the button, seconds, golden "ready" glow and pop.
- Big worms toughen faster after night 10 (heavyHp/Armor/Damage), bigger packs.
- Лазы: Копатель/Страж/Землерой dig a tunnel from the Circle's edge, break out behind the
  defenses (exit = max(56, 0.3·radius)); ground creatures dive in and skip the nests. Keeper
  seals a mouth by standing on it (1.4 s), Igg-Hammer caves tunnels in, dawn collapses all.
  Surfaced worms fight on the surface (keeper can hit them).
- Air: Тенекрыл (crown nests / crown) and Имаго-Кислотник (hovers, drops acid on nests).
  Beetles, weavers, termites, hammer can't reach them; dragonflies deal ×1.6 to flyers.
- Big worms: sweeping bite (cleave) mows termite squads; «Туман Тьмы» (from night 11) blocks
  Igg-light burn/×2 and cuts aura damage to 40% inside.
- Surface/crown nest range scales with tree stage (reach ×1.0 → ×1.55); camera up to 1240.
- Feat modal removed (always continue); the start offer is titled as the first gift.

## v4.3 — Уклоны, Грани, изучение рун
- Crown slot marker: dark hollow + pale-blue ring so it reads on golden foliage; crown picks
  checked before surface nests, surface hitboxes match sprite heights.
- Igg-Beam hive: lasting 1.6 s beam (ticks 0.1 s, ignores armor, re-aims on kill).
- Dragonfly sorties: 2+tier+merge little dragonflies fly out to a lit creature within
  2.6× light radius and sting (0.22×burn each, ×1.6 vs flyers); drawn by the renderer.
- Weavers vs surface: 30% damage, 1.5× slower, web 1.2 s (capstone 65%).
- Keeper starts with the Spear only; other runes are learned for Star Blood (stage-gated)
  or gifted by the Observer at dawn.
- Tree branches: 1 of 3 per growth, each from a path (Янтарный / Светоносный / Корневой /
  Звёздный); 3 of one path → capstone (fogPierce, rootSeal, abilityCd…).
- Rune Facets (Грани) at Бронза and Золото: 2 base + resonance options unlocked by installed
  Properties. Properties stack (Усиление ×4, Уменьшение ×2), need rune rank ≥ property rank,
  can be pulled out for Star Blood; each rune rank adds cooldown (×1.08 … ×1.35).
- Keeper Tablet pauses time; ability hover card with live numbers; no rune offer under the
  title screen.

## v4.4 — Натиск, Остановка Времени, кольца памяти
- «Натиск»: once a night's creatures are all out, Space calls the next night on top of the
  stragglers: half the dawn gift + 3 Amber per living creature + Star Blood up front; the
  skipped dawn (other half of the gift, roulette) arrives at the next real dawn.
- Rune «Остановка Времени» [6]: freezes creatures (bosses half as long) and the spawn clock
  for 7 s; recovers over 2 nights. Properties: Долгий миг, Уменьшение, Короткая ночь, Хрупкий лёд.
- Rune slots: 4th by a Lesser Rune of Development, 5th/6th forged for 1500/120 and 4000/300.
- Pierce-beam spear form: 6 s minimum cooldown.
- Meta: «Кольца памяти» — endless Coin sinks after the whole Igg-Tree is awakened.

## v4.5 — журнал забегов, Созвучие, Прыжок Молота
- Run logs (localStorage, last 100): damage by source, casts, kills, tree damage by kind,
  keeper build, nests, per-night snapshots; title → «Статистика» with charts + JSON export.
- Созвучие: rotating different runes within 6 s stacks (max 3): +15% power, −10% Light each.
  Перегрев: 3rd+ consecutive spear throw within 2.5 s costs +10% Light per throw.
- Игг-Молот reworked into Прыжок Молота: leap to the cursor (200 × area), slam on landing,
  breaks armor 4 s; cd 8 s, damage 95. Radiance cd 26 s, Swarm cd 20 s / heal 35%.
- Pierce-beam spear is sustained: holds while Light lasts (drain 1.6× cost/s), press again
  to let go; damage falls off with distance (full to 120 px, 25% at ~620 px).
- Keeper death pauses the game until the player picks revive / «держать Круг без него».
- NaN fixed in nest cards for families without damage.

## v4.6 — Грани Света и Времени, туман истончается
- Facets for the Light rune (Поток Света, Светлый щит, Глубокий сосуд*, Ветер в спину*,
  Переполнение, Эхо Света, Сок Древа*, Вечный свет*) and Time Stop (Тишина, Стужа,
  Трещины*, Застывший миг, Вне времени, Вечный миг*); * = resonance.
- «Туман Тьмы» is thinned, not removed: one source (Светоносное Древо or «Рассеять Туман»)
  halves it, both clear it; drawn fainter accordingly.
- Tunnel crawlers visible above the darkness (dotted passage, warm outline, trembling soil).
- Keeper HP bar follows the Hammer leap; leftovers of the removed Feat (phase 'won') gone.

## v4.7 — Отродье Тирана, Натиск раньше
- Lore (book 5): «Тиран, чьё шипастое тело стало неприступной крепостью». New surface breaker
  «Отродье Тирана» (from night 12, heavy/worm themes; campaign night 9): smashes nests, cleave,
  fog, and a spiked carapace (extra pool): Hammer ×3, Starfall ×2.5, Spear ×1, the rest 35%;
  the body takes 10% while plated; a broken carapace leaves it exposed (no armor, +25%).
- Big worms toughen faster in endless (heavyHp 0.1/night), more Stражи in the generator.
- «Натиск» opens once 60% of the night's creatures are out; a dim button shows the progress.
- Speed resets to ×1 when the Keeper falls; no rune choice can show over the title screen.

## v0.5.x — версии, звёздные ранги (по статистике забега 29 ночей)
- Versioning: package.json semver, bumped by .githooks/pre-commit on every commit (patch);
  vite injects version + git hash; shown on the title, stored in run logs, stats filter
  «эта версия / все версии».
- Playtest log (29 nights): hammer 23% of damage, spear 17, hives 17, spiders 11, starfall 9;
  24 rushes in 29 nights; 17k Amber / 5k Star Blood unspent at night 27; star ranks felt weak.
- Star rune ranks: +30% power each (was +15%), price ×1.3 per rank (was ×1.45).
- Rush pays only for creatures already out (pending ones bring their own loot).

## v0.5.x — улучшения рун только через окно ранга, Огранка
- Every rank-up is a modal choice (no more picking Forms inside the Tablet):
  Бронза → Грань · Серебро → Форма (runes without Forms: a 2nd tier-I facet) · Золото → Грань ·
  Небо → Апофеоз + Грань · each Star rank → Огранка: +1 level to one of the rune's facets (max V).
- Facets have levels; every facet's numbers grow per level (fx(id, base, step, off)).
- All Properties/Facets work with every Form: the hammer wave/dome get pull, tremor stun,
  deep (underground ×), sun refund, eclipse field and tunnel caving; the piercing beam gets
  twin (backward light), sky (air), lance (gentler falloff), mark, flame, swift (cheaper hold),
  rhythm/crescendo ticks and ricochet sparks.
- Rune promotions/slots no longer show the keeper-rank message.

## v0.5.x — облик Древа, цены роста, Пригвождение, Натиск за риск
- Tree look by Уклон: the strongest path recolours the crown (tint after 1 branch, full palette
  after 2); the special Tree (3) gets a mark: amber resin drops, a light halo with rays, hanging
  root vines, orbiting stars.
- Tree growth costs 55/150/450/1300/3000 (late stages dearer), rings 1400 × 1.38^n.
- Spear facet «Небесный бросок» (air bonus — useless for a ground-skimming spear) replaced by
  «Пригвождение»: the first creature hit is pinned 1 s and takes +40%; the beam holds the
  nearest creature on its line (giants resist by size).
- Time Stop base 4 s (was 7).
- «Натиск»: the dawn gift is no longer paid up front (it all arrives at the next dawn); the
  bonus is 5 Amber per living creature and Star Blood scaled by how many still live.

## v0.5.x — без выбора цифрами, словарь терминов
- Choice windows can only be clicked: keys pressed while a window is open are swallowed
  (a rune hotkey no longer picks a card by accident); the reroll has no hotkey either.
- Glossary (Baldur's Gate style): terms in the Tablet, tree panel and choice windows are
  underlined and explain themselves on hover with mechanics and numbers (Свет, Высвечивание,
  Туман Тьмы, Лаз, Панцирь, Броня, Оглушение, Созвучие, Перегрев, Грань, Огранка, Форма,
  Натиск, Круг, Игг-свет, Гиганты, Летуны…).

## v0.5.x — гусеницы растут, пауза в меню гнезда
- Caterpillar loads: 4 → 7, Шелкопряды 12/18, Медовые 10/14; each merge star +4; every
  Возвышение level +25% load, +5% speed, +1 caterpillar per 2 levels.
- A nest's/slot's ring menu pauses the game (⏸ in its title).
- Tablet: development-rune purchases show the rune icon and «1» instead of the word «руной».
- Nest ring menu is always the same 4 buttons with fixed hotkeys: Q (upgrade / spec A /
  ascension), W (spec B), E (merge), S (release); unavailable ones are greyed with what they
  need (e.g. merge: «N из 3 одинаковых гнёзд»).
- One key scheme for every ring: 1-2-3-4 by position, both when building (families) and when
  upgrading (1 upgrade/spec A/ascension, 2 spec B, 3 merge, 4 release — 4 must be pressed twice).

## v0.5.x — темп, Слияние без потерь, падение Древа
- Pace (playtest «too fast»): first day 55 s, days 35 s; night spawns stretched ×1.25;
  every creature walks 12% slower. Night 4: one Ледозуб group from one side only.
- Merge: same family, ★, layer and compatible spec only (spec A never meets spec B); the
  survivor takes the best level, spec and ascension of the three; hovering «Слияние» shows
  which two nests will be absorbed (pulsing rings + a stream into the survivor) and the result.
- Selected nest shows its reach clearly (band, dome, posts; crown nests at their crown spot).
- Dragonflies fly slower (orbit and sorties).
- Defeat: the Tree leans, falls (clipped at the ground), its leaves dim and scatter, the crash
  shakes the screen, the Circle's light goes out; the summary appears after 3.6 s.
- Upgrade previews include merge stars and ascension (they showed a fake damage drop);
  Термитник B levels 16/22 (was 13/18 — a real dip); a test guards every upgrade path.
- Pause screen: «Уйти в Вечность» in the corner, two clicks to confirm — ends the run (the Tree
  falls, coins counted as usual).
- Build with merge stars: every build option has its own vertical + / − stepper on its left and a ★N badge above (no cap) and plants a
  nest already merged for the price of the 3ⁿ nests it replaces — no more planting three
  nests just to fuse them (levels are upgraded afterwards as usual).
- Nests grow visibly: size by level, merge stars and ascension (surface up to ×1.7, crown ×1.35,
  roots ×1.4 — space is tight there), a halo coloured by progress (gold level 2, warm amber
  branch A, cool blue branch B) and a spark crown at Mastery (level 4).
- «Натиск» has no gate any more: any moment of the night, as many times in a row as you dare.

## v0.5.x — по фидбеку плейтеста (старая версия)
- Speeds 1 · 1.25 · 1.5 · 2 · 5.
- Meta tree: clicking an awakened leaf node gives it back with its Coins.
- Build cards show each nest's role; glossary explains nests (Улей, Светожук, Стрекозы, Паук,
  Термитник, Кокон) and Рассвет.
- Hold-to-cast: a held rune key fires again as soon as the rune is ready; the Piercing Beam is
  held while its key is down. New «Ускорение» Properties (−12% cooldown, ×3) for Hammer,
  Radiance and Swarm.
- Enemies get a thin violet-rose rim (outline pass, camera-clipped).
- Incoming waves: at the view edge of the side creatures come from, the Darkness thickens
  and red eyes blink (pending in the next 6 s + creatures beyond the edge).
- Music: the sawtooth night drone is gone; a quiet generative score — soft pad drifting
  through chords every 8 s, sparse echoed plucks (D pentatonic by day, A minor at night),
  a faint heartbeat at night.
- Range preview: a soft dome instead of a rectangle; unaffordable build options are dimmed;
  the ring's pop-in animation plays only when it opens on a node (no blinking on +/−).
- Installed numeric Properties (Усиление, Уменьшение, Ускорение) level up I→V right in their slot
  (▲ button, Star Blood: price × (1+lv) × 1.5); each level adds +50% of the Property's effect
  (scalePatch for mod Properties, propPower for rune-specific ones). «Изменения» are on/off —
  Facets strengthen them.

## v0.6 — плейтест-наблюдение (пакет 1: понятность)
- Instant rich tips (data-tip) on currencies (what they buy), HP/Light («Свет — у ствола
  Древа»), ★ steppers (▲▼ instead of +/− — «+» means «add to the map»), slots; hover hints on
  the field for runes of summoning, crown slots, root nodes, nests and the Tree.
- Locked rune buttons show the real Star Blood price and open the Tablet right at that rune.
- Tree panel pauses like the Tablet; pause menu: «Выйти в меню»; «Уйти в Вечность» more visible.
- Speed − ×N + (and −/+ keys), no wrap from ×2 to ×5.
- Tablet button pulses with a badge of how many things can be bought now.
- Amber counter blinks when unspent Amber could buy something right before the night.
- Dawn window appears 1.3 s after the night ends; gifted runes read «Новая способность [N]»,
  never offered twice across stacked rush dawns (an already known one pays its price back).
- Choice cards glow stronger by rune rank.
- Tree stages: … Юный Игг → Малое Игг-Древо → Игг-Древо → Великое Игг-Древо.
- Tree path pips show the real number of branches (a path can take 4).
- Piercing beam: a tap holds it 2.5 s, holding keeps it; «Обоюдное древко» now visibly shines
  backwards; ability card says «удерживай 1».
- Eyes of the Darkness show at the end of the day where the night's first groups will come from.
- «+ слот» sits among the property slots.
- Readability: larger, brighter body text.

## v0.6 — пакет 2 (геймплей)
- Shadow of the Devourer: 1 on night 15, 3 on night 20, 9 on night 25 and every 10th after.
- Rune ranks felt stronger: Radiance burn/vulnerability and Swarm haste/heal scale with
  rank power^0.6–0.75 (was ^0.5); fixed a precedence bug that dropped «Хрупкий лёд».
- Hammer «Притяжение»: pulls the pack in and a star falls on it 0.6 s later.
- Supernova ×6 damage, wider; Dome 55 dps, stronger slow/haste, heals nests; Time Stop recovers
  in one night; «Растянутый миг» (+2 s, −25% Light) replaces the useless night-cut.
- Merge card compares DPS of the three nests vs the merged one, with the trade-off spelled out.
- Point upgrades of nests (⚔ damage +15%, ◎ reach +8%, ⚡ speed +10% per level), cheap,
  endless, under each nest's ring — Ascension stays the general growth.
- Tree in danger (<30% HP at night): banner, speed back to ×1, red pulse around the view.
- «Жертва Света» (X twice): the Keeper bursts (damage, knock-back, stun) and falls; reviving
  that night costs ×3.
- Observer's exchange in the tree panel: 60 Amber → 1 Star Blood, 1 → 25 Amber.
- Dawn sky: a warm band over the horizon as the night runs out, fading in the first day seconds.
- Lighter choice window (softer backdrop + blur, glow on hover).

## v0.6 — пакет 3
- Run save: snapshot at every dawn (state + internal counters) in localStorage; the title
  shows «Продолжить · ночь N»; a new run or a defeat clears it.
- Feedback: «Оставить отзыв» on the end screen and «Отзыв · что дальше?» on the title open a
  prefilled GitHub issue with the version and the run's numbers.
- End-screen star text follows the renamed stages (★★ with the Igg-Tree).
- Later (needs a server): leaderboard by version, analytics.
