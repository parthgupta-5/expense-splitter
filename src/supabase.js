import { createClient } from '@supabase/supabase-js';
import { GROUP_NAME_MAX } from './lib/limits';
import { sanitizeGroup } from './lib/backup';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabaseConfigured = Boolean(url && anonKey);
export const supabase = supabaseConfigured
  ? createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;

export async function fetchCloudGroups(userId) {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('groups')
    .select('id, name, data, created_at, updated_at')
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).flatMap((row) => {
    const { group } = sanitizeGroup({
      id: row.id,
      name: row.name,
      people: row.data?.people ?? [],
      expenses: row.data?.expenses ?? [],
      payments: row.data?.payments ?? [],
      savedSplits: row.data?.savedSplits ?? [],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
    return group ? [{ ...group, ownerId: userId }] : [];
  });
}

const toRow = (group, userId) => ({
  id: group.id,
  name: String(group.name || '').trim().slice(0, GROUP_NAME_MAX),
  created_by: userId,
  data: {
    people: group.people ?? [],
    expenses: group.expenses ?? [],
    payments: group.payments ?? [],
    savedSplits: group.savedSplits ?? [],
  },
  updated_at: group.updatedAt || new Date().toISOString(),
});

/**
 * Saves each group on its own so one rejected row cannot block the rest.
 * Resolves to { saved: [{ id, cloudUpdatedAt }], failed: [{ id, name, message }] }.
 */
export async function saveCloudGroups(groups, userId) {
  const result = { saved: [], failed: [] };
  if (!supabase) return result;
  const candidates = groups.filter((group) => String(group.name || '').trim());
  const outcomes = await Promise.allSettled(candidates.map(async (group) => {
    const { data, error } = await supabase.from('groups').upsert(toRow(group, userId)).select('updated_at').single();
    if (error) throw error;
    return { id: group.id, cloudUpdatedAt: data?.updated_at };
  }));
  outcomes.forEach((outcome, index) => {
    if (outcome.status === 'fulfilled') result.saved.push(outcome.value);
    else result.failed.push({ id: candidates[index].id, name: candidates[index].name, message: outcome.reason?.message || 'Unknown error' });
  });
  return result;
}

export async function removeCloudGroup(id) {
  if (!supabase) return;
  const { error } = await supabase.from('groups').delete().eq('id', id);
  if (error) throw error;
}

export async function fetchProfile(userId) {
  if (!supabase) return null;
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function saveProfile(userId, profile) {
  if (!supabase) return;
  const { error } = await supabase.from('profiles').upsert({ id: userId, ...profile });
  if (error) throw error;
}
