import { detectObjection, normalize, type ObjectionType } from './objections';
import type { Stage } from './stages';
import type { TranscriptTurn } from './types';

/**
 * Estimation de la phase du call.
 *
 * Deux sources : la progression observée dans la transcription, et la dernière
 * phrase du prospect. On ne recule jamais sur la ligne sans raison — sauf
 * lorsqu'une objection apparaît, qui est une sortie de ligne explicite.
 */

const CUES: { stage: Stage; re: RegExp; from: 'MOI' | 'PROSPECT' | 'ANY' }[] = [
  // Ce que JE dis fait avancer la ligne.
  { stage: 'OPENING', from: 'MOI', re: /\b(bonjour|je m'appelle|appel de prospection|30 secondes|cofondateur)\b/ },
  { stage: 'DISCOVERY', from: 'MOI', re: /\b(comment vos nouveaux clients|vous trouvent|ca se passe comment|raison particuliere)\b/ },
  { stage: 'QUALIFICATION', from: 'MOI', re: /\b(qui decide|vous etes la seule personne|budget|ordre de grandeur|priorites du moment|sur 10|sur une echelle)\b/ },
  { stage: 'PROBLEM', from: 'MOI', re: /\b(qu'est[- ]ce qui vous (frustre|gene|limite)|un seul probleme|qu'est[- ]ce qui manque)\b/ },
  { stage: 'PAIN', from: 'MOI', re: /\b(ca vous coute|qu'est[- ]ce que ca vous coute|si vous ne changez rien|exemple recent)\b/ },
  { stage: 'PITCH', from: 'MOI', re: /\b(ce qu'on ferait|l'objectif (du site|serait)|on construirait|je partirais sur|chez alpinia)\b/ },
  { stage: 'TEMPERATURE', from: 'MOI', re: /\b(ca vous parait (coherent|logique)|jusque[- ]la|vous voyez pourquoi)\b/ },
  { stage: 'RECLOSE', from: 'MOI', re: /\b(qu'est[- ]ce qui nous empecherait|il resterait (autre chose|quelque chose)|on garde|est[- ]ce qu'il reste quelque chose)\b/ },
  { stage: 'RDV', from: 'MOI', re: /\b(vous seriez (plutot )?disponible|on bloque|creneau|lundi a|mardi vers|20 minutes)\b/ },
  { stage: 'CLOSE', from: 'MOI', re: /\b(on part (la[- ]dessus|sur)|acompte|je vous envoie le (contrat|recap))\b/ },
  { stage: 'END', from: 'ANY', re: /\b(bonne journee|bonne continuation|au revoir|je vous laisse tranquille)\b/ },
];

export type StageDetection = {
  stage: Stage;
  objection: ObjectionType | null;
  objectionConfidence: number;
  /** true quand le prospect livre de l'information utile plutôt qu'un blocage. */
  informative: boolean;
};

const LINE_ORDER: Stage[] = [
  'OPENING',
  'DISCOVERY',
  'QUALIFICATION',
  'PROBLEM',
  'PAIN',
  'PITCH',
  'TEMPERATURE',
  'RECLOSE',
  'CLOSE',
  'RDV',
  'END',
];

function rank(stage: Stage): number {
  const i = LINE_ORDER.indexOf(stage);
  return i === -1 ? 0 : i;
}

/**
 * Estime la phase courante à partir de l'historique, de la dernière phrase et
 * de la phase précédemment retenue.
 */
export function inferStage(
  input: string,
  history: TranscriptTurn[] = [],
  previous?: Stage,
): StageDetection {
  const objection = detectObjection(input);

  // Phase « de base » : la plus avancée observée dans la transcription.
  let base: Stage = previous && previous !== 'OBJECTION' ? previous : 'OPENING';

  const turns = [...history, { speaker: 'PROSPECT' as const, content: input }];
  for (const turn of turns) {
    const t = normalize(turn.content);
    for (const cue of CUES) {
      if (cue.from !== 'ANY' && cue.from !== turn.speaker) continue;
      if (!cue.re.test(t)) continue;
      if (cue.stage === 'END') return { stage: 'END', objection: null, objectionConfidence: 0, informative: false };
      if (rank(cue.stage) > rank(base)) base = cue.stage;
    }
  }

  if (objection.type) {
    return {
      stage: 'OBJECTION',
      objection: objection.type,
      objectionConfidence: objection.confidence,
      informative: false,
    };
  }

  // Le prospect donne de l'information : phrase longue, pas de blocage détecté.
  const informative = normalize(input).split(' ').length >= 6;

  return { stage: base, objection: null, objectionConfidence: objection.confidence, informative };
}

/**
 * Décide s'il faut coacher ou se taire.
 *
 * Règle du playbook : « parfois, la meilleure décision est simplement de me
 * laisser écouter le prospect ». On ne produit une phrase à dire que si elle
 * fait réellement avancer la ligne.
 */
export function shouldCoach(detection: StageDetection, input: string): boolean {
  if (detection.objection) return true;
  if (detection.stage === 'END') return true;

  const t = normalize(input);

  // Une vraie question du prospect appelle une réponse.
  if (/\?$/.test(input.trim()) || /^(c'est quoi|qui etes|vous faites|comment|pourquoi|combien)\b/.test(t)) {
    return true;
  }

  // Phrase très courte / signal de continuation : laisser parler.
  const words = t.split(' ').filter(Boolean).length;
  if (words <= 4) return false;

  // Le prospect déroule : on laisse courir, sauf s'il vient d'énoncer un problème.
  if (detection.informative && !/\b(probleme|souci|galere|complique|frustre|manque|perdu|dommage)\b/.test(t)) {
    return false;
  }

  return true;
}
