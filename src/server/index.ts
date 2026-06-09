import express from 'express'
import cors from 'cors'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { searchGames } from './hub.js'
import { aggregate } from './stats/engine.js'
import { getStatMeta } from './stats/registry.js'
import { getAliases, saveAliases, type AliasMap } from './aliases.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const CLIENT_DIR = join(__dirname, '../client')

const app = express()
app.use(cors())
app.use(express.json())

// ---- Static client ---------------------------------------------------------
app.use(express.static(CLIENT_DIR))

// ---- Search ---------------------------------------------------------------
app.get('/api/search', async (req, res) => {
  try {
    const {
      players,
      teams,
      map,
      mode,
      matchtag,
      from,
      to,
      limit,
      offset,
    } = req.query as Record<string, string | undefined>

    const result = await searchGames({
      players: players ? players.split(',').map((p) => p.trim()).filter(Boolean) : undefined,
      teams: teams ? teams.split(',').map((t) => t.trim()).filter(Boolean) : undefined,
      map: map || undefined,
      mode: mode || undefined,
      matchtag: matchtag || undefined,
      from: from || undefined,
      to: to || undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    })

    res.json(result)
  } catch (err) {
    console.error('Search error:', err)
    res.status(500).json({ error: String(err) })
  }
})

// ---- Stat registry --------------------------------------------------------
app.get('/api/stats', (_req, res) => {
  res.json(getStatMeta())
})

// ---- Aliases --------------------------------------------------------------
app.get('/api/aliases', async (_req, res) => {
  try {
    res.json(await getAliases())
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

app.put('/api/aliases', async (req, res) => {
  try {
    const body = req.body as AliasMap
    if (typeof body !== 'object' || Array.isArray(body)) {
      res.status(400).json({ error: 'Body must be an object mapping canonical name to nickname array' })
      return
    }
    await saveAliases(body)
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ---- Aggregate (with SSE progress) ----------------------------------------
// POST /api/aggregate returns SSE: progress events then a final "result" event
app.post('/api/aggregate', (req, res) => {
  const { gameIds, statIds } = req.body as {
    gameIds?: unknown
    statIds?: unknown
  }

  if (!Array.isArray(gameIds) || gameIds.length === 0) {
    res.status(400).json({ error: 'gameIds must be a non-empty array' })
    return
  }
  if (!Array.isArray(statIds) || statIds.length === 0) {
    res.status(400).json({ error: 'statIds must be a non-empty array' })
    return
  }

  // Validate types
  const ids = gameIds as number[]
  const stats = statIds as string[]

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
  }

  aggregate({
    gameIds: ids,
    statIds: stats,
    onProgress: (loaded, total, gameId) => {
      send('progress', { loaded, total, gameId })
    },
  })
    .then((rows) => {
      send('result', rows)
      res.end()
    })
    .catch((err) => {
      send('error', { message: String(err) })
      res.end()
    })
})

// ---- Start ----------------------------------------------------------------
// Catch-all: serve index.html for any non-API route (client-side routing)
app.get('*', (_req, res) => {
  res.sendFile(join(CLIENT_DIR, 'index.html'))
})

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001
app.listen(PORT, () => {
  console.log(`mvd-aggregator server listening on http://localhost:${PORT}`)
})
