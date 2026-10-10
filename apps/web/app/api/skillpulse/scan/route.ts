import { existsSync } from "node:fs"
import { spawn } from "node:child_process"
import { homedir } from "node:os"
import path from "node:path"

import { NextResponse } from "next/server"

import { isLocalRequest } from "@/lib/local-request"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * Manual "scan now": collects skill invocations from every supported harness
 * (Codex, Claude Code, CommandCode, opencode) and folds them into the usage
 * ledger, then returns immediately.
 *
 * The scan runs in its own Node process rather than inline in the Next.js server
 * for one concrete reason: the opencode reader opens SQLite, which needs
 * --experimental-sqlite, and Next does not run with that flag. Going out to a
 * child process lets the same scanner serve the dashboard, the CLI and the
 * scheduled task.
 *
 * Recurring collection belongs to the "SkillPulse Hourly Scan" task; this is the
 * on-demand path, so it deliberately does not start any long-lived process.
 */
export function POST(request: Request) {
  if (!isLocalRequest(request)) {
    return NextResponse.json({ error: "Local-only endpoint." }, { status: 403 })
  }

  const runnerPath = getRunnerPath()

  if (!runnerPath) {
    return NextResponse.json(
      { error: "SkillPulse scan runner was not found." },
      { status: 500 }
    )
  }

  const codexHome = process.env.CODEX_HOME ?? path.join(homedir(), ".codex")

  return request
    .json()
    .catch(() => null)
    .then((payload: { mode?: string } | null) => {
      const mode = payload?.mode === "backfill-all" ? "backfill-all" : "incremental"
      const args = [runnerPath]

      if (mode === "backfill-all") {
        args.push("--backfill")
      }

      try {
        const child = spawn(process.execPath, args, {
          windowsHide: true,
          detached: true,
          stdio: "ignore",
          env: { ...process.env, CODEX_HOME: codexHome },
        })

        child.unref()

        return NextResponse.json({
          started: true,
          mode,
          pid: child.pid ?? null,
          startedAt: new Date().toISOString(),
        })
      } catch (error) {
        return NextResponse.json(
          {
            error:
              error instanceof Error
                ? `Could not start the SkillPulse scan: ${error.message}`
                : "Could not start the SkillPulse scan.",
          },
          { status: 500 }
        )
      }
    })
}

function getRunnerPath() {
  const candidates = [
    path.join(process.cwd(), "scripts", "run-skillpulse-scan.mjs"),
    path.join(process.cwd(), "apps", "web", "scripts", "run-skillpulse-scan.mjs"),
  ]

  return candidates.find((candidate) => existsSync(candidate)) ?? null
}
