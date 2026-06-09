import { useState, useMemo } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
  SortingState,
} from '@tanstack/react-table'
import { StatMeta } from './StatSelector.js'

export interface PlayerRow {
  player: string
  gamesPlayed: number
  teams: string[]
  stats: Record<string, number | null>
}

interface Props {
  rows: PlayerRow[]
  statMetas: StatMeta[]
  selectedStats: Set<string>
}

function formatValue(value: number | null, format: string): string {
  if (value == null) return '—'
  switch (format) {
    case 'percent':
      return (value * 100).toFixed(1) + '%'
    case 'float1':
      return value.toFixed(1)
    case 'float2':
      return value.toFixed(2)
    default:
      return value.toLocaleString()
  }
}

function exportCsv(rows: PlayerRow[], visibleStats: StatMeta[], perMap: boolean) {
  const headers = ['Player', ...visibleStats.map((s) => s.label)]
  const lines = rows.map((r) => [
    r.player,
    ...visibleStats.map((s) => {
      const v = r.stats[s.id]
      if (v == null) return ''
      const divided = perMap && s.format !== 'percent' && s.id !== 'maps' && !s.noPerMap
      if (s.format === 'percent') return (v * 100).toFixed(1)
      if (divided || s.format === 'float1') return v.toFixed(1)
      if (s.format === 'float2') return v.toFixed(2)
      return String(v)
    }),
  ])
  const csv = [headers, ...lines].map((row) => row.join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'mvd-stats.csv'
  a.click()
  URL.revokeObjectURL(url)
}

const helper = createColumnHelper<PlayerRow>()

export default function ResultsTable({ rows, statMetas, selectedStats }: Props) {
  const [sorting, setSorting] = useState<SortingState>([{ id: 'frags', desc: true }])
  const [perMap, setPerMap] = useState(false)
  const [teamFilter, setTeamFilter] = useState<Set<string>>(new Set())
  const [teamSearch, setTeamSearch] = useState('')
  const [playerFilter, setPlayerFilter] = useState<Set<string>>(new Set())
  const [playerSearch, setPlayerSearch] = useState('')

  const allTeams = useMemo(() => {
    const s = new Set<string>()
    for (const r of rows) for (const t of r.teams) s.add(t)
    return Array.from(s).sort()
  }, [rows])

  // Players in the selected teams (for the player chip picker)
  const playersInSelectedTeams = useMemo(() => {
    if (teamFilter.size === 0) return []
    return rows
      .filter((r) => r.teams.some((t) => teamFilter.has(t)))
      .map((r) => r.player)
      .sort()
  }, [rows, teamFilter])

  const filteredRows = useMemo(() => {
    let result = rows
    if (teamFilter.size > 0)
      result = result.filter((r) => r.teams.some((t) => teamFilter.has(t)))
    if (playerFilter.size > 0)
      result = result.filter((r) => playerFilter.has(r.player))
    return result
  }, [rows, teamFilter, playerFilter])

  function toggleTeam(team: string) {
    setTeamFilter((prev) => {
      const next = new Set(prev)
      if (next.has(team)) next.delete(team)
      else next.add(team)
      return next
    })
    // clear player filter when team selection changes
    setPlayerFilter(new Set())
  }

  function togglePlayer(player: string) {
    setPlayerFilter((prev) => {
      const next = new Set(prev)
      if (next.has(player)) next.delete(player)
      else next.add(player)
      return next
    })
  }

  const visibleStats = useMemo(
    () => statMetas.filter((s) => selectedStats.has(s.id)),
    [statMetas, selectedStats]
  )

  // Pre-divide stats into display rows so the table always sees a new `data`
  // reference when perMap changes (avoids stale sorted-row cache in TanStack).
  const displayRows = useMemo(() => {
    if (!perMap) return filteredRows
    return filteredRows.map((row) => {
      const newStats: Record<string, number | null> = {}
      for (const [id, v] of Object.entries(row.stats)) {
        const s = visibleStats.find((x) => x.id === id)
        const divide = s ? s.format !== 'percent' && s.id !== 'maps' && !s.noPerMap : true
        newStats[id] = divide && v != null && row.gamesPlayed > 0
          ? v / row.gamesPlayed
          : v
      }
      return { ...row, stats: newStats }
    })
  }, [filteredRows, perMap, visibleStats])

  const columns = useMemo(() => {
    const base = [
      helper.accessor('player', {
        header: 'Player',
        cell: (info) => info.getValue(),
      }),
    ]
    const statCols = visibleStats.map((s) => {
      const divided = perMap && s.format !== 'percent' && s.id !== 'maps' && !s.noPerMap
      return helper.accessor(
        (row) => row.stats[s.id] ?? null,
        {
          id: s.id,
          header: s.label,
          cell: (info) => {
            const v = info.getValue()
            if (v == null) return <span className="null-val">—</span>
            return formatValue(v, divided ? 'float1' : s.format)
          },
        },
      )
    })
    return [...base, ...statCols]
  }, [visibleStats, perMap])

  const shownTeams = allTeams.filter((t) => t.toLowerCase().includes(teamSearch.toLowerCase()))
  const shownPlayers = playersInSelectedTeams.filter((p) =>
    p.toLowerCase().includes(playerSearch.toLowerCase()),
  )

  const table = useReactTable({
    data: displayRows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  if (rows.length === 0) {
    return <div className="empty-msg">No results yet.</div>
  }

  return (
    <div>
      {allTeams.length > 0 && (
        <div className="team-filter">
          <span className="team-filter-label">Filter by team:</span>
          <input
            className="team-filter-search"
            type="text"
            placeholder="Search teams…"
            value={teamSearch}
            onChange={(e) => setTeamSearch(e.target.value)}
          />
          {teamFilter.size > 0 && (
            <button className="btn-secondary btn-small" onClick={() => { setTeamFilter(new Set()); setPlayerFilter(new Set()) }}>
              Clear
            </button>
          )}
          <div className="team-filter-chips">
            {shownTeams.map((t) => (
              <button
                key={t}
                className={`team-chip${teamFilter.has(t) ? ' team-chip-active' : ''}`}
                onClick={() => toggleTeam(t)}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      )}
      {teamFilter.size > 0 && playersInSelectedTeams.length > 0 && (
        <div className="team-filter">
          <span className="team-filter-label">Filter by player:</span>
          <input
            className="team-filter-search"
            type="text"
            placeholder="Search players…"
            value={playerSearch}
            onChange={(e) => setPlayerSearch(e.target.value)}
          />
          {playerFilter.size > 0 && (
            <button className="btn-secondary btn-small" onClick={() => setPlayerFilter(new Set())}>
              Clear
            </button>
          )}
          <div className="team-filter-chips">
            {shownPlayers.map((p) => (
              <button
                key={p}
                className={`team-chip${playerFilter.has(p) ? ' team-chip-active' : ''}`}
                onClick={() => togglePlayer(p)}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="export-row">
        <div className="toggle-permap">
          <button
            className={`btn-secondary btn-small${perMap ? '' : ' btn-active'}`}
            onClick={() => setPerMap(false)}
          >
            Total
          </button>
          <button
            className={`btn-secondary btn-small${perMap ? ' btn-active' : ''}`}
            onClick={() => setPerMap(true)}
          >
            Avg / map
          </button>
        </div>
        <button
          className="btn-secondary btn-small"
          onClick={() => exportCsv(displayRows, visibleStats, perMap)}
        >
          Export CSV
        </button>
      </div>
      <div className="results-wrap">
        <table className="results-table">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((header) => (
                  <th
                    key={header.id}
                    onClick={header.column.getToggleSortingHandler()}
                    style={{ cursor: header.column.getCanSort() ? 'pointer' : 'default' }}
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    <span className="sort-icon">
                      {header.column.getIsSorted() === 'asc'
                        ? ' ↑'
                        : header.column.getIsSorted() === 'desc'
                        ? ' ↓'
                        : ''}
                    </span>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
