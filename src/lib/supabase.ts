import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const hasValidSupabaseUrl = Boolean(supabaseUrl?.startsWith('https://'));
const hasValidAnonKey = Boolean(supabaseAnonKey && !supabaseAnonKey.startsWith('http'));

export const isSupabaseConfigured = hasValidSupabaseUrl && hasValidAnonKey;

const serverStorage = {
  getItem: async () => null,
  removeItem: async () => undefined,
  setItem: async () => undefined,
};

const authStorage = typeof window === 'undefined' ? serverStorage : AsyncStorage;

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl as string, supabaseAnonKey as string, {
      auth: {
        autoRefreshToken: true,
        // Only consume browser OAuth callbacks on Login. Password recovery
        // keeps its explicit session handling on the reset-password route.
        detectSessionInUrl: typeof window !== 'undefined' && window.location?.pathname === '/login',
        persistSession: true,
        storage: authStorage,
      },
    })
  : null;
