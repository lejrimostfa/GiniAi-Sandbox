# GiniAI-Sandbox — Simulateur Socio-Économique à Agents

## Résumé / Abstract

### 🇫🇷 Français

**GiniAI-Sandbox** est un simulateur interactif en 3D qui modélise les dynamiques socio-économiques d'une société face à l'automatisation et à l'intelligence artificielle.

Imaginez une petite ville virtuelle peuplée de centaines d'agents autonomes : des travailleurs, des entrepreneurs, des chômeurs, des retraités. Chacun prend des décisions — chercher un emploi, consommer, épargner, créer une entreprise — en fonction de sa situation économique personnelle. Le simulateur reproduit les mécanismes fondamentaux qui façonnent les inégalités : marchés du travail, fiscalité, redistribution, éducation, et désormais les **deux vagues d'automatisation** qui transforment l'économie mondiale.

**Ce qui rend GiniAI-Sandbox unique :**

- **Double canal d'automatisation** — Le simulateur distingue l'automatisation robotique (usines, entrepôts) de la disruption par l'IA/LLM (bureaux, programmation, service client), calibré sur les données de l'**Anthropic Economic Index** (2025). Les emplois manuels sont menacés par les robots ; les emplois cognitifs par l'IA.
- **Phénomènes sociétaux causaux** — La criminalité n'apparaît pas par hasard : elle est *causée* par le chômage prolongé et la pauvreté. La maladie résulte d'une précarité durable. Le divorce découle d'une insatisfaction chronique. Chaque événement a une chaîne causale explicite et observable.
- **Visualisation temps réel** — Chaque agent est représenté par un emoji animé (🏃 travailleur, 🥷 criminel, 👨‍🦳 retraité, ☠️ décès) dans un environnement 3D interactif. Les flux monétaires 💰, les transitions d'état et les trajectoires individuelles sont visibles en direct.
- **Paramètres ajustables en direct** — Modifiez le taux de redistribution, la vitesse de l'IA ou l'intensité de l'automatisation robotique *pendant* la simulation et observez les effets en temps réel sur les inégalités, l'emploi et la cohésion sociale.

GiniAI-Sandbox est un outil pédagogique et analytique conçu pour rendre tangibles les abstractions de l'économie : le coefficient de Gini, les courbes d'emploi, la mobilité sociale. Il permet à quiconque — étudiant, chercheur, décideur ou simple curieux — de **voir** comment les choix politiques et technologiques façonnent la société.

---

### 🇬🇧 English

**GiniAI-Sandbox** is an interactive 3D simulator that models the socio-economic dynamics of a society facing automation and artificial intelligence.

Picture a small virtual city populated by hundreds of autonomous agents: workers, entrepreneurs, unemployed individuals, retirees. Each one makes decisions — seeking jobs, consuming, saving, starting businesses — based on their personal economic situation. The simulator reproduces the fundamental mechanisms that shape inequality: labor markets, taxation, redistribution, education, and now the **two waves of automation** transforming the global economy.

**What makes GiniAI-Sandbox unique:**

- **Dual-channel automation** — The simulator distinguishes robotic automation (factories, warehouses) from AI/LLM disruption (offices, programming, customer service), calibrated on data from the **Anthropic Economic Index** (2025). Manual jobs face robots; cognitive jobs face AI.
- **Causal societal phenomena** — Crime doesn't appear randomly: it is *caused* by prolonged unemployment and poverty. Disease results from sustained precarity. Divorce stems from chronic dissatisfaction. Every event has an explicit, observable causal chain.
- **Real-time visualization** — Each agent is rendered as an animated emoji (🏃 worker, 🥷 criminal, 👨‍🦳 retiree, ☠️ death) in an interactive 3D environment. Money flows 💰, state transitions, and individual trajectories are visible live.
- **Live-adjustable parameters** — Change the redistribution rate, AI adoption speed, or robotic automation intensity *during* the simulation and watch the real-time effects on inequality, employment, and social cohesion.

GiniAI-Sandbox is a pedagogical and analytical tool designed to make economic abstractions tangible: the Gini coefficient, employment curves, social mobility. It empowers anyone — students, researchers, policymakers, or the simply curious — to **see** how political and technological choices shape society.

---

## Méthodologie / Methodology

### 1. Architecture du modèle / Model Architecture

GiniAI-Sandbox repose sur un **modèle à agents (ABM — Agent-Based Model)** où chaque agent représente un individu économique doté de propriétés et de comportements autonomes.

| Propriété | Description |
|-----------|-------------|
| `age` | Âge simulé (18–max), avance d'un an tous les `ticksPerYear` ticks |
| `education` | Niveau d'éducation : `low`, `medium`, `high` |
| `state` | État courant : `employed`, `unemployed`, `business_owner`, `retired`, `criminal`, `dead` |
| `wealth` | Épargne accumulée ($) |
| `income` | Revenu par tick |
| `satisfaction` | Indice de bien-être (0–1), influencé par l'état (emploi, chômage, crime, maladie) |
| `children` | Nombre d'enfants |
| `partnerId` | Conjoint(e) éventuel(le) |
| `homeOwned` | Propriétaire ou locataire |
| `isSick` | Malade ou non |

Les agents interagissent avec un **monde structuré** composé de localisations typées :
- **Workplaces** (usines, bureaux, studios, commerces) — offrent des emplois avec des salaires et des risques d'automatisation distincts
- **Markets** — consommation de biens
- **Schools** — montée en compétences
- **Homes** — résidence et repos

### 2. Double canal d'automatisation / Dual-Channel Automation

Inspiré de l'**Anthropic Economic Index** (2025), le simulateur modélise deux forces distinctes de destruction d'emplois :

#### Canal 1 : Automatisation robotique
- **Paramètre** : `aiGrowthRate` (0–15%/an)
- **Cible** : Emplois physiques/manuels (`automationRisk` élevé)
- **Probabilité de suppression** : `aiGrowthRate × automationRisk` par workplace par tick annuel

| Type | `automationRisk` | Exemples |
|------|------------------|----------|
| Manual (Factory) | 0.80 | Ouvriers, manutention |
| Service (Shop) | 0.30 | Caissiers, livreurs |
| Skilled (Office) | 0.10 | Programmeurs, comptables |
| Creative (Studio) | 0.05 | Designers, artistes |

#### Canal 2 : Disruption IA/LLM
- **Paramètre** : `aiDiffusionRate` (0–20%/an)
- **Cible** : Emplois cognitifs (`aiExposure` élevé)
- **Probabilité de suppression** : `aiDiffusionRate × aiExposure` par workplace par tick annuel
- **Vulnérabilité** : Les travailleurs les plus éduqués et les plus âgés sont ciblés en premier (paradoxe de l'IA)
- **Pénalité à l'embauche** : Les jeunes travailleurs (18–25 ans) subissent une réduction de 14% du taux d'embauche dans les secteurs exposés (donnée Anthropic)

| Type | `aiExposure` | Exemples |
|------|-------------|----------|
| Skilled (Office) | 0.65 | Programmation, finance, administration |
| Service (Shop) | 0.45 | Service client, ventes |
| Creative (Studio) | 0.35 | Design, rédaction, médias |
| Manual (Factory) | 0.05 | Travail physique (très faible exposition IA) |

### 3. Phénomènes sociétaux causaux / Causal Societal Phenomena

Contrairement aux modèles probabilistes classiques, **chaque événement sociétal a une cause explicite** dérivée de l'état de l'agent :

#### 🥷 Criminalité
```
Chômage prolongé (>8 ticks) + pauvreté (<$30) + insatisfaction (<0.25)
→ L'agent devient criminel
→ Il vole d'autres agents chaque tick
→ Réhabilitation possible après 12 ticks si richesse > $50
→ Risque de mort violente croissant avec la durée
```

#### 🤒 Maladie
```
Pauvreté durable (<$40) + insatisfaction (<0.35) pendant >6 ticks
→ L'agent tombe malade
→ Perte continue de satisfaction (-0.03/tick)
→ Guérison possible si richesse > $100 après 4 ticks
→ Sans guérison : risque de mort prématurée après 10 ticks
```

#### ☠️ Mort prématurée
```
Maladie prolongée (>10 ticks) + pauvreté + âge avancé
→ Décès de l'agent (affiché ☠️ pendant 3 ticks puis retiré)
OU : Mode de vie criminel → risque de mort violente
```

#### 💔 Divorce
```
Satisfaction < 0.20 pendant >5 ticks consécutifs + âge > 22
→ Divorce : perte de 30% du patrimoine + chute de satisfaction
```

#### 💍 Mariage
```
Satisfaction > 0.60 + emploi stable + satisfaction soutenue
→ Filtres démographiques : éducation femme ↑ → probabilité ↓ ; richesse homme ↓ → probabilité ↓
→ Mariage : boost de satisfaction
```

#### 👶 Transition démographique / Demographic Transition
```
Âge moyen du couple > 35 → pénalité croissante (+4%/an au-delà de 35)
Éducation élevée → +31% d'échec de conception
Richesse élevée → jusqu'à +30% d'échec
Satisfaction élevée → jusqu'à +10% d'échec (focus carrière)
Enfants existants → +12% par enfant
→ Les sociétés riches et éduquées font moins d'enfants (transition démographique)
```

#### 👧 Mortalité infantile / Child Mortality
```
Richesse parentale < $100 + enfant < 5 ans → risque élevé (~3%/an)
Richesse parentale < $100 + enfant 5-17 ans → risque modéré (~0.8%/an)
Orphelin (aucun parent vivant) → +5% de risque additionnel
```

#### 🌍 Immigration
```
Paramètre : immigrationRate (0–100%)
0% → aucune immigration, la population décline naturellement
100% → remplacement complet (jusqu'à 2 immigrants/tick)
Taux intermédiaires → immigration sporadique (filtre probabiliste)
```

#### 😊 Dynamique de satisfaction / Satisfaction Dynamics
```
Employé / Patron : +0.06/an
Chômeur : -0.25/an (drain actif)
Criminel : -0.375/an (drain intense)
Malade : -0.15/an (drain additionnel)
Propriétaire (sans dette) : +0.08/an (stabilité)
Consommation marché : +0.06 par visite
Déclin de base : -0.12/an (entropie naturelle)
→ Un chômeur passe de 0.7 à ~0.33 de satisfaction en 1 an
→ Un employé propriétaire se stabilise autour de 0.7-0.8
```

### 4. Boucle de simulation / Simulation Loop

Chaque tick exécute, dans l'ordre :

1. **Nettoyage** — Suppression des agents morts depuis >3 ticks
2. **Vieillissement** — Âge +1/an, retraite à ~85% de l'espérance de vie
3. **Renouvellement** — Remplacement des agents décédés/très âgés par de nouveaux jeunes
4. **Automatisation** — Suppression d'emplois (robotique + IA), une fois par an simulé
5. **Phénomènes causaux** — Criminalité, maladie, mort, divorce, mariage
6. **Décisions** — Chaque agent choisit où aller (travail, marché, école, maison)
7. **Mouvement** — Déplacement physique des agents (comportements de steering)
8. **Interactions** — Embauche, consommation, éducation aux localisations
9. **Économie** — Salaires, dépenses, satisfaction
10. **Gouvernement** — Taxation progressive et redistribution
11. **Métriques** — Calcul du Gini, taux d'emploi, taux de criminalité, etc.

### 5. Métriques et indicateurs / Metrics & Indicators

| Métrique | Description |
|----------|-------------|
| Coefficient de Gini | Mesure d'inégalité des richesses (0 = égalité, 1 = inégalité totale) |
| Taux d'automatisation robotique | % d'emplois supprimés par l'automatisation physique |
| Taux de disruption IA | % d'emplois supprimés par l'IA/LLM |
| Taux de displacement total | Somme des deux canaux |
| Satisfaction moyenne | Bien-être moyen de la population |
| Taux de criminalité | Nombre de crimes par tick |
| Taux de fertilité | Naissances / population |
| Mortalité infantile | Décès d'enfants liés à la pauvreté familiale |
| Taux d'immigration | % de remplacement de population (paramétrable 0–100%) |
| Part du top 10% | % de la richesse totale détenue par les 10% les plus riches |
| Part du bottom 50% | % de la richesse totale détenue par les 50% les plus pauvres |

### 6. Stack technique / Technical Stack

| Composant | Technologie |
|-----------|-------------|
| Framework UI | Vue 3 + Vite + TypeScript |
| Rendu 3D | Three.js (sprites emoji, instanced meshes) |
| State management | Pinia |
| Communication événementielle | mitt (event bus) |
| Graphiques | Chart.js (via vue-chartjs) |
| Style | SCSS + design system personnalisé |

### 7. Sources et références / Sources & References

- **Anthropic Economic Index** (2025) — *Labor market impacts of AI: A new measure and early evidence*. Données sur l'exposition des métiers à l'IA, le gap entre capacité théorique et déploiement réel (~35%), et l'impact sur l'embauche des jeunes travailleurs (-14%).
- **Coefficient de Gini** — Méthode de calcul rapide pour populations d'agents.
- **Agent-Based Modeling** — Méthodologie standard en sciences sociales computationnelles.

---

*GiniAI-Sandbox est un projet open-source à vocation pédagogique. Il ne constitue pas un outil de prédiction économique mais un laboratoire expérimental pour explorer les dynamiques socio-économiques.*
