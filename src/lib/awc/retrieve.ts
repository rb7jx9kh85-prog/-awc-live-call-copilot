import type { SupabaseClient } from '@supabase/supabase-js';
import type { KnowledgeItem } from './types';
import type { Stage } from './stages';
import type { ObjectionType } from './objections';

/**
 * Couche de récupération de connaissance.
 *
 * On n'envoie jamais tout le playbook au modèle : on sélectionne les règles et
 * morceaux de script qui correspondent à la phase et à l'objection courantes.
 * C'est la version « retrieval structuré » ; le schéma est prêt pour passer à
 * de l'embedding si le besoin devient réel.
 */

export const MAX_RULES = 8;
export const MAX_CHUNKS = 4;

type RetrieveArgs = {
  stage: Stage;
  objection: ObjectionType | null;
};

export type Knowledge = {
  rules: KnowledgeItem[];
  chunks: KnowledgeItem[];
  /** false quand la knowledge base est vide : le moteur doit le signaler. */
  available: boolean;
};

export async function retrieveKnowledge(
  supabase: SupabaseClient,
  { stage, objection }: RetrieveArgs,
): Promise<Knowledge> {
  // Les règles pertinentes : celles de la phase, celles de l'objection,
  // et les règles transverses (stage null = s'applique partout).
  const stageFilter = [stage, ...(objection ? ['OBJECTION'] : [])];

  const [rulesRes, chunksRes] = await Promise.all([
    supabase
      .from('knowledge_rules')
      .select('id, section, stage, objection_type, rule_text, priority, knowledge_documents(title)')
      .or(
        [
          `stage.in.(${stageFilter.join(',')})`,
          'stage.is.null',
          ...(objection ? [`objection_type.eq.${objection}`] : []),
        ].join(','),
      )
      .order('priority', { ascending: false })
      .limit(40),
    supabase
      .from('knowledge_chunks')
      .select('id, section, stage, objection_type, content, priority, knowledge_documents(title)')
      .or(
        objection
          ? `objection_type.eq.${objection},stage.eq.${stage}`
          : `stage.eq.${stage},stage.is.null`,
      )
      .order('priority', { ascending: false })
      .limit(20),
  ]);

  const rules = (rulesRes.data ?? []).map(mapRule);
  const chunks = (chunksRes.data ?? []).map(mapChunk);

  // Tri final : ce qui cible explicitement l'objection passe devant.
  const score = (item: KnowledgeItem) => {
    let s = item.priority;
    if (objection && item.objection_type === objection) s += 100;
    if (item.stage === stage) s += 50;
    return s;
  };

  rules.sort((a, b) => score(b) - score(a));
  chunks.sort((a, b) => score(b) - score(a));

  return {
    rules: rules.slice(0, MAX_RULES),
    chunks: chunks.slice(0, MAX_CHUNKS),
    available: rules.length > 0 || chunks.length > 0,
  };
}

type DocRef = { title: string } | { title: string }[] | null;

function docTitle(doc: DocRef): string | null {
  if (!doc) return null;
  return Array.isArray(doc) ? (doc[0]?.title ?? null) : doc.title;
}

type RuleRow = {
  id: string;
  section: string | null;
  stage: string | null;
  objection_type: string | null;
  rule_text: string;
  priority: number;
  knowledge_documents: DocRef;
};

type ChunkRow = {
  id: string;
  section: string | null;
  stage: string | null;
  objection_type: string | null;
  content: string;
  priority: number;
  knowledge_documents: DocRef;
};

function mapRule(row: RuleRow): KnowledgeItem {
  return {
    id: row.id,
    kind: 'rule',
    section: row.section,
    stage: row.stage,
    objection_type: row.objection_type,
    text: row.rule_text,
    priority: row.priority ?? 0,
    document_title: docTitle(row.knowledge_documents),
  };
}

function mapChunk(row: ChunkRow): KnowledgeItem {
  return {
    id: row.id,
    kind: 'chunk',
    section: row.section,
    stage: row.stage,
    objection_type: row.objection_type,
    text: row.content,
    priority: row.priority ?? 0,
    document_title: docTitle(row.knowledge_documents),
  };
}
