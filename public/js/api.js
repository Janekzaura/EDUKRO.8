// Komunikacja z serwerem EDUKRO. Uprawnienia zawsze weryfikuje serwer.
export class ApiError extends Error {
  constructor(status, body) { super(body.error || 'Błąd połączenia.'); this.status = status; this.body = body; }
}

export async function api(method, url, body) {
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-EDUKRO': '1' },
      credentials: 'same-origin',
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, { error: 'Brak połączenia z serwerem EDUKRO. Sprawdź internet i spróbuj ponownie.' });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}
export const get = (u) => api('GET', u);
export const post = (u, b) => api('POST', u, b ?? {});
export const put = (u, b) => api('PUT', u, b ?? {});
export const patch = (u, b) => api('PATCH', u, b ?? {});
export const del = (u, b) => api('DELETE', u, b ?? {});
