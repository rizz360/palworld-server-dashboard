import type { AccessTier, FpsSample, Player, ServerInfo, ServerMetrics } from '@/lib/types'

function enabled(value: string | undefined) {
  return value === 'true' || value === '1'
}

export const DEMO_MODE = enabled(process.env.DEMO_MODE) || enabled(process.env.NEXT_PUBLIC_DEMO_MODE)
export const DEMO_PASSWORD = process.env.DEMO_PASSWORD || 'demo'

export function isDemoPassword(password: string) {
  return DEMO_MODE && password === DEMO_PASSWORD
}

const boot = Date.now() - 3 * 60 * 60 * 1000

export const demoInfo: ServerInfo = {
  version: 'v0.6.1-demo',
  servername: 'Palworld Dashboard Demo',
  description: 'Mock server for trying the dashboard safely.',
  worldguid: 'DEMO-WORLD-0001',
}

export const demoPlayers: Player[] = [
  { name: 'LamballLarry', accountName: 'larry', playerId: '1001', userId: 'steam_1001', ip: '10.0.0.11', ping: 24, location_x: 1260, location_y: -740, level: 42 },
  { name: 'CattivaCore', accountName: 'cattiva', playerId: '1002', userId: 'steam_1002', ip: '10.0.0.12', ping: 37, location_x: -820, location_y: 540, level: 31 },
  { name: 'SparkitOps', accountName: 'sparkit', playerId: '1003', userId: 'steam_1003', ip: '10.0.0.13', ping: 51, location_x: 280, location_y: 1120, level: 55 },
]

export function demoMetrics(): ServerMetrics {
  const t = Math.floor((Date.now() - boot) / 1000)
  return {
    serverfps: 58 + Math.round(Math.sin(t / 20) * 3),
    currentplayernum: demoPlayers.length,
    maxplayernum: 32,
    serverframetime: 16.8,
    uptime: t,
    days: 124,
    basecampnum: 7,
  }
}

export function demoFpsHistory(): { samples: FpsSample[] } {
  const now = Date.now()
  return {
    samples: Array.from({ length: 60 }, (_, i) => {
      const timestamp = now - (59 - i) * 60_000
      return { timestamp, fps: 58 + Math.round(Math.sin(timestamp / 180_000) * 4) }
    }),
  }
}

export function demoPalworldResponse(endpoint: string, method: string, tier: AccessTier) {
  if (method === 'GET') {
    if (endpoint === 'info') return demoInfo
    if (endpoint === 'metrics') return demoMetrics()
    if (endpoint === 'players') return { players: demoPlayers }
    if (endpoint === 'settings' && tier === 'admin') return { difficulty: 'Normal', dayTimeSpeedRate: 1, nightTimeSpeedRate: 1, serverPlayerMaxNum: 32 }
  }

  return { success: true, message: `Demo mode: ${method} /${endpoint} accepted, no real server changed.` }
}
