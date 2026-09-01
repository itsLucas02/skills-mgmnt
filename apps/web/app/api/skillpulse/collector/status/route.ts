import { NextResponse } from "next/server"

import { isLocalRequest } from "@/lib/local-request"
import { getSkillPulseCollectorStatus, writeSkillPulseCollectorStatus } from "@/lib/skillpulse"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export function GET(request: Request) {
  if (!isLocalRequest(request)) {
    return NextResponse.json({ error: "Local-only endpoint." }, { status: 403 })
  }

  // getSkillPulseCollectorStatus already verifies PID liveness and reconciles
  // the stored collectorRunning flag, so the persisted status is current.
  const nextStatus = getSkillPulseCollectorStatus()

  if (nextStatus.collectorRunning) {
    writeSkillPulseCollectorStatus(nextStatus)
  }

  return NextResponse.json(nextStatus)
}
