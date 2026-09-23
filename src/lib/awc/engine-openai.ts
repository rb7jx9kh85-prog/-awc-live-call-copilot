import type { Knowledge } from './retrieve';
import type { StageDetection } from './detect';
import type { ProspectCard, Suggestion, TranscriptTurn } from './types';
import { ACTIONS, isAction, isStage, type Action } from './stages';
import { isObjection } from './objections';

/**
 * Moteur OpenAI — contexte compact, sortie structurée, réponses courtes.
 *
 * Le prompt système est construit à 100 % depuis la knowledge base AWC
 * récupérée : rien n'est codé en dur ici. Modifier un script dans Drive puis
 * resynchroniser change le comportement sans toucher au code.
 */

const MODEL = process.env.OPENAI_MODEL ?? 'gpt-4.1-mini';
const TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS ?? 6000);

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['action', 'say', 'next', 'confidence'],
  properties: {
    action: { type: 'string', enum: [...ACTIONS] },
    say: {
      type: 'string',
      description:
        "Phrase à prononcer telle quelle, 1 à 3 phrases max, français oral naturel. Chaîne vide si l'action est d'écouter.",
    },
    next: { type: 'string', description: 'Ce qu’il faut faire juste après. Une ligne.' },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
  },
} as const;

function buildSystemPrompt(knowledge: Knowledge): string {
  const rules = knowledge.rules.map((r) => `- [${r.section ?? 'règle'}] ${r.text}`).join('\n');
  const chunks = knowledge.chunks
    .map((c) => `--- ${c.section ?? 'script'} ---\n${c.text}`)
    .join('\n\n');

  return [
    "Tu es le copilote commercial d'Alpinia Web Craft (AWC) pendant un cold call en direct.",
    "Tu assistes Noé, cofondateur. Tu ne parles jamais au prospect : tu dictes à Noé ce qu'il doit dire.",
    '',
    'CONTRAINTES ABSOLUES :',
    "- Réponds UNIQUEMENT à partir des règles et scripts AWC ci-dessous. N'invente aucune méthode de vente générique.",
    "- 1 à 3 phrases maximum dans `say`. Français parlé, naturel, immédiatement prononçable.",
    "- Pas de langage d'IA, pas de formule trop parfaite, pas de vocabulaire corporate.",
    "- Si la meilleure décision est de laisser parler le prospect, renvoie l'action ECOUTER et `say` vide.",
    "- N'invente jamais une urgence, une preuve, un résultat chiffré ou une rareté.",
    '- Ne promets aucun résultat non vérifiable.',
    '',
    'RÈGLES AWC APPLICABLES :',
    rules || '(aucune)',
    '',
    'EXTRAITS DE SCRIPTS AWC APPLICABLES :',
    chunks || '(aucun)',
  ].join('\n');
}

function buildUserPrompt(
  detection: StageDetection,
  prospect: ProspectCard,
  input: string,
  history: TranscriptTurn[],
  alternative: boolean,
): string {
  const card = [
    `Entreprise : ${prospect.company}`,
    prospect.first_name && `Prénom : ${prospect.first_name}`,
    prospect.sector && `Secteur : ${prospect.sector}`,
    prospect.offer && `Offre envisagée : ${prospect.offer}`,
    prospect.price && `Prix : ${prospect.price}`,
    prospect.problems && `Problèmes identifiés : ${prospect.problems}`,
    prospect.weaknesses && `Faiblesses digitales : ${prospect.weaknesses}`,
    prospect.objective && `Objectif du call : ${prospect.objective}`,
  ]
    .filter(Boolean)
    .join('\n');

  // Contexte compact : on ne renvoie que la fin de la conversation.
  const tail = history
    .slice(-6)
    .map((t) => `${t.speaker} : ${t.content}`)
    .join('\n');

  return [
    'FICHE PROSPECT',
    card,
    '',
    'FIN DE CONVERSATION',
    tail || '(début du call)',
    '',
    'DERNIÈRE PHRASE DU PROSPECT',
    input,
    '',
    'ÉTAT ESTIMÉ',
    `Phase : ${detection.stage}`,
    `Objection détectée : ${detection.objection ?? 'aucune'}`,
    '',
    alternative
      ? 'Noé a demandé UNE AUTRE FORMULATION : propose une approche différente de la précédente, toujours conforme aux scripts AWC.'
      : 'Donne la prochaine meilleure action.',
  ].join('\n');
}

type OpenAIResult = { ok: true; suggestion: Suggestion } | { ok: false; error: string };

export async function suggestWithOpenAI(args: {
  apiKey: string;
  detection: StageDetection;
  knowledge: Knowledge;
  prospect: ProspectCard;
  input: string;
  history: TranscriptTurn[];
  alternative: boolean;
}): Promise<OpenAIResult> {
  const { apiKey, detection, knowledge, prospect, input, history, alternative } = args;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: alternative ? 0.8 : 0.4,
        max_tokens: 300,
        messages: [
          { role: 'system', content: buildSystemPrompt(knowledge) },
          {
            role: 'user',
            content: buildUserPrompt(detection, prospect, input, history, alternative),
          },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'awc_suggestion', strict: true, schema: SCHEMA },
        },
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { ok: false, error: `OpenAI ${res.status}: ${body.slice(0, 200)}` };
    }

    const json = await res.json();
    const raw = json?.choices?.[0]?.message?.content;
    if (typeof raw !== 'string') return { ok: false, error: 'Réponse OpenAI vide' };

    const parsed = JSON.parse(raw) as {
      action?: string;
      say?: string;
      next?: string;
      confidence?: number;
    };

    const action: Action = isAction(parsed.action ?? '') ? (parsed.action as Action) : 'ECOUTER';

    return {
      ok: true,
      suggestion: {
        stage: isStage(detection.stage) ? detection.stage : 'DISCOVERY',
        objection:
          detection.objection && isObjection(detection.objection) ? detection.objection : null,
        action,
        say: (parsed.say ?? '').trim(),
        next: (parsed.next ?? '').trim() || 'ATTENDRE.',
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.7,
        sources: [...knowledge.chunks, ...knowledge.rules].slice(0, 3).map((k) => ({
          title: k.document_title ?? 'AWC',
          section: k.section,
        })),
        engine: 'openai',
      },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg === 'The operation was aborted.' ? 'timeout' : msg };
  } finally {
    clearTimeout(timer);
  }
}
