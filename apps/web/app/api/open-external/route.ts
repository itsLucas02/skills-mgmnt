import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { NextResponse } from "next/server"

import { isLocalRequest } from "@/lib/local-request"
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

  try {
    await execFileAsync("cmd.exe", ["/c", "antigravity.cmd", "--reuse-window", "--goto", `${target.path}:${target.line}`], {
      windowsHide: true,
    })
    return NextResponse.json({ ok: true, openedWith: "Antigravity", path: target.path, line: target.line })
  } catch (antigravityError) {
    try {
      await execFileAsync("explorer.exe", [`/select,${target.path}`], { windowsHide: true })
      return NextResponse.json({ ok: true, openedWith: "Windows Explorer", path: target.path, line: target.line })
    } catch (explorerError) {
      return NextResponse.json(
        {
          error: "Could not open target in Antigravity or Windows Explorer.",
          details: `${antigravityError instanceof Error ? antigravityError.message : "Antigravity failed"}; ${
            explorerError instanceof Error ? explorerError.message : "Explorer failed"
          }`,
        },
        { status: 500 }
      )
    }
  }
}
