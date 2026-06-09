import { mvdApi } from '../mvdapi.js'
import { statById, EndpointId } from './registry.js'
import { resolvePlayer, resolvePlayerSync } from '../aliases.js'

export interface AggregateRequest {
  gameIds: number[]
  statIds: string[]
  /** Progress callback invoked after each demo finishes loading */
  onProgress?: (loaded: number, total: number, gameId: number) => void
}

export interface PlayerRow {
  player: string
  gamesPlayed: number
  teams: string[]
  stats: Record<string, number | null>
}

export type AggregateResult = PlayerRow[]

// Per-demo, per-endpoint accumulated data + per-player accumulator
interface PerPlayerAccum {
  // For simple sum/mean
  values: Record<string, Array<number>>   // statId -> [value per demo]
  // For weighted-mean: parallel arrays of value*weight and weight
  weightedNumer: Record<string, number>
  weightedDenom: Record<string, number>
  gamesPlayed: number
  teams: Set<string>
}

export async function aggregate(req: AggregateRequest): Promise<AggregateResult> {
  const { gameIds, statIds, onProgress } = req

  // Resolve requested stat descriptors
  const stats = statIds.flatMap((id) => {
    const s = statById.get(id)
    return s ? [s] : []
  })
  if (stats.length === 0 || gameIds.length === 0) return []

  // Pre-load alias map so resolvePlayerSync works throughout this aggregate run
  await resolvePlayer('')

  // Determine which endpoints are needed (always include demoinfo for team data)
  const neededEndpoints = new Set<EndpointId>(stats.map((s) => s.endpoint))
  neededEndpoints.add('demoinfo')

  // Accumulate results across all demos
  const accum = new Map<string, PerPlayerAccum>()

  function getAccum(player: string): PerPlayerAccum {
    if (!accum.has(player)) {
      accum.set(player, {
        values: {},
        weightedNumer: {},
        weightedDenom: {},
        gamesPlayed: 0,
        teams: new Set(),
      })
    }
    return accum.get(player)!
  }

  let loaded = 0

  // Process demos sequentially to avoid hammering the API. The mvdApi
  // client already rate-limits with a concurrency of 4, but for
  // per-demo cross-endpoint fetches we process one demo at a time to
  // keep progress reporting clean and memory bounded.
  for (const gameId of gameIds) {
    let demoId: string
    try {
      const loaded_ = await mvdApi.loadDemoLimited(gameId)
      demoId = loaded_.demoId
    } catch (err) {
      console.warn(`loadDemo failed for gameId ${gameId}:`, (err as Error).message)
      loaded++
      onProgress?.(loaded, gameIds.length, gameId)
      continue
    }

    // Fetch all needed endpoints in parallel for this demo
    const endpointData = new Map<EndpointId, unknown>()
    const fetches = Array.from(neededEndpoints).map(async (ep) => {
      try {
        let data: unknown
        switch (ep) {
          case 'demoinfo':    data = await mvdApi.getDemoInfo(demoId);    break
          case 'items':       data = await mvdApi.getItems(demoId);       break
          case 'frags':       data = await mvdApi.getFrags(demoId);       break
          case 'backpacks':   data = await mvdApi.getBackpacks(demoId);   break
          case 'weapon-pickups': data = await mvdApi.getWeaponPickups(demoId); break
          case 'overview':    data = await mvdApi.getOverview(demoId);    break
          case 'frags+backpacks': {
            const [fragsRaw, backpacksRaw] = await Promise.all([
              mvdApi.getFrags(demoId),
              mvdApi.getBackpacks(demoId),
            ])
            const fragsEvents = (fragsRaw as Record<string, unknown>)?.['frags'] as unknown[]
            const backpacksList = (backpacksRaw as Record<string, unknown>)?.['backpacks'] as unknown[]
            data = { frags: fragsEvents ?? [], backpacks: backpacksList ?? [] }
            break
          }
          case 'frags+demoinfo': {
            // frags is always fetched; demoinfo is always fetched — reuse if available
            const fragsRaw = endpointData.has('frags')
              ? endpointData.get('frags')
              : await mvdApi.getFrags(demoId)
            const demoinfoRaw = endpointData.has('demoinfo')
              ? endpointData.get('demoinfo')
              : await mvdApi.getDemoInfo(demoId)
            const fragsEvents = (fragsRaw as Record<string, unknown>)?.['frags'] as unknown[]
            const diPlayers = (demoinfoRaw as Record<string, unknown>)?.['players'] as Array<Record<string, unknown>> | undefined
            // Build name -> team map for fast lookup in extract
            const playerTeams: Record<string, string> = {}
            if (diPlayers) {
              for (const p of diPlayers) {
                if (p['name'] && p['team']) playerTeams[p['name'] as string] = p['team'] as string
              }
            }
            data = { frags: fragsEvents ?? [], playerTeams }
            break
          }
        }
        endpointData.set(ep, data)
      } catch (err: unknown) {
        // 422 = unavailable (e.g. demoinfo_unavailable) — silently skip
        const status = (err as { response?: { status?: number } })?.response?.status
        if (status !== 422) {
          console.warn(`  endpoint ${ep} failed for ${demoId}:`, (err as Error).message)
        }
      }
    })
    await Promise.all(fetches)

    // Collect all players seen across endpoint responses (raw names)
    const rawPlayersInDemo = new Set<string>()
    for (const [ep, data] of endpointData) {
      collectPlayers(ep, data, rawPlayersInDemo)
    }

    // Collect team info from demoinfo for this demo
    const demoInfoData = endpointData.get('demoinfo') as Record<string, unknown> | undefined
    const demoinfoPlayers = demoInfoData?.['players'] as Array<Record<string, unknown>> | undefined

    for (const rawPlayer of rawPlayersInDemo) {
      const player = resolvePlayerSync(rawPlayer)
      const pa = getAccum(player)
      pa.gamesPlayed++
      // Record team(s) this player was on in this demo (look up by raw name)
      const pi = demoinfoPlayers?.find((p) => p['name'] === rawPlayer)
      if (pi?.['team']) pa.teams.add(pi['team'] as string)

      for (const stat of stats) {
        const data = endpointData.get(stat.endpoint)
        if (data == null) continue

        // Extract using raw name (endpoint data is keyed by raw name)
        const value = stat.extract(data, rawPlayer)
        if (value == null) continue

        if (stat.aggregate === 'sum' || stat.aggregate === 'mean') {
          if (!pa.values[stat.id]) pa.values[stat.id] = []
          pa.values[stat.id].push(value)
        } else if (stat.aggregate.type === 'weighted-mean') {
          const weight = stat.aggregate.weightExtract(data, player)
          if (weight == null || weight === 0) continue
          pa.weightedNumer[stat.id] = (pa.weightedNumer[stat.id] ?? 0) + value * weight
          pa.weightedDenom[stat.id] = (pa.weightedDenom[stat.id] ?? 0) + weight
        }
      }
    }

    loaded++
    onProgress?.(loaded, gameIds.length, gameId)
  }

  // Finalise aggregation
  const rows: AggregateResult = []
  for (const [player, pa] of accum) {
    const statsOut: Record<string, number | null> = {}
    for (const stat of stats) {
      if (stat.aggregate === 'sum') {
        const vals = pa.values[stat.id]
        statsOut[stat.id] = vals && vals.length > 0 ? vals.reduce((a, b) => a + b, 0) : null
      } else if (stat.aggregate === 'mean') {
        const vals = pa.values[stat.id]
        statsOut[stat.id] =
          vals && vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null
      } else if (stat.aggregate.type === 'weighted-mean') {
        const denom = pa.weightedDenom[stat.id]
        statsOut[stat.id] =
          denom && denom > 0 ? pa.weightedNumer[stat.id]! / denom : null
      }
    }
    rows.push({ player, gamesPlayed: pa.gamesPlayed, teams: Array.from(pa.teams).sort(), stats: statsOut })
  }

  // Sort by kills desc, then by player name
  rows.sort((a, b) => {
    const ka = a.stats['kills'] ?? -Infinity
    const kb = b.stats['kills'] ?? -Infinity
    if (kb !== ka) return (kb as number) - (ka as number)
    return a.player.localeCompare(b.player)
  })

  return rows
}

function collectPlayers(ep: EndpointId, data: unknown, out: Set<string>): void {
  if (data == null) return
  const d = data as Record<string, unknown>
  switch (ep) {
    case 'demoinfo': {
      // players is an array of objects, not a dict
      const players = d['players'] as Array<Record<string, unknown>> | undefined
      if (players) players.forEach((p) => { if (p['name']) out.add(p['name'] as string) })
      break
    }
    case '__demoinfo_teams__': {
      // internal — handled separately below
      break
    }
    case 'frags': {
      const byPlayer = d['byPlayer'] as Record<string, unknown> | undefined
      if (byPlayer) Object.keys(byPlayer).forEach((p) => out.add(p))
      break
    }
    case 'items': {
      const items = d['items'] as Array<Record<string, unknown>> | undefined
      if (items) {
        for (const item of items) {
          const phases = item['phases'] as Array<Record<string, unknown>> | undefined
          if (phases) {
            for (const phase of phases) {
              if (phase['takenBy']) out.add(phase['takenBy'] as string)
            }
          }
        }
      }
      break
    }
    case 'backpacks': {
      const backpacks = d['backpacks'] as Array<Record<string, unknown>> | undefined
      if (backpacks) {
        for (const b of backpacks) {
          if (b['player']) out.add(b['player'] as string)
        }
      }
      break
    }
    case 'weapon-pickups': {
      const pickups = d['pickups'] as Array<Record<string, unknown>> | undefined
      if (pickups) {
        for (const p of pickups) {
          if (p['player']) out.add(p['player'] as string)
        }
      }
      break
    }
    case 'overview': {
      const players = d['players'] as Array<Record<string, unknown>> | undefined
      if (players) {
        for (const p of players) {
          if (p['name']) out.add(p['name'] as string)
        }
      }
      break
    }
    case 'frags+backpacks': {
      const frags = d['frags'] as Array<Record<string, unknown>> | undefined
      if (frags) {
        for (const f of frags) {
          if (f['killer'] && !f['isSuicide']) out.add(f['killer'] as string)
          if (f['victim']) out.add(f['victim'] as string)
        }
      }
      break
    }
    case 'frags+demoinfo': {
      const frags = d['frags'] as Array<Record<string, unknown>> | undefined
      if (frags) {
        for (const f of frags) {
          if (f['killer'] && !f['isSuicide']) out.add(f['killer'] as string)
          if (f['victim']) out.add(f['victim'] as string)
        }
      }
      break
    }
  }
}
