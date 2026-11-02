import { exportAll, importAll } from '../db.js';
import { today } from '../logic/dates.js';
import { esc, toast } from '../ui.js';
import { THEMES, getName, getThemePref, setName, setThemePref } from '../theme.js';

async function persistenceStatus() {
  if (!navigator.storage?.persisted) return 'Not supported here';
  return (await navigator.storage.persisted()) ? 'Protected ✓' : 'Not protected yet';
}

const THEME_EMOJI = { auto: '🌓', light: '☀️', dark: '🌙' };

export async function renderSettings(el, rerender) {
  const status = await persistenceStatus();
  const pref = getThemePref();

  el.innerHTML = `
    <h1 class="page-title">Settings</h1>

    <div class="cols">
      <section>
        <div class="sec" style="--dot:var(--grape)"><span class="dot"></span><h2>Look</h2></div>
        <div class="card top-grape stack">
          <div class="chips small three" role="group" aria-label="Theme">
            ${Object.entries(THEMES)
              .map(([k, label]) => `<button type="button" class="chip" data-theme-pref="${k}" aria-pressed="${pref === k}">${THEME_EMOJI[k]} ${label}</button>`)
              .join('')}
          </div>
          <p class="muted small">Auto follows your device’s light or dark mode.</p>
          <form id="name-form" class="inputs" style="grid-template-columns:1fr auto;margin-top:6px" autocomplete="off">
            <input class="field" name="name" value="${esc(getName())}" placeholder="Your name" aria-label="Name for the greeting" maxlength="30">
            <button class="btn" type="submit">Save</button>
          </form>
          <p class="muted small">Used in the greeting on Today. Leave it blank for just “Hey!”.</p>
        </div>

        <div class="sec" style="--dot:var(--sun)"><span class="dot"></span><h2>About</h2></div>
        <div class="card top-sun">
          <p><strong>Brain Reset</strong> · phase 1</p>
          <p class="muted small">Next up: memory palace trainer, unprompted sessions with recording, sync between devices, charts.</p>
        </div>
      </section>

      <section>
        <div class="sec" style="--dot:var(--mint)"><span class="dot"></span><h2>Your data</h2></div>
        <div class="card top-mint stack">
          <p>Everything is stored on this device. Until sync arrives in phase 4, export a backup now and then.</p>
          <button class="btn block" id="export" type="button">Export backup</button>
          <label class="btn secondary block">
            Import backup
            <input type="file" id="import" accept="application/json,.json" hidden>
          </label>
          <p class="muted small">Importing merges: a record only replaces yours if it’s newer.</p>
        </div>

        <div class="sec" style="--dot:var(--sky)"><span class="dot"></span><h2>Storage</h2></div>
        <div class="card top-sky stack">
          <div class="stat-row"><span class="muted">Protection from clearing</span><strong>${status}</strong></div>
          <button class="btn secondary block" id="persist" type="button">Ask the browser to keep my data</button>
          <p class="muted small">On iPhone, opening the app from its home screen icon helps Safari keep its data.</p>
        </div>
      </section>
    </div>`;

  el.querySelectorAll('[data-theme-pref]').forEach((b) =>
    b.addEventListener('click', () => {
      setThemePref(b.dataset.themePref);
      rerender();
    })
  );

  el.querySelector('#name-form').addEventListener('submit', (e) => {
    e.preventDefault();
    setName(new FormData(e.currentTarget).get('name') ?? '');
    toast('Name saved');
  });

  el.querySelector('#export').addEventListener('click', async () => {
    const data = await exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const file = new File([blob], `brain-reset-${today()}.json`, { type: 'application/json' });
    // On iPhone the share sheet is the easiest way to save the file to Files or iCloud.
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'Brain Reset backup' });
        return;
      } catch (err) {
        if (err.name === 'AbortError') return;
      }
    }
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: file.name });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  el.querySelector('#import').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const added = await importAll(JSON.parse(await file.text()));
      toast(`Imported ${added} record${added === 1 ? '' : 's'}`);
    } catch (err) {
      toast(err.message || 'Could not read that file');
    }
    e.target.value = '';
  });

  el.querySelector('#persist').addEventListener('click', async () => {
    if (!navigator.storage?.persist) return toast('Not supported in this browser');
    const ok = await navigator.storage.persist();
    toast(ok ? 'Data protected' : 'The browser declined for now');
    rerender();
  });
}
