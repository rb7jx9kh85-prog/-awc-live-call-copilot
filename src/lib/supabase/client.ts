'use client';

import { createBrowserClient } from '@supabase/ssr';

/**
 * Client navigateur. Utilise uniquement la clé publiable (jamais de secret).
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
