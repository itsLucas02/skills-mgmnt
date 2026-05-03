import { NextResponse } from "next/server"

import type { ConfigChange } from "@/lib/config-editor"
import { previewConfigChanges } from "@/lib/config-editor"
import { isLocalRequest } from "@/lib/local-request"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function POST(request: Request) {
  if (!isLocalRequest(request)) {
    return NextResponse.json({ error: "Local-only endpoint." }, { status: 403 })
  }

  const payload = (await request.json().catch(() => null)) as {
    changes?: ConfigChange[]
  } | null

  if (!payload?.changes) {
    return NextResponse.json({ error: "Missing config changes." }, { status: 400 })
  }

  try {
    return NextResponse.json({ preview: previewConfigChanges(payload.changes) })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not preview changes." },
      { status: 500 }
    )
  }
}
