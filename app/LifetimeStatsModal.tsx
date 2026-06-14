'use client'

import React, { useState, useEffect } from 'react'
import { getLifetimeStats, clearLifetimeStats, type LifetimeStats } from '../lib/lifetimeStats'

const ALL_ERAS = ['50s','60s','70s','80s','90s','00s','10s','20s']

const G = {
  gold:      '#C9A84C',
  goldDim:   '#7A6430',
  goldFaint: 'rgba(201,168,76,0.10)',
  grey:      '#888888',
  greyDark:  '#333333',
  surface:   '#111111',
  border:    '#252525',
  white:     '#FFFFFF',
  black:     '#000000',
}
const BEBAS = '"Bebas Neue", Impact, sans-serif'
const INTER = 'Inter, system-ui, sans-serif'

function eraLabel(era: string) {
  return era === '00s' ? '2000s' : era === '10s' ? '2010s' : era === '20s' ? '2020s' : era
}

function StatBox({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ background: G.surface, border: `1px solid ${G.border}`, padding: '14px 16px', flex: 1, minWidth: 0 }}>
      <div style={{ fontFamily: INTER, fontSize: 9, color: G.grey, letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: BEBAS, fontSize: 32, color: G.gold, letterSpacing: '0.06em', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontFamily: INTER, fontSize: 10, color: G.grey, marginTop: 3 }}>{sub}</div>}
    </div>
  )
}

export default function LifetimeStatsModal({ onClose }: { onClose: () => void }) {
  const [stats, setStats] = useState<LifetimeStats | null>(null)
  const [confirming, setConfirming] = useState(false)

  useEffect(() => { setStats(getLifetimeStats()) }, [])

  if (!stats) return null

  const winPct = stats.totalWins + stats.totalLosses > 0
    ? ((stats.totalWins / (stats.totalWins + stats.totalLosses)) * 100).toFixed(1)
    : '—'

  const mostDrafted = Object.values(stats.playerDraftCounts).sort((a, b) => b.count - a.count)[0]
  const mostDraftedCoach = Object.values(stats.coachDraftCounts).sort((a, b) => b.count - a.count)[0]

  const favoriteEra = Object.entries(stats.eraSpinCount).sort((a, b) => b[1] - a[1])[0]

  const erasWithRecord = ALL_ERAS.filter(e => stats.recordByEra[e])

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: G.black, border: `1px solid ${G.border}`, width: '100%', maxWidth: 680, maxHeight: '90vh', overflowY: 'auto', fontFamily: INTER }}
      >
        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: `1px solid ${G.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontFamily: BEBAS, fontSize: 28, color: G.gold, letterSpacing: '0.2em' }}>Lifetime Stats</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: G.grey, fontSize: 18, cursor: 'pointer' }}>✕</button>
        </div>

        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>

          {stats.draftsCompleted === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 0' }}>
              <div style={{ fontFamily: BEBAS, fontSize: 22, color: G.gold, letterSpacing: '0.12em', marginBottom: 10 }}>No runs completed yet</div>
              <div style={{ fontFamily: INTER, fontSize: 13, color: G.grey, lineHeight: 1.6 }}>Play a full draft to start tracking your stats.</div>
              <div style={{ fontFamily: INTER, fontSize: 11, color: G.greyDark, marginTop: 14, lineHeight: 1.6 }}>Stats are stored locally on this device<br />and do not carry over to other devices.</div>
            </div>
          ) : (
            <>
              {/* Top row */}
              <div style={{ display: 'flex', gap: 8 }}>
                <StatBox label="Drafts Completed" value={String(stats.draftsCompleted)} />
                <StatBox label="All-Time Record" value={`${stats.totalWins}–${stats.totalLosses}`} sub={`${winPct}% win rate`} />
                <StatBox label="Championships" value={String(stats.championshipsTotal)} />
              </div>

              {/* Second row */}
              <div style={{ display: 'flex', gap: 8 }}>
                <StatBox
                  label="Best Record"
                  value={stats.bestRecord ? `${stats.bestRecord.wins}–${stats.bestRecord.losses}` : '—'}
                  sub={stats.bestRecord ? eraLabel(stats.bestRecord.era) : undefined}
                />
                <StatBox
                  label="Worst Record"
                  value={stats.worstRecord ? `${stats.worstRecord.wins}–${stats.worstRecord.losses}` : '—'}
                  sub={stats.worstRecord ? eraLabel(stats.worstRecord.era) : undefined}
                />
                <StatBox
                  label="Highest Team Rating"
                  value={stats.highestTeamRating ? String(stats.highestTeamRating.rating) : '—'}
                  sub={stats.highestTeamRating ? eraLabel(stats.highestTeamRating.era) : undefined}
                />
                <StatBox
                  label="Favorite Era"
                  value={favoriteEra ? eraLabel(favoriteEra[0]) : '—'}
                  sub={favoriteEra ? `${favoriteEra[1]} played` : undefined}
                />
              </div>

              {/* Most drafted player + coach */}
              <div style={{ display: 'flex', gap: 8 }}>
                {mostDrafted && (
                  <div style={{ background: G.surface, border: `1px solid ${G.border}`, padding: '14px 16px', flex: 1 }}>
                    <div style={{ fontFamily: INTER, fontSize: 9, color: G.grey, letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: 6 }}>Most Drafted Player</div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                      <div style={{ fontFamily: BEBAS, fontSize: 24, color: G.gold, letterSpacing: '0.06em' }}>{mostDrafted.name}</div>
                      <div style={{ fontFamily: INTER, fontSize: 12, color: G.grey }}>{mostDrafted.count}×</div>
                    </div>
                  </div>
                )}
                {mostDraftedCoach && (
                  <div style={{ background: G.surface, border: `1px solid ${G.border}`, padding: '14px 16px', flex: 1 }}>
                    <div style={{ fontFamily: INTER, fontSize: 9, color: G.grey, letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: 6 }}>Most Drafted Coach</div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                      <div style={{ fontFamily: BEBAS, fontSize: 24, color: G.gold, letterSpacing: '0.06em' }}>{mostDraftedCoach.name}</div>
                      <div style={{ fontFamily: INTER, fontSize: 12, color: G.grey }}>{mostDraftedCoach.count}×</div>
                    </div>
                  </div>
                )}
              </div>

              {/* Record by era */}
              {erasWithRecord.length > 0 && (
                <div style={{ background: G.surface, border: `1px solid ${G.border}` }}>
                  <div style={{ padding: '12px 16px', borderBottom: `1px solid ${G.border}`, fontFamily: INTER, fontSize: 9, color: G.grey, letterSpacing: '0.18em', textTransform: 'uppercase' }}>
                    Record by Era
                  </div>
                  {erasWithRecord.map(era => {
                    const rec = stats.recordByEra[era]!
                    const best = stats.bestRecordByEra[era]
                    const worst = stats.worstRecordByEra[era]
                    const champs = stats.championshipsByEra[era] ?? 0
                    const pct = ((rec.wins / (rec.wins + rec.losses)) * 100).toFixed(0)
                    return (
                      <div key={era} style={{ display: 'flex', alignItems: 'center', padding: '10px 16px', borderBottom: `1px solid ${G.border}`, gap: 12 }}>
                        <div style={{ fontFamily: BEBAS, fontSize: 18, color: G.gold, letterSpacing: '0.1em', width: 52 }}>{eraLabel(era)}</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontFamily: INTER, fontSize: 13, color: G.white }}>{rec.wins}–{rec.losses} <span style={{ color: G.grey, fontSize: 11 }}>({pct}%)</span></div>
                          <div style={{ display: 'flex', gap: 10, marginTop: 2 }}>
                            {best && <div style={{ fontSize: 10, color: G.grey }}>Best: {best.wins}–{best.losses}</div>}
                            {worst && <div style={{ fontSize: 10, color: G.greyDark }}>Worst: {worst.wins}–{worst.losses}</div>}
                          </div>
                        </div>
                        {champs > 0 && (
                          <div style={{ fontFamily: BEBAS, fontSize: 13, color: G.gold, letterSpacing: '0.1em', textAlign: 'right' }}>
                            Championships<br />
                            <span style={{ fontSize: 18 }}>×{champs}</span>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}

          <div style={{ borderTop: `1px solid ${G.border}`, paddingTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontFamily: INTER, fontSize: 10, color: G.greyDark }}>Stored locally — does not carry over to other devices.</div>
            {confirming ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, color: G.grey }}>Reset all stats?</span>
                <button onClick={() => { clearLifetimeStats(); setStats(getLifetimeStats()); setConfirming(false) }}
                  style={{ padding: '4px 12px', background: '#CC333322', color: '#CC3333', border: '1px solid #CC3333', cursor: 'pointer', fontSize: 11, letterSpacing: '0.06em' }}>
                  Confirm
                </button>
                <button onClick={() => setConfirming(false)}
                  style={{ padding: '4px 12px', background: 'none', color: G.grey, border: `1px solid ${G.border}`, cursor: 'pointer', fontSize: 11 }}>
                  Cancel
                </button>
              </div>
            ) : (
              <button onClick={() => setConfirming(true)}
                style={{ padding: '4px 12px', background: 'none', color: G.greyDark, border: `1px solid ${G.greyDark}`, cursor: 'pointer', fontSize: 11, letterSpacing: '0.06em' }}>
                Reset Stats
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
