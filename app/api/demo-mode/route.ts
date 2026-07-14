import { NextResponse } from 'next/server'

export function GET() {
  return NextResponse.json({
    enabled: process.env.NEXT_PUBLIC_DEMO_MODE === 'true' || process.env.DEMO_MODE === 'true',
  })
}
