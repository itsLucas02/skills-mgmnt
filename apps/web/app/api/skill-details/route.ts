import { NextResponse } from "next/server"

import { isLocalRequest } from "@/lib/local-request"
import { getSkillDetail } from "@/lib/skills"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export function GET(request: Request) {
  if (!isLocalRequest(request)) {
    return NextResponse.json({ error: "Local-only endpoint." }, { status: 403 })
  }

  const url = new URL(request.url)
  const id = url.searchParams.get("id")

  if (!id) {
    return NextResponse.json({ error: "Missing skill detail id." }, { status: 400 })
  }

  const detail = getSkillDetail(id)

  if (!detail) {
    return NextResponse.json({ error: "Skill detail was not found." }, { status: 404 })
  }

  return NextResponse.json(detail)
}
