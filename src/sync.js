import { createClient } from '@supabase/supabase-js';
import { SUPABASE_ANON_KEY, SUPABASE_URL, syncConfigured } from './config.js';
import { db, getMeta, onSave } from './db.js';
import { LAST_SYNC_KEY, pendingCount, syncOnce } from './sync-core.js';

// Sync between devices through Supabase. Sign-in is email + password, typed in
// the app: an emailed link would open Safari on iPhone, whose storage is
// separate from the home screen app, so the app itself would stay signed out.

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

// ---- Sign in with email and password ----

export async function signIn(email, password) {
  const { error } = await supabase().auth.signInWithPassword({ email, password });
  if (error) throw error;
  await syncNow();
}

/** First device only. Needs "Confirm email" off in Supabase, so no email is sent. */
export async function createAccount(email, password) {
  const { data, error } = await supabase().auth.signUp({ email, password });
  if (error) throw error;
  if (!data.session) throw new Error('Account made, but Supabase wants the email confirmed first. Turn off "Confirm email" in Supabase, then sign in.');
  await syncNow();
}

export async function signOut() {
  await supabase()?.auth.signOut();
  emit();
}
