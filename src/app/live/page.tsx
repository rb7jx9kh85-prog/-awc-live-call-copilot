import Link from 'next/link';
import Nav from '@/components/Nav';
import LiveCockpit from '@/components/LiveCockpit';
import { createClient } from '@/lib/supabase/server';
import type { ProspectCard } from '@/lib/awc/types';

export const dynamic = 'force-dynamic';

export default async function LivePage() {
  const supabase = await createClient();

  const { data } = await supabase
    .from('prospects')
    .select(
      'id, company, first_name, last_name, website, sector, offer, price, problems, weaknesses, prior_info, notes, objective, script',
    )
    .order('created_at', { ascending: false });

  const prospects = (data ?? []) as ProspectCard[];

  return (
    <>
      <Nav current="/live" />
      {prospects.length === 0 ? (
        <main className="mx-auto max-w-2xl px-4 py-16 text-center">
          <h1 className="text-xl font-semibold">Aucun prospect</h1>
          <p className="mt-2 text-sm text-[var(--color-muted)]">
            Crée une fiche avant de lancer un call : le moteur s’appuie dessus pour personnaliser
            les réponses.
          </p>
          <Link href="/prospects/new" className="btn btn-primary mt-6 inline-block">
            Créer un prospect
          </Link>
        </main>
      ) : (
        <LiveCockpit prospects={prospects} />
      )}
    </>
  );
}
