// ---- Types ----------------------------------------------------------------

export type AggregateKind =
  | 'sum'
  | 'mean'
  | { type: 'weighted-mean'; weightExtract: (data: unknown, player: string) => number | null }

export type EndpointId =
  | 'demoinfo'
  | 'items'
  | 'frags'
  | 'weapon-pickups'
  | 'backpacks'
  | 'overview'
  | 'frags+backpacks'
  | 'frags+demoinfo'

export interface StatDescriptor {
  /** Unique machine ID used in API and config */
  id: string
  /** Display label */
  label: string
  /** Group name for the UI checkbox section */
  group: string
  /** Which mvd-api endpoint supplies this stat */
  endpoint: EndpointId
  /**
   * Extract a numeric value for `player` from the raw endpoint response.
   * Return null when the data is unavailable for this player/demo.
   */
  extract: (data: unknown, player: string) => number | null
  /** How values are combined across demos */
  aggregate: AggregateKind
  /** How to format the final number in the UI */
  format: 'integer' | 'percent' | 'float1' | 'float2'
  /** When true, "avg / map" mode will not divide this stat — it is already a ratio/average */
  noPerMap?: boolean
  /** Shown in UI as a tooltip/note when non-empty */
  availabilityNote?: string
}

// ---- Helpers --------------------------------------------------------------

// demoinfo.players is an array of player objects, not a dict
function playerDemoInfo(data: unknown, player: string): Record<string, unknown> | null {
  const d = data as Record<string, unknown> | null
  const players = d?.['players'] as Array<Record<string, unknown>> | undefined
  return players?.find((p) => p['name'] === player) ?? null
}

function playerWeapon(
  data: unknown,
  player: string,
  weapon: string
): Record<string, unknown> | null {
  const pd = playerDemoInfo(data, player)
  const weapons = pd?.['weapons'] as Record<string, unknown> | undefined
  // weapon object: { acc: { attacks, hits }, kills: { enemy, total }, ... }
  return (weapons?.[weapon] as Record<string, unknown>) ?? null
}

// Returns enemy kills with a weapon; falls back to total when enemy is absent (e.g. sg).
// Returns 0 (not null) when the player exists in demoinfo but has no kills entry for the
// weapon — distinguishes "played and scored 0" from "player not in this demo".
function weaponEnemyKills(data: unknown, player: string, weapon: string): number | null {
  const pd = playerDemoInfo(data, player)
  if (!pd) return null  // player not in this demo
  const w = playerWeapon(data, player, weapon)
  const kills = w?.['kills'] as Record<string, unknown> | undefined
  if (!kills) return 0  // player existed but never scored kills with this weapon
  const enemy = kills['enemy'] as number | undefined
  const total = kills['total'] as number | undefined
  return enemy ?? total ?? 0
}

// Returns total kills made WITH a weapon (kills.total). Returns 0 when the player
// exists in demoinfo but has no entry for this weapon.
function weaponKills(data: unknown, player: string, weapon: string): number | null {
  const pd = playerDemoInfo(data, player)
  if (!pd) return null
  const w = playerWeapon(data, player, weapon)
  const kills = w?.['kills'] as Record<string, unknown> | undefined
  if (!kills) return 0
  return (kills['total'] as number) ?? 0
}

function weaponAcc(data: unknown, player: string, weapon: string): Record<string, unknown> | null {
  const w = playerWeapon(data, player, weapon)
  return (w?.['acc'] as Record<string, unknown>) ?? null
}

function itemPickupsForPlayer(data: unknown, player: string, kind: string): number {
  const d = data as Record<string, unknown> | null
  const items = d?.['items'] as Array<Record<string, unknown>> | undefined
  if (!items) return 0
  let count = 0
  for (const item of items) {
    if (String(item['kind']).toLowerCase() !== kind.toLowerCase()) continue
    const phases = item['phases'] as Array<Record<string, unknown>> | undefined
    if (!phases) continue
    for (const phase of phases) {
      if (phase['takenBy'] === player) count++
    }
  }
  return count
}

// ---- Registry -------------------------------------------------------------

export const statRegistry: StatDescriptor[] = [
  // Maps played
  {
    id: 'maps',
    label: 'Maps',
    group: 'Frags',
    endpoint: 'demoinfo',
    extract: (data, player) => {
      const pd = playerDemoInfo(data, player)
      return pd != null ? 1 : null
    },
    aggregate: 'sum',
    format: 'integer',
  },

  // Frags / deaths
  {
    id: 'frags',
    label: 'Frags',
    group: 'Frags',
    endpoint: 'demoinfo',
    extract: (data, player) => {
      const pd = playerDemoInfo(data, player)
      const stats = pd?.['stats'] as Record<string, unknown> | undefined
      return (stats?.['frags'] as number) ?? null
    },
    aggregate: 'sum',
    format: 'integer',
    availabilityNote: 'Requires KTX demoinfo',
  },
  {
    id: 'kills',
    label: 'Kills',
    group: 'Frags',
    endpoint: 'demoinfo',
    extract: (data, player) => {
      const pd = playerDemoInfo(data, player)
      const stats = pd?.['stats'] as Record<string, unknown> | undefined
      return (stats?.['kills'] as number) ?? null
    },
    aggregate: 'sum',
    format: 'integer',
    availabilityNote: 'Requires KTX demoinfo',
  },
  {
    id: 'deaths',
    label: 'Deaths',
    group: 'Frags',
    endpoint: 'demoinfo',
    extract: (data, player) => {
      const pd = playerDemoInfo(data, player)
      const stats = pd?.['stats'] as Record<string, unknown> | undefined
      return (stats?.['deaths'] as number) ?? null
    },
    aggregate: 'sum',
    format: 'integer',
    availabilityNote: 'Requires KTX demoinfo',
  },
  {
    id: 'teamkills',
    label: 'Team Kills',
    group: 'Frags',
    endpoint: 'demoinfo',
    extract: (data, player) => {
      const pd = playerDemoInfo(data, player)
      if (!pd) return null
      const stats = pd?.['stats'] as Record<string, unknown> | undefined
      return (stats?.['tk'] as number) ?? 0
    },
    aggregate: 'sum',
    format: 'integer',
    availabilityNote: 'Requires KTX demoinfo',
  },
  {
    id: 'efficiency',
    label: 'Efficiency',
    group: 'Frags',
    endpoint: 'demoinfo',
    extract: (data, player) => {
      const pd = playerDemoInfo(data, player)
      const stats = pd?.['stats'] as Record<string, unknown> | undefined
      if (!stats) return null
      const kills = stats['kills'] as number | undefined
      const deaths = stats['deaths'] as number | undefined
      if (kills == null || deaths == null) return null
      const total = kills + deaths
      return total === 0 ? null : kills / total
    },
    // weighted by (kills+deaths) so high-frag games count more
    aggregate: {
      type: 'weighted-mean',
      weightExtract: (data, player) => {
        const pd = playerDemoInfo(data, player)
        const stats = pd?.['stats'] as Record<string, unknown> | undefined
        if (!stats) return null
        const kills = (stats['kills'] as number) ?? 0
        const deaths = (stats['deaths'] as number) ?? 0
        return kills + deaths || null
      },
    },
    format: 'percent',
    availabilityNote: 'Requires KTX demoinfo',
  },

  // Armor pickups
  {
    id: 'ra_pickups',
    label: 'RA Pickups',
    group: 'Armor & Health',
    endpoint: 'items',
    extract: (data, player) => itemPickupsForPlayer(data, player, 'ra'),
    aggregate: 'sum',
    format: 'integer',
  },
  {
    id: 'ya_pickups',
    label: 'YA Pickups',
    group: 'Armor & Health',
    endpoint: 'items',
    extract: (data, player) => itemPickupsForPlayer(data, player, 'ya'),
    aggregate: 'sum',
    format: 'integer',
  },
  {
    id: 'ga_pickups',
    label: 'GA Pickups',
    group: 'Armor & Health',
    endpoint: 'items',
    extract: (data, player) => itemPickupsForPlayer(data, player, 'ga'),
    aggregate: 'sum',
    format: 'integer',
  },
  {
    id: 'mh_pickups',
    label: 'MH Pickups',
    group: 'Armor & Health',
    endpoint: 'items',
    extract: (data, player) => itemPickupsForPlayer(data, player, 'mh'),
    aggregate: 'sum',
    format: 'integer',
  },
  {
    id: 'health_25_pickups',
    label: 'Health 25 Pickups',
    group: 'Armor & Health',
    endpoint: 'demoinfo',
    extract: (data, player) => {
      const pd = playerDemoInfo(data, player)
      const items = pd?.['items'] as Record<string, unknown> | undefined
      return (items?.['health_25'] as Record<string, unknown>)?.['took'] as number ?? null
    },
    aggregate: 'sum',
    format: 'integer',
    availabilityNote: 'Requires KTX demoinfo',
  },
  {
    id: 'health_15_pickups',
    label: 'Health 15 Pickups',
    group: 'Armor & Health',
    endpoint: 'demoinfo',
    extract: (data, player) => {
      const pd = playerDemoInfo(data, player)
      const items = pd?.['items'] as Record<string, unknown> | undefined
      return (items?.['health_15'] as Record<string, unknown>)?.['took'] as number ?? null
    },
    aggregate: 'sum',
    format: 'integer',
    availabilityNote: 'Requires KTX demoinfo',
  },

  // Damage (from KTX demoinfo)
  {
    id: 'damage_given',
    label: 'Damage Given',
    group: 'Damage',
    endpoint: 'demoinfo',
    extract: (data, player) => {
      const pd = playerDemoInfo(data, player)
      const dmg = pd?.['dmg'] as Record<string, unknown> | undefined
      return (dmg?.['given'] as number) ?? null
    },
    aggregate: 'sum',
    format: 'integer',
    availabilityNote: 'Requires KTX demoinfo',
  },
  {
    id: 'damage_taken',
    label: 'Damage Taken',
    group: 'Damage',
    endpoint: 'demoinfo',
    extract: (data, player) => {
      const pd = playerDemoInfo(data, player)
      const dmg = pd?.['dmg'] as Record<string, unknown> | undefined
      return (dmg?.['taken'] as number) ?? null
    },
    aggregate: 'sum',
    format: 'integer',
    availabilityNote: 'Requires KTX demoinfo',
  },
  {
    id: 'net_damage',
    label: 'Net Damage',
    group: 'Damage',
    endpoint: 'demoinfo',
    extract: (data, player) => {
      const pd = playerDemoInfo(data, player)
      const dmg = pd?.['dmg'] as Record<string, unknown> | undefined
      const given = dmg?.['given'] as number | undefined
      const taken = dmg?.['taken'] as number | undefined
      if (given == null || taken == null) return null
      return given - taken
    },
    aggregate: 'sum',
    format: 'integer',
    availabilityNote: 'Requires KTX demoinfo',
  },
  {
    id: 'enemy_weapons_damage',
    label: 'Enemy Weapons Dmg',
    group: 'Damage',
    endpoint: 'demoinfo',
    extract: (data, player) => {
      const pd = playerDemoInfo(data, player)
      const dmg = pd?.['dmg'] as Record<string, unknown> | undefined
      return (dmg?.['enemy-weapons'] as number) ?? null
    },
    aggregate: 'sum',
    format: 'integer',
    availabilityNote: 'Requires KTX demoinfo',
  },
  {
    id: 'damage_taken_to_die',
    label: 'Dmg Taken to Die',
    group: 'Damage',
    endpoint: 'demoinfo',
    extract: (data, player) => {
      const pd = playerDemoInfo(data, player)
      const dmg = pd?.['dmg'] as Record<string, unknown> | undefined
      return (dmg?.['taken-to-die'] as number) ?? null
    },
    aggregate: {
      type: 'weighted-mean',
      weightExtract: (data, player) => {
        const pd = playerDemoInfo(data, player)
        const stats = pd?.['stats'] as Record<string, unknown> | undefined
        return (stats?.['deaths'] as number) || null
      },
    },
    format: 'float1',
    noPerMap: true,
    availabilityNote: 'Requires KTX demoinfo',
  },

  // Weapon accuracy — acc.hits / acc.attacks (shot-weighted mean across demos)
  {
    id: 'rl_acc',
    label: 'RL Accuracy',
    group: 'Accuracy',
    endpoint: 'demoinfo',
    extract: (data, player) => {
      const acc = weaponAcc(data, player, 'rl')
      const hits = acc?.['hits'] as number | undefined
      const attacks = acc?.['attacks'] as number | undefined
      if (!attacks) return null
      return hits != null ? hits / attacks : null
    },
    aggregate: {
      type: 'weighted-mean',
      weightExtract: (data, player) => {
        const acc = weaponAcc(data, player, 'rl')
        return (acc?.['attacks'] as number) ?? null
      },
    },
    format: 'percent',
    availabilityNote: 'Requires KTX demoinfo',
  },
  {
    id: 'lg_acc',
    label: 'LG Accuracy',
    group: 'Accuracy',
    endpoint: 'demoinfo',
    extract: (data, player) => {
      const acc = weaponAcc(data, player, 'lg')
      const hits = acc?.['hits'] as number | undefined
      const attacks = acc?.['attacks'] as number | undefined
      if (!attacks) return null
      return hits != null ? hits / attacks : null
    },
    aggregate: {
      type: 'weighted-mean',
      weightExtract: (data, player) => {
        const acc = weaponAcc(data, player, 'lg')
        return (acc?.['attacks'] as number) ?? null
      },
    },
    format: 'percent',
    availabilityNote: 'Requires KTX demoinfo',
  },
  {
    id: 'sg_acc',
    label: 'SG Accuracy',
    group: 'Accuracy',
    endpoint: 'demoinfo',
    extract: (data, player) => {
      const acc = weaponAcc(data, player, 'sg')
      const hits = acc?.['hits'] as number | undefined
      const attacks = acc?.['attacks'] as number | undefined
      if (!attacks) return null
      return hits != null ? hits / attacks : null
    },
    aggregate: {
      type: 'weighted-mean',
      weightExtract: (data, player) => {
        const acc = weaponAcc(data, player, 'sg')
        return (acc?.['attacks'] as number) ?? null
      },
    },
    format: 'percent',
    availabilityNote: 'Requires KTX demoinfo',
  },

  // Weapon kills — kills.total (frags WITH this weapon, from demoinfo)
  {
    id: 'axe_kills',
    label: 'Axe Kills',
    group: 'Weapon Kills',
    endpoint: 'demoinfo',
    extract: (data, player) => weaponKills(data, player, 'axe'),
    aggregate: 'sum',
    format: 'integer',
    availabilityNote: 'Requires KTX demoinfo',
  },
  {
    id: 'sg_kills',
    label: 'SG Kills',
    group: 'Weapon Kills',
    endpoint: 'demoinfo',
    extract: (data, player) => weaponKills(data, player, 'sg'),
    aggregate: 'sum',
    format: 'integer',
    availabilityNote: 'Requires KTX demoinfo',
  },
  {
    id: 'ssg_kills',
    label: 'SSG Kills',
    group: 'Weapon Kills',
    endpoint: 'demoinfo',
    extract: (data, player) => weaponKills(data, player, 'ssg'),
    aggregate: 'sum',
    format: 'integer',
    availabilityNote: 'Requires KTX demoinfo',
  },
  {
    id: 'ng_kills',
    label: 'NG Kills',
    group: 'Weapon Kills',
    endpoint: 'demoinfo',
    extract: (data, player) => weaponKills(data, player, 'ng'),
    aggregate: 'sum',
    format: 'integer',
    availabilityNote: 'Requires KTX demoinfo',
  },
  {
    id: 'sng_kills',
    label: 'SNG Kills',
    group: 'Weapon Kills',
    endpoint: 'demoinfo',
    extract: (data, player) => weaponKills(data, player, 'sng'),
    aggregate: 'sum',
    format: 'integer',
    availabilityNote: 'Requires KTX demoinfo',
  },
  {
    id: 'rl_kills',
    label: 'RL Kills',
    group: 'Weapon Kills',
    endpoint: 'demoinfo',
    extract: (data, player) => weaponKills(data, player, 'rl'),
    aggregate: 'sum',
    format: 'integer',
    availabilityNote: 'Requires KTX demoinfo',
  },
  {
    id: 'lg_kills',
    label: 'LG Kills',
    group: 'Weapon Kills',
    endpoint: 'demoinfo',
    extract: (data, player) => weaponKills(data, player, 'lg'),
    aggregate: 'sum',
    format: 'integer',
    availabilityNote: 'Requires KTX demoinfo',
  },
  {
    id: 'gl_kills',
    label: 'GL Kills',
    group: 'Weapon Kills',
    endpoint: 'demoinfo',
    extract: (data, player) => weaponKills(data, player, 'gl'),
    aggregate: 'sum',
    format: 'integer',
    availabilityNote: 'Requires KTX demoinfo',
  },

  // Powerup stats — quad/pent frags from spree, time and pickup counts from items.q/p/r
  {
    id: 'quad_pickups',
    label: 'Quad Pickups',
    group: 'Powerups',
    endpoint: 'demoinfo',
    extract: (data, player) => {
      const pd = playerDemoInfo(data, player)
      const items = pd?.['items'] as Record<string, unknown> | undefined
      return (items?.['q'] as Record<string, unknown>)?.['took'] as number ?? null
    },
    aggregate: 'sum',
    format: 'integer',
    availabilityNote: 'Requires KTX demoinfo',
  },
  {
    id: 'quad_frags',
    label: 'Max Quad Streak',
    group: 'Powerups',
    endpoint: 'demoinfo',
    extract: (data, player) => {
      const pd = playerDemoInfo(data, player)
      const spree = pd?.['spree'] as Record<string, unknown> | undefined
      return (spree?.['quad'] as number) ?? null
    },
    aggregate: 'sum',
    format: 'integer',
    availabilityNote: 'Requires KTX demoinfo',
  },
  {
    id: 'quad_time',
    label: 'Quad Time (s)',
    group: 'Powerups',
    endpoint: 'demoinfo',
    extract: (data, player) => {
      const pd = playerDemoInfo(data, player)
      // items.q.time = total quad hold time in seconds
      const items = pd?.['items'] as Record<string, unknown> | undefined
      return (items?.['q'] as Record<string, unknown>)?.['time'] as number ?? null
    },
    aggregate: 'sum',
    format: 'float1',
    availabilityNote: 'Requires KTX demoinfo',
  },
  {
    id: 'pent_pickups',
    label: 'Pent Pickups',
    group: 'Powerups',
    endpoint: 'demoinfo',
    extract: (data, player) => {
      const pd = playerDemoInfo(data, player)
      const items = pd?.['items'] as Record<string, unknown> | undefined
      return (items?.['p'] as Record<string, unknown>)?.['took'] as number ?? null
    },
    aggregate: 'sum',
    format: 'integer',
    availabilityNote: 'Requires KTX demoinfo',
  },
  {
    id: 'ring_pickups',
    label: 'Ring Pickups',
    group: 'Powerups',
    endpoint: 'demoinfo',
    extract: (data, player) => {
      const pd = playerDemoInfo(data, player)
      const items = pd?.['items'] as Record<string, unknown> | undefined
      return (items?.['r'] as Record<string, unknown>)?.['took'] as number ?? null
    },
    aggregate: 'sum',
    format: 'integer',
    availabilityNote: 'Requires KTX demoinfo',
  },
  {
    id: 'ring_time',
    label: 'Ring Time (s)',
    group: 'Powerups',
    endpoint: 'demoinfo',
    extract: (data, player) => {
      const pd = playerDemoInfo(data, player)
      // items.r.time = ring of shadows hold time in seconds
      const items = pd?.['items'] as Record<string, unknown> | undefined
      return (items?.['r'] as Record<string, unknown>)?.['time'] as number ?? null
    },
    aggregate: 'sum',
    format: 'float1',
    availabilityNote: 'Requires KTX demoinfo',
  },

  // RL/LG backpack drops
  {
    id: 'rl_taken',
    label: 'RLs Taken',
    group: 'Backpacks',
    endpoint: 'demoinfo',
    extract: (data, player) => {
      const w = playerWeapon(data, player, 'rl')
      const pickups = w?.['pickups'] as Record<string, unknown> | undefined
      return (pickups?.['taken'] as number) ?? null
    },
    aggregate: 'sum',
    format: 'integer',
    availabilityNote: 'Requires KTX demoinfo',
  },
  {
    id: 'rl_kills_carrying',
    label: 'RLs Killed',
    group: 'Backpacks',
    endpoint: 'demoinfo',
    extract: (data, player) => weaponEnemyKills(data, player, 'rl'),
    aggregate: 'sum',
    format: 'integer',
    availabilityNote: 'Requires KTX demoinfo',
  },
  {
    id: 'rl_drops',
    label: 'RL Drops',
    group: 'Backpacks',
    endpoint: 'backpacks',
    extract: (data, player) => {
      const items = (data as Record<string, unknown>)?.['backpacks'] as
        | Array<Record<string, unknown>>
        | undefined
      if (!items) return null
      return items.filter((b) => b['player'] === player && b['weapon'] === 'rl').length
    },
    aggregate: 'sum',
    format: 'integer',
    availabilityNote: 'Requires KTX demoinfo',
  },
  {
    id: 'lg_taken',
    label: 'LGs Taken',
    group: 'Backpacks',
    endpoint: 'demoinfo',
    extract: (data, player) => {
      const w = playerWeapon(data, player, 'lg')
      const pickups = w?.['pickups'] as Record<string, unknown> | undefined
      return (pickups?.['taken'] as number) ?? null
    },
    aggregate: 'sum',
    format: 'integer',
    availabilityNote: 'Requires KTX demoinfo',
  },
  {
    id: 'lg_kills_carrying',
    label: 'LGs Killed',
    group: 'Backpacks',
    endpoint: 'demoinfo',
    extract: (data, player) => weaponEnemyKills(data, player, 'lg'),
    aggregate: 'sum',
    format: 'integer',
    availabilityNote: 'Requires KTX demoinfo',
  },
  {
    id: 'lg_drops',
    label: 'LG Drops',
    group: 'Backpacks',
    endpoint: 'backpacks',
    extract: (data, player) => {
      const items = (data as Record<string, unknown>)?.['backpacks'] as
        | Array<Record<string, unknown>>
        | undefined
      if (!items) return null
      return items.filter((b) => b['player'] === player && b['weapon'] === 'lg').length
    },
    aggregate: 'sum',
    format: 'integer',
    availabilityNote: 'Requires KTX demoinfo',
  },
  {
    id: 'rl_drop_frags',
    label: 'RL Drop Frags',
    group: 'Backpacks',
    endpoint: 'weapon-pickups',
    extract: (data, player) => {
      const pickups = (data as Record<string, unknown>)?.['pickups'] as
        | Array<Record<string, unknown>>
        | undefined
      if (!pickups) return null
      // Sum frags earned by enemies who picked up this player's RL pack without already having RL
      return pickups
        .filter(
          (p) =>
            p['dropper'] === player &&
            p['weapon'] === 'rl' &&
            p['hadBefore'] === false &&
            p['dropperTeam'] !== p['team'],
        )
        .reduce((sum, p) => sum + ((p['kills'] as number) ?? 0), 0)
    },
    aggregate: 'sum',
    format: 'integer',
    availabilityNote: 'Requires KTX demoinfo',
  },
  {
    id: 'lg_drop_frags',
    label: 'LG Drop Frags',
    group: 'Backpacks',
    endpoint: 'weapon-pickups',
    extract: (data, player) => {
      const pickups = (data as Record<string, unknown>)?.['pickups'] as
        | Array<Record<string, unknown>>
        | undefined
      if (!pickups) return null
      // Sum frags earned by enemies who picked up this player's LG pack without already having LG
      return pickups
        .filter(
          (p) =>
            p['dropper'] === player &&
            p['weapon'] === 'lg' &&
            p['hadBefore'] === false &&
            p['dropperTeam'] !== p['team'],
        )
        .reduce((sum, p) => sum + ((p['kills'] as number) ?? 0), 0)
    },
    aggregate: 'sum',
    format: 'integer',
    availabilityNote: 'Requires KTX demoinfo',
  },
  {
    id: 'total_drop_frags',
    label: 'Total Drop Frags',
    group: 'Backpacks',
    endpoint: 'weapon-pickups',
    extract: (data, player) => {
      const pickups = (data as Record<string, unknown>)?.['pickups'] as
        | Array<Record<string, unknown>>
        | undefined
      if (!pickups) return null
      // Sum frags earned by enemies who picked up this player's RL or LG pack without already having that weapon
      return pickups
        .filter(
          (p) =>
            p['dropper'] === player &&
            (p['weapon'] === 'rl' || p['weapon'] === 'lg') &&
            p['hadBefore'] === false &&
            p['dropperTeam'] !== p['team'],
        )
        .reduce((sum, p) => sum + ((p['kills'] as number) ?? 0), 0)
    },
    aggregate: 'sum',
    format: 'integer',
    availabilityNote: 'Requires KTX demoinfo',
  },
]

export const statById = new Map(statRegistry.map((s) => [s.id, s]))

/** Serializable subset sent to the frontend */
export interface StatMeta {
  id: string
  label: string
  group: string
  format: StatDescriptor['format']
  noPerMap?: boolean
  availabilityNote?: string
}

export function getStatMeta(): StatMeta[] {
  return statRegistry.map(({ id, label, group, format, noPerMap, availabilityNote }) => ({
    id,
    label,
    group,
    format,
    ...(noPerMap ? { noPerMap } : {}),
    availabilityNote,
  }))
}
