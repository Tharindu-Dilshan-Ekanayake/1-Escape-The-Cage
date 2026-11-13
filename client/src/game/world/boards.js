import { formatNumber } from '@shared/format'

/** The three leaderboards (ids as the server's): titles, colours and value formatting. */
export const BOARD_INFO = {
  rebirths: { title: 'Most Rebirths', color: '#ff5c8a', format: (v) => formatNumber(v) },
  strength: { title: 'Strongest', color: '#ffb21e', format: (v) => formatNumber(v) },
  cages: { title: 'Most Cages', color: '#4fc3ff', format: (v) => `${formatNumber(v)} cages` },
}

/** Rows for a board: the server's top 10, or just you when offline. */
export function boardRows(leaderboards, profile, id) {
  if (leaderboards?.[id]?.length) return leaderboards[id]
  const value = id === 'rebirths' ? profile.rebirths : id === 'strength' ? profile.stats.bestMuscle : profile.stats.bestCage
  return [{ name: profile.name, value }]
}
