import { exportAll, importAll } from '../db.js';
import { today } from '../logic/dates.js';
import { toast } from '../ui.js';
import { THEMES, getThemePref, setThemePref } from '../theme.js';

async function persistenceStatus() {
  if (!navigator.storage?.persisted) return 'Not supported in this browser';
  return (await navigator.storage.persisted()) ? 'Protected' : 'Not protected yet';
}

export async function renderSettings(el, rerender) {
  const status = await persistenceStatus();

  el.innerHTML = `
    <h1>Settings</h1>

    <h2>Theme</h2>
    <div class="segmented compact three" role="group" aria-label="Theme">
      ${Object.entries(THEMES)
        .map(([k, label]) => `<button type="button" data-theme-pref="${k}" aria-pressed="${getThemePref() === k}">${label}</button>`)
        .join('')}
    </div>
    <p class="muted small" style="margin-top:8px">Auto uses Sport in light mode and Night in dark mode.</p>

    <h2>Your data</h2>
    <div class="card stack">
      <p>Everything is stored on this device. Until sync arrives in phase 4, export a backup now and then.</p>
      <button class="btn" id="export">Export backup (JSON)</button>
      <label class="btn secondary" style="text-align:center">
        Import backup
        <input type="file" id="import" accept="application/json,.json" hidden>
      </label>
      <p class="muted small">Importing merges: a row only replaces yours if it’s newer.</p>
    </div>

    <h2>Storage</h2>
    <div class="card stack">
      <div class="stat"><span class="muted">Protection from clearing</span><strong>${status}</strong></div>
      <button class="btn secondary" id="persist">Ask the browser to keep my data</button>
      <p class="muted small">On iPhone, using the app from the home screen icon helps Safari keep its data.</p>
    </div>

    <h2>About</h2>
    <div class="card">
      <p class="small">Brain Reset · phase 1</p>
      <p class="muted small">Coming next: memory palace trainer, unprompted sessions with recording, sync between devices, charts.</p>
    </div>`;

  el.querySelectorAll('[data-theme-pref]').forEach((b) =>
    b.addEventListener('click', () => {
      setThemePref(b.dataset.themePref);
      rerender();
    })
  );

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
