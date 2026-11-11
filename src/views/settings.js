import { exportAll, importAll } from '../db.js';
import { today } from '../logic/dates.js';
import { esc, toast } from '../ui.js';
import { getName, setName } from '../theme.js';
import { createAccount, onSyncStatus, signIn, signOut, syncNow, syncStatus } from '../sync.js';

async function persistenceStatus() {
  if (!navigator.storage?.persisted) return 'Not supported here';
  return (await navigator.storage.persisted()) ? 'Protected ✓' : 'Not protected yet';
}


function ago(iso) {
  if (!iso) return 'Never';
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function syncCardHTML(s) {
  if (!s.configured) return '<p class="muted">Sync isn’t set up in this build.</p>';
  if (s.user) {
    const state = s.syncing ? 'Syncing…' : s.error ? `Problem: ${esc(s.error)}` : ago(s.lastSync);
    return `
      <div class="stat-row"><span class="muted">Signed in</span><strong>${esc(s.user.email ?? '')}</strong></div>
      <div class="stat-row"><span class="muted">Last synced</span><strong>${state}</strong></div>
      <div class="stat-row"><span class="muted">Waiting to send</span><strong class="num">${s.pending}</strong></div>
      <button class="btn block" id="sync-now" type="button"${s.syncing ? ' disabled' : ''}>Sync now</button>
      <button class="btn secondary block" id="sign-out" type="button">Sign out</button>`;
  }
  return `
    <p>Sign in on each device to keep your phone and computer in step.</p>
    <form id="auth-form" class="stack" autocomplete="on">
      <input class="field" name="email" type="email" autocomplete="username" placeholder="Email" aria-label="Email" required>
      <input class="field" name="password" type="password" autocomplete="current-password" minlength="8" placeholder="Password" aria-label="Password" required>
      <button class="btn block" type="submit" data-mode="in">Sign in</button>
      <button class="btn secondary block" type="submit" data-mode="new">Create account (first time only)</button>
    </form>
    <p class="muted small">Anything already on this device is uploaded when you sign in, and merged with what’s there.</p>`;
}

function bindSync(card, rerender) {
  const redraw = async () => {
    card.innerHTML = syncCardHTML(await syncStatus());
    bindSync(card, rerender);
  };
  card.querySelector('#auth-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const email = String(form.get('email') ?? '').trim();
    const password = String(form.get('password') ?? '');
    const mode = e.submitter?.dataset.mode ?? 'in';
    const buttons = e.currentTarget.querySelectorAll('button');
    buttons.forEach((b) => (b.disabled = true));
    try {
      if (mode === 'new') await createAccount(email, password);
      else await signIn(email, password);
      toast('Signed in · syncing');
      rerender();
    } catch (err) {
      toast(err.message || 'Could not sign in');
      buttons.forEach((b) => (b.disabled = false));
    }
  });
  card.querySelector('#sync-now')?.addEventListener('click', async () => {
    const off = onSyncStatus(() => redraw());
    const result = await syncNow();
    off();
    await redraw();
    if (result) toast(`Synced · ${result.pushed} sent, ${result.pulled} received`);
  });
  card.querySelector('#sign-out')?.addEventListener('click', async () => {
    await signOut();
    toast('Signed out · data stays on this device');
    rerender();
  });
}

export async function renderSettings(el, rerender) {
  const status = await persistenceStatus();
  const sync = await syncStatus();

  el.innerHTML = `
    <h1 class="page-title">Settings</h1>

    <div class="cols">
      <section>
        <div class="sec" style="--dot:var(--grape)"><span class="dot"></span><h2>You</h2></div>
        <div class="card top-grape stack">
          <form id="name-form" class="inputs" style="grid-template-columns:1fr auto;margin-top:0" autocomplete="off">
            <input class="field" name="name" value="${esc(getName())}" placeholder="Your name" aria-label="Name for the greeting" maxlength="30">
            <button class="btn" type="submit">Save</button>
          </form>
          <p class="muted small">Used in the greetings on Home and Reset. Leave it blank for just “Hey!”.</p>
        </div>

        <div class="sec" style="--dot:var(--sun)"><span class="dot"></span><h2>About</h2></div>
        <div class="card top-sun">
          <p><strong>Artemis</strong> · life dashboard with the Brain Reset routine</p>
          <p class="muted small">Home, Tasks, Ventures, Money, Health and Reset, synced between your devices.</p>
        </div>
      </section>

      <section>
        <div class="sec" style="--dot:var(--tomato)"><span class="dot"></span><h2>Sync</h2></div>
        <div class="card top-tomato stack" id="sync-card">${syncCardHTML(sync)}</div>

        <div class="sec" style="--dot:var(--mint)"><span class="dot"></span><h2>Your data</h2></div>
        <div class="card top-mint stack">
          <p>${sync.user ? 'Synced to your account, and kept on this device so it works offline.' : 'Stored on this device. Sign in above to sync it between your phone and computer.'}</p>
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

  bindSync(el.querySelector('#sync-card'), rerender);


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
