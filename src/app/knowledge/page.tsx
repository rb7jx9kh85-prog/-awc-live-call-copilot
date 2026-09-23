import Nav from '@/components/Nav';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Méthode AWC : état de la knowledge base alimentée depuis Google Drive.
 *
 * Le contenu des scripts n'est jamais stocké dans le dépôt : il vit dans
 * Supabase, sous RLS, et se resynchronise sans toucher au code (§17).
 */
export default async function KnowledgePage() {
  const supabase = await createClient();

  const [{ data: docs }, { data: rules }, { data: syncs }, { count: chunkCount }] =
    await Promise.all([
      supabase
        .from('knowledge_documents')
        .select('id, title, source_url, modified_at, status')
        .order('modified_at', { ascending: false, nullsFirst: false }),
      supabase
        .from('knowledge_rules')
        .select('id, section, stage, objection_type, rule_text, priority')
        .order('priority', { ascending: false })
        .limit(60),
      supabase
        .from('sync_history')
        .select('id, started_at, finished_at, status, imported, detail')
        .order('started_at', { ascending: false })
        .limit(5),
      supabase.from('knowledge_chunks').select('id', { count: 'exact', head: true }),
    ]);

  const documents = docs ?? [];

  return (
    <>
      <Nav current="/knowledge" />
      <main className="mx-auto max-w-4xl px-4 py-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-lg font-semibold">Méthode AWC</h1>
        </div>

        <div className="mb-4 grid grid-cols-3 gap-3">
          {[
            ['Documents', documents.length],
            ['Règles', rules?.length ?? 0],
            ['Extraits', chunkCount ?? 0],
          ].map(([label, value]) => (
            <div key={label as string} className="card p-4">
              <p className="label">{label}</p>
              <p className="mt-1 text-2xl font-bold">{value}</p>
            </div>
          ))}
        </div>

        {documents.length === 0 && (
          <div className="card mb-4 border-[var(--color-warn)]/40 p-4 text-sm text-[var(--color-warn)]">
            Knowledge base vide. Importe des documents depuis Google Drive pour l&apos;alimenter.
          </div>
        )}

        <section className="card mb-4 p-4">
          <p className="label mb-3">Documents source (Google Drive)</p>
          <ul className="space-y-2 text-sm">
            {documents.map((d) => (
              <li key={d.id} className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-[var(--color-soft)]">{d.title}</span>
                <span className="text-xs text-[var(--color-muted)]">
                  {d.modified_at ? new Date(d.modified_at).toLocaleDateString('fr-CH') : '—'}
                </span>
              </li>
            ))}
            {documents.length === 0 && (
              <li className="text-[var(--color-muted)]">Aucun document.</li>
            )}
          </ul>
        </section>

        <section className="card mb-4 p-4">
          <p className="label mb-3">Règles extraites</p>
          <ul className="space-y-2 text-sm">
            {(rules ?? []).slice(0, 25).map((r) => (
              <li key={r.id} className="border-l border-[var(--color-line)] pl-3">
                <p className="text-xs text-[var(--color-muted)]">
                  {[r.stage, r.objection_type, r.section].filter(Boolean).join(' · ')}
                </p>
                <p className="text-[var(--color-soft)]">{r.rule_text}</p>
              </li>
            ))}
            {(rules ?? []).length === 0 && <li className="text-[var(--color-muted)]">Aucune règle.</li>}
          </ul>
        </section>

        <section className="card p-4">
          <p className="label mb-3">Synchronisations</p>
          <ul className="space-y-1 text-xs text-[var(--color-muted)]">
            {(syncs ?? []).map((s) => (
              <li key={s.id}>
                {new Date(s.started_at).toLocaleString('fr-CH')} · {s.status} · {s.imported} éléments
                {s.detail ? ` · ${s.detail}` : ''}
              </li>
            ))}
            {(syncs ?? []).length === 0 && <li>Aucune synchronisation enregistrée.</li>}
          </ul>
        </section>
      </main>
    </>
  );
}
