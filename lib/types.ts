// Panel access tier. Resolved server-side at login (app/api/auth-tier) and
// re-derived from the password on every proxied request — the stored value
// only selects which view to render, never what the server permits.
export type AccessTier = 'admin' | 'mod'

export interface ServerConfig {
  serverIp: string
  restApiPort: string
  gamePort: string
  adminPassword: string
  accessTier?: AccessTier
}

export interface Player {
  name: string
  accountName: string
  playerId: string
  userId: string
  ip: string
  ping: number
  location_x: number
  location_y: number
  level: number
}

export interface ServerInfo {
  version: string
  servername: string
  description: string
  worldguid: string
}

export interface ServerMetrics {
  serverfps: number
  currentplayernum: number
  maxplayernum: number
  serverframetime: number
  uptime: number
  days: number
  basecampnum: number
}

export interface FpsSample {
  timestamp: number
  fps: number
}

export interface ConsoleLog {
  id: string
  type: 'success' | 'error' | 'info'
  message: string
  timestamp: Date
  endpoint: string
  rawResponse?: string
}

export interface BannedPlayer {
  name: string
  steamId: string
  bannedAt: string
}
