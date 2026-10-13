import type { SupabaseClient } from '@supabase/supabase-js';

const META_KEY = 'kana-sync-meta';

// Everything the app keeps in localStorage is synced (progress, preferences,
// onboarding choices, theme, achievements, course), except auth and sync bookkeeping.
const isSyncedKey = (k: string) => k !== META_KEY && !k.startsWith('sb-');

interface SyncMeta {
  userId: string;
  /** updated_at of the remote row this device last pulled or pushed */
  syncedAt: string;
  /** Snapshot pushed last, to skip pushes when nothing changed */
  lastPayload: string;
}

const readMeta = (): SyncMeta | null => {
  try {
    return JSON.parse(localStorage.getItem(META_KEY) ?? 'null');
  } catch {
    return null;
  }
};
const writeMeta = (m: SyncMeta) => localStorage.setItem(META_KEY, JSON.stringify(m));

function snapshot(): string {
  const entries: [string, string][] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)!;
    if (isSyncedKey(k)) entries.push([k, localStorage.getItem(k) ?? '']);
  }
  entries.sort((a, b) => a[0].localeCompare(b[0]));
  return JSON.stringify(Object.fromEntries(entries));
}

function applySnapshot(data: Record<string, string>) {
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const k = localStorage.key(i)!;
    if (isSyncedKey(k) && !(k in data)) localStorage.removeItem(k);
  }
  for (const [k, v] of Object.entries(data)) {
    if (isSyncedKey(k) && typeof v === 'string') localStorage.setItem(k, v);
  }
}

/**
 * Pull the remote data when it is newer than what this device last saw.
 * Returns true when local data was replaced (caller should reload the page).
 */
export async function pullIfNewer(sb: SupabaseClient, userId: string): Promise<boolean> {
  const { data, error } = await sb
    .from('user_progress')
    .select('data, updated_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return false;
  const meta = readMeta();
  const newer = !meta || meta.userId !== userId || data.updated_at > meta.syncedAt;
  if (!newer) return false;
  applySnapshot(data.data as Record<string, string>);
  writeMeta({ userId, syncedAt: data.updated_at, lastPayload: snapshot() });
  return true;
}

/** Push local data if it changed since the last push. Pulls first if another device saved newer. */
export async function pushIfChanged(
  sb: SupabaseClient,
  userId: string,
): Promise<'pushed' | 'pulled' | 'same'> {
  if (await pullIfNewer(sb, userId)) return 'pulled';
  const payload = snapshot();
  const meta = readMeta();
  if (meta?.userId === userId && meta.lastPayload === payload) return 'same';
  const updatedAt = new Date().toISOString();
  const { error } = await sb
    .from('user_progress')
    .upsert({ user_id: userId, data: JSON.parse(payload), updated_at: updatedAt });
  if (error) throw error;
  writeMeta({ userId, syncedAt: updatedAt, lastPayload: payload });
  return 'pushed';
}

export const clearSyncMeta = () => localStorage.removeItem(META_KEY);

/** This device has never synced with this account */
export const isFirstSyncOnDevice = (userId: string) => readMeta()?.userId !== userId;

/** The device already holds practice progress (answered kana) */
export function localHasProgress(): boolean {
  try {
    const stats = JSON.parse(localStorage.getItem('kanadojo-stats') ?? 'null');
    return Object.keys(stats?.state?.allTimeStats?.characterMastery ?? {}).length > 0;
  } catch {
    return false;
  }
}

/** Upload this device's data, replacing whatever the account had */
export async function forcePush(sb: SupabaseClient, userId: string) {
  const payload = snapshot();
  const updatedAt = new Date().toISOString();
  const { error } = await sb
    .from('user_progress')
    .upsert({ user_id: userId, data: JSON.parse(payload), updated_at: updatedAt });
  if (error) throw error;
  writeMeta({ userId, syncedAt: updatedAt, lastPayload: payload });
}

/** Logging out leaves no one's data on a shared device */
export function clearLocalData() {
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const k = localStorage.key(i)!;
    if (isSyncedKey(k)) localStorage.removeItem(k);
  }
  clearSyncMeta();
}
