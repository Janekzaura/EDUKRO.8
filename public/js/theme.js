// Wygląd aplikacji ucznia (kupiony w sklepie): zmienne CSS i klasy efektów na <html>.
import { themeVars, DEFAULT_THEME } from './shared/shop.js';

let applied = { vars: [], classes: [] };

export function applyTheme(theme) {
  const root = document.documentElement;
  resetTheme();
  if (!theme) return;
  const t = { ...DEFAULT_THEME, ...theme };
  if (Object.keys(DEFAULT_THEME).every((k) => t[k] === DEFAULT_THEME[k])) return;
  const { vars, classes } = themeVars(t);
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  root.classList.add(...classes);
  applied = { vars: Object.keys(vars), classes };
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', vars['--ink-900']);
}

export function resetTheme() {
  const root = document.documentElement;
  for (const k of applied.vars) root.style.removeProperty(k);
  if (applied.classes.length) root.classList.remove(...applied.classes);
  applied = { vars: [], classes: [] };
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#0E1529');
}
