# GiniAI Sandbox — Civic Layer & Custom Referendum Architecture

> Documentation technique du système de référendums, profils civiques et intégration LLM locale.
> Version 1.0 — Mars 2026

---

## Table des matières

1. [Vue d'ensemble](#1-vue-densemble)
2. [Architecture des modules](#2-architecture-des-modules)
3. [Profils civiques](#3-profils-civiques)
4. [Pipeline d'un référendum](#4-pipeline-dun-référendum)
5. [Scoring des opinions](#5-scoring-des-opinions)
6. [Influence sociale (3 anneaux)](#6-influence-sociale-3-anneaux)
7. [Vote et résultats](#7-vote-et-résultats)
8. [Référendums custom + LLM](#8-référendums-custom--llm)
9. [LocalLLMBridge — Client Ollama](#9-localllmbridge--client-ollama)
10. [UI & Store Pinia](#10-ui--store-pinia)
11. [Fichiers du projet](#11-fichiers-du-projet)

---

## 1. Vue d'ensemble

Le Civic Layer ajoute une dimension politique au simulateur économique existant.
Chaque citoyen possède un **profil civique** dérivé de son vécu matériel.
Des **référendums** (prédéfinis ou personnalisés) déclenchent un pipeline :
scoring → influence sociale → formation de blocs → vote → résultats.

```
┌─────────────────────────────────────────────────────────────────┐
│                     GiniAI Sandbox                              │
│                                                                 │
│  ┌──────────────┐   ┌──────────────┐   ┌────────────────────┐  │
│  │  SimEngine    │   │  CivicEngine │   │  LocalLLMBridge    │  │
│  │  (économie,   │──▶│  (opinions,  │◀──│  (Ollama/Qwen2.5)  │  │
│  │   agents,     │   │   influence, │   │  1 appel/réf.      │  │
│  │   locations)  │   │   blocs,     │   │  cache + fallback  │  │
│  └──────┬───────┘   │   vote)      │   └────────────────────┘  │
│         │           └──────┬───────┘                            │
│         │                  │                                    │
│         ▼                  ▼                                    │
│  ┌──────────────┐   ┌──────────────┐                           │
│  │  simStore     │   │  civicStore  │                           │
│  │  (Pinia)      │   │  (Pinia)    │                           │
│  └──────┬───────┘   └──────┬───────┘                           │
│         │                  │                                    │
│         └────────┬─────────┘                                    │
│                  ▼                                              │
│         ┌──────────────────┐                                    │
│         │  ReferendumPanel  │                                   │
│         │  (Vue 3 UI)       │                                   │
│         └──────────────────┘                                    │
└─────────────────────────────────────────────────────────────────┘
```

**Principe clé** : le LLM n'est **pas** le décideur. Il génère uniquement un vecteur de poids
qui paramètre le moteur numérique déterministe. Le cœur reste explicable et reproductible.

---

## 2. Architecture des modules

```
src/simulation/civic/
├── types.ts           # Interfaces : CivicProfile, OpinionState, Referendum, etc.
├── referendums.ts     # Configs prédéfinies (immigration, redistribution, automation)
├── CivicEngine.ts     # Pipeline stateless : create → opinions → influence → vote
├── LocalLLMBridge.ts  # Client Ollama : 1 appel LLM → vecteur de poids
└── index.ts           # Barrel exports

src/stores/
└── civicStore.ts      # Pinia store : état du référendum, actions, bridge LLM

src/components/v2/
└── ReferendumPanel.vue  # UI : lancement, blocs, vote, question custom
```

---

## 3. Profils civiques

Chaque citoyen possède 6 traits continus dans `[0, 1]` :

| Trait                    | 0 =                | 1 =                      | Dérivé de...                      |
|--------------------------|---------------------|--------------------------|-----------------------------------|
| `economicInsecurity`     | financièrement sûr  | très précaire            | richesse, emploi, dette           |
| `institutionalTrust`     | méfiant             | confiance élevée         | interactions positives, propriété |
| `automationShock`        | non impacté         | sévèrement impacté       | licenciement par automation       |
| `authoritarianTendency`  | libertaire          | autoritaire              | criminalité subie, éducation      |
| `conformity`             | indépendant         | suit le groupe           | âge, emploi, propriété            |
| `politicalAttention`     | apathique           | très engagé              | éducation, richesse, événements   |

```
  Agent (citoyen simulé)
  ┌──────────────────────────────────────────┐
  │  id: "agent_042"                         │
  │  state: "employed"                       │
  │  wealth: $12,500                         │
  │  education: "medium"                     │
  │                                          │
  │  civicProfile:                           │
  │  ┌────────────────────────────────────┐  │
  │  │ economicInsecurity   ████░░░░ 0.45 │  │
  │  │ institutionalTrust   ██████░░ 0.72 │  │
  │  │ automationShock      █░░░░░░░ 0.12 │  │
  │  │ authoritarianTendency███░░░░░ 0.38 │  │
  │  │ conformity           █████░░░ 0.61 │  │
  │  │ politicalAttention   ██░░░░░░ 0.28 │  │
  │  └────────────────────────────────────┘  │
  │                                          │
  │  opinionState: (pendant un référendum)   │
  │  ┌────────────────────────────────────┐  │
  │  │ score: -0.23  →  label: NO        │  │
  │  │ conviction: 0.41                  │  │
  │  │ vote: null (pas encore voté)      │  │
  │  └────────────────────────────────────┘  │
  └──────────────────────────────────────────┘
```

Les profils sont **dérivés du vécu simulé** et **mis à jour par événements de vie** :

```
  Événement de vie          │  Effet sur le profil civique
  ──────────────────────────┼──────────────────────────────────
  automated (licencié IA)   │  economicInsecurity ↑  automationShock ↑  institutionalTrust ↓
  economic_layoff            │  economicInsecurity ↑  institutionalTrust ↓
  hired                      │  economicInsecurity ↓
  upskilled                  │  economicInsecurity ↓  politicalAttention ↑
  crime_victim               │  authoritarianTendency ↑  institutionalTrust ↓
  mortgage_paid              │  institutionalTrust ↑  conformity ↑
```

---

## 4. Pipeline d'un référendum

Un référendum suit un pipeline séquentiel de 6 étapes.
Les fonctions sont **stateless** et opèrent sur les agents + l'objet referendum.

```
  ┌─────────────────┐
  │  1. CREATE       │  createReferendum(topic, ?question, ?weights)
  │  Referendum      │  → objet Referendum avec question + poids
  └────────┬────────┘
           ▼
  ┌─────────────────┐
  │  2. INIT         │  initializeOpinions(agents, referendum, rng)
  │  Opinions        │  → score [-1,+1] + conviction + label par agent
  └────────┬────────┘
           ▼
  ┌─────────────────┐
  │  3. FORM         │  formBlocs(agents, referendum)
  │  Blocs           │  → blocs YES / NO / UNDECIDED avec cohésion
  └────────┬────────┘
           ▼
  ┌─────────────────┐     ╔═══════════════════════╗
  │  4. INFLUENCE    │────▶║  Répéter 0 à 3 rounds ║
  │  Rounds          │◀────╚═══════════════════════╝
  │  (3 anneaux)     │  runInfluenceRound(agents, locations, referendum, rng)
  └────────┬────────┘  + formBlocs() après chaque round
           ▼
  ┌─────────────────┐
  │  5. VOTE         │  runVote(agents, referendum, rng)
  │                  │  → YES / NO / ABSTAIN par agent
  └────────┬────────┘
           ▼
  ┌─────────────────┐
  │  6. RESULTS      │  computeBreakdowns(agents, referendum)
  │  Breakdowns      │  → turnout, shares, breakdowns par éducation/emploi/richesse
  └─────────────────┘
```

### Phases du référendum

| Phase          | Description                                          |
|----------------|------------------------------------------------------|
| `opinion_init` | Calcul des scores initiaux à partir des profils      |
| `influence`    | Rounds d'influence sociale (UI permet round par round)|
| `voting`       | Phase de vote en cours                               |
| `results`      | Vote terminé, résultats + breakdowns disponibles     |

---

## 5. Scoring des opinions

L'opinion initiale de chaque citoyen est un **produit scalaire** entre
son profil civique et le vecteur de poids du référendum :

```
  score = Σ (trait_i × poids_i) + biais_personnel + bruit

  Exemple : "Faut-il réguler l'automation ?"

  Poids du référendum :
    economicInsecurity:    +0.4
    institutionalTrust:    -0.1
    automationShock:       +0.6  ← le plus fort
    authoritarianTendency: +0.1
    conformity:             0.0
    politicalAttention:    +0.1

  Agent_042 (profil):           Calcul :
    economicInsecurity   0.45 × (+0.4) = +0.180
    institutionalTrust   0.72 × (-0.1) = -0.072
    automationShock      0.12 × (+0.6) = +0.072
    authoritarianTendency 0.38 × (+0.1) = +0.038
    conformity           0.61 × ( 0.0) =  0.000
    politicalAttention   0.28 × (+0.1) = +0.028
                                        ────────
                              somme     = +0.246
                         + biais perso  = -0.08  (aléatoire [-0.2, +0.2])
                         + bruit        = +0.02
                                        ────────
                         score final    = +0.188  →  label: YES (> 0.15)
```

### Conversion score → label

```
  score > +0.15  →  YES
  score < -0.15  →  NO
  sinon          →  UNDECIDED
```

### Conviction

```
  conviction = 0.15 + |score| × 0.5 + politicalAttention × 0.3 × random
  clamp(0, 1)
```

Plus le score est fort et l'attention politique élevée, plus la conviction est haute.
Un plancher de 0.15 assure que même les tièdes ont un minimum de conviction.

---

## 6. Influence sociale (3 anneaux)

Chaque round d'influence expose l'agent à 3 cercles relationnels :

```
                    ┌─────────────────────────────────┐
                    │       ESPACE SIMULÉ              │
                    │                                  │
                    │    ○ ○     Ring 2: Voisins       │
                    │   ○   ○    spatiaux (rayon 8)    │
                    │  ○  ●  ○   poids: 0.25           │
                    │   ○   ○                          │
                    │    ○ ○                            │
                    │                                  │
  Ring 1: Ménage   │  ┌───┐  même homeId              │
  poids: 0.40      │  │🏠│  agent + colocataires     │
                    │  └───┘                           │
                    │                                  │
  Ring 3: Collègues│  ┌───┐  même workplaceId         │
  poids: 0.15      │  │🏭│  agent + collègues        │
                    │  └───┘                           │
                    └─────────────────────────────────┘
```

### Formule d'influence

```
  ringAvg = moyenne_pondérée(scores des voisins, poids du ring)

  influenceStrength = conformité × (1 - conviction × 0.6)

  nouveau_score = ancien_score + (ringAvg - ancien_score) × influenceStrength × 0.3
```

**Interprétation** :
- Un agent **conformiste** (conformity élevée) est fortement tiré vers la moyenne du groupe
- Un agent avec une **forte conviction** résiste au changement
- L'influence est **graduelle** (facteur 0.3) — pas de basculement brutal

### Après chaque round

Les blocs sont recalculés (`formBlocs`) pour refléter les changements d'opinion.
L'UI affiche les tailles de blocs mises à jour après chaque round.

---

## 7. Vote et résultats

### Participation

```
  P(vote) = 0.35 + politicalAttention × 0.3 + conviction × 0.25
  clamp(0, 1)
```

Un plancher de 0.35 garantit un turnout minimum réaliste (~50-80%).

### Choix de vote

```
  Si l'agent participe :
    label = YES       →  vote = YES
    label = NO        →  vote = NO
    label = UNDECIDED →  vote = YES si (score + random) > 0, sinon NO

  Si l'agent ne participe pas :
    vote = ABSTAIN
```

### Breakdowns

Le résultat final inclut des ventilations par :
- **Éducation** : low / medium / high
- **Emploi** : employed / unemployed / retired / etc.
- **Richesse** : Q1 (poorest) → Q4 (richest)
- **Logement** : owner / renter

---

## 8. Référendums custom + LLM

### Principe

L'utilisateur peut poser **n'importe quelle question** de référendum.
Un LLM local (Ollama) génère dynamiquement le vecteur de poids civiques.

```
  ┌──────────────────────────────────────────────────────────────┐
  │  FLUX : RÉFÉRENDUM CUSTOM                                    │
  │                                                              │
  │  Utilisateur                                                 │
  │      │                                                       │
  │      │  "Faut-il légaliser le cannabis ?"                    │
  │      ▼                                                       │
  │  ┌──────────────┐                                            │
  │  │ civicStore    │  launchCustomReferendum(question)          │
  │  │ (Pinia)      │                                            │
  │  └──────┬───────┘                                            │
  │         │                                                    │
  │         ▼                                                    │
  │  ┌──────────────┐     ┌─────────────────┐                    │
  │  │ LocalLLM     │────▶│  Ollama Server  │                    │
  │  │ Bridge       │◀────│  (qwen2.5:7b)   │                    │
  │  │              │     │  localhost:11434 │                    │
  │  │ ┌──────────┐ │     └─────────────────┘                    │
  │  │ │  cache   │ │                                            │
  │  │ └──────────┘ │     Réponse (~2s) :                        │
  │  └──────┬───────┘     { "economicInsecurity": 0.1,           │
  │         │               "institutionalTrust": -0.2,          │
  │         │               "automationShock": 0.0,              │
  │         │               "authoritarianTendency": 0.3,        │
  │         │               "conformity": -0.1,                  │
  │         │               "politicalAttention": 0.2 }          │
  │         ▼                                                    │
  │  ┌──────────────┐                                            │
  │  │ CivicEngine  │  createReferendum('custom', question, w)   │
  │  │              │  initializeOpinions(agents, ref, rng)      │
  │  │              │  formBlocs(agents, ref)                     │
  │  └──────────────┘                                            │
  │         │                                                    │
  │         ▼                                                    │
  │    Pipeline normal : influence → vote → résultats            │
  └──────────────────────────────────────────────────────────────┘
```

### Preset vs Custom — comparaison

```
  PRESET (ex: immigration)          CUSTOM (ex: "ban cars?")
  ┌────────────────────┐           ┌────────────────────┐
  │ Poids codés en dur │           │ Poids générés par  │
  │ dans referendums.ts│           │ Ollama (1 appel)   │
  │                    │           │                    │
  │ economicIns: -0.3  │           │ economicIns: +0.1  │
  │ instTrust:   +0.2  │           │ instTrust:   -0.3  │
  │ autoShock:   -0.2  │           │ autoShock:    0.0  │
  │ authTend:    -0.4  │           │ authTend:    +0.4  │
  │ conformity:  -0.1  │           │ conformity:  -0.2  │
  │ polAttent:   +0.1  │           │ polAttent:   +0.2  │
  └────────┬───────────┘           └────────┬───────────┘
           │                                │
           └──────────┬─────────────────────┘
                      ▼
            ┌──────────────────┐
            │  MÊME pipeline   │
            │  d'opinions,     │
            │  influence et    │
            │  vote            │
            └──────────────────┘
```

---

## 9. LocalLLMBridge — Client Ollama

### Fonctionnement interne

```
  generateWeightsFromQuestion(question)
  │
  ├─ 1. Cache hit ?  ─── OUI ──▶ retourner poids cachés
  │
  ├─ 2. resolveModel()
  │     Interroge GET /api/tags
  │     Priorité : qwen2.5:7b > qwen2.5:14b > qwen3.5:9b
  │     Sinon → 1er modèle dispo
  │
  ├─ 3. POST /api/chat
  │     ┌─────────────────────────────────────────┐
  │     │ model: "qwen2.5:7b"                     │
  │     │ messages:                                │
  │     │   system: "You are a political analyst…" │
  │     │   user: 'Referendum question: "…"        │
  │     │          Assign weights -0.6 to +0.6…'   │
  │     │ stream: false                            │
  │     │ options: { temperature: 0.3,             │
  │     │           num_predict: 1024 }            │
  │     └─────────────────────────────────────────┘
  │
  ├─ 4. Parse la réponse
  │     ├─ Lire : message.content || message.thinking || response
  │     ├─ Stratégie 1 : extraire JSON { ... }
  │     └─ Stratégie 2 : extraire prose "trait: value" (fallback Qwen3.5)
  │
  ├─ 5. Valider : 6 clés numériques, clamp [-0.6, +0.6]
  │
  ├─ 6. Mettre en cache (question → poids)
  │
  └─ 7. Retourner { weights, fromLLM: true }

  En cas d'erreur / timeout (180s) / modèle absent :
  └─ Retourner FALLBACK_WEIGHTS { fromLLM: false }
```

### Prompt système

Le prompt demande au LLM de jouer un **analyste politique** pour la simulation :

```
You are a political analyst for a city simulation.
Given a referendum question, determine how each citizen personality trait
influences their vote. Assign a weight between -0.6 and +0.6 for each trait.
Positive = pushes toward YES, negative = pushes toward NO, zero = irrelevant.

Traits:
1. economicInsecurity (0=secure, 1=very insecure)
2. institutionalTrust (0=distrust, 1=high trust)
3. automationShock (0=unaffected, 1=severely impacted by automation)
4. authoritarianTendency (0=libertarian, 1=authoritarian)
5. conformity (0=independent, 1=follows group)
6. politicalAttention (0=apathetic, 1=very engaged)

Respond with ONLY a JSON object, nothing else.
```

### Compatibilité modèles

| Modèle       | Thinking mode | Output field    | Vitesse | Recommandé |
|--------------|---------------|-----------------|---------|------------|
| qwen2.5:7b   | Non           | `content` (JSON)| ~2s     | ✅ OUI     |
| qwen2.5:14b  | Non           | `content` (JSON)| ~5s     | ✅ OUI     |
| qwen3.5:9b   | Oui           | `thinking` only | ~60s+   | ⚠️ Lent    |
| qwen3.5:35b  | Oui           | `thinking` only | ~120s+  | ❌ Trop lent|

**Note** : Les modèles Qwen3.5 activent automatiquement un mode "thinking" qui met
tout l'output dans un champ `thinking` séparé. Le bridge les supporte via un parser
prose, mais ils sont trop lents pour une utilisation interactive.

### Fallback

Si Ollama est offline, le modèle absent ou le timeout atteint :

```
FALLBACK_WEIGHTS = {
  economicInsecurity:     0.1,
  institutionalTrust:     0.1,
  automationShock:        0.0,
  authoritarianTendency: -0.1,
  conformity:             0.0,
  politicalAttention:     0.1,
}
```

Ces poids neutres produisent une distribution d'opinions modérée et équilibrée.

---

## 10. UI & Store Pinia

### civicStore — État et actions

```
  civicStore (Pinia)
  ┌───────────────────────────────────────────────┐
  │  STATE                                        │
  │  ├─ currentReferendum: Referendum | null       │
  │  ├─ referendumHistory: ReferendumResult[]      │
  │  ├─ llmLoading: boolean                       │
  │  ├─ llmError: string | null                   │
  │  ├─ lastCustomWeights: CivicWeightVector      │
  │  ├─ lastWeightsFromLLM: boolean               │
  │  └─ ollamaAvailable: boolean | null           │
  │                                               │
  │  GETTERS                                      │
  │  ├─ isActive   (référendum en cours ?)        │
  │  ├─ phase      (opinion_init|influence|…)     │
  │  ├─ blocs      (YES / NO / UNDECIDED)         │
  │  ├─ result     (résultat final)               │
  │  └─ isLLMLoading                              │
  │                                               │
  │  ACTIONS                                      │
  │  ├─ launchReferendum(topic)        — preset   │
  │  ├─ launchCustomReferendum(text)   — LLM      │
  │  ├─ runDebateRound()               — 1 round  │
  │  ├─ executeVote()                  — vote      │
  │  ├─ runFullReferendum(topic)       — tout      │
  │  ├─ clearReferendum()              — reset     │
  │  └─ checkOllama()                  — ping      │
  └───────────────────────────────────────────────┘
```

### ReferendumPanel.vue — Interface utilisateur

```
  ┌───────────────────────────────────┐
  │  🗳️ REFERENDUM                    │
  │                                   │
  │  ┌─────────────────────────────┐  │
  │  │ 🌍 Immigration             │  │  ← topics prédéfinis
  │  │ 💰 Redistribution          │  │
  │  │ 🤖 Automation Control      │  │
  │  └─────────────────────────────┘  │
  │                                   │
  │  Or ask any question:             │
  │  ┌──────────────────────┐ ┌──┐   │
  │  │ Ban cars downtown?   │ │🚀│   │  ← question libre
  │  └──────────────────────┘ └──┘   │
  │  🟢 Ollama connected              │  ← statut Ollama
  │                                   │
  │  ─────────────────────────────── │
  │  (après lancement)               │
  │                                   │
  │  "Should we ban cars?"            │  ← question active
  │  Phase: influence · Round 0/3     │
  │  ⚖️ LLM weights ▸                │  ← toggle poids
  │    economicIns: 0.10              │
  │    instTrust:  -0.30              │
  │    ...                            │
  │                                   │
  │  [▶ Run Influence Round]          │
  │  [🗳 Execute Vote]                │
  │  [✕ Clear]                        │
  │                                   │
  │  📊 OPINION BLOCS                 │
  │  ┌──────────────────────────────┐ │
  │  │ YES        ██████░░░    42  │ │
  │  │ NO         ████████░   108  │ │
  │  │ UNDECIDED  ██░░░░░░░    23  │ │
  │  └──────────────────────────────┘ │
  └───────────────────────────────────┘
```

---

## 11. Fichiers du projet

### Module civic

| Fichier | Rôle | Lignes |
|---------|------|--------|
| `types.ts` | Interfaces TypeScript (CivicProfile, Referendum, etc.) | ~117 |
| `referendums.ts` | Configs prédéfinies + constantes (seuils, poids rings) | ~63 |
| `CivicEngine.ts` | Pipeline stateless (create → opinions → influence → vote → results) | ~427 |
| `LocalLLMBridge.ts` | Client Ollama (resolve model, prompt, parse, cache, fallback) | ~239 |
| `index.ts` | Barrel exports | ~11 |

### Store & UI

| Fichier | Rôle |
|---------|------|
| `civicStore.ts` | Pinia store — bridge entre CivicEngine et l'UI |
| `ReferendumPanel.vue` | Composant Vue 3 — lancement, blocs, vote, question custom |

### Dépendances externes

| Service | URL | Usage |
|---------|-----|-------|
| Ollama | `http://localhost:11434` | Serveur LLM local |
| qwen2.5:7b | via Ollama | Modèle recommandé (4.7GB, ~2s/appel) |
| GNews.io | `https://gnews.io/api/v4` | Headlines récentes (optionnel, clé API gratuite) |

---

## 12. WorldContextProvider — Données du monde réel

Le `WorldContextProvider` injecte des données du monde réel dans les prompts LLM,
permettant des questions comme *"Faut-il investir dans le NASDAQ ?"* ou
*"La guerre contre l'Iran aura-t-elle un impact économique ?"*.

### Architecture à 2 couches

```
  Session start
       │
       ├─ Couche 1: LLM BASE CONTEXT (toujours disponible)
       │  ┌────────────────────────────────────────────────┐
       │  │  Demande à Ollama :                            │
       │  │  "Résume l'état du monde : économie,           │
       │  │   géopolitique, tech, marchés, société"        │
       │  │                                                │
       │  │  Réponse (~5s, ~2000 chars) :                  │
       │  │  ECONOMY: Inflation 8%, recession risks...     │
       │  │  GEOPOLITICS: Ukraine war, Iran tensions...    │
       │  │  TECHNOLOGY: AI regulation, crypto $17K...     │
       │  │  MARKETS: S&P500 -19%, NASDAQ -34%...          │
       │  └────────────────────────────────────────────────┘
       │
       ├─ Couche 2: LIVE HEADLINES (optionnelle, si API key)
       │  ┌────────────────────────────────────────────────┐
       │  │  GET gnews.io/api/v4/top-headlines             │
       │  │  Categories: general, business, technology     │
       │  │  Max 5 articles par catégorie                  │
       │  │                                                │
       │  │  [GENERAL]                                     │
       │  │  - Trump proposes 50% tariffs (2026-03-18)     │
       │  │  - ECB lowers rates to 2.5%                    │
       │  │  [BUSINESS]                                    │
       │  │  - Tesla stock drops 12% after recall          │
       │  │  [TECHNOLOGY]                                  │
       │  │  - EU passes AI Act enforcement rules          │
       │  └────────────────────────────────────────────────┘
       │
       └─ Fusion → WorldContext (caché pour toute la session)
```

### Injection dans le prompt LLM

Le contexte mondial est **automatiquement injecté** dans le system prompt
de chaque référendum custom, sans appel LLM supplémentaire :

```
  AVANT (sans WorldContext) :
  ┌──────────────────────────────────────────────────────┐
  │ System: "You are a political analyst..."             │
  │ User:   "Referendum: invest in NASDAQ?"              │
  │                                                      │
  │ → LLM répond avec ses connaissances générales        │
  │ → Poids génériques, peu contextualisés               │
  └──────────────────────────────────────────────────────┘

  APRÈS (avec WorldContext) :
  ┌──────────────────────────────────────────────────────┐
  │ System: "You are a political analyst..."             │
  │                                                      │
  │         === WORLD SITUATION ===                      │
  │         ECONOMY: NASDAQ -34%, inflation 8%...        │
  │         GEOPOLITICS: Iran tensions, Ukraine...       │
  │         === RECENT HEADLINES ===                     │
  │         - Trump tariffs, ECB rates, Tesla...         │
  │                                                      │
  │ User:   "Referendum: invest in NASDAQ?"              │
  │                                                      │
  │ → LLM répond EN CONTEXTE : "NASDAQ en chute,        │
  │   récession probable → les précaires votent NON"     │
  │ → Poids réalistes et différenciés                    │
  └──────────────────────────────────────────────────────┘
```

### Résultats observés

| Question | YES | NO | UNDECIDED | Cohérent ? |
|----------|-----|----|-----------|------------|
| "Invest in NASDAQ?" | 28 | 98 | 68 | ✅ NON dominant (NASDAQ -34%) |
| "Iran war → economic impact?" | 154 | 0 | 12 | ✅ OUI écrasant (énergie + géopolitique) |
| "Buy Bitcoin?" | 28 | 49 | 89 | ✅ Partagé mais NON (BTC $17K, volatilité) |

### Configuration GNews (optionnelle)

Pour activer les headlines en temps réel, ajouter dans `.env` :

```env
VITE_GNEWS_API_KEY=your_free_api_key_here
```

Créer un compte gratuit sur [gnews.io](https://gnews.io) (100 req/jour).
Sans clé API, seul le contexte LLM (couche 1) est utilisé.

### Fichier

| Fichier | Rôle |
|---------|------|
| `WorldContextProvider.ts` | Provider 2 couches : LLM context + news API, cache session |

---

## Budget d'inférence

```
  ┌──────────────────────────────────────────────────────┐
  │  BUDGET LLM PAR SESSION                              │
  │                                                      │
  │  World context (1x au démarrage) :                   │
  │    Appel Ollama :    1                               │
  │    Tokens output :   ~500                            │
  │    Latence :         ~5s                             │
  │    Cache :           6 heures                        │
  │                                                      │
  │  Par référendum custom :                             │
  │    Appel Ollama :    1                               │
  │    Tokens input :    ~700 (prompt + world context)   │
  │    Tokens output :   ~50 (JSON)                      │
  │    Latence :         ~2s (qwen2.5:7b)                │
  │    Cache :           par question (session)          │
  │                                                      │
  │  News API (optionnel) :                              │
  │    Appels HTTP :     3 (general + business + tech)   │
  │    Fréquence :       1x au démarrage                 │
  │    Coût :            gratuit (100 req/jour)          │
  │                                                      │
  │  Total par session : 2 appels LLM + N appels/réf.   │
  │  Fallback :          poids neutres si Ollama offline │
  └──────────────────────────────────────────────────────┘
```

Comparé au budget initial prévu (15-25 appels LLM par référendum pour
verbaliser des citoyens), cette approche est **~20x plus économique**
tout en permettant des questions arbitraires informées par le monde réel.

---

*Document généré automatiquement — GiniAI Sandbox, Mars 2026*
