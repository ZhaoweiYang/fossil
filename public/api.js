// HTTP API 适配器 / HTTP API adapter (used when served by the Node server).
// Mirrors the interface consumed by app.js: api.get(path) / api.post(path, body).

export async function get(p) {
  const r = await fetch(p);
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.statusText);
  return r.json();
}

export async function post(p, body) {
  const r = await fetch(p, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || r.statusText);
  return data;
}
