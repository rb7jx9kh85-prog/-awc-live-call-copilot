import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

/**
 * Client serveur lié à la session de l'utilisateur.
 *
 * Toutes les requêtes passent par RLS : l'application n'utilise jamais de
 * service-role key, donc aucun secret Supabase n'est nécessaire au runtime.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Appelé depuis un Server Component : le middleware rafraîchit la session.
          }
        },
      },
    },
  );
}
