// Audio and pictures for cards, looked up on demand and cached on this device.
//
// Audio: real native-speaker recordings from Lingua Libre (Wikimedia Commons, CC BY-SA),
// with the phone's own Spanish voice (Web Speech API) as the fallback. No AI voices.
// Pictures: ARASAAC pictograms (Government of Aragón, by Sergio Palao, CC BY-NC-SA),
// for concrete nouns only. Everything degrades to text if a lookup fails.
import { db } from '../db.js';

const RETRY_DAYS = 14;
const fresh = (row) => row && (row.found || Date.now() - row.checked < RETRY_DAYS * 86400000);

async function cached(id, lookup) {
  const row = await db.fc_media.get(id);
  if (fresh(row)) return row.found ? row : null;
  let found = null;
  try {
    found = await lookup();
  } catch {
    found = null;
  }
  await db.fc_media.put({ id, found: Boolean(found), checked: Date.now(), ...(found ?? {}) });
  return found;
}

async function getJSON(url, ms = 5000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    if (!r.ok) throw new Error(String(r.status));
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

const COMMONS = 'https://commons.wikimedia.org/w/api.php';

/** A Lingua Libre recording of a single Spanish word, with its attribution. */
export function lingualibre(word) {
  const w = String(word).trim().toLowerCase();
  if (!w || /\s/.test(w)) return Promise.resolve(null); // recordings are single words
  return cached(`ll:${w}`, async () => {
    const q = new URLSearchParams({
      action: 'query', list: 'search', srnamespace: '6', srlimit: '20', format: 'json', origin: '*',
      srsearch: `intitle:"LL-Q1321 (spa)" intitle:"${w}"`
    });
    const hits = (await getJSON(`${COMMONS}?${q}`)).query?.search ?? [];
    const title = hits.map((h) => h.title).find((t) => t.toLowerCase().endsWith(`-${w}.wav`));
    if (!title) return null;
    const info = new URLSearchParams({ action: 'query', titles: title, prop: 'imageinfo', iiprop: 'url|user|extmetadata', format: 'json', origin: '*' });
    const page = Object.values((await getJSON(`${COMMONS}?${info}`)).query?.pages ?? {})[0];
    const ii = page?.imageinfo?.[0];
    if (!ii?.url) return null;
    return {
      url: ii.url,
      author: ii.user ?? 'Lingua Libre speaker',
      license: ii.extmetadata?.LicenseShortName?.value ?? 'CC BY-SA 4.0',
      page: ii.descriptionurl ?? `https://commons.wikimedia.org/wiki/${encodeURIComponent(title)}`
    };
  });
}

/** An ARASAAC pictogram for a concrete noun. */
export function pictogram(query) {
  const q = String(query).trim().toLowerCase();
  if (!q) return Promise.resolve(null);
  return cached(`img:${q}`, async () => {
    const res = await getJSON(`https://api.arasaac.org/v1/pictograms/es/bestsearch/${encodeURIComponent(q)}`);
    const id = Array.isArray(res) ? res[0]?._id : null;
    if (!id) return null;
    return { url: `https://static.arasaac.org/pictograms/${id}/${id}_500.png`, author: 'Sergio Palao / ARASAAC', license: 'CC BY-NC-SA 4.0', page: `https://arasaac.org/pictograms/es/${id}` };
  });
}

// ---- Device voice fallback ----
let voice = null;
function spanishVoice() {
  if (voice || typeof speechSynthesis === 'undefined') return voice;
  const voices = speechSynthesis.getVoices();
  const spain = voices.filter((v) => /^es[-_]ES/i.test(v.lang));
  voice =
    spain.find((v) => /premium|enhanced|mejorad/i.test(v.name)) ??
    spain[0] ??
    voices.find((v) => /^es/i.test(v.lang)) ??
    null;
  return voice;
}
if (typeof speechSynthesis !== 'undefined') speechSynthesis.onvoiceschanged = () => (voice = null);

export function speakWithDevice(text) {
  if (typeof speechSynthesis === 'undefined') return false;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'es-ES';
  const v = spanishVoice();
  if (v) u.voice = v;
  u.rate = 0.92;
  speechSynthesis.speak(u);
  return true;
}

let current = null;
/** Play a word or phrase: Lingua Libre if there's a recording, otherwise the device voice. */
export async function play(text) {
  current?.pause();
  const rec = await lingualibre(text).catch(() => null);
  if (rec) {
    current = new Audio(rec.url);
    try {
      await current.play();
      return { source: 'lingualibre', ...rec };
    } catch {
      /* fall through to the device voice */
    }
  }
  speakWithDevice(text);
  return { source: 'device' };
}
