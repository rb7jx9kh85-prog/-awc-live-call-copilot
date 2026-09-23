/**
 * Taxonomie d'objections AWC + détection déterministe (FR).
 *
 * Principe du playbook : « ne classe pas automatiquement toute hésitation
 * comme une objection ». La détection renvoie donc aussi un score de
 * confiance, et le moteur laisse passer les signaux faibles.
 */

export const OBJECTIONS = [
  'PRIX',
  'TROP_CHER',
  'PAS_BUDGET',
  'PAS_MAINTENANT',
  'PAS_URGENT',
  'REFLECHIR',
  'ENVOYEZ_MAIL',
  'DEJA_QUELQUUN',
  'PAS_INTERESSE',
  'ASSOCIE',
  'RAPPELEZ_PLUS_TARD',
  'CONFIANCE',
  'PAS_BESOIN',
  'MAUVAIS_TIMING',
  'BESOIN_PAS_CLAIR',
  'PAS_LE_TEMPS',
  'COMPARER',
  'AUTRE',
] as const;

export type ObjectionType = (typeof OBJECTIONS)[number];

export const OBJECTION_LABEL: Record<ObjectionType, string> = {
  PRIX: 'PRIX',
  TROP_CHER: 'TROP CHER',
  PAS_BUDGET: 'PAS DE BUDGET',
  PAS_MAINTENANT: 'PAS MAINTENANT',
  PAS_URGENT: "PAS D'URGENCE",
  REFLECHIR: 'JE DOIS RÉFLÉCHIR',
  ENVOYEZ_MAIL: 'ENVOYEZ UN MAIL',
  DEJA_QUELQUUN: "J'AI DÉJÀ QUELQU'UN",
  PAS_INTERESSE: 'PAS INTÉRESSÉ',
  ASSOCIE: 'DOIT EN PARLER',
  RAPPELEZ_PLUS_TARD: 'RAPPELEZ PLUS TARD',
  CONFIANCE: 'CONFIANCE',
  PAS_BESOIN: 'PAS BESOIN',
  MAUVAIS_TIMING: 'MAUVAIS TIMING',
  BESOIN_PAS_CLAIR: 'BESOIN PAS CLAIR',
  PAS_LE_TEMPS: "PAS LE TEMPS",
  COMPARER: 'VEUT COMPARER',
  AUTRE: 'AUTRE',
};

export function isObjection(value: string): value is ObjectionType {
  return (OBJECTIONS as readonly string[]).includes(value);
}

/** Normalise pour la détection : minuscules, sans accents, apostrophes unifiées. */
export function normalize(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’'`]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

type Pattern = {
  type: ObjectionType;
  /** Poids : un match fort suffit, un match faible demande confirmation. */
  weight: number;
  re: RegExp;
};

/**
 * Les motifs sont écrits sur le texte normalisé (sans accents).
 * Ordre indifférent : on garde le meilleur score.
 */
const PATTERNS: Pattern[] = [
  // --- PRIX / BUDGET -------------------------------------------------------
  { type: 'TROP_CHER', weight: 1.0, re: /\b(c'est |ca fait |ca me parait |trop )?(trop cher|beaucoup trop cher|hors de prix)\b/ },
  { type: 'TROP_CHER', weight: 0.85, re: /\bcher\b.*\b(pour (moi|nous)|quand meme|franchement)\b/ },
  { type: 'PAS_BUDGET', weight: 0.95, re: /\b(pas (le |de )?budget|aucun budget|budget (est )?(serre|limite|restreint)|pas les moyens)\b/ },
  { type: 'PRIX', weight: 0.8, re: /\b(ca coute combien|combien ca coute|c'est quoi (le|votre) (prix|tarif)|quel est le prix)\b/ },

  // --- TIMING --------------------------------------------------------------
  { type: 'PAS_URGENT', weight: 1.0, re: /\b(pas (vraiment )?urgent|aucune urgence|rien d'urgent|pas une (urgence|priorite))\b/ },
  { type: 'PAS_MAINTENANT', weight: 0.95, re: /\b(pas (pour )?maintenant|pas tout de suite|plus tard|pas le bon moment|mauvais moment)\b/ },
  { type: 'RAPPELEZ_PLUS_TARD', weight: 1.0, re: /\b(rappelez[- ]moi|rappeler dans|recontactez[- ]moi|revenez vers moi)\b.*\b(dans|en|apres|mois|semaine|an)\b/ },
  { type: 'RAPPELEZ_PLUS_TARD', weight: 0.85, re: /\brappelez[- ]moi\b/ },
  { type: 'MAUVAIS_TIMING', weight: 0.8, re: /\b(en pleine (saison|periode)|c'est la haute saison|on est en plein)\b/ },

  // --- RÉFLEXION / DÉCISION ------------------------------------------------
  { type: 'REFLECHIR', weight: 1.0, re: /\b(je (dois|vais|voudrais) (y )?reflechir|laissez[- ]moi reflechir|il faut que j'y reflechisse|je prends le temps d'y penser)\b/ },
  // Le verbe peut être conjugué ou à l'infinitif (« j'en parle à » / « en parler à »),
  // et le décideur est souvent séparé du verbe. D'où les deux parties.
  {
    type: 'ASSOCIE',
    weight: 1.0,
    re: /(?=.*\b(parle|parler|parlerai|parlerais|parlons|discuter|demander|valider|consulter|soumettre|avis)\b).*\b(mon|ma|mes|notre|nos|l'|son|sa)\s*(associe|associee|femme|mari|epouse|conjoint|conjointe|equipe|frere|soeur|partenaire|comptable|patron|direction|chef|responsable|gerant|famille)\b/,
  },
  {
    type: 'ASSOCIE',
    weight: 0.95,
    re: /\b(en parler|en discuter|demander)\b\s*(a|avec)?\s*(quelqu'un|une autre personne|d'autres personnes)\b/,
  },
  { type: 'ASSOCIE', weight: 0.9, re: /\b(je ne suis pas (le |la )?seul(e)? a decider|on decide a deux|c'est une decision commune|ce n'est pas moi qui decide)\b/ },

  // --- ESQUIVE -------------------------------------------------------------
  { type: 'ENVOYEZ_MAIL', weight: 1.0, re: /\b(envoyez[- ]moi|vous pouvez m'envoyer|passez par)\b.*\b(un |le |votre )?(mail|e[- ]?mail|courriel|doc|documentation|plaquette|brochure|devis par mail)\b/ },
  { type: 'ENVOYEZ_MAIL', weight: 0.9, re: /\benvoyez[- ]moi (ca|cela|quelque chose)\b/ },
  { type: 'PAS_LE_TEMPS', weight: 0.95, re: /\b(je n'ai pas le temps|pas le temps|je suis (en train de travailler|occupe|en clientele|en rendez[- ]vous)|je travaille la)\b/ },

  // --- INTÉRÊT / BESOIN ----------------------------------------------------
  { type: 'PAS_INTERESSE', weight: 1.0, re: /\b(pas interesse|ca ne m'interesse pas|aucun interet|non merci)\b/ },
  { type: 'PAS_BESOIN', weight: 0.95, re: /\b(je n'ai pas besoin|on n'a pas besoin|pas besoin de (ca|site)|on n'en a pas besoin)\b/ },
  { type: 'DEJA_QUELQUUN', weight: 1.0, re: /\b(j'ai deja|on a deja|on travaille deja avec|on est deja)\b.*\b(quelqu'un|une agence|un prestataire|un developpeur|un webmaster|mon neveu|un site)\b/ },
  { type: 'DEJA_QUELQUUN', weight: 0.85, re: /\b(on s'en occupe en interne|c'est gere en interne|mon (neveu|fils|cousin) s'en occupe)\b/ },
  { type: 'BESOIN_PAS_CLAIR', weight: 0.85, re: /\b(je ne (vois|comprends) pas (bien )?(l'interet|ce que ca)|qu'est[- ]ce que ca m'apporte|a quoi ca (sert|servirait)|pas sur que ca (serve|m'apporte))\b/ },
  { type: 'PAS_BESOIN', weight: 0.8, re: /\b(instagram (me|nous) suffit|google (me|nous) suffit|le bouche[- ]a[- ]oreille (me|nous) suffit|on a deja assez de clients|on est complet)\b/ },

  // --- CONFIANCE -----------------------------------------------------------
  { type: 'CONFIANCE', weight: 0.95, re: /\b(je ne vous connais pas|jamais entendu parler|c'est qui|vous etes qui|une mauvaise experience|je me suis deja fait avoir|des references|ce que vous avez (deja )?fait)\b/ },
  { type: 'COMPARER', weight: 0.95, re: /\b(comparer|faire jouer la concurrence|voir (d'autres|ailleurs)|demander (d'autres|plusieurs) devis|d'autres agences)\b/ },
];

export type ObjectionDetection = {
  type: ObjectionType | null;
  confidence: number;
  /** Extrait du texte qui a déclenché la détection. Utile pour diagnostiquer. */
  matched: string | null;
};

/**
 * Détecte l'objection dominante dans une phrase du prospect.
 *
 * Retourne `null` lorsqu'aucun motif n'atteint le seuil : dans ce cas la phrase
 * est une information, pas une objection, et le copilote ne doit pas basculer
 * en mode traitement d'objection.
 */
export function detectObjection(text: string): ObjectionDetection {
  const t = normalize(text);
  if (!t) return { type: null, confidence: 0, matched: null };

  let best: ObjectionDetection = { type: null, confidence: 0, matched: null };

  for (const p of PATTERNS) {
    const m = p.re.exec(t);
    if (!m) continue;
    if (p.weight > best.confidence) {
      best = { type: p.type, confidence: p.weight, matched: m[0] };
    }
  }

  // Une question ouverte du prospect n'est pas une objection :
  // « et vous faites quoi exactement ? » ne doit pas déclencher un loop.
  if (best.type === 'PRIX' && /\?/.test(text) && !/\b(trop|cher|budget)\b/.test(t)) {
    best.confidence = Math.min(best.confidence, 0.6);
  }

  return best.confidence >= 0.7 ? best : { type: null, confidence: best.confidence, matched: null };
}
