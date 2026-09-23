/**
 * Régression sur la détection d'objection et la décision de coacher.
 *
 * Volontairement sans réseau ni base : ces deux fonctions décident de tout
 * l'écran LIVE, elles doivent être vérifiables en une seconde.
 *
 *   npm run test:scenarios
 */

import { detectObjection } from '../src/lib/awc/objections';
import { inferStage, shouldCoach } from '../src/lib/awc/detect';
import type { ObjectionType } from '../src/lib/awc/objections';

type Case = { input: string; objection: ObjectionType | null; coach?: boolean };

const CASES: Case[] = [
  // --- Les 7 scénarios imposés -------------------------------------------
  { input: "C'est trop cher.", objection: 'TROP_CHER' },
  { input: 'Je dois réfléchir.', objection: 'REFLECHIR' },
  { input: 'Envoyez-moi plutôt un mail.', objection: 'ENVOYEZ_MAIL' },
  { input: "Ça m'intéresse mais ce n'est pas vraiment urgent.", objection: 'PAS_URGENT' },
  { input: "On a déjà quelqu'un qui s'occupe de ça.", objection: 'DEJA_QUELQUUN' },
  { input: "Il faut que j'en parle à mon associé.", objection: 'ASSOCIE' },
  { input: 'Rappelez-moi dans trois mois.', objection: 'RAPPELEZ_PLUS_TARD' },

  // --- Variantes de formulation ------------------------------------------
  { input: "Je dois en parler à ma femme d'abord.", objection: 'ASSOCIE' },
  { input: "Ce n'est pas moi qui décide.", objection: 'ASSOCIE' },
  { input: 'Franchement je trouve ça beaucoup trop cher pour ce que c’est.', objection: 'TROP_CHER' },
  { input: "On n'a pas le budget cette année.", objection: 'PAS_BUDGET' },
  { input: 'Ce n’est pas le bon moment là.', objection: 'PAS_MAINTENANT' },
  { input: 'Je ne suis pas intéressé.', objection: 'PAS_INTERESSE' },
  { input: "Je n'ai pas le temps, je suis en clientèle.", objection: 'PAS_LE_TEMPS' },
  { input: 'Je veux comparer avec d’autres agences avant.', objection: 'COMPARER' },
  { input: 'Je ne vous connais pas, vous avez des références ?', objection: 'CONFIANCE' },
  { input: 'Instagram nous suffit pour l’instant.', objection: 'PAS_BESOIN' },
  { input: "Je ne vois pas bien l'intérêt pour nous.", objection: 'BESOIN_PAS_CLAIR' },

  // --- Ne PAS sur-coacher : information, pas objection --------------------
  {
    input:
      'Alors nous on fait surtout du detailing haut de gamme, on a ouvert il y a trois ans et on travaille beaucoup avec des concessions.',
    objection: null,
    coach: false,
  },
  { input: 'Oui tout à fait.', objection: null, coach: false },
  { input: 'Les clients viennent surtout par Instagram et le bouche-à-oreille.', objection: null, coach: false },

  // --- Une vraie question appelle une réponse -----------------------------
  { input: 'Vous faites quoi exactement ?', objection: null, coach: true },
];

let pass = 0;
const failures: string[] = [];

for (const c of CASES) {
  const detected = detectObjection(c.input).type;
  const detection = inferStage(c.input, []);
  const coach = shouldCoach(detection, c.input);

  const objectionOk = detected === c.objection;
  const coachOk = c.coach === undefined || coach === c.coach;

  if (objectionOk && coachOk) {
    pass += 1;
  } else {
    failures.push(
      `« ${c.input} »\n    objection attendue ${c.objection ?? 'aucune'}, obtenue ${detected ?? 'aucune'}` +
        (c.coach === undefined ? '' : `\n    coach attendu ${c.coach}, obtenu ${coach}`),
    );
  }
}

console.log(`${pass}/${CASES.length} cas OK`);
if (failures.length > 0) {
  console.error('\nÉchecs :');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
