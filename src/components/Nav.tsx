import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

const LINKS = [
  { href: '/live', label: 'LIVE' },
  { href: '/prospects', label: 'Prospects' },
  { href: '/calls', label: 'Historique' },
  { href: '/knowledge', label: 'Méthode' },
];

export default async function Nav({ current }: { current: string }) {
  async function signOut() {
    'use server';
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect('/login');
  }

  return (
    <header className="border-b border-[var(--color-line)] bg-[var(--color-panel)]">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
        <Link href="/live" className="text-sm font-bold tracking-[0.2em]">
          AWC LIVE
        </Link>

        {/* Sur téléphone : marque + déconnexion sur une ligne, onglets en dessous. */}
        <form action={signOut} className="order-2 ml-auto sm:order-3">
          <button type="submit" className="text-xs text-[var(--color-muted)] hover:text-white">
            Déconnexion
          </button>
        </form>

        <nav className="order-3 flex w-full flex-wrap gap-1 sm:order-2 sm:w-auto sm:flex-1">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                current === l.href
                  ? 'bg-[var(--color-panel-2)] text-white'
                  : 'text-[var(--color-muted)] hover:text-white'
              }`}
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
