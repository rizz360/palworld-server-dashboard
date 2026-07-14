import { NextRequest, NextResponse } from 'next/server'
import { writeFile, rename } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { classifyPassword, tierForClass } from '@/lib/access-tier'
import { clientIp, isLockedOut, recordFailure } from '@/lib/rate-limit'
import { PALWORLD_PROXY_HEADERS } from '@/lib/palworld'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// The dashboard cannot restart the game process itself (PalServer has no
// self-restart, and REST /shutdown only stops it). Instead this route drops a
// request flag file that a root-owned systemd path-unit + worker consume to run
// `systemctl restart` on the host. The web tier holds NO sudo — it only writes a
// file it already owns. This feature is INERT until an operator installs those
// host-side units (a systemd .path watching the request file + a oneshot that
// runs `systemctl restart`); see the "Optional: server restart" section of the
// README for a copy-pasteable example.
const REQUEST_PATH = process.env.PALWORLD_RESTART_REQUEST_PATH ?? '/run/palworld/restart.request'
const CANCEL_PATH = join(dirname(REQUEST_PATH), 'restart.cancel')
const MAX_WAIT = 1800

function presentedPassword(request: NextRequest) {
  return request.headers.get(PALWORLD_PROXY_HEADERS.adminPassword) ?? ''
}

// Admin-tier gate shared by POST (request) and DELETE (cancel). Server control
// is admin-only: mod tier is rejected here, before any file is written. Returns
// a rejection response, or null when the caller is authorized as admin.
function adminGate(request: NextRequest): NextResponse | null {
  const ip = clientIp(request)
  if (isLockedOut(ip)) {
    return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429 })
  }
  const passwordClass = classifyPassword(presentedPassword(request))
  if (passwordClass === 'unknown') {
    recordFailure(ip)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (tierForClass(passwordClass) !== 'admin') {
    return NextResponse.json({ error: 'Forbidden: server restart is admin-only' }, { status: 403 })
  }
  return null
}

export async function POST(request: NextRequest) {
  const denied = adminGate(request)
  if (denied) return denied

  let waittime = 30
  let message = 'Server restarting'
  let dryRun = false
  try {
    const body = (await request.json()) as { waittime?: unknown; message?: unknown; dryRun?: unknown }
    if (typeof body.waittime === 'number' && Number.isFinite(body.waittime)) {
      waittime = Math.max(0, Math.min(MAX_WAIT, Math.floor(body.waittime)))
    }
    if (typeof body.message === 'string') {
      message = body.message.slice(0, 180)
    }
    dryRun = body.dryRun === true
  } catch {
    // empty/malformed body → defaults (a 30s restart)
  }

  try {
    // temp-then-rename so the path-unit never observes a half-written request
    const tmp = `${REQUEST_PATH}.tmp`
    await writeFile(tmp, JSON.stringify({ waittime, message, dryRun, requestedAt: Date.now() }), { mode: 0o660 })
    await rename(tmp, REQUEST_PATH)
  } catch (error) {
    return NextResponse.json(
      { error: `Failed to queue restart: ${error instanceof Error ? error.message : 'unknown error'}` },
      { status: 500 }
    )
  }
  return NextResponse.json({ success: true, waittime, dryRun })
}

export async function DELETE(request: NextRequest) {
  const denied = adminGate(request)
  if (denied) return denied
  try {
    await writeFile(CANCEL_PATH, JSON.stringify({ cancelledAt: Date.now() }), { mode: 0o660 })
  } catch (error) {
    return NextResponse.json(
      { error: `Failed to cancel restart: ${error instanceof Error ? error.message : 'unknown error'}` },
      { status: 500 }
    )
  }
  return NextResponse.json({ success: true })
}
