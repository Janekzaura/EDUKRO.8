// Pochwały kupione przez uczniów w sklepie – decyduje wychowawca klasy (albo administrator).
import { h, icon, notice, dialog, toast, formatDate } from '../ui.js';
import { get, post } from '../api.js';

const STATUS = { pending: ['Czeka na decyzję', 'wait'], granted: ['Pochwała przyznana', 'ok'], rejected: ['Odrzucona – punkty zwrócone', 'plain'] };

export async function praiseSection({ admin = false, reload }) {
  const { requests, homeroom } = await get('/api/praise');
  const decide = (r, status) => {
    const note = h('textarea', { class: 'textarea', rows: 2, maxlength: 300, placeholder: status === 'granted' ? 'np. Pochwała wpisana do dziennika 12.10.' : 'np. Porozmawiajmy o tym na godzinie wychowawczej.' });
    dialog({
      iconName: status === 'granted' ? 'medal' : 'info',
      title: status === 'granted' ? `Przyznać pochwałę: ${r.firstName} ${r.lastName}?` : `Odrzucić prośbę: ${r.firstName} ${r.lastName}?`,
      body: [h('p', {}, status === 'granted' ? 'Uczeń zobaczy w sklepie, że pochwała została przyznana. Pamiętaj, aby wpisać ją w dzienniku.' : `Uczeń odzyska ${r.price} pkt.`),
        h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Wiadomość dla ucznia (opcjonalnie)'), note)],
      actions: [{ label: 'Anuluj', kind: 'quiet' }, { label: status === 'granted' ? 'Przyznaj pochwałę' : 'Odrzuć i zwróć punkty', kind: status === 'granted' ? 'primary' : 'danger', onClick: async () => {
        try { await post(`/api/praise/${r.id}/decide`, { status, note: note.value }); toast(status === 'granted' ? 'Pochwała przyznana.' : 'Prośba odrzucona, punkty zwrócone.'); reload(); }
        catch (e) { toast(e.message, 'error'); return false; }
      } }],
    });
  };
  const lead = admin ? 'Prośby o pochwałę kupione w sklepie EDUKRO. Trafiają do wychowawcy klasy ucznia – tu widzisz wszystkie, także z klas bez przypisanego wychowawcy.'
    : homeroom ? `Jesteś wychowawcą klasy ${homeroom}. Uczniowie mogą „kupić” pochwałę za dużą liczbę punktów – zdecyduj, czy ją przyznać.` : null;
  const head = h('header', { class: 'admin__head' }, h('div', {}, admin ? h('h1', {}, 'Pochwały') : h('h2', { class: 'section-title' }, 'Pochwały'), lead ? h('p', { class: admin ? null : 'section-lead', style: { marginBottom: 0 } }, lead) : null));
  if (!admin && !homeroom) return h('div', {}, head, notice('info', 'Nie jesteś wychowawcą żadnej klasy. Administrator może to ustawić w sekcji „Nauczyciele”.'));
  if (!requests.length) return h('div', {}, head, h('div', { class: 'empty' }, icon('medal', 'empty__icon'), h('div', {}, h('h3', {}, 'Brak próśb o pochwałę'), h('p', {}, 'Gdy uczeń kupi pochwałę w sklepie EDUKRO, prośba pojawi się tutaj.'))));
  return h('div', {}, head, h('div', { class: 'table-wrap' }, h('table', { class: 'table table--cards' },
    h('thead', {}, h('tr', {}, ...['Uczeń', 'Wiadomość', 'Status', 'Data', ''].map((x) => h('th', {}, x)))),
    h('tbody', {}, ...requests.map((r) => h('tr', {},
      h('td', {}, `${r.firstName} ${r.lastName}`, h('div', { class: 'small muted' }, r.className || 'bez klasy')),
      h('td', { 'data-label': 'Wiadomość' }, r.message || h('span', { class: 'muted' }, '—'), r.note ? h('div', { class: 'small muted' }, `Odpowiedź: ${r.note}`) : null),
      h('td', { 'data-label': 'Status' }, h('span', { class: `badge badge--${STATUS[r.status][1]}` }, STATUS[r.status][0])),
      h('td', { 'data-label': 'Data' }, formatDate(r.createdAt)),
      h('td', {}, r.status === 'pending' ? h('div', { class: 'row-actions' },
        h('button', { class: 'btn btn--primary btn--sm', type: 'button', onClick: () => decide(r, 'granted') }, icon('medal'), 'Przyznaj'),
        h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onClick: () => decide(r, 'rejected') }, 'Odrzuć')) : null)))))));
}
