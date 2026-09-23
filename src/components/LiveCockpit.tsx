'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { ACTION_LABEL, STAGE_LABEL, type Stage } from '@/lib/awc/stages';
import { OBJECTION_LABEL, type ObjectionType } from '@/lib/awc/objections';
import type { ProspectCard, Suggestion, TranscriptTurn } from '@/lib/awc/types';
import { useSpeech } from '@/lib/useSpeech';

type Props = { prospects: ProspectCard[] };

type LiveSuggestion = Suggestion & { knowledgeAvailable?: boolean; engineError?: string | null };

function formatTimer(seconds: number): string {
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export default function LiveCockpit({ prospects }: Props) {
  const supabase = createClient();

  const [prospectId, setProspectId] = useState<string>(prospects[0]?.id ?? '');
  const [callId, setCallId] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<TranscriptTurn[]>([]);
  const [lastProspectLine, setLastProspectLine] = useState('');
  const [suggestion, setSuggestion] = useState<LiveSuggestion | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const prospect = prospects.find((p) => p.id === prospectId);

  // Chronomètre du call.
  useEffect(() => {
    if (!callId) return;
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [callId]);

  const ask = useCallback(
    async (text: string, alternative = false) => {
      const line = text.trim();
      if (!line || !prospect) return;

      setLoading(true);
      setError(null);
      if (!alternative) setLastProspectLine(line);

      try {
        const res = await fetch('/api/suggest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            callId,
            prospect,
            input: line,
            history: alternative ? history : [...history],
            currentStage: suggestion?.stage,
            alternative,
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          setError(data?.error ?? 'Erreur moteur');
          return;
        }

        setSuggestion(data as LiveSuggestion);

        if (!alternative) {
          setHistory((h) =>
            [...h, { speaker: 'PROSPECT' as const, content: line }].slice(-12),
          );
          if (callId) {
            await supabase.from('call_messages').insert({
              call_id: callId,
              speaker: 'PROSPECT',
              content: line,
            });
          }
        }
      } catch {
        setError('Réseau indisponible');
      } finally {
        setLoading(false);
      }
    },
    [callId, history, prospect, suggestion?.stage, supabase],
  );

  // Transcription live : chaque phrase finalisée du prospect déclenche le moteur.
  const speech = useSpeech({
    onFinal: (text) => {
      setInput('');
      void ask(text);
    },
  });

  async function startCall() {
    if (!prospect) return;
    setBusy(true);
    setError(null);

    const { data, error: insertError } = await supabase
      .from('calls')
      .insert({
        prospect_id: prospect.id ?? null,
        company: prospect.company,
        script_name: prospect.script ?? null,
        status: 'live',
      })
      .select('id')
      .single();

    if (insertError) {
      setError(insertError.message);
    } else {
      setCallId(data.id);
      setElapsed(0);
      setHistory([]);
      setSuggestion(null);
      setLastProspectLine('');
    }
    setBusy(false);
  }

  async function endCall() {
    if (!callId) return;
    setBusy(true);
    speech.stop();
    await supabase
      .from('calls')
      .update({ status: 'ended', ended_at: new Date().toISOString() })
      .eq('id', callId);
    const finished = callId;
    setCallId(null);
    setBusy(false);
    window.location.href = `/calls/${finished}`;
  }

  function submitManual(e: React.FormEvent) {
    e.preventDefault();
    const text = input;
    setInput('');
    void ask(text);
    inputRef.current?.focus();
  }

  const objectionLabel = suggestion?.objection
    ? OBJECTION_LABEL[suggestion.objection as ObjectionType]
    : null;

  return (
    <div className="mx-auto max-w-5xl px-4 py-5">
      {/* ---- BANDEAU : prospect + état du call --------------------------- */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <select
          value={prospectId}
          onChange={(e) => setProspectId(e.target.value)}
          disabled={Boolean(callId)}
          className="field max-w-xs"
        >
          {prospects.length === 0 && <option value="">Aucun prospect</option>}
          {prospects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.company}
            </option>
          ))}
        </select>

        {callId ? (
          <>
            <span className="flex items-center gap-2 text-sm font-semibold text-[var(--color-accent)]">
              <span className="live-dot h-2 w-2 rounded-full bg-[var(--color-accent)]" />
              LIVE {formatTimer(elapsed)}
            </span>
            <button onClick={endCall} disabled={busy} className="btn ml-auto">
              Terminer
            </button>
          </>
        ) : (
          <button
            onClick={startCall}
            disabled={busy || !prospect}
            className="btn btn-primary ml-auto"
          >
            Démarrer le call
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-[var(--color-alert)]/40 bg-[var(--color-alert)]/10 px-4 py-2 text-sm text-[var(--color-alert)]">
          {error}
        </div>
      )}

      {suggestion?.knowledgeAvailable === false && (
        <div className="mb-4 rounded-lg border border-[var(--color-warn)]/40 bg-[var(--color-warn)]/10 px-4 py-2 text-sm text-[var(--color-warn)]">
          Knowledge base vide — synchronise tes scripts depuis l’onglet Méthode.
        </div>
      )}

      {/* ---- 1. CE QU'IL VIENT DE DIRE ----------------------------------- */}
      <section className="card mb-3 p-5">
        <p className="label mb-2">Prospect</p>
        <p className="text-lg leading-snug text-[var(--color-soft)] sm:text-xl">
          {lastProspectLine ? `« ${lastProspectLine} »` : '—'}
        </p>
      </section>

      {/* ---- 2. OBJECTION + ACTION --------------------------------------- */}
      <div className="mb-3 grid gap-3 sm:grid-cols-2">
        <section className="card p-5">
          <p className="label mb-2">Objection</p>
          <p
            className={`text-2xl font-bold tracking-tight sm:text-3xl ${
              objectionLabel ? 'text-[var(--color-alert)]' : 'text-[var(--color-muted)]'
            }`}
          >
            {objectionLabel ?? 'AUCUNE'}
          </p>
        </section>

        <section className="card p-5">
          <p className="label mb-2">Action</p>
          <p className="text-2xl font-bold tracking-tight text-[var(--color-warn)] sm:text-3xl">
            {suggestion ? ACTION_LABEL[suggestion.action] : '—'}
          </p>
        </section>
      </div>

      {/* ---- 3. DIS ÇA — l'élément le plus lisible de l'écran ------------- */}
      <section className="card mb-3 border-[var(--color-accent)]/25 p-5">
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="label">Dis ça</p>
          <button
            onClick={() => void ask(lastProspectLine, true)}
            disabled={loading || !lastProspectLine}
            className="btn px-3 py-1 text-xs"
          >
            Autre réponse
          </button>
        </div>

        <p className="min-h-[3.5rem] text-2xl font-semibold leading-snug text-white sm:text-[1.75rem]">
          {loading ? (
            <span className="text-[var(--color-muted)]">…</span>
          ) : suggestion?.say ? (
            `« ${suggestion.say} »`
          ) : suggestion ? (
            <span className="text-[var(--color-accent)]">— Laisse-le parler. —</span>
          ) : (
            <span className="text-[var(--color-muted)]">
              Saisis ou dicte ce que le prospect vient de dire.
            </span>
          )}
        </p>
      </section>

      {/* ---- 4. ENSUITE + CONTEXTE --------------------------------------- */}
      <section className="card mb-4 p-5">
        <p className="label mb-2">Ensuite</p>
        <p className="text-base text-[var(--color-soft)]">{suggestion?.next ?? '—'}</p>

        {suggestion && (
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 border-t border-[var(--color-line)] pt-3 text-xs text-[var(--color-muted)]">
            <span>Phase : {STAGE_LABEL[suggestion.stage as Stage] ?? suggestion.stage}</span>
            <span>Moteur : {suggestion.engine}</span>
            <span>Confiance : {Math.round((suggestion.confidence ?? 0) * 100)} %</span>
            {suggestion.sources?.length > 0 && (
              <span>
                Source : {suggestion.sources[0].title}
                {suggestion.sources[0].section ? ` — ${suggestion.sources[0].section}` : ''}
              </span>
            )}
          </div>
        )}
      </section>

      {/* ---- SAISIE : mode manuel + transcription ------------------------ */}
      <form onSubmit={submitManual} className="card p-4">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) submitManual(e);
          }}
          rows={2}
          placeholder="Ce que le prospect vient de dire…"
          className="field resize-none"
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="submit" disabled={loading || !input.trim()} className="btn btn-primary">
            Analyser
          </button>

          {speech.supported && (
            <button
              type="button"
              onClick={speech.listening ? speech.stop : speech.start}
              className="btn"
            >
              {speech.listening ? '■ Stop dictée' : '● Dictée live'}
            </button>
          )}

          {speech.listening && (
            <span className="text-xs text-[var(--color-muted)]">
              {speech.interim || 'écoute…'}
            </span>
          )}

          {!speech.supported && (
            <span className="text-xs text-[var(--color-muted)]">
              Dictée non supportée par ce navigateur — utilise le mode manuel.
            </span>
          )}
        </div>
      </form>

      {/* ---- Fiche prospect repliée -------------------------------------- */}
      {prospect && (
        <details className="mt-4 text-sm text-[var(--color-muted)]">
          <summary className="cursor-pointer">Fiche {prospect.company}</summary>
          <dl className="mt-3 grid gap-2 sm:grid-cols-2">
            {(
              [
                ['Secteur', prospect.sector],
                ['Offre', prospect.offer],
                ['Prix', prospect.price],
                ['Objectif', prospect.objective],
                ['Problèmes', prospect.problems],
                ['Faiblesses', prospect.weaknesses],
                ['Notes', prospect.notes],
              ] as const
            )
              .filter(([, v]) => Boolean(v))
              .map(([k, v]) => (
                <div key={k}>
                  <dt className="label">{k}</dt>
                  <dd className="text-[var(--color-soft)]">{v}</dd>
                </div>
              ))}
          </dl>
        </details>
      )}
    </div>
  );
}
