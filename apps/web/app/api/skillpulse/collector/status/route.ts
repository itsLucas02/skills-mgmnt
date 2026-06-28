import { NextResponse } from "next/server"

import { isLocalRequest } from "@/lib/local-request"
import { getSkillPulseCollectorStatus, writeSkillPulseCollectorStatus } from "@/lib/skillpulse"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export function GET(request: Request) {
  if (!isLocalRequest(request)) {
    return NextResponse.json({ error: "Local-only endpoint." }, { status: 403 })
  }

  const status = getSkillPulseCollectorStatus()
  const collectorRunning = status.pid ? isProcessRunning(status.pid) : false
  const nextStatus = {
    ...status,
    collectorRunning,
    enabled: collectorRunning ? true : status.enabled,
  }

  if (nextStatus.collectorRunning !== status.collectorRunning) {
    writeSkillPulseCollectorStatus(nextStatus)
  }

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
