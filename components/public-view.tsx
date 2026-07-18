'use client'

// Read-only public status view (/view): server metrics, live map, and a
// player list, fed exclusively by the unauthenticated, sanitized
// /api/public-view snapshot. No panel credentials are held, requested, or
// sent anywhere in this tree — there is nothing here to leak.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { EyeIcon, MapPinnedIcon, UsersIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { LiveMap } from '@/components/live-map'
import type { Player, PublicSnapshot } from '@/lib/types'

const POLL_INTERVAL_MS = 10_000

type ViewPhase = 'loading' | 'ready' | 'disabled' | 'unreachable'

function formatUptime(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) {
    return '--'
  }
  const days = Math.floor(totalSeconds / 86_400)
  const hours = Math.floor((totalSeconds % 86_400) / 3_600)
  const minutes = Math.floor((totalSeconds % 3_600) / 60)
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

// The map component consumes the full Player shape; the public payload only
// carries the four public fields, so the sensitive ones are simply empty.
// playerId gets a synthetic value: the map keys markers by userId/playerId/name
// (getPlayerKey), and character names are NOT unique in Palworld — two players
// with the same name would otherwise collide on React keys.
function toMapPlayers(snapshot: PublicSnapshot): Player[] {
  return snapshot.players.map((player, index) => ({
    name: player.name,
    accountName: '',
    playerId: `public-${index}`,
    userId: '',
    ip: '',
    ping: 0,
    location_x: player.location_x,
    location_y: player.location_y,
    level: player.level,
  }))
}

function MetricChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex h-10 items-center gap-2 rounded-md border border-border/60 bg-muted/20 px-3">
      <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{label}</span>
      <span className="font-mono text-xs font-semibold tabular-nums text-foreground">{value}</span>
    </div>
  )
}

function CenteredNotice({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <div className="max-w-md rounded-2xl border border-border/60 bg-card/80 p-6 text-center shadow-2xl backdrop-blur">
        <div className="text-lg font-semibold text-foreground">{title}</div>
        <p className="mt-2 text-sm text-muted-foreground">{body}</p>
      </div>
    </div>
  )
}

export function PublicView() {
  const [snapshot, setSnapshot] = useState<PublicSnapshot | null>(null)
  const [phase, setPhase] = useState<ViewPhase>('loading')
  const [isStale, setIsStale] = useState(false)

  const fetchSnapshot = useCallback(async () => {
    try {
      const response = await fetch('/api/public-view', {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      })

      if (response.status === 404) {
        setPhase('disabled')
        return
      }

      if (!response.ok) {
        throw new Error(`snapshot failed with ${response.status}`)
      }

      const payload = (await response.json()) as PublicSnapshot
      setSnapshot(payload)
      setIsStale(false)
      setPhase('ready')
    } catch {
      // Keep showing the last snapshot (marked stale) if we ever had one.
      setIsStale(true)
      setPhase((current) => (current === 'ready' ? current : 'unreachable'))
    }
  }, [])

  // One eager fetch decides which shell to render; once the map is up, its
  // visibility-aware refresh loop (source.onRefresh below) takes over polling.
  useEffect(() => {
    void fetchSnapshot()
  }, [fetchSnapshot])

  // Retry loop for the pre-map failure states, so an unreachable or disabled
  // page recovers without a manual reload once the server side comes back.
  useEffect(() => {
    if (phase !== 'unreachable' && phase !== 'disabled') {
      return
    }

    const interval = window.setInterval(() => {
      void fetchSnapshot()
    }, POLL_INTERVAL_MS)

    return () => window.clearInterval(interval)
  }, [phase, fetchSnapshot])

  const mapPlayers = useMemo(() => (snapshot ? toMapPlayers(snapshot) : []), [snapshot])

  if (phase === 'loading') {
    return <CenteredNotice title="Loading server status..." body="Fetching the latest public snapshot." />
  }

  if (phase === 'disabled') {
    return (
      <CenteredNotice
        title="Public view is not enabled"
        body="The operator of this dashboard has not enabled the read-only status page (PUBLIC_VIEW_ENABLED)."
      />
    )
  }

  if (phase === 'unreachable' || !snapshot) {
    return (
      <CenteredNotice
        title="Game server unreachable"
        body="The dashboard could not reach the Palworld server. Retrying automatically."
      />
    )
  }

  const { info, metrics } = snapshot

  return (
    <div className="flex h-dvh w-full flex-col">
      <header className="border-b border-border/60 bg-card/70 px-4 py-3 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate font-mono text-lg font-semibold uppercase tracking-[0.14em] text-foreground">
                {info.servername || 'Palworld Server'}
              </h1>
              <Badge variant="secondary" className="gap-1 border border-primary/40 bg-primary/10 font-mono text-[10px] uppercase tracking-[0.2em] text-primary hover:bg-primary/10">
                <EyeIcon className="h-3 w-3" />
                Read-only
              </Badge>
              {isStale && (
                <Badge variant="secondary" className="border border-destructive/40 bg-destructive/10 font-mono text-[10px] uppercase tracking-[0.2em] text-destructive hover:bg-destructive/10">
                  Stale data
                </Badge>
              )}
            </div>
            {info.description && (
              <p className="mt-1 max-w-xl truncate text-sm text-muted-foreground">{info.description}</p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <MetricChip label="Players" value={`${metrics.currentplayernum} / ${metrics.maxplayernum}`} />
            <MetricChip label="FPS" value={`${Math.round(metrics.serverfps)}`} />
            <MetricChip label="Frame" value={`${metrics.serverframetime.toFixed(1)} ms`} />
            <MetricChip label="Day" value={`${metrics.days}`} />
            <MetricChip label="Uptime" value={formatUptime(metrics.uptime)} />
            <MetricChip label="Bases" value={`${metrics.basecampnum}`} />
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="relative min-h-0 flex-1 overflow-hidden bg-card/60">
          <LiveMap
            source={{
              players: mapPlayers,
              statusLabel: isStale ? 'stale' : 'live',
              onRefresh: fetchSnapshot,
              refreshIntervalMs: POLL_INTERVAL_MS,
            }}
          />
        </div>

        <aside className="flex max-h-48 shrink-0 flex-col border-t border-border/60 bg-card/40 backdrop-blur lg:max-h-none lg:w-72 lg:border-l lg:border-t-0">
          <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
            <UsersIcon className="h-4 w-4 text-primary" />
            <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-foreground">
              Online Players
            </span>
            <Badge variant="secondary" className="ml-auto border border-border/60 bg-muted/40 font-mono text-[10px] tabular-nums text-foreground hover:bg-muted/40">
              {snapshot.players.length}
            </Badge>
          </div>
          <ScrollArea className="min-h-0 flex-1">
            {snapshot.players.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">No players online.</p>
            ) : (
              <ul className="divide-y divide-border/40">
                {snapshot.players.map((player, index) => (
                  <li key={`${player.name}-${index}`} className="flex items-center gap-3 px-4 py-2.5">
                    <MapPinnedIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{player.name}</span>
                    <span className="font-mono text-[11px] tabular-nums text-muted-foreground">Lv {player.level}</span>
                  </li>
                ))}
              </ul>
            )}
          </ScrollArea>
        </aside>
      </div>
    </div>
  )
}
