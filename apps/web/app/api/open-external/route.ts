import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { NextResponse } from "next/server"

import { isLocalRequest } from "@/lib/local-request"
import { getOpenCommandCandidates, getTargetLine } from "@/lib/open-external"
import { getOpenableTarget } from "@/lib/skills"

const execFileAsync = promisify(execFile)

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function POST(request: Request) {
  if (!isLocalRequest(request)) {
    return NextResponse.json({ error: "Local-only endpoint." }, { status: 403 })
  }

  const payload = (await request.json().catch(() => null)) as {
    id?: string
  } | null

  if (!payload?.id) {
    return NextResponse.json({ error: "Missing open target id." }, { status: 400 })
  }

  const target = getOpenableTarget(payload.id)

  if (!target) {
    return NextResponse.json({ error: "Open target is outside the allowed local roots." }, { status: 403 })
  }

  const line = getTargetLine(target.line)
  const failures: string[] = []

  for (const candidate of getOpenCommandCandidates(target.path, line)) {
    try {
      await execFileAsync(candidate.command, candidate.args, { windowsHide: true })
      return NextResponse.json({
        ok: true,
        openedWith: candidate.name,
        path: target.path,
        line,
      })
    } catch (error) {
      failures.push(`${candidate.name}: ${error instanceof Error ? error.message : "failed"}`)
    }
  }

  return NextResponse.json(
    {
      error: "Could not open target in Antigravity, VS Code, Cursor, or Windows Explorer.",
      details: failures.join("\n"),
    },
    { status: 500 }
  )
}
