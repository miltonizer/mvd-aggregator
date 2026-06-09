import { useState, useEffect, useCallback } from 'react'
import SearchForm, { SearchFormValues } from './components/SearchForm.js'
import GameList, { HubGame } from './components/GameList.js'
import StatSelector, { StatMeta } from './components/StatSelector.js'
import ResultsTable, { PlayerRow } from './components/ResultsTable.js'
import AliasEditor from './components/AliasEditor.js'

const PAGE_SIZE = 50

// Default stats selected on first load
const DEFAULT_SELECTED_STATS = new Set([
  'maps', 'frags', 'kills', 'deaths', 'efficiency',
  'damage_given', 'damage_taken', 'net_damage',
  'rl_taken', 'rl_kills_carrying', 'rl_drops',
  'lg_taken', 'lg_kills_carrying', 'lg_drops',
  'rl_drop_frags', 'lg_drop_frags', 'total_drop_frags',
])

export default function App() {
  const [showAliasEditor, setShowAliasEditor] = useState(false)

  // Search state
  const [searchValues, setSearchValues] = useState<SearchFormValues | null>(null)
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [games, setGames] = useState<HubGame[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [offset, setOffset] = useState(0)

  // Selection state
  const [selectedGames, setSelectedGames] = useState<Set<number>>(new Set())

  // Stat registry
  const [statMetas, setStatMetas] = useState<StatMeta[]>([])
  const [selectedStats, setSelectedStats] = useState<Set<string>>(DEFAULT_SELECTED_STATS)

  // Aggregation state
  const [aggLoading, setAggLoading] = useState(false)
  const [aggProgress, setAggProgress] = useState<{ loaded: number; total: number } | null>(null)
  const [aggError, setAggError] = useState<string | null>(null)
  const [results, setResults] = useState<PlayerRow[] | null>(null)

  // Load stat registry on mount
  useEffect(() => {
    fetch('/api/stats')
      .then((r) => r.json())
      .then((data: StatMeta[]) => {
        setStatMetas(data)
        // Keep only stats that exist in registry
        setSelectedStats((prev) => {
          const valid = new Set(data.map((s) => s.id))
          return new Set([...prev].filter((id) => valid.has(id)))
        })
      })
      .catch((e) => console.error('Failed to load stats:', e))
  }, [])

  // Search
  const runSearch = useCallback(
    async (values: SearchFormValues, pageOffset = 0) => {
      setSearchLoading(true)
      setSearchError(null)
      try {
        const params = new URLSearchParams()
        if (values.players.trim()) params.set('players', values.players)
        if (values.teams.trim()) params.set('teams', values.teams)
        if (values.map.trim()) params.set('map', values.map)
        if (values.mode) params.set('mode', values.mode)
        if (values.matchtag.trim()) params.set('matchtag', values.matchtag)
        if (values.from) params.set('from', values.from)
        if (values.to) params.set('to', values.to)
        params.set('limit', String(PAGE_SIZE))
        params.set('offset', String(pageOffset))

        const resp = await fetch(`/api/search?${params.toString()}`)
        if (!resp.ok) throw new Error(`Search failed: ${resp.status}`)
        const data = await resp.json() as { games: HubGame[]; count: number }
        setGames(data.games)
        setTotalCount(data.count)
        setOffset(pageOffset)
        setSelectedGames(new Set())
      } catch (e) {
        setSearchError(String(e))
      } finally {
        setSearchLoading(false)
      }
    },
    []
  )

  function handleSearch(values: SearchFormValues) {
    setSearchValues(values)
    runSearch(values, 0)
  }

  function handlePageChange(newOffset: number) {
    if (searchValues) runSearch(searchValues, newOffset)
  }

  // Game selection
  function toggleGame(id: number) {
    setSelectedGames((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectAll() {
    setSelectedGames(new Set(games.map((g) => g.id)))
  }

  const [selectAllLoading, setSelectAllLoading] = useState(false)

  async function selectAllResults() {
    if (!searchValues) return
    setSelectAllLoading(true)
    try {
      const params = new URLSearchParams()
      if (searchValues.players.trim()) params.set('players', searchValues.players)
      if (searchValues.teams.trim()) params.set('teams', searchValues.teams)
      if (searchValues.map.trim()) params.set('map', searchValues.map)
      if (searchValues.mode) params.set('mode', searchValues.mode)
      if (searchValues.matchtag.trim()) params.set('matchtag', searchValues.matchtag)
      if (searchValues.from) params.set('from', searchValues.from)
      if (searchValues.to) params.set('to', searchValues.to)
      params.set('limit', '500')
      params.set('offset', '0')
      const resp = await fetch(`/api/search?${params.toString()}`)
      if (!resp.ok) throw new Error(`Search failed: ${resp.status}`)
      const data = await resp.json() as { games: HubGame[]; count: number }
      setSelectedGames(new Set(data.games.map((g) => g.id)))
    } catch (e) {
      console.error('selectAllResults:', e)
    } finally {
      setSelectAllLoading(false)
    }
  }

  function selectNone() {
    setSelectedGames(new Set())
  }

  // Stat selection
  function toggleStat(id: string) {
    setSelectedStats((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleGroup(ids: string[], allSelected: boolean) {
    setSelectedStats((prev) => {
      const next = new Set(prev)
      if (allSelected) ids.forEach((id) => next.delete(id))
      else ids.forEach((id) => next.add(id))
      return next
    })
  }

  // Aggregate — always compute all stats so the user can toggle columns freely
  // after loading without re-fetching demos.
  async function runAggregate() {
    if (selectedGames.size === 0 || statMetas.length === 0) return
    setAggLoading(true)
    setAggError(null)
    setAggProgress({ loaded: 0, total: selectedGames.size })
    setResults(null)

    try {
      const resp = await fetch('/api/aggregate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameIds: Array.from(selectedGames),
          statIds: statMetas.map((s) => s.id),
        }),
      })

      if (!resp.ok || !resp.body) {
        throw new Error(`Request failed: ${resp.status}`)
      }

      const reader = resp.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const parts = buf.split('\n\n')
        buf = parts.pop() ?? ''
        for (const part of parts) {
          const lines = part.trim().split('\n')
          let event = 'message'
          let data = ''
          for (const line of lines) {
            if (line.startsWith('event: ')) event = line.slice(7)
            else if (line.startsWith('data: ')) data = line.slice(6)
          }
          if (!data) continue
          if (event === 'progress') {
            const p = JSON.parse(data) as { loaded: number; total: number }
            setAggProgress(p)
          } else if (event === 'result') {
            setResults(JSON.parse(data) as PlayerRow[])
          } else if (event === 'error') {
            const e = JSON.parse(data) as { message: string }
            setAggError(e.message)
          }
        }
      }
    } catch (e) {
      setAggError(String(e))
    } finally {
      setAggLoading(false)
    }
  }

  const progressPct =
    aggProgress && aggProgress.total > 0
      ? (aggProgress.loaded / aggProgress.total) * 100
      : 0

  return (
    <div className="app">
      <div className="header">
        <h1>MVD Aggregator</h1>
        <span>Multi-demo stats from mvd-api</span>
        <button className="btn btn-alias" onClick={() => setShowAliasEditor((v) => !v)}>
          {showAliasEditor ? 'Hide aliases' : 'Edit aliases'}
        </button>
      </div>

      {showAliasEditor && (
        <div className="panel">
          <AliasEditor onClose={() => setShowAliasEditor(false)} />
        </div>
      )}

      <SearchForm onSearch={handleSearch} loading={searchLoading} />

      {searchError && <div className="error-msg">{searchError}</div>}

      {games.length > 0 && (
        <div className="panel">
          <GameList
            games={games}
            selected={selectedGames}
            onToggle={toggleGame}
            onSelectAll={selectAll}
            onSelectAllResults={selectAllResults}
            selectAllResultsLoading={selectAllLoading}
            onSelectNone={selectNone}
            totalCount={totalCount}
            offset={offset}
            limit={PAGE_SIZE}
            onPageChange={handlePageChange}
          />
        </div>
      )}

      {statMetas.length > 0 && (
        <div className="panel">
          <StatSelector
            stats={statMetas}
            selected={selectedStats}
            onToggle={toggleStat}
            onToggleGroup={toggleGroup}
            onSelectAll={() => setSelectedStats(new Set(statMetas.map((s) => s.id)))}
            onSelectNone={() => setSelectedStats(new Set())}
          />
          <div className="form-actions" style={{ marginTop: 16 }}>
            <button
              className="btn-primary"
              disabled={selectedGames.size === 0 || selectedStats.size === 0 || aggLoading}
              onClick={runAggregate}
            >
              {aggLoading
                ? `Loading demos… (${aggProgress?.loaded ?? 0}/${aggProgress?.total ?? 0})`
                : `Aggregate ${selectedGames.size} demo${selectedGames.size !== 1 ? 's' : ''}`}
            </button>
            {selectedGames.size === 0 && (
              <span style={{ color: '#666', fontSize: '0.82rem' }}>
                Select demos above first
              </span>
            )}
          </div>

          {aggLoading && (
            <div style={{ marginTop: 12 }}>
              <div className="progress-bar-wrap">
                <div
                  className="progress-bar-fill"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <div className="progress-label">
                {aggProgress?.loaded} / {aggProgress?.total} demos loaded
              </div>
            </div>
          )}
        </div>
      )}

      {aggError && <div className="error-msg">{aggError}</div>}

      {results && (
        <div className="panel">
          <h2>Results — {results.length} player{results.length !== 1 ? 's' : ''}</h2>
          <ResultsTable
            rows={results}
            statMetas={statMetas}
            selectedStats={selectedStats}
          />
        </div>
      )}
    </div>
  )
}
