import { useRef, useEffect } from 'react'

export interface StatMeta {
  id: string
  label: string
  group: string
  format: string
  noPerMap?: boolean
  availabilityNote?: string
}

interface Props {
  stats: StatMeta[]
  selected: Set<string>
  onToggle: (id: string) => void
  onToggleGroup: (ids: string[], allSelected: boolean) => void
  onSelectAll: () => void
  onSelectNone: () => void
}

function GroupCheckbox({ ids, selected, onToggleGroup }: {
  ids: string[]
  selected: Set<string>
  onToggleGroup: (ids: string[], allSelected: boolean) => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  const checkedCount = ids.filter((id) => selected.has(id)).length
  const allSelected = checkedCount === ids.length
  const someSelected = checkedCount > 0 && !allSelected

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = someSelected
  }, [someSelected])

  return (
    <input
      ref={ref}
      type="checkbox"
      checked={allSelected}
      onChange={() => onToggleGroup(ids, allSelected)}
    />
  )
}

export default function StatSelector({
  stats,
  selected,
  onToggle,
  onToggleGroup,
  onSelectAll,
  onSelectNone,
}: Props) {
  // Group stats by group name, preserving registry order
  const groups = new Map<string, StatMeta[]>()
  for (const s of stats) {
    if (!groups.has(s.group)) groups.set(s.group, [])
    groups.get(s.group)!.push(s)
  }

  return (
    <div>
      <div className="game-list-header" style={{ marginBottom: 12 }}>
        <h2 style={{ marginBottom: 0 }}>Select Stats</h2>
        <div className="game-list-header-actions">
          <button className="btn-secondary btn-small" onClick={onSelectAll}>
            Select all
          </button>
          <button className="btn-secondary btn-small" onClick={onSelectNone}>
            Select none
          </button>
        </div>
      </div>
      <div className="stat-groups">
        {Array.from(groups.entries()).map(([group, groupStats]) => (
          <div key={group} className="stat-group">
            <h3>
              <label className="group-header-label">
                <GroupCheckbox
                  ids={groupStats.map((s) => s.id)}
                  selected={selected}
                  onToggleGroup={onToggleGroup}
                />
                {group}
              </label>
            </h3>
            {groupStats.map((s) => (
              <label key={s.id} title={s.availabilityNote}>
                <input
                  type="checkbox"
                  checked={selected.has(s.id)}
                  onChange={() => onToggle(s.id)}
                />
                {s.label}
              </label>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
