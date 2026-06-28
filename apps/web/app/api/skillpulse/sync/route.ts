import { NextResponse } from "next/server"

import { isLocalRequest } from "@/lib/local-request"
import type { SkillPulseSyncMode } from "@/lib/skillpulse"
import { syncSkillPulseUsage } from "@/lib/skillpulse"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function POST(request: Request) {
  if (!isLocalRequest(request)) {
    return NextResponse.json({ error: "Local-only endpoint." }, { status: 403 })
  }

  const payload = (await request.json().catch(() => null)) as {
    mode?: SkillPulseSyncMode
  } | null
  const mode = payload?.mode ?? "incremental"

  if (mode !== "incremental" && mode !== "backfill-all") {
    return NextResponse.json({ error: "Invalid SkillPulse sync mode." }, { status: 400 })
  }

  try {
    return NextResponse.json(syncSkillPulseUsage({ mode }))
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not sync SkillPulse usage." },
      { status: 500 }
    )
  }
}
