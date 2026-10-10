import assert from "node:assert/strict"
import { appendFileSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"

import { pruneArchivedEvents, syncSkillPulseUsage } from "./skillpulse.ts"
import {
  readSkillUsageLedger,
  rebuildSkillUsageLedger,
  updateSkillUsageLedger,
} from "./skill-usage-ledger.ts"

function makeHome() {
  const root = mkdtempSync(path.join(tmpdir(), "skillpulse-resume-"))
  const codexHome = path.join(root, ".codex")
  const sessionRoot = path.join(codexHome, "sessions", "2026", "06", "28")
  const skillPath = path.join(codexHome, "skills", "example", "SKILL.md")
  mkdirSync(path.dirname(skillPath), { recursive: true })
  mkdirSync(sessionRoot, { recursive: true })
  writeFileSync(skillPath, "---\nname: example\n---\n", "utf8")
  return { codexHome, sessionRoot, skillPath, sessionFile: path.join(sessionRoot, "rollout.jsonl") }
}

/** A skill-read line WITH a call id. */
function lineWithCallId(callId: string, skillPath: string) {
  return JSON.stringify({
    timestamp: "2026-06-28T09:00:00.000Z",
    type: "response_item",
    payload: {
      type: "function_call",
      call_id: callId,
      name: "shell_command",
      arguments: JSON.stringify({ command: `Get-Content -Raw ${skillPath}` }),
    },
  })
}

/**
 * A skill-read line WITHOUT a call id, so event identity falls back to the line
 * number. This is what makes line numbering correctness testable.
 */
function lineWithoutCallId(skillPath: string) {
  return JSON.stringify({
    timestamp: "2026-06-28T09:00:00.000Z",
    type: "response_item",
    payload: {
      type: "function_call",
      name: "shell_command",
      arguments: JSON.stringify({ command: `Get-Content -Raw ${skillPath}` }),
    },
  })
}

function eventCount(codexHome: string) {
  const file = path.join(codexHome, "skillpulse", "events.jsonl")
  return readFileSync(file, "utf8").trim().split(/\r?\n/).filter(Boolean).length
}

test("resumes a grown session file and picks up only the appended event", () => {
  const { codexHome, skillPath, sessionFile } = makeHome()

  writeFileSync(sessionFile, `${lineWithCallId("call_1", skillPath)}\n`, "utf8")

  const first = syncSkillPulseUsage({ codexHome, mode: "backfill-all" })
  assert.equal(first.newEventCount, 1)

  appendFileSync(sessionFile, `${lineWithCallId("call_2", skillPath)}\n`, "utf8")

  const second = syncSkillPulseUsage({ codexHome, mode: "incremental" })

  assert.equal(second.newEventCount, 1)
  assert.equal(eventCount(codexHome), 2)
})

test("resuming does not duplicate the already-scanned event", () => {
  const { codexHome, skillPath, sessionFile } = makeHome()

  writeFileSync(sessionFile, `${lineWithCallId("call_1", skillPath)}\n`, "utf8")
  syncSkillPulseUsage({ codexHome, mode: "backfill-all" })

  appendFileSync(sessionFile, `${lineWithCallId("call_2", skillPath)}\n`, "utf8")
  syncSkillPulseUsage({ codexHome, mode: "incremental" })

  // A third pass with nothing new must add nothing, which proves the offset was
  // advanced past both events rather than left mid-file.
  const third = syncSkillPulseUsage({ codexHome, mode: "incremental" })

  assert.equal(third.newEventCount, 0)
  assert.equal(eventCount(codexHome), 2)
})

test("line numbers stay absolute across a resume so fallback ids remain stable", () => {
  const { codexHome, skillPath, sessionFile } = makeHome()

  // Three lines; only the third carries a skill read, and it has no call id so
  // its event id derives from the line number (3).
  writeFileSync(
    sessionFile,
    [
      JSON.stringify({ type: "session_meta", payload: { session_id: "s" } }),
      JSON.stringify({ type: "response_item", payload: { type: "message" } }),
      lineWithoutCallId(skillPath),
      "",
    ].join("\n"),
    "utf8"
  )

  syncSkillPulseUsage({ codexHome, mode: "backfill-all" })
  assert.equal(eventCount(codexHome), 1)

  // Append a fourth line, also without a call id: its id derives from line 4.
  appendFileSync(sessionFile, `${lineWithoutCallId(skillPath)}\n`, "utf8")
  syncSkillPulseUsage({ codexHome, mode: "incremental" })
  assert.equal(eventCount(codexHome), 2)

  // Now re-derive from scratch. If the resume had renumbered the appended line
  // as 1 instead of 4, the re-derived ids would differ and dedup would miss,
  // leaving three events.
  syncSkillPulseUsage({ codexHome, mode: "backfill-all" })

  assert.equal(eventCount(codexHome), 2)
})

test("a rewritten session file is rescanned from the start", () => {
  const { codexHome, skillPath, sessionFile } = makeHome()

  writeFileSync(sessionFile, `${lineWithCallId("call_1", skillPath)}\n`, "utf8")
  syncSkillPulseUsage({ codexHome, mode: "backfill-all" })
  assert.equal(eventCount(codexHome), 1)

  // Shrink the file: a truncation is not append-only, so resume must not apply.
  writeFileSync(sessionFile, `${lineWithCallId("call_9", skillPath)}\n`, "utf8")
  const result = syncSkillPulseUsage({ codexHome, mode: "incremental" })

  assert.equal(result.newEventCount, 1)
  assert.equal(eventCount(codexHome), 2)
})

test("prunes old archives and keeps the newest ones", () => {
  const { codexHome } = makeHome()
  const dir = path.join(codexHome, "skillpulse")
  mkdirSync(dir, { recursive: true })

  const names = [
    "events.archived-2026-01-01T00-00-00-000Z.jsonl",
    "events.archived-2026-02-01T00-00-00-000Z.jsonl",
    "events.archived-2026-03-01T00-00-00-000Z.jsonl",
    "events.archived-2026-04-01T00-00-00-000Z.jsonl",
  ]

  for (const name of names) {
    writeFileSync(path.join(dir, name), "{}\n", "utf8")
  }

  const removed = pruneArchivedEvents(codexHome, 2)
  const remaining = readdirSync(dir).filter((n) => n.startsWith("events.archived-")).sort()

  assert.equal(removed.length, 2)
  assert.deepEqual(remaining, [
    "events.archived-2026-03-01T00-00-00-000Z.jsonl",
    "events.archived-2026-04-01T00-00-00-000Z.jsonl",
  ])
})

test("pruning archives cannot lower a ledger count", () => {
  const { codexHome, skillPath, sessionFile } = makeHome()
  const dir = path.join(codexHome, "skillpulse")

  writeFileSync(sessionFile, `${lineWithCallId("call_1", skillPath)}\n`, "utf8")
  syncSkillPulseUsage({ codexHome, mode: "backfill-all" })

  // The scanner folds events into the ledger after the sync, so mirror that here.
  updateSkillUsageLedger({ skillPulseDir: dir })
  assert.equal(readSkillUsageLedger(dir).skills.example?.total, 1)

  // Simulate a rotation: the raw event is moved into an archive, then pruned so
  // nothing derivable is left on disk.
  renameSync(path.join(dir, "events.jsonl"), path.join(dir, "events.archived-2026-01-01T00-00-00-000Z.jsonl"))
  pruneArchivedEvents(codexHome, 0)

  assert.deepEqual(readdirSync(dir).filter((n) => n.startsWith("events")), [])

  rebuildSkillUsageLedger(dir)

  assert.equal(readSkillUsageLedger(dir).skills.example?.total, 1)
})
