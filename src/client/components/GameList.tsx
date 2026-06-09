export interface HubPlayer {
  name: string
  team: string
  frags: number
}

export interface HubGame {
  id: number
  timestamp: string
  mode: string
  matchtag: string | null
  map: string
  team_names: string[] | null
  players: HubPlayer[] | string[]
  demo_sha256: string | null
}

function playerName(p: HubPlayer | string): string {
  return typeof p === 'string' ? p : p.name
}

interface Props {
  games: HubGame[]
  selected: Set<number>
  onToggle: (id: number) => void
  onSelectAll: () => void
  onSelectAllResults: () => void
  selectAllResultsLoading: boolean
  onSelectNone: () => void
  totalCount: number
  offset: number
  limit: number
  onPageChange: (newOffset: number) => void
}

export default function GameList({
  games,
  selected,
  onToggle,
  onSelectAll,
  onSelectAllResults,
  selectAllResultsLoading,
  onSelectNone,
  totalCount,
  offset,
  limit,
  onPageChange,
}: Props) {
  if (games.length === 0) {
    return <div className="empty-msg">No games found.</div>
  }

  const pages = Math.ceil(totalCount / limit)
  const page = Math.floor(offset / limit)

  return (
    <div>
      <div className="game-list-header">
        <span style={{ color: '#888', fontSize: '0.82rem' }}>
          {totalCount} game{totalCount !== 1 ? 's' : ''} found
          {' · '}{selected.size} selected
        </span>
        <div className="game-list-header-actions">
          <button className="btn-secondary btn-small" onClick={onSelectAll}>
            Select page
          </button>
          <button className="btn-secondary btn-small" onClick={onSelectAllResults} disabled={selectAllResultsLoading}>
            {selectAllResultsLoading ? 'Loading…' : `Select all ${totalCount}`}
          </button>
          <button className="btn-secondary btn-small" onClick={onSelectNone}>
            Select none
          </button>
        </div>
      </div>

      <table className="game-table">
        <thead>
          <tr>
            <th></th>
            <th>Date</th>
            <th>Mode</th>
            <th>Map</th>
            <th>Teams / Players</th>
            <th>Tag</th>
            <th>ID</th>
          </tr>
        </thead>
        <tbody>
          {games.map((g) => (
            <tr key={g.id}>
              <td>
                <input
                  type="checkbox"
                  checked={selected.has(g.id)}
                  onChange={() => onToggle(g.id)}
                />
              </td>
              <td>{new Date(g.timestamp).toLocaleDateString('fi-FI', { timeZone: 'Europe/Berlin' })}</td>
              <td>{g.mode}</td>
              <td className="monospace">{g.map}</td>
              <td>
                {g.team_names && g.team_names.length > 0
                  ? g.team_names.join(' vs ')
                  : g.players.map(playerName).join(', ')}
              </td>
              <td>
                {g.matchtag && <span className="tag">{g.matchtag}</span>}
              </td>
              <td className="monospace" style={{ color: '#666' }}>{g.id}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {pages > 1 && (
        <div className="pagination">
          <button
            className="btn-secondary btn-small"
            disabled={page === 0}
            onClick={() => onPageChange(Math.max(0, offset - limit))}
          >
            ← Prev
          </button>
          <span>
            Page {page + 1} / {pages}
          </span>
          <button
            className="btn-secondary btn-small"
            disabled={offset + limit >= totalCount}
            onClick={() => onPageChange(offset + limit)}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  )
}
