# AWC LIVE — Straight Line Copilot

Copilote commercial temps réel pour les cold calls d'**Alpinia Web Craft**.

Pendant un appel, tu saisis (ou tu dictes) ce que le prospect vient de dire.
L'application estime la phase du call, détecte une éventuelle objection, va
chercher les règles et morceaux de script AWC correspondants, et affiche en
moins d'une seconde :

```
PROSPECT    « Ça m'intéresse mais ce n'est pas vraiment urgent. »
OBJECTION   PAS D'URGENCE
ACTION      ISOLER
DIS ÇA      « Je comprends. Qu'est-ce qui devrait changer concrètement
              pour que ça devienne le bon moment ? »
ENSUITE     ATTENDRE. Laisse-le nommer sa propre priorité.
```

Le copilote sait aussi **se taire** : quand le prospect livre de
l'information, l'action affichée est `ÉCOUTE` plutôt qu'une réponse inutile.

---

## Principe

Le moteur ne répond jamais « à froid » à une phrase isolée :

```
PROSPECT + HISTORIQUE + ÉTAT DU CALL + FICHE PROSPECT + OFFRE + MÉTHODE AWC
    → PROCHAINE MEILLEURE ACTION
```

Les réponses proviennent des scripts AWC réels, pas d'une Straight Line
générique trouvée en ligne. Chaque suggestion affiche sa provenance
(document source + section).

---

## Stack

| Élément | Choix |
| --- | --- |
| Framework | Next.js 15 (App Router) + TypeScript |
| Style | Tailwind CSS v4 |
| Base de données | Supabase (Postgres + Auth + RLS) |
| IA | OpenAI, côté serveur uniquement, sortie structurée |
| Transcription | Web Speech API (navigateur, aucune clé requise) |
| Hébergement | Vercel |

---

## Les deux moteurs

`/api/suggest` sélectionne son moteur à l'exécution :

1. **`openai`** — utilisé si `OPENAI_API_KEY` est configurée. Le prompt
   système est construit **entièrement** à partir des règles AWC récupérées
   en base : modifier un script dans Drive et resynchroniser change le
   comportement sans toucher au code.
2. **`awc-local`** — moteur déterministe, sans réseau. Il ne génère rien : il
   sélectionne la réplique dans les morceaux de script AWC et y injecte les
   variables de la fiche prospect.

Le moteur local sert de **fallback** : timeout, erreur ou quota OpenAI ne
laissent jamais l'écran LIVE vide pendant un appel. Le moteur réellement
utilisé est affiché sous chaque suggestion et stocké dans l'historique.

---

## Sécurité

- RLS activée sur les 11 tables ; un compte ne voit que ses propres lignes,
  et les tables filles vérifient aussi le propriétaire du parent.
- L'application n'utilise **aucune service-role key**. Tout passe par la
  session de l'utilisateur, donc aucun secret Supabase n'existe au runtime.
- `OPENAI_API_KEY` est lue uniquement côté serveur. Aucun secret n'est
  préfixé `NEXT_PUBLIC_`.
- **Les scripts commerciaux ne sont pas versionnés dans ce dépôt** (il est
  public). Ils vivent dans Supabase, sous RLS, lisibles uniquement par les
  adresses inscrites dans `app_allowlist`.

---

## Installation

```bash
npm install
cp .env.example .env.local   # puis renseigner les valeurs
npm run dev
```

### Variables d'environnement

| Variable | Obligatoire | Rôle |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | oui | URL du projet Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | oui | Clé publiable (non secrète) |
| `OPENAI_API_KEY` | non | Active le moteur OpenAI |
| `OPENAI_MODEL` | non | Défaut : `gpt-4.1-mini` |
| `OPENAI_TIMEOUT_MS` | non | Défaut : `6000` — au-delà, fallback local |

### Base de données

```bash
supabase db push        # applique supabase/migrations/
```

---

## Vérification

```bash
npm run typecheck
npm run lint
npm run test:scenarios   # détection d'objection + règle « ne pas sur-coacher »
npm run build
```

`test:scenarios` couvre les sept objections de référence, des variantes de
formulation, et les cas où le copilote doit rester silencieux.

---

## Structure

```
src/
├── app/
│   ├── live/                 cockpit d'appel
│   ├── prospects/            fiches prospect
│   ├── calls/                historique + analyse post-call
│   ├── knowledge/            état de la méthode AWC
│   └── api/suggest/          le moteur
├── lib/awc/
│   ├── stages.ts             machine d'état du call (14 phases)
│   ├── objections.ts         taxonomie + détection FR
│   ├── detect.ts             estimation de phase, règle anti sur-coaching
│   ├── retrieve.ts           récupération ciblée de la knowledge base
│   ├── engine-local.ts       moteur déterministe
│   └── engine-openai.ts      moteur OpenAI, sortie structurée
└── lib/supabase/             clients navigateur / serveur / middleware
```

Voir [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) pour le détail du flux et
du modèle de données.
