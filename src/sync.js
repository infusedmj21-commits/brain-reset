import { createClient } from '@supabase/supabase-js';
import { SUPABASE_ANON_KEY, SUPABASE_URL, syncConfigured } from './config.js';
import { db, getMeta, onSave } from './db.js';
import { LAST_SYNC_KEY, pendingCount, syncOnce } from './sync-core.js';

// Sync between devices through Supabase. Sign-in is by a 6-digit email code
// rather than a link: on iPhone a link opens Safari, whose storage is separate
// from the home screen app, so the app itself would stay signed out.

let client = null;
function supabase() {
  if (!syncConfigured()) return null;
  client ??= createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'brain-reset-auth' }
  });
  return client;
}

const api = {
  async push(rows) {
    const { error } = await supabase().rpc('push_rows', { rows });
    if (error) throw error;
  },
  async pull(afterSeq, limit) {
    const { data, error } = await supabase()
      .from('sync_rows')
      .select('tbl, data, server_seq')
      .gt('server_seq', afterSeq)
      .order('server_seq', { ascending: true })
      .limit(limit);
    if (error) throw error;
    return data ?? [];
  }
};

// ---- Status, shown in Settings ----

let state = { syncing: false, error: null };
const listeners = new Set();
export function onSyncStatus(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
const emit = () => listeners.forEach((fn) => fn(state));

let onRemoteChange = () => {};
export function setOnRemoteChange(fn) {
  onRemoteChange = fn;
}

export async function getUser() {
  const sb = supabase();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data.session?.user ?? null;
}

export async function syncStatus() {
  return {
    configured: syncConfigured(),
    user: await getUser(),
    lastSync: await getMeta(LAST_SYNC_KEY),
    pending: await pendingCount(db),
    ...state
  };
}

// ---- Running a sync ----

let running = null;
export async function syncNow() {
  if (running) return running;
  if (!(await getUser())) return null;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return null;
  running = (async () => {
    state = { syncing: true, error: null };
    emit();
    try {
      const result = await syncOnce(db, api);
      state = { syncing: false, error: null };
      if (result.pulled > 0) onRemoteChange();
      return result;
    } catch (err) {
      console.error('Sync failed', err);
      state = { syncing: false, error: err.message || String(err) };
      return null;
    } finally {
      running = null;
      emit();
    }
  })();
  return running;
}

// Batch quick edits (ticking several missions) into one push.
let timer = null;
export function scheduleSync(delay = 2500) {
  clearTimeout(timer);
  timer = setTimeout(syncNow, delay);
}

export function startSync() {
  if (!syncConfigured()) return;
  onSave(() => scheduleSync());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') syncNow();
  });
  window.addEventListener('online', () => syncNow());
  // A slow background tick catches changes from other devices while the app stays open.
  setInterval(() => {
    if (document.visibilityState === 'visible') syncNow();
  }, 5 * 60 * 1000);
  syncNow();
}

// ---- Sign in with an emailed code ----

export async function sendCode(email) {
  const { error } = await supabase().auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  if (error) throw error;
}

export async function verifyCode(email, token) {
  const { error } = await supabase().auth.verifyOtp({ email, token, type: 'email' });
  if (error) throw error;
  await syncNow();
}

export async function signOut() {
  await supabase()?.auth.signOut();
  emit();
}
