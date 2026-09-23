import Link from 'next/link';
import Nav from '@/components/Nav';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

function duration(started: string, ended: string | null): string {
  if (!ended) return '—';
  const s = Math.max(0, Math.round((Date.parse(ended) - Date.parse(started)) / 1000));
  return `${Math.floor(s / 60)} min ${(s % 60).toString().padStart(2, '0')}`;
}

export default async function CallsPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from('calls')
    .select('id, company, status, started_at, ended_at, result, next_action, script_name')
    .order('started_at', { ascending: false })
    .limit(50);

  const calls = data ?? [];

  return (
    <>
      <Nav current="/calls" />
      <main className="mx-auto max-w-5xl px-4 py-6">
        <h1 className="mb-5 text-lg font-semibold">Historique</h1>

        {calls.length === 0 ? (
          <p className="text-sm text-[var(--color-muted)]">Aucun call enregistré.</p>
        ) : (
          <ul className="space-y-2">
            {calls.map((c) => (
              <li key={c.id}>
                <Link href={`/calls/${c.id}`} className="card block p-4 hover:border-[#2f3d4e]">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-semibold">{c.company}</span>
                    <span className="text-xs text-[var(--color-muted)]">
                      {new Date(c.started_at).toLocaleString('fr-CH')}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-4 text-xs text-[var(--color-muted)]">
                    <span>Durée : {duration(c.started_at, c.ended_at)}</span>
                    <span>Statut : {c.status}</span>
                    {c.result && <span>Résultat : {c.result}</span>}
                    {c.next_action && <span>Suite : {c.next_action}</span>}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
