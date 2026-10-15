// Lekcja / test z samouczka: nie do publikacji. Można usunąć albo skopiować – kopię publikuje się po zmianach.
import { h, icon, dialog, toast, notice } from '../ui.js';
import { post } from '../api.js';
import { navigate } from '../app.js';

const W = {
  lesson: { it: 'lekcja', gen: 'lekcji', acc: 'ją', in: 'niej', path: 'lekcja', api: 'lessons', copyLabel: 'Kopiuj lekcję' },
  test: { it: 'test', gen: 'testu', acc: 'go', in: 'nim', path: 'test', api: 'tests', copyLabel: 'Kopiuj test' },
};

export const lockText = (lock, kind = 'lesson') => {
  const w = W[kind];
  return lock === 'tutorial'
    ? `To ${w.it} z samouczka – nie można ${w.acc} opublikować uczniom. Możesz ${w.acc} usunąć albo skopiować. Kopię opublikujesz, gdy wprowadzisz w ${w.in} choć małą zmianę.`
    : `To niezmieniona kopia ${w.gen} z samouczka. Zmień w ${w.in} coś w treści (choćby jedno słowo), a wtedy ${w.acc} opublikujesz.`;
};

export function lockBadge(lock, kind = 'lesson') {
  if (!lock) return null;
  return lock === 'tutorial'
    ? h('span', { class: 'badge badge--tut', 'data-help': lockText(lock, kind) }, icon('play'), 'Z samouczka – nie do publikacji')
    : h('span', { class: 'badge badge--wait', 'data-help': lockText(lock, kind) }, icon('copy'), 'Kopia z samouczka – wprowadź zmiany');
}

export async function copyItem({ kind = 'lesson', id, base }) {
  const r = await post(`/api/editor/${W[kind].api}/${id}/duplicate`);
  toast(r.mustChange ? `Utworzono kopię. Wprowadź w niej choć małą zmianę – wtedy będzie można ${W[kind].acc} opublikować.` : `Utworzono kopię ${W[kind].gen}.`);
  navigate(`${base}/${W[kind].path}/${r.id}`);
  return r;
}

/** Okno zamiast publikacji, gdy materiał jest zablokowany. */
export function lockedDialog({ kind = 'lesson', id, lock, base, onEdit }) {
  return dialog({
    iconName: lock === 'tutorial' ? 'play' : 'copy',
    title: lock === 'tutorial' ? `Tego ${kind === 'lesson' ? 'nie można' : 'testu nie można'} opublikować` : 'Najpierw wprowadź zmiany',
    body: [notice(lock === 'tutorial' ? 'info' : 'warn', lockText(lock, kind))],
    actions: lock === 'tutorial'
      ? [{ label: 'Zamknij', kind: 'quiet' }, { label: W[kind].copyLabel, kind: 'primary', onClick: async () => { await copyItem({ kind, id, base }); } }]
      : [{ label: 'Zamknij', kind: 'quiet' }, onEdit ? { label: 'Przejdź do edycji', kind: 'primary', onClick: () => onEdit() } : null].filter(Boolean),
  });
}
