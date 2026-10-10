/**
 * Headless multi-harness skill usage scanner.
 *
 * SkillPulse derives every event by reading records that persist on disk, so it
 * never needs to observe anything live - an always-on daemon was never required
 * for correctness, only for latency, and the old skillpulse-collector.mjs broke
 * whenever the dashboard was closed because it POSTs to localhost:3020.
 *
 * This runs the same syncSkillPulseUsage() the API route uses, plus the
 * Claude Code, CommandCode and opencode adapters, then folds everything into the
 * permanent usage ledger (the scoreboard). Point a scheduled task at it and
 * collection continues whether or not the dashboard is running.
 *
 * Usage:
 *   node --experimental-strip-types scripts/skillpulse-scan.ts
 *   node --experimental-strip-types scripts/skillpulse-scan.ts --backfill
 *   node --experimental-strip-types scripts/skillpulse-scan.ts --json
 *
 * --experimental-sqlite is required for the opencode adapter. Without it that
 * adapter reports a note and the rest of the scan still completes.
 */

import {
  collectHarnessSkillEvents,
  writeHarnessOffsetState,
} from "../lib/skill-harness-adapters.ts"
import { appendSkillPulseEvents, getSkillPulsePaths, syncSkillPulseUsage } from "../lib/skillpulse.ts"
import {
  rebuildSkillUsageLedger,
  updateSkillUsageLedger,
} from "../lib/skill-usage-ledger.ts"

const args = new Set(process.argv.slice(2))
const backfill = args.has("--backfill")
const asJson = args.has("--json")
const mode = backfill ? "backfill-all" : "incremental"

const startedAt = Date.now()
const { skillPulseDir } = getSkillPulsePaths()

let codexResult

try {
  codexResult = syncSkillPulseUsage({ mode })
} catch (error) {
  console.error(
    `SkillPulse scan failed during the Codex pass: ${error instanceof Error ? error.message : String(error)}`
  )
  process.exit(1)
}

const harness = await collectHarnessSkillEvents({ skillPulseDir, backfill })

// Fold the non-Codex events into the same log, through the same dedup/rotation
// writer, so every harness shares one storage path and one scoreboard. Offsets
// are only advanced after the append succeeds, so a failure re-collects rather
// than silently dropping invocations.
const harnessEvents = harness.results.flatMap((result) => result.events)
const harnessAppended = appendSkillPulseEvents(harnessEvents)

if (!backfill) {
  writeHarnessOffsetState(skillPulseDir, harness.state)
}

let ledger
let ledgerMode: string

try {
  if (backfill) {
    ledger = rebuildSkillUsageLedger(skillPulseDir)
    ledgerMode = "rebuilt"
  } else {
    ledger = updateSkillUsageLedger({ skillPulseDir })
    ledgerMode = "incremental"
  }
} catch (error) {
  console.error(
    `SkillPulse scan failed while updating the ledger: ${error instanceof Error ? error.message : String(error)}`
  )
  process.exit(1)
}

const elapsedMs = Date.now() - startedAt

if (asJson) {
  console.log(
    JSON.stringify(
      {
        mode,
        codex: codexResult,
        harnesses: harness.results.map((result) => ({
          harness: result.harness,
          label: result.label,
          filesScanned: result.filesScanned,
          events: result.events.length,
          note: result.note,
        })),
        ledger: { mode: ledgerMode, ...ledger },
        elapsedMs,
      },
      null,
      2
    )
  )
  process.exit(0)
}

const lines = [
  `SkillPulse scan (${mode})`,
  `  codex files      : ${codexResult.processedFileCount}`,
  `  codex lines      : ${codexResult.scannedLineCount}`,
  `  codex new events : ${codexResult.newEventCount}`,
  "",
  "  other harnesses:",
]

for (const result of harness.results) {
  const suffix = result.note ? `  (${result.note})` : ""
  lines.push(
    `    ${result.label.padEnd(13)} events=${String(result.events.length).padStart(4)} files=${result.filesScanned}${suffix}`
  )
}

lines.push(
  "",
  `  event log total  : ${harnessAppended.totalEventCount}`,
  `  ledger (${ledgerMode}) : ${ledger.skills} skills, harnesses: ${ledger.harnesses.join(", ") || "none"}`,
  `  elapsed          : ${(elapsedMs / 1000).toFixed(1)}s`
)

console.log(lines.join("\n"))
