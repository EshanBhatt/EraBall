'use client'

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import type { Player, Coach, CourtSlot, SlotPosition, Era, GamePhase, PlayerSeasonStats, PlayoffResult, PlayoffGame, PlayerRating } from '../lib/types'
import ResultCard from './ResultCard'
import {
  ALL_ERAS, SLOT_POSITIONS, SLOT_MPG, calcFitPenalty, calcEraModifier, calcTeamRating,
  simulateSeason, simulatePlayoffs, calcTS, coachBonus, playerMatchesEra, withEraStats, applyFlexTag, applyRings
} from '../lib/gameLogic'

// ─── Design tokens ────────────────────────────────────────────────────────────
const G = {
  gold:     '#C9A84C',
  goldHov:  '#E2C46A',
  goldDim:  '#7A6430',
  black:    '#000000',
  surface:  '#111111',
  surface2: '#1A1A1A',
  border:   '#222222',
  borderSub:'#1A1A1A',
  white:    '#FFFFFF',
  grey:     '#888888',
  greyDark: '#444444',
  red:      '#CC3333',
}

const BEBAS = { fontFamily: 'var(--font-bebas), "Bebas Neue", impact, sans-serif' }

function eraLabel(era: Era | string): string {
  return era === '00s' ? '2000s' : era === '10s' ? '2010s' : era === '20s' ? '2020s' : era
}

// ─── Coach guru overrides ─────────────────────────────────────────────────────
// Keys must match the name field in coaches.csv exactly (including * for HOF).
// offGuru / defGuru force that grade to A.
// offOverride / defOverride set an explicit grade (takes effect after guru check).
type CoachGuru = { offGuru?: boolean; defGuru?: boolean; offOverride?: Coach['offGrade']; defOverride?: Coach['defGrade'] }
const COACH_GURUS: Record<string, CoachGuru> = {
  'Tom Thibodeau':  { defGuru: true },
  'Hubie Brown':    { defGuru: true, offOverride: 'C' },
  'Mike Fratello':  { defGuru: true },
  'Dwane Casey':    { defOverride: 'B' },
  'Nate McMillan':  { defOverride: 'B' },
  "Jerry Sloan*":   { defGuru: true },
  "Mike D'Antoni":  { offGuru: true, defOverride: 'D' },
  'Don Nelson*':    { offGuru: true, defOverride: 'F' },
  'Byron Scott':    { defOverride: 'C' },
  'Rick Carlisle':  { offOverride: 'B', defOverride: 'B' },
  'George Karl*':   { defOverride: 'C' },
  'Phil Jackson*':  { offGuru: true },
  'Danny Ainge':    { defOverride: 'B' },
}

// ─── Data ─────────────────────────────────────────────────────────────────────
function parseCoachesCSV(text: string): Coach[] {
  const lines = text.split('\n').filter(l => l.trim())
  const dataLines = lines.slice(3)
  const coaches: Coach[] = []
  for (const line of dataLines) {
    const cols = line.split(',')
    if (!cols[1]?.trim() || cols[1].trim() === 'Coach') continue
    const name = cols[1].trim()
    const from = parseInt(cols[2]) || 0
    const to = parseInt(cols[3]) || 0
    const regW = parseInt(cols[6]) || 0
    const regL = parseInt(cols[7]) || 0
    const regWLPct = parseFloat(cols[8]) || 0
    const playoffG = parseInt(cols[10]) || 0
    const playoffW = parseInt(cols[11]) || 0
    const playoffL = parseInt(cols[12]) || 0
    const playoffWLPct = parseFloat(cols[13]) || 0
    const conf = parseInt(cols[14]) || 0
    const champ = parseInt(cols[15]) || 0
    const guru = COACH_GURUS[name] ?? {}
    const offGrade = (guru.offGuru ? 'A' : guru.offOverride ?? (regWLPct >= 0.600 ? 'A' : regWLPct >= 0.550 ? 'B' : regWLPct >= 0.500 ? 'C' : regWLPct >= 0.450 ? 'D' : 'F')) as Coach['offGrade']
    const defGrade = (guru.defGuru ? 'A' : guru.defOverride ?? (playoffG === 0 ? 'C' : playoffWLPct >= 0.550 ? 'A' : playoffWLPct >= 0.500 ? 'B' : playoffWLPct >= 0.450 ? 'C' : playoffWLPct >= 0.400 ? 'D' : 'F')) as Coach['defGrade']
    const gradeN = (g: Coach['offGrade']) => ({ A: 4, B: 3, C: 2, D: 1, F: 0 }[g])
    const avg = (gradeN(offGrade) + gradeN(defGrade)) / 2
    const overallGrade = (avg >= 3.5 ? 'A' : avg >= 2.5 ? 'B' : avg >= 1.5 ? 'C' : avg >= 0.5 ? 'D' : 'F') as Coach['overallGrade']
    if (name) coaches.push({ name, from, to, years: to - from, regG: regW + regL, regW, regL, regWLPct, playoffG, playoffW, playoffL, playoffWLPct, conf, champ, offGrade, defGrade, overallGrade, offGuru: !!guru.offGuru, defGuru: !!guru.defGuru })
  }
  return coaches
}

// Static fallback — replaced at runtime by allTeams derived from player data
const NBA_TEAMS = ['ATL','BOS','BKN','CHA','CHI','CLE','DAL','DEN','DET','GSW','HOU','IND','LAC','LAL','MEM','MIA','MIL','MIN','NOP','NYK','OKC','ORL','PHI','PHX','POR','SAC','SAS','TOR','UTA','WAS']

// Returns the team a player was on during a specific era, falling back to
// team_abbreviation (primary-era team) for players with no API season data.
function playerTeamForEra(player: Player, era: Era): string {
  return player.teams_by_era?.[era] ?? player.team_abbreviation
}

function emptySlots(): CourtSlot[] {
  return SLOT_POSITIONS.map(p => ({ position: p, player: null, fitPenalty: 0, fitLabel: null }))
}

// ─── Shared UI atoms ──────────────────────────────────────────────────────────

function GoldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-xs uppercase tracking-[0.2em]" style={{ color: G.grey }}>
      {children}
    </div>
  )
}

function GradeDisplay({ grade, label }: { grade: string; label: string }) {
  const gradeGold = grade === 'A'
  const gradeWhite = grade === 'B'
  const gradeRed = grade === 'F'
  const color = gradeGold ? G.gold : gradeWhite ? G.white : gradeRed ? G.red : G.grey
  return (
    <div className="text-center py-4" style={{ background: G.surface2, border: `1px solid ${G.border}` }}>
      <div className="text-5xl" style={{ ...BEBAS, color }}>{grade}</div>
      <div className="text-xs mt-1 uppercase tracking-widest" style={{ color: G.grey }}>{label}</div>
    </div>
  )
}

function Btn({ children, onClick, disabled, variant = 'gold', className = '' }: {
  children: React.ReactNode; onClick?: () => void; disabled?: boolean; variant?: 'gold' | 'outline' | 'ghost'; className?: string
}) {
  const base = 'px-6 py-3 text-sm uppercase tracking-[0.15em] font-semibold active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed'
  const styles: Record<string, React.CSSProperties> = {
    gold:    { background: G.gold, color: G.black, border: 'none' },
    outline: { background: 'transparent', color: G.gold, border: `1px solid ${G.gold}` },
    ghost:   { background: 'transparent', color: G.grey, border: `1px solid ${G.border}` },
  }
  return (
    <button onClick={onClick} disabled={disabled} className={`${base} btn-${variant} ${className}`} style={styles[variant]}>
      {children}
    </button>
  )
}

// ─── Player headshot ──────────────────────────────────────────────────────────
function PlayerHeadshot({ personId, size, initial }: { personId: string; size: number; initial?: string }) {
  const [failed, setFailed] = useState(false)
  const wrap: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: '50%',
    flexShrink: 0,
    border: `1px solid ${G.goldDim}`,
    background: G.surface2,
    overflow: 'hidden',
    position: 'relative',
  }
  if (failed) {
    return (
      <div style={{ ...wrap, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: G.greyDark, fontSize: size * 0.35, fontWeight: 700 }}>{initial ?? '?'}</span>
      </div>
    )
  }
  return (
    <div style={wrap}>
      <img
        src={`/api/headshot?id=${personId}`}
        alt=""
        onError={() => setFailed(true)}
        style={{
          position: 'absolute',
          height: '100%',
          width: 'auto',
          maxWidth: 'none',
          top: 0,
          left: '50%',
          transform: 'translateX(-50%)',
        }}
      />
    </div>
  )
}

function CoachHeadshot({ name, size }: { name: string; size: number }) {
  const [failed, setFailed] = useState(false)
  const base: React.CSSProperties = {
    width: size, height: size, borderRadius: '50%', flexShrink: 0,
    border: `1px solid ${G.goldDim}`, background: G.surface2,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  }
  if (failed) {
    return (
      <div style={base}>
        <span style={{ color: G.greyDark, fontSize: size * 0.35, fontWeight: 700 }}>{name[0]}</span>
      </div>
    )
  }
  return (
    <img
      src={`/api/coach-headshot?name=${encodeURIComponent(name)}`}
      alt=""
      onError={() => setFailed(true)}
      style={{ ...base, objectFit: 'cover', objectPosition: 'center top', transform: 'translateZ(0)' }}
    />
  )
}

// ─── Player card ──────────────────────────────────────────────────────────────
function PlayerCard({ player, onDragStart, displayEra, activeEra }: { player: Player; onDragStart?: () => void; displayEra?: Era; activeEra?: Era }) {
  const ts = (calcTS(player) * 100).toFixed(1)
  const imp = (stat: string) => player.imputed_stats?.includes(stat) ?? false
  const fmt = (stat: string, val: string | null | undefined) =>
    val == null ? '—' : imp(stat) ? `~${val}` : val

  return (
    <div
      draggable={!!onDragStart}
      onDragStart={onDragStart}
      className="select-none cursor-grab active:cursor-grabbing transition-all"
      style={{ background: G.surface, border: `1px solid ${G.border}`, padding: '16px' }}
    >
      <div className="flex items-start gap-3 mb-3">
        <PlayerHeadshot personId={player.person_id} size={80} initial={player.position?.[0]} />
        <div className="flex-1 flex items-start justify-between min-w-0">
          <div className="min-w-0">
            <div className="font-bold text-white text-base leading-tight truncate">{player.full_name}</div>
            <div className="text-xs mt-0.5 uppercase tracking-wide" style={{ color: G.grey }}>
              {player.position} · {eraLabel(player.era)} · {displayEra ? playerTeamForEra(player, displayEra) : player.team_abbreviation}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 ml-2 shrink-0">
            {player.greatest_75_flag === 'Y' && (
              <span className="text-xs px-1.5 py-0.5 uppercase tracking-wide" style={{ color: G.gold, border: `1px solid ${G.goldDim}`, background: `${G.gold}12` }}>
                75 Greatest
              </span>
            )}
            {(player.rings ?? 0) > 0 && (
              <span className="text-xs uppercase tracking-wide" style={{ color: G.gold, letterSpacing: '0.08em' }}>
                {player.rings}× Champion
              </span>
            )}
            {player.flexPositions && (
              <span className="text-xs px-1.5 py-0.5 uppercase tracking-wide font-bold" style={{ color: '#4A9ECC', border: `1px solid #2A6E99`, background: `#4A9ECC18` }}>
                FLEX
              </span>
            )}
            {activeEra && player.stats_by_era?.[activeEra] && (
              <span className="text-xs px-1.5 py-0.5 uppercase tracking-wide" style={{ color: G.grey, border: `1px solid ${G.border}` }}>
                {eraLabel(activeEra)} stats
              </span>
            )}
            {player.imputed_stats && player.imputed_stats.length > 0 && (
              <span className="text-xs px-1.5 py-0.5 uppercase tracking-wide" style={{ color: G.greyDark, border: `1px solid ${G.border}` }}>
                ~ est.
              </span>
            )}
          </div>
        </div>
      </div>
      {/* Big three */}
      <div className="grid grid-cols-3 gap-px mb-3" style={{ background: G.border }}>
        {[['PTS', player.PTS], ['REB', player.REB], ['AST', player.AST]].map(([k, v]) => (
          <div key={String(k)} className="text-center py-3" style={{ background: G.surface2 }}>
            <div className="text-2xl font-bold" style={{ ...BEBAS, color: G.gold, letterSpacing: '0.05em' }}>{Number(v).toFixed(1)}</div>
            <div className="text-xs" style={{ color: G.greyDark }}>{k}</div>
          </div>
        ))}
      </div>
      {/* Secondary stats */}
      <div className="grid grid-cols-4 gap-px mb-px" style={{ background: G.border }}>
        {[
          ['TS%', ts + '%', false],
          ['FG%', ((player.FG_PCT ?? 0) * 100).toFixed(1) + '%', false],
          ['3P%', ((player.FG3_PCT ?? 0) * 100).toFixed(1) + '%', false],
          ['STL', fmt('STL', player.STL?.toFixed(1)), imp('STL')],
        ].map(([k, v, isEst]) => (
          <div key={String(k)} className="text-center py-2" style={{ background: G.surface }}>
            <div className="text-xs font-medium" style={{ color: isEst ? G.grey : G.white }}>{v}</div>
            <div className="text-xs" style={{ color: G.greyDark }}>{k}</div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-4 gap-px" style={{ background: G.border }}>
        {[
          ['BLK', fmt('BLK', player.BLK?.toFixed(1)), imp('BLK')],
          ['TOV', fmt('TOV', player.TOV?.toFixed(1)), imp('TOV')],
          ['HT',  player.height, false],
          ['WT',  player.weight, false],
        ].map(([k, v, isEst]) => (
          <div key={String(k)} className="text-center py-2" style={{ background: G.surface }}>
            <div className="text-xs font-medium" style={{ color: isEst ? G.grey : G.white }}>{v}</div>
            <div className="text-xs" style={{ color: G.greyDark }}>{k}</div>
          </div>
        ))}
      </div>
      <div className="mt-2 text-xs text-center" style={{ color: G.greyDark }}>
        {(() => {
          if (!activeEra) return `${player.from_year}–${player.to_year ?? 'present'}`
          const eraStart = ({ '50s':1950,'60s':1960,'70s':1970,'80s':1980,'90s':1990,'00s':2000,'10s':2010,'20s':2020 } as Record<string,number>)[activeEra]
          const from = Math.max(player.from_year, eraStart)
          const careerEnd = player.to_year ?? 9999
          const to = Math.min(careerEnd, eraStart + 9)
          const stillActive = player.to_year == null && activeEra === '20s'
          return `${from}–${stillActive ? 'present' : to}`
        })()}
      </div>
    </div>
  )
}

// ─── Court slot ───────────────────────────────────────────────────────────────
function CourtSlotView({ slot, onClick, onDrop, highlighted, pendingPlayer, activePlayer, simEra }: {
  slot: CourtSlot; onClick: () => void; onDrop: () => void; highlighted: boolean
  pendingPlayer?: Player | null; activePlayer?: Player | null; simEra?: Era
}) {
  const [dragOver, setDragOver] = useState(false)
  const confirmed = slot.player
  const isPending = !confirmed && !!pendingPlayer

  const { label: pendingFitLabel } = pendingPlayer ? calcFitPenalty(pendingPlayer, slot.position) : { label: null }

  // When a player is selected, compute fit for this slot to drive glow
  const activeFit = (activePlayer && !confirmed)
    ? calcFitPenalty(activePlayer, slot.position)
    : null

  const fitLabelColor = (label: string | null) =>
    label === 'Position Fit' ? G.gold : label?.includes('10%') ? '#C9A030' : label?.includes('25%') ? G.red : G.grey

  const fitBorder = confirmed
    ? slot.fitLabel === 'Position Fit' ? G.gold : slot.fitLabel?.includes('10%') ? G.grey : G.red
    : activeFit
      ? activeFit.penalty === 0   ? G.gold
        : activeFit.penalty === 0.10 ? '#8B6914'
        : '#7A2020'
    : dragOver ? G.goldDim
    : G.border

  const fitGlow = activeFit
    ? activeFit.penalty === 0    ? '0 0 18px rgba(201,168,76,0.7), 0 0 6px rgba(201,168,76,0.4)'
      : activeFit.penalty === 0.10 ? '0 0 8px rgba(180,130,20,0.25)'
      : '0 0 8px rgba(204,51,51,0.35)'
    : 'none'

  return (
    <div
      className={`relative cursor-pointer court-slot${confirmed ? ' court-slot--filled' : ''}`}
      style={{
        minHeight: 140,
        background: isPending ? `${G.gold}0a` : confirmed ? G.surface : G.black,
        border: `1px solid ${fitBorder}`,
        outline: isPending ? `1px solid ${G.goldDim}` : 'none',
        outlineOffset: '-3px',
        boxShadow: confirmed ? 'none' : fitGlow,
        transition: 'box-shadow 0.15s ease, border-color 0.15s ease',
      }}
      onClick={onClick}
      onDragOver={e => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={() => { setDragOver(false); onDrop() }}
    >
      {/* Position label + minutes */}
      <div className="absolute top-1 left-1.5" style={{ lineHeight: 1 }}>
        <div style={{ ...BEBAS, color: G.goldDim, fontSize: 11, letterSpacing: '0.1em' }}>
          {slot.position}
        </div>
        <div style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: 8, color: G.grey, letterSpacing: '0.05em', marginTop: 1 }}>
          {SLOT_MPG[slot.position]} MIN
        </div>
      </div>

      {/* Fit indicator badge on empty slots when player is selected */}
      {activeFit && !isPending && (
        <div className="absolute top-1 right-1.5" style={{
          fontSize: 8,
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: fitLabelColor(activeFit.label),
          opacity: 0.9,
        }}>
          {activeFit.penalty === 0 ? '✓' : activeFit.penalty === 0.10 ? '−10%' : '−25%'}
        </div>
      )}

      {confirmed ? (
        <div className="flex flex-col items-center px-2 pb-2 pt-5 gap-1.5">
          <PlayerHeadshot personId={confirmed.person_id} size={52} initial={confirmed.position?.[0]} />
          <div className="w-full text-center min-w-0">
            <div className="font-semibold text-white leading-tight truncate" style={{ fontSize: 11 }}>{confirmed.full_name}</div>
            <div style={{ color: G.grey, fontSize: 10 }} className="mt-0.5 truncate">{confirmed.position} · {eraLabel(confirmed.era)}</div>
            <div className="flex justify-center gap-2 mt-1" style={{ fontSize: 11 }}>
              <span style={{ color: G.gold, fontWeight: 700 }}>{confirmed.PTS?.toFixed(1)}</span>
              <span style={{ color: G.grey }}>{confirmed.REB?.toFixed(1)}r</span>
              <span style={{ color: G.grey }}>{confirmed.AST?.toFixed(1)}a</span>
            </div>
            {slot.fitLabel && <div className="mt-1" style={{ fontSize: 10, color: fitLabelColor(slot.fitLabel) }}>{slot.fitLabel}</div>}
            {simEra && (() => { const mod = calcEraModifier(confirmed, simEra); return (
              <div className="mt-0.5" style={{ fontSize: 9, color: mod >= 1.0 ? G.gold : mod >= 0.75 ? G.grey : G.red, letterSpacing: '0.05em' }}>
                Era Fit {Math.round(mod * 100)}%
              </div>
            ) })()}
            {confirmed.flexPositions && <div className="mt-1" style={{ fontSize: 10, fontWeight: 700, color: '#4A9ECC', letterSpacing: '0.08em' }}>FLEX</div>}
          </div>
        </div>
      ) : isPending && pendingPlayer ? (
        <div className="flex flex-col items-center px-2 pb-2 pt-5 gap-1.5" style={{ opacity: 0.7 }}>
          <PlayerHeadshot personId={pendingPlayer.person_id} size={52} initial={pendingPlayer.position?.[0]} />
          <div className="w-full text-center min-w-0">
            <div className="font-semibold text-white leading-tight truncate" style={{ fontSize: 11 }}>{pendingPlayer.full_name}</div>
            <div style={{ color: G.grey, fontSize: 10 }} className="mt-0.5">{pendingPlayer.position} · {eraLabel(pendingPlayer.era)}</div>
            {pendingFitLabel && <div className="mt-1" style={{ fontSize: 10, color: fitLabelColor(pendingFitLabel) }}>{pendingFitLabel}</div>}
            {simEra && (() => { const mod = calcEraModifier(pendingPlayer, simEra); return (
              <div className="mt-0.5" style={{ fontSize: 9, color: mod >= 1.0 ? G.gold : mod >= 0.75 ? G.grey : G.red, letterSpacing: '0.05em' }}>
                Era Fit {Math.round(mod * 100)}%
              </div>
            ) })()}
            <div style={{ fontSize: 10, color: G.goldDim }} className="mt-1">pending</div>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center" style={{ height: 120 }}>
          <span className="text-xs" style={{ color: activeFit ? fitLabelColor(activeFit.label) : highlighted ? G.goldDim : G.greyDark }}>
            {activeFit ? '+ place here' : highlighted ? '+ place here' : '—'}
          </span>
        </div>
      )}
    </div>
  )
}

const ERA_YEARS: Record<Era, string> = {
  '50s': '1950–1959', '60s': '1960–1969', '70s': '1970–1979', '80s': '1980–1989',
  '90s': '1990–1999', '00s': '2000–2009', '10s': '2010–2019', '20s': '2020–present',
}

const ERA_DESC: Record<Era, { style: string; note: string }> = {
  '50s': { style: 'Slow, physical, half-court basketball. No 3-point line, and very low scoring. Big men ruled the paint.', note: 'Pre-3pt · Modern shooters lose value here' },
  '60s': { style: 'Dominant big men, intense defense. Bill Russell era. Athleticism beginning to shape the game.', note: 'Pre-3pt · Modern shooters lose value here' },
  '70s': { style: 'ABA Merger. Brutal physical defense. Kareem\'s sky hook.', note: 'Pre-3pt · Modern shooters lose value here' },
  '80s': { style: '3-point line introduced in the league. Magic vs Bird.', note: '3pt era begins · Pre-3pt bigs take a cut' },
  '90s': { style: 'All time Defenses. Hand-checking allowed. The Jordan era.', note: 'Defense Era · Most eras cross over cleanly' },
  '00s': { style: 'Post-Jordan transition. the Shaq and Kobe Era. Rising international talent.', note: 'Bridge era · Minimal penalties most directions' },
  '10s': { style: '3-point volume surges. Steph vs Lebron. Rise of Positionless basketball.', note: 'Near-modern · Very low era penalties' },
  '20s': { style: 'Peak spacing, pace, and 3-point volume. Versatility is everything. Old-school bigs and pre-3pt era (50s/60s/70s) players struggle most here.', note: 'Current era · 2020s players at full strength' },
}

// ─── How To Play modal ────────────────────────────────────────────────────────
const HOW_TO_PLAY_STEPS = [
  {
    title: 'Pick Your Era',
    body: 'Choose a decade — 50s through 20s — or hit Random. Your team will be built from players active in that era, but legends from other eras can appear too.',
  },
  {
    title: 'Spin to Draft',
    body: 'Each spin lands on a franchise and era. Pick 1 of 3 players from that team\'s roster for your open slot. You get one respin for the entire draft — use it wisely.',
  },
  {
    title: 'Fill 9 Spots',
    body: '5 starters (PG · SG · SF · PF · C) and 4 bench spots. Starters get more minutes and carry more weight in your team rating.',
  },
  {
    title: 'Positional Fit',
    body: 'Playing a player at their natural position = no penalty. One position off = −10%. Way out of position = −25%. FLEX players (LeBron, Jokić, Giannis, etc.) can play multiple spots with no penalty.',
  },
  {
    title: 'Era Modifier',
    body: 'Players perform best in their home decade. Each era away from home = −5% rating, capped at −15%. Pre-3PT era players (50s–70s) face an extra penalty in modern 3-point heavy simulations.',
  },
  {
    title: 'Draft a Coach',
    body: 'Your coach has Offense and Defense grades (A–F). A good offensive coach boosts scoring; a great defensive coach limits opponents. Guru tags (OFF GURU / DEF GURU) guarantee an A in that category.',
  },
  {
    title: 'Simulate the Season',
    body: 'Your team plays an 82-game season. Make the playoffs (41+ wins) and you\'ll compete in a 4-round bracket. Win 4 rounds to become champions.',
  },
  {
    title: 'Awards',
    body: 'Season awards — MVP, All-NBA, All-Star, Defensive POY, 6th Man — are handed out based on your players\' stats. Finals MVP goes to your best performer in the championship round.',
  },
]

function HowToPlayModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
      onClick={onClose}
    >
      <div
        style={{ background: G.surface, border: `1px solid ${G.border}`, maxWidth: 560, width: '100%', maxHeight: '85vh', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: `1px solid ${G.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ ...BEBAS, fontSize: 28, color: G.gold, letterSpacing: '0.2em' }}>HOW TO PLAY</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: G.grey, fontSize: 22, cursor: 'pointer', lineHeight: 1, padding: '0 4px' }}>×</button>
        </div>
        {/* Steps */}
        <div style={{ padding: '16px 24px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {HOW_TO_PLAY_STEPS.map((s, i) => (
            <div key={i} style={{ display: 'flex', gap: 16 }}>
              <div style={{ ...BEBAS, fontSize: 22, color: G.gold, letterSpacing: '0.1em', width: 24, flexShrink: 0, paddingTop: 1 }}>{i + 1}</div>
              <div>
                <div style={{ ...BEBAS, fontSize: 16, color: G.white, letterSpacing: '0.15em', marginBottom: 4 }}>{s.title}</div>
                <div style={{ fontSize: 13, color: G.grey, lineHeight: 1.6 }}>{s.body}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Shared top bar ───────────────────────────────────────────────────────────
function TopBar({ onRestart, right }: { onRestart: () => void; right?: React.ReactNode }) {
  const [showHelp, setShowHelp] = useState(false)
  return (
    <>
      <div style={{ borderBottom: `1px solid ${G.border}`, background: G.surface }}>
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <button onClick={onRestart} className="logo-btn" style={{ ...BEBAS, fontSize: 22, letterSpacing: '0.3em', color: G.gold, cursor: 'pointer', background: 'none', border: 'none', padding: 0 }}>
            ERA BALL
          </button>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setShowHelp(true)}
              className="text-xs uppercase tracking-widest"
              style={{ background: 'none', border: `1px solid ${G.border}`, color: G.grey, padding: '4px 12px', cursor: 'pointer', letterSpacing: '0.2em' }}
            >
              How to Play
            </button>
            <div className="text-xs uppercase tracking-widest" style={{ color: G.grey }}>
              {right ?? 'Basketball Draft Simulator'}
            </div>
          </div>
        </div>
      </div>
      {showHelp && <HowToPlayModal onClose={() => setShowHelp(false)} />}
    </>
  )
}

// ─── Phase 1: Era Selection ───────────────────────────────────────────────────
function EraSelection({ onEraSelected, onRestart }: { onEraSelected: (era: Era) => void; onRestart: () => void }) {
  const [spinning, setSpinning] = useState(false)
  const [era, setEra] = useState<Era | null>(null)
  const [displayEra, setDisplayEra] = useState<Era | null>(null)
  const [spinKey, setSpinKey] = useState(0)
  const [spinPhase, setSpinPhase] = useState<'fast' | 'slow' | 'land'>('fast')

  const spinRandom = () => {
    setSpinning(true)
    setEra(null)
    const schedule = [
      ...Array(10).fill(65),
      ...Array(5).fill(120),
      ...Array(3).fill(220),
    ]
    let ticks = 0
    const doTick = () => {
      const phase: 'fast' | 'slow' = ticks < 10 ? 'fast' : 'slow'
      setSpinPhase(phase)
      setDisplayEra(ALL_ERAS[Math.floor(Math.random() * ALL_ERAS.length)])
      setSpinKey(k => k + 1)
      if (ticks < schedule.length) {
        setTimeout(doTick, schedule[ticks++])
      } else {
        const picked = ALL_ERAS[Math.floor(Math.random() * ALL_ERAS.length)]
        setSpinPhase('land')
        setSpinKey(k => k + 1)
        setDisplayEra(picked)
        setEra(picked)
        setTimeout(() => setSpinning(false), 350)
      }
    }
    doTick()
  }

  const selectEra = (e: Era) => {
    if (spinning) return
    setEra(e)
    setDisplayEra(e)
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: G.black }}>
      <TopBar onRestart={onRestart} />

      <div className="flex-1 flex flex-col items-center justify-center px-4 gap-10">
        {/* Selected era display */}
        <div className="text-center" style={{ minHeight: displayEra ? 140 : 0 }}>
          {displayEra ? (
            <>
              <div className="text-xs uppercase tracking-[0.4em] mb-2" style={{ color: G.grey }}>Simulation Era</div>
              <div
                style={{
                  ...BEBAS,
                  fontSize: 'clamp(80px, 18vw, 160px)',
                  lineHeight: 0.9,
                  color: spinning ? G.greyDark : G.white,
                  letterSpacing: '0.02em',
                }}
              >
                <span className="slot-reel-window">
                  <span
                    key={spinKey}
                    className={spinning || spinPhase === 'land' ? `slot-reel${spinPhase === 'slow' ? ' slot-reel--slow' : spinPhase === 'land' ? ' slot-reel--land' : ''}` : ''}
                  >
                    {eraLabel(displayEra)}
                  </span>
                </span>
              </div>
              {!spinning && era && (
                <>
                  <div className="mt-3 text-xs uppercase tracking-[0.3em]" style={{ color: G.goldDim }}>
                    {ERA_YEARS[era]}
                  </div>
                  <div className="mt-4 max-w-xs mx-auto" style={{ fontSize: 13, color: G.grey, lineHeight: 1.6 }}>
                    {ERA_DESC[era].style}
                  </div>
                  <div className="mt-3 inline-block px-3 py-1" style={{
                    fontSize: 10,
                    letterSpacing: '0.18em',
                    textTransform: 'uppercase',
                    color: G.goldDim,
                    border: `1px solid ${G.goldDim}`,
                  }}>
                    {ERA_DESC[era].note}
                  </div>
                </>
              )}
            </>
          ) : null}
        </div>

        {/* Era grid */}
        <div className="w-full max-w-sm">
          {!displayEra && (
            <div className="text-center mb-4" style={{ ...BEBAS, fontSize: 20, letterSpacing: '0.25em', color: G.greyDark }}>
              Select an era
            </div>
          )}
          <div className="grid grid-cols-4 gap-2">
          {ALL_ERAS.map(e => (
            <button
              key={e}
              onClick={() => selectEra(e)}
              disabled={spinning}
              className={`py-4 era-btn${era === e ? ' era-btn--active' : ''}`}
              style={{
                ...BEBAS,
                fontSize: 22,
                letterSpacing: '0.08em',
                background: era === e ? G.gold : G.surface,
                border: `1px solid ${era === e ? G.gold : G.border}`,
                color: era === e ? G.black : G.grey,
                cursor: spinning ? 'not-allowed' : 'pointer',
                opacity: spinning ? 0.4 : 1,
              }}
            >
              {eraLabel(e)}
            </button>
          ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col items-center gap-3">
          <Btn onClick={spinRandom} disabled={spinning} variant="ghost" className="w-48 py-3">
            {spinning ? 'Spinning...' : 'Random'}
          </Btn>
          {era && !spinning && (
            <Btn onClick={() => onEraSelected(era)} variant="gold" className="w-48 py-4 text-base">
              Begin Draft
            </Btn>
          )}
        </div>
      </div>

      <div className="px-8 pb-8 text-xs uppercase tracking-widest text-center" style={{ color: G.greyDark }}>
        Draft across decades
      </div>
    </div>
  )
}

// ─── Phase 2: Draft ───────────────────────────────────────────────────────────
function DraftScreen({ simEra, players, onDraftComplete, onRestart }: {
  simEra: Era; players: Player[]; onDraftComplete: (slots: CourtSlot[]) => void; onRestart: () => void
}) {
  const [slots, setSlots] = useState<CourtSlot[]>(emptySlots())
  const [spinning, setSpinning] = useState(false)
  const [rosterPool, setRosterPool] = useState<Player[]>([])
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null)
  const [pendingSlotIdx, setPendingSlotIdx] = useState<number | null>(null)
  const [highlightEmpty, setHighlightEmpty] = useState(false)
  const [spinTeamDisplay, setSpinTeamDisplay] = useState('')
  const [spinEraDisplay, setSpinEraDisplay] = useState<Era>('90s')
  const [spinKey, setSpinKey] = useState(0)
  const [spinPhase, setSpinPhase] = useState<'fast' | 'slow' | 'land'>('fast')
  const [lockedTeam, setLockedTeam] = useState('')
  const [lockedEra, setLockedEra] = useState<Era | null>(null)
  const [draftedIds, setDraftedIds] = useState<Set<string>>(new Set())
  const [awaitingSpin, setAwaitingSpin] = useState(false)
  const [noPlayersMsg, setNoPlayersMsg] = useState(false)
  const [spinsThisRound, setSpinsThisRound] = useState(0)
  const [respinUsed, setRespinUsed] = useState(false)
  const [devMode, setDevMode] = useState(false)
  const [devTeam, setDevTeam] = useState(NBA_TEAMS[0])
  const [devEra, setDevEra] = useState<Era>(ALL_ERAS[6]) // default 10s

  const filledCount = slots.filter(s => s.player !== null).length

  // All team abbreviations for the animation flythrough display
  const allTeams = useMemo(() => {
    const teams = new Set<string>()
    for (const p of players) {
      for (const teamList of Object.values(p.all_teams_by_era ?? {})) {
        for (const t of (teamList as string[])) { if (t) teams.add(t) }
      }
      // fallback for old data without all_teams_by_era
      for (const t of Object.values(p.teams_by_era ?? {})) { if (t) teams.add(t) }
      if (p.team_abbreviation) teams.add(p.team_abbreviation)
    }
    return Array.from(teams).sort()
  }, [players])

  // Only spin from combos that actually have players — eliminates empty-combo failures.
  // Falls back to teams_by_era when all_teams_by_era is absent (pre-pipeline-rerun data).
  const validCombos = useMemo(() => {
    const seen = new Set<string>()
    const combos: { team: string; era: Era }[] = []
    for (const p of players) {
      const allTeamsByEra = p.all_teams_by_era
      if (allTeamsByEra && Object.keys(allTeamsByEra).length > 0) {
        for (const [era, teamList] of Object.entries(allTeamsByEra)) {
          for (const team of (teamList as string[])) {
            if (!team) continue
            const key = `${team}:${era}`
            if (!seen.has(key)) { seen.add(key); combos.push({ team, era: era as Era }) }
          }
        }
      } else {
        for (const [era, team] of Object.entries(p.teams_by_era ?? {})) {
          if (!team) continue
          const key = `${team}:${era}`
          if (!seen.has(key)) { seen.add(key); combos.push({ team, era: era as Era }) }
        }
      }
    }
    return combos
  }, [players])

  const spin = useCallback(() => {
    if (rosterPool.length > 0) { setSpinsThisRound(prev => prev + 1); setRespinUsed(true) }
    setSpinning(true)
    setAwaitingSpin(false)
    setNoPlayersMsg(false)
    setRosterPool([])
    setSelectedPlayer(null)
    setPendingSlotIdx(null)
    setHighlightEmpty(false)
    // Slot machine: fast → slow → land
    const schedule = [
      ...Array(10).fill(65),   // fast
      ...Array(5).fill(120),   // slowing
      ...Array(3).fill(220),   // crawling
    ]
    let ticks = 0
    const doTick = () => {
      const phase = ticks < 10 ? 'fast' : ticks < 15 ? 'slow' : 'slow'
      setSpinPhase(phase)
      setSpinTeamDisplay(allTeams[Math.floor(Math.random() * allTeams.length)])
      setSpinEraDisplay(ALL_ERAS[Math.floor(Math.random() * ALL_ERAS.length)])
      setSpinKey(k => k + 1)
      if (ticks < schedule.length) {
        setTimeout(doTick, schedule[ticks++])
      } else {
        // Land
        if (validCombos.length === 0) { setSpinning(false); return }
        const { team, era } = validCombos[Math.floor(Math.random() * validCombos.length)]
        setSpinPhase('land')
        setSpinTeamDisplay(team); setSpinEraDisplay(era)
        setSpinKey(k => k + 1)
        setDraftedIds(ids => {
          const pool = players.filter(p => {
            const allTeams = p.all_teams_by_era?.[era] as string[] | undefined
            const onTeam = allTeams ? allTeams.includes(team) : playerTeamForEra(p, era) === team
            return onTeam && playerMatchesEra(p, era) && !ids.has(p.person_id)
          })
          if (pool.length < 3) {
            setSpinning(false)
            setNoPlayersMsg(true)
            return ids
          }
          setLockedTeam(team); setLockedEra(era)
          setRosterPool([...pool].map(p => applyRings(applyFlexTag(withEraStats(p, era, team)))).sort((a, b) => (b.PTS ?? 0) - (a.PTS ?? 0)))
          setSpinning(false)
          return ids
        })
      }
    }
    setTimeout(doTick, schedule[ticks++])
  }, [players, allTeams, validCombos, rosterPool, respinUsed])

  const previewSlot = (idx: number) => {
    if (!selectedPlayer || slots[idx].player !== null) return
    setPendingSlotIdx(idx)
  }

  const confirmPick = () => {
    if (pendingSlotIdx === null || !selectedPlayer) return
    // selectedPlayer already has era stats applied from when the pool was built
    const { penalty, label } = calcFitPenalty(selectedPlayer, slots[pendingSlotIdx].position)
    setSlots(prev => prev.map((s, i) => i === pendingSlotIdx ? { ...s, player: selectedPlayer, fitPenalty: penalty, fitLabel: label } : s))
    setDraftedIds(prev => new Set([...prev, selectedPlayer.person_id]))
    setRosterPool([])
    setSelectedPlayer(null); setPendingSlotIdx(null); setHighlightEmpty(false)
    setSpinsThisRound(0)
    setAwaitingSpin(true)
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && pendingSlotIdx !== null && selectedPlayer) confirmPick()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [pendingSlotIdx, selectedPlayer])

  const loadDevRoster = () => {
    setDraftedIds(ids => {
      const pool = players.filter(p => {
        const allTeams = p.all_teams_by_era?.[devEra] as string[] | undefined
        const onTeam = allTeams ? allTeams.includes(devTeam) : playerTeamForEra(p, devEra) === devTeam
        return onTeam && playerMatchesEra(p, devEra) && !ids.has(p.person_id)
      })
      if (pool.length === 0) { alert(`No players found for ${devTeam} / ${devEra}`); return ids }
      const sorted = [...pool].map(p => applyFlexTag(withEraStats(p, devEra, devTeam))).sort((a, b) => (b.PTS ?? 0) - (a.PTS ?? 0))
      setLockedTeam(devTeam); setLockedEra(devEra)
      setSpinTeamDisplay(devTeam); setSpinEraDisplay(devEra)
      setRosterPool(sorted)
      setSelectedPlayer(null); setPendingSlotIdx(null); setHighlightEmpty(false); setAwaitingSpin(false)
      return ids
    })
  }

  const fillBestNine = () => {
    const scored = players.map(p => ({
      p,
      score: (p.PTS ?? 0) * calcEraModifier(p as Player & { era: Era }, simEra),
    }))
    const top9 = scored
      .sort((a, b) => b.score - a.score)
      .slice(0, 9)
      .map(({ p }) => applyRings(applyFlexTag(withEraStats(p, p.era as Era, p.team_abbreviation))))
    const newSlots = SLOT_POSITIONS.map((pos, i) => {
      const { penalty, label } = calcFitPenalty(top9[i], pos)
      return { position: pos, player: top9[i], fitPenalty: penalty, fitLabel: label }
    })
    setSlots(newSlots)
    setDraftedIds(new Set(top9.map(p => p.person_id)))
    setSelectedPlayer(null); setPendingSlotIdx(null); setHighlightEmpty(false)
    setRosterPool([]); setAwaitingSpin(false)
  }

  const fillRandom = () => {
    const shuffled = [...players].sort(() => Math.random() - 0.5)
    const picks = shuffled.slice(0, 9)
    const newSlots = SLOT_POSITIONS.map((pos, i) => {
      const player = applyRings(applyFlexTag(withEraStats(picks[i], picks[i].era as Era, picks[i].team_abbreviation)))
      const { penalty, label } = calcFitPenalty(player, pos)
      return { position: pos, player, fitPenalty: penalty, fitLabel: label }
    })
    setSlots(newSlots)
    setDraftedIds(new Set(picks.map(p => p.person_id)))
    setSelectedPlayer(null); setPendingSlotIdx(null); setHighlightEmpty(false)
    setRosterPool([]); setAwaitingSpin(false)
  }

  const starterSlots = slots.slice(0, 5)
  const benchSlots = slots.slice(5)

  return (
    <div className="min-h-screen" style={{ background: G.black }}>
      {/* Header bar */}
      <TopBar onRestart={onRestart} right={
        <div className="flex items-center gap-4">
          <span style={{ color: G.grey }}>
            Era: <span style={{ color: G.gold }}>{eraLabel(simEra)}</span>
            <span className="mx-3" style={{ color: G.border }}>|</span>
            Picks: <span style={{ color: filledCount === 9 ? G.gold : G.white }}>{filledCount}/9</span>
          </span>
          <button
            onClick={() => setDevMode(d => !d)}
            className={`text-xs uppercase tracking-widest px-2 py-1 dev-btn${devMode ? ' dev-btn--active' : ''}`}
            style={{
              color: devMode ? G.black : G.greyDark,
              background: devMode ? G.gold : 'transparent',
              border: `1px solid ${devMode ? G.gold : G.border}`,
            }}
            title="Developer mode — pick team/era directly"
          >DEV</button>
        </div>
      } />

      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.4fr] gap-6">

          {/* ── Left: Spin Panel ── */}
          <div className="space-y-4">

            {devMode ? (
              /* ── Dev mode: manual team/era picker ── */
              <div style={{ border: `1px solid ${G.gold}33`, background: G.surface }}>
                <div className="px-3 py-2 flex items-center gap-2" style={{ borderBottom: `1px solid ${G.border}`, background: `${G.gold}0a` }}>
                  <span className="text-xs uppercase tracking-widest" style={{ color: G.gold }}>Dev Mode</span>
                  <span className="text-xs" style={{ color: G.greyDark }}>— pick any team / era directly</span>
                </div>
                <div className="p-3 space-y-3">
                  <div>
                    <div className="text-xs uppercase tracking-widest mb-1" style={{ color: G.grey }}>Team</div>
                    <select
                      value={devTeam}
                      onChange={e => setDevTeam(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-semibold"
                      style={{ background: G.surface2, border: `1px solid ${G.border}`, color: G.white, outline: 'none' }}
                    >
                      {allTeams.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-widest mb-1" style={{ color: G.grey }}>Era</div>
                    <select
                      value={devEra}
                      onChange={e => setDevEra(e.target.value as Era)}
                      className="w-full px-3 py-2 text-sm font-semibold"
                      style={{ background: G.surface2, border: `1px solid ${G.border}`, color: G.gold, outline: 'none' }}
                    >
                      {ALL_ERAS.map(e => <option key={e} value={e}>{e}</option>)}
                    </select>
                  </div>
                  <Btn onClick={loadDevRoster} variant="outline" className="w-full py-3">
                    Load Roster
                  </Btn>
                  <Btn onClick={fillBestNine} variant="gold" className="w-full py-3">
                    Best 9
                  </Btn>
                  <Btn onClick={fillRandom} variant="ghost" className="w-full py-3">
                    Random Fill
                  </Btn>
                </div>

              </div>
            ) : (
              /* ── Normal spin panel ── */
              <>
                <div className="grid grid-cols-2 gap-px" style={{ background: G.border }}>
                  <div className="py-5 text-center" style={{ background: G.surface }}>
                    <div className="text-xs uppercase tracking-[0.2em] mb-2" style={{ color: G.grey }}>Team</div>
                    <div style={{ ...BEBAS, fontSize: 36, color: spinning ? G.greyDark : G.white, letterSpacing: '0.05em' }}>
                      <span className="slot-reel-window">
                        <span
                          key={`team-${spinKey}`}
                          className={spinning || spinPhase === 'land' ? `slot-reel${spinPhase === 'slow' ? ' slot-reel--slow' : spinPhase === 'land' ? ' slot-reel--land' : ''}` : ''}
                        >
                          {spinTeamDisplay || '—'}
                        </span>
                      </span>
                    </div>
                  </div>
                  <div className="py-5 text-center" style={{ background: G.surface }}>
                    <div className="text-xs uppercase tracking-[0.2em] mb-2" style={{ color: G.grey }}>Era</div>
                    <div style={{ ...BEBAS, fontSize: 36, color: spinning ? G.greyDark : G.gold, letterSpacing: '0.05em' }}>
                      <span className="slot-reel-window">
                        <span
                          key={`era-${spinKey}`}
                          className={spinning || spinPhase === 'land' ? `slot-reel${spinPhase === 'slow' ? ' slot-reel--slow' : spinPhase === 'land' ? ' slot-reel--land' : ''}` : ''}
                        >
                          {spinEraDisplay ? eraLabel(spinEraDisplay) : '—'}
                        </span>
                      </span>
                    </div>
                  </div>
                </div>
                <Btn
                  onClick={spin}
                  disabled={spinning || (rosterPool.length > 0 && respinUsed)}
                  variant="gold"
                  className={`w-full py-4 text-base${awaitingSpin ? ' spin-awaiting' : ''}`}
                >
                  {spinning ? 'Spinning...' : 'Spin'}
                </Btn>
                {awaitingSpin && !spinning && (
                  <div className="text-center text-xs uppercase tracking-[0.2em]" style={{ color: G.goldDim }}>
                    Spin for your next pick
                  </div>
                )}
                {!awaitingSpin && !spinning && !respinUsed && rosterPool.length > 0 && (
                  <div className="text-center text-xs uppercase tracking-[0.2em]" style={{ color: G.goldDim }}>
                    1 re-spin remaining this draft
                  </div>
                )}
                {!awaitingSpin && !spinning && respinUsed && rosterPool.length > 0 && (
                  <div className="text-center text-xs uppercase tracking-[0.2em]" style={{ color: G.grey }}>
                    No re-spins left — pick from this roster
                  </div>
                )}
                {noPlayersMsg && !spinning && (
                  <div className="text-center text-xs uppercase tracking-[0.2em]" style={{ color: G.red }}>
                    All players from this combo drafted — spin again
                  </div>
                )}
              </>
            )}

            {/* Roster list — only shown after a fresh spin, not while awaiting */}
            {rosterPool.length > 0 && !awaitingSpin && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <GoldLabel>{lockedTeam} · {lockedEra ? eraLabel(lockedEra) : ''}</GoldLabel>
                  <GoldLabel>{rosterPool.length} available</GoldLabel>
                </div>
                <div style={{ border: `1px solid ${G.border}`, maxHeight: 220, overflowY: 'auto' }}>
                  {rosterPool.map(p => {
                    const ts = (calcTS(p) * 100).toFixed(1)
                    const isSel = selectedPlayer?.person_id === p.person_id
                    return (
                      <button
                        key={p.person_id}
                        onClick={() => { setSelectedPlayer(p); setHighlightEmpty(true); setPendingSlotIdx(null) }}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 text-left roster-row${isSel ? ' roster-row--selected' : ''}`}
                        style={{
                          background: isSel ? `${G.gold}18` : G.surface,
                          borderBottom: `1px solid ${G.borderSub}`,
                          borderLeft: isSel ? `2px solid ${G.gold}` : '2px solid transparent',
                        }}
                      >
                        <PlayerHeadshot personId={p.person_id} size={36} initial={p.position?.[0]} />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold text-white truncate">{p.full_name}</div>
                          <div className="text-xs" style={{ color: G.grey }}>{p.position}</div>
                        </div>
                        <div className="flex gap-3 text-xs shrink-0">
                          <span style={{ color: G.gold, fontWeight: 700 }}>{p.PTS?.toFixed(1)}</span>
                          <span style={{ color: G.grey }}>{p.REB?.toFixed(1)}</span>
                          <span style={{ color: G.grey }}>{p.AST?.toFixed(1)}</span>
                          <span style={{ color: G.greyDark }}>{ts}%</span>
                        </div>
                      </button>
                    )
                  })}
                </div>
                <div className="text-xs mt-1 text-right" style={{ color: G.greyDark }}>PTS · REB · AST · TS%</div>
              </div>
            )}

            {/* Selected player card */}
            {selectedPlayer && (
              <div className="space-y-2">
                <GoldLabel>
                  {pendingSlotIdx !== null
                    ? `→ ${slots[pendingSlotIdx].position} — confirm or choose another slot`
                    : 'Click a court slot to place'}
                </GoldLabel>
                <PlayerCard player={selectedPlayer} displayEra={lockedEra ?? undefined} activeEra={lockedEra ?? undefined} />
                {pendingSlotIdx !== null && (
                  <Btn onClick={confirmPick} variant="gold" className="w-full py-3">
                    Confirm — {slots[pendingSlotIdx].position}
                  </Btn>
                )}
              </div>
            )}

            {rosterPool.length === 0 && !spinning && !awaitingSpin && filledCount === 0 && (
              <div className="text-center py-10 text-xs uppercase tracking-widest" style={{ color: G.greyDark }}>
                Hit Spin to see a roster
              </div>
            )}
          </div>

          {/* ── Right: Court ── */}
          <div style={{ background: G.black, border: `1px solid ${G.border}`, padding: '20px' }}>
            {/* Half-court line art */}
            <div className="relative mb-5" style={{ height: 4 }}>
              <div className="absolute inset-x-0 top-0 h-px" style={{ background: G.border }} />
              <div className="absolute left-1/2 -translate-x-1/2 top-0 w-16 h-8 rounded-b-full"
                style={{ border: `1px solid ${G.border}`, borderTop: 'none' }} />
              <div className="absolute left-1/2 -translate-x-1/2 top-0 w-2 h-2 rounded-full"
                style={{ background: G.border, marginTop: -3 }} />
            </div>

            <div className="text-xs uppercase tracking-[0.2em] mb-4 text-center" style={{ color: G.greyDark }}>
              Starting Five
            </div>
            <div className="grid grid-cols-5 gap-1.5 mb-4">
              {starterSlots.map((slot, i) => (
                <CourtSlotView key={slot.position} slot={slot}
                  highlighted={!!selectedPlayer && !slot.player}
                  pendingPlayer={pendingSlotIdx === i ? selectedPlayer : null}
                  activePlayer={selectedPlayer} simEra={simEra}
                  onClick={() => previewSlot(i)} onDrop={() => previewSlot(i)} />
              ))}
            </div>

            <div className="h-px mb-4" style={{ background: G.border }} />

            <div className="text-xs uppercase tracking-[0.2em] mb-4 text-center" style={{ color: G.greyDark }}>
              Bench
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {benchSlots.map((slot, i) => (
                <CourtSlotView key={slot.position} slot={slot}
                  highlighted={!!selectedPlayer && !slot.player}
                  pendingPlayer={pendingSlotIdx === i + 5 ? selectedPlayer : null} simEra={simEra}
                  onClick={() => previewSlot(i + 5)} onDrop={() => previewSlot(i + 5)} />
              ))}
            </div>
          </div>
        </div>

        {filledCount === 9 && (
          <div className="mt-8 text-center">
            <Btn onClick={() => onDraftComplete(slots)} variant="gold" className="px-16 py-4 text-base">
              Draft Coach
            </Btn>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Phase 3: Coach Draft ─────────────────────────────────────────────────────
function CoachDraftScreen({ coaches, onCoachSelected, onRestart }: {
  coaches: Coach[]; onCoachSelected: (coach: Coach) => void; onRestart: () => void
}) {
  const [spinning, setSpinning] = useState(false)
  const [coach, setCoach] = useState<Coach | null>(null)
  const [spinsUsed, setSpinsUsed] = useState(0)
  const [displayName, setDisplayName] = useState('')
  const [spinKey, setSpinKey] = useState(0)
  const [spinPhase, setSpinPhase] = useState<'fast' | 'slow' | 'land'>('fast')
  const [devMode, setDevMode] = useState(false)
  const [devSearch, setDevSearch] = useState('')

  const spin = () => {
    setSpinning(true)
    setSpinsUsed(n => n + 1)
    setCoach(null)
    const schedule = [
      ...Array(10).fill(65),
      ...Array(5).fill(120),
      ...Array(3).fill(220),
    ]
    let ticks = 0
    const doTick = () => {
      const phase: 'fast' | 'slow' = ticks < 10 ? 'fast' : 'slow'
      setSpinPhase(phase)
      setDisplayName(coaches[Math.floor(Math.random() * coaches.length)].name)
      setSpinKey(k => k + 1)
      if (ticks < schedule.length) {
        setTimeout(doTick, schedule[ticks++])
      } else {
        const picked = coaches[Math.floor(Math.random() * coaches.length)]
        setSpinPhase('land')
        setSpinKey(k => k + 1)
        setDisplayName(picked.name)
        setCoach(picked)
        setTimeout(() => setSpinning(false), 350)
      }
    }
    doTick()
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: G.black }}>
      <TopBar onRestart={onRestart} />

      <div className="flex-1 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div style={{ ...BEBAS, fontSize: 56, color: G.white, letterSpacing: '0.05em', lineHeight: 1 }}>
            Draft a Coach
          </div>
          <div className="text-xs mt-2 uppercase tracking-widest" style={{ color: G.grey }}>
            A great coach elevates your roster, a bad one can hold it back. You have 3 chances.
          </div>
        </div>

        {!coach && !spinning && (
          <Btn onClick={spin} variant="gold" className="w-full py-4 text-base mb-4">
            Spin Coach
          </Btn>
        )}

        {(spinning || displayName) && (
          <div className="flex items-center justify-center gap-4 mb-4 py-4" style={{ borderTop: `1px solid ${G.border}`, borderBottom: `1px solid ${G.border}` }}>
            {!spinning && <CoachHeadshot name={displayName} size={52} />}
            <div style={{ ...BEBAS, fontSize: 28, color: spinning ? G.greyDark : G.white, letterSpacing: '0.05em' }}>
              <span className="slot-reel-window">
                <span
                  key={spinKey}
                  className={spinning || spinPhase === 'land' ? `slot-reel${spinPhase === 'slow' ? ' slot-reel--slow' : spinPhase === 'land' ? ' slot-reel--land' : ''}` : ''}
                >
                  {displayName}
                </span>
              </span>
            </div>
          </div>
        )}

        {coach && !spinning && (
          <div style={{ background: G.surface, border: `1px solid ${G.border}`, padding: '20px', marginBottom: 16 }}>
            <div className="flex items-start gap-4 mb-4">
              <CoachHeadshot name={coach.name} size={72} />
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <div style={{ ...BEBAS, fontSize: 28, color: G.white, letterSpacing: '0.04em' }}>{coach.name}</div>
                      {coach.offGuru && (
                        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: G.black, background: G.gold, padding: '2px 7px', borderRadius: 3, textTransform: 'uppercase' }}>OFF GURU</span>
                      )}
                      {coach.defGuru && (
                        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: G.black, background: '#4A9ECC', padding: '2px 7px', borderRadius: 3, textTransform: 'uppercase' }}>DEF GURU</span>
                      )}
                    </div>
                    <div className="text-xs mt-1" style={{ color: G.grey }}>
                      {coach.from}–{coach.to} · {coach.regW}W–{coach.regL}L ({(coach.regWLPct * 100).toFixed(1)}%)
                    </div>
                    <div className="flex flex-wrap gap-x-3 mt-1.5" style={{ fontSize: 11, color: G.greyDark }}>
                      <span style={{ color: G.grey }}>{coach.playoffG > 0 ? `${(coach.playoffWLPct * 100).toFixed(1)}% playoffs` : 'No playoffs'}</span>
                      {coach.champ > 0 && <><span>·</span><span style={{ color: G.gold }}>{coach.champ}× Champion</span></>}
                      {coach.conf > 0 && coach.champ === 0 && <><span>·</span><span style={{ color: G.grey }}>{coach.conf} conf title{coach.conf !== 1 ? 's' : ''}</span></>}
                    </div>
                  </div>
                  <div style={{ ...BEBAS, fontSize: 48, color: G.gold, letterSpacing: '0.05em', lineHeight: 1 }}>
                    {coach.overallGrade}
                  </div>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-px" style={{ background: G.border }}>
              <GradeDisplay grade={coach.offGrade} label="Offense" />
              <GradeDisplay grade={coach.defGrade} label="Defense" />
              <GradeDisplay grade={coach.overallGrade} label="Overall" />
            </div>
          </div>
        )}

        {coach && !spinning && (
          <div className="flex gap-2">
            {spinsUsed < 3 && (
              <Btn onClick={spin} variant="ghost" className="flex-1 py-3">
                Reroll ({3 - spinsUsed} left)
              </Btn>
            )}
            <Btn onClick={() => onCoachSelected(coach)} variant="gold" className="flex-1 py-3">
              Accept Coach
            </Btn>
          </div>
        )}
        <div className="text-xs text-center mt-4" style={{ color: G.greyDark }}>
          * Hall of Fame inductee
        </div>

        {/* DEV coach picker */}
        <div className="mt-6 pt-4" style={{ borderTop: `1px solid ${G.border}` }}>
          <button
            onClick={() => { setDevMode(d => !d); setDevSearch('') }}
            className="dev-btn text-xs uppercase tracking-widest px-3 py-1"
            style={{ color: devMode ? G.gold : G.greyDark, border: `1px solid ${devMode ? G.goldDim : G.border}`, background: 'none', cursor: 'pointer' }}
          >
            DEV
          </button>
          {devMode && (
            <div className="mt-3">
              <input
                type="text"
                placeholder="Search coach name..."
                value={devSearch}
                onChange={e => setDevSearch(e.target.value)}
                style={{ width: '100%', background: G.surface, border: `1px solid ${G.border}`, color: G.white, padding: '8px 12px', fontSize: 13, outline: 'none' }}
              />
              {devSearch.length > 1 && (
                <div style={{ background: G.surface, border: `1px solid ${G.border}`, borderTop: 'none', maxHeight: 200, overflowY: 'auto' }}>
                  {coaches.filter(c => c.name.toLowerCase().includes(devSearch.toLowerCase())).slice(0, 10).map(c => (
                    <div
                      key={c.name}
                      onClick={() => { setCoach(c); setDisplayName(c.name); setDevSearch(''); setDevMode(false) }}
                      style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13, color: G.white, borderBottom: `1px solid ${G.border}` }}
                      onMouseEnter={e => (e.currentTarget.style.background = G.surface2)}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      {c.name}
                      <span style={{ color: G.greyDark, marginLeft: 8, fontSize: 11 }}>Off:{c.offGrade} Def:{c.defGrade} Ovr:{c.overallGrade}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      </div>
    </div>
  )
}

// ─── Shared stats table ───────────────────────────────────────────────────────
function StatsTable({ stats, simEra, title, subtitle, teamActualPPG }: {
  stats: PlayerSeasonStats[]; simEra: Era; title: string; subtitle: string; teamActualPPG?: number
}) {
  const [cardPlayer, setCardPlayer] = useState<Player | null>(null)

  return (
    <>
    {/* Player card modal */}
    {cardPlayer && (
      <div
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.82)',
          zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
        }}
        onClick={e => { if (e.target === e.currentTarget) setCardPlayer(null) }}
      >
        <div style={{ width: '100%', maxWidth: 360, position: 'relative' }}>
          <button
            onClick={() => setCardPlayer(null)}
            className="modal-close"
            style={{
              position: 'absolute', top: -14, right: 0, zIndex: 1,
              background: 'transparent', border: `1px solid ${G.border}`,
              color: G.grey, fontSize: 18, lineHeight: 1,
              width: 32, height: 32, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >×</button>
          <PlayerCard player={cardPlayer} activeEra={cardPlayer.era} />
        </div>
      </div>
    )}
    <div style={{ background: G.surface, border: `1px solid ${G.border}` }}>
      <div className="px-5 py-3" style={{ borderBottom: `1px solid ${G.border}` }}>
        <div className="text-sm uppercase tracking-widest font-semibold text-white">{title}</div>
        <div className="text-xs mt-0.5" style={{ color: G.greyDark }}>{subtitle}</div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr style={{ borderBottom: `1px solid ${G.border}` }}>
              {['Player', 'Slot', 'MPG', 'PPG', 'RPG', 'APG', 'SPG', 'BPG', 'TOV', 'FG%', '3P%', 'FT%'].map(h => (
                <th key={h} className={`py-2 px-3 uppercase tracking-widest font-normal ${h === 'Player' ? 'text-left' : 'text-right'}`} style={{ color: G.grey }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {stats.map(s => {
              const isStarter = !s.slot.startsWith('B')
              return (
                <tr key={s.player.person_id} style={{ borderBottom: `1px solid ${G.borderSub}` }}>
                  <td className="py-2 px-3">
                    <button
                      onClick={() => setCardPlayer(s.player)}
                      className="font-medium text-left transition-colors"
                      style={{ color: isStarter ? G.white : G.grey, cursor: 'pointer' }}
                      onMouseEnter={e => (e.currentTarget.style.color = G.gold)}
                      onMouseLeave={e => (e.currentTarget.style.color = isStarter ? G.white : G.grey)}
                    >
                      {s.player.full_name}
                      {s.player.era !== simEra && (
                        <span className="ml-1.5 text-xs" style={{ color: G.greyDark }}>{eraLabel(s.player.era)}</span>
                      )}
                    </button>
                  </td>
                  <td className="py-2 px-3 text-right" style={{ color: G.greyDark }}>{s.slot}</td>
                  <td className="py-2 px-3 text-right" style={{ color: G.greyDark }}>{s.MPG}</td>
                  <td className="py-2 px-3 text-right font-bold" style={{ color: G.gold }}>{s.PTS.toFixed(1)}</td>
                  <td className="py-2 px-3 text-right" style={{ color: G.white }}>{s.REB.toFixed(1)}</td>
                  <td className="py-2 px-3 text-right" style={{ color: G.white }}>{s.AST.toFixed(1)}</td>
                  <td className="py-2 px-3 text-right" style={{ color: G.grey }}>{s.STL.toFixed(1)}</td>
                  <td className="py-2 px-3 text-right" style={{ color: G.grey }}>{s.BLK.toFixed(1)}</td>
                  <td className="py-2 px-3 text-right" style={{ color: G.grey }}>{s.TOV.toFixed(1)}</td>
                  <td className="py-2 px-3 text-right" style={{ color: G.grey }}>{(s.FG_PCT * 100).toFixed(1)}%</td>
                  <td className="py-2 px-3 text-right" style={{ color: G.grey }}>
                    {s.FG3_PCT != null ? `${(s.FG3_PCT * 100).toFixed(1)}%` : '—'}
                  </td>
                  <td className="py-2 px-3 text-right" style={{ color: G.grey }}>{(s.FT_PCT * 100).toFixed(1)}%</td>
                </tr>
              )
            })}
            {(() => {
              if (stats.length === 0) return null
              const sum = (fn: (s: typeof stats[0]) => number) => stats.reduce((acc, s) => acc + fn(s), 0)
              const totalMPG = sum(s => s.MPG)
              // Percentages weighted by minutes
              const wFG  = sum(s => s.FG_PCT * s.MPG) / totalMPG
              const wFT  = sum(s => s.FT_PCT * s.MPG) / totalMPG
              const fg3s = stats.filter(s => s.FG3_PCT != null)
              const wFG3MPG = fg3s.reduce((acc, s) => acc + s.MPG, 0)
              const wFG3 = wFG3MPG > 0 ? fg3s.reduce((acc, s) => acc + s.FG3_PCT! * s.MPG, 0) / wFG3MPG : null
              return (
                <tr style={{ borderTop: `1px solid ${G.gold}55`, background: '#1a1a1a' }}>
                  <td className="py-2 px-3 font-bold uppercase tracking-widest text-xs" style={{ color: G.gold }}>Team</td>
                  <td className="py-2 px-3" />
                  <td className="py-2 px-3" />
                  <td className="py-2 px-3 text-right font-bold" style={{ color: G.gold }}>
                    {(teamActualPPG ?? sum(s => s.PTS)).toFixed(1)}
                  </td>
                  <td className="py-2 px-3 text-right font-bold" style={{ color: G.white }}>{sum(s => s.REB).toFixed(1)}</td>
                  <td className="py-2 px-3 text-right font-bold" style={{ color: G.white }}>{sum(s => s.AST).toFixed(1)}</td>
                  <td className="py-2 px-3 text-right font-bold" style={{ color: G.grey }}>{sum(s => s.STL).toFixed(1)}</td>
                  <td className="py-2 px-3 text-right font-bold" style={{ color: G.grey }}>{sum(s => s.BLK).toFixed(1)}</td>
                  <td className="py-2 px-3 text-right font-bold" style={{ color: G.grey }}>{sum(s => s.TOV).toFixed(1)}</td>
                  <td className="py-2 px-3 text-right font-bold" style={{ color: G.grey }}>{(wFG * 100).toFixed(1)}%</td>
                  <td className="py-2 px-3 text-right font-bold" style={{ color: G.grey }}>
                    {wFG3 != null ? `${(wFG3 * 100).toFixed(1)}%` : '—'}
                  </td>
                  <td className="py-2 px-3 text-right font-bold" style={{ color: G.grey }}>{(wFT * 100).toFixed(1)}%</td>
                </tr>
              )
            })()}
          </tbody>
        </table>
      </div>
    </div>
    </>
  )
}

// ─── Playoff reaction lines ───────────────────────────────────────────────────
function getPlayoffReaction(
  game: { win: boolean; teamScore: number; oppScore: number; gameInSeries: number },
  seriesW: number,
  seriesL: number,
  seriesOver: boolean,
  champion: boolean,
  roundName: string
): string {
  const { win, teamScore: ts, oppScore: os, gameInSeries: n } = game
  const margin = Math.abs(ts - os)
  const seed = ts + os * 7 + n * 13
  const pick = (arr: string[]) => arr[seed % arr.length]

  if (champion && seriesOver) return pick([
    `WE ARE NBA CHAMPIONS!!!! We did it! UNBELIEVABLE!`,
    `CHAMPIONSHIP!!!! ${ts}-${os} and we are THE BEST IN THE WORLD!`,
    `I can't believe it... NBA CHAMPS! Game ${n}, ${ts}-${os}. Dreams come true!`,
  ])

  if (seriesOver && !win) return pick([
    `That's it... eliminated. Lost the series ${seriesW}-${seriesL}. Season's over.`,
    `Game ${n}, ${ts}-${os}. We fought so hard but it just wasn't enough. Gutted.`,
    `We're out ${seriesW}-${seriesL}. Ugh. That one's gonna hurt for a while.`,
  ])

  if (seriesOver && win) return pick([
    `YEAH! We took the ${roundName} ${seriesW}-${seriesL}! ONTO THE NEXT ROUND!`,
    `SERIES WIN! Game ${n} clincher ${ts}-${os}! ${seriesW}-${seriesL} and moving on!`,
    `WE ARE MOVING ON! ${roundName} is OURS! ${ts}-${os} in Game ${n}!`,
  ])

  if (win) {
    if (margin > 15) return pick([
      `OH YEAH! We CRUSHED them ${ts}-${os} in Game ${n}! That's what we do!`,
      `DOMINATION! Game ${n} goes our way ${ts}-${os}. They had no answer for us!`,
      `Easy work in Game ${n}! ${ts}-${os}. Series is ${seriesW}-${seriesL} our way!`,
    ])
    if (margin <= 5) return pick([
      `WHEW! Game ${n} was a BATTLE but we got it ${ts}-${os}! Series ${seriesW}-${seriesL}!`,
      `Too close for comfort... ${ts}-${os} in Game ${n} but a W is a W!`,
      `Heart was pounding the whole time. ${ts}-${os}, Game ${n} is ours!`,
    ])
    return pick([
      `Let's go! Game ${n} is ours, ${ts}-${os}! Series ${seriesW}-${seriesL}!`,
      `We got the W in Game ${n}, ${ts}-${os}. Keep building!`,
      `Game ${n} done! ${ts}-${os}. Feeling good about this series, ${seriesW}-${seriesL}!`,
    ])
  } else {
    if (margin > 15) return pick([
      `Oof. They blew us out ${ts}-${os} in Game ${n}. That was rough. Series ${seriesW}-${seriesL}.`,
      `They dominated us ${ts}-${os}. Game ${n} was ugly. We gotta wake up.`,
      `We had NOTHING tonight. Game ${n} loss ${ts}-${os}. Need to regroup badly.`,
    ])
    if (margin <= 5) return pick([
      `NOOO! Game ${n} slipped away ${ts}-${os}... just couldn't close. Series ${seriesW}-${seriesL}.`,
      `We were RIGHT there and let it slip. ${ts}-${os} in Game ${n}. One more play...`,
      `Game ${n} loss ${ts}-${os}. That one stings. We were so close. Series ${seriesW}-${seriesL}.`,
    ])
    return pick([
      `Lost Game ${n}, ${ts}-${os}. We know what we need to fix. Series ${seriesW}-${seriesL}.`,
      `Game ${n} goes their way, ${ts}-${os}. We'll come back stronger. Series ${seriesW}-${seriesL}.`,
      `Didn't have it in Game ${n}. ${ts}-${os}. Back to the drawing board.`,
    ])
  }
}

// ─── Awards ───────────────────────────────────────────────────────────────────

export interface AwardThresholds {
  mvpWins: number
  mvpBase: number
  mvpPPG: number
  allNBAAdj: number
  allNBAPPG: number
  allStarAdj: number
  allStarGPPG: number
  allStarFPPG: number
  allStarCPPG: number
  dpoyBase: number
  dpoySTL: number
  dpoyBLK: number
  sixthManPPG: number
  sixthManAdj: number
}

export const DEFAULT_THRESHOLDS: AwardThresholds = {
  mvpWins: 55, mvpBase: 55, mvpPPG: 24,
  allNBAAdj: 50, allNBAPPG: 24,
  allStarAdj: 48, allStarGPPG: 20, allStarFPPG: 20, allStarCPPG: 18,
  dpoyBase: 50, dpoySTL: 1.5, dpoyBLK: 1.5,
  sixthManPPG: 14, sixthManAdj: 48,
}

interface AwardEntry {
  award: string
  player: PlayerSeasonStats
  justification: string
  gold: boolean
}

function computeSeasonAwards(
  seasonStats: PlayerSeasonStats[],
  playerRatings: PlayerRating[],
  wins: number,
  t: AwardThresholds
): AwardEntry[] {
  const awards: AwardEntry[] = []
  const ratingMap = new Map(playerRatings.map(pr => [pr.player.person_id, pr]))
  const rated = seasonStats.map(s => ({
    s,
    adj: ratingMap.get(s.player.person_id)?.adjusted ?? 0,
    base: ratingMap.get(s.player.person_id)?.base ?? 0,
  }))

  // ── MVP ──
  if (wins >= t.mvpWins) {
    const tdCandidate = rated.find(({ s }) =>
      (s.PTS > 20 && s.REB > 10 && s.AST > 10) || (s.PTS > 20 && s.AST > 10 && s.REB > 7)
    )
    const mvpCandidate = tdCandidate ?? rated
      .filter(({ s, base }) => base > t.mvpBase && s.PTS > t.mvpPPG)
      .sort((a, b) => b.base - a.base)[0]
    if (mvpCandidate) {
      awards.push({
        award: 'League MVP',
        player: mvpCandidate.s,
        justification: `${mvpCandidate.s.PTS.toFixed(1)} PPG · ${mvpCandidate.s.REB.toFixed(1)} RPG · ${mvpCandidate.s.AST.toFixed(1)} APG`,
        gold: true,
      })
    }
  }

  // ── All-NBA First Team ──
  const allNBASlots: SlotPosition[] = ['PG', 'SG', 'SF', 'PF', 'C']
  for (const pos of allNBASlots) {
    const best = rated
      .filter(({ s, adj }) => s.slot === pos && adj > t.allNBAAdj && s.PTS > t.allNBAPPG)
      .sort((a, b) => b.adj - a.adj)[0]
    if (best) {
      awards.push({
        award: `All-NBA · ${pos}`,
        player: best.s,
        justification: `${best.s.PTS.toFixed(1)} PPG · ${best.adj.toFixed(1)} rating`,
        gold: false,
      })
    }
  }

  // ── All-Star ──
  const winPct = wins / 82
  const badTeam = winPct <= 0.35
  const ppgFloor = (s: PlayerSeasonStats) => {
    if (!s.slot.startsWith('B')) {
      const sl = s.slot as SlotPosition
      return sl === 'PG' || sl === 'SG' ? t.allStarGPPG : sl === 'C' ? t.allStarCPPG : t.allStarFPPG
    }
    const pos = (s.player.position ?? '').toUpperCase()
    if (pos.includes('CENTER')) return t.allStarCPPG
    if (pos.includes('GUARD')) return t.allStarGPPG
    return t.allStarFPPG
  }
  for (const { s } of rated) {
    // Bad team penalty — must be historically dominant to qualify
    if (badTeam && s.PTS < 30 && s.REB < 20 && s.AST < 18) continue
    // Must hit statistical thresholds
    if (s.REB >= 18) {
      awards.push({ award: 'All-Star', player: s, justification: `${s.PTS.toFixed(1)} PPG · ${s.REB.toFixed(1)} REB`, gold: false })
      continue
    }
    if (s.PTS <= ppgFloor(s)) continue
    // Centers under 20 PPG must have 10+ RPG
    const isCenter = s.slot === 'C' ||
      (!s.slot.startsWith('B') ? false : (s.player.position ?? '').toUpperCase().includes('CENTER'))
    if (isCenter && s.PTS < 20 && s.REB < 10) continue
    if (s.REB <= 7 && s.AST <= 7 && s.STL <= 1.8 && s.BLK <= 1.8) continue
    awards.push({
      award: 'All-Star',
      player: s,
      justification: `${s.PTS.toFixed(1)} PPG · ${s.REB.toFixed(1)} REB · ${s.AST.toFixed(1)} AST`,
      gold: false,
    })
  }

  // ── DPOY ──
  const dpoy = rated
    .filter(({ s, base }) =>
      base > t.dpoyBase && ((s.STL > t.dpoySTL && s.BLK > t.dpoyBLK) || s.STL > 2.2 || s.BLK > 2.8)
    )
    .sort((a, b) => (b.s.STL + b.s.BLK) - (a.s.STL + a.s.BLK))[0]
  if (dpoy) {
    awards.push({
      award: 'Defensive POY',
      player: dpoy.s,
      justification: `${dpoy.s.STL.toFixed(1)} STL · ${dpoy.s.BLK.toFixed(1)} BLK`,
      gold: false,
    })
  }

  // ── 6th Man ──
  const benchSorted = rated.filter(({ s }) => s.slot.startsWith('B')).sort((a, b) => b.adj - a.adj)
  const sixthMan = benchSorted.slice(0, 2).find(({ s, adj }) => s.PTS > t.sixthManPPG && adj > t.sixthManAdj)
  if (sixthMan) {
    awards.push({
      award: '6th Man of the Year',
      player: sixthMan.s,
      justification: `${sixthMan.s.PTS.toFixed(1)} PPG · ${sixthMan.adj.toFixed(1)} rating`,
      gold: false,
    })
  }

  return awards
}

function computeFinalsMVP(playoffStats: PlayerSeasonStats[]): PlayerSeasonStats | null {
  if (!playoffStats.length) return null
  return [...playoffStats].sort((a, b) => b.PTS !== a.PTS ? b.PTS - a.PTS : b.AST - a.AST)[0]
}

function SeasonAwardsPanel({ awards }: { awards: AwardEntry[] }) {
  return (
    <div style={{ background: G.surface, border: `1px solid ${G.border}` }}>
      <div className="px-5 py-3" style={{ borderBottom: `1px solid ${G.border}` }}>
        <div className="text-sm uppercase tracking-widest font-semibold text-white">Season Awards</div>
      </div>
      {awards.length === 0 ? (
        <div className="px-5 py-4 text-xs uppercase tracking-widest" style={{ color: G.greyDark }}>
          No major awards this season
        </div>
      ) : (
        <div>
          {awards.map((a, i) => (
            <div
              key={i}
              className="flex items-center justify-between px-5 py-3"
              style={{ borderBottom: `1px solid ${G.borderSub}` }}
            >
              <div className="text-xs uppercase tracking-widest font-semibold" style={{ color: a.gold ? G.gold : G.grey }}>
                {a.award}
              </div>
              <div className="text-right">
                <div className="text-xs font-medium" style={{ color: a.gold ? G.gold : G.white }}>
                  {a.player.player.full_name}
                </div>
                <div className="text-xs mt-0.5" style={{ color: G.greyDark }}>{a.justification}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Phase 4: Simulation ──────────────────────────────────────────────────────
function SimulationScreen({ slots, coach, simEra, onRestart }: {
  slots: CourtSlot[]; coach: Coach; simEra: Era; onRestart: () => void
}) {
  // ── Regular season ──
  const [simStarted, setSimStarted] = useState(false)
  const [games, setGames] = useState<boolean[]>([])
  const [done, setDone] = useState(false)
  const [seasonStats, setSeasonStats] = useState<PlayerSeasonStats[]>([])
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Season actual scores ──
  const [avgTeamScore, setAvgTeamScore] = useState<number | null>(null)

  // ── Playoffs ──
  const [playoffStarted, setPlayoffStarted] = useState(false)
  const [playoffRevealIndex, setPlayoffRevealIndex] = useState(-1)
  const [playoffDone, setPlayoffDone] = useState(false)
  const [playoffResult, setPlayoffResult] = useState<PlayoffResult | null>(null)
  const [selectedGame, setSelectedGame] = useState<{ game: PlayoffGame; roundName: string; gameNum: number } | null>(null)

  // ── Headshots ──
  const [headshots, setHeadshots] = useState<Record<string, string | null>>({})

  useEffect(() => {
    if (!seasonStats.length) return
    const starters = seasonStats.filter(s => !s.slot.startsWith('B'))
    Promise.all(
      starters.map(async s => {
        const url = `/api/headshot?id=${s.player.person_id}`
        try {
          const res = await fetch(url)
          if (!res.ok) return [s.player.person_id, null] as [string, null]
          const blob = await res.blob()
          const base64 = await new Promise<string | null>(resolve => {
            const reader = new FileReader()
            reader.onloadend = () => resolve(reader.result as string)
            reader.onerror = () => resolve(null)
            reader.readAsDataURL(blob)
          })
          return [s.player.person_id, base64] as [string, string | null]
        } catch {
          return [s.player.person_id, null] as [string, null]
        }
      })
    ).then(entries => setHeadshots(Object.fromEntries(entries)))
  }, [seasonStats])

  // ── Share card ──
  const cardRef = useRef<HTMLDivElement>(null)
  const [sharing, setSharing] = useState(false)
  const [shareImageUrl, setShareImageUrl] = useState<string | null>(null)

  const handleShare = async () => {
    if (!cardRef.current || sharing) return
    setSharing(true)
    try {
      await document.fonts.ready
      const { default: html2canvas } = await import('html2canvas')
      const canvas = await html2canvas(cardRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#000000',
        logging: false,
        // Do NOT pass width/height — with scale:2, passing height:1080 only
        // captures 540 CSS px (1080÷2) and stretches it, cutting the bottom half.
        // Let html2canvas auto-size to element (1080×1080) × scale:2 = 2160×2160.
        onclone: (_doc: Document, el: HTMLElement) => {
          // Fix the PARENT WRAPPER too — otherwise the card is still at -1100px
          // inside the fixed wrapper even though el is repositioned.
          const wrapper = el.parentElement
          if (wrapper) {
            wrapper.style.position = 'absolute'
            wrapper.style.top = '0'
            wrapper.style.left = '0'
            wrapper.style.zIndex = '0'
          }
          el.style.position = 'relative'
          el.style.top = 'auto'
          el.style.left = 'auto'
          el.style.zIndex = '0'
        },
      })
      // Downscale the 2160×2160 hi-res canvas back to 1080×1080 for sharing
      const out = document.createElement('canvas')
      out.width = 1080
      out.height = 1080
      out.getContext('2d')!.drawImage(canvas, 0, 0, 1080, 1080)
      setShareImageUrl(out.toDataURL('image/png'))
    } catch (e) {
      console.error('Share card failed:', e)
      alert('Could not generate image — try again.')
    } finally {
      setSharing(false)
    }
  }

  const handleDownload = () => {
    if (!shareImageUrl) return
    const link = document.createElement('a')
    link.download = `eraball-${simEra}-${wins}-${losses}.png`
    link.href = shareImageUrl
    link.click()
  }

  const { teamRating: tr, playerRatings: pr } = calcTeamRating(slots, coach, simEra)

  const startSim = () => {
    setSimStarted(true); setGames([]); setDone(false); setSeasonStats([])
    const { games: allGames, seasonStats: stats, avgTeamScore: ats } = simulateSeason(tr, pr, coach.defGrade, coach.offGrade, simEra)
    setSeasonStats(stats)
    setAvgTeamScore(ats)
    let idx = 0
    intervalRef.current = setInterval(() => {
      setGames(allGames.slice(0, ++idx))
      if (idx >= 82) { clearInterval(intervalRef.current!); setDone(true) }
    }, 50)
  }

  const startPlayoffs = () => {
    setPlayoffStarted(true)
    setPlayoffRevealIndex(-1)
    setPlayoffDone(false)
    const result = simulatePlayoffs(tr, pr, wins, coach.defGrade, coach.offGrade, simEra)
    setPlayoffResult(result)
    setTimeout(() => setPlayoffRevealIndex(0), 400)
  }

  const skipPlayoffs = () => {
    if (!playoffResult) return
    setPlayoffRevealIndex(playoffResult.allGames.length)
    setPlayoffDone(true)
  }

  useEffect(() => () => {
    if (intervalRef.current) clearInterval(intervalRef.current)
  }, [])

  // Auto-advance playoff reveal one game at a time
  useEffect(() => {
    if (!playoffResult || !playoffStarted || playoffRevealIndex < 0) return
    if (playoffRevealIndex >= playoffResult.allGames.length) {
      setPlayoffDone(true)
      return
    }
    const delay = playoffRevealIndex === 0 ? 900 : 2200
    const timer = setTimeout(() => setPlayoffRevealIndex(i => i + 1), delay)
    return () => clearTimeout(timer)
  }, [playoffRevealIndex, playoffStarted, playoffResult])

  const wins = games.filter(Boolean).length
  const losses = games.length - wins
  const madePlayoffs = wins >= 41

  const verdict = wins === 82 ? 'Perfect Season' : wins === 0 ? 'Winless Season' : wins >= 60 ? 'Championship Contender' : wins >= 50 ? 'Playoff Team' : wins >= 41 ? '.500 Season' : 'Lottery Bound'

  const dispRating = (r: number) => Math.round(r + 15)

  const gradeBonus = (g: 'A' | 'B' | 'C' | 'D' | 'F') =>
    `${coachBonus(g) >= 0 ? '+' : ''}${(coachBonus(g) * 100).toFixed(0)}%`

  const ROUND_NAMES = ['First Round', 'Semifinals', 'Conference Finals', 'NBA Finals']

  // Derive playoff display state from reveal index
  const revealedGames = playoffResult ? playoffResult.allGames.slice(0, playoffRevealIndex) : []
  const currentGame = playoffRevealIndex > 0 && playoffResult ? playoffResult.allGames[playoffRevealIndex - 1] : null
  const liveRounds = ROUND_NAMES.map((name, ri) => {
    const rGames = revealedGames.filter(g => g.roundIndex === ri)
    const w = rGames.filter(g => g.win).length
    const l = rGames.filter(g => !g.win).length
    return { name, rGames, w, l, complete: w === 4 || l === 4, advanced: w === 4 }
  })
  const visibleRounds = liveRounds.filter(r => r.rGames.length > 0)

  // Current series progress for the active game
  const currentRoundLive = currentGame ? liveRounds[currentGame.roundIndex] : null
  const seriesW = currentRoundLive?.w ?? 0
  const seriesL = currentRoundLive?.l ?? 0
  const seriesOver = currentRoundLive ? (seriesW === 4 || seriesL === 4) : false

  const allDone = done && (playoffDone || !madePlayoffs)

  const seasonAwards = done && seasonStats.length > 0
    ? computeSeasonAwards(seasonStats, pr, wins, DEFAULT_THRESHOLDS)
    : []

  const finalsMVP = playoffDone && playoffResult?.champion && playoffResult.playoffStats.length > 0
    ? computeFinalsMVP(playoffResult.playoffStats)
    : null


  return (
    <div className="min-h-screen" style={{ background: G.black }}>
      <TopBar onRestart={onRestart} right={
        <span>
          Era: <span style={{ color: G.white }}>{eraLabel(simEra)}</span>
          <span className="mx-3" style={{ color: G.border }}>|</span>
          Coach: <span style={{ color: G.white }}>{coach.name}</span>
        </span>
      } />

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">

        {/* Rating breakdown */}
        <div style={{ background: G.surface, border: `1px solid ${G.border}` }}>
          <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: `1px solid ${G.border}` }}>
            <div className="text-sm uppercase tracking-widest font-semibold text-white">Team Rating</div>
            <div className="flex items-center gap-4">
              <span style={{ ...BEBAS, fontSize: 28, color: G.gold }}>{dispRating(tr)}</span>
              <span className="text-xs" style={{ color: G.grey }}>
                Off {gradeBonus(coach.offGrade)} · Def {gradeBonus(coach.defGrade)}
              </span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ borderBottom: `1px solid ${G.border}` }}>
                  {['Player', 'Slot', 'Base', 'Era', 'Fit', 'Rating'].map(h => (
                    <th key={h} className={`py-2 px-3 uppercase tracking-widest font-normal ${h === 'Player' ? 'text-left' : 'text-right'}`} style={{ color: G.grey }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pr.map(({ player, slot, base, adjusted, fitPenalty, eraMod }) => (
                  <tr key={player.person_id} style={{ borderBottom: `1px solid ${G.borderSub}` }}>
                    <td className="py-2 px-3 text-white font-medium">{player.full_name}</td>
                    <td className="py-2 px-3 text-right" style={{ color: G.grey }}>{slot}</td>
                    <td className="py-2 px-3 text-right" style={{ color: G.grey }}>{dispRating(base)}</td>
                    <td className="py-2 px-3 text-right" style={{ color: eraMod < 1 ? G.red : G.grey }}>{(eraMod * 100).toFixed(0)}%</td>
                    <td className="py-2 px-3 text-right" style={{ color: fitPenalty === 0 ? G.grey : fitPenalty === 0.10 ? G.grey : G.red }}>
                      {fitPenalty === 0 ? '—' : `-${(fitPenalty * 100).toFixed(0)}%`}
                    </td>
                    <td className="py-2 px-3 text-right font-bold" style={{ color: G.gold }}>{dispRating(adjusted)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Simulate Season button */}
        {!simStarted && (
          <div className="text-center py-4">
            <Btn onClick={startSim} variant="gold" className="px-16 py-4 text-base">
              Simulate Season
            </Btn>
          </div>
        )}

        {/* Regular season ticker + record */}
        {simStarted && (
          <div style={{ background: G.surface, border: `1px solid ${G.border}` }}>
            <div className="text-center py-8" style={{ borderBottom: `1px solid ${G.border}` }}>
              {done ? (
                <>
                  <div className="text-xs uppercase tracking-[0.3em] mb-3" style={{ color: G.grey }}>Regular Season</div>
                  <div style={{ ...BEBAS, fontSize: 'clamp(64px, 14vw, 120px)', lineHeight: 1, color: wins === 82 ? G.gold : wins === 0 ? '#CC3333' : G.white, letterSpacing: '0.02em' }}>
                    {wins}–{losses}
                  </div>

                  {wins === 82 ? (
                    <div className="mt-4 px-6">
                      <div style={{ background: 'rgba(201,168,76,0.10)', border: `2px solid ${G.gold}`, padding: '14px 28px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, marginBottom: 6 }}>
                          <div style={{ height: 1, flex: 1, background: `linear-gradient(to right, transparent, ${G.gold})` }} />
                          <div style={{ ...BEBAS, fontSize: 26, color: G.gold, letterSpacing: '0.3em' }}>PERFECT SEASON</div>
                          <div style={{ height: 1, flex: 1, background: `linear-gradient(to left, transparent, ${G.gold})` }} />
                        </div>
                        <div className="text-xs uppercase tracking-[0.3em] text-center" style={{ color: G.goldDim }}>
                          82–0 · The greatest team ever assembled
                        </div>
                      </div>
                    </div>
                  ) : wins === 0 ? (
                    <div className="mt-4 px-6">
                      <div style={{ background: 'rgba(204,51,51,0.08)', border: `1px solid #CC3333`, padding: '14px 28px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, marginBottom: 6 }}>
                          <div style={{ height: 1, flex: 1, background: 'linear-gradient(to right, transparent, #CC3333)' }} />
                          <div style={{ ...BEBAS, fontSize: 26, color: '#CC3333', letterSpacing: '0.3em' }}>WINLESS SEASON</div>
                          <div style={{ height: 1, flex: 1, background: 'linear-gradient(to left, transparent, #CC3333)' }} />
                        </div>
                        <div className="text-xs uppercase tracking-[0.3em] text-center" style={{ color: '#774444' }}>
                          0–82 · Not a single win all season
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="mt-2 text-xs uppercase tracking-[0.3em]" style={{ color: G.gold }}>{verdict}</div>
                      <div className="mt-1 text-xs" style={{ color: G.grey }}>
                        {(wins / 82 * 100).toFixed(1)}% win rate
                      </div>
                    </>
                  )}
                </>
              ) : (
                <>
                  <div className="text-xs uppercase tracking-[0.3em] mb-3" style={{ color: G.grey }}>Game {games.length} of 82</div>
                  <div style={{ ...BEBAS, fontSize: 80, lineHeight: 1, color: G.white }}>
                    {wins}–{losses}
                  </div>
                </>
              )}
            </div>
            <div className="p-5">
              <div className="flex flex-wrap gap-1">
                {games.map((win, i) => (
                  <div key={i} title={`Game ${i + 1}: ${win ? 'W' : 'L'}`}
                    style={{ width: 12, height: 12, background: win ? G.gold : G.greyDark, flexShrink: 0 }} />
                ))}
                {Array.from({ length: 82 - games.length }).map((_, i) => (
                  <div key={`e-${i}`} style={{ width: 12, height: 12, background: G.border, flexShrink: 0 }} />
                ))}
              </div>
              <div className="mt-3 flex items-center gap-4 text-xs" style={{ color: G.greyDark }}>
                <span><span style={{ display: 'inline-block', width: 8, height: 8, background: G.gold, marginRight: 4 }} />Win</span>
                <span><span style={{ display: 'inline-block', width: 8, height: 8, background: G.greyDark, marginRight: 4 }} />Loss</span>
              </div>
            </div>
          </div>
        )}

        {/* Regular season stats */}
        {done && seasonStats.length > 0 && (
          <StatsTable
            stats={seasonStats}
            simEra={simEra}
            title="Regular Season Stats"
            subtitle="Era-adjusted, minutes-scaled per-game averages across 82 games"
            teamActualPPG={avgTeamScore ?? undefined}
          />
        )}

        {/* Season awards */}
        {done && seasonStats.length > 0 && (
          <SeasonAwardsPanel awards={seasonAwards} />
        )}

        {/* Missed playoffs */}
        {done && !madePlayoffs && (
          <div className="text-center py-6" style={{ background: G.surface, border: `1px solid ${G.border}` }}>
            <div className="text-xs uppercase tracking-[0.3em] mb-2" style={{ color: G.greyDark }}>Missed Playoffs</div>
            <div className="text-sm" style={{ color: G.grey }}>{wins} wins — below the playoff threshold</div>
          </div>
        )}

        {/* Simulate Playoffs button */}
        {done && madePlayoffs && !playoffStarted && (
          <div className="text-center py-4">
            <Btn onClick={startPlayoffs} variant="gold" className="px-16 py-4 text-base">
              Simulate Playoffs
            </Btn>
          </div>
        )}

        {/* Playoff — game-by-game reveal */}
        {playoffStarted && (
          <div className="space-y-3">

            {/* Current game spotlight */}
            {currentGame ? (
              <div style={{ background: G.surface, border: `1px solid ${currentGame.win ? G.gold : G.red}` }}>
                {/* Round + game label */}
                <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: `1px solid ${G.border}` }}>
                  <div className="text-xs uppercase tracking-[0.25em]" style={{ color: G.grey }}>
                    {ROUND_NAMES[currentGame.roundIndex]}
                  </div>
                  <div style={{ ...BEBAS, fontSize: 15, color: G.goldDim, letterSpacing: '0.1em' }}>
                    Game {currentGame.gameInSeries}
                  </div>
                </div>

                {/* Score display */}
                <div className="flex items-center justify-center gap-10 py-8">
                  <div className="text-center">
                    <div className="text-xs uppercase tracking-widest mb-2" style={{ color: G.grey }}>Your Team</div>
                    <div style={{ ...BEBAS, fontSize: 'clamp(64px, 14vw, 100px)', lineHeight: 1, color: currentGame.win ? G.gold : G.white }}>
                      {currentGame.teamScore}
                    </div>
                  </div>
                  <div style={{ ...BEBAS, fontSize: 22, color: G.greyDark }}>–</div>
                  <div className="text-center">
                    <div className="text-xs uppercase tracking-widest mb-2" style={{ color: G.grey }}>Opponent</div>
                    <div style={{ ...BEBAS, fontSize: 'clamp(64px, 14vw, 100px)', lineHeight: 1, color: currentGame.win ? G.greyDark : G.red }}>
                      {currentGame.oppScore}
                    </div>
                  </div>
                </div>

                {/* Game leaders */}
                <div className="flex justify-center gap-6 px-5 pb-3" style={{ borderTop: `1px solid ${G.border}`, paddingTop: 10 }}>
                  {[
                    { label: 'PTS', leader: currentGame.leaders.pts },
                    { label: 'REB', leader: currentGame.leaders.reb },
                    { label: 'AST', leader: currentGame.leaders.ast },
                  ].map(({ label, leader }) => (
                    <div key={label} className="text-center">
                      <div style={{ fontSize: 11, color: G.white, fontWeight: 600 }}>{leader.name} <span style={{ color: G.gold }}>{leader.val}</span></div>
                      <div style={{ fontSize: 9, color: G.greyDark, letterSpacing: '0.15em', textTransform: 'uppercase' }}>{label}</div>
                    </div>
                  ))}
                </div>

                {/* Special performance */}
                {currentGame.special && (
                  <div className="text-center px-5 pb-3" style={{ fontSize: 11, color: G.gold, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                    ★ {currentGame.special.playerName} — {currentGame.special.label}
                  </div>
                )}

                {/* Result + series record */}
                <div className="flex items-center justify-between px-5 pb-4">
                  <div style={{ ...BEBAS, fontSize: 22, color: currentGame.win ? G.gold : G.red, letterSpacing: '0.1em' }}>
                    {currentGame.win ? 'WIN' : 'LOSS'}
                  </div>
                  <div className="text-xs uppercase tracking-[0.2em]" style={{
                    color: seriesW > seriesL ? G.gold : seriesW < seriesL ? G.red : G.grey
                  }}>
                    Series {seriesW}–{seriesL}
                    {seriesOver ? (seriesW === 4 ? ' · Advanced' : ' · Eliminated') : ''}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-6" style={{ background: G.surface, border: `1px solid ${G.border}` }}>
                <div className="text-xs uppercase tracking-[0.3em]" style={{ color: G.grey }}>NBA Playoffs</div>
                <div className="text-xs mt-2" style={{ color: G.greyDark }}>Starting...</div>
              </div>
            )}


            {/* Series history — all completed + current round */}
            {visibleRounds.length > 0 && (
              <div style={{ background: G.surface, border: `1px solid ${G.border}` }}>
                <div className="p-5 space-y-4">
                  {visibleRounds.map(({ name, rGames, w, l, complete, advanced }) => (
                    <div key={name}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-xs uppercase tracking-[0.15em] font-semibold" style={{
                          color: complete ? (advanced ? G.gold : G.red) : G.white
                        }}>
                          {name}
                        </div>
                        <div className="text-xs" style={{ color: complete ? (advanced ? G.gold : G.red) : G.grey }}>
                          {w}–{l}{complete ? (advanced ? ' · Advanced' : ' · Eliminated') : ''}
                        </div>
                      </div>
                      <div className="flex gap-1.5 flex-wrap">
                        {rGames.map((g, gi) => (
                          <div key={gi} onClick={() => setSelectedGame({ game: g, roundName: name, gameNum: gi + 1 })} style={{
                            width: 62,
                            background: G.black,
                            border: `1px solid ${g.win ? G.goldDim : G.border}`,
                            overflow: 'hidden',
                            flexShrink: 0,
                            cursor: 'pointer',
                          }}>
                            <div style={{ height: 3, background: g.win ? G.gold : G.red }} />
                            <div style={{ padding: '3px 5px' }}>
                              <div style={{ fontSize: 7, color: G.greyDark, lineHeight: 1 }}>G{gi + 1}</div>
                              <div style={{ fontSize: 9, color: g.win ? G.white : G.grey, fontWeight: 600, lineHeight: 1.2 }}>
                                {g.teamScore}–{g.oppScore}
                              </div>
                              <div style={{ fontSize: 7, color: G.gold, lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {g.leaders.pts.name} {g.leaders.pts.val}
                              </div>
                              {g.special && (
                                <div style={{ fontSize: 6, color: G.goldDim, lineHeight: 1.2 }}>★ special</div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Skip button */}
            {!playoffDone && (
              <div className="text-center">
                <Btn onClick={skipPlayoffs} variant="ghost" className="px-8 py-2 text-xs">
                  Skip to End
                </Btn>
              </div>
            )}

            {/* Final result banner */}
            {playoffDone && playoffResult?.champion && (
              <div className="text-center py-8" style={{ background: G.surface, border: `1px solid ${G.gold}` }}>
                <div style={{ ...BEBAS, fontSize: 'clamp(48px, 10vw, 80px)', lineHeight: 1, color: G.gold, letterSpacing: '0.05em' }}>
                  NBA Champions
                </div>
              </div>
            )}
          </div>
        )}

        {/* Playoff stats */}
        {playoffDone && playoffResult && playoffResult.playoffStats.length > 0 && (
          <StatsTable
            stats={playoffResult.playoffStats}
            simEra={simEra}
            title="Playoff Stats"
            subtitle={`Era-adjusted, minutes-scaled per-game averages · ${playoffResult.allGames.length} games`}
            teamActualPPG={playoffResult.allGames.reduce((sum, g) => sum + g.teamScore, 0) / playoffResult.allGames.length}
          />
        )}

        {/* Finals MVP */}
        {playoffDone && playoffResult?.champion && finalsMVP && (
          <div style={{ background: G.surface, border: `1px solid ${G.gold}` }}>
            <div className="px-5 py-3" style={{ borderBottom: `1px solid ${G.gold}44` }}>
              <div className="text-sm uppercase tracking-widest font-semibold" style={{ color: G.gold }}>
                Finals MVP
              </div>
            </div>
            <div className="flex items-center gap-5 px-5 py-4">
              <PlayerHeadshot personId={finalsMVP.player.person_id} size={64} initial={finalsMVP.player.full_name[0]} />
              <div>
                <div style={{ ...BEBAS, fontSize: 26, color: G.gold, letterSpacing: '0.05em', lineHeight: 1 }}>
                  {finalsMVP.player.full_name}
                </div>
                <div className="text-xs mt-2 uppercase tracking-widest" style={{ color: G.grey }}>
                  {finalsMVP.PTS.toFixed(1)} PPG
                  <span className="mx-2" style={{ color: G.border }}>·</span>
                  {finalsMVP.REB.toFixed(1)} RPG
                  <span className="mx-2" style={{ color: G.border }}>·</span>
                  {finalsMVP.AST.toFixed(1)} APG
                  <span className="mx-2" style={{ color: G.border }}>·</span>
                  {((finalsMVP.FG_PCT + finalsMVP.FT_PCT) / 2 * 100).toFixed(1)}% TS
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Share + Play Again — bottom of page, after everything resolves */}
        {allDone && (
          <div className="flex flex-col gap-3">
            <Btn onClick={handleShare} disabled={sharing} variant="outline" className="w-full py-3">
              {sharing ? 'Generating…' : 'Share Result'}
            </Btn>
            <Btn onClick={onRestart} variant="gold" className="w-full py-3">
              Play Again
            </Btn>
          </div>
        )}

      </div>

      {/* Hidden 1080×1080 result card rendered for html2canvas capture */}
      {done && seasonStats.length > 0 && (
        <div
          aria-hidden="true"
          style={{
            position: 'fixed',
            top: '-1100px',
            left: 0,
            pointerEvents: 'none',
            zIndex: -1,
          }}
        >
          <ResultCard
            ref={cardRef}
            simEra={simEra}
            wins={wins}
            losses={losses}
            seasonStats={seasonStats}
            coach={coach}
            teamRating={tr}
            headshots={headshots}
            playoffOutcome={
              madePlayoffs && playoffDone && playoffResult
                ? {
                    champion: playoffResult.champion,
                    eliminatedIn: !playoffResult.champion
                      ? playoffResult.rounds.at(-1)?.name
                      : undefined,
                  }
                : null
            }
            playerAwards={seasonAwards.reduce<Record<string, string[]>>((acc, a) => {
              const id = a.player.player.person_id
              if (!acc[id]) acc[id] = []
              const short =
                a.award === 'League MVP'         ? 'MVP' :
                a.award.startsWith('All-NBA')    ? 'ALL-NBA' :
                a.award === 'All-Star'            ? 'ALL-STAR' :
                a.award === 'Defensive POY'       ? 'DPOY' :
                a.award === '6th Man of the Year' ? '6MOY' : a.award
              acc[id].push(short)
              return acc
            }, {})}
            finalsMVPId={finalsMVP?.player.person_id ?? null}
          />
        </div>
      )}

      {/* Game detail popup */}
      {selectedGame && (() => {
        const { game: g, roundName, gameNum } = selectedGame
        return (
          <div onClick={() => setSelectedGame(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 900, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div onClick={e => e.stopPropagation()} style={{ background: G.surface, border: `1px solid ${g.win ? G.goldDim : G.border}`, width: 320, overflow: 'hidden' }}>
              {/* Win/loss bar */}
              <div style={{ height: 4, background: g.win ? G.gold : G.red }} />
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', borderBottom: `1px solid ${G.border}` }}>
                <div style={{ fontSize: 10, color: G.grey, textTransform: 'uppercase', letterSpacing: '0.2em' }}>{roundName}</div>
                <div style={{ ...BEBAS, fontSize: 14, color: G.goldDim, letterSpacing: '0.1em' }}>Game {gameNum}</div>
              </div>
              {/* Score */}
              <div style={{ textAlign: 'center', padding: '18px 16px 12px' }}>
                <div style={{ fontSize: 9, color: G.grey, textTransform: 'uppercase', letterSpacing: '0.2em', marginBottom: 6 }}>
                  {g.win ? 'WIN' : 'LOSS'}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                  <span style={{ ...BEBAS, fontSize: 52, color: g.win ? G.white : G.grey, lineHeight: 1 }}>{g.teamScore}</span>
                  <span style={{ ...BEBAS, fontSize: 24, color: G.greyDark }}>–</span>
                  <span style={{ ...BEBAS, fontSize: 52, color: G.greyDark, lineHeight: 1 }}>{g.oppScore}</span>
                </div>
                <div style={{ fontSize: 9, color: G.greyDark, letterSpacing: '0.15em', textTransform: 'uppercase', marginTop: 4 }}>Your Team · Opponent</div>
              </div>
              {/* Leaders */}
              <div style={{ borderTop: `1px solid ${G.border}`, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr' }}>
                {([['PTS', g.leaders.pts], ['REB', g.leaders.reb], ['AST', g.leaders.ast]] as [string, { name: string; val: number }][]).map(([label, leader]) => (
                  <div key={label} style={{ padding: '10px 0', textAlign: 'center', borderRight: `1px solid ${G.border}` }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: G.gold, lineHeight: 1 }}>{leader.val}</div>
                    <div style={{ fontSize: 8, color: G.grey, textTransform: 'uppercase', letterSpacing: '0.15em', marginTop: 2 }}>{label}</div>
                    <div style={{ fontSize: 9, color: G.white, marginTop: 3, lineHeight: 1.2 }}>{leader.name}</div>
                  </div>
                ))}
              </div>
              {/* Special performance */}
              {g.special && (
                <div style={{ borderTop: `1px solid ${G.border}`, padding: '10px 16px', background: `${G.gold}0A` }}>
                  <div style={{ fontSize: 8, color: G.goldDim, textTransform: 'uppercase', letterSpacing: '0.2em', marginBottom: 4 }}>★ Special Performance</div>
                  <div style={{ fontSize: 13, color: G.gold, fontWeight: 700 }}>{g.special.playerName}</div>
                  <div style={{ fontSize: 10, color: G.grey, marginTop: 2 }}>
                    {g.special.pts} PTS · {g.special.reb} REB · {g.special.ast} AST
                  </div>
                  <div style={{ fontSize: 9, color: G.goldDim, marginTop: 3, fontStyle: 'italic' }}>{g.special.label}</div>
                </div>
              )}
              {/* Close */}
              <div style={{ borderTop: `1px solid ${G.border}`, padding: '8px 16px', textAlign: 'center' }}>
                <button onClick={() => setSelectedGame(null)} style={{ fontSize: 10, color: G.grey, textTransform: 'uppercase', letterSpacing: '0.2em', background: 'none', border: 'none', cursor: 'pointer' }}>
                  Close
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Share card modal */}
      {shareImageUrl && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.85)',
            zIndex: 1000,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
          }}
          onClick={e => { if (e.target === e.currentTarget) setShareImageUrl(null) }}
        >
          {/* Close button */}
          <button
            onClick={() => setShareImageUrl(null)}
            style={{
              position: 'absolute',
              top: 20,
              right: 24,
              background: 'transparent',
              border: `1px solid ${G.border}`,
              color: G.grey,
              fontSize: 20,
              lineHeight: 1,
              width: 36,
              height: 36,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ×
          </button>

          {/* Card preview */}
          <img
            src={shareImageUrl}
            alt="Era Ball result card"
            style={{
              maxWidth: '90vw',
              maxHeight: '75vh',
              objectFit: 'contain',
              border: `1px solid ${G.border}`,
            }}
          />

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
            <Btn onClick={handleDownload} variant="gold" className="px-8 py-3">
              Download Image
            </Btn>
            <Btn onClick={() => setShareImageUrl(null)} variant="ghost" className="px-8 py-3">
              Close
            </Btn>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Root ─────────────────────────────────────────────────────────────────────
export default function Home() {
  const [phase, setPhase] = useState<GamePhase>('era-select')
  const [simEra, setSimEra] = useState<Era>('90s')
  const [players, setPlayers] = useState<Player[]>([])
  const [coaches, setCoaches] = useState<Coach[]>([])
  const [slots, setSlots] = useState<CourtSlot[]>(emptySlots())
  const [coach, setCoach] = useState<Coach | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch('/players_with_stats.json').then(r => r.json()),
      fetch('/coaches.csv').then(r => r.text()).then(parseCoachesCSV)
    ]).then(([p, c]) => { setPlayers(p); setCoaches(c); setLoading(false) })
      .catch(err => { console.error('Failed to load data:', err); setLoading(false) })
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: G.black }}>
        <div className="text-center">
          <div style={{ ...BEBAS, fontSize: 48, color: G.gold, letterSpacing: '0.3em' }} className="animate-pulse">
            ERA BALL
          </div>
          <div className="text-xs uppercase tracking-widest mt-3" style={{ color: G.greyDark }}>Loading...</div>
        </div>
      </div>
    )
  }

  const restart = () => {
    setPhase('era-select')
    setSlots(emptySlots())
    setCoach(null)
  }

  return (
    <>
      {phase === 'era-select' && <EraSelection onEraSelected={era => { setSimEra(era); setPhase('draft') }} onRestart={restart} />}
      {phase === 'draft' && <DraftScreen simEra={simEra} players={players} onDraftComplete={s => { setSlots(s); setPhase('coach-draft') }} onRestart={restart} />}
      {phase === 'coach-draft' && <CoachDraftScreen coaches={coaches} onCoachSelected={c => { setCoach(c); setPhase('simulation') }} onRestart={restart} />}
      {phase === 'simulation' && coach && <SimulationScreen slots={slots} coach={coach} simEra={simEra} onRestart={restart} />}
    </>
  )
}
