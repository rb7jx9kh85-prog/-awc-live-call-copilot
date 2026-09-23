import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { inferStage, shouldCoach } from '@/lib/awc/detect';
import { retrieveKnowledge } from '@/lib/awc/retrieve';
import { buildLocalSuggestion } from '@/lib/awc/engine-local';
import { suggestWithOpenAI } from '@/lib/awc/engine-openai';
import { isStage, type Stage } from '@/lib/awc/stages';
import type { SuggestRequest, Suggestion, TranscriptTurn } from '@/lib/awc/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * PROSPECT + HISTORIQUE + ÉTAT + FICHE + OFFRE + MÉTHODE AWC
 *   → PROCHAINE MEILLEURE ACTION.
 *
 * Le moteur OpenAI est utilisé quand une clé est configurée ; sinon (ou en cas
 * d'erreur/timeout) on retombe sur le moteur local, qui lit la même knowledge
 * base. L'écran LIVE n'est jamais vide.
 */
export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }

  let body: SuggestRequest;
  try {
    body = (await request.json()) as SuggestRequest;
  } catch {
    return NextResponse.json({ error: 'JSON invalide' }, { status: 400 });
  }

  const input = (body.input ?? '').trim();
  if (!input) {
    return NextResponse.json({ error: 'Phrase du prospect manquante' }, { status: 400 });
  }
  if (input.length > 2000) {
    return NextResponse.json({ error: 'Phrase trop longue' }, { status: 400 });
  }

  const prospect = body.prospect ?? { company: 'Prospect' };
  const history: TranscriptTurn[] = Array.isArray(body.history) ? body.history.slice(-12) : [];
  const previousStage: Stage | undefined =
    body.currentStage && isStage(body.currentStage) ? body.currentStage : undefined;
  const alternative = Boolean(body.alternative);

  // 1. État du call + objection éventuelle.
  const detection = inferStage(input, history, previousStage);
  const coach = shouldCoach(detection, input);

  // 2. Récupération ciblée de la méthode AWC.
  const knowledge = await retrieveKnowledge(supabase, {
    stage: detection.stage,
    objection: detection.objection,
  });

  // 3. Décision.
  let suggestion: Suggestion;
  let engineError: string | null = null;

  const apiKey = process.env.OPENAI_API_KEY;

  if (apiKey && coach && knowledge.available) {
    const result = await suggestWithOpenAI({
      apiKey,
      detection,
      knowledge,
      prospect,
      input,
      history,
      alternative,
    });

    if (result.ok) {
      suggestion = result.suggestion;
    } else {
      engineError = result.error;
      suggestion = buildLocalSuggestion({ detection, knowledge, prospect, coach, alternative });
    }
  } else {
    suggestion = buildLocalSuggestion({ detection, knowledge, prospect, coach, alternative });
  }

  // 4. Traçabilité : chaque suggestion est rattachée au call.
  if (body.callId) {
    const knowledgeIds = [...knowledge.rules, ...knowledge.chunks].map((k) => k.id);
    const { error } = await supabase.from('ai_suggestions').insert({
      owner_id: user.id,
      call_id: body.callId,
      input_text: input,
      stage: suggestion.stage,
      objection_type: suggestion.objection,
      action: suggestion.action,
      response: suggestion.say,
      payload: { next: suggestion.next, confidence: suggestion.confidence, sources: suggestion.sources },
      knowledge_rule_ids: knowledgeIds,
      engine: suggestion.engine,
    });
    if (error) {
      // On n'échoue pas l'appel pour un problème d'historique : le live prime.
      console.error('ai_suggestions insert failed', error.message);
    }
  }

  return NextResponse.json({
    ...suggestion,
    knowledgeAvailable: knowledge.available,
    engineError,
  });
}
