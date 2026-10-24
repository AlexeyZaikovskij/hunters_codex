import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Ключи берутся из .env.local (локально) или из переменных окружения Vercel.
// Anon key публичный по дизайну: он всё равно попадает в клиентский бандл, данные защищает RLS.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** null, если ключи не заданы: игра продолжает работать офлайн. */
export const supabase: SupabaseClient | null = url && anonKey ? createClient(url, anonKey) : null;

export type ServerStatus = 'offline' | 'online' | 'error';

/** Проверка связи с базой: один лёгкий запрос к таблице профилей. */
export async function checkServer(): Promise<ServerStatus> {
  if (!supabase) return 'offline';
  const { error } = await supabase.from('profiles').select('id', { head: true, count: 'exact' });
  return error ? 'error' : 'online';
}
