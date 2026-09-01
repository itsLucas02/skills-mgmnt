import { NextResponse } from "next/server"

import { isLocalRequest } from "@/lib/local-request"
import { isSafeLocalPath, invalidateInventoryCache } from "@/lib/skills"
import { trashSkill } from "@/lib/skill-trash"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function POST(request: Request) {
  if (!isLocalRequest(request)) {
    return NextResponse.json({ error: "Local-only endpoint." }, { status: 403 })
  }

  const payload = (await request.json().catch(() => null)) as {
    path?: string
    skillName?: string
  } | null

  if (!payload?.path || !payload.skillName) {
    return NextResponse.json(
      { error: "Missing skill path or name." },
      { status: 400 }
    )
  }

  if (!isSafeLocalPath(payload.path)) {
    return NextResponse.json(
      { error: "Refusing to delete a path outside the scanned skill roots." },
      { status: 400 }
    )
  }

  try {
    const entry = trashSkill(payload.path, payload.skillName)
    invalidateInventoryCache()
    return NextResponse.json({ entry })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not move the skill to trash." },
      { status: 500 }
    )
  }
}
