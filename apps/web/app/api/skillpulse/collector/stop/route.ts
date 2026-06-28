import { NextResponse } from "next/server"

import { isLocalRequest } from "@/lib/local-request"
import { getSkillPulseCollectorStatus, writeSkillPulseCollectorStatus } from "@/lib/skillpulse"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export function POST(request: Request) {
  if (!isLocalRequest(request)) {
    return NextResponse.json({ error: "Local-only endpoint." }, { status: 403 })
  }

  const status = getSkillPulseCollectorStatus()
  if (status.pid && isProcessRunning(status.pid)) {
    try {
      process.kill(status.pid)
    } catch {
      // The next status check will reconcile stale process state.
    }
  }

  const nextStatus = {
    ...status,
    enabled: false,
    collectorRunning: false,
    stoppedAt: new Date().toISOString(),
  }
  writeSkillPulseCollectorStatus(nextStatus)

  return NextResponse.json(nextStatus)
}

function isProcessRunning(pid: number) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}
