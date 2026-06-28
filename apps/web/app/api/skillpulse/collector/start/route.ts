import { existsSync } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"
import { spawn } from "node:child_process"

import { NextResponse } from "next/server"

import { isLocalRequest } from "@/lib/local-request"
import { getSkillPulseCollectorStatus, writeSkillPulseCollectorStatus } from "@/lib/skillpulse"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export function POST(request: Request) {
  if (!isLocalRequest(request)) {
    return NextResponse.json({ error: "Local-only endpoint." }, { status: 403 })
  }

  const currentStatus = getSkillPulseCollectorStatus()
  if (currentStatus.pid && isProcessRunning(currentStatus.pid)) {
    return NextResponse.json({
      ...currentStatus,
      enabled: true,
      collectorRunning: true,
    })
  }

  const scriptPath = getCollectorScriptPath()
  if (!scriptPath) {
    return NextResponse.json({ error: "SkillPulse collector script was not found." }, { status: 500 })
  }

  const codexHome = process.env.CODEX_HOME ?? path.join(homedir(), ".codex")
  const baseUrl = new URL(request.url).origin
  const child = spawn(process.execPath, [scriptPath], {
    detached: true,
    stdio: "ignore",
    env: {
      ...process.env,
      CODEX_HOME: codexHome,
      SKILLPULSE_BASE_URL: baseUrl,
      SKILLPULSE_INTERVAL_MS: "60000",
    },
  })

  child.unref()

  const nextStatus = {
    enabled: true,
    collectorRunning: true,
    pid: child.pid,
    startedAt: new Date().toISOString(),
  }
  writeSkillPulseCollectorStatus(nextStatus)

  return NextResponse.json(nextStatus)
}

function getCollectorScriptPath() {
  const candidates = [
    path.join(process.cwd(), "scripts", "skillpulse-collector.mjs"),
    path.join(process.cwd(), "apps", "web", "scripts", "skillpulse-collector.mjs"),
  ]

  return candidates.find((candidate) => existsSync(candidate)) ?? null
}

function isProcessRunning(pid: number) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}
