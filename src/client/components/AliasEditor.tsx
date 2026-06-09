import { useState, useEffect } from 'react'

type AliasMap = Record<string, string[]>

interface AliasEditorProps {
  onClose: () => void
}

export default function AliasEditor({ onClose }: AliasEditorProps) {
  const [aliases, setAliases] = useState<AliasMap>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  // For adding a new entry
  const [newCanonical, setNewCanonical] = useState('')
  const [newNicks, setNewNicks] = useState('')

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}api/aliases`)
      .then((r) => r.json())
      .then((data: AliasMap) => { setAliases(data); setLoading(false) })
      .catch((e) => { setError(String(e)); setLoading(false) })
  }, [])

  function addEntry() {
    const canonical = newCanonical.trim()
    if (!canonical) return
    const nicks = newNicks
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    if (nicks.length === 0) nicks.push(canonical)
    // Ensure canonical is always in the list
    if (!nicks.includes(canonical)) nicks.unshift(canonical)
    setAliases((prev) => ({ ...prev, [canonical]: nicks }))
    setNewCanonical('')
    setNewNicks('')
  }

  function removeEntry(canonical: string) {
    setAliases((prev) => {
      const next = { ...prev }
      delete next[canonical]
      return next
    })
  }

  function updateNicks(canonical: string, value: string) {
    const nicks = value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    setAliases((prev) => ({ ...prev, [canonical]: nicks }))
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}api/aliases`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(aliases),
      })
      if (!res.ok) throw new Error(await res.text())
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="alias-editor">
      <div className="alias-editor-header">
        <h3>Player Aliases</h3>
        <button className="btn" onClick={onClose}>✕ Close</button>
      </div>
      <p className="alias-editor-hint">
        Group player names that belong to the same person.
        Stats will be summed under the <strong>canonical name</strong> (left column).
        Nicknames are comma-separated.
      </p>

      {loading && <div>Loading…</div>}
      {error && <div className="alias-editor-error">{error}</div>}

      {!loading && (
        <>
          <table className="alias-table">
            <thead>
              <tr>
                <th>Canonical name</th>
                <th>Nicknames (comma-separated)</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(aliases).map(([canonical, nicks]) => (
                <tr key={canonical}>
                  <td className="alias-canonical">{canonical}</td>
                  <td>
                    <input
                      type="text"
                      value={nicks.join(', ')}
                      onChange={(e) => updateNicks(canonical, e.target.value)}
                    />
                  </td>
                  <td>
                    <button className="btn btn-danger" onClick={() => removeEntry(canonical)}>Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="alias-add-row">
            <input
              type="text"
              placeholder="Canonical name"
              value={newCanonical}
              onChange={(e) => setNewCanonical(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addEntry() }}
            />
            <input
              type="text"
              placeholder="Nicknames (comma-separated, optional)"
              value={newNicks}
              onChange={(e) => setNewNicks(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addEntry() }}
            />
            <button className="btn" onClick={addEntry}>Add</button>
          </div>

          <div className="alias-editor-footer">
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            {saved && <span className="alias-saved">Saved ✓</span>}
          </div>
        </>
      )}
    </div>
  )
}
