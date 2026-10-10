import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"

import type { SkillPulseEvent } from "./skillpulse.ts"
import {
  createEmptyLedger,
  foldEventsIntoLedger,
  pruneLedgerDays,
  rebuildSkillUsageLedger,
  updateSkillUsageLedger,
} from "./skill-usage-ledger.ts"

function event(overrides: Partial<SkillPulseEvent> & { id: string }): SkillPulseEvent {
  return {
    occurredAt: "2026-09-01T10:00:00.000Z",
    skillName: "example",
    harness: "codex",
    source: "test",
    ...overrides,
  }
}

function makeDir() {
  const root = mkdtempSync(path.join(tmpdir(), "ledger-"))
  const dir = path.join(root, "skillpulse")
  mkdirSync(dir, { recursive: true })
  return dir
}

test("folds events into totals, per-harness counts and day buckets", () => {
  const ledger = createEmptyLedger()

  foldEventsIntoLedger(ledger, [
    event({ id: "a", skillName: "Alpha", harness: "codex" }),
    event({ id: "b", skillName: "Alpha", harness: "opencode" }),
    event({ id: "c", skillName: "alpha", harness: "codex", occurredAt: "2026-09-02T10:00:00.000Z" }),
  ])

  const alpha = ledger.skills["alpha"]!

  assert.equal(alpha.total, 3)
  assert.equal(alpha.byHarness.codex, 2)
  assert.equal(alpha.byHarness.opencode, 1)
  assert.equal(alpha.days["2026-09-01"], 2)
  assert.equal(alpha.days["2026-09-02"], 1)
  assert.equal(alpha.firstUsedAt, "2026-09-01T10:00:00.000Z")
  assert.equal(alpha.lastUsedAt, "2026-09-02T10:00:00.000Z")
  assert.equal(ledger.harnesses.codex!.eventCount, 2)
  assert.equal(ledger.harnesses.opencode!.eventCount, 1)
})

test("updateSkillUsageLedger is idempotent when nothing new is appended", () => {
  const dir = makeDir()
  const eventsPath = path.join(dir, "events.jsonl")

  writeFileSync(eventsPath, `${JSON.stringify(event({ id: "a" }))}\n`, "utf8")

  const first = updateSkillUsageLedger({ skillPulseDir: dir })
  const second = updateSkillUsageLedger({ skillPulseDir: dir })

  assert.equal(first.addedEvents, 1)
  assert.equal(second.addedEvents, 0)

  const ledger = JSON.parse(readFileSync(path.join(dir, "usage-ledger.json"), "utf8"))

  assert.equal(ledger.skills.example.total, 1)
})

test("counters survive deletion of the event log and every archive", () => {
  // This is the guarantee that matters: pruning history must never reduce a
  // count, otherwise a skill still in demand could read as "never used".
  const dir = makeDir()
  const eventsPath = path.join(dir, "events.jsonl")

  writeFileSync(
    eventsPath,
    `${JSON.stringify(event({ id: "a" }))}\n${JSON.stringify(event({ id: "b" }))}\n`,
    "utf8"
  )

  updateSkillUsageLedger({ skillPulseDir: dir })
  const before = JSON.parse(readFileSync(path.join(dir, "usage-ledger.json"), "utf8"))

  rmSync(eventsPath)
  updateSkillUsageLedger({ skillPulseDir: dir })
  const after = JSON.parse(readFileSync(path.join(dir, "usage-ledger.json"), "utf8"))

  assert.equal(before.skills.example.total, 2)
  assert.equal(after.skills.example.total, 2)
})

test("rotation is detected and skipped rather than recounted", () => {
  const dir = makeDir()
  const eventsPath = path.join(dir, "events.jsonl")

  writeFileSync(
    eventsPath,
    `${JSON.stringify(event({ id: "a" }))}\n${JSON.stringify(event({ id: "b" }))}\n`,
    "utf8"
  )
  updateSkillUsageLedger({ skillPulseDir: dir })

  // Simulate a rotation: the active log is rewritten with a different first
  // line, containing events that were already counted.
  writeFileSync(eventsPath, `${JSON.stringify(event({ id: "b" }))}\n`, "utf8")
  const result = updateSkillUsageLedger({ skillPulseDir: dir })

  assert.equal(result.addedEvents, 0)

  const ledger = JSON.parse(readFileSync(path.join(dir, "usage-ledger.json"), "utf8"))

  assert.equal(ledger.skills.example.total, 2)
})

test("pruneLedgerDays drops old buckets but keeps the all-time total", () => {
  const ledger = createEmptyLedger()

  foldEventsIntoLedger(ledger, [
    event({ id: "old", occurredAt: "2025-01-01T00:00:00.000Z" }),
    event({ id: "new", occurredAt: "2026-09-01T00:00:00.000Z" }),
  ])

  pruneLedgerDays(ledger, new Date("2026-09-22T00:00:00.000Z"), 120)

  const skill = ledger.skills.example!

  assert.equal(skill.total, 2)
  assert.equal(skill.days["2025-01-01"], undefined)
  assert.equal(skill.days["2026-09-01"], 1)
})

test("rebuild dedupes the same event id across log and archives", () => {
  const dir = makeDir()
  const shared = JSON.stringify(event({ id: "dup" }))

  writeFileSync(path.join(dir, "events.jsonl"), `${shared}\n`, "utf8")
  writeFileSync(path.join(dir, "events.archived-2026-01-01.jsonl"), `${shared}\n`, "utf8")

  const result = rebuildSkillUsageLedger(dir)

  assert.equal(result.uniqueEvents, 1)

  const ledger = JSON.parse(readFileSync(path.join(dir, "usage-ledger.json"), "utf8"))

  assert.equal(ledger.skills.example.total, 1)
  // and the active log must be marked as already folded
  assert.ok(ledger.countedThroughBytes > 0)
})
