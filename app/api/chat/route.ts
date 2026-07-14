import { NextRequest, NextResponse } from 'next/server'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { classifyPassword } from '@/lib/access-tier'
import { DEMO_MODE } from '@/lib/demo-mode'
import { clientIp, isLockedOut, recordFailure } from '@/lib/rate-limit'
import { PALWORLD_PROXY_HEADERS } from '@/lib/palworld'

const run = promisify(execFile)
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Live game chat + presence, parsed from the server's systemd journal
// (Palworld's REST API has no chat-read endpoint). ADMIN-tier only: this execs
// journalctl and returns player messages, so mod/unknown are rejected like the proxy.
// Requires Linux + systemd and the panel's OS user in the systemd-journal group.
const SYSTEMD_UNIT = process.env.PALWORLD_SYSTEMD_UNIT ?? 'palworld'
const CHAT_RE = /^\[([^\]]+)\]\s+\[CHAT\]\s+(.*)$/
const JOIN_RE = /^\[([^\]]+)\]\s+\[LOG\]\s+(.+?)\s+(?:[\d.:]+\s+)?(?:joined|connected) the server\./
const LEAVE_RE = /^\[([^\]]+)\]\s+\[LOG\]\s+(.+?)\s+left the server\./

type ChatEvent = { type: 'chat' | 'join' | 'leave'; ts: string; name: string; text?: string }

export async function GET(request: NextRequest) {
  const ip = clientIp(request)
  if (isLockedOut(ip)) return NextResponse.json({ error: 'Too many attempts.' }, { status: 429 })
  // Header-only: never accept the panel password from the query string, which
  // would leak it into reverse-proxy access logs, browser history, and Referer.
  const pw = request.headers.get(PALWORLD_PROXY_HEADERS.adminPassword) ?? ''
  const cls = classifyPassword(pw)
  if (cls === 'unknown') recordFailure(ip)
  if (cls !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (DEMO_MODE) {
    return NextResponse.json({
      events: [
        { type: 'join', ts: new Date(Date.now() - 600_000).toISOString(), name: 'LamballLarry' },
        { type: 'chat', ts: new Date(Date.now() - 420_000).toISOString(), name: 'CattivaCore', text: 'Demo server online.' },
        { type: 'chat', ts: new Date(Date.now() - 120_000).toISOString(), name: 'SparkitOps', text: 'Try announce, kick, ban, and restart safely.' },
      ],
    })
  }

  let out = ''
  try {
    const { stdout } = await run(
      'journalctl',
      ['-u', SYSTEMD_UNIT, '-o', 'cat', '--since', '-3h', '--no-pager'],
      { maxBuffer: 8 * 1024 * 1024, timeout: 5000 },
    )
    out = stdout
  } catch {
    return NextResponse.json({ events: [] })
  }

  const events: ChatEvent[] = []
  for (const line of out.split('\n')) {
    let m = CHAT_RE.exec(line)
    if (m) {
      const rest = m[2]!.trim()
      const nm = /^<([^>]+)>\s*(.*)$/.exec(rest)
      events.push({ type: 'chat', ts: m[1]!, name: nm ? nm[1]! : '', text: nm ? nm[2]! : rest })
      continue
    }
    m = JOIN_RE.exec(line)
    if (m) { events.push({ type: 'join', ts: m[1]!, name: m[2]!.trim() }); continue }
    m = LEAVE_RE.exec(line)
    if (m) { events.push({ type: 'leave', ts: m[1]!, name: m[2]!.trim() }) }
  }
  return NextResponse.json({ events: events.slice(-120) })
}
