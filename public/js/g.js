// Formy zależne od płci zalogowanej osoby: g('zrobiłeś', 'zrobiłaś').
import { state } from './app.js';
import { gfor } from './shared/gender.js';

export const g = (m, f) => gfor(state.user, m, f);
