# Era Ball — Sim Engine & Rules Reference

## Overview

Era Ball is an NBA historical draft simulator. You pick an era (1950s–2020s), draft 9 players from that era's rosters, choose a coach, and simulate a full 82-game NBA season followed by a playoff run. Player stats are era-adjusted, minutes-scaled, and proportionally derived from real simulated team scores — not independently sampled.

---

## Game Flow

```
Era Select → Player Draft → Coach Draft → Simulation → Results
```

1. **Era Select** — Choose one of 8 decades (50s through 20s). This is the "sim era" and affects which players are available and how out-of-era players are penalized.
2. **Player Draft** — Spin to get a team + era combo. All players who played during that decade are in the pool. Fill 9 slots: 5 starters (PG, SG, SF, PF, C) and 4 bench spots (B1–B4).
3. **Coach Draft** — Spin to draft a real NBA head coach. Their win % and playoff record determine offensive and defensive grade bonuses.
4. **Simulation** — 82-game regular season simulated instantly, results revealed via animated game-ticker. Followed by an optional playoff bracket if you qualify (41+ wins).

---

## Player Eligibility & Era Stats

### Eligibility
A player is eligible for a given era if their NBA career overlaps the decade:
```
player.from_year <= (era_start + 9) AND player.to_year >= era_start
```

### Era Stats
Players who played in multiple eras have per-era, per-team stat splits stored as `stats_by_era["era:TEAM"]` (e.g. `"20s:DAL"`). When a player is drafted, their card is loaded with those specific era stats:

1. Try `stats_by_era["era:TEAM"]` (team-specific era split)
2. Try `stats_by_era["era"]` (era aggregate)
3. Fall back to career-wide stats

**This means the stats on the card you draft are the exact stats used throughout the simulation.** Drafting 20s LAL Luka gives different numbers than 20s DAL Luka.

---

## Player Base Rating

The base rating is a single number summarizing a player's all-around value using their (era-adjusted) stats:

```
TS  = FG_PCT × 0.9 + FT_PCT × 0.1   (simplified True Shooting proxy)

base = PTS   × 1.0
     + REB   × 0.7
     + AST   × 0.7
     + TS    × 30
     + FG3%  × 15      (null → 0; pre-3PT era players get no 3P bonus, not a penalty)
     + STL   × 1.5     (imputed if not historically tracked)
     + BLK   × 1.5     (imputed if not historically tracked)
     - TOV   × 1.0     (imputed if not historically tracked)
```

### Stat Imputation (Pre-tracking Era)
STL, BLK, and TOV were not officially tracked until the 1970s. Missing values are imputed:

| Stat | 75 Greatest Flag | Big Man (F/C) | Other |
|------|-----------------|---------------|-------|
| BLK  | Y               | 2.5           | 0.8   |
| BLK  | N               | 1.2           | 0.3   |
| STL  | Y               | 1.8           | —     |
| STL  | N               | 0.9           | —     |
| TOV  | Y               | 2.5           | —     |
| TOV  | N               | 1.5           | —     |

---

## Positional Fit Penalty

Starters placed in the wrong position incur a rating penalty. Bench slots (B1–B4) always have zero penalty.

| Slot | Perfect Fit (0%) | Minor Penalty (−10%) | Major Penalty (−25%) |
|------|-----------------|----------------------|----------------------|
| PG   | Guard, G/F      | —                    | Forward, Center      |
| SG   | Guard, G/F      | Forward              | Center               |
| SF   | Forward, G/F, F/C | Guard, Center      | —                    |
| PF   | Forward, F/C    | G/F, Center          | Guard                |
| C    | Center, F/C     | Forward              | Guard, G/F           |

---

## Era Modifier

A player drafted outside their native era takes an era-distance penalty, reflecting how their style of play doesn't perfectly translate:

```
distance = |ERA_ORDER.index(player.era) - ERA_ORDER.index(sim_era)|
eraMod   = max(1.0 - distance × 0.05, 0.85)
```

Era order: `50s → 60s → 70s → 80s → 90s → 00s → 10s → 20s`

So 1 decade away = 0.95×, 2 decades = 0.90×, 3+ decades = 0.85× (floor).

### Additional 3-Point Penalty
In 3-point eras (10s, 20s), players from non-3P eras (50s–00s) with `FG3% < 0.20` (or null) take an extra **−10%**, still floored at 0.85×.

---

## Adjusted Rating

The full player rating used for team rating calculation:

```
adjusted = base × (1 − fit_penalty) × eraMod
```

---

## Team Rating

The team rating drives win probability each game:

```
starterAvg = average adjusted rating across all 5 starters
benchAvg   = average adjusted rating across all 4 bench players

rawRating  = starterAvg × 0.70 + benchAvg × 0.30

offBonus   = coachBonus(coach.offGrade)
defBonus   = coachBonus(coach.defGrade)

teamRating = rawRating × (1 + (offBonus + defBonus) / 2)
```

---

## Coach Grades & Bonuses

Coach grades are derived from their real NBA coaching record:

| Grade | Off (regular season W%) | Def (playoff W%) | Bonus |
|-------|------------------------|------------------|-------|
| A     | ≥ 60.0%               | ≥ 55.0%          | +4%   |
| B     | ≥ 55.0%               | ≥ 50.0%          | +2%   |
| C     | ≥ 50.0%               | ≥ 45.0%          | 0%    |
| D     | ≥ 45.0%               | ≥ 40.0%          | −2%   |
| F     | < 45.0%               | < 40.0%          | −4%   |

Coaches with zero playoff games default to C for defensive grade. The overall grade is the average of offensive and defensive grades (letter scale).

---

## Minutes System

Total minutes per game = 240 (5 positions × 48 min).

| Slot | MPG |
|------|-----|
| PG, SG, SF, PF, C | 32 |
| B1 | 24 |
| B2 | 20 |
| B3 | 20 |
| B4 | 16 |

Each player's historical stats reflect their natural baseline minutes:
- Starters baseline: **34 MPG**
- Bench baseline: **24 MPG**

Scale factor = `assignedMPG / baselineMPG`

So a player whose historical stats were produced at 34 min gets scaled to 32 min for a starter slot: `stat × (32/34) = 0.941×`. Percentages (FG%, 3P%, FT%) are **not** scaled.

---

## Regular Season Simulation

### Win/Loss Per Game

For each of 82 games:
```
oppRating = Normal(mean=36, sd=6)    ← opponent strength
teamRoll  = teamRating + Normal(0, 6)
oppRoll   = oppRating  + Normal(0, 6)
win       = teamRoll > oppRoll
```

This makes a 50-rating team win ~56–58 games against a mean opponent field.

### Score Generation

Scores are generated to reflect actual roster quality and coach defense:

```
expectedTeamScore = clamp(sum(player.PTS × eraMod × minScale), 85, 132)
defBonus          = coachBonus(coach.defGrade)

teamScore = clamp(Normal(expectedTeamScore, sd=7), 82, 140)
oppScore  = clamp(Normal(105 × (1 − defBonus), sd=7), 78, 135)

# Enforce win/loss consistency:
if win  AND teamScore ≤ oppScore: teamScore = oppScore + random_margin
if loss AND oppScore  ≤ teamScore: oppScore = teamScore + random_margin

# Hard ceiling: 145
```

A good defensive coach (grade A, +4%) reduces the opponent baseline from 105 to ~100.8. A bad coach (−4%) raises it to ~109.2.

---

## Stat Distribution (Proportional)

Player stats are **not** independently sampled. They are distributed from the actual simulated team averages to guarantee internal consistency.

### Weight Calculation
For each player:
```
s        = eraMod × minScale
weight_X = player.X × s       (for PTS, REB, AST, STL, BLK, TOV)
```

### PTS Distribution
```
avgTeamScore  = mean of all 82 game scores (ground truth)
totalPTSWeight = sum of all 9 players' PTS weights

player_PPG = (player_PTS_weight / totalPTSWeight) × avgTeamScore
```

This guarantees: `sum(all player PPGs) = team PPG`.

### Other Counting Stats (REB, AST, STL, BLK, TOV)
Each player's weight **is** their stat directly. No redistribution needed because the weights already represent proportional contributions that sum to a reasonable team total:
```
player_RPG = player.REB × eraMod × minScale
```

### Shooting Percentages
Taken directly from the player card's era stats with a tiny random jitter (±0.5% sd) to add game-to-game texture. Not scaled with minutes.

---

## Playoff Simulation

### Qualification
Teams must win **41+ regular season games** to make the playoffs.

### Opponent Difficulty by Seed/Round

Playoff opponent strength scales with both round and regular season record:

| Record    | R1 | R2 | CF | Finals |
|-----------|----|----|----|--------|
| 60+ wins  | 38 | 41 | 43 | 45     |
| 53–59     | 39 | 41 | 43 | 45     |
| 47–52     | 40 | 42 | 44 | 46     |
| 41–46     | 42 | 43 | 45 | 46     |

Higher seeds face easier first-round opponents. All teams converge on elite opposition by the Finals.

### Series Simulation
Best-of-7 (first to 4 wins). Each game:
```
oppRating = Normal(mean=oppMean, sd=3)
win = (teamRating + Normal(0,5)) > (oppRating + Normal(0,5))
```

Scores use the same `generateGameScore()` logic as the regular season.

### Playoff Stat Distribution
Same proportional method as regular season, but using `avgPlayoffTeamScore` as the PTS ground truth across all playoff games played.

---

## Season Awards

Computed from final regular season stats + player ratings. All are optional — if no player meets the threshold, the award is not shown.

### League MVP
- Team wins **≥ 55**
- **Guaranteed** if triple-double average: `(PPG > 20 AND RPG > 10 AND APG > 10)` OR `(PPG > 20 AND APG > 10 AND RPG > 7)`
- Otherwise: base rating **> 55** AND simmed PPG **> 24**
- Best qualifying player by base rating wins

### All-NBA First Team (per starter position)
- One player per slot: PG, SG, SF, PF, C
- Requires: adjusted rating **> 50** AND simmed PPG **> 24**
- If no player at that position qualifies, that spot goes unfilled (0–5 selections possible)

### All-Star
All three conditions must be met:
1. Adjusted rating **> 48**
2. Position PPG floor: PG/SG **> 20**, SF/PF **> 18**, C **> 15**
3. At least one secondary impact stat: RPG **> 7**, APG **> 7**, STL **> 1.8**, or BLK **> 1.8**

Bench players (B1–B4) are not eligible.

### Defensive Player of the Year
- Base rating **> 50**
- Defensive threshold: `(STL > 1.5 AND BLK > 1.5)` OR `STL > 2.2` OR `BLK > 2.8`
- Best qualifying player by `STL + BLK` wins
- Not awarded if no player qualifies

### 6th Man of the Year
- Bench slot only (B1–B4)
- Simmed PPG **> 14** AND adjusted rating **> 48**
- Must be the top or 2nd-top rated bench player on the team
- Not awarded if no bench player qualifies

### Finals MVP
- Only awarded if team wins the championship
- Playoff stats only; highest PPG wins, APG tiebreak
- Displayed with headshot, PPG/RPG/APG, and TS%

---

## Typical Rating Ranges

| Context | Range |
|---------|-------|
| All-time greats (peak era) | 60–70 base |
| Very good starters | 50–60 base |
| Solid starters | 40–50 base |
| Quality bench | 30–40 base |
| Team rating (contender) | 50–58 |
| Team rating (playoff team) | 44–50 |
| Team rating (lottery) | < 44 |
| Regular season wins (champion) | 58–70 |
| Regular season wins (playoff) | 41–57 |

---

## Key Design Decisions

**Why proportional stat distribution?** Independent sampling would let player PPGs sum to 140 when the team scored 112. By anchoring player PTS to the actual game score average, stats are internally consistent — the team row in the stats table always adds up.

**Why era distance penalty?** A 1950s center slam-dunking into a 2020s pace-and-space offense shouldn't be 100% effective. The penalty models stylistic and athletic era gaps without completely excluding cross-era players.

**Why use playoff W% for coach defense?** Playoff coaching elevates the best and exposes the weakest defensive minds. Regular season W% captures offensive system quality; playoff W% captures defensive pressure and adjustment ability.

**Why floor era modifier at 0.85?** Even the most out-of-era player retains 85% effectiveness — they're still all-time caliber athletes. The game never makes an all-time great completely useless.
