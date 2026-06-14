export interface EraRecord { wins: number; losses: number }

export interface LifetimeStats {
  draftsCompleted:    number
  totalWins:          number
  totalLosses:        number
  championshipsTotal: number
  recordByEra:        Partial<Record<string, EraRecord>>
  championshipsByEra: Partial<Record<string, number>>
  bestRecord:         { wins: number; losses: number; era: string } | null
  bestRecordByEra:    Partial<Record<string, EraRecord>>
  worstRecord:        { wins: number; losses: number; era: string } | null
  worstRecordByEra:   Partial<Record<string, EraRecord>>
  playerDraftCounts:  Record<string, { name: string; count: number }>
  coachDraftCounts:   Record<string, { name: string; count: number }>
  eraSpinCount:       Partial<Record<string, number>>
  highestTeamRating:  { rating: number; era: string } | null
}

const KEY = 'eraball_lifetime_stats'

function defaults(): LifetimeStats {
  return {
    draftsCompleted: 0, totalWins: 0, totalLosses: 0, championshipsTotal: 0,
    recordByEra: {}, championshipsByEra: {}, bestRecord: null,
    bestRecordByEra: {}, worstRecord: null, worstRecordByEra: {}, playerDraftCounts: {}, coachDraftCounts: {}, eraSpinCount: {}, highestTeamRating: null,
  }
}

export function getLifetimeStats(): LifetimeStats {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return defaults()
    return { ...defaults(), ...JSON.parse(raw) }
  } catch { return defaults() }
}

function save(s: LifetimeStats) {
  try { localStorage.setItem(KEY, JSON.stringify(s)) } catch {}
}

export function recordRunComplete(params: {
  era: string
  wins: number
  losses: number
  champion: boolean
  teamRating: number
  players: { personId: string; name: string }[]
  coach: string
}) {
  const s = getLifetimeStats()
  const { era, wins, losses, champion, teamRating, players, coach } = params

  s.draftsCompleted++
  s.totalWins += wins
  s.totalLosses += losses
  s.eraSpinCount[era] = (s.eraSpinCount[era] ?? 0) + 1

  if (champion) {
    s.championshipsTotal++
    s.championshipsByEra[era] = (s.championshipsByEra[era] ?? 0) + 1
  }

  const eraRec = s.recordByEra[era] ?? { wins: 0, losses: 0 }
  eraRec.wins += wins; eraRec.losses += losses
  s.recordByEra[era] = eraRec

  if (!s.bestRecord || wins > s.bestRecord.wins)
    s.bestRecord = { wins, losses, era }

  const bestEra = s.bestRecordByEra[era]
  if (!bestEra || wins > bestEra.wins)
    s.bestRecordByEra[era] = { wins, losses }

  if (!s.worstRecord || losses > s.worstRecord.losses)
    s.worstRecord = { wins, losses, era }

  const worstEra = s.worstRecordByEra[era]
  if (!worstEra || losses > worstEra.losses)
    s.worstRecordByEra[era] = { wins, losses }

  if (!s.highestTeamRating || teamRating > s.highestTeamRating.rating)
    s.highestTeamRating = { rating: teamRating, era }

  for (const p of players) {
    const existing = s.playerDraftCounts[p.personId] ?? { name: p.name, count: 0 }
    existing.count++
    s.playerDraftCounts[p.personId] = existing
  }

  const existingCoach = s.coachDraftCounts[coach] ?? { name: coach, count: 0 }
  existingCoach.count++
  s.coachDraftCounts[coach] = existingCoach

  save(s)
}

export function clearLifetimeStats() {
  try { localStorage.removeItem(KEY) } catch {}
}
