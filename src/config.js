// Supabase project for sync between devices.
// The anon (publishable) key is meant to ship in the app: row level security in
// supabase/schema.sql is what keeps the data private. Never put the service_role key here.
// Vercel env vars VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY override these if set.

export const SUPABASE_URL = import.meta.env?.VITE_SUPABASE_URL || 'https://xksoyuyxuulbhqhtllpb.supabase.co';
export const SUPABASE_ANON_KEY = import.meta.env?.VITE_SUPABASE_ANON_KEY || 'sb_publishable_bulSvXEq7Qvmdllq7t-n4w_F0T0BlHl';

export const syncConfigured = () => Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
