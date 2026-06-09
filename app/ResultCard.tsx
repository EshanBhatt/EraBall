'use client'

import React from 'react'
import type { PlayerSeasonStats, Coach, Era } from '../lib/types'

// Literal font strings — no CSS variables so html2canvas resolves them reliably
const BEBAS = '"Bebas Neue", Impact, sans-serif'
const INTER = 'Inter, system-ui, sans-serif'

const C = {
  gold:       '#C9A84C',
  goldDim:    '#7A6430',
  goldFaint:  'rgba(201,168,76,0.22)',
  goldBorder: 'rgba(201,168,76,0.45)',
  black:      '#000000',
  surface:    '#0F0F0F',
  surface2:   '#181818',
  border:     '#252525',
  white:      '#FFFFFF',
  grey:       '#888888',
  greyDark:   '#444444',
  red:        '#CC3333',
}

interface PlayoffOutcome {
  champion: boolean
  eliminatedIn?: string  // round name if not champion
}

interface ResultCardProps {
  simEra: Era
  wins: number
  losses: number
  seasonStats: PlayerSeasonStats[]
  coach: Coach
  teamRating: number
  headshots: Record<string, string | null>
  playoffOutcome?: PlayoffOutcome | null
  playerAwards?: Record<string, string[]>   // person_id → short award labels
  finalsMVPId?: string | null
}

function eliminationLabel(round: string | undefined): string {
  if (!round) return 'PLAYOFF EXIT'
  const map: Record<string, string> = {
    'First Round':        'FIRST ROUND EXIT',
    'Semifinals':         'SECOND ROUND EXIT',
    'Conference Finals':  'CONFERENCE FINALS EXIT',
    'NBA Finals':         'NBA FINALS — RUNNER UP',
  }
  return map[round] ?? round.toUpperCase()
}

function eraLabel(era: string): string {
  return era === '00s' ? '2000s' : era === '10s' ? '2010s' : era === '20s' ? '2020s' : era
}

function gradeColor(g: string): string {
  if (g === 'A') return C.gold
  if (g === 'B') return C.white
  if (g === 'F') return C.red
  return C.grey
}

function calcTS(s: PlayerSeasonStats): string {
  return ((s.FG_PCT * 0.9 + s.FT_PCT * 0.1) * 100).toFixed(1)
}

// ─── Player headshot with slot-initial fallback ───────────────────────────────
function PlayerPhoto({ src, slot }: { src: string | null; slot: string }) {
  const wrapStyle: React.CSSProperties = {
    width: 90,
    height: 90,
    borderRadius: '50%',
    border: `2px solid ${C.goldDim}`,
    flexShrink: 0,
    marginBottom: 9,
    background: C.surface2,
    overflow: 'hidden',
    position: 'relative',
  }

  if (!src) {
    return (
      <div style={{ ...wrapStyle, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontFamily: BEBAS, fontSize: 14, color: C.goldDim, letterSpacing: '0.1em' }}>
          {slot}
        </span>
      </div>
    )
  }

  return (
    <div style={wrapStyle}>
      <img
        src={src}
        alt=""
        style={{
          position: 'absolute',
          height: '100%',
          width: 'auto',
          maxWidth: 'none',   // override Tailwind's max-width: 100% that causes squishing
          top: 0,
          left: '50%',
          transform: 'translateX(-50%)',
        }}
      />
    </div>
  )
}

// ─── Stat label/value row used inside starter cards ───────────────────────────
function StatRow({ lbl, val, lead }: { lbl: string; val: string; lead: boolean }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      borderTop: `1px solid ${C.goldFaint}`,
      padding: '0 6px',
    }}>
      <span style={{
        fontFamily: INTER,
        fontSize: 9,
        color: C.grey,
        letterSpacing: '0.15em',
        textTransform: 'uppercase',
      }}>
        {lbl}
      </span>
      <span style={{
        fontFamily: INTER,
        fontSize: 14,
        fontWeight: lead ? 700 : 500,
        color: lead ? C.gold : C.white,
      }}>
        {val}
      </span>
    </div>
  )
}

const ResultCard = React.forwardRef<HTMLDivElement, ResultCardProps>(
  function ResultCard({ simEra, wins, losses, seasonStats, coach, teamRating, headshots, playoffOutcome, playerAwards = {}, finalsMVPId }, ref) {
    const starters = seasonStats.filter(s => !s.slot.startsWith('B'))
    const bench    = seasonStats.filter(s =>  s.slot.startsWith('B'))

    const maxPPG = Math.max(...seasonStats.map(s => s.PTS))
    const maxRPG = Math.max(...seasonStats.map(s => s.REB))
    const maxAPG = Math.max(...seasonStats.map(s => s.AST))
    const maxSTL = Math.max(...seasonStats.map(s => s.STL))
    const maxBLK = Math.max(...seasonStats.map(s => s.BLK))

    const verdict =
      wins >= 60 ? 'Championship Contender' :
      wins >= 50 ? 'Playoff Team' :
      wins >= 41 ? '.500 Season' : 'Lottery Bound'

    return (
      <div
        ref={ref}
        style={{
          width: 1080,
          height: 1080,
          background: C.black,
          border: `2px solid ${C.goldBorder}`,
          overflow: 'hidden',
          position: 'relative',
          boxSizing: 'border-box',
          fontFamily: INTER,
        }}
      >
        {/* Solid gold top bar */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: C.gold }} />

        <div style={{
          padding: '42px 50px 32px',
          height: '100%',
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
        }}>

          {/* ── Header ────────────────────────────────────────────────────── */}
          <div style={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            flexShrink: 0,
            paddingBottom: 30,
          }}>
            {/* Logo */}
            <div style={{
              fontFamily: BEBAS,
              fontSize: 64,
              color: C.gold,
              letterSpacing: '0.3em',
              lineHeight: 1,
            }}>
              ERA BALL
            </div>

            {/* Record — right-aligned, prominent */}
            <div style={{ textAlign: 'right' }}>
              <div style={{
                fontFamily: INTER,
                fontSize: 11,
                color: C.grey,
                letterSpacing: '0.28em',
                textTransform: 'uppercase',
                marginBottom: -10,
              }}>
                {simEra} Era · {verdict}
              </div>
              <div style={{
                fontFamily: BEBAS,
                fontSize: 68,
                color: C.white,
                letterSpacing: '0.04em',
                lineHeight: 1,
              }}>
                {wins}–{losses}
              </div>
            </div>
          </div>

          {/* Divider */}
          <div style={{ height: 1, background: C.goldFaint, flexShrink: 0, marginBottom: 16 }} />

          {/* ── Playoff outcome banner ────────────────────────────────────── */}
          {playoffOutcome?.champion ? (
            <div style={{
              flexShrink: 0,
              marginBottom: 14,
              background: 'rgba(201,168,76,0.10)',
              border: `2px solid ${C.gold}`,
              padding: '12px 24px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20 }}>
                <div style={{ height: 2, flex: 1, background: `linear-gradient(to right, transparent, ${C.gold})` }} />
                <div style={{ fontFamily: BEBAS, fontSize: 46, color: C.gold, letterSpacing: '0.18em', lineHeight: 1 }}>
                  NBA CHAMPIONS
                </div>
                <div style={{ height: 2, flex: 1, background: `linear-gradient(to left, transparent, ${C.gold})` }} />
              </div>
              {finalsMVPId && (() => {
                const mvp = seasonStats.find(s => s.player.person_id === finalsMVPId)
                return mvp ? (
                  <div style={{ textAlign: 'center', marginTop: 6 }}>
                    <span style={{ fontFamily: INTER, fontSize: 9, color: C.goldDim, letterSpacing: '0.28em', textTransform: 'uppercase' }}>
                      Finals MVP
                    </span>
                    <span style={{ fontFamily: BEBAS, fontSize: 18, color: C.gold, letterSpacing: '0.12em', marginLeft: 10 }}>
                      {mvp.player.full_name}
                    </span>
                    <span style={{ fontFamily: INTER, fontSize: 9, color: C.grey, letterSpacing: '0.1em', marginLeft: 10 }}>
                      {mvp.PTS.toFixed(1)} PPG · {mvp.REB.toFixed(1)} RPG · {mvp.AST.toFixed(1)} APG
                    </span>
                  </div>
                ) : null
              })()}
            </div>
          ) : playoffOutcome && !playoffOutcome.champion ? (
            <div style={{
              flexShrink: 0,
              marginBottom: 14,
              background: C.surface2,
              border: `1px solid ${C.border}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '9px 20px',
            }}>
              <span style={{
                fontFamily: INTER,
                fontSize: 10,
                color: C.greyDark,
                letterSpacing: '0.28em',
                textTransform: 'uppercase',
              }}>
                Playoff Result
              </span>
              <span style={{
                fontFamily: BEBAS,
                fontSize: 24,
                color: C.red,
                letterSpacing: '0.1em',
              }}>
                {eliminationLabel(playoffOutcome.eliminatedIn)}
              </span>
            </div>
          ) : null}

          {/* ── Starting Five label ───────────────────────────────────────── */}
          <div style={{
            fontFamily: BEBAS,
            fontSize: 13,
            color: C.gold,
            letterSpacing: '0.4em',
            flexShrink: 0,
            marginBottom: 10,
          }}>
            STARTING FIVE
          </div>

          {/* ── Starter cards (flex-1 fills available space) ─────────────── */}
          <div style={{
            display: 'flex',
            gap: 8,
            flex: 1,
            minHeight: 0,
            marginBottom: 12,
          }}>
            {starters.map(s => {
              const allAwards = [
                ...(playerAwards[s.player.person_id] ?? []),
                ...(finalsMVPId === s.player.person_id ? ['FIN MVP'] : []),
              ]
              const statRows = [
                { lbl: 'PPG', val: s.PTS.toFixed(1), lead: s.PTS === maxPPG },
                { lbl: 'RPG', val: s.REB.toFixed(1), lead: s.REB === maxRPG },
                { lbl: 'APG', val: s.AST.toFixed(1), lead: s.AST === maxAPG },
                { lbl: 'STL', val: s.STL.toFixed(1), lead: s.STL === maxSTL },
                { lbl: 'BLK', val: s.BLK.toFixed(1), lead: s.BLK === maxBLK },
                { lbl: 'TS%', val: `${calcTS(s)}%`,  lead: false },
                ...(allAwards.length > 0 ? [{ lbl: 'Awards', val: allAwards.join(' · '), lead: true }] : []),
              ]
              return (
                <div
                  key={s.player.person_id}
                  style={{
                    flex: 1,
                    background: C.surface,
                    border: `1px solid ${C.border}`,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    padding: '14px 8px 12px',
                  }}
                >
                  {/* ① Position badge */}
                  <div style={{
                    fontFamily: BEBAS,
                    fontSize: 20,
                    color: C.goldDim,
                    letterSpacing: '0.35em',
                    marginBottom: 8,
                    flexShrink: 0,
                  }}>
                    {s.slot}
                  </div>

                  {/* ② Photo circle */}
                  <PlayerPhoto src={headshots[s.player.person_id] ?? null} slot={s.slot} />

                  {/* ③ Name */}
                  <div style={{
                    fontFamily: INTER,
                    fontSize: 13,
                    fontWeight: 700,
                    color: C.white,
                    textAlign: 'center',
                    lineHeight: 1.25,
                    marginBottom: 4,
                    width: '100%',
                    whiteSpace: 'normal',
                    wordBreak: 'break-word',
                    boxSizing: 'border-box',
                    padding: '0 4px',
                    flexShrink: 0,
                  }}>
                    {s.player.full_name}
                  </div>

                  {/* ④ Era tag */}
                  <div style={{
                    fontFamily: BEBAS,
                    fontSize: 11,
                    color: C.grey,
                    letterSpacing: '0.28em',
                    marginBottom: 10,
                    flexShrink: 0,
                  }}>
                    {eraLabel(s.player.era)}
                  </div>

                  {/* ⑤ Stats — immediately below era, fills remaining height.
                      Extra space distributes between rows (space-around), never
                      creates a gap above the first row. */}
                  <div style={{
                    width: '100%',
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-around',
                    borderTop: `1px solid ${C.goldFaint}`,
                  }}>
                    {statRows.map(r => (
                      <StatRow key={r.lbl} {...r} />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>

          {/* ── Bench ─────────────────────────────────────────────────────── */}
          <div style={{
            fontFamily: BEBAS,
            fontSize: 12,
            color: C.grey,
            letterSpacing: '0.4em',
            flexShrink: 0,
            marginBottom: 7,
          }}>
            BENCH
          </div>

          {/* One horizontal row per bench player */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 5,
            flexShrink: 0,
            marginBottom: 14,
          }}>
            {bench.map(s => (
              <div
                key={s.player.person_id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: C.surface2,
                  border: `1px solid ${C.border}`,
                  padding: '0 14px',
                  minHeight: 38,
                }}
              >
                {/* Left: name + era + awards */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0, overflow: 'visible', transform: 'translateY(-8px)' }}>
                  <span style={{
                    fontFamily: INTER,
                    fontSize: 13,
                    fontWeight: 700,
                    color: C.white,
                    lineHeight: 1.25,
                    whiteSpace: 'nowrap',
                  }}>
                    {s.player.full_name}
                  </span>
                  <span style={{
                    fontFamily: BEBAS,
                    fontSize: 10,
                    color: C.greyDark,
                    letterSpacing: '0.22em',
                    flexShrink: 0,
                    position: 'relative',
                    top: 4,
                  }}>
                    {eraLabel(s.player.era)}
                  </span>
                  {[
                    ...(playerAwards[s.player.person_id] ?? []),
                    ...(finalsMVPId === s.player.person_id ? ['FIN MVP'] : []),
                  ].map(a => (
                    <span key={a} style={{
                      fontFamily: INTER,
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: '0.12em',
                      textTransform: 'uppercase',
                      color: C.gold,
                      position: 'relative',
                      top: 4,
                      flexShrink: 0,
                    }}>
                      {a}
                    </span>
                  ))}
                </div>

                {/* Right: PPG · RPG · APG inline */}
                <div style={{ display: 'flex', gap: 18, flexShrink: 0, marginLeft: 12, alignItems: 'center', transform: 'translateY(-8px)' }}>
                  {[
                    { lbl: 'PPG', val: s.PTS.toFixed(1), lead: s.PTS === maxPPG },
                    { lbl: 'RPG', val: s.REB.toFixed(1), lead: s.REB === maxRPG },
                    { lbl: 'APG', val: s.AST.toFixed(1), lead: s.AST === maxAPG },
                  ].map(({ lbl, val, lead }) => (
                    <div key={lbl} style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                      <span style={{
                        fontFamily: INTER,
                        fontSize: 9,
                        color: C.greyDark,
                        letterSpacing: '0.14em',
                        textTransform: 'uppercase',
                      }}>
                        {lbl}
                      </span>
                      <span style={{
                        fontFamily: INTER,
                        fontSize: 13,
                        fontWeight: lead ? 700 : 400,
                        color: lead ? C.gold : C.grey,
                      }}>
                        {val}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Footer divider */}
          <div style={{ height: 1, background: C.goldFaint, flexShrink: 0, marginBottom: 14 }} />

          {/* ── Footer ────────────────────────────────────────────────────── */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexShrink: 0,
            gap: 24,
          }}>
            {/* Coach section */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
              <img
                src={`/api/coach-headshot?name=${encodeURIComponent(coach.name)}`}
                alt=""
                style={{
                  width: 48, height: 48, borderRadius: '50%',
                  objectFit: 'cover', objectPosition: 'center top',
                  border: `1px solid ${C.goldDim}`,
                  background: C.surface2,
                  flexShrink: 0,
                }}
                onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
              />
              <div style={{ minWidth: 0 }}>
                <div style={{
                  fontFamily: INTER,
                  fontSize: 9,
                  color: C.grey,
                  letterSpacing: '0.25em',
                  textTransform: 'uppercase',
                  marginBottom: 2,
                }}>
                  Coach
                </div>
                <div style={{
                  fontFamily: BEBAS,
                  fontSize: 26,
                  color: C.white,
                  letterSpacing: '0.08em',
                  lineHeight: 1.25,
                  marginBottom: 5,
                  whiteSpace: 'nowrap',
                }}>
                  {coach.name}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'nowrap', marginTop: 2 }}>
                  {coach.offGuru && (
                    <span style={{ fontFamily: INTER, fontSize: 8, fontWeight: 700, letterSpacing: '0.12em', color: '#000', background: C.gold, padding: '2px 5px', borderRadius: 2, textTransform: 'uppercase', flexShrink: 0 }}>OFF GURU</span>
                  )}
                  {coach.defGuru && (
                    <span style={{ fontFamily: INTER, fontSize: 8, fontWeight: 700, letterSpacing: '0.12em', color: '#000', background: '#4A9ECC', padding: '2px 5px', borderRadius: 2, textTransform: 'uppercase', flexShrink: 0 }}>DEF GURU</span>
                  )}
                  <div style={{ display: 'flex', gap: 12, flexShrink: 0 }}>
                    {([['OFF', coach.offGrade], ['DEF', coach.defGrade], ['OVR', coach.overallGrade]] as [string, string][]).map(([lbl, grade]) => (
                      <div key={lbl} style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
                        <span style={{ fontFamily: INTER, fontSize: 9, color: C.greyDark, letterSpacing: '0.2em', textTransform: 'uppercase' }}>
                          {lbl}
                        </span>
                        <span style={{ fontFamily: BEBAS, fontSize: 16, color: gradeColor(grade), letterSpacing: '0.08em' }}>
                          {grade}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Team rating */}
            <div style={{ textAlign: 'right', flexShrink: 0, alignSelf: 'center', position: 'relative', top: -25 }}>
              <div style={{
                fontFamily: INTER,
                fontSize: 15,
                color: C.grey,
                letterSpacing: '0.35em',
                textTransform: 'uppercase',
                marginBottom: 2,
                position: 'relative',   // ← add this
                top: 20,                 // ← add this, increase to go further down
              }}>
                Team Rating
              </div>
              <div style={{
                fontFamily: BEBAS,
                fontSize: 72,
                color: C.gold,
                lineHeight: 1,
                letterSpacing: '0.02em',
              }}>
                {Math.round(teamRating + 15)}
              </div>
            </div>
          </div>

          {/* Branding */}
          <div style={{
            textAlign: 'center',
            marginTop: 12,
            flexShrink: 0,
          }}>
            <span style={{
              fontFamily: INTER,
              fontSize: 10,
              color: 'rgba(201,168,76,0.35)',
              letterSpacing: '0.3em',
              textTransform: 'uppercase',
            }}>
              eraball.app
            </span>
          </div>

        </div>
      </div>
    )
  }
)

export default ResultCard
