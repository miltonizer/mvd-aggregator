import { readFile, writeFile } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ALIASES_PATH = join(__dirname, '../..', 'aliases.json')

// canonical name -> list of all nicknames (including the canonical name)
export type AliasMap = Record<string, string[]>

// nickname -> canonical name (inverted, for fast lookup)
let invertedMap = new Map<string, string>()

async function load(): Promise<AliasMap> {
  const raw = await readFile(ALIASES_PATH, 'utf-8')
  return JSON.parse(raw) as AliasMap
}

function buildInverted(aliasMap: AliasMap): Map<string, string> {
  const m = new Map<string, string>()
  for (const [canonical, nicks] of Object.entries(aliasMap)) {
    for (const nick of nicks) {
      m.set(nick, canonical)
    }
  }
  return m
}

// Load on first use and cache
let loaded = false
async function ensureLoaded() {
  if (loaded) return
  loaded = true
  try {
    const aliasMap = await load()
    invertedMap = buildInverted(aliasMap)
  } catch {
    // aliases.json missing or invalid — proceed without aliases
  }
}

/** Resolve a raw player name to its canonical alias, if one exists. */
export async function resolvePlayer(name: string): Promise<string> {
  await ensureLoaded()
  return invertedMap.get(name) ?? name
}

/** Synchronous resolve — only valid after ensureLoaded() has completed. */
export function resolvePlayerSync(name: string): string {
  return invertedMap.get(name) ?? name
}

/** Read current alias map from disk. */
export async function getAliases(): Promise<AliasMap> {
  return load()
}

/** Write a new alias map to disk and rebuild the inverted map. */
export async function saveAliases(aliasMap: AliasMap): Promise<void> {
  await writeFile(ALIASES_PATH, JSON.stringify(aliasMap, null, 2) + '\n', 'utf-8')
  invertedMap = buildInverted(aliasMap)
  loaded = true
}
