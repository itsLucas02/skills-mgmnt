import { NextResponse } from "next/server"

import { isLocalRequest } from "@/lib/local-request"
import { getSkillPulseSummary } from "@/lib/skillpulse"
import { getCapabilityInventory } from "@/lib/skills"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export function GET(request: Request) {
  if (!isLocalRequest(request)) {
    return NextResponse.json({ error: "Local-only endpoint." }, { status: 403 })
  }

  const inventory = getCapabilityInventory()

  return NextResponse.json(getSkillPulseSummary({ skills: inventory.skills }))
}
