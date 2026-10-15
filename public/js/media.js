// Dodawanie obrazów do pytań: wybór pliku, zmniejszenie w przeglądarce, wysłanie na serwer.
import { post } from './api.js';
import { toast } from './ui.js';

const ALLOWED = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const MAX_SIDE = 1600;

export const mediaUrl = (id) => (id ? `/api/media/${id}` : null);

function readAsDataUrl(blob) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });
}
function loadImage(src) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Nie udało się odczytać obrazu.')); i.src = src; });
}

export async function prepareImage(file) {
  if (!file || !/^image\//.test(file.type)) throw new Error('Wybierz plik z obrazem (JPG, PNG, WEBP lub GIF).');
  const dataUrl = await readAsDataUrl(file);
  const img = await loadImage(dataUrl);
  const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  if (scale === 1 && ALLOWED.includes(file.type) && file.size <= 2.5 * 1024 * 1024) return { mime: file.type, data: dataUrl };
  const cv = document.createElement('canvas');
  cv.width = Math.round(img.naturalWidth * scale);
  cv.height = Math.round(img.naturalHeight * scale);
  const g = cv.getContext('2d');
  g.drawImage(img, 0, 0, cv.width, cv.height);
  const mime = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
  let out = cv.toDataURL(mime, 0.86);
  if (mime === 'image/png' && out.length > 3.5e6) out = cv.toDataURL('image/jpeg', 0.86);
  return { mime: out.startsWith('data:image/png') ? 'image/png' : 'image/jpeg', data: out };
}

export async function uploadFile(file) {
  const img = await prepareImage(file);
  return post('/api/media', img);
}

/** Otwiera okno wyboru pliku; zwraca { id, url } albo null. */
export function pickImage() {
  return new Promise((resolve) => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'image/png,image/jpeg,image/webp,image/gif';
    inp.hidden = true;
    document.body.append(inp); // Safari i część przeglądarek wymagają pola w dokumencie
    addEventListener('focus', () => setTimeout(() => { if (!inp.files?.length) { inp.remove(); resolve(null); } }, 800), { once: true });
    inp.addEventListener('change', async () => {
      inp.remove();
      const f = inp.files?.[0];
      if (!f) return resolve(null);
      try { resolve(await uploadFile(f)); } catch (e) { toast(e.message, 'error'); resolve(null); }
    });
    inp.click();
  });
}
