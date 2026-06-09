import axios from 'axios'

const HUB_API_URL = process.env.QUAKEWORLD_HUB_API_URL
const HUB_API_ANON_KEY = process.env.QUAKEWORLD_HUB_API_ANON_KEY

if (!HUB_API_URL || !HUB_API_ANON_KEY) {
  throw new Error('QUAKEWORLD_HUB_API_URL and QUAKEWORLD_HUB_API_ANON_KEY must be set in the environment')
}

export interface HubPlayer {
  name: string
  team: string
  frags: number
  ping: number
}

export interface HubGame {
  id: number
  timestamp: string
  mode: string
  matchtag: string | null
  map: string
  team_names: string[] | null
  players: HubPlayer[]
  demo_sha256: string | null
  demo_source_url: string | null
}

export interface SearchParams {
  players?: string[]
  teams?: string[]
  map?: string
  mode?: string
  matchtag?: string
  from?: string
  to?: string
  limit?: number
  offset?: number
}

export interface SearchResult {
  games: HubGame[]
  count: number
  limit: number
  offset: number
}

export async function searchGames(params: SearchParams): Promise<SearchResult> {
  const limit = Math.min(params.limit ?? 20, 500)
  const offset = params.offset ?? 0

  const filters: string[] = []

  if (params.map) {
    filters.push(`map=eq.${encodeURIComponent(params.map)}`)
  }
  if (params.mode) {
    filters.push(`mode=eq.${encodeURIComponent(params.mode)}`)
  }
  if (params.matchtag === '*') {
    filters.push('matchtag=not.is.null')
  } else if (params.matchtag) {
    filters.push(`matchtag=ilike.${encodeURIComponent(`*${params.matchtag}*`)}`)
  }
  if (params.from) {
    filters.push(`timestamp=gte.${encodeURIComponent(params.from)}`)
  }
  if (params.to) {
    // add one day so "to" is inclusive through end of that day
    const toDate = new Date(params.to)
    toDate.setDate(toDate.getDate() + 1)
    filters.push(`timestamp=lt.${encodeURIComponent(toDate.toISOString().slice(0, 10))}`)
  }
  if (params.players && params.players.length > 0) {
    // players_fts is a text search column; use @@ for FTS
    // PostgREST: use `players_fts=fts.` pattern for full-text search
    for (const p of params.players) {
      filters.push(`players_fts=fts.${encodeURIComponent(p)}`)
    }
  }
  if (params.teams && params.teams.length > 0) {
    for (const t of params.teams) {
      // PostgREST has no case-insensitive array-contains. Use or= with common
      // case variants (original, lowercase, Title Case) to cover QW team names.
      const variants = [...new Set([
        t,
        t.toLowerCase(),
        t.toUpperCase(),
        t.charAt(0).toUpperCase() + t.slice(1).toLowerCase(),
      ])]
      const orParts = variants.map((v) => `team_names.cs.${encodeURIComponent(`{"${v}"}`)}`)
      filters.push(`or=(${orParts.join(',')})`)
    }
  }

  const queryString =
    filters.join('&') +
    `&limit=${limit}&offset=${offset}&order=timestamp.desc`

  const url = `${HUB_API_URL}?${queryString}`

  const resp = await axios.get<HubGame[]>(url, {
    headers: {
      apikey: HUB_API_ANON_KEY,
      Authorization: `Bearer ${HUB_API_ANON_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'count=exact',
    },
  })

  const contentRange = resp.headers['content-range'] as string | undefined
  let count = 0
  if (contentRange) {
    const match = contentRange.match(/\/(\d+)$/)
    if (match) count = parseInt(match[1], 10)
  }

  return {
    games: resp.data,
    count,
    limit,
    offset,
  }
}
