import { NextResponse } from "next/server"

import { isLocalRequest } from "@/lib/local-request"
import { listSkillTrash } from "@/lib/skill-trash"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(request: Request) {
  if (!isLocalRequest(request)) {
    return NextResponse.json({ error: "Local-only endpoint." }, { status: 403 })
  }

  return NextResponse.json({ entries: listSkillTrash() })
}
