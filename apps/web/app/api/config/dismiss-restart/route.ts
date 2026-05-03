import { NextResponse } from "next/server"

import { dismissRestartWarning } from "@/lib/config-editor"
import { isLocalRequest } from "@/lib/local-request"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export function POST(request: Request) {
  if (!isLocalRequest(request)) {
    return NextResponse.json({ error: "Local-only endpoint." }, { status: 403 })
  }

  return NextResponse.json(dismissRestartWarning())
}
