/**
 * Phone / tablet mode: a coarse pointer (finger) or `?touch=1` in the URL.
 * In this mode the UI grows to finger size, keyboard hints are hidden and the field is
 * driven by taps: tap the ground to walk, tap a nest twice to act.
 */
export const isTouch: boolean = (() => {
  try {
    const q = new URLSearchParams(location.search).get('touch');
    if (q === '1') return true;
    if (q === '0') return false;
    return matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  } catch { return false; }
})();

/** Pick the touch wording of a hint when on a phone. */
export const tx = (desk: string, touch: string) => (isTouch ? touch : desk);

/** Go fullscreen and lock to landscape where the browser allows it (Android; iOS ignores). */
export function goFullscreen() {
  if (!isTouch) return;
  const de = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
  try {
    if (!document.fullscreenElement) {
      const p = de.requestFullscreen?.({ navigationUI: 'hide' }) ?? de.webkitRequestFullscreen?.();
      if (p && 'then' in p) {
        p.then(() => (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape').catch(() => {}))
          .catch(() => {});
      }
    }
  } catch { /* not allowed */ }
}

/** Keyboard wording → finger wording (hints, the Observer's lines, quests). Desktop: unchanged. */
export function touchText(html: string): string {
  if (!isTouch || !html) return html;
  return html
    .replace(/<kbd>A<\/kbd>\/<kbd>D<\/kbd> — ходить/g, 'зажми палец на поле и веди — ходить')
    .replace(/\(<kbd>A<\/kbd>\/<kbd>D<\/kbd>\)/g, '(веди пальцем по полю)')
    .replace(/<kbd>1<\/kbd> — Копьё Игг-Света летит к курсору/g, 'Большая кнопка справа — Копьё летит к ближайшим тварям')
    .replace(/<kbd>R<\/kbd> — Скрижаль/g, 'Кнопка «Восходящий» — Скрижаль')
    .replace(/<kbd>Пробел<\/kbd> — призвать ночь раньше/g, 'Кнопка «Призвать ночь» — раньше')
    .replace(/Жертва Света \[X ×2\]/g, 'Жертва Света (красная кнопка под Древом — удерживай)')
    .replace(/Скрижал(ь|и|ью) \[R\]/g, 'Скрижал$1 (кнопка «Восходящий»)')
    .replace(/ ?<kbd>[^<]*<\/kbd>/g, '')
    .replace(/\s*\[(?:[A-Za-zА-Яа-яЁё0-9×+\- /]{1,8})\]/g, '')
    .replace(/Кликни/g, 'Тапни')
    .replace(/кликни/g, 'тапни')
    .replace(/Клик —/g, 'Касание —')
    .replace(/Клик по/g, 'Касание по')
    .replace(/к курсору/g, 'к пальцу');
}
