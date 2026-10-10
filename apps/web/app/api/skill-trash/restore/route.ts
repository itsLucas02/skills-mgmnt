import { NextResponse } from "next/server"

import { isLocalRequest } from "@/lib/local-request"
import { acquireSkillOperation } from "@/lib/skill-operation-lock"
import { invalidateInventoryCache } from "@/lib/skills"
import { restoreSkill } from "@/lib/skill-trash"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function POST(request: Request) {
  if (!isLocalRequest(request)) {
    return NextResponse.json({ error: "Local-only endpoint." }, { status: 403 })
  }

  const payload = (await request.json().catch(() => null)) as {
    entryId?: string
  } | null

  if (!payload?.entryId) {
    return NextResponse.json({ error: "Missing entryId." }, { status: 400 })
  }

  let release: (() => void) | undefined
  try {
    release = acquireSkillOperation()
    const entry = restoreSkill(payload.entryId)
    invalidateInventoryCache()
    return NextResponse.json({ entry })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not restore the skill." },
      { status: 500 }
    )
  } finally { release?.() }
}
