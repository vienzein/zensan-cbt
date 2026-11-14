import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabaseSiap = Boolean(url && key);

// Sesi login disimpan otomatis di browser dan diperbarui sendiri oleh Supabase.
export const supabase = supabaseSiap ? createClient(url, key) : null;
