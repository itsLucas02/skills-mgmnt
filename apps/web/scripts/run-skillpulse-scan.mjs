/* global process */

/**
 * One-shot runner for the SkillPulse scanner.
 *
 * The scanner is TypeScript and needs two Node flags, so they live here in one
 * place. The npm scripts, the "Scan now" API route and the hourly scheduled task
 * all go through this file rather than each repeating the flag list.
 *
 * This replaces the old skillpulse-collector.mjs, which was a 60-second polling
 * daemon that POSTed to http://localhost:3020/api/skillpulse/sync. That design
 * meant collection silently stopped whenever the dashboard was closed - it had
 * been off since 2026-07-14, leaving roughly two months unrecorded.
 *
 * SkillPulse derives every event from records that persist on disk, so nothing
 * needs to observe anything live. Runs once and exits.
 *
 * Flags:
 *   (none)       incremental scan
 *   --backfill   rescan every session file and rebuild the ledger
 *   --json       machine-readable output
 */

import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import path from "node:path"

const here = path.dirname(fileURLToPath(import.meta.url))
const scanner = path.join(here, "skillpulse-scan.ts")

const result = spawnSync(
  process.execPath,
  ["--experimental-strip-types", "--experimental-sqlite", scanner, ...process.argv.slice(2)],
  { stdio: "inherit", windowsHide: true }
)

process.exit(result.status ?? 1)
