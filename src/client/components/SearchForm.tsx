import { useState } from 'react'

export interface SearchFormValues {
  players: string
  teams: string
  map: string
  mode: string
  matchtag: string
  from: string
  to: string
}

interface Props {
  onSearch: (values: SearchFormValues) => void
  loading: boolean
}

export default function SearchForm({ onSearch, loading }: Props) {
  const [values, setValues] = useState<SearchFormValues>({
    players: '',
    teams: '',
    map: '',
    mode: '',
    matchtag: '',
    from: '',
    to: '',
  })

  function set(field: keyof SearchFormValues) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setValues((v) => ({ ...v, [field]: e.target.value }))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    onSearch(values)
  }

  return (
    <form className="panel" onSubmit={handleSubmit}>
      <h2>Search Demos</h2>
      <div className="form-grid">
        <label>
          Players (comma-separated)
          <input
            type="text"
            value={values.players}
            onChange={set('players')}
            placeholder="e.g. Milton, Ihminen"
          />
        </label>
        <label>
          Teams (comma-separated)
          <input
            type="text"
            value={values.teams}
            onChange={set('teams')}
            placeholder="e.g. tVS, Book"
          />
        </label>
        <label>
          Map
          <input
            type="text"
            value={values.map}
            onChange={set('map')}
            placeholder="e.g. dm6"
          />
        </label>
        <label>
          Mode
          <select value={values.mode} onChange={set('mode')}>
            <option value="">Any</option>
            <option value="1on1">1on1</option>
            <option value="2on2">2on2</option>
            <option value="4on4">4on4</option>
            <option value="FFA">FFA</option>
          </select>
        </label>
        <label>
          Match tag
          <select
            value={values.matchtag === '*' ? '*' : values.matchtag ? 'specific' : ''}
            onChange={(e) => {
              if (e.target.value === '*') setValues((v) => ({ ...v, matchtag: '*' }))
              else if (e.target.value === '') setValues((v) => ({ ...v, matchtag: '' }))
              else setValues((v) => ({ ...v, matchtag: '' }))
            }}
          >
            <option value="">—</option>
            <option value="*">any (must have a tag)</option>
            <option value="specific">specific…</option>
          </select>
          {values.matchtag !== '*' && (
            <input
              type="text"
              value={values.matchtag}
              onChange={set('matchtag')}
              placeholder="e.g. qwsl"
            />
          )}
        </label>
        <label>
          From date
          <input type="date" value={values.from} onChange={set('from')} />
        </label>
        <label>
          To date
          <input type="date" value={values.to} onChange={set('to')} />
        </label>
      </div>
      <div className="form-actions">
        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? 'Searching…' : 'Search'}
        </button>
      </div>
    </form>
  )
}
