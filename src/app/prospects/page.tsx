import Link from 'next/link';
import Nav from '@/components/Nav';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function ProspectsPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from('prospects')
    .select('id, company, first_name, sector, offer, price, objective, created_at')
    .order('created_at', { ascending: false });

  const prospects = data ?? [];

  return (
    <>
      <Nav current="/prospects" />
      <main className="mx-auto max-w-5xl px-4 py-6">
        <div className="mb-5 flex items-center justify-between gap-3">
          <h1 className="text-lg font-semibold">Prospects</h1>
          <Link href="/prospects/new" className="btn btn-primary">
            Nouveau
          </Link>
        </div>

        {prospects.length === 0 ? (
          <p className="text-sm text-[var(--color-muted)]">Aucune fiche pour le moment.</p>
        ) : (
          <ul className="space-y-2">
            {prospects.map((p) => (
              <li key={p.id} className="card p-4">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="font-semibold">{p.company}</span>
                  {p.first_name && (
                    <span className="text-sm text-[var(--color-muted)]">{p.first_name}</span>
                  )}
                  {p.sector && (
                    <span className="text-xs text-[var(--color-muted)]">· {p.sector}</span>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap gap-x-4 text-xs text-[var(--color-muted)]">
                  {p.offer && <span>Offre : {p.offer}</span>}
                  {p.price && <span>Prix : {p.price}</span>}
                  {p.objective && <span>Objectif : {p.objective}</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
