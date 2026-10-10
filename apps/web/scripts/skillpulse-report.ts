/**
 * Cross-harness skill usage report.
 *
 * Answers "which skills are used in more than one agent tool?" from the
 * permanent usage ledger, and - more usefully - "which skills would look unused
 * if we only watched one tool?".
 *
 * Reads the ledger, so it is unaffected by event-log rotation or archive
 * pruning.
 *
 * Usage:
 *   node --experimental-strip-types scripts/skillpulse-report.ts
 *   node --experimental-strip-types scripts/skillpulse-report.ts --json
 */

import { getSkillPulsePaths } from "../lib/skillpulse.ts"
import { formatDateTime } from "../lib/date-format.ts"
import { readSkillUsageLedger, type LedgerSkillRollup } from "../lib/skill-usage-ledger.ts"

const asJson = process.argv.includes("--json")
const { skillPulseDir } = getSkillPulsePaths()
const ledger = readSkillUsageLedger(skillPulseDir)

type Row = {
  skillName: string
  total: number
  byHarness: Record<string, number>
  lastUsedAt?: string
}

const rows: Row[] = Object.values(ledger.skills as Record<string, LedgerSkillRollup>)
  .map((skill) => ({
    skillName: skill.skillName,
    total: skill.total,
    byHarness: skill.byHarness,
    lastUsedAt: skill.lastUsedAt,
  }))
  .sort((left, right) => right.total - left.total)

const harnessNames = Object.keys(ledger.harnesses).sort(
  (left, right) => (ledger.harnesses[right]?.eventCount ?? 0) - (ledger.harnesses[left]?.eventCount ?? 0)
)

const harnessesOf = (row: Row) => Object.keys(row.byHarness).filter((h) => (row.byHarness[h] ?? 0) > 0)

const shared = rows.filter((row) => harnessesOf(row).length > 1)
const exclusive = new Map<string, Row[]>()

for (const harness of harnessNames) {
  exclusive.set(
    harness,
    rows.filter((row) => {
      const used = harnessesOf(row)
      return used.length === 1 && used[0] === harness
    })
  )
}

if (asJson) {
  console.log(
    JSON.stringify(
      {
        updatedAt: ledger.updatedAt,
        coverage: harnessNames.map((harness) => ({
          harness,
          eventCount: ledger.harnesses[harness]?.eventCount ?? 0,
          firstEventAt: ledger.harnesses[harness]?.firstEventAt,
          lastEventAt: ledger.harnesses[harness]?.lastEventAt,
        })),
        shared,
        exclusive: Object.fromEntries([...exclusive].map(([h, list]) => [h, list])),
      },
      null,
      2
    )
  )
  process.exit(0)
}

const pct = (part: number, whole: number) => (whole === 0 ? "0" : ((part / whole) * 100).toFixed(1))

console.log("SKILL USAGE BY AGENT TOOL")
console.log("=========================")
console.log(`ledger updated: ${ledger.updatedAt ? formatDateTime(ledger.updatedAt) : "never"}`)
console.log("")

console.log("Coverage (recorded uses per tool)")
// Note: a CommandCode GOAT subscription used inside the opencode CLI is recorded
// by opencode, so its usage shows under "opencode". The "commandcode" row only
// covers the standalone CommandCode CLI, where zero is a normal reading.
for (const harness of harnessNames) {
  const rollup = ledger.harnesses[harness]
  console.log(
    `  ${harness.padEnd(13)} ${String(rollup?.eventCount ?? 0).padStart(6)} uses   first ${rollup?.firstEventAt ? formatDateTime(rollup.firstEventAt) : "?"}   last ${rollup?.lastEventAt ? formatDateTime(rollup.lastEventAt) : "?"}`
  )
}
console.log("")

console.log(`Used in MORE THAN ONE tool  (${shared.length} skills)`)
console.log("These are genuinely cross-platform. The 'split' column shows how the")
console.log("uses are divided, so you can see which tool is doing the work.")
console.log("")
for (const row of shared.slice(0, 25)) {
  const split = harnessNames
    .filter((h) => (row.byHarness[h] ?? 0) > 0)
    .map((h) => `${h} ${row.byHarness[h]} (${pct(row.byHarness[h] ?? 0, row.total)}%)`)
    .join("  |  ")
  console.log(`  ${String(row.total).padStart(5)}x  ${row.skillName.padEnd(32)} ${split}`)
}
if (shared.length > 25) {
  console.log(`  ... and ${shared.length - 25} more`)
}
console.log("")

console.log("Would be INVISIBLE if only Codex were tracked")
console.log("These have zero Codex usage, so they depend entirely on the newer")
console.log("adapters. Without them these skills would read as 'never used'.")
console.log("")
for (const harness of harnessNames) {
  if (harness === "codex") continue
  const list = exclusive.get(harness) ?? []
  console.log(`  -- ${harness} only (${list.length} skills)`)
  for (const row of list.slice(0, 20)) {
    console.log(`       ${String(row.total).padStart(4)}x  ${row.skillName}`)
  }
  if (list.length > 20) {
    console.log(`       ... and ${list.length - 20} more`)
  }
  console.log("")
}
