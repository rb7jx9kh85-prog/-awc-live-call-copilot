import type { Action, Stage } from './stages';
import type { ObjectionType } from './objections';

/** Fiche prospect telle qu'utilisée par le moteur (sous-ensemble de la table). */
export type ProspectCard = {
  id?: string;
  company: string;
  first_name?: string | null;
  last_name?: string | null;
  website?: string | null;
  sector?: string | null;
  offer?: string | null;
  price?: string | null;
  problems?: string | null;
  weaknesses?: string | null;
  prior_info?: string | null;
  notes?: string | null;
  objective?: string | null;
  script?: string | null;
};

export type TranscriptTurn = {
  speaker: 'MOI' | 'PROSPECT';
  content: string;
};

/** Règle ou morceau de script récupéré depuis la knowledge base. */
export type KnowledgeItem = {
  id: string;
  kind: 'rule' | 'chunk';
  section: string | null;
  stage: string | null;
  objection_type: string | null;
  text: string;
  priority: number;
  document_title?: string | null;
};

/** Ce que le cockpit affiche. Tout est court par construction. */
export type Suggestion = {
  stage: Stage;
  objection: ObjectionType | null;
  action: Action;
  /** « DIS ÇA » — 1 à 3 phrases max, prononçables telles quelles. Vide si ÉCOUTE. */
  say: string;
  /** « ENSUITE » — une ligne. */
  next: string;
  /** 0..1 — sert à griser l'affichage quand le moteur n'est pas sûr. */
  confidence: number;
  /** Provenance : document + section, pour diagnostiquer une réponse bizarre. */
  sources: { title: string; section: string | null }[];
  /** 'openai' ou 'awc-local' — visible dans l'historique. */
  engine: string;
};

export type SuggestRequest = {
  callId?: string | null;
  prospect: ProspectCard;
  /** Dernière phrase du prospect (mode manuel ou transcription). */
  input: string;
  /** Fin de transcription, du plus ancien au plus récent. */
  history?: TranscriptTurn[];
  /** Phase estimée précédemment, pour éviter de repartir de zéro. */
  currentStage?: Stage;
  /** L'utilisateur a demandé « AUTRE RÉPONSE ». */
  alternative?: boolean;
};
