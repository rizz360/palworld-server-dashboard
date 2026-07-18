import type { Metadata } from 'next'
import { PublicView } from '@/components/public-view'

// Public, read-only status page. Safe to expose without the panel login:
// every byte it shows comes from /api/public-view, which is opt-in
// (PUBLIC_VIEW_ENABLED) and serves an allowlisted, sanitized snapshot only.
export const metadata: Metadata = {
  title: 'Server Status - Palworld Server Dashboard',
  description: 'Read-only Palworld server status: metrics, live map, and online players.',
}

export default function PublicViewPage() {
  return <PublicView />
}
