import type { Knowledge } from './retrieve';
import type { StageDetection } from './detect';
import type { ProspectCard, Suggestion } from './types';
import type { Action } from './stages';
import type { ObjectionType } from './objections';

/**
 * Moteur local AWC — déterministe, sans appel réseau.
 *
 * Il sert deux cas :
 *  1. aucune clé OpenAI configurée (l'app reste utilisable en cold call) ;
 *  2. OpenAI indisponible ou trop lent (fallback, jamais d'écran vide).
 *
 * Il ne « génère » rien : il sélectionne la réponse dans les morceaux de script
 * AWC récupérés, et n'y injecte que des variables de la fiche prospect.
 */

/** Action recommandée par défaut pour chaque objection, d'après le playbook. */
const OBJECTION_ACTION: Record<ObjectionType, Action> = {
  PRIX: 'ISOLER',
  TROP_CHER: 'ISOLER',
  PAS_BUDGET: 'ISOLER',
  PAS_MAINTENANT: 'ISOLER',
  PAS_URGENT: 'ISOLER',
  REFLECHIR: 'ISOLER',
  ENVOYEZ_MAIL: 'ISOLER',
  DEJA_QUELQUUN: 'CREUSER',
  PAS_INTERESSE: 'ISOLER',
  ASSOCIE: 'ISOLER',
  RAPPELEZ_PLUS_TARD: 'ISOLER',
  CONFIANCE: 'CREUSER',
  PAS_BESOIN: 'CREUSER',
  MAUVAIS_TIMING: 'ISOLER',
  BESOIN_PAS_CLAIR: 'LOOPER',
  PAS_LE_TEMPS: 'ISOLER',
  COMPARER: 'CREUSER',
  AUTRE: 'ISOLER',
};

/** Ce qu'il faut faire juste après avoir prononcé la phrase. */
const OBJECTION_NEXT: Record<ObjectionType, string> = {
  PRIX: 'ATTENDRE. Ne justifie pas le prix avant sa réponse.',
  TROP_CHER: 'ATTENDRE. Écoute si c’est le budget ou la valeur perçue.',
  PAS_BUDGET: 'ATTENDRE. S’il n’y a vraiment pas de budget : sortie propre.',
  PAS_MAINTENANT: 'ATTENDRE. Cherche la condition qui débloquerait.',
  PAS_URGENT: 'ATTENDRE. Laisse-le nommer sa propre priorité.',
  REFLECHIR: 'ATTENDRE. Il doit nommer la zone de doute.',
  ENVOYEZ_MAIL: 'ATTENDRE, puis propose un créneau après lecture.',
  DEJA_QUELQUUN: 'ATTENDRE. S’il est pleinement satisfait : ne force pas.',
  PAS_INTERESSE: 'ATTENDRE. Un non clair reste un non.',
  ASSOCIE: 'ATTENDRE, puis propose le RDV à trois.',
  RAPPELEZ_PLUS_TARD: 'ATTENDRE. Obtiens une date et une raison, sinon c’est une sortie.',
  CONFIANCE: 'ATTENDRE. Réponds uniquement au besoin qu’il nomme.',
  PAS_BESOIN: 'ATTENDRE. S’il n’y a aucun problème : referral ou sortie propre.',
  MAUVAIS_TIMING: 'ATTENDRE. Note la condition, propose un rappel daté.',
  BESOIN_PAS_CLAIR: 'ATTENDRE, puis UNE preuve concrète.',
  PAS_LE_TEMPS: 'ATTENDRE. Mauvais moment ou pas prioritaire ?',
  COMPARER: 'ATTENDRE. Loop uniquement sur son critère nº1.',
  AUTRE: 'ATTENDRE.',
};

/** Consigne par phase quand il n'y a pas d'objection. */
const STAGE_PLAYBOOK: Partial<Record<string, { action: Action; next: string }>> = {
  OPENING: { action: 'POSER_QUESTION', next: 'SILENCE 2–3 s. Ne remplis pas le blanc.' },
  DISCOVERY: { action: 'CREUSER', next: 'Rebondis sur SES mots, pas sur ta question suivante.' },
  QUALIFICATION: { action: 'POSER_QUESTION', next: 'Une question à la fois, puis silence.' },
  PROBLEM: { action: 'CREUSER', next: 'Fais préciser. Ne dramatise pas.' },
  PAIN: { action: 'CREUSER', next: 'Obtiens un exemple récent et concret.' },
  PITCH: { action: 'PITCHER', next: '3 bénéfices maximum, tous reliés à ce qu’il a dit.' },
  TEMPERATURE: { action: 'TESTER_TEMPERATURE', next: 'Écoute la qualité du « oui ». Un « oui, mais » = incertitude.' },
  ISOLATION: { action: 'ISOLER', next: 'ATTENDRE.' },
  LOOP: { action: 'LOOPER', next: 'UNE preuve, pas le pitch entier.' },
  RECLOSE: { action: 'RECLOSER', next: 'SILENCE après la demande.' },
  CLOSE: { action: 'CLOSER', next: 'Ne continue pas à vendre après un oui.' },
  RDV: { action: 'PROPOSER_RDV', next: 'Deux créneaux, puis silence.' },
  END: { action: 'SORTIE_PROPRE', next: 'Termine proprement. Note la prochaine action.' },
};

/**
 * Remplace les variables du script par la fiche prospect.
 * Les variables non renseignées sont laissées en clair : elles servent de
 * rappel visuel plutôt que de produire une phrase fausse.
 */
function fill(text: string, prospect: ProspectCard): string {
  const map: Record<string, string | null | undefined> = {
    ENTREPRISE: prospect.company,
    'NOM DE L’ENTREPRISE': prospect.company,
    PRENOM: prospect.first_name,
    'PRÉNOM': prospect.first_name,
    NOM: prospect.last_name,
    OFFRE: prospect.offer,
    'NOM DE L’OFFRE': prospect.offer,
    PRIX: prospect.price,
    'PROBLÈME': prospect.problems,
    PROBLEME: prospect.problems,
    'PROBLÈME OBSERVÉ': prospect.problems,
    NICHE: prospect.sector,
  };

  return text.replace(/\[([^\]]+)\]/g, (whole, key: string) => {
    const v = map[key.trim().toUpperCase()] ?? map[key.trim()];
    return v ? v : whole;
  });
}

/** Garde 1 à 3 phrases : on ne lit pas un paragraphe pendant un appel. */
function trimToSentences(text: string, max = 3): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  const parts = clean.match(/[^.!?…»]+[.!?…]*[»]?/g);
  if (!parts) return clean;
  return parts
    .slice(0, max)
    .map((p) => p.trim())
    .filter(Boolean)
    .join(' ');
}

/**
 * Extrait une réplique prononçable depuis un morceau de script.
 * Les playbooks AWC mettent les phrases à dire entre guillemets français.
 */
function extractQuotes(text: string): string[] {
  const out: string[] = [];
  const re = /[«"]\s*([^»"]{15,400})\s*[»"]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out.push(m[1].trim());
  return out;
}

type BuildArgs = {
  detection: StageDetection;
  knowledge: Knowledge;
  prospect: ProspectCard;
  coach: boolean;
  /** L'utilisateur veut une formulation différente. */
  alternative?: boolean;
};

export function buildLocalSuggestion({
  detection,
  knowledge,
  prospect,
  coach,
  alternative,
}: BuildArgs): Suggestion {
  const sources = [...knowledge.chunks, ...knowledge.rules]
    .slice(0, 3)
    .map((k) => ({ title: k.document_title ?? 'AWC', section: k.section }));

  // Cas « ne pas sur-coacher » : le prospect déroule, on se tait.
  if (!coach) {
    return {
      stage: detection.stage,
      objection: null,
      action: 'ECOUTER',
      say: '',
      next: 'Laisse-le finir. Note ses mots exacts.',
      confidence: 0.6,
      sources: [],
      engine: 'awc-local',
    };
  }

  const objection = detection.objection;

  // On cherche la réplique dans les morceaux de script récupérés.
  const candidates: string[] = [];
  for (const chunk of knowledge.chunks) {
    candidates.push(...extractQuotes(chunk.text));
  }
  // Un chunk sans guillemets reste utilisable tel quel s'il est court.
  if (candidates.length === 0) {
    for (const chunk of knowledge.chunks) {
      if (chunk.text.length <= 320) candidates.push(chunk.text);
    }
  }

  const index = alternative && candidates.length > 1 ? 1 : 0;
  const picked = candidates[index] ?? candidates[0] ?? null;

  const action: Action = objection
    ? OBJECTION_ACTION[objection]
    : (STAGE_PLAYBOOK[detection.stage]?.action ?? 'POSER_QUESTION');

  const next = objection
    ? OBJECTION_NEXT[objection]
    : (STAGE_PLAYBOOK[detection.stage]?.next ?? 'ATTENDRE.');

  if (!picked) {
    // Knowledge base vide ou aucun script pour ce cas : on le dit franchement
    // plutôt que d'inventer une réponse générique.
    return {
      stage: detection.stage,
      objection,
      action,
      say: '',
      next: knowledge.available
        ? 'Aucun script AWC pour ce cas précis. Accueille, isole, puis creuse.'
        : 'Knowledge base vide — lance la synchronisation Drive.',
      confidence: 0.25,
      sources,
      engine: 'awc-local',
    };
  }

  return {
    stage: detection.stage,
    objection,
    action,
    say: trimToSentences(fill(picked, prospect)),
    next,
    confidence: objection ? detection.objectionConfidence : 0.7,
    sources,
    engine: 'awc-local',
  };
}
