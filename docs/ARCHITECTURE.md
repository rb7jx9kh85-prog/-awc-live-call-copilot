# Architecture

## Flux d'une suggestion

```
     phrase du prospect (saisie ou dictée)
                  │
                  ▼
      ┌───────────────────────┐
      │ 1. DÉTECTION          │  lib/awc/detect.ts
      │    phase du call      │  lib/awc/objections.ts
      │    objection ?        │
      │    faut-il coacher ?  │
      └───────────┬───────────┘
                  │  { stage, objection, informative }
                  ▼
      ┌───────────────────────┐
      │ 2. RÉCUPÉRATION       │  lib/awc/retrieve.ts
      │    règles + extraits  │  → Supabase (RLS)
      │    ciblés             │  max 8 règles + 4 extraits
      └───────────┬───────────┘
                  │
                  ▼
      ┌───────────────────────┐
      │ 3. DÉCISION           │  engine-openai.ts  (si clé)
      │                       │  engine-local.ts   (sinon / fallback)
      └───────────┬───────────┘
                  │  { action, say, next, confidence, sources }
                  ▼
      ┌───────────────────────┐
      │ 4. PERSISTANCE        │  ai_suggestions
      └───────────┬───────────┘
                  ▼
            écran LIVE
```

### 1. Détection

`inferStage()` combine trois signaux : la phase précédemment retenue, les
marqueurs observés dans la transcription (ce que **je** dis fait avancer la
ligne droite) et la dernière phrase du prospect. La phase ne recule jamais
sans raison ; une objection est une sortie de ligne explicite.

`detectObjection()` travaille sur du texte normalisé (minuscules, accents
retirés, apostrophes unifiées) et renvoie un score. **En dessous de 0,7,
aucune objection n'est retenue** : une hésitation n'est pas une objection.

`shouldCoach()` applique la règle anti sur-coaching. Le copilote se tait
quand le prospect livre de l'information sans blocage, et parle quand il
pose une vraie question, énonce un problème ou objecte.

### 2. Récupération

Plutôt que d'envoyer tout le playbook à chaque requête, on filtre la
knowledge base sur la phase et l'objection courantes, puis on classe :

- `objection_type` exact → +100
- `stage` exact → +50
- `priority` de la règle → score de base

Le schéma (`knowledge_documents` → `knowledge_chunks` / `knowledge_rules`)
est prêt pour une vraie architecture RAG : il suffirait d'ajouter une
colonne d'embeddings et un index vectoriel, sans changer le contrat de
`retrieveKnowledge()`.

### 3. Décision

**Moteur OpenAI** — contexte compact : fiche prospect, 6 derniers tours de
parole, état estimé, et uniquement les règles récupérées. Sortie contrainte
par un JSON Schema strict (`action`, `say`, `next`, `confidence`). Timeout
court (6 s par défaut) : en cold call, une réponse tardive est une réponse
inutile.

**Moteur local** — extrait les répliques entre guillemets des morceaux de
script AWC, y injecte les variables de la fiche prospect (`[ENTREPRISE]`,
`[PRÉNOM]`, `[OFFRE]`…) et coupe à trois phrases. Une variable non
renseignée est laissée visible plutôt que de produire une phrase fausse.

Les deux moteurs lisent la **même** knowledge base, donc les réponses
restent cohérentes avec les scripts quel que soit le moteur actif.

---

## Modèle de données

| Table | Rôle |
| --- | --- |
| `prospects` | fiche avant appel (§9 du cahier des charges) |
| `calls` | un appel : entreprise, script, durée, résultat, résumé |
| `call_messages` | transcription, `MOI` / `PROSPECT` |
| `ai_suggestions` | chaque suggestion + moteur + règles utilisées |
| `knowledge_documents` | documents Drive importés (provenance) |
| `knowledge_chunks` | extraits de script, indexés par phase / objection |
| `knowledge_rules` | règles de méthode, avec priorité et note de conflit |
| `scripts`, `script_sources` | scripts nommés et leur origine Drive |
| `sync_history` | historique des synchronisations |
| `app_allowlist` | adresses autorisées à lire la bibliothèque AWC |

### Provenance

`knowledge_documents` conserve `drive_file_id`, `source_url`, `modified_at`
et `revision_id`. `knowledge_rules.conflict_note` permet de signaler qu'une
règle contredit une version antérieure plutôt que de l'écraser
silencieusement — le cahier des charges (§17) l'exige pour pouvoir
diagnostiquer les différences entre versions de scripts.

---

## Bibliothèque AWC partagée

Le dépôt GitHub est public ; les scripts commerciaux d'Alpinia n'y figurent
donc pas. Ils sont importés directement en base avec `owner_id = null`.

- Une policy `shared_awc_read` autorise la lecture de ces lignes aux seuls
  comptes dont l'e-mail figure dans `app_allowlist`.
- La fonction `claim_awc_knowledge()` (SECURITY DEFINER, refusée hors
  allowlist) rattache la bibliothèque au compte appelant ; les policies
  propriétaires normales s'appliquent ensuite.

Un compte créé par un inconnu sur l'URL publique ne voit donc **ni** les
données d'autrui **ni** les scripts AWC.

---

## Resynchronisation Drive

L'écran **Méthode** expose l'état de la knowledge base et déclenche
`claim_awc_knowledge()`.

L'import depuis Drive lui-même est aujourd'hui réalisé hors application
(l'accès Drive n'est pas encore délégué au serveur). Le schéma est prêt pour
l'automatiser : `content_hash` et `revision_id` permettent de détecter les
documents modifiés, `sync_history` d'en journaliser le résultat, et
`conflict_note` de conserver les divergences entre versions.

---

## Choix de transcription

La V1 utilise la Web Speech API du navigateur : aucune clé, aucune latence
réseau supplémentaire, aucun flux audio envoyé à un tiers. Elle capte le
micro — donc la voix côté commercial, et le prospect uniquement en
haut-parleur.

Pour capter les deux canaux de façon fiable, l'étape suivante est un flux
serveur (Whisper ou Realtime) alimenté par la sortie de l'application
téléphonique. Le contrat de `/api/suggest` ne changerait pas : il reçoit du
texte, d'où qu'il vienne.
