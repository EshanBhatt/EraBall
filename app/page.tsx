'use client'

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import type { Player, Coach, CourtSlot, SlotPosition, Era, GamePhase, PlayerSeasonStats, PlayoffResult, PlayoffGame, PlayerRating } from '../lib/types'
import ResultCard from './ResultCard'
import {
  ALL_ERAS, SLOT_POSITIONS, SLOT_MPG, ERA_SEASON_GAMES, calcFitPenalty, calcEraModifier, calcTeamRating,
  simulateSeason, simulatePlayoffs, calcTS, coachBonus, effectiveCoachBonus, coachChampBonus, playerMatchesEra, withEraStats, applyFlexTag, applyRings, applyAnchors, applyTimeless,
  firstRoundLabel, playerBaseRating, genOppTeamStats, calcTeamDefTotals, calcRebFactor,
} from '../lib/gameLogic'
import type { OppTeamStats } from '../lib/gameLogic'

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
  greyDark: '#aaaaaa',
  red:      '#CC3333',
}

const BEBAS = { fontFamily: 'var(--font-bebas), "Bebas Neue", impact, sans-serif' }

// ─── Tier backgrounds ─────────────────────────────────────────────────────────
function tierBg(player: Player): string {
  const r = playerBaseRating(player, player.era as Era)
  if (r >= 54) return 'linear-gradient(145deg, #0f0620 0%, #1e0c3d 40%, #130826 70%, #0a0415 100%)'  // S: amethyst
  if (r >= 46) return 'linear-gradient(145deg, #2e2000 0%, #6b4800 28%, #3e2a00 60%, #1c1200 100%)'  // A: gold
  if (r >= 38) return 'linear-gradient(145deg, #001508 0%, #002d12 40%, #001c0a 70%, #000e05 100%)'  // B: emerald
  if (r >= 31) return 'linear-gradient(145deg, #040e1c 0%, #0a1e3a 40%, #061428 70%, #020810 100%)'  // C: sapphire
  if (r >= 24) return 'linear-gradient(145deg, #1a0900 0%, #2e1200 40%, #1e0c00 70%, #100600 100%)'  // D: bronze
  if (r >= 16) return 'linear-gradient(145deg, #0e0e0e 0%, #181818 50%, #0e0e0e 100%)'               // E: charcoal
  return '#0a0a0a'                                                                                    // F: flat
}

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
  'Hubie Brown':    { offOverride: 'C' },
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
  'Tex Winter':       { offGuru: true },
  'Rick Adelman*':    { offGuru: true },
  'Dick Motta':       { defGuru: true },
  'Larry Brown*':     { defGuru: true },
  'Chuck Daly*':      { defGuru: true },
  'Jeff Van Gundy':   { defGuru: true },
  'Gregg Popovich*':  { offGuru: true, defGuru: true },
  'Erik Spoelstra':   { offGuru: true, defGuru: true },
  'Pat Riley*':       { offGuru: true, defGuru: true },
  'Red Auerbach*':    { offGuru: true, defGuru: true },
  'Wes Unseld':       { offOverride: 'B', defOverride: 'A' },
  'Wes Unseld Jr.':   { offOverride: 'B', defOverride: 'A' },
  'Richie Guerin':    { offOverride: 'B', defOverride: 'B' },
  'Cotton Fitzsimmons': { offOverride: 'B', defOverride: 'C' },
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
    const regG = regW + regL
    const capF = (g: string) => (regG > 200 && g === 'F' ? 'C' : g)
    const offGrade = capF(guru.offGuru ? 'A' : guru.offOverride ?? (regWLPct >= 0.600 ? 'A' : regWLPct >= 0.550 ? 'B' : regWLPct >= 0.500 ? 'C' : regWLPct >= 0.450 ? 'D' : 'F')) as Coach['offGrade']
    const defGrade = capF(guru.defGuru ? 'A' : guru.defOverride ?? (playoffG === 0 ? 'C' : playoffWLPct >= 0.550 ? 'A' : playoffWLPct >= 0.500 ? 'B' : playoffWLPct >= 0.450 ? 'C' : playoffWLPct >= 0.400 ? 'D' : 'F')) as Coach['defGrade']
    const gradeN = (g: Coach['offGrade']) => ({ A: 4, B: 3, C: 2, D: 1, F: 0 }[g])
    const avg = (gradeN(offGrade) + gradeN(defGrade)) / 2
    const overallGrade = (avg >= 3.5 ? 'A' : avg >= 2.5 ? 'B' : avg >= 1.5 ? 'C' : avg >= 0.5 ? 'D' : 'F') as Coach['overallGrade']
    if (name && regG >= 50) coaches.push({ name, from, to, years: to - from, regG, regW, regL, regWLPct, playoffG, playoffW, playoffL, playoffWLPct, conf, champ, offGrade, defGrade, overallGrade, offGuru: !!guru.offGuru, defGuru: !!guru.defGuru })
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

function TagTooltip({ children, tip }: { children: React.ReactNode; tip: string }) {
  const [show, setShow] = React.useState(false)
  const [coords, setCoords] = React.useState({ top: 0, left: 0 })
  const triggerRef = useRef<HTMLSpanElement>(null)

  const handleEnter = () => {
    if (triggerRef.current) {
      const r = triggerRef.current.getBoundingClientRect()
      setCoords({ top: r.top + window.scrollY, left: r.right + window.scrollX })
    }
    setShow(true)
  }

  return (
    <span ref={triggerRef} style={{ display: 'inline-block' }}
      onMouseEnter={handleEnter} onMouseLeave={() => setShow(false)}>
      {children}
      {show && typeof document !== 'undefined' && createPortal(
        <span style={{
          position: 'absolute',
          top: coords.top - 8,
          left: coords.left - 188,
          background: '#1c1c1c', border: `1px solid ${G.border}`,
          color: G.grey, fontSize: 11, padding: '5px 9px', borderRadius: 4,
          whiteSpace: 'normal', width: 180, zIndex: 9999, pointerEvents: 'none',
          boxShadow: '0 4px 12px rgba(0,0,0,0.5)', lineHeight: 1.4,
          transform: 'translateY(-100%)',
        }}>
          {tip}
        </span>,
        document.body
      )}
    </span>
  )
}

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

function Btn({ children, onClick, disabled, variant = 'gold', className = '', style }: {
  children: React.ReactNode; onClick?: () => void; disabled?: boolean; variant?: 'gold' | 'outline' | 'ghost'; className?: string; style?: React.CSSProperties
}) {
  const base = 'px-6 py-3 text-sm uppercase tracking-[0.15em] font-semibold active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed'
  const styles: Record<string, React.CSSProperties> = {
    gold:    { background: G.gold, color: G.black, border: 'none' },
    outline: { background: 'transparent', color: G.gold, border: `1px solid ${G.gold}` },
    ghost:   { background: 'transparent', color: G.grey, border: `1px solid ${G.border}` },
  }
  return (
    <button onClick={onClick} disabled={disabled} className={`${base} btn-${variant} ${className}`} style={{ ...styles[variant], ...style }}>
      {children}
    </button>
  )
}

// ─── Player headshot ──────────────────────────────────────────────────────────
function PlayerHeadshot({ personId, size, initial, lazy }: { personId: string; size: number; initial?: string; lazy?: boolean }) {
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
        loading={lazy ? 'lazy' : 'eager'}
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
  const r = playerBaseRating(player, player.era as Era)
  const isSTier = r >= 54
  const isATier = r >= 46 && r < 54

  return (
    <div
      draggable={!!onDragStart}
      onDragStart={onDragStart}
      className={`select-none transition-all ${onDragStart ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'}`}
      style={{ position: 'relative', overflow: 'hidden', background: tierBg(player), border: `1px solid ${G.border}`, padding: '16px' }}
    >
      <div className="flex items-start gap-3 mb-3">
        <PlayerHeadshot personId={player.person_id} size={80} initial={player.position?.[0]} />
        <div className="flex-1 flex items-start justify-between min-w-0">
          <div className="min-w-0">
            <div className="font-bold text-white text-base leading-tight truncate">{player.full_name}</div>
            <div className="text-xs mt-0.5 uppercase tracking-wide" style={{ color: G.grey }}>
              {player.position} - {eraLabel(player.era)} - {player.eraTeam ?? (displayEra ? playerTeamForEra(player, displayEra) : player.team_abbreviation)}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 ml-2 shrink-0">
            {player.greatest_75_flag === 'Y' && (
              <TagTooltip tip="Recognized as one of the 75 greatest NBA players of all time, a small boost in every game play play.">
                <span className="text-xs uppercase tracking-wide inline-block transition-transform duration-150 hover:scale-110 cursor-default" style={{ color: G.gold }}>
                  75 Greatest
                </span>
              </TagTooltip>
            )}
            {(player.rings ?? 0) > 0 && (
              <TagTooltip tip="Champions perform better in the playoffs. The more championships, the better the playoff performer.">
                <span className="text-xs uppercase tracking-wide inline-block transition-transform duration-150 hover:scale-110 cursor-default" style={{ color: G.gold, letterSpacing: '0.08em' }}>
                  {player.rings}× Champion
                </span>
              </TagTooltip>
            )}
            {player.defAnchor && (
              <TagTooltip tip={(player.anchorTier ?? 1) === 1 ? "Elite defensive anchor — major impact beyond the stat sheet." : "Solid defensive anchor — meaningful impact beyond the stat sheet. T1 anchors carry a larger boost."}>
                <span className="text-xs uppercase tracking-wide font-bold inline-block transition-transform duration-150 hover:scale-110 cursor-default" style={{ color: '#4A9ECC' }}>
                  Defensive Anchor <span style={{ opacity: 0.7 }}>T{player.anchorTier ?? 1}</span>
                </span>
              </TagTooltip>
            )}
            {player.offAnchor && (
              <TagTooltip tip={(player.anchorTier ?? 1) === 1 ? "Elite offensive engine — major boost to team scoring and ball movement." : "Strong offensive contributor — elevates the team's offense. T1 anchors carry a larger boost."}>
                <span className="text-xs uppercase tracking-wide font-bold inline-block transition-transform duration-150 hover:scale-110 cursor-default" style={{ color: G.gold }}>
                  Offensive Anchor <span style={{ opacity: 0.7 }}>T{player.anchorTier ?? 1}</span>
                </span>
              </TagTooltip>
            )}
            {player.timeless && (
              <TagTooltip tip="Transcendent skill set — minimal era penalties across all decades. Minor penalty only if 6+ eras from home era.">
                <span className="text-xs uppercase tracking-wide font-bold inline-block transition-transform duration-150 hover:scale-110 cursor-default" style={{ color: '#C084FC' }}>
                  Timeless
                </span>
              </TagTooltip>
            )}
            {player.flexPositions && (
              <TagTooltip tip="Can play multiple positions outside of their natural position, without penalty..">
                <span className="text-xs px-1.5 py-0.5 uppercase tracking-wide font-bold inline-block transition-transform duration-150 hover:scale-110 cursor-default" style={{ color: '#4A9ECC', border: `1px solid #2A6E99`, background: `#4A9ECC18` }}>
                  FLEX
                </span>
              </TagTooltip>
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
          <div key={String(k)} className="text-center py-3" style={{ background: 'rgba(0,0,0,0.55)' }}>
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
          <div key={String(k)} className="text-center py-2" style={{ background: 'rgba(0,0,0,0.45)' }}>
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
          <div key={String(k)} className="text-center py-2" style={{ background: 'rgba(0,0,0,0.45)' }}>
            <div className="text-xs font-medium" style={{ color: isEst ? G.grey : G.white }}>{v}</div>
            <div className="text-xs" style={{ color: G.greyDark }}>{k}</div>
          </div>
        ))}
      </div>
      <div className="mt-2 text-xs text-center" style={{ color: G.greyDark }}>
        {(() => {
          if (!activeEra && !player.eraTeam) return `${player.from_year}–${player.to_year ?? 'present'}`
          const seasons = Math.max(1, Math.ceil(player.GP / 82))
          return `${seasons} ${seasons === 1 ? 'season' : 'seasons'}`
        })()}
      </div>
      {isSTier && (<>
        <div className="card-sheen-beam" />
        <div className="card-amethyst-sparkles">{Array.from({length:10}).map((_,i)=><span key={i}/>)}</div>
      </>)}
      {isATier && (<>
        <div className="card-sheen-beam" />
        <div className="card-gold-sparkles">{Array.from({length:10}).map((_,i)=><span key={i}/>)}</div>
      </>)}
    </div>
  )
}

// ─── Court slot ───────────────────────────────────────────────────────────────
function CourtSlotView({ slot, onClick, onDrop, highlighted, pendingPlayer, activePlayer, simEra, sandboxMode, onRemove }: {
  slot: CourtSlot; onClick: () => void; onDrop: () => void; highlighted: boolean
  pendingPlayer?: Player | null; activePlayer?: Player | null; simEra?: Era
  sandboxMode?: boolean; onRemove?: () => void
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
      className={`relative overflow-hidden cursor-pointer court-slot${confirmed ? ' court-slot--filled' : ''}`}
      style={{
        minHeight: 140,
        background: isPending ? `${G.gold}0a` : confirmed ? tierBg(confirmed) : G.black,
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
      {isPending && <div className="slot-pending-glow" />}
      {/* Position label + minutes (bench only) */}
      <div className="absolute top-1 left-1.5" style={{ lineHeight: 1 }}>
        <div style={{ ...BEBAS, letterSpacing: '0.1em' }} className="text-[11px] md:text-[16px]">
          <span style={{ color: G.goldDim }}>{slot.position}</span>
        </div>
      </div>

      {/* Sandbox remove button on filled slots */}
      {sandboxMode && confirmed && onRemove && (
        <button
          className="absolute top-1 right-1.5 z-10"
          style={{ lineHeight: 1, color: G.greyDark, fontSize: 13, fontWeight: 700, padding: '0 2px' }}
          onClick={e => { e.stopPropagation(); onRemove() }}
          aria-label="Remove player"
        >×</button>
      )}

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

      {confirmed && (() => {
        const cr = playerBaseRating(confirmed, confirmed.era as Era)
        if (cr >= 54) return (<>
          <div className="card-sheen-beam" />
          <div className="card-amethyst-sparkles">{Array.from({length:10}).map((_,i)=><span key={i}/>)}</div>
        </>)
        if (cr >= 46) return (<>
          <div className="card-sheen-beam" />
          <div className="card-gold-sparkles">{Array.from({length:10}).map((_,i)=><span key={i}/>)}</div>
        </>)
        return null
      })()}
      {confirmed ? (
        <div className="flex flex-col items-center px-2 pb-2 pt-5 gap-1.5">
          <PlayerHeadshot personId={confirmed.person_id} size={52} initial={confirmed.position?.[0]} />
          <div className="w-full text-center min-w-0">
            <div className="font-semibold text-white leading-tight truncate" style={{ fontSize: 11 }}>{confirmed.full_name}</div>
            <div style={{ color: G.grey, fontSize: 10 }} className="mt-0.5 truncate">{confirmed.position} - {eraLabel(confirmed.era)}</div>
            {/* Desktop: x.x ppg / x.x rpg / x.x apg */}
            <div className="hidden md:flex justify-center items-baseline gap-1 mt-1 flex-wrap" style={{ fontSize: 10 }}>
              <span style={{ color: G.gold, fontWeight: 700 }}>{confirmed.PTS?.toFixed(1)}</span>
              <span style={{ color: G.greyDark, fontSize: 8 }}>ppg</span>
              <span style={{ color: G.greyDark }}>·</span>
              <span style={{ color: G.grey }}>{confirmed.REB?.toFixed(1)}</span>
              <span style={{ color: G.greyDark, fontSize: 8 }}>rpg</span>
              <span style={{ color: G.greyDark }}>·</span>
              <span style={{ color: G.grey }}>{confirmed.AST?.toFixed(1)}</span>
              <span style={{ color: G.greyDark, fontSize: 8 }}>apg</span>
            </div>
            {/* Mobile: pts/reb/ast rounded to nearest whole number */}
            <div className="flex md:hidden justify-center mt-1" style={{ fontSize: 11, color: G.gold, fontWeight: 700 }}>
              {Math.round(confirmed.PTS ?? 0)}<span style={{ color: G.greyDark }}>/</span>{Math.round(confirmed.REB ?? 0)}<span style={{ color: G.greyDark }}>/</span>{Math.round(confirmed.AST ?? 0)}
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
        <div className="flex flex-col items-center px-2 pb-2 pt-5 gap-1.5 slot-player-enter">
          <PlayerHeadshot personId={pendingPlayer.person_id} size={52} initial={pendingPlayer.position?.[0]} />
          <div className="w-full text-center min-w-0">
            <div className="font-semibold text-white leading-tight truncate" style={{ fontSize: 11 }}>{pendingPlayer.full_name}</div>
            <div style={{ color: G.grey, fontSize: 10 }} className="mt-0.5">{pendingPlayer.position} - {eraLabel(pendingPlayer.era)}</div>
            {pendingFitLabel && <div className="mt-1" style={{ fontSize: 10, color: fitLabelColor(pendingFitLabel) }}>{pendingFitLabel}</div>}
            {simEra && (() => { const mod = calcEraModifier(pendingPlayer, simEra); return (
              <div className="mt-0.5" style={{ fontSize: 9, color: mod >= 1.0 ? G.gold : mod >= 0.75 ? G.grey : G.red, letterSpacing: '0.05em' }}>
                Era Fit {Math.round(mod * 100)}%
              </div>
            ) })()}
            <div style={{ fontSize: 9, color: G.goldDim, letterSpacing: '0.08em', textTransform: 'uppercase' }} className="mt-1 sm:hidden">Pending - Tap to lock {slot.position}</div>
            <div style={{ fontSize: 9, color: G.goldDim, letterSpacing: '0.08em', textTransform: 'uppercase' }} className="mt-1 hidden sm:block">Pending - Click to lock {slot.position}</div>
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
  '50s': { style: 'Slow, physical, half-court basketball. No 3-point line, and very low scoring. Big men ruled the paint.', note: 'Pre-3pt - Modern shooters lose value here' },
  '60s': { style: 'Dominant big men, intense defense. Bill Russell era. Athleticism beginning to shape the game.', note: 'Pre-3pt - Modern shooters lose value here' },
  '70s': { style: 'ABA Merger. Brutal physical defense. Kareem\'s sky hook.', note: 'Pre-3pt - Modern shooters lose value here' },
  '80s': { style: '3-point line introduced in the league. Magic vs Bird.', note: '3pt era begins - Pre-3pt bigs take a cut' },
  '90s': { style: 'All time Defenses, Lower scoring. Hand-checking allowed. The Jordan era.', note: 'Defense Era - Most eras cross over cleanly' },
  '00s': { style: 'Post-Jordan transition. the Shaq and Kobe Era. Rising international talent. Introduction of the 4 round, best of 7 Playoffs. ', note: 'Bridge era - Minimal penalties most directions' },
  '10s': { style: '3-point volume surges. Steph vs Lebron. Rise of Positionless basketball.', note: 'Near-modern - Very low era penalties' },
  '20s': { style: 'Peak spacing, pace, and 3-point volume. Versatility is everything. Old-school bigs and pre-3pt era (50s/60s/70s) players struggle most here.', note: 'Current era - 2020s players at full strength' },
}

// ─── How To Play modal ────────────────────────────────────────────────────────
const HOW_TO_PLAY_STEPS = [
  {
    title: 'Pick Your Simulation Era',
    body: 'Choose a decade: 50s through the 2020s. This is the era of basketball your season will be simulated in. Following the Era rules and trends.',
  },
  {
    title: 'Spin to Draft',
    body: 'Each spin lands on a franchise and an ERA of that franchise. Choose one player from all the players who played for that team during that era to fill an open slot. You get only ONE respin for the entire draft.',
  },
  {
    title: 'Fill 9 Spots',
    body: '5 starters (PG - SG - SF - PF - C) and 4 bench players. Starters play 35 minutes per game, and carry more weight in the simulation. Bench players contribute at a reduced rate.',
  },
  {
    title: 'Positional Fit',
    body: 'Playing a player at their natural position = no penalty. One position off = −10% rating. Way out of position = −25%. FLEX players like LeBron, Jokić, and Giannis can fill multiple slots with no penalty.',
  },
  {
    title: 'Era Modifier',
    body: 'Every player performs best in their home decade. Each era away is a larger era penalty Pre-3PT players (50s–70s) face an extra penalty in modern eras. Players selected within their ers have no penalty.',
  },
  {
    title: 'Special Players - IMPORTANT',
    body: 'Special contributors carry special tags. Defensive Anchors (Draymond, Tony Allen, Aaron Gordon, Kawhi, etc.) get a boost to their impact, beyond their stats. Offensive Anchors (LeBron, Jokić, Luka, Embiid, etc.) give an offensive boost to the team. Championship players perform better in the playoffs. The more championships they have, the better performances they will have when the lights are the brightest.',
  },
  {
    title: 'Draft a Coach',
    body: 'Your coach has separate Offense and Defense grades (A–F). Offensive coaches boost scoring, defensive coaches limit opponents. Guru tags (OFF GURU / DEF GURU) excel at that side of the ball. Championship-winning coaches carry an extra bonus. The more Championships, the higher bonus.',
  },
  {
    title: 'Simulate the Season',
    body: 'Your team plays a regular season (72 games in the 50s/60s, 82 otherwise). Win 50%+ to make the playoffs. Navigate an era-accurate bracket to win the championship. Player performance will vary each run based on team spacing, coaching, playmaking, defense and role fit. The same stars won\'t always get the same result.',
  },
  {
    title: 'Awards & Stats',
    body: 'MVP, All-NBA, All-Star, Defensive POY, and 6th Man are awarded based on simulated stats.',
  },
]

function HowToPlayModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
      onClick={onClose}
    >
      <div
        className="roster-scroll"
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

          {/* Tier legend */}
          <div style={{ borderTop: `1px solid ${G.border}`, paddingTop: 20 }}>
            <div style={{ ...BEBAS, fontSize: 16, color: G.white, letterSpacing: '0.15em', marginBottom: 12 }}>PLAYER TIERS</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { label: 'S', color: '#9b6dff', bg: 'linear-gradient(90deg, #1e0c3d, #0a0415)', desc: 'All-time legends.' },
                { label: 'A', color: '#C9A84C', bg: 'linear-gradient(90deg, #6b4800, #1c1200)', desc: 'Star players.' },
                { label: 'B', color: '#4caf78', bg: 'linear-gradient(90deg, #002d12, #000e05)', desc: 'Solid starters.' },
                { label: 'C', color: '#5b8fd4', bg: 'linear-gradient(90deg, #0a1e3a, #020810)', desc: 'Quality rotation players.' },
                { label: 'D', color: '#c47a35', bg: 'linear-gradient(90deg, #2e1200, #100600)', desc: 'Role players and specialists.' },
                { label: 'E', color: '#666',    bg: 'linear-gradient(90deg, #181818, #0e0e0e)', desc: 'Bench depth.' },
                { label: 'F', color: '#444',    bg: '#0a0a0a',                                   desc: 'Deep bench / minimal impact.' },
              ].map(t => (
                <div key={t.label} style={{ display: 'flex', alignItems: 'center', gap: 10, background: t.bg, border: `1px solid ${G.border}`, padding: '6px 10px' }}>
                  <div style={{ ...BEBAS, fontSize: 18, color: t.color, width: 18, flexShrink: 0, textAlign: 'center' }}>{t.label}</div>
                  <div style={{ fontSize: 12, color: G.grey, lineHeight: 1.4 }}>{t.desc}</div>
                </div>
              ))}
            </div>
          </div>
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
              style={{ background: 'none', border: `1px solid ${G.border}`, color: G.grey, padding: '4px 12px', cursor: 'pointer', letterSpacing: '0.2em', transition: 'color 0.12s ease, border-color 0.12s ease' }}
              onMouseEnter={e => { e.currentTarget.style.color = G.gold; e.currentTarget.style.borderColor = G.gold }}
              onMouseLeave={e => { e.currentTarget.style.color = G.grey; e.currentTarget.style.borderColor = G.border }}
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
function EraSelection({ onEraSelected, onSandboxSelected, onRestart }: { onEraSelected: (era: Era) => void; onSandboxSelected: (era: Era) => void; onRestart: () => void }) {
  const [spinning, setSpinning] = useState(false)
  const [era, setEra] = useState<Era | null>(null)
  const [showHelp, setShowHelp] = useState(() => {
    try { return !localStorage.getItem('eraball_seen_help') } catch { return true }
  })
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

  const stepEra = (dir: 1 | -1) => {
    if (spinning) return
    const idx = era ? ALL_ERAS.indexOf(era) : -1
    const next = ALL_ERAS[Math.max(0, Math.min(ALL_ERAS.length - 1, idx + dir))]
    if (next !== era) selectEra(next)
  }

  // Prefetch all era banner images so they're cached before the user clicks
  React.useEffect(() => {
    ALL_ERAS.forEach(era => { const img = new Image(); img.src = `/era-banners/${era}.webp` })
  }, [])

  // Keyboard arrow navigation
  React.useEffect(() => {
    const handler = (ev: KeyboardEvent) => {
      if (ev.key === 'ArrowRight') stepEra(1)
      if (ev.key === 'ArrowLeft')  stepEra(-1)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  })

  return (
    <div className="min-h-screen flex flex-col" style={{ background: G.black }}>
      <TopBar onRestart={onRestart} />

      <div className="flex-1 flex flex-col items-center justify-center px-4 gap-10" style={{ overflowX: 'hidden' }}>
        {/* Selected era display */}
        <div className="text-center" style={{ minHeight: displayEra ? 260 : 0, width: '100%' }}>
          {displayEra && (
            <div>
              <div className="text-xs uppercase tracking-[0.4em] mb-2" style={{ color: G.grey }}>Simulation Era</div>
              <div style={{ position: 'relative', width: '100%', maxWidth: 680, margin: '0 auto' }}>
                {/* Era banner image — overlay gradient divs replace CSS mask for universal browser support */}
                <img
                  key={displayEra}
                  src={`/era-banners/${displayEra}.webp`}
                  alt=""
                  className="era-banner-img"
                  onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none', zIndex: 0 }}
                />
                {/* Left/right fade */}
                <div style={{ position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none', background: 'linear-gradient(to right, #000 0%, transparent 18%, transparent 82%, #000 100%)' }} />
                {/* Top/bottom fade */}
                <div style={{ position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none', background: 'linear-gradient(to bottom, #000 0%, transparent 20%, transparent 80%, #000 100%)' }} />
                <div style={{ ...BEBAS, fontSize: 'clamp(80px, 18vw, 160px)', lineHeight: 0.9, color: spinning ? G.greyDark : G.white, letterSpacing: '0.02em', position: 'relative', zIndex: 2, padding: '24px 48px', textShadow: '0 2px 4px rgba(0,0,0,0.9), 0 4px 24px rgba(0,0,0,0.8), 0 0 60px rgba(0,0,0,0.6)' }}>
                  <span className="slot-reel-window">
                    <span
                      key={spinKey}
                      className={spinning || spinPhase === 'land' ? `slot-reel${spinPhase === 'slow' ? ' slot-reel--slow' : spinPhase === 'land' ? ' slot-reel--land' : ''}` : ''}
                    >
                      {eraLabel(displayEra)}
                    </span>
                  </span>
                </div>
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
                    fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase',
                    color: G.goldDim, border: `1px solid ${G.goldDim}`,
                  }}>
                    {ERA_DESC[era].note}
                  </div>
                  <div className="mt-3 text-xs" style={{ color: G.greyDark, letterSpacing: '0.04em' }}>
                    Players perform best in their home era - drafting across decades applies a rating penalty
                  </div>
                </>
              )}
            </div>
          )}
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
            <Btn onClick={() => onEraSelected(era)} variant="gold" className="w-48 py-4 text-base" style={{ animation: 'begin-draft-pulse 2s ease-in-out infinite' }}>
              Begin Draft
            </Btn>
          )}
          <button
            onClick={() => setShowHelp(true)}
            className="text-xs uppercase tracking-widest"
            style={{ background: 'none', border: 'none', color: G.greyDark, padding: '2px 0', cursor: 'pointer', letterSpacing: '0.2em', transition: 'color 0.12s ease' }}
            onMouseEnter={e => { e.currentTarget.style.color = G.gold }}
            onMouseLeave={e => { e.currentTarget.style.color = G.greyDark }}
          >
            How to Play
          </button>
          {era && !spinning && (
            <>
              <span className="text-xs uppercase tracking-widest" style={{ color: G.greyDark }}>or play</span>
              <Btn onClick={() => onSandboxSelected(era)} variant="ghost" className="w-48 py-3 text-sm">
                Sandbox
              </Btn>
            </>
          )}
        </div>
      </div>
      {showHelp && <HowToPlayModal onClose={() => {
        try { localStorage.setItem('eraball_seen_help', '1') } catch {}
        setShowHelp(false)
      }} />}
    </div>
  )
}

// ─── Phase 2: Draft ───────────────────────────────────────────────────────────
function DraftScreen({ simEra, players, onDraftComplete, onRestart, startInSandbox, greyscaleBtn }: {
  simEra: Era; players: Player[]; onDraftComplete: (slots: CourtSlot[]) => void; onRestart: () => void; startInSandbox?: boolean; greyscaleBtn?: React.ReactNode
}) {
  const [slots, setSlots] = useState<CourtSlot[]>(emptySlots())
  const [spinning, setSpinning] = useState(false)
  const [rosterPool, setRosterPool] = useState<Player[]>([])
  const [sortBy, setSortBy] = useState<'SPECIAL' | 'PTS' | 'REB' | 'AST' | 'TS' | 'STL' | 'BLK'>('PTS')
  const [posFilter, setPosFilter] = useState<'G' | 'F' | 'C' | null>(null)
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null)
  const [rosterCardPlayer, setRosterCardPlayer] = useState<Player | null>(null)
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
  const isLocalhost = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  const [devMode, setDevMode] = useState(false)
  const [devTeam, setDevTeam] = useState(NBA_TEAMS[0])
  const [devEra, setDevEra] = useState<Era>(ALL_ERAS[6]) // default 10s
  const [devPlayerSearch, setDevPlayerSearch] = useState('')
  const [sandboxMode, setSandboxMode] = useState(startInSandbox ?? false)
  const [sandboxTeam, setSandboxTeam] = useState(NBA_TEAMS[0])
  const [sandboxEra, setSandboxEra] = useState<Era>(ALL_ERAS[6])
  const [sandboxTeamSearch, setSandboxTeamSearch] = useState('')
  const [sandboxTeamOpen, setSandboxTeamOpen] = useState(false)
  const [sandboxPlayerMode, setSandboxPlayerMode] = useState(false)
  const [sandboxPlayerSearch, setSandboxPlayerSearch] = useState('')

  const filledCount = slots.filter(s => s.player !== null).length
  const visiblePoolRef = useRef<Player[]>([])

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

  const sandboxValidEras = useMemo(
    () => new Set(validCombos.filter(c => c.team === sandboxTeam).map(c => c.era)),
    [validCombos, sandboxTeam]
  )

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
          setRosterPool([...pool].map(p => applyTimeless(applyAnchors(applyRings(applyFlexTag(withEraStats(p, era, team)))))).sort((a, b) => (b.PTS ?? 0) - (a.PTS ?? 0)))
          setSpinning(false)
          return ids
        })
      }
    }
    setTimeout(doTick, schedule[ticks++])
  }, [players, allTeams, validCombos, rosterPool, respinUsed])

  const removeSlotPlayer = (idx: number) => {
    const p = slots[idx].player
    if (!p) return
    setSlots(prev => prev.map((s, i) => i === idx ? { ...s, player: null, fitPenalty: 0, fitLabel: null } : s))
    setDraftedIds(prev => { const next = new Set(prev); next.delete(p.person_id); return next })
    setSelectedPlayer(null); setPendingSlotIdx(null)
  }

  const previewSlot = (idx: number) => {
    if (slots[idx].player !== null) { setRosterCardPlayer(slots[idx].player); return }
    if (!selectedPlayer) return
    if (pendingSlotIdx === idx) { confirmPick(); return }
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
    if (window.innerWidth < 640) requestAnimationFrame(() => {
      document.documentElement.scrollTo({ top: 0, behavior: 'smooth' })
    })
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && pendingSlotIdx !== null && selectedPlayer) { confirmPick(); return }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const pool = visiblePoolRef.current
        if (pool.length === 0) return
        e.preventDefault()
        const cur = selectedPlayer ? pool.findIndex(p => p.person_id === selectedPlayer.person_id) : -1
        const next = e.key === 'ArrowDown' ? Math.min(cur + 1, pool.length - 1) : Math.max(cur - 1, 0)
        const p = pool[next]
        if (p) {
          setSelectedPlayer(p); setHighlightEmpty(true); setPendingSlotIdx(null)
          requestAnimationFrame(() => document.getElementById(`player-row-${p.person_id}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }))
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [pendingSlotIdx, selectedPlayer])

  // Prefetch headshots for the first 20 roster players as soon as the pool loads
  useEffect(() => {
    if (rosterPool.length === 0) return
    rosterPool.slice(0, 20).forEach(p => {
      const img = new Image()
      img.src = `/api/headshot?id=${p.person_id}`
    })
  }, [rosterPool])

  const loadDevRoster = () => {
    setDraftedIds(ids => {
      const isAll = devTeam === 'ALL'
      const pool = players.filter(p => {
        if (!playerMatchesEra(p, devEra) || ids.has(p.person_id)) return false
        if (isAll) return true
        const eraTeams = p.all_teams_by_era?.[devEra] as string[] | undefined
        return eraTeams ? eraTeams.includes(devTeam) : playerTeamForEra(p, devEra) === devTeam
      })
      if (pool.length === 0) { alert(`No players found for ${devEra}`); return ids }
      const sorted = [...pool].map(p => {
        const team = isAll
          ? ((p.all_teams_by_era?.[devEra] as string[] | undefined)?.[0] ?? p.team_abbreviation)
          : devTeam
        return applyTimeless(applyAnchors(applyRings(applyFlexTag(withEraStats(p, devEra, team)))))
      }).sort((a, b) => (b.PTS ?? 0) - (a.PTS ?? 0))
      setLockedTeam(devTeam); setLockedEra(devEra)
      setSpinTeamDisplay(isAll ? devEra : devTeam); setSpinEraDisplay(devEra)
      setRosterPool(sorted)
      setSelectedPlayer(null); setPendingSlotIdx(null); setHighlightEmpty(false); setAwaitingSpin(false)
      return ids
    })
  }

  const loadSandboxRoster = () => {
    setDraftedIds(ids => {
      const pool = players.filter(p => {
        if (!playerMatchesEra(p, sandboxEra) || ids.has(p.person_id)) return false
        const eraTeams = p.all_teams_by_era?.[sandboxEra] as string[] | undefined
        return eraTeams ? eraTeams.includes(sandboxTeam) : playerTeamForEra(p, sandboxEra) === sandboxTeam
      })
      if (pool.length === 0) { alert(`No players found for ${sandboxTeam} - ${sandboxEra}`); return ids }
      const sorted = pool.map(p => applyTimeless(applyAnchors(applyRings(applyFlexTag(withEraStats(p, sandboxEra, sandboxTeam))))))
        .sort((a, b) => (b.PTS ?? 0) - (a.PTS ?? 0))
      setLockedTeam(sandboxTeam); setLockedEra(sandboxEra)
      setSpinTeamDisplay(sandboxTeam); setSpinEraDisplay(sandboxEra)
      setRosterPool(sorted)
      setSelectedPlayer(null); setPendingSlotIdx(null); setHighlightEmpty(false); setAwaitingSpin(false)
      return ids
    })
  }

  const loadPlayerVersions = () => {
    const query = sandboxPlayerSearch.trim().toLowerCase()
    if (!query) return
    const match = players.find(p => p.full_name.toLowerCase().includes(query))
    if (!match) { alert(`No player found matching "${sandboxPlayerSearch}"`); return }
    const versions: Player[] = []
    const seen = new Set<string>()
    for (const key of Object.keys(match.stats_by_era ?? {})) {
      const [era, team] = key.split(':') as [Era, string]
      if (!era || !team || seen.has(key)) continue
      seen.add(key)
      versions.push(applyTimeless(applyAnchors(applyRings(applyFlexTag(withEraStats(match, era, team))))))
    }
    if (versions.length === 0) { alert(`No era stats found for ${match.full_name}`); return }
    versions.sort((a, b) => ALL_ERAS.indexOf(a.era as Era) - ALL_ERAS.indexOf(b.era as Era))
    setDraftedIds(ids => {
      setLockedTeam(match.full_name); setLockedEra(null)
      setSpinTeamDisplay(match.full_name); setSpinEraDisplay(versions[0].era as Era)
      setRosterPool(versions)
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
      .map(({ p }) => applyTimeless(applyRings(applyFlexTag(withEraStats(p, p.era as Era, p.team_abbreviation)))))
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
      const player = applyTimeless(applyRings(applyFlexTag(withEraStats(picks[i], picks[i].era as Era, picks[i].team_abbreviation))))
      const { penalty, label } = calcFitPenalty(player, pos)
      return { position: pos, player, fitPenalty: penalty, fitLabel: label }
    })
    setSlots(newSlots)
    setDraftedIds(new Set(picks.map(p => p.person_id)))
    setSelectedPlayer(null); setPendingSlotIdx(null); setHighlightEmpty(false)
    setRosterPool([]); setAwaitingSpin(false)
  }

  const fillDevPreset = () => {
    const preset: { name: string; era: Era; team: string; slot: SlotPosition }[] = [
      { name: 'Damian Lillard',          era: '10s', team: 'POR', slot: 'PG' },
      { name: 'Michael Jordan',          era: '90s', team: 'CHI', slot: 'SG' },
      { name: 'LeBron James',            era: '10s', team: 'CLE', slot: 'SF' },
      { name: 'Aaron Gordon',            era: '20s', team: 'DEN', slot: 'PF' },
      { name: 'Andre Drummond',          era: '10s', team: 'DET', slot: 'C'  },
      { name: 'Donovan Mitchell',        era: '20s', team: 'UTA', slot: 'B1' },
      { name: 'Shai Gilgeous-Alexander', era: '20s', team: 'OKC', slot: 'B2' },
      { name: 'Steve Nash',              era: '10s', team: 'LAL', slot: 'B3' },
      { name: 'Trae Young',              era: '10s', team: 'ATL', slot: 'B4' },
    ]
    const newSlots = emptySlots()
    const drafted = new Set<string>()
    for (const { name, era, team, slot } of preset) {
      // Match by exact name + all_teams_by_era (not the player's primary era field)
      const match = players.find(p => {
        if (p.full_name !== name) return false
        const teamsForEra = (p.all_teams_by_era as Record<string, string[]>)?.[era]
        return teamsForEra?.includes(team)
      })
      if (!match) continue
      const tagged = applyTimeless(applyRings(applyFlexTag(withEraStats(match, era, team))))
      const slotIdx = SLOT_POSITIONS.indexOf(slot)
      const { penalty, label } = calcFitPenalty(tagged, slot)
      newSlots[slotIdx] = { position: slot, player: tagged, fitPenalty: penalty, fitLabel: label }
      drafted.add(match.person_id)
    }
    setSlots(newSlots)
    setDraftedIds(drafted)
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
          {isLocalhost && <button
            onClick={() => { setDevMode(d => !d); if (sandboxMode) setSandboxMode(false) }}
            className={`text-xs uppercase tracking-widest px-2 py-1 dev-btn${devMode ? ' dev-btn--active' : ''}`}
            style={{
              color: devMode ? G.black : G.greyDark,
              background: devMode ? G.gold : 'transparent',
              border: `1px solid ${devMode ? G.gold : G.border}`,
            }}
            title="Developer mode — pick team/era directly"
          >DEV</button>}
          {greyscaleBtn}
        </div>
      } />

      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.4fr] gap-6">

          {/* ── Left: Spin Panel ── */}
          <div className="space-y-4">

            {sandboxMode ? (
              /* ── Sandbox mode: team/era picker for all users ── */
              <div style={{ border: `1px solid ${G.gold}33`, background: G.surface }}>
                <div className="px-3 py-2 flex items-center justify-between" style={{ borderBottom: `1px solid ${G.border}`, background: `${G.gold}0a` }}>
                  <div className="flex items-center gap-2">
                    <span className="text-xs uppercase tracking-widest" style={{ color: G.gold }}>Sandbox</span>
                    <span className="text-xs" style={{ color: G.greyDark }}>— {sandboxPlayerMode ? 'search by player' : 'pick any team / era'}</span>
                  </div>
                  <div className="flex" style={{ border: `1px solid ${G.border}` }}>
                    {(['Team', 'Player'] as const).map(mode => (
                      <button
                        key={mode}
                        onClick={() => setSandboxPlayerMode(mode === 'Player')}
                        className="text-xs uppercase tracking-widest px-2 py-1"
                        style={{
                          background: (mode === 'Player') === sandboxPlayerMode ? `${G.gold}22` : 'transparent',
                          color: (mode === 'Player') === sandboxPlayerMode ? G.gold : G.greyDark,
                          border: 'none', cursor: 'pointer',
                        }}
                      >{mode}</button>
                    ))}
                  </div>
                </div>
                <div className="p-3 space-y-3">
                  {sandboxPlayerMode ? (
                    <>
                      <div>
                        <div className="text-xs uppercase tracking-widest mb-1" style={{ color: G.grey }}>Player Name</div>
                        <input
                          type="text"
                          value={sandboxPlayerSearch}
                          onChange={e => setSandboxPlayerSearch(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') loadPlayerVersions() }}
                          placeholder="e.g. LeBron James"
                          className="w-full px-3 py-2 text-sm"
                          style={{ background: G.surface2, border: `1px solid ${G.border}`, color: G.white, outline: 'none', fontSize: 16 }}
                        />
                      </div>
                      <Btn onClick={loadPlayerVersions} variant="outline" className="w-full py-3">
                        Load Player
                      </Btn>
                    </>
                  ) : (
                  <>
                  <div className="relative">
                    <div className="text-xs uppercase tracking-widest mb-1" style={{ color: G.grey }}>Team</div>
                    <input
                      type="text"
                      value={sandboxTeamSearch || (sandboxTeamOpen ? '' : sandboxTeam)}
                      onFocus={() => { setSandboxTeamOpen(true); setSandboxTeamSearch('') }}
                      onBlur={() => setTimeout(() => { setSandboxTeamOpen(false); setSandboxTeamSearch('') }, 150)}
                      onChange={e => {
                        const val = e.target.value.toUpperCase()
                        setSandboxTeamSearch(val)
                        setSandboxTeamOpen(true)
                      }}
                      placeholder="Search team..."
                      className="w-full px-3 py-2 text-sm font-semibold"
                      style={{ background: G.surface2, border: `1px solid ${G.border}`, color: G.white, outline: 'none', fontSize: 16 }}
                    />
                    {sandboxTeamOpen && (
                      <div className="roster-scroll" style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: G.surface2, border: `1px solid ${G.border}`, borderTop: 'none', maxHeight: 200, overflowY: 'auto', zIndex: 50 }}>
                        {allTeams.filter(t => !sandboxTeamSearch || t.startsWith(sandboxTeamSearch)).map(t => (
                          <div
                            key={t}
                            onMouseDown={() => {
                              setSandboxTeam(t)
                              setSandboxTeamSearch('')
                              setSandboxTeamOpen(false)
                              const validEras = new Set(validCombos.filter(c => c.team === t).map(c => c.era))
                              if (!validEras.has(sandboxEra)) {
                                const first = ALL_ERAS.find(era => validEras.has(era))
                                if (first) setSandboxEra(first)
                              }
                            }}
                            style={{
                              padding: '7px 12px', cursor: 'pointer', fontSize: 13,
                              color: t === sandboxTeam ? G.gold : G.white,
                              background: t === sandboxTeam ? `${G.gold}18` : 'transparent',
                              borderBottom: `1px solid ${G.border}`,
                            }}
                            onMouseEnter={e => (e.currentTarget.style.background = `${G.gold}22`)}
                            onMouseLeave={e => (e.currentTarget.style.background = t === sandboxTeam ? `${G.gold}18` : 'transparent')}
                          >{t}</div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-widest mb-1" style={{ color: G.grey }}>Era</div>
                    <select
                      value={sandboxEra}
                      onChange={e => setSandboxEra(e.target.value as Era)}
                      className="w-full px-3 py-2 text-sm font-semibold"
                      style={{ background: G.surface2, border: `1px solid ${G.border}`, color: G.gold, outline: 'none', fontSize: 16 }}
                    >
                      {ALL_ERAS.map(era => (
                        <option key={era} value={era} disabled={!sandboxValidEras.has(era)}
                          style={{ color: sandboxValidEras.has(era) ? undefined : G.greyDark }}>
                          {era}
                        </option>
                      ))}
                    </select>
                  </div>
                  <Btn onClick={loadSandboxRoster} variant="outline" className="w-full py-3">
                    Load Roster
                  </Btn>
                  </>
                  )}
                </div>
              </div>
            ) : devMode ? (
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
                      <option value="ALL">— ALL —</option>
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
                  <Btn onClick={fillDevPreset} variant="ghost" className="w-full py-3">
                    Preset Roster
                  </Btn>

                  <div>
                    <div className="text-xs uppercase tracking-widest mb-1" style={{ color: G.grey }}>Search Player</div>
                    <input
                      type="text"
                      placeholder="Player name..."
                      value={devPlayerSearch}
                      onChange={e => setDevPlayerSearch(e.target.value)}
                      style={{ width: '100%', background: G.surface2, border: `1px solid ${G.border}`, color: G.white, padding: '8px 12px', fontSize: 13, outline: 'none' }}
                    />
                    {devPlayerSearch.length > 1 && (
                      <div className="roster-scroll" style={{ background: G.surface2, border: `1px solid ${G.border}`, borderTop: 'none', maxHeight: 200, overflowY: 'auto' }}>
                        {players
                          .filter(p => p.full_name.toLowerCase().includes(devPlayerSearch.toLowerCase()))
                          .slice(0, 10)
                          .map(p => (
                            <div
                              key={p.person_id}
                              onClick={() => {
                                const tagged = applyTimeless(applyRings(applyFlexTag(withEraStats(p, p.era as Era, p.team_abbreviation))))
                                setLockedTeam(p.team_abbreviation)
                                setLockedEra(p.era as Era)
                                setSpinTeamDisplay(p.team_abbreviation)
                                setSpinEraDisplay(p.era as Era)
                                setRosterPool([tagged])
                                setSelectedPlayer(null); setPendingSlotIdx(null); setHighlightEmpty(false); setAwaitingSpin(false)
                                setDevPlayerSearch('')
                              }}
                              style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13, color: G.white, borderBottom: `1px solid ${G.border}` }}
                              onMouseEnter={e => (e.currentTarget.style.background = G.surface)}
                              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                            >
                              {p.full_name}
                              <span style={{ color: G.greyDark, marginLeft: 8, fontSize: 11 }}>{p.position} - {eraLabel(p.era as Era)} - {p.team_abbreviation}</span>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
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
                {filledCount === 9 ? (
                  <Btn onClick={() => onDraftComplete(slots)} variant="gold" className="w-full py-4 text-base">
                    Draft Coach
                  </Btn>
                ) : (
                  <Btn
                    onClick={spin}
                    disabled={spinning || (rosterPool.length > 0 && respinUsed)}
                    variant="gold"
                    className={`w-full py-4 text-base${awaitingSpin ? ' spin-awaiting' : ''}`}
                  >
                    {spinning ? 'Spinning...' : 'Spin'}
                  </Btn>
                )}
                {awaitingSpin && !spinning && (
                  <div className="text-center text-xs uppercase tracking-[0.2em]" style={{ color: G.goldDim }}>
                    {filledCount === 9 ? 'Draft your coach' : 'Spin for your next pick'}
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
                  <GoldLabel>{lockedTeam} - {lockedEra ? eraLabel(lockedEra) : ''}</GoldLabel>
                  <div className="flex items-center gap-2">
                    <div className="flex" style={{ border: `1px solid ${G.border}`, borderRadius: 2 }}>
                      {(['G', 'F', 'C'] as const).map(pos => (
                        <button key={pos} onClick={() => setPosFilter(f => f === pos ? null : pos)}
                          className="text-xs uppercase tracking-widest"
                          style={{
                            padding: '3px 8px', border: 'none', cursor: 'pointer',
                            background: posFilter === pos ? `${G.gold}22` : 'transparent',
                            color: posFilter === pos ? G.gold : G.greyDark,
                            borderRight: pos !== 'C' ? `1px solid ${G.border}` : 'none',
                            transition: 'color 0.1s, background 0.1s',
                          }}
                        >{pos}</button>
                      ))}
                    </div>
                    <GoldLabel>{rosterPool.length}</GoldLabel>
                  </div>
                </div>
                <div className="roster-scroll" style={{ border: `1px solid ${G.border}`, maxHeight: 220, overflowY: 'auto', overflowX: 'hidden' }}>
                  {(() => {
                    const isSpecial = (p: Player) =>
                      p.greatest_75_flag === 'Y' || (p.rings ?? 0) > 0 || p.defAnchor || p.offAnchor || !!p.flexPositions || !!p.timeless
                    const posMatch = (p: Player) => {
                      const primary = (p.position?.split('-')[0] ?? '').toLowerCase()
                      if (posFilter === 'G') return primary === 'guard'
                      if (posFilter === 'F') return primary === 'forward'
                      if (posFilter === 'C') return primary === 'center'
                      return false
                    }
                    const sorted = [...rosterPool]
                    .filter(p => !posFilter || posMatch(p))
                    .sort((a, b) => {
                      if (sortBy === 'SPECIAL') {
                        const aS = isSpecial(a) ? 1 : 0; const bS = isSpecial(b) ? 1 : 0
                        if (bS !== aS) return bS - aS
                        return playerBaseRating(b, b.era as Era) - playerBaseRating(a, a.era as Era)
                      }
                      if (sortBy === 'TS') return calcTS(b) - calcTS(a)
                      return (b[sortBy] ?? 0) - (a[sortBy] ?? 0)
                    }).filter(p => sortBy !== 'SPECIAL' || isSpecial(p))
                    visiblePoolRef.current = sorted
                    return sorted.map(p => {
                    const ts = (calcTS(p) * 100).toFixed(1)
                    const isSel = selectedPlayer?.person_id === p.person_id && selectedPlayer?.era === p.era && selectedPlayer?.eraTeam === p.eraTeam
                    return (
                      <button
                        key={`${p.person_id}-${p.era}-${p.eraTeam ?? ''}`}
                        id={`player-row-${p.person_id}`}
                        onClick={() => { setSelectedPlayer(p); setHighlightEmpty(true); setPendingSlotIdx(null) }}
                        className={`w-full flex items-center gap-3 px-3 text-left roster-row${isSel ? ' roster-row--selected' : ''}`}
                        style={{
                          background: isSel ? `${G.gold}18` : G.surface,
                          borderBottom: `1px solid ${G.borderSub}`,
                          borderLeft: isSel ? `2px solid ${G.gold}` : '2px solid transparent',
                          paddingTop: 10, paddingBottom: 10,
                          transition: 'background 0.15s ease, border-left-color 0.15s ease, padding 0.15s ease',
                        }}
                        onMouseEnter={e => { if (!isSel) { e.currentTarget.style.paddingTop = '14px'; e.currentTarget.style.paddingBottom = '14px'; } }}
                        onMouseLeave={e => { e.currentTarget.style.paddingTop = '10px'; e.currentTarget.style.paddingBottom = '10px'; }}
                      >
                        <PlayerHeadshot personId={p.person_id} size={36} initial={p.position?.[0]} lazy />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold text-white truncate">{p.full_name}</div>
                          <div className="text-xs" style={{ color: G.grey }}>{p.position}</div>
                        </div>
                        <div className="flex gap-3 text-xs shrink-0">
                          <span style={{ color: sortBy === 'PTS' ? G.gold : G.grey, fontWeight: sortBy === 'PTS' ? 700 : 400 }}>{p.PTS?.toFixed(1)}</span>
                          <span style={{ color: sortBy === 'REB' ? G.gold : G.grey, fontWeight: sortBy === 'REB' ? 700 : 400 }}>{p.REB?.toFixed(1)}</span>
                          <span style={{ color: sortBy === 'AST' ? G.gold : G.grey, fontWeight: sortBy === 'AST' ? 700 : 400 }}>{p.AST?.toFixed(1)}</span>
                          {sortBy === 'STL' ? (
                            <span style={{ color: G.gold, fontWeight: 700 }}>{(p.STL ?? 0).toFixed(1)}</span>
                          ) : sortBy === 'BLK' ? (
                            <span style={{ color: G.gold, fontWeight: 700 }}>{(p.BLK ?? 0).toFixed(1)}</span>
                          ) : (
                            <span style={{ color: sortBy === 'TS' ? G.gold : G.greyDark, fontWeight: sortBy === 'TS' ? 700 : 400 }}>{ts}%</span>
                          )}
                        </div>
                      </button>
                    )
                  })})()}
                  {sortBy === 'SPECIAL' && !rosterPool.some(p =>
                    p.greatest_75_flag === 'Y' || (p.rings ?? 0) > 0 || p.defAnchor || p.offAnchor || !!p.flexPositions || !!p.timeless
                  ) && (
                    <div className="text-center py-6 text-xs uppercase tracking-widest" style={{ color: G.greyDark }}>
                      No players with special tags
                    </div>
                  )}
                </div>
                <div className="flex items-center mt-2" style={{ borderTop: `1px solid ${G.border}`, overflow: 'hidden' }}>
                  <span className="text-xs uppercase tracking-widest shrink-0 px-2" style={{ color: G.greyDark, borderRight: `1px solid ${G.border}`, paddingTop: 6, paddingBottom: 6 }}>Sort</span>
                  <div className="flex overflow-x-auto" style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}>
                    {(['SPECIAL', 'PTS', 'REB', 'AST', 'TS', 'STL', 'BLK'] as const).map(s => (
                      <button
                        key={s}
                        onClick={() => setSortBy(s)}
                        className="shrink-0 text-xs uppercase tracking-widest"
                        style={{
                          padding: '6px 10px',
                          color: sortBy === s ? G.gold : G.greyDark,
                          background: sortBy === s ? `${G.gold}12` : 'none',
                          border: 'none',
                          borderBottom: sortBy === s ? `2px solid ${G.gold}` : '2px solid transparent',
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                          transition: 'color 0.1s, background 0.1s',
                        }}
                      >
                        {s === 'TS' ? 'TS%' : s === 'SPECIAL' ? <><span className="hidden sm:inline">Notable</span><span className="sm:hidden">★</span></> : s}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Hint: roster visible but no player selected yet */}
            {rosterPool.length > 0 && !selectedPlayer && !awaitingSpin && (
              <div className="text-center text-xs" style={{ color: G.greyDark, letterSpacing: '0.04em' }}>
                <span className="md:hidden">Select a player - then tap a slot to place</span>
                <span className="hidden md:inline">Select a player - then click a slot to place</span>
              </div>
            )}

            {/* Selected player card */}
            {selectedPlayer && (
              <div className="space-y-2">
                <GoldLabel>
                  {pendingSlotIdx !== null
                    ? `→ ${slots[pendingSlotIdx].position} — lock or choose another slot`
                    : 'Click a court slot to place'}
                </GoldLabel>
                <PlayerCard player={selectedPlayer} displayEra={lockedEra ?? undefined} activeEra={lockedEra ?? undefined} />
                {pendingSlotIdx !== null && (
                  <Btn onClick={confirmPick} variant="gold" className="w-full py-3">
                    Lock — {slots[pendingSlotIdx].position}
                  </Btn>
                )}
              </div>
            )}

            {/* Roster card popup modal */}
            {rosterCardPlayer && (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center p-4"
                style={{ background: 'rgba(0,0,0,0.75)' }}
                onClick={() => setRosterCardPlayer(null)}
              >
                <div onClick={e => e.stopPropagation()} className="w-full max-w-sm space-y-3">
                  <PlayerCard player={rosterCardPlayer} displayEra={lockedEra ?? undefined} activeEra={lockedEra ?? undefined} />
                  <Btn variant="ghost" className="w-full py-2" onClick={() => setRosterCardPlayer(null)}>
                    Close
                  </Btn>
                </div>
              </div>
            )}

            {rosterPool.length === 0 && !spinning && !awaitingSpin && filledCount === 0 && (
              <div className="text-center py-10 text-xs uppercase tracking-widest" style={{ color: G.greyDark }}>
                {sandboxMode ? 'Sandbox mode — pick a team and era, then load roster. Or search for a player and load all of that player\'s cards.' : 'Hit Spin to see a roster'}
              </div>
            )}
          </div>

          {/* ── Right: Court ── */}
          <div style={{ background: G.black, border: `1px solid ${G.border}`, padding: '20px' }}>
            {/* Half-court line art */}
            <div className="relative mb-8" style={{ height: 4 }}>
              <div className="absolute inset-x-0 top-0 h-px" style={{ background: G.border }} />
              <div className="absolute left-1/2 -translate-x-1/2 top-0 w-16 h-8 rounded-b-full"
                style={{ border: `1px solid ${G.border}`, borderTop: 'none' }} />
              <div className="absolute left-1/2 -translate-x-1/2 top-0 w-2 h-2 rounded-full"
                style={{ background: G.border, marginTop: -3 }} />
            </div>

            {/* Mobile-only: bridge hint when player selected and court is below the fold */}
            {selectedPlayer && pendingSlotIdx === null && (
              <div className="sm:hidden text-center text-xs mb-3" style={{ color: G.goldDim, letterSpacing: '0.04em' }}>
                Tap a slot to place {selectedPlayer.full_name.split(' ')[0]}
              </div>
            )}
            {/* Empty-court onboarding hint */}
            {filledCount === 0 && rosterPool.length === 0 && !spinning && !awaitingSpin && (
              <div className="text-center text-xs mb-3" style={{ color: G.greyDark, opacity: 0.55, letterSpacing: '0.04em' }}>
                Spin a team roster - select players - fill all 9 slots
              </div>
            )}

            <div className="mb-4 text-center">
              <div className="text-xs uppercase tracking-[0.2em]" style={{ color: G.greyDark }}>Starting Five</div>
              <div className="text-xs mt-0.5" style={{ color: G.greyDark, opacity: 0.6, letterSpacing: '0.04em' }}>Starters - 35 min each</div>
            </div>
            <div className="mb-4 space-y-1.5">
              <div className="grid grid-cols-3 gap-1.5">
                {starterSlots.slice(0, 3).map((slot, i) => (
                  <CourtSlotView key={slot.position} slot={slot}
                    highlighted={!!selectedPlayer && !slot.player}
                    pendingPlayer={pendingSlotIdx === i ? selectedPlayer : null}
                    activePlayer={selectedPlayer} simEra={simEra}
                    sandboxMode={sandboxMode}
                    onRemove={slot.player ? () => removeSlotPlayer(i) : undefined}
                    onClick={() => previewSlot(i)} onDrop={() => previewSlot(i)} />
                ))}
              </div>
              <div className="grid grid-cols-2 gap-1.5" style={{ width: '66.67%', margin: '0 auto' }}>
                {starterSlots.slice(3, 5).map((slot, i) => (
                  <CourtSlotView key={slot.position} slot={slot}
                    highlighted={!!selectedPlayer && !slot.player}
                    pendingPlayer={pendingSlotIdx === i + 3 ? selectedPlayer : null}
                    activePlayer={selectedPlayer} simEra={simEra}
                    sandboxMode={sandboxMode}
                    onRemove={slot.player ? () => removeSlotPlayer(i + 3) : undefined}
                    onClick={() => previewSlot(i + 3)} onDrop={() => previewSlot(i + 3)} />
                ))}
              </div>
            </div>

            <div className="h-px mb-4" style={{ background: G.border }} />

            <div className="text-xs uppercase tracking-[0.2em] mb-3 text-center" style={{ color: G.greyDark }}>
              Bench
            </div>
            <div className="grid grid-cols-4 gap-1.5 mb-1">
              {benchSlots.map(slot => (
                <div key={slot.position} className="text-center" style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.08em' }}>
                  {SLOT_MPG[slot.position]} MIN
                </div>
              ))}
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {benchSlots.map((slot, i) => (
                <CourtSlotView key={slot.position} slot={slot}
                  highlighted={!!selectedPlayer && !slot.player}
                  pendingPlayer={pendingSlotIdx === i + 5 ? selectedPlayer : null} simEra={simEra}
                  sandboxMode={sandboxMode}
                  onRemove={slot.player ? () => removeSlotPlayer(i + 5) : undefined}
                  onClick={() => previewSlot(i + 5)} onDrop={() => previewSlot(i + 5)} />
              ))}
            </div>

            {/* Tag key */}
            <div className="mt-5 flex flex-col gap-2 py-3 px-4" style={{ background: '#0d0d0d', border: `1px solid ${G.border}` }}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">
                <div className="flex items-start gap-2">
                  <span className="text-xs font-bold uppercase tracking-wide shrink-0" style={{ color: G.gold }}>Champion</span>
                  <span className="text-xs leading-tight" style={{ color: G.greyDark }}>Elevates their game in the playoffs. The more championships, the bigger boost.</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-xs font-bold uppercase tracking-wide shrink-0" style={{ color: '#4A9ECC' }}>Def Anchor</span>
                  <span className="text-xs leading-tight" style={{ color: G.greyDark }}>Impact beyond the stat sheet on defense. T1 carries a larger boost than T2.</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-xs font-bold uppercase tracking-wide shrink-0" style={{ color: G.gold }}>Off Anchor</span>
                  <span className="text-xs leading-tight" style={{ color: G.greyDark }}>Elevates the team's offense. T1 carries a larger boost than T2.</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-xs font-bold uppercase tracking-wide shrink-0" style={{ color: '#4A9ECC' }}>FLEX</span>
                  <span className="text-xs leading-tight" style={{ color: G.greyDark }}>Fits multiple positions without penalty.</span>
                </div>
              </div>
              <div className="flex justify-center mt-1">
                <div className="flex items-start gap-2">
                  <span className="text-xs font-bold uppercase tracking-wide shrink-0" style={{ color: '#C084FC' }}>Timeless</span>
                  <span className="text-xs leading-tight" style={{ color: G.greyDark }}>Minimal era penalties across all decades. Minor penalty only if 6+ eras from home era.</span>
                </div>
              </div>
              <div className="text-xs mt-1 text-center" style={{ color: G.greyDark, opacity: 0.6, letterSpacing: '0.02em' }}>
                Scoring isn't everything. Defense, playmaking, and rebounding all shape your season.
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}

// ─── Phase 3: Coach Draft ─────────────────────────────────────────────────────
function CoachDraftScreen({ coaches, onCoachSelected, onRestart, sandboxMode, greyscaleBtn }: {
  coaches: Coach[]; onCoachSelected: (coach: Coach) => void; onRestart: () => void; sandboxMode?: boolean; greyscaleBtn?: React.ReactNode
}) {
  const [spinning, setSpinning] = useState(false)
  const [coach, setCoach] = useState<Coach | null>(null)
  const [spinsUsed, setSpinsUsed] = useState(0)
  const [displayName, setDisplayName] = useState('')
  const [spinKey, setSpinKey] = useState(0)
  const [spinPhase, setSpinPhase] = useState<'fast' | 'slow' | 'land'>('fast')
  const isLocalhost = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  const [devMode, setDevMode] = useState(false)
  const [devSearch, setDevSearch] = useState('')
  const [sandboxSearch, setSandboxSearch] = useState('')

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
      <TopBar onRestart={onRestart} right={greyscaleBtn ? <div className="flex items-center gap-4">{greyscaleBtn}</div> : undefined} />

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

        {sandboxMode && !spinning && (
          <div className="mb-4 relative">
            <div className="text-xs uppercase tracking-widest mb-1" style={{ color: G.greyDark }}>or search a coach</div>
            <input
              type="text"
              placeholder="Coach name..."
              value={sandboxSearch}
              onChange={e => setSandboxSearch(e.target.value)}
              style={{ width: '100%', background: G.surface, border: `1px solid ${G.border}`, color: G.white, padding: '8px 12px', fontSize: 13, outline: 'none' }}
            />
            {sandboxSearch.length > 1 && (
              <div className="roster-scroll" style={{ background: G.surface, border: `1px solid ${G.border}`, borderTop: 'none', maxHeight: 220, overflowY: 'auto' }}>
                {coaches.filter(c => c.name.toLowerCase().includes(sandboxSearch.toLowerCase())).slice(0, 12).map(c => (
                  <div
                    key={`${c.name}-${c.from}`}
                    onClick={() => { setCoach(c); setDisplayName(c.name); setSandboxSearch('') }}
                    style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13, color: G.white, borderBottom: `1px solid ${G.border}` }}
                    onMouseEnter={e => (e.currentTarget.style.background = G.surface2)}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    {c.name.replace('*', '')}{c.name.endsWith('*') ? ' ★' : ''}
                    <span style={{ color: G.greyDark, marginLeft: 8, fontSize: 11 }}>Off:{c.offGrade} Def:{c.defGrade} Ovr:{c.overallGrade}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
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
                      <div style={{ ...BEBAS, fontSize: 28, color: G.white, letterSpacing: '0.04em' }}>
                        {coach.name.replace('*', '')}
                        {coach.name.endsWith('*') && <span style={{ color: G.gold, fontSize: 18, marginLeft: 4 }}>★</span>}
                      </div>
                      {coach.offGuru && coach.defGuru ? (
                        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: G.black, background: 'linear-gradient(90deg, #C9A84C, #4A9ECC)', padding: '2px 8px', borderRadius: 3, textTransform: 'uppercase' }}>COMPLETE</span>
                      ) : (<>
                        {coach.offGuru && (
                          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: G.black, background: G.gold, padding: '2px 7px', borderRadius: 3, textTransform: 'uppercase' }}>OFF GURU</span>
                        )}
                        {coach.defGuru && (
                          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: G.black, background: '#4A9ECC', padding: '2px 7px', borderRadius: 3, textTransform: 'uppercase' }}>DEF GURU</span>
                        )}
                      </>)}
                    </div>
                    <div className="text-xs mt-1" style={{ color: G.grey }}>
                      {coach.from}–{coach.to} - {coach.regW}W–{coach.regL}L ({(coach.regWLPct * 100).toFixed(1)}%)
                    </div>
                    <div className="flex flex-wrap gap-x-3 mt-1.5" style={{ fontSize: 11, color: G.greyDark }}>
                      <span style={{ color: G.grey }}>{coach.playoffG > 0 ? `${(coach.playoffWLPct * 100).toFixed(1)}% playoffs` : 'No playoffs'}</span>
                      {coach.champ > 0 && <><span>·</span>
                        <TagTooltip tip={`${Math.min(coach.champ, 8)}× title${coach.champ > 8 ? ' (capped at 8)' : ''} — coaches who've won it all provide a small but real edge to your team. +${(coachChampBonus(coach) * 100).toFixed(1)}% team rating.`}>
                          <span style={{ color: G.gold }}>{coach.champ}× Champion</span>
                        </TagTooltip>
                      </>}
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
        {isLocalhost && <div className="mt-6 pt-4" style={{ borderTop: `1px solid ${G.border}` }}>
          <button
            onClick={() => { setDevMode(d => !d); setDevSearch('') }}
            className="dev-btn text-xs uppercase tracking-widest px-3 py-1"
            style={{ color: devMode ? G.gold : G.greyDark, border: `1px solid ${devMode ? G.goldDim : G.border}`, background: 'none', cursor: 'pointer' }}
          >
            DEV
          </button>
          {devMode && (
            <div className="mt-3 space-y-3">
              {/* Preset test coaches */}
              <div className="text-xs uppercase tracking-widest mb-1" style={{ color: G.greyDark }}>Test Presets</div>
              <div className="flex flex-col gap-1">
                {([
                  { label: 'F Off - A Def', off: 'F', def: 'A', ovr: 'C' },
                  { label: 'C Off - C Def', off: 'C', def: 'C', ovr: 'C' },
                  { label: 'A Off - F Def', off: 'A', def: 'F', ovr: 'C' },
                  { label: 'D Off - D Def', off: 'D', def: 'D', ovr: 'D' },
                  { label: 'B Off - B Def', off: 'B', def: 'B', ovr: 'B' },
                  { label: 'F Off - F Def', off: 'F', def: 'F', ovr: 'F' },
                ] as { label: string; off: Coach['offGrade']; def: Coach['defGrade']; ovr: Coach['overallGrade'] }[]).map(preset => {
                  const testCoach: Coach = {
                    name: `Test Coach (${preset.label})`, from: 2000, to: 2020, years: 20,
                    regG: 1640, regW: 820, regL: 820, regWLPct: 0.500,
                    playoffG: 80, playoffW: 40, playoffL: 40, playoffWLPct: 0.500,
                    conf: 0, champ: 0,
                    offGrade: preset.off, defGrade: preset.def, overallGrade: preset.ovr,
                  }
                  return (
                    <div
                      key={preset.label}
                      onClick={() => { setCoach(testCoach); setDisplayName(testCoach.name); setDevMode(false) }}
                      style={{ padding: '6px 10px', cursor: 'pointer', fontSize: 12, color: G.white, border: `1px solid ${G.border}`, background: G.surface }}
                      onMouseEnter={e => (e.currentTarget.style.background = G.surface2)}
                      onMouseLeave={e => (e.currentTarget.style.background = G.surface)}
                    >
                      {preset.label}
                    </div>
                  )
                })}
              </div>
              {/* Coach search */}
              <div className="text-xs uppercase tracking-widest mb-1" style={{ color: G.greyDark }}>Search Real Coach</div>
              <input
                type="text"
                placeholder="Coach name..."
                value={devSearch}
                onChange={e => setDevSearch(e.target.value)}
                style={{ width: '100%', background: G.surface, border: `1px solid ${G.border}`, color: G.white, padding: '8px 12px', fontSize: 13, outline: 'none' }}
              />
              {devSearch.length > 1 && (
                <div className="roster-scroll" style={{ background: G.surface, border: `1px solid ${G.border}`, borderTop: 'none', maxHeight: 200, overflowY: 'auto' }}>
                  {coaches.filter(c => c.name.toLowerCase().includes(devSearch.toLowerCase())).slice(0, 10).map(c => (
                    <div
                      key={`${c.name}-${c.from}`}
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
        </div>}
      </div>
      </div>
    </div>
  )
}

// ─── Shared stats table ───────────────────────────────────────────────────────
const PLAYOFF_ROUND_LABELS = ['First Round', 'Semifinals', 'Conference Finals', 'NBA Finals']

function StatsTable({ stats, simEra, title, subtitle, teamActualPPG, teamActualOppPPG, oppStats, playoffGames }: {
  stats: PlayerSeasonStats[]; simEra: Era; title: string; subtitle: string; teamActualPPG?: number; teamActualOppPPG?: number; oppStats?: OppTeamStats | null; playoffGames?: import('../lib/types').PlayoffGame[]
}) {
  const [cardPlayer, setCardPlayer] = useState<Player | null>(null)

  const gameLog = cardPlayer && playoffGames
    ? playoffGames.map((g, gi) => {
        const line = g.playerLines?.find(l => l.personId === cardPlayer.person_id)
        return line ? { ...line, win: g.win, teamScore: g.teamScore, oppScore: g.oppScore, roundIndex: g.roundIndex, gameInSeries: g.gameInSeries, gameIdx: gi } : null
      }).filter(Boolean) as { pts: number; reb: number; ast: number; win: boolean; teamScore: number; oppScore: number; roundIndex: number; gameInSeries: number; gameIdx: number }[]
    : []

  return (
    <>
    {/* Player card modal */}
    {cardPlayer && (
      <div
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.82)',
          zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
          padding: '48px 24px 24px', overflowY: 'auto',
        }}
        className="roster-scroll"
        onClick={e => { if (e.target === e.currentTarget) setCardPlayer(null) }}
      >
        <div style={{ width: '100%', maxWidth: 360, position: 'relative' }}>
          <button
            onClick={() => setCardPlayer(null)}
            className="modal-close"
            style={{
              position: 'absolute', top: -40, right: 0, zIndex: 1,
              background: 'transparent', border: `1px solid ${G.border}`,
              color: G.grey, fontSize: 18, lineHeight: 1,
              width: 32, height: 32, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >×</button>
          <PlayerCard player={cardPlayer} activeEra={cardPlayer.era} />
          {gameLog.length > 0 && (
            <div style={{ background: G.surface, border: `1px solid ${G.border}`, borderTop: 'none', padding: '12px 16px' }}>
              <div className="text-xs uppercase tracking-widest mb-2" style={{ color: G.grey }}>Playoff Game Log</div>
              <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${G.border}` }}>
                    {['Round', 'G', 'W/L', 'Score', 'PTS', 'REB', 'AST'].map(h => (
                      <th key={h} className="text-right py-1 px-1" style={{ color: G.greyDark, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: h === 'Round' ? 'left' : 'right' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {gameLog.map(g => (
                    <tr key={g.gameIdx} style={{ borderBottom: `1px solid ${G.borderSub}` }}>
                      <td className="py-1 px-1" style={{ color: G.greyDark }}>{PLAYOFF_ROUND_LABELS[g.roundIndex]?.replace('Conference Finals', 'Conf Finals').replace('First Round', 'R1').replace('Semifinals', 'Semis').replace('NBA Finals', 'Finals')}</td>
                      <td className="py-1 px-1 text-right" style={{ color: G.greyDark }}>G{g.gameInSeries}</td>
                      <td className="py-1 px-1 text-right" style={{ color: g.win ? '#4ade80' : '#f87171', fontWeight: 700 }}>{g.win ? 'W' : 'L'}</td>
                      <td className="py-1 px-1 text-right" style={{ color: G.greyDark }}>{g.teamScore}–{g.oppScore}</td>
                      <td className="py-1 px-1 text-right font-bold" style={{ color: G.gold }}>{g.pts}</td>
                      <td className="py-1 px-1 text-right" style={{ color: G.white }}>{g.reb}</td>
                      <td className="py-1 px-1 text-right" style={{ color: G.white }}>{g.ast}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
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
              {['Player', 'Slot', 'MPG', 'PPG', 'RPG', 'APG', 'SPG', 'BPG', 'TOV', 'TS%', 'FG%', '3P%', 'FT%'].map(h => (
                <th key={h} className={`py-2 px-3 uppercase tracking-widest font-normal ${h === 'Player' ? 'text-left' : 'text-right'}`} style={{ color: G.grey }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(() => {
              const simTS  = (s: typeof stats[0]) => {
                const baseTS  = s.player.TS_PCT ?? calcTS(s.player)
                const fgDelta = s.FG_PCT - (s.player.FG_PCT ?? 0.45)
                const ftDelta = s.FT_PCT - (s.player.FT_PCT ?? 0.70)
                return Math.min(0.85, Math.max(0.30, baseTS + fgDelta * 0.8 + ftDelta * 0.08))
              }
              const maxPTS = Math.max(...stats.map(s => s.PTS))
              const maxREB = Math.max(...stats.map(s => s.REB))
              const maxAST = Math.max(...stats.map(s => s.AST))
              const maxSTL = Math.max(...stats.map(s => s.STL))
              const maxBLK = Math.max(...stats.map(s => s.BLK))
              const maxTS  = Math.max(...stats.map(simTS))
              const maxFG  = Math.max(...stats.map(s => s.FG_PCT))
              const maxFG3 = Math.max(...stats.filter(s => s.FG3_PCT != null).map(s => s.FG3_PCT!))
              const maxFT  = Math.max(...stats.map(s => s.FT_PCT))
              return stats.map(s => {
              const isStarter = !s.slot.startsWith('B')
              const ts = simTS(s)
              const gl = (val: number, max: number) => val === max ? G.gold : G.grey
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
                  <td className="py-2 px-3 text-right font-bold" style={{ color: gl(s.PTS, maxPTS) }}>{s.PTS.toFixed(1)}</td>
                  <td className="py-2 px-3 text-right" style={{ color: gl(s.REB, maxREB) }}>{s.REB.toFixed(1)}</td>
                  <td className="py-2 px-3 text-right" style={{ color: gl(s.AST, maxAST) }}>{s.AST.toFixed(1)}</td>
                  <td className="py-2 px-3 text-right" style={{ color: gl(s.STL, maxSTL) }}>{s.STL.toFixed(1)}</td>
                  <td className="py-2 px-3 text-right" style={{ color: gl(s.BLK, maxBLK) }}>{s.BLK.toFixed(1)}</td>
                  <td className="py-2 px-3 text-right" style={{ color: G.grey }}>{s.TOV.toFixed(1)}</td>
                  <td className="py-2 px-3 text-right" style={{ color: gl(ts, maxTS) }}>{(ts * 100).toFixed(1)}%</td>
                  <td className="py-2 px-3 text-right" style={{ color: gl(s.FG_PCT, maxFG) }}>{(s.FG_PCT * 100).toFixed(1)}%</td>
                  <td className="py-2 px-3 text-right" style={{ color: s.FG3_PCT != null ? gl(s.FG3_PCT, maxFG3) : G.grey }}>
                    {s.FG3_PCT != null ? `${(s.FG3_PCT * 100).toFixed(1)}%` : '—'}
                  </td>
                  <td className="py-2 px-3 text-right" style={{ color: gl(s.FT_PCT, maxFT) }}>{(s.FT_PCT * 100).toFixed(1)}%</td>
                </tr>
              )
            })})()}
            {(() => {
              if (stats.length === 0) return null
              const sum = (fn: (s: typeof stats[0]) => number) => stats.reduce((acc, s) => acc + fn(s), 0)
              const totalMPG = sum(s => s.MPG)
              // Percentages weighted by minutes
              const wFG  = sum(s => s.FG_PCT * s.MPG) / totalMPG
              const wFT  = sum(s => s.FT_PCT * s.MPG) / totalMPG
              const wTS  = sum(s => {
                const baseTS  = s.player.TS_PCT ?? calcTS(s.player)
                const fgDelta = s.FG_PCT - (s.player.FG_PCT ?? 0.45)
                const ftDelta = s.FT_PCT - (s.player.FT_PCT ?? 0.70)
                return Math.min(0.85, Math.max(0.30, baseTS + fgDelta * 0.8 + ftDelta * 0.08)) * s.MPG
              }) / totalMPG
              const fg3s = stats.filter(s => s.FG3_PCT != null)
              const wFG3MPG = fg3s.reduce((acc, s) => acc + s.MPG, 0)
              const wFG3 = wFG3MPG > 0 ? fg3s.reduce((acc, s) => acc + s.FG3_PCT! * s.MPG, 0) / wFG3MPG : null
              return (
                <>
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
                    <td className="py-2 px-3 text-right font-bold" style={{ color: G.grey }}>{(wTS * 100).toFixed(1)}%</td>
                    <td className="py-2 px-3 text-right font-bold" style={{ color: G.grey }}>{(wFG * 100).toFixed(1)}%</td>
                    <td className="py-2 px-3 text-right font-bold" style={{ color: G.grey }}>
                      {wFG3 != null ? `${(wFG3 * 100).toFixed(1)}%` : '—'}
                    </td>
                    <td className="py-2 px-3 text-right font-bold" style={{ color: G.grey }}>{(wFT * 100).toFixed(1)}%</td>
                  </tr>
                  {teamActualOppPPG != null && (
                    <tr style={{ borderTop: `1px solid ${G.borderSub}`, background: '#0f0f0f' }}>
                      <td className="py-2 px-3 font-bold uppercase tracking-widest text-xs" style={{ color: G.greyDark }}>Opp</td>
                      <td className="py-2 px-3" /><td className="py-2 px-3" />
                      <td className="py-2 px-3 text-right font-bold" style={{ color: G.greyDark }}>{teamActualOppPPG.toFixed(1)}</td>
                      <td className="py-2 px-3 text-right" style={{ color: G.greyDark }}>{oppStats ? oppStats.REB.toFixed(1) : '—'}</td>
                      <td className="py-2 px-3 text-right" style={{ color: G.greyDark }}>{oppStats ? oppStats.AST.toFixed(1) : '—'}</td>
                      <td className="py-2 px-3 text-right" style={{ color: G.greyDark }}>{oppStats?.STL != null ? oppStats.STL.toFixed(1) : '—'}</td>
                      <td className="py-2 px-3 text-right" style={{ color: G.greyDark }}>{oppStats?.BLK != null ? oppStats.BLK.toFixed(1) : '—'}</td>
                      <td className="py-2 px-3 text-right" style={{ color: G.greyDark }}>{oppStats ? oppStats.TOV.toFixed(1) : '—'}</td>
                      <td className="py-2 px-3 text-right" style={{ color: G.greyDark }}>{oppStats ? (oppStats.TS_PCT * 100).toFixed(1) + '%' : '—'}</td>
                      <td className="py-2 px-3 text-right" style={{ color: G.greyDark }}>{oppStats ? (oppStats.FG_PCT * 100).toFixed(1) + '%' : '—'}</td>
                      <td className="py-2 px-3 text-right" style={{ color: G.greyDark }}>{oppStats?.FG3_PCT != null ? (oppStats.FG3_PCT * 100).toFixed(1) + '%' : '—'}</td>
                      <td className="py-2 px-3 text-right" style={{ color: G.greyDark }}>{oppStats ? (oppStats.FT_PCT * 100).toFixed(1) + '%' : '—'}</td>
                    </tr>
                  )}
                </>
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
  mvpWins: 50, mvpBase: 55, mvpPPG: 24,
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
  if (wins >= 78) {
    // Historic season — highest-scoring starter above 22 PPG wins MVP automatically
    const starterSlots: SlotPosition[] = ['PG', 'SG', 'SF', 'PF', 'C']
    const topScorer = rated
      .filter(({ s }) => starterSlots.includes(s.slot) && s.PTS > 22)
      .sort((a, b) => b.s.PTS - a.s.PTS)[0]
    if (topScorer) {
      awards.push({
        award: 'League MVP',
        player: topScorer.s,
        justification: `${topScorer.s.PTS.toFixed(1)} PPG - ${topScorer.s.REB.toFixed(1)} RPG - ${topScorer.s.AST.toFixed(1)} APG`,
        gold: true,
      })
    }
  } else if (wins >= t.mvpWins) {
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
        justification: `${mvpCandidate.s.PTS.toFixed(1)} PPG - ${mvpCandidate.s.REB.toFixed(1)} RPG - ${mvpCandidate.s.AST.toFixed(1)} APG`,
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
        award: `All-NBA - ${pos}`,
        player: best.s,
        justification: `${best.s.PTS.toFixed(1)} PPG - ${best.s.REB.toFixed(1)} RPG - ${best.s.AST.toFixed(1)} APG`,
        gold: false,
      })
    }
  }

  // ── All-Star ──
  const seasonGames = seasonStats[0]?.GP ?? 82
  const winPct = wins / seasonGames
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
      awards.push({ award: 'All-Star', player: s, justification: `${s.PTS.toFixed(1)} PPG - ${s.REB.toFixed(1)} REB`, gold: false })
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
      justification: `${s.PTS.toFixed(1)} PPG - ${s.REB.toFixed(1)} REB - ${s.AST.toFixed(1)} AST`,
      gold: false,
    })
  }

  // ── 30 PPG All-Star guarantee ──
  for (const { s } of rated) {
    if (s.PTS >= 30) {
      const already = awards.some(a => a.award === 'All-Star' && a.player.player.person_id === s.player.person_id)
      if (!already) awards.push({ award: 'All-Star', player: s, justification: `${s.PTS.toFixed(1)} PPG`, gold: false })
    }
  }

  // ── 65-win All-Star guarantee ──
  if (wins > 65) {
    const topScorer = [...rated].sort((a, b) => b.s.PTS - a.s.PTS)[0]
    const alreadyAllStar = awards.some(a => a.award === 'All-Star' && a.player.player.person_id === topScorer?.s.player.person_id)
    if (topScorer && !alreadyAllStar) {
      awards.push({
        award: 'All-Star',
        player: topScorer.s,
        justification: `${topScorer.s.PTS.toFixed(1)} PPG - ${topScorer.s.REB.toFixed(1)} RPG - ${topScorer.s.AST.toFixed(1)} APG`,
        gold: false,
      })
    }
  }

  // ── 67-win All-Star guarantee ──
  if (wins >= 67) {
    for (const { s } of rated) {
      const alreadyAllStar = awards.some(a => a.award === 'All-Star' && a.player.player.person_id === s.player.person_id)
      if (alreadyAllStar) continue
      const qualifies =
        (s.PTS >= 19 && (s.AST >= 5 || s.STL >= 5 || s.BLK >= 5)) ||
        (s.PTS >= 18 && s.REB >= 10)
      if (qualifies) {
        const just = `${s.PTS.toFixed(1)} PPG - ${s.REB.toFixed(1)} RPG - ${s.AST.toFixed(1)} APG`
        awards.push({ award: 'All-Star', player: s, justification: just, gold: false })
      }
    }
  }

  // ── DPOY ──
  const dpoy = rated
    .filter(({ s, base }) =>
      base > t.dpoyBase && (
        (s.STL > t.dpoySTL && s.BLK > t.dpoyBLK) ||
        s.STL > 2.2 || s.BLK > 2.8 ||
        (s.BLK >= 2.5 && s.REB >= 12)
      )
    )
    .sort((a, b) => (b.s.STL + b.s.BLK + b.s.REB * 0.15) - (a.s.STL + a.s.BLK + a.s.REB * 0.15))[0]
  if (dpoy) {
    const isBigManPath = dpoy.s.BLK >= 2.5 && dpoy.s.REB >= 12
    awards.push({
      award: 'Defensive POY',
      player: dpoy.s,
      justification: isBigManPath
        ? `${dpoy.s.BLK.toFixed(1)} BLK - ${dpoy.s.REB.toFixed(1)} REB - ${dpoy.s.STL.toFixed(1)} STL`
        : `${dpoy.s.STL.toFixed(1)} STL - ${dpoy.s.BLK.toFixed(1)} BLK`,
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
      justification: `${sixthMan.s.PTS.toFixed(1)} PPG - ${sixthMan.s.REB.toFixed(1)} RPG - ${sixthMan.s.AST.toFixed(1)} APG`,
      gold: false,
    })
  }

  return awards
}

function computeFinalsMVP(finalsStats: PlayerSeasonStats[]): PlayerSeasonStats | null {
  if (!finalsStats.length) return null
  return [...finalsStats].sort((a, b) => b.PTS !== a.PTS ? b.PTS - a.PTS : b.AST - a.AST)[0]
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
function SimulationScreen({ slots, coach, simEra, onRestart, greyscaleBtn, sandboxMode }: {
  slots: CourtSlot[]; coach: Coach; simEra: Era; onRestart: () => void; greyscaleBtn?: React.ReactNode; sandboxMode?: boolean
}) {
  const seasonGames = ERA_SEASON_GAMES[simEra]

  // ── Regular season ──
  const [simStarted, setSimStarted] = useState(false)
  const [games, setGames] = useState<boolean[]>([])
  const [done, setDone] = useState(false)
  const [seasonStats, setSeasonStats] = useState<PlayerSeasonStats[]>([])
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Season actual scores ──
  const [avgTeamScore, setAvgTeamScore] = useState<number | null>(null)
  const [avgOppScore, setAvgOppScore] = useState<number | null>(null)
  const [seasonOppStats, setSeasonOppStats] = useState<OppTeamStats | null>(null)
  const [playoffOppStats, setPlayoffOppStats] = useState<OppTeamStats | null>(null)

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

  const SITE_URL = typeof window !== 'undefined' ? window.location.origin : 'https://eraball.app'

  const { teamRating: tr, rawRating, playerRatings: pr } = calcTeamRating(slots, coach, simEra)
  // rawRating with champ bonus on the team side — passed to sims so off/def apply separately
  const simRaw = rawRating * (1 + coachChampBonus(coach))

  const startSim = () => {
    setSimStarted(true); setGames([]); setDone(false); setSeasonStats([])
    const { games: allGames, seasonStats: stats, avgTeamScore: ats, avgOppScore: aos } = simulateSeason(simRaw, pr, coach.defGrade, coach.offGrade, simEra, effectiveCoachBonus(coach, 'def'), effectiveCoachBonus(coach, 'off'))
    setSeasonStats(stats)
    setAvgTeamScore(ats)
    setAvgOppScore(aos)
    const { stl: teamSTL, blk: teamBLK } = calcTeamDefTotals(pr)
    const rebEntries = pr.map(r => ({ pr: r, minScale: SLOT_MPG[r.slot] / 35 }))
    setSeasonOppStats(genOppTeamStats(aos, simEra, teamSTL, teamBLK, calcRebFactor(rebEntries)))
    let idx = 0
    intervalRef.current = setInterval(() => {
      setGames(allGames.slice(0, ++idx))
      if (idx >= seasonGames) { clearInterval(intervalRef.current!); setDone(true) }
    }, 50)
  }

  const startPlayoffs = () => {
    setPlayoffStarted(true)
    setPlayoffRevealIndex(-1)
    setPlayoffDone(false)
    const result = simulatePlayoffs(simRaw, pr, wins, coach.defGrade, coach.offGrade, simEra, effectiveCoachBonus(coach, 'def'), effectiveCoachBonus(coach, 'off'))
    setPlayoffResult(result)
    const poAvgOpp = result.allGames.reduce((s, g) => s + g.oppScore, 0) / result.allGames.length
    const { stl: poTeamSTL, blk: poTeamBLK } = calcTeamDefTotals(pr)
    const poRebEntries = pr.map(r => ({ pr: r, minScale: SLOT_MPG[r.slot] / 35 }))
    setPlayoffOppStats(genOppTeamStats(poAvgOpp, simEra, poTeamSTL, poTeamBLK, calcRebFactor(poRebEntries)))
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
    const delay = playoffRevealIndex === 0 ? 500 : 600
    const timer = setTimeout(() => setPlayoffRevealIndex(i => i + 1), delay)
    return () => clearTimeout(timer)
  }, [playoffRevealIndex, playoffStarted, playoffResult])


  const wins = games.filter(Boolean).length
  const losses = games.length - wins
  const playoffThreshold = Math.ceil(seasonGames / 2)
  const madePlayoffs = wins >= playoffThreshold

  const SHARE_MSG = `I just simulated my all-time NBA lineup on EraBall — ${wins}-${losses} record. Think you can build a better team? 🏀`

  const handleShareTwitter = () => {
    handleDownload()
    const text = encodeURIComponent(SHARE_MSG)
    const url  = encodeURIComponent(SITE_URL)
    window.open(`https://twitter.com/intent/tweet?text=${text}&url=${url}`, '_blank')
  }

  const handleShareWhatsApp = async () => {
    if (shareImageUrl && navigator.canShare) {
      try {
        const blob = await (await fetch(shareImageUrl)).blob()
        const file = new File([blob], 'eraball-team.png', { type: 'image/png' })
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ title: 'EraBall', text: SHARE_MSG, url: SITE_URL, files: [file] })
          return
        }
      } catch {}
    }
    const text = encodeURIComponent(`${SHARE_MSG} ${SITE_URL}`)
    window.open(`https://wa.me/?text=${text}`, '_blank')
  }

  const handleShareSMS = async () => {
    if (shareImageUrl && navigator.canShare) {
      try {
        const blob = await (await fetch(shareImageUrl)).blob()
        const file = new File([blob], 'eraball-team.png', { type: 'image/png' })
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ title: 'EraBall', text: SHARE_MSG, url: SITE_URL, files: [file] })
          return
        }
      } catch {}
    }
    window.location.href = `sms:?body=${encodeURIComponent(`${SHARE_MSG} ${SITE_URL}`)}`
  }

  const verdict = wins === seasonGames ? 'Perfect Season' : wins === 0 ? 'Winless Season' : wins >= Math.round(seasonGames * 0.73) ? 'Championship Contender' : wins >= Math.round(seasonGames * 0.61) ? 'Playoff Team' : wins >= playoffThreshold ? '.500 Season' : 'Lottery Bound'

  const dispRating = (r: number) => Math.round(r + 15)

  const gradeBonus = (g: 'A' | 'B' | 'C' | 'D' | 'F') =>
    `${coachBonus(g) >= 0 ? '+' : ''}${(coachBonus(g) * 100).toFixed(0)}%`

  const ROUND_NAMES = ['First Round', 'Semifinals', 'Conference Finals', 'NBA Finals']

  // Derive playoff display state from reveal index
  const revealedGames = (playoffResult && playoffRevealIndex >= 0) ? playoffResult.allGames.slice(0, playoffRevealIndex) : []
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

  const finalsMVP = playoffDone && playoffResult?.champion && playoffResult.finalsStats.length > 0
    ? computeFinalsMVP(playoffResult.finalsStats)
    : null


  return (
    <div className="min-h-screen" style={{ background: G.black }}>
      <TopBar onRestart={onRestart} right={
        <div className="flex items-center gap-4">
          <span>
            Era: <span style={{ color: G.white }}>{eraLabel(simEra)}</span>
            <span className="mx-3" style={{ color: G.border }}>|</span>
            Coach: <span style={{ color: G.white }}>{coach.name}</span>
          </span>
          {greyscaleBtn}
        </div>
      } />

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">

        {/* Rating breakdown */}
        <div style={{ background: G.surface, border: `1px solid ${G.border}` }}>
          <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: `1px solid ${G.border}` }}>
            <div className="text-sm uppercase tracking-widest font-semibold text-white">Team Rating</div>
            <div className="flex items-center gap-4">
              <span style={{ ...BEBAS, fontSize: 28, color: G.gold }}>{dispRating(tr)}</span>
              <span className="text-xs" style={{ color: G.grey }}>
                Off {coach.offGuru ? '+6%' : gradeBonus(coach.offGrade)} - Def {coach.defGuru ? '+6%' : gradeBonus(coach.defGrade)}
                {coach.champ > 0 && <span style={{ color: G.goldDim, marginLeft: 6 }}>+{(coachChampBonus(coach) * 100).toFixed(1)}% coach titles</span>}
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
                    <td className="py-2 px-3 text-right" style={{ color: eraMod >= 0.85 ? '#4ade80' : eraMod >= 0.70 ? '#facc15' : G.red }}>{(eraMod * 100).toFixed(0)}%</td>
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
                  <div className="flex items-center justify-center gap-3 mb-3">
                    <div className="text-xs uppercase tracking-[0.3em]" style={{ color: G.grey }}>Regular Season</div>
                    {sandboxMode && <div className="text-xs uppercase tracking-widest px-2 py-0.5" style={{ color: G.gold, border: `1px solid ${G.gold}44`, background: `${G.gold}0d` }}>Sandbox</div>}
                  </div>
                  <div style={{ ...BEBAS, fontSize: 'clamp(64px, 14vw, 120px)', lineHeight: 1, color: wins === seasonGames ? G.gold : wins === 0 ? '#CC3333' : G.white, letterSpacing: '0.02em' }}>
                    {wins}–{losses}
                  </div>

                  {wins === seasonGames ? (
                    <div className="mt-4 px-6">
                      <div style={{ background: 'rgba(201,168,76,0.10)', border: `2px solid ${G.gold}`, padding: '14px 28px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, marginBottom: 6 }}>
                          <div style={{ height: 1, flex: 1, background: `linear-gradient(to right, transparent, ${G.gold})` }} />
                          <div style={{ ...BEBAS, fontSize: 26, color: G.gold, letterSpacing: '0.3em' }}>PERFECT SEASON</div>
                          <div style={{ height: 1, flex: 1, background: `linear-gradient(to left, transparent, ${G.gold})` }} />
                        </div>
                        <div className="text-xs uppercase tracking-[0.3em] text-center" style={{ color: G.goldDim }}>
                          {seasonGames}–0 - The greatest team ever assembled
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
                          0–{seasonGames} - Not a single win all season
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="mt-2 text-xs uppercase tracking-[0.3em]" style={{ color: G.gold }}>{verdict}</div>
                      <div className="mt-1 text-xs" style={{ color: G.grey }}>
                        {(wins / seasonGames * 100).toFixed(1)}% win rate
                      </div>
                    </>
                  )}
                </>
              ) : (
                <>
                  <div className="text-xs uppercase tracking-[0.3em] mb-3" style={{ color: G.grey }}>Game {games.length} of {seasonGames}</div>
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
                {Array.from({ length: seasonGames - games.length }).map((_, i) => (
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
            subtitle={`Era-adjusted, minutes-scaled per-game averages across ${seasonGames} games`}
            teamActualPPG={avgTeamScore ?? undefined}
            teamActualOppPPG={avgOppScore ?? undefined}
            oppStats={seasonOppStats}
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
          <div className="text-center py-4 space-y-3">
            <div style={{ fontSize: 11, color: G.grey, textTransform: 'uppercase', letterSpacing: '0.2em' }}>
              First Round - <span style={{ color: G.goldDim }}>{firstRoundLabel(simEra)}</span>
              <span style={{ color: G.border, margin: '0 8px' }}>·</span>
              All Other Rounds - <span style={{ color: G.goldDim }}>Best of 7</span>
            </div>
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
                    {seriesOver ? (seriesW === 4 ? ' - Advanced' : ' - Eliminated') : ''}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-6" style={{ background: G.surface, border: `1px solid ${G.border}` }}>
                <div className="text-xs uppercase tracking-[0.3em]" style={{ color: G.grey }}>NBA Playoffs</div>
                <div className="text-xs mt-2" style={{ color: G.greyDark }}>Starting...</div>
              </div>
            )}


            {/* Series history — horizontal game cards per round */}
            {visibleRounds.length > 0 && (
              <div style={{ background: G.surface, border: `1px solid ${G.border}` }}>
                {visibleRounds.map(({ name, rGames, w, l, complete, advanced }, ri) => (
                  <div key={name} style={{ borderBottom: ri < visibleRounds.length - 1 ? `1px solid ${G.border}` : 'none' }}>
                    {/* Round header */}
                    <div className="flex items-center justify-between px-4 py-2" style={{ borderBottom: `1px solid ${G.border}` }}>
                      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.18em', color: complete ? (advanced ? G.gold : G.red) : G.white }}>
                        {name === 'First Round' ? firstRoundLabel(simEra) : name}
                      </div>
                      <div style={{ fontSize: 10, letterSpacing: '0.12em', color: complete ? (advanced ? G.gold : G.red) : G.grey }}>
                        {w}–{l}{complete ? (advanced ? ' - ADV' : ' - ELIM') : ''}
                      </div>
                    </div>
                    {/* Horizontal game cards */}
                    <div className="flex gap-2 p-3 overflow-x-auto">
                      {rGames.map((g, gi) => (
                        <div key={gi}
                          onClick={() => setSelectedGame({ game: g, roundName: name, gameNum: gi + 1 })}
                          className={`playoff-game-card ${g.win ? 'playoff-game-card--win' : 'playoff-game-card--loss'}`}
                          style={{ flexShrink: 0, width: 100, background: G.black, cursor: 'pointer', overflow: 'hidden' }}
                        >
                          {/* Colored top bar */}
                          <div style={{ height: 3, background: g.win ? G.gold : G.red }} />
                          <div style={{ padding: '6px 8px' }}>
                            {/* G# + W/L */}
                            <div className="flex items-center justify-between mb-1">
                              <div style={{ fontSize: 8, color: G.greyDark, letterSpacing: '0.12em' }}>G{gi + 1}</div>
                              <div style={{ fontSize: 9, fontWeight: 700, color: g.win ? G.gold : G.red }}>{g.win ? 'W' : 'L'}</div>
                            </div>
                            {/* Score */}
                            <div style={{ ...BEBAS, fontSize: 16, lineHeight: 1, color: g.win ? G.white : G.grey, letterSpacing: '0.04em', marginBottom: 5 }}>
                              {g.teamScore}–{g.oppScore}
                            </div>
                            {/* PTS leader */}
                            <div style={{ fontSize: 9, color: G.gold, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {g.leaders.pts.name.split(' ').slice(-1)[0]} <span style={{ color: G.white, fontWeight: 600 }}>{g.leaders.pts.val}</span>
                            </div>
                            {/* Special */}
                            {g.special && (
                              <div style={{ fontSize: 8, color: G.goldDim, marginTop: 2 }}>★ special</div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
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
              <div className="text-center py-10 relative overflow-hidden" style={{ background: G.surface, border: `1px solid ${G.gold}` }}>
                <div className="card-sheen-beam" />
                <div style={{ ...BEBAS, fontSize: 'clamp(48px, 10vw, 80px)', lineHeight: 1, color: G.gold, letterSpacing: '0.06em', position: 'relative', zIndex: 1 }}>
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
            subtitle={`Era-adjusted, minutes-scaled per-game averages - ${playoffResult.allGames.length} games`}
            teamActualPPG={playoffResult.allGames.reduce((sum, g) => sum + g.teamScore, 0) / playoffResult.allGames.length}
            teamActualOppPPG={playoffResult.allGames.reduce((sum, g) => sum + g.oppScore, 0) / playoffResult.allGames.length}
            oppStats={playoffOppStats}
            playoffGames={playoffResult.allGames}
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
                  {(calcTS(finalsMVP.player) * 100).toFixed(1)}% TS
                  <span className="mx-2" style={{ color: G.border }}>·</span>
                  Finals ({finalsMVP.GP}G)
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
            finalsMVPStats={finalsMVP ?? null}
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
                <div style={{ fontSize: 9, color: G.greyDark, letterSpacing: '0.15em', textTransform: 'uppercase', marginTop: 4 }}>Your Team -Opponent</div>
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
                    {g.special.pts} PTS -{g.special.reb} REB -{g.special.ast} AST
                  </div>
                  <div style={{ fontSize: 9, color: G.goldDim, marginTop: 3, fontStyle: 'italic' }}>{g.special.label}</div>
                </div>
              )}
              {/* Close */}
              <div style={{ borderTop: `1px solid ${G.border}`, padding: '8px 16px', textAlign: 'center' }}>
                <button onClick={() => setSelectedGame(null)} className="modal-close" style={{ fontSize: 10, color: G.grey, textTransform: 'uppercase', letterSpacing: '0.2em', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 12px' }}>
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 20, width: '100%', maxWidth: 400 }}>
            <Btn onClick={handleShareTwitter} variant="ghost" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.259 5.63 5.905-5.63Zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
              X / Twitter
            </Btn>
            <Btn onClick={handleShareWhatsApp} variant="ghost" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>
              Text / WhatsApp
            </Btn>
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn onClick={handleDownload} variant="gold" style={{ flex: 1 }}>Download Image</Btn>
              <Btn onClick={() => setShareImageUrl(null)} variant="ghost" style={{ flex: 1 }}>Close</Btn>
            </div>
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
  const [startSandbox, setStartSandbox] = useState(false)
  const [greyscale, setGreyscale] = useState(false)
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
    setGreyscale(false)
  }

  const greyscaleBtn = simEra === '50s' && phase !== 'era-select' ? (
    <button
      onClick={() => setGreyscale(g => !g)}
      className="flex items-center gap-1.5 text-xs uppercase tracking-widest px-2 py-1"
      style={{
        background: 'transparent',
        color: greyscale ? G.white : G.greyDark,
        border: `1px solid ${greyscale ? G.grey : G.border}`,
        cursor: 'pointer',
        letterSpacing: '0.15em',
        transition: 'all 0.15s ease',
      }}
      title="Toggle 50s era black & white theme"
    >
      Era Theme
      <span style={{
        fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
        color: greyscale ? G.black : G.greyDark,
        background: greyscale ? G.white : G.border,
        padding: '1px 4px',
        borderRadius: 2,
        transition: 'all 0.15s ease',
      }}>{greyscale ? 'ON' : 'OFF'}</span>
    </button>
  ) : null

  return (
    <div style={{ filter: greyscale ? 'grayscale(1)' : 'none', minHeight: '100vh' }}>
      {phase === 'era-select' && <EraSelection onEraSelected={era => { setSimEra(era); setStartSandbox(false); setPhase('draft') }} onSandboxSelected={era => { setSimEra(era); setStartSandbox(true); setPhase('draft') }} onRestart={restart} />}
      {phase === 'draft' && <DraftScreen simEra={simEra} players={players} onDraftComplete={s => { setSlots(s); setPhase('coach-draft') }} onRestart={restart} startInSandbox={startSandbox} greyscaleBtn={greyscaleBtn} />}
      {phase === 'coach-draft' && <CoachDraftScreen coaches={coaches} onCoachSelected={c => { setCoach(c); setPhase('simulation') }} onRestart={restart} sandboxMode={startSandbox} greyscaleBtn={greyscaleBtn} />}
      {phase === 'simulation' && coach && <SimulationScreen slots={slots} coach={coach} simEra={simEra} onRestart={restart} greyscaleBtn={greyscaleBtn} sandboxMode={startSandbox} />}

      {/* Desktop: fixed bottom-right */}
      <div
        className="suggestions-btn-desktop"
        style={{
          position: 'fixed', bottom: 20, right: 20, zIndex: 500,
          display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6,
        }}
      >
        <a
          href="https://eshanbhattdesign.com"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase',
            color: G.greyDark, border: `1px solid ${G.border}`,
            padding: '6px 12px', background: G.surface,
            textDecoration: 'none', opacity: 0.7,
            transition: 'opacity 0.15s ease, color 0.15s ease, border-color 0.15s ease',
          }}
          onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = G.white; e.currentTarget.style.borderColor = G.grey }}
          onMouseLeave={e => { e.currentTarget.style.opacity = '0.7'; e.currentTarget.style.color = G.greyDark; e.currentTarget.style.borderColor = G.border }}
        >
          eshanbhattdesign.com
        </a>
        <a
          href="https://x.com/Eshan_Design"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase',
            color: G.greyDark, border: `1px solid ${G.border}`,
            padding: '6px 12px', background: G.surface,
            textDecoration: 'none', opacity: 0.7,
            transition: 'opacity 0.15s ease, color 0.15s ease, border-color 0.15s ease',
          }}
          onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = G.white; e.currentTarget.style.borderColor = G.grey }}
          onMouseLeave={e => { e.currentTarget.style.opacity = '0.7'; e.currentTarget.style.color = G.greyDark; e.currentTarget.style.borderColor = G.border }}
        >
          Suggestions or bugs? DM me
        </a>
      </div>

      {/* Mobile: inline at page bottom, doesn't float over content */}
      <div className="suggestions-btn-mobile" style={{ textAlign: 'center', padding: '16px 0 32px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        <a
          href="https://eshanbhattdesign.com"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase',
            color: G.greyDark, border: `1px solid ${G.border}`,
            padding: '6px 12px', background: G.surface,
            textDecoration: 'none', opacity: 0.7,
          }}
        >
          eshanbhattdesign.com
        </a>
        <a
          href="https://x.com/Eshan_Design"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase',
            color: G.greyDark, border: `1px solid ${G.border}`,
            padding: '6px 12px', background: G.surface,
            textDecoration: 'none', opacity: 0.7,
          }}
        >
          Suggestions or bugs? DM me
        </a>
      </div>

      {/* Disclaimer */}
      <div style={{ textAlign: 'center', padding: '12px 24px 28px', maxWidth: 640, margin: '0 auto' }}>
        <p style={{ fontSize: 10, color: G.greyDark, opacity: 0.5, letterSpacing: '0.04em', lineHeight: 1.6, margin: 0 }}>
          EraBall is an unofficial fan project and is not affiliated with, endorsed by, or licensed by the NBA or any of its teams. Player names and statistics are historical public record used for informational and entertainment purposes only.
        </p>
      </div>

      <style>{`
        @media (min-width: 641px) { .suggestions-btn-mobile { display: none; } }
        @media (max-width: 640px)  { .suggestions-btn-desktop { display: none !important; } }
      `}</style>
    </div>
  )
}
