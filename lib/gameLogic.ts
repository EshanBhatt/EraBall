import type { Player, Coach, CourtSlot, SlotPosition, Era, PlayerRating, PlayerSeasonStats, EraStats, PlayoffResult, PlayoffGame, SpecialPerformance } from './types'

const ERA_ORDER: Era[] = ['50s', '60s', '70s', '80s', '90s', '00s', '10s', '20s']

// ─── FLEX players ─────────────────────────────────────────────────────────────
// Lists the starter slots each player can occupy with zero fit penalty.
// Key = full_name as it appears in players_with_stats.json.
const FLEX_PLAYERS: Record<string, SlotPosition[]> = {
  'LeBron James':            ['PG', 'SG', 'SF', 'PF'],
  'Giannis Antetokounmpo':   ['PG', 'SG', 'SF', 'PF', 'C'],
  'Draymond Green':          ['PG', 'SF', 'PF', 'C'],
  'Ben Simmons':             ['PG', 'PF', 'C'],
  'Scottie Barnes':          ['PG', 'SG', 'SF', 'PF'],
  'Paolo Banchero':          ['PG', 'SG', 'SF', 'PF'],
  'Jimmy Butler':            ['PG', 'SG', 'SF', 'PF'],
  'Kawhi Leonard':           ['SG', 'SF', 'PF'],

  'Nikola Jokic':            ['PG', 'PF', 'C'],

  'Larry Bird':              ['PG', 'SG', 'SF', 'PF'],
}

// ─── Position lock ─────────────────────────────────────────────────────────────
// Hard positional constraints: 0 penalty only at listed slots.
// These players do NOT carry a flex tag — they are strictly these positions.
const POSITION_LOCK: Record<string, SlotPosition[]> = {
  'Tracy McGrady':  ['SG', 'SF'],
  'Peyton Watson':  ['SF', 'PF'],
}

export function applyFlexTag(player: Player): Player {
  const flex = FLEX_PLAYERS[player.full_name]
  if (!flex) return player
  return { ...player, flexPositions: flex }
}

// ─── Championship rings ────────────────────────────────────────────────────────
const PLAYER_RINGS: Record<string, number> = {
  // 11
  'Bill Russell': 11,
  // 10
  'Sam Jones': 10,
  // 8
  'Tom Heinsohn': 8, 'K.C. Jones': 8, 'John Havlicek': 8, 'Tom Sanders': 8,
  // 7
  'Frank Ramsey': 7, 'Robert Horry': 7,
  // 6
  'Michael Jordan': 6, 'Scottie Pippen': 6, 'Kareem Abdul-Jabbar': 6, 'Bob Cousy': 6,
  // 5
  'Magic Johnson': 5, 'Kobe Bryant': 5, 'Tim Duncan': 5, 'Dennis Rodman': 5,
  'Derek Fisher': 5, 'Ron Harper': 5, 'Steve Kerr': 5, 'Michael Cooper': 5,
  // 4
  'Shaquille O\'Neal': 4, 'LeBron James': 4, 'Stephen Curry': 4, 'Draymond Green': 4,
  'Klay Thompson': 4, 'Robert Parish': 4, 'Tony Parker': 4, 'Manu Ginobili': 4,
  'Andre Iguodala': 4, 'Bill Sharman': 4, 'John Salley': 4,
  'Kevon Looney': 4, 'Horace Grant': 4,
  'Jamaal Wilkes': 4, 'Kurt Rambis': 4,
  // 3
  'Larry Bird': 3, 'Kevin McHale': 3, 'James Worthy': 3, 'Byron Scott': 3,
  'Dwyane Wade': 3, 'Udonis Haslem': 3, 'A.C. Green': 3, 'Mychal Thompson': 3,
  'Danny Green': 3, 'Rick Fox': 3, 'Toni Kukoc': 3, 'Luc Longley': 3,
  'Dennis Johnson': 3, 'John Paxson': 3, 'Bill Cartwright': 3,
  'James Jones': 3,
  // 2
  'Wilt Chamberlain': 2, 'Isiah Thomas': 2, 'Joe Dumars': 2, 'Kevin Durant': 2,
  'Chris Bosh': 2, 'Bill Laimbeer': 2, 'Ray Allen': 2,
  'Kawhi Leonard': 2, 'Jrue Holiday': 2, 'Rajon Rondo': 2,
  'Kentavious Caldwell-Pope': 2, 'Alex Caruso': 2,
  'Pau Gasol': 2, 'Lamar Odom': 2, 'Andrew Bynum': 2,
  'David Robinson': 2, 'Shane Battier': 2, 'Mario Chalmers': 2,
  'Danny Ainge': 2,
  'Willis Reed': 2, 'Walt Frazier': 2, 'Dave DeBusschere': 2, 'Bill Bradley': 2,
  'Bob McAdoo': 2, 'Bob Dandridge': 2,
  'Mike Miller': 2, 'Norris Cole': 2,
  // 1
  'Jerry West': 1, 'Oscar Robertson': 1, 'Julius Erving': 1, 'Moses Malone': 1,
  'Paul Pierce': 1, 'Kevin Garnett': 1, 'Kyrie Irving': 1, 'Dirk Nowitzki': 1,
  'Jason Kidd': 1, 'Chauncey Billups': 1, 'Rasheed Wallace': 1, 'Ben Wallace': 1,
  'Rick Barry': 1, 'Nate Archibald': 1,
  'Earl Monroe': 1,
  // 2024-25 OKC
  'Shai Gilgeous-Alexander': 1, 'Jalen Williams': 1, 'Chet Holmgren': 1,
  'Luguentz Dort': 1, 'Isaiah Hartenstein': 1,
  'Aaron Wiggins': 1, 'Kenrich Williams': 1, 'Ajay Mitchell': 1,
  'Isaiah Joe': 1, 'Ousmane Dieng': 1, 'Nikola Topic': 1, 'Cason Wallace': 1,
  // 2023-24 Celtics
  'Jayson Tatum': 1, 'Jaylen Brown': 1, 'Al Horford': 1,
  'Kristaps Porzingis': 1, 'Derrick White': 1, 'Payton Pritchard': 1,
  'Sam Hauser': 1, 'Luke Kornet': 1, 'Neemias Queta': 1,
  // 2022-23 Nuggets
  'Nikola Jokic': 1, 'Jamal Murray': 1, 'Aaron Gordon': 1, 'Michael Porter Jr.': 1,
  'Bruce Brown': 1, 'Christian Braun': 1, 'Jeff Green': 1, 'DeAndre Jordan': 1,
  'Reggie Jackson': 1, 'Vlatko Cancar': 1, 'Zeke Nnaji': 1,
  // 2021-22 Warriors
  'Andrew Wiggins': 1, 'Jordan Poole': 1, 'Gary Payton II': 1, 'Otto Porter Jr.': 1,
  // 2020-21 Bucks
  'Giannis Antetokounmpo': 1, 'Khris Middleton': 1, 'Brook Lopez': 1,
  'Bobby Portis': 1, 'PJ Tucker': 1, 'Pat Connaughton': 1,
  // 2019-20 Lakers
  'Anthony Davis': 1, 'Kyle Kuzma': 1, 'Markieff Morris': 1, 'Dwight Howard': 1,
  // 2018-19 Raptors
  'Kyle Lowry': 1, 'Pascal Siakam': 1, 'Marc Gasol': 1,
  'Serge Ibaka': 1, 'Fred VanVleet': 1, 'Norman Powell': 1,
  // 2015-16 Cavs
  'Kevin Love': 1, 'Tristan Thompson': 1, 'J.R. Smith': 1,
  'Richard Jefferson': 1, 'Matthew Dellavedova': 1, 'Channing Frye': 1,
  'Iman Shumpert': 1,
  // 2013-14 Spurs
  'Boris Diaw': 1, 'Patty Mills': 1, 'Marco Belinelli': 1,
  // 2010-11 Mavs
  'Tyson Chandler': 1, 'Shawn Marion': 1, 'Jason Terry': 1,
  'J.J. Barea': 1, 'DeShawn Stevenson': 1, 'Peja Stojakovic': 1,
  // 2009-10 Lakers
  'Ron Artest': 1, 'Metta World Peace': 1,
  // 2007-08 Celtics
  'Tony Allen': 1, 'James Posey': 1,
  // 2005-06 Heat
  'Gary Payton': 1, 'Antoine Walker': 1, 'Alonzo Mourning': 1, 'Jason Williams': 1,
  // 2003-04 Pistons
  'Tayshaun Prince': 1, 'Richard Hamilton': 1,
  // 1998-99 Spurs
  'Avery Johnson': 1,
}

export function applyRings(player: Player): Player {
  const rings = PLAYER_RINGS[player.full_name]
  if (!rings) return player
  return { ...player, rings }
}

// ─── Player anchors ────────────────────────────────────────────────────────────
type AnchorType = 'def' | 'off'
const PLAYER_ANCHORS: Record<string, AnchorType> = {
  // Defensive Anchors (+12)
  'Draymond Green':  'def',
  'Dennis Rodman':   'def',
  'Ben Wallace':     'def',
  'Gary Payton':     'def',
  'Marcus Smart':    'def',
  'Dikembe Mutombo': 'def',
  'Rudy Gobert':     'def',
  'Aaron Gordon':    'def',
  // Offensive Anchors (+8)
  'Nikola Jokic':    'off',
  'LeBron James':    'off',
  'Stephen Curry':   'off',
  'Steve Nash':      'off',
  'Chris Paul':      'off',
  'Magic Johnson':   'off',
  'Luka Doncic':     'off',
  'Rajon Rondo':     'off',
  'Kareem Abdul-Jabbar': 'off',
  'John Stockton':   'off',
  'James Harden':    'off',
  'Shai Gilgeous-Alexander': 'off',
  'Joel Embiid':             'off',
  // Defensive Anchors (+12)
  'Tony Allen':      'def',
  'Scottie Pippen':  'def',
  'Kawhi Leonard':   'def',
  'Bill Russell':    'def',
  'Hakeem Olajuwon': 'def',
  'Kevin Garnett':   'def',
}

export function applyAnchors(player: Player): Player {
  const anchor = PLAYER_ANCHORS[player.full_name]
  if (!anchor) return player
  return { ...player, defAnchor: anchor === 'def', offAnchor: anchor === 'off' }
}

function playoffRingBoost(rings: number): number {
  if (rings >= 9)  return 0.13
  if (rings >= 6)  return 0.10
  if (rings >= 3)  return 0.06
  if (rings >= 1)  return 0.03
  return 0
}
const THREE_PT_ERAS: Era[] = ['10s', '20s']
const PRE_THREE_PT_ERAS: Era[] = ['50s', '60s', '70s']

// Era-appropriate opponent scoring baseline (no 3s = lower opp scores in early eras)
const ERA_OPP_BASELINE: Record<Era, number> = {
  '50s': 88, '60s': 105, '70s': 100,
  '80s': 107, '90s': 98, '00s': 97, '10s': 108, '20s': 114,
}

// Era-appropriate score caps
const ERA_SCORE_CAP: Record<Era, number> = {
  '50s': 112, '60s': 128, '70s': 122,
  '80s': 133, '90s': 124, '00s': 122, '10s': 138, '20s': 145,
}
const ERA_SCORE_FLOOR: Record<Era, number> = {
  '50s': 72, '60s': 80, '70s': 80,
  '80s': 82, '90s': 80, '00s': 80, '10s': 82, '20s': 85,
}

const ERA_DECADE_START: Record<Era, number> = {
  '50s': 1950, '60s': 1960, '70s': 1970, '80s': 1980,
  '90s': 1990, '00s': 2000, '10s': 2010, '20s': 2020,
}

// Assigned minutes per slot (5 × 35 + 25 + 16 + 14 + 10 = 240 total)
export const SLOT_MPG: Record<SlotPosition, number> = {
  PG: 35, SG: 35, SF: 35, PF: 35, C: 35,
  B1: 25, B2: 16, B3: 14, B4: 10,
}
// Playoff rotations: starters play more, bench gets cut significantly
const PLAYOFF_MPG: Record<SlotPosition, number> = {
  PG: 37, SG: 36, SF: 37, PF: 36, C: 35,
  B1: 20, B2: 15, B3: 10, B4: 6,
}
// Assumed historical baseline MPG for computing scale factor
const STARTER_BASELINE_MPG = 35
const BENCH_BASELINE_MPG   = 25

// Rating-only overrides: "name:era:team" → era:team key to use for rating calc only.
// Display stats are unchanged — only the tier/rating uses the redirected stat line.
// Use when a small sample inflates (or deflates) a player's apparent level.
const RATING_STAT_OVERRIDE: Record<string, string> = {
  'Nikola Vucevic:20s:ORL': '20s:CHI',
}

// Returns the player with era-specific stats substituted in, falling back to
// career stats if no era data exists. Pass team when a player had multiple
// teams in the same era (key format: "era:team"). The player's native .era
// field is preserved — only counting/shooting stats change.
export function withEraStats(player: Player, era: Era, team?: string): Player {
  // Try era:team first (for players with per-team splits), then era alone.
  const eraData: EraStats | undefined =
    (team ? player.stats_by_era?.[`${era}:${team}`] : undefined) ??
    player.stats_by_era?.[era]
  if (!eraData) return { ...player, era }
  const { team: eraTeam, GP, ...stats } = eraData
  return { ...player, era, eraTeam, GP, ...stats }
}

export function playerMatchesEra(player: Player, era: Era): boolean {
  const start = ERA_DECADE_START[era]
  const end = start + 9
  const careerEnd = player.to_year ?? 2029
  return player.from_year <= end && careerEnd >= start
}

export function eraDistance(playerEra: Era, simEra: Era): number {
  return Math.abs(ERA_ORDER.indexOf(playerEra) - ERA_ORDER.indexOf(simEra))
}

export function calcTS(player: Player): number {
  if (player.TS_PCT != null) return player.TS_PCT
  // Fallback for pre-era-stats players (imputed/historical): approximate from FG%
  if (player.FG_PCT == null) return 0.45
  return player.FG_PCT * 0.9 + (player.FT_PCT ?? 0.7) * 0.1
}

export interface OppTeamStats {
  REB: number; AST: number; STL: number | null; BLK: number | null; TOV: number
  FG_PCT: number; FG3_PCT: number | null; FT_PCT: number; TS_PCT: number
}

export function genOppTeamStats(avgOppScore: number, era: Era): OppTeamStats {
  type B = { ppg: number; reb: number; ast: number; stl: number | null; blk: number | null; tov: number; fg: number; fg3: number | null; ft: number; ts: number }
  const BL: Record<Era, B> = {
    '50s': { ppg: 79,  reb: 65, ast: 14, stl: null, blk: null, tov: 18, fg: 0.372, fg3: null,  ft: 0.675, ts: 0.480 },
    '60s': { ppg: 107, reb: 58, ast: 18, stl: null, blk: null, tov: 17, fg: 0.440, fg3: null,  ft: 0.718, ts: 0.520 },
    '70s': { ppg: 105, reb: 46, ast: 24, stl: 8.0,  blk: 5.0,  tov: 17, fg: 0.458, fg3: null,  ft: 0.728, ts: 0.530 },
    '80s': { ppg: 110, reb: 43, ast: 26, stl: 8.5,  blk: 5.2,  tov: 15, fg: 0.477, fg3: 0.278, ft: 0.748, ts: 0.548 },
    '90s': { ppg: 99,  reb: 43, ast: 24, stl: 8.6,  blk: 5.3,  tov: 15, fg: 0.454, fg3: 0.340, ft: 0.742, ts: 0.540 },
    '00s': { ppg: 97,  reb: 42, ast: 22, stl: 7.8,  blk: 5.0,  tov: 13, fg: 0.450, fg3: 0.350, ft: 0.740, ts: 0.538 },
    '10s': { ppg: 105, reb: 43, ast: 24, stl: 7.8,  blk: 5.1,  tov: 14, fg: 0.460, fg3: 0.362, ft: 0.760, ts: 0.555 },
    '20s': { ppg: 114, reb: 44, ast: 28, stl: 8.0,  blk: 5.2,  tov: 14, fg: 0.470, fg3: 0.362, ft: 0.778, ts: 0.570 },
  }
  const b = BL[era]
  const scale = avgOppScore / b.ppg
  const cn = (r: number) => (Math.random() - 0.5) * r
  const pn = () => randn() * 0.018
  return {
    REB:     Math.max(28, +(b.reb * scale + cn(5)).toFixed(1)),
    AST:     Math.max(10, +(b.ast * scale + cn(4)).toFixed(1)),
    STL:     b.stl != null ? Math.max(4,  +(b.stl + cn(1.5)).toFixed(1)) : null,
    BLK:     b.blk != null ? Math.max(2,  +(b.blk + cn(1.0)).toFixed(1)) : null,
    TOV:     Math.max(8,  +(b.tov * scale + cn(3)).toFixed(1)),
    FG_PCT:  Math.min(0.58, Math.max(0.35, b.fg + pn())),
    FG3_PCT: b.fg3 != null ? Math.min(0.48, Math.max(0.22, b.fg3 + pn())) : null,
    FT_PCT:  Math.min(0.88, Math.max(0.58, b.ft + pn())),
    TS_PCT:  Math.min(0.68, Math.max(0.42, b.ts + pn())),
  }
}

function isBigPosition(position: string): boolean {
  const pos = (position ?? '').toUpperCase()
  if (pos.includes('CENTER')) return true
  if (pos.includes('GUARD')) return false
  if (pos.includes('FORWARD')) return true  // Forward, Forward-Center, Power Forward → big
  return false
}

export function imputeBLK(player: Player): number {
  if (player.BLK != null) return player.BLK
  const is75 = player.greatest_75_flag === 'Y'
  const big = isBigPosition(player.position ?? '')
  return is75 ? (big ? 2.5 : 0.8) : (big ? 1.2 : 0.3)
}

export function imputeSTL(player: Player): number {
  if (player.STL != null) return player.STL
  return player.greatest_75_flag === 'Y' ? 1.8 : 0.9
}

export function imputeTOV(player: Player): number {
  if (player.TOV != null) return player.TOV
  return player.greatest_75_flag === 'Y' ? 2.5 : 1.5
}

export function playerBaseRating(player: Player, simEra?: Era): number {
  // Check for a rating-only stat override (display stats unchanged)
  const overrideKey = player.eraTeam ? `${player.full_name}:${player.era}:${player.eraTeam}` : null
  const overrideTarget = overrideKey ? RATING_STAT_OVERRIDE[overrideKey] : null
  const ratingPlayer: Player = overrideTarget && player.stats_by_era?.[overrideTarget]
    ? { ...player, ...(() => { const { team: _t, GP: _g, ...s } = player.stats_by_era![overrideTarget]; return s })() }
    : player

  const ts = calcTS(ratingPlayer)
  const threePtBonus = (!simEra || PRE_THREE_PT_ERAS.includes(simEra))
    ? 0
    : (ratingPlayer.FG3M ?? 0) * 1.5
  const anchorBonus = player.defAnchor ? 12 : player.offAnchor ? 8 : 0
  const top75Bonus = player.greatest_75_flag === 'Y' ? 3 : 0
  return (
    (ratingPlayer.PTS ?? 0)     * 1.0 +
    (ratingPlayer.REB ?? 0)     * 0.7 +
    (ratingPlayer.AST ?? 0)     * 0.7 +
    ts                          * 25  +
    threePtBonus                      +
    imputeSTL(ratingPlayer)     * 1.5 +
    imputeBLK(ratingPlayer)     * 1.5 -
    imputeTOV(ratingPlayer)     * 1.0 +
    anchorBonus                       +
    top75Bonus
  )
}

export function calcFitPenalty(player: Player, slot: SlotPosition): { penalty: 0 | 0.10 | 0.25; label: CourtSlot['fitLabel'] } {
  if (slot.startsWith('B')) {
    return { penalty: 0, label: 'Position Fit' }
  }
  // Position lock: hard constraint — only listed slots are penalty-free
  const locked = POSITION_LOCK[player.full_name]
  if (locked) {
    if (locked.includes(slot)) return { penalty: 0, label: 'Position Fit' }
    const STARTER_ORDER: SlotPosition[] = ['PG', 'SG', 'SF', 'PF', 'C']
    const slotIdx = STARTER_ORDER.indexOf(slot)
    const minDist = Math.min(...locked
      .filter(p => STARTER_ORDER.includes(p))
      .map(p => Math.abs(STARTER_ORDER.indexOf(p) - slotIdx)))
    if (minDist <= 1) return { penalty: 0.10, label: 'Positional Penalty -10%' }
    return { penalty: 0.25, label: 'Major Penalty -25%' }
  }
  // FLEX tag: player can play this slot without penalty
  if (player.flexPositions?.includes(slot)) {
    return { penalty: 0, label: 'Position Fit' }
  }
  // Flex player at a non-flex slot: proximity penalty instead of raw position string logic
  if (player.flexPositions && player.flexPositions.length > 0) {
    const STARTER_ORDER: SlotPosition[] = ['PG', 'SG', 'SF', 'PF', 'C']
    const slotIdx = STARTER_ORDER.indexOf(slot)
    const minDist = Math.min(...player.flexPositions
      .filter(p => STARTER_ORDER.includes(p))
      .map(p => Math.abs(STARTER_ORDER.indexOf(p) - slotIdx)))
    if (minDist <= 1) return { penalty: 0.10, label: 'Positional Penalty -10%' }
    return { penalty: 0.25, label: 'Major Penalty -25%' }
  }

  const pos = player.position ?? ''
  const posUpper = pos.toUpperCase()

  // Normalize player positions
  const isGuard = posUpper.includes('GUARD') || posUpper.includes('PG') || posUpper.includes('SG') || posUpper === 'G'
  const isForward = posUpper.includes('FORWARD') || posUpper.includes('SF') || posUpper.includes('PF') || posUpper === 'F'
  const isCenter = posUpper.includes('CENTER') || posUpper.includes('C') || posUpper === 'C'
  const isGuardForward = posUpper.includes('G/F') || posUpper.includes('F/G') || posUpper.includes('GUARD-FORWARD') || posUpper.includes('FORWARD-GUARD')
  const isForwardCenter = posUpper.includes('F/C') || posUpper.includes('C/F') || posUpper.includes('FORWARD-CENTER') || posUpper.includes('CENTER-FORWARD')

  // Adjacent pairs: PG↔SG, SG↔SF, SF↔PF, PF↔C
  if (slot === 'PG') {
    if (isGuard || isGuardForward) return { penalty: 0, label: 'Position Fit' }
    if (isForward) return { penalty: 0.25, label: 'Major Penalty -25%' }
    if (isCenter) return { penalty: 0.25, label: 'Major Penalty -25%' }
  }
  if (slot === 'SG') {
    if (isGuard || isGuardForward) return { penalty: 0, label: 'Position Fit' }
    if (isForward) return { penalty: 0.10, label: 'Positional Penalty -10%' }
    if (isCenter) return { penalty: 0.25, label: 'Major Penalty -25%' }
  }
  if (slot === 'SF') {
    if (isForward || isGuardForward || isForwardCenter) return { penalty: 0, label: 'Position Fit' }
    if (isGuard) return { penalty: 0.10, label: 'Positional Penalty -10%' }
    if (isCenter) return { penalty: 0.10, label: 'Positional Penalty -10%' }
  }
  if (slot === 'PF') {
    if (isForward || isForwardCenter) return { penalty: 0, label: 'Position Fit' }
    if (isGuardForward) return { penalty: 0.10, label: 'Positional Penalty -10%' }
    if (isCenter) return { penalty: 0.10, label: 'Positional Penalty -10%' }
    if (isGuard) return { penalty: 0.25, label: 'Major Penalty -25%' }
  }
  if (slot === 'C') {
    if (isCenter || isForwardCenter) return { penalty: 0, label: 'Position Fit' }
    if (isForward) return { penalty: 0.10, label: 'Positional Penalty -10%' }
    if (isGuard || isGuardForward) return { penalty: 0.25, label: 'Major Penalty -25%' }
  }
  return { penalty: 0.10, label: 'Positional Penalty -10%' }
}

// dist → modifier. 0-2 decades same both ways; 3+ splits by direction.
// Forward = old player in newer era (larger penalty — style/skill gap)
// Backward = modern player in older era (smaller penalty — athletic/training advantage)
const ERA_MOD_FORWARD  = [1.00, 0.98, 0.95, 0.90, 0.84, 0.77, 0.70, 0.62]
const ERA_MOD_BACKWARD = [1.00, 0.98, 0.95, 0.92, 0.89, 0.85, 0.81, 0.77]

export function calcEraModifier(player: Player, simEra: Era): number {
  const playerIdx = ERA_ORDER.indexOf(player.era)
  const simIdx = ERA_ORDER.indexOf(simEra)
  const dist = Math.abs(playerIdx - simIdx)
  const table = playerIdx > simIdx ? ERA_MOD_BACKWARD : ERA_MOD_FORWARD
  let mod = table[Math.min(dist, table.length - 1)]
  // Extra penalty for pre-3pt era players (50s/60s/70s) in eras where 3PT matters
  if (PRE_THREE_PT_ERAS.includes(player.era)) {
    const fg3 = player.FG3_PCT ?? 0
    if (fg3 < 0.2) {
      if (THREE_PT_ERAS.includes(simEra) || simEra === '00s') mod -= 0.10
      else if (simEra === '90s') mod -= 0.05
    }
  }
  return Math.max(mod, 0.50)
}

export function calcPlayerAdjustedRating(
  player: Player,
  slot: SlotPosition,
  simEra: Era
): { base: number; adjusted: number; fitPenalty: 0 | 0.10 | 0.25; eraMod: number; fitLabel: CourtSlot['fitLabel'] } {
  const base = playerBaseRating(player, simEra)
  const { penalty, label } = calcFitPenalty(player, slot)
  const eraMod = calcEraModifier(player, simEra)
  const adjusted = base * (1 - penalty) * eraMod
  return { base, adjusted, fitPenalty: penalty, eraMod, fitLabel: label }
}

export function gradeFromPct(pct: number, thresholds: [number, number, number, number]): 'A' | 'B' | 'C' | 'D' | 'F' {
  if (pct >= thresholds[0]) return 'A'
  if (pct >= thresholds[1]) return 'B'
  if (pct >= thresholds[2]) return 'C'
  if (pct >= thresholds[3]) return 'D'
  return 'F'
}

export function coachOffGrade(coach: Coach): 'A' | 'B' | 'C' | 'D' | 'F' {
  return gradeFromPct(coach.regWLPct, [0.600, 0.550, 0.500, 0.450])
}

export function coachDefGrade(coach: Coach): 'A' | 'B' | 'C' | 'D' | 'F' {
  if (coach.playoffG === 0) return 'C'
  return gradeFromPct(coach.playoffWLPct, [0.550, 0.500, 0.450, 0.400])
}

export function gradeToNumber(g: 'A' | 'B' | 'C' | 'D' | 'F'): number {
  return { A: 4, B: 3, C: 2, D: 1, F: 0 }[g]
}

export function numberToGrade(n: number): 'A' | 'B' | 'C' | 'D' | 'F' {
  if (n >= 3.5) return 'A'
  if (n >= 2.5) return 'B'
  if (n >= 1.5) return 'C'
  if (n >= 0.5) return 'D'
  return 'F'
}

export function coachOverallGrade(coach: Coach): 'A' | 'B' | 'C' | 'D' | 'F' {
  return numberToGrade((gradeToNumber(coach.offGrade) + gradeToNumber(coach.defGrade)) / 2)
}

export function coachBonus(grade: 'A' | 'B' | 'C' | 'D' | 'F'): number {
  return { A: 0.04, B: 0.02, C: 0, D: -0.04, F: -0.06 }[grade]
}

export function effectiveCoachBonus(coach: Coach, side: 'off' | 'def'): number {
  if (side === 'off' && coach.offGuru) return 0.06
  if (side === 'def' && coach.defGuru) return 0.06
  return coachBonus(side === 'off' ? coach.offGrade : coach.defGrade)
}

export function coachChampBonus(coach: Coach): number {
  return Math.min(coach.champ, 8) * 0.004
}

const STARTER_SLOTS: SlotPosition[] = ['PG', 'SG', 'SF', 'PF', 'C']
const BENCH_SLOTS: SlotPosition[] = ['B1', 'B2', 'B3', 'B4']

export function calcTeamRating(slots: CourtSlot[], coach: Coach, simEra: Era): {
  teamRating: number
  playerRatings: PlayerRating[]
} {
  const playerRatings: PlayerRating[] = []

  let starterSum = 0
  let starterCount = 0
  let benchSum = 0
  let benchCount = 0

  for (const slot of slots) {
    if (!slot.player) continue
    const { base, adjusted, fitPenalty, eraMod, fitLabel } = calcPlayerAdjustedRating(slot.player, slot.position, simEra)
    playerRatings.push({ player: slot.player, slot: slot.position, base, adjusted, fitPenalty, eraMod, fitLabel })

    if (STARTER_SLOTS.includes(slot.position)) {
      starterSum += adjusted
      starterCount++
    } else {
      benchSum += adjusted
      benchCount++
    }
  }

  const starterAvg = starterCount > 0 ? starterSum / starterCount : 0
  const benchAvg = benchCount > 0 ? benchSum / benchCount : 0
  const rawRating = starterAvg * 0.70 + benchAvg * 0.30

  const offBonus = effectiveCoachBonus(coach, 'off')
  const defBonus = effectiveCoachBonus(coach, 'def')
  const champBonus = coachChampBonus(coach)
  const teamRating = rawRating * (1 + (offBonus + defBonus) / 2 + champBonus)

  console.log('[Rating] --- Player breakdown ---')
  for (const pr of playerRatings) {
    const tag = STARTER_SLOTS.includes(pr.slot) ? 'START' : 'BENCH'
    console.log(
      `[Rating] ${tag} ${pr.slot} ${pr.player.full_name} | ` +
      `base=${pr.base.toFixed(1)} × era${(pr.eraMod * 100).toFixed(0)}% × fit${((1 - pr.fitPenalty) * 100).toFixed(0)}% ` +
      `= adjusted=${pr.adjusted.toFixed(1)}`
    )
  }
  console.log(
    `[Rating] starterAvg=${starterAvg.toFixed(1)} (×0.70=${( starterAvg * 0.70).toFixed(1)})  ` +
    `benchAvg=${benchAvg.toFixed(1)} (×0.30=${( benchAvg * 0.30).toFixed(1)})  ` +
    `rawRating=${rawRating.toFixed(1)}`
  )
  console.log(`[Rating] coach ${coach.name}: offBonus=${(offBonus*100).toFixed(0)}% defBonus=${(defBonus*100).toFixed(0)}% → teamRating=${teamRating.toFixed(1)}`)

  return { teamRating, playerRatings }
}

function randn(): number {
  // Box-Muller approximation
  let u = 0, v = 0
  while (u === 0) u = Math.random()
  while (v === 0) v = Math.random()
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v)
}

// Efficiency noise — guarantees at least ±1pp so simulated % never matches the card exactly
function effNoise(sigma: number): number {
  const n = randn() * sigma
  const MIN = 0.020
  return Math.abs(n) < MIN ? (Math.random() < 0.5 ? -MIN : MIN) : n
}

// playerDefFactor: derived from roster STL+BLK — primary driver of opponent scoring
// rebFactor: high REB boosts team scoring (2nd-chance pts) and reduces opp scoring (def boards)
// astFactor: high AST boosts team scoring only (better shot quality)
// coachDefBonus / coachOffBonus: small ±2% nudge on top of player-driven baselines
function generateGameScore(
  expectedTeamScore: number,
  playerDefFactor: number,
  rebFactor: number,
  astFactor: number,
  coachDefBonus: number,
  coachOffBonus: number,
  win: boolean,
  simEra: Era
): { teamScore: number; oppScore: number } {
  const scoreCap   = ERA_SCORE_CAP[simEra]
  const scoreFloor = ERA_SCORE_FLOOR[simEra]
  const oppBase    = ERA_OPP_BASELINE[simEra]

  const adjTeamScore = expectedTeamScore * rebFactor * astFactor * (1 + coachOffBonus * 0.5)
  let teamScore = Math.round(Math.min(scoreCap, Math.max(scoreFloor, adjTeamScore + randn() * 7)))

  // rebFactor inverted at half weight for defensive rebound effect on opp possessions
  const rebDefEffect = 1.0 + (1.0 - rebFactor) * 0.5
  const oppBaseline = oppBase * playerDefFactor * rebDefEffect * (1 - coachDefBonus * 0.5)
  let oppScore = Math.round(Math.min(scoreCap - 5, Math.max(scoreFloor - 4, oppBaseline + randn() * 7)))

  if (win && teamScore <= oppScore) {
    teamScore = oppScore + Math.max(1, Math.round(Math.abs(randn()) * 4 + 1))
  } else if (!win && oppScore <= teamScore) {
    oppScore = teamScore + Math.max(1, Math.round(Math.abs(randn()) * 4 + 1))
  }

  let ts = Math.min(scoreCap, teamScore)
  let os = Math.min(scoreCap, oppScore)
  // Tie-break after capping: basketball can't end in a tie
  if (ts === os) { if (win) ts += 1; else os += 1 }
  return { teamScore: ts, oppScore: os }
}

// League-average indices for normalisation (calibrated to typical 9-man roster)
const LEAGUE_AVG_DEF_INDEX = 10.5
const LEAGUE_AVG_REB_INDEX = 38
const LEAGUE_AVG_AST_INDEX = 22

function calcPlayerDefFactor(entries: { pr: PlayerRating; minScale: number }[]): number {
  const defIndex = entries.reduce((s, { pr, minScale }) => {
    const stl = imputeSTL(pr.player)
    const blk = imputeBLK(pr.player)
    return s + (stl + blk * 0.7) * pr.eraMod * minScale
  }, 0)
  // Soft clamp: ±8% swing from league average — players matter but it stays grounded
  const raw = 1.0 + (LEAGUE_AVG_DEF_INDEX - defIndex) / LEAGUE_AVG_DEF_INDEX * 0.08
  return Math.max(0.93, Math.min(1.07, raw))
}

// High REB → more team possessions (+score) and fewer opp second chances (−opp score)
function calcRebFactor(entries: { pr: PlayerRating; minScale: number }[]): number {
  const rebIndex = entries.reduce((s, { pr, minScale }) =>
    s + (pr.player.REB ?? 0) * pr.eraMod * minScale, 0)
  const raw = 1.0 + (rebIndex - LEAGUE_AVG_REB_INDEX) / LEAGUE_AVG_REB_INDEX * 0.06
  return Math.max(0.94, Math.min(1.06, raw))
}

// High AST → better shot quality → scoring efficiency boost (offense only)
function calcAstFactor(entries: { pr: PlayerRating; minScale: number }[]): number {
  const astIndex = entries.reduce((s, { pr, minScale }) =>
    s + (pr.player.AST ?? 0) * pr.eraMod * minScale, 0)
  const raw = 1.0 + (astIndex - LEAGUE_AVG_AST_INDEX) / LEAGUE_AVG_AST_INDEX * 0.05
  return Math.max(0.95, Math.min(1.05, raw))
}


export function simulateSeason(
  teamRating: number,
  playerRatings: PlayerRating[],
  coachDefGrade: 'A' | 'B' | 'C' | 'D' | 'F',
  coachOffGrade: 'A' | 'B' | 'C' | 'D' | 'F',
  simEra: Era,
  coachDefBonus?: number,
  coachOffBonus?: number,
): { wins: number; losses: number; games: boolean[]; seasonStats: PlayerSeasonStats[]; avgTeamScore: number; avgOppScore: number } {
  const games: boolean[] = []
  let wins = 0
  let totalTeamScore = 0
  let totalOppScore = 0

  const OPP_BASELINE = 36
  const OPP_SPREAD   = 6
  const GAME_NOISE   = 6

  // Per-player entries with minutes info (no stat accumulation needed)
  const entries = playerRatings.map(pr => {
    const isStarter  = STARTER_SLOTS.includes(pr.slot)
    const assignedMPG = SLOT_MPG[pr.slot]
    const minScale    = assignedMPG / (isStarter ? STARTER_BASELINE_MPG : BENCH_BASELINE_MPG)
    return { pr, assignedMPG, minScale }
  })

  // Pre-generate per-player efficiency components so scoring and displayed stats stay in sync
  const preEff = entries.map(({ pr, assignedMPG }) => {
    const naturalMPG     = Math.min(38, Math.max(10, (pr.player.PTS ?? 0) * 1.6))
    const stretchMax     = Math.max(0, (assignedMPG - naturalMPG) / 28) * 0.06
    const stretch        = stretchMax > 0 ? -(stretchMax * Math.random()) : 0
    return { fg: effNoise(0.035), ft: effNoise(0.030), fg3: effNoise(0.040), stretch }
  })
  // Weighted average FG delta → shifts expectedTeamScore (±3-4 wins impact)
  const totalMinWeight = entries.reduce((s, { minScale }) => s + minScale, 0)
  const avgFGDelta     = entries.reduce((s, { minScale }, i) => s + (preEff[i].fg + preEff[i].stretch) * minScale, 0) / totalMinWeight

  const baseExpectedScore = entries.reduce((s, e) => s + (e.pr.player.PTS ?? 0) * e.pr.eraMod * e.minScale * (1 - e.pr.fitPenalty), 0)
  const expectedTeamScore = Math.max(85, Math.min(132, baseExpectedScore * (1 + avgFGDelta * 3)))
  const playerDefFactor = calcPlayerDefFactor(entries)
  const rebFactor = calcRebFactor(entries)
  const astFactor = calcAstFactor(entries)
  const defBonus = coachDefBonus ?? coachBonus(coachDefGrade)
  const offBonus = coachOffBonus ?? coachBonus(coachOffGrade)

  for (let i = 0; i < 82; i++) {
    const oppRating = OPP_BASELINE * playerDefFactor + randn() * OPP_SPREAD
    const teamRoll  = teamRating + randn() * GAME_NOISE
    const oppRoll   = oppRating  + randn() * GAME_NOISE
    const win       = teamRoll > oppRoll
    games.push(win)
    if (win) wins++
    const { teamScore, oppScore } = generateGameScore(expectedTeamScore, playerDefFactor, rebFactor, astFactor, defBonus, offBonus, win, simEra)
    totalTeamScore += teamScore
    totalOppScore += oppScore
  }

  const avgTeamScore = totalTeamScore / 82
  const avgOppScore = totalOppScore / 82

  // Weights: era_stat × eraMod × minScale × fitPenalty — proportional share per player
  const weights = entries.map(({ pr, minScale }) => {
    const p = pr.player
    const s = pr.eraMod * minScale * (1 - pr.fitPenalty)
    return {
      PTS: (p.PTS ?? 0) * s,
      REB: (p.REB ?? 0) * s,
      AST: (p.AST ?? 0) * s,
      STL: imputeSTL(p) * s,
      BLK: imputeBLK(p) * s,
      TOV: imputeTOV(p) * s,
    }
  })

  const totalPTSWeight = weights.reduce((s, w) => s + w.PTS, 0)

  // Per-player season variance (±15%) — makes each run look different
  const seasonVar = entries.map(() => 0.85 + Math.random() * 0.30)
  // Re-normalize so PTS shares still sum correctly after variance
  const varPTSWeights = weights.map((w, i) => w.PTS * seasonVar[i])
  const totalVarPTS = varPTSWeights.reduce((a, b) => a + b, 0)

  // ── Team context efficiency modifiers ──────────────────────────────────
  // Spacing: # of real shooters (FG3_PCT ≥ 36%) vs baseline of 2
  const shooterCount  = entries.filter(e => (e.pr.player.FG3_PCT ?? 0) >= 0.36).length
  const spacingMod    = (shooterCount - 2) * 0.006        // ±0.6% per shooter vs baseline
  // Playmaking: top AST on team lifts shot quality for everyone
  const topAST        = Math.max(...entries.map(e => e.pr.player.AST ?? 0))
  const playmakingMod = Math.min(0.018, Math.max(-0.012, (topAST - 5) * 0.003))
  // Team quality: stronger teams create better shots
  const teamQualityMod = (teamRating - 70) * 0.0008

  const seasonStats: PlayerSeasonStats[] = entries.map(({ pr, assignedMPG }, i) => {
    const w = weights[i]
    const v = seasonVar[i]
    const fgCtx = spacingMod + playmakingMod + teamQualityMod + preEff[i].fg + preEff[i].stretch
    const ftCtx = preEff[i].ft + preEff[i].stretch * 0.4
    return {
      player:  pr.player,
      slot:    pr.slot,
      GP:      82,
      MPG:     assignedMPG,
      PTS:     totalVarPTS > 0 ? (varPTSWeights[i] / totalVarPTS) * avgTeamScore : 0,
      REB:     w.REB * v,
      AST:     w.AST * v,
      STL:     w.STL * v,
      BLK:     w.BLK * v,
      TOV:     w.TOV * v,
      FG_PCT:  Math.min(0.80, Math.max(0.20, (pr.player.FG_PCT ?? 0.45) + fgCtx)),
      FG3_PCT: PRE_THREE_PT_ERAS.includes(simEra) ? null
        : pr.player.FG3_PCT != null
          ? Math.min(0.60, Math.max(0.15, pr.player.FG3_PCT + fgCtx + preEff[i].fg3))
          : null,
      FT_PCT:  Math.min(0.99, Math.max(0.30, (pr.player.FT_PCT ?? 0.70) + ftCtx)),
    }
  })

  return { wins, losses: 82 - wins, games, seasonStats, avgTeamScore, avgOppScore }
}

export const ALL_ERAS: Era[] = ['50s', '60s', '70s', '80s', '90s', '00s', '10s', '20s']

export const SLOT_POSITIONS: SlotPosition[] = ['PG', 'SG', 'SF', 'PF', 'C', 'B1', 'B2', 'B3', 'B4']

const PLAYOFF_ROUND_NAMES = ['First Round', 'Semifinals', 'Conference Finals', 'NBA Finals']

export function firstRoundWinsNeeded(simEra: Era): number {
  if (['50s', '60s', '70s'].includes(simEra)) return 2  // Best of 3
  if (['80s', '90s'].includes(simEra))        return 3  // Best of 5
  return 4                                               // Best of 7
}

export function firstRoundLabel(simEra: Era): string {
  const w = firstRoundWinsNeeded(simEra)
  return w === 2 ? 'Best of 3' : w === 3 ? 'Best of 5' : 'Best of 7'
}

// Opponent mean rating per round based on team's regular season wins.
// Better records earn easier first-round matchups; all rounds get harder.
function playoffOppRating(round: number, teamWins: number): number {
  const idx = round - 1
  if (teamWins >= 60) return [38, 41, 43, 45][idx]
  if (teamWins >= 53) return [39, 41, 43, 45][idx]
  if (teamWins >= 47) return [40, 42, 44, 46][idx]
  return                      [42, 43, 45, 46][idx]  // 41-46 wins / low seed
}

export function simulatePlayoffs(
  teamRating: number,
  playerRatings: PlayerRating[],
  regularSeasonWins: number,
  coachDefGrade: 'A' | 'B' | 'C' | 'D' | 'F',
  coachOffGrade: 'A' | 'B' | 'C' | 'D' | 'F',
  simEra: Era,
  coachDefBonus?: number,
  coachOffBonus?: number,
): PlayoffResult {
  const OPP_SPREAD = 3
  const GAME_NOISE = 5

  const entries = playerRatings.map(pr => {
    const isStarter  = STARTER_SLOTS.includes(pr.slot)
    const assignedMPG = SLOT_MPG[pr.slot]
    const minScale    = assignedMPG / (isStarter ? STARTER_BASELINE_MPG : BENCH_BASELINE_MPG)
    return { pr, assignedMPG, minScale }
  })

  const playerDefFactor = calcPlayerDefFactor(entries)
  const rebFactor = calcRebFactor(entries)
  const astFactor = calcAstFactor(entries)
  const defBonus = coachDefBonus ?? coachBonus(coachDefGrade)
  const offBonus = coachOffBonus ?? coachBonus(coachOffGrade)

  // Ring-boosted effective team rating for playoff win determination
  const totalAdjusted = entries.reduce((s, e) => s + e.pr.adjusted, 0)
  const avgRingBoost = totalAdjusted > 0
    ? entries.reduce((s, e) => s + playoffRingBoost(e.pr.player.rings ?? 0) * e.pr.adjusted / totalAdjusted, 0)
    : 0
  const effectiveTeamRating = teamRating * (1 + avgRingBoost)

  // Ring boost also raises the score ceiling so champions actually put up bigger numbers
  const baseTeamScore = entries.reduce((s, e) => s + (e.pr.player.PTS ?? 0) * e.pr.eraMod * e.minScale * (1 - e.pr.fitPenalty), 0)
  const expectedTeamScore = Math.max(85, Math.min(138, baseTeamScore * (1 + avgRingBoost)))

  // Per-player expected averages for game leader generation
  const expPTS = entries.map(e => (e.pr.player.PTS ?? 0) * e.pr.eraMod * e.minScale * (1 - e.pr.fitPenalty) * (1 + playoffRingBoost(e.pr.player.rings ?? 0)))
  const expREB = entries.map(e => (e.pr.player.REB ?? 0) * e.pr.eraMod * e.minScale * (1 - e.pr.fitPenalty) * (1 + playoffRingBoost(e.pr.player.rings ?? 0)))
  const expAST = entries.map(e => (e.pr.player.AST ?? 0) * e.pr.eraMod * e.minScale * (1 - e.pr.fitPenalty) * (1 + playoffRingBoost(e.pr.player.rings ?? 0)))
  const totalExpPTS = expPTS.reduce((a, b) => a + b, 0)

  // Accumulators — filled per-game from actual generated lines
  const accumPTS = new Array(entries.length).fill(0)
  const accumREB = new Array(entries.length).fill(0)
  const accumAST = new Array(entries.length).fill(0)
  const finalsPTS = new Array(entries.length).fill(0)
  const finalsREB = new Array(entries.length).fill(0)
  const finalsAST = new Array(entries.length).fill(0)
  let finalsGames = 0

  const rounds: PlayoffResult['rounds'] = []
  const allGames: PlayoffGame[] = []
  let champion = false

  for (let r = 0; r < 4; r++) {
    const oppMean = playoffOppRating(r + 1, regularSeasonWins)
    const winsNeeded = r === 0 ? firstRoundWinsNeeded(simEra) : 4
    let sW = 0, sL = 0

    while (sW < winsNeeded && sL < winsNeeded) {
      const gameInSeries = sW + sL + 1

      // Special performance: base 15% + 1% per ring across the roster (cap 25%)
      const totalRings = entries.reduce((s, e) => s + (e.pr.player.rings ?? 0), 0)
      const specialChance = Math.min(0.15 + totalRings * 0.01, 0.25)
      const specialTrigger = Math.random() < specialChance
      const specialBoost = specialTrigger ? 2 + Math.random() * 4 : 0

      const oppRating = oppMean * playerDefFactor + randn() * OPP_SPREAD
      const win = effectiveTeamRating + specialBoost + randn() * GAME_NOISE > oppRating + randn() * GAME_NOISE
      const { teamScore, oppScore } = generateGameScore(expectedTeamScore, playerDefFactor, rebFactor, astFactor, defBonus, offBonus, win, simEra)

      // Per-game individual stat lines (high variance — 60–140% of expected)
      const gamePTS = expPTS.map(e => Math.max(0, e * (0.6 + Math.random() * 0.8)))
      const gameREB = expREB.map(e => Math.max(0, Math.round(e * (0.6 + Math.random() * 0.8))))
      const gameAST = expAST.map(e => Math.max(0, Math.round(e * (0.6 + Math.random() * 0.8))))

      // Scale PTS so they sum to teamScore
      const rawPTSTotal = gamePTS.reduce((a, b) => a + b, 0)
      const scaledPTS = gamePTS.map(p => Math.max(0, Math.round(totalExpPTS > 0 ? (p / rawPTSTotal) * teamScore : 0)))

      // Special performance: inflate one player's stats
      let special: SpecialPerformance | undefined
      if (specialTrigger && entries.length > 0) {
        // Pick player weighted by adjusted rating × ring multiplier (champions more likely to star)
        const ringWeights = entries.map(e => e.pr.adjusted * (1 + (e.pr.player.rings ?? 0) * 0.20))
        const totalRingWeighted = ringWeights.reduce((s, w) => s + w, 0)
        let roll = Math.random() * totalRingWeighted
        let starIdx = 0
        for (let i = 0; i < entries.length; i++) {
          roll -= ringWeights[i]
          if (roll <= 0) { starIdx = i; break }
        }
        const boostFactor = 1.6 + Math.random() * 0.9
        scaledPTS[starIdx] = Math.round(scaledPTS[starIdx] * boostFactor)
        gameREB[starIdx] = Math.round(gameREB[starIdx] * boostFactor)
        gameAST[starIdx] = Math.round(gameAST[starIdx] * boostFactor)
        const sp = scaledPTS[starIdx], sr = gameREB[starIdx], sa = gameAST[starIdx]
        const isBench = entries[starIdx].pr.slot.startsWith('B')
        // 20-25 pts on a starter is within normal range — not a special performance
        if (sp <= 25 && !isBench && sr < 10 && sa < 10) {
          // suppress — leave boosted stats but don't flag as special
        } else {
          const label =
            sp >= 45                           ? `${sp}-point scoring eruption` :
            sp >= 10 && sr >= 10 && sa >= 10   ? `Triple-double: ${sp}/${sr}/${sa}` :
            sp >= 35                           ? `${sp}-point scoring takeover` :
            sr >= 18                           ? `${sp}pts/${sr}reb dominant` :
            sa >= 14                           ? `${sp}pts/${sa}ast playmaking` :
            isBench                            ? `${sp}-point showcase off the bench` :
                                                 `${sp}-point showcase`
          const starName = entries[starIdx].pr.player.full_name.split(' ').slice(-1)[0]
          special = { playerName: starName, pts: sp, reb: sr, ast: sa, label }
        }
      }

      // Identify leaders
      const maxPTS = Math.max(...scaledPTS)
      const maxREB = Math.max(...gameREB)
      const maxAST = Math.max(...gameAST)
      const ptsIdx = scaledPTS.indexOf(maxPTS)
      const rebIdx = gameREB.indexOf(maxREB)
      const astIdx = gameAST.indexOf(maxAST)
      const lastName = (i: number) => entries[i].pr.player.full_name.split(' ').slice(-1)[0]
      const leaders = {
        pts: { name: lastName(ptsIdx), val: maxPTS },
        reb: { name: lastName(rebIdx), val: maxREB },
        ast: { name: lastName(astIdx), val: maxAST },
      }

      for (let i = 0; i < entries.length; i++) {
        accumPTS[i] += scaledPTS[i]
        accumREB[i] += gameREB[i]
        accumAST[i] += gameAST[i]
        if (r === 3) {
          finalsPTS[i] += scaledPTS[i]
          finalsREB[i] += gameREB[i]
          finalsAST[i] += gameAST[i]
        }
      }
      if (r === 3) finalsGames++

      const playerLines = entries.map((e, i) => ({
        personId: e.pr.player.person_id,
        pts: scaledPTS[i],
        reb: gameREB[i],
        ast: gameAST[i],
      }))
      if (win) sW++; else sL++
      allGames.push({ win, roundIndex: r, teamScore, oppScore, gameInSeries, leaders, special, playerLines })
    }

    const advanced = sW === winsNeeded
    rounds.push({ name: PLAYOFF_ROUND_NAMES[r], seriesWins: sW, seriesLosses: sL, advanced, winsNeeded })
    if (!advanced) break
    if (r === 3) champion = true
  }

  const numGames = allGames.length
  const avgPlayoffTeamScore = numGames > 0
    ? allGames.reduce((s, g) => s + g.teamScore, 0) / numGames
    : 0

  // STL/BLK/TOV still from weights (not tracked per-game)
  const stlBlkTov = entries.map(({ pr, minScale }) => {
    const s = pr.eraMod * minScale * (1 - pr.fitPenalty)
    return { STL: imputeSTL(pr.player) * s, BLK: imputeBLK(pr.player) * s, TOV: imputeTOV(pr.player) * s }
  })

  // ── Team context for playoff efficiency ──────────────────────────────────
  const pShooterCount  = entries.filter(e => (e.pr.player.FG3_PCT ?? 0) >= 0.36).length
  const pSpacingMod    = (pShooterCount - 2) * 0.006
  const pTopAST        = Math.max(...entries.map(e => e.pr.player.AST ?? 0))
  const pPlaymakingMod = Math.min(0.018, Math.max(-0.012, (pTopAST - 5) * 0.003))
  const pTeamQualityMod = (teamRating - 70) * 0.0008

  const playoffStats: PlayerSeasonStats[] = entries.map(({ pr, assignedMPG }, i) => {
    const effBoost       = playoffRingBoost(pr.player.rings ?? 0) * 0.5
    const naturalMPG     = Math.min(38, Math.max(10, (pr.player.PTS ?? 0) * 1.6))
    const stretchMax     = Math.max(0, (assignedMPG - naturalMPG) / 28) * 0.06
    const stretchPenalty = stretchMax > 0 ? -(stretchMax * Math.random()) : 0
    const fgCtx  = pSpacingMod + pPlaymakingMod + pTeamQualityMod + stretchPenalty
    const ftCtx  = stretchPenalty * 0.4
    return {
      player:  pr.player,
      slot:    pr.slot,
      GP:      numGames,
      MPG:     assignedMPG,
      PTS:     numGames > 0 ? accumPTS[i] / numGames : 0,
      REB:     numGames > 0 ? accumREB[i] / numGames : 0,
      AST:     numGames > 0 ? accumAST[i] / numGames : 0,
      STL:     stlBlkTov[i].STL,
      BLK:     stlBlkTov[i].BLK,
      TOV:     stlBlkTov[i].TOV,
      FG_PCT:  Math.min(0.80, Math.max(0.20, (pr.player.FG_PCT ?? 0.45) + effBoost + fgCtx + effNoise(0.035))),
      FG3_PCT: PRE_THREE_PT_ERAS.includes(simEra) ? null
        : pr.player.FG3_PCT != null
          ? Math.min(0.60, Math.max(0.15, pr.player.FG3_PCT + effBoost + fgCtx + effNoise(0.040)))
          : null,
      FT_PCT:  Math.min(0.99, Math.max(0.30, (pr.player.FT_PCT ?? 0.70) + effBoost + ftCtx + effNoise(0.035))),
    }
  })

  const finalsStats: PlayerSeasonStats[] = entries.map(({ pr, assignedMPG }, i) => {
    const effBoost       = playoffRingBoost(pr.player.rings ?? 0) * 0.5
    const naturalMPG     = Math.min(38, Math.max(10, (pr.player.PTS ?? 0) * 1.6))
    const stretchMax     = Math.max(0, (assignedMPG - naturalMPG) / 28) * 0.06
    const stretchPenalty = stretchMax > 0 ? -(stretchMax * Math.random()) : 0
    const fgCtx  = pSpacingMod + pPlaymakingMod + pTeamQualityMod + stretchPenalty
    const ftCtx  = stretchPenalty * 0.4
    return {
      player:  pr.player,
      slot:    pr.slot,
      GP:      finalsGames,
      MPG:     assignedMPG,
      PTS:     finalsGames > 0 ? finalsPTS[i] / finalsGames : 0,
      REB:     finalsGames > 0 ? finalsREB[i] / finalsGames : 0,
      AST:     finalsGames > 0 ? finalsAST[i] / finalsGames : 0,
      STL:     stlBlkTov[i].STL,
      BLK:     stlBlkTov[i].BLK,
      TOV:     stlBlkTov[i].TOV,
      FG_PCT:  Math.min(0.80, Math.max(0.20, (pr.player.FG_PCT ?? 0.45) + effBoost + fgCtx + effNoise(0.035))),
      FG3_PCT: PRE_THREE_PT_ERAS.includes(simEra) ? null
        : pr.player.FG3_PCT != null
          ? Math.min(0.60, Math.max(0.15, pr.player.FG3_PCT + effBoost + fgCtx + effNoise(0.040)))
          : null,
      FT_PCT:  Math.min(0.99, Math.max(0.30, (pr.player.FT_PCT ?? 0.70) + effBoost + ftCtx + effNoise(0.035))),
    }
  })

  return { rounds, champion, allGames, playoffStats, finalsStats }
}
