/**
 * Machine d'état du call AWC / Straight Line.
 *
 * Le moteur estime en continu la phase courante. Une objection n'est jamais
 * traitée hors contexte : la phase précédente conditionne le reclose.
 */

export const STAGES = [
  'OPENING',
  'DISCOVERY',
  'QUALIFICATION',
  'PROBLEM',
  'PAIN',
  'PITCH',
  'TEMPERATURE',
  'OBJECTION',
  'ISOLATION',
  'LOOP',
  'RECLOSE',
  'CLOSE',
  'RDV',
  'END',
] as const;

export type Stage = (typeof STAGES)[number];

/** Libellé court affiché dans le cockpit. */
export const STAGE_LABEL: Record<Stage, string> = {
  OPENING: 'OUVERTURE',
  DISCOVERY: 'DÉCOUVERTE',
  QUALIFICATION: 'QUALIFICATION',
  PROBLEM: 'PROBLÈME',
  PAIN: 'DOULEUR',
  PITCH: 'PITCH',
  TEMPERATURE: 'TEMPÉRATURE',
  OBJECTION: 'OBJECTION',
  ISOLATION: 'ISOLATION',
  LOOP: 'LOOP',
  RECLOSE: 'RECLOSE',
  CLOSE: 'CLOSE',
  RDV: 'RDV',
  END: 'FIN',
};

/**
 * Actions que le copilote peut recommander.
 * Volontairement peu nombreuses : lisibles en moins d'une seconde.
 */
export const ACTIONS = [
  'ECOUTER',
  'ATTENDRE',
  'CREUSER',
  'POSER_QUESTION',
  'RESUMER',
  'NE_PAS_PITCHER',
  'PITCHER',
  'TESTER_TEMPERATURE',
  'ISOLER',
  'LOOPER',
  'RECLOSER',
  'PROPOSER_RDV',
  'CLOSER',
  'SORTIE_PROPRE',
] as const;

export type Action = (typeof ACTIONS)[number];

export const ACTION_LABEL: Record<Action, string> = {
  ECOUTER: 'ÉCOUTE',
  ATTENDRE: 'ATTENDS',
  CREUSER: 'CREUSE',
  POSER_QUESTION: 'POSE CETTE QUESTION',
  RESUMER: 'RÉSUME',
  NE_PAS_PITCHER: 'NE PITCH PAS ENCORE',
  PITCHER: 'PITCHE',
  TESTER_TEMPERATURE: 'TESTE LA TEMPÉRATURE',
  ISOLER: 'ISOLER',
  LOOPER: 'LOOPER',
  RECLOSER: 'RECLOSER',
  PROPOSER_RDV: 'PROPOSER RDV',
  CLOSER: 'CLOSER',
  SORTIE_PROPRE: 'SORTIE PROPRE',
};

/** Ordre de progression nominal sur la ligne droite (hors branches objection). */
const LINE: Stage[] = [
  'OPENING',
  'DISCOVERY',
  'QUALIFICATION',
  'PROBLEM',
  'PAIN',
  'PITCH',
  'TEMPERATURE',
  'CLOSE',
  'RDV',
];

export function isStage(value: string): value is Stage {
  return (STAGES as readonly string[]).includes(value);
}

export function isAction(value: string): value is Action {
  return (ACTIONS as readonly string[]).includes(value);
}

/** Étape suivante sur la ligne droite. Utilisé après un loop réussi. */
export function nextOnLine(stage: Stage): Stage {
  const i = LINE.indexOf(stage);
  if (i === -1 || i === LINE.length - 1) return stage;
  return LINE[i + 1];
}
