import { notFound, redirect } from 'next/navigation';
import Nav from '@/components/Nav';
import { createClient } from '@/lib/supabase/server';
import { ACTION_LABEL, type Action } from '@/lib/awc/stages';
import { OBJECTION_LABEL, type ObjectionType } from '@/lib/awc/objections';
import { revalidatePath } from 'next/cache';

export const dynamic = 'force-dynamic';

export default async function CallDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: call } = await supabase
    .from('calls')
    .select('id, company, status, started_at, ended_at, result, summary, notes, next_action')
    .eq('id', id)
    .maybeSingle();

  if (!call) notFound();

  const [{ data: messages }, { data: suggestions }] = await Promise.all([
    supabase
      .from('call_messages')
      .select('id, speaker, content, created_at')
      .eq('call_id', id)
      .order('created_at', { ascending: true }),
    supabase
      .from('ai_suggestions')
      .select('id, input_text, stage, objection_type, action, response, engine, created_at')
      .eq('call_id', id)
      .order('created_at', { ascending: true }),
  ]);

  /** Analyse post-call : saisie manuelle, volontairement simple (§19). */
  async function saveDebrief(formData: FormData) {
    'use server';
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect('/login');

    await supabase
      .from('calls')
      .update({
        result: String(formData.get('result') ?? '').trim() || null,
        summary: String(formData.get('summary') ?? '').trim() || null,
        next_action: String(formData.get('next_action') ?? '').trim() || null,
        notes: String(formData.get('notes') ?? '').trim() || null,
      })
      .eq('id', id);

    revalidatePath(`/calls/${id}`);
  }

  const objections = (suggestions ?? [])
    .map((s) => s.objection_type)
    .filter((o): o is string => Boolean(o));
  const uniqueObjections = [...new Set(objections)];

  return (
    <>
      <Nav current="/calls" />
      <main className="mx-auto max-w-4xl px-4 py-6">
        <h1 className="text-lg font-semibold">{call.company}</h1>
        <p className="mb-6 text-xs text-[var(--color-muted)]">
          {new Date(call.started_at).toLocaleString('fr-CH')} · {call.status}
        </p>

        {uniqueObjections.length > 0 && (
          <section className="card mb-4 p-4">
            <p className="label mb-2">Objections rencontrées</p>
            <div className="flex flex-wrap gap-2">
              {uniqueObjections.map((o) => (
                <span
                  key={o}
                  className="rounded-md bg-[var(--color-panel-2)] px-2 py-1 text-xs text-[var(--color-soft)]"
                >
                  {OBJECTION_LABEL[o as ObjectionType] ?? o}
                </span>
              ))}
            </div>
          </section>
        )}

        <section className="card mb-4 p-4">
          <p className="label mb-3">Transcription</p>
          {(messages ?? []).length === 0 ? (
            <p className="text-sm text-[var(--color-muted)]">Aucun échange enregistré.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {messages!.map((m) => (
                <li key={m.id}>
                  <span
                    className={
                      m.speaker === 'PROSPECT'
                        ? 'text-[var(--color-muted)]'
                        : 'text-[var(--color-accent)]'
                    }
                  >
                    {m.speaker}
                  </span>{' '}
                  <span className="text-[var(--color-soft)]">{m.content}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card mb-4 p-4">
          <p className="label mb-3">Suggestions IA</p>
          {(suggestions ?? []).length === 0 ? (
            <p className="text-sm text-[var(--color-muted)]">Aucune suggestion.</p>
          ) : (
            <ul className="space-y-3 text-sm">
              {suggestions!.map((s) => (
                <li key={s.id} className="border-l border-[var(--color-line)] pl-3">
                  <p className="text-xs text-[var(--color-muted)]">
                    {s.stage}
                    {s.objection_type
                      ? ` · ${OBJECTION_LABEL[s.objection_type as ObjectionType] ?? s.objection_type}`
                      : ''}
                    {' · '}
                    {ACTION_LABEL[s.action as Action] ?? s.action}
                    {` · ${s.engine}`}
                  </p>
                  {s.response && <p className="mt-1 text-[var(--color-soft)]">« {s.response} »</p>}
                </li>
              ))}
            </ul>
          )}
        </section>

        <form action={saveDebrief} className="card space-y-3 p-4">
          <p className="label">Analyse post-call</p>
          <input
            name="result"
            defaultValue={call.result ?? ''}
            placeholder="Résultat (RDV / rappel / refus …)"
            className="field"
          />
          <textarea
            name="summary"
            defaultValue={call.summary ?? ''}
            rows={3}
            placeholder="Ce qui a fonctionné · point de blocage · informations apprises"
            className="field resize-none"
          />
          <input
            name="next_action"
            defaultValue={call.next_action ?? ''}
            placeholder="Prochaine action (datée)"
            className="field"
          />
          <textarea
            name="notes"
            defaultValue={call.notes ?? ''}
            rows={2}
            placeholder="Notes"
            className="field resize-none"
          />
          <button type="submit" className="btn btn-primary">
            Enregistrer
          </button>
        </form>
      </main>
    </>
  );
}
