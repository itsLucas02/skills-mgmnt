import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"

import type { ManagedSkill } from "./skills.ts"
import {
  aggregateSkillPulseUsage,
  extractSkillPulseEventsFromSessionLine,
  syncSkillPulseUsage,
} from "./skillpulse.ts"

function createSkill(overrides: Partial<ManagedSkill> & Pick<ManagedSkill, "name" | "path">): ManagedSkill {
  const { name, path: skillPath, ...rest } = overrides
  return {
    id: skillPath,
    detailId: skillPath,
    name,
    description: "",
    source: "Codex local",
    path: skillPath,
    relativePath: skillPath,
    status: "active",
    effectiveStatus: "active",
    statusReason: "Enabled by default",
    editable: true,
    origin: {
      label: "Codex local",
      confidence: "known",
      detail: "",
    },
    controlGate: {
      type: "default",
      label: "Default",
      editable: false,
      reason: "",
    },
    ...rest,
  }
}

test("extracts skill load events from Codex function-call session lines", () => {
  const skillPath = "C:\\Users\\User\\.codex\\skills\\example\\SKILL.md"
  const line = JSON.stringify({
    timestamp: "2026-06-28T09:00:00.000Z",
    type: "response_item",
    payload: {
      type: "function_call",
      call_id: "call_123",
      name: "shell_command",
      arguments: JSON.stringify({
        command: `Get-Content -Raw ${skillPath}`,
      }),
    },
  })

  const events = extractSkillPulseEventsFromSessionLine(line, {
    sessionFile: "C:\\Users\\User\\.codex\\sessions\\2026\\06\\28\\rollout.jsonl",
    sessionId: "session-1",
  })

  assert.equal(events.length, 1)
  assert.equal(events[0]?.skillPath, skillPath)
  assert.equal(events[0]?.skillName, "example")
  assert.equal(events[0]?.source, "session-jsonl-skill-read")
})

test("syncs appended session lines once and stores offset state", () => {
  const root = mkdtempSync(path.join(tmpdir(), "skillpulse-"))
  const codexHome = path.join(root, ".codex")
  const sessionRoot = path.join(codexHome, "sessions", "2026", "06", "28")
  const skillPath = path.join(codexHome, "skills", "example", "SKILL.md")
  const sessionFile = path.join(sessionRoot, "rollout.jsonl")

  mkdirSync(path.dirname(skillPath), { recursive: true })
  mkdirSync(sessionRoot, { recursive: true })
  writeFileSync(skillPath, "---\nname: example\n---\n", "utf8")
  writeFileSync(
    sessionFile,
    `${JSON.stringify({
      timestamp: "2026-06-28T09:00:00.000Z",
      type: "response_item",
      payload: {
        type: "function_call",
        call_id: "call_123",
        name: "shell_command",
        arguments: JSON.stringify({ command: `Get-Content -Raw ${skillPath}` }),
      },
    })}\n`,
    "utf8"
  )

  const first = syncSkillPulseUsage({
    codexHome,
    mode: "backfill-all",
    now: new Date("2026-06-28T10:00:00.000Z"),
  })
  const second = syncSkillPulseUsage({
    codexHome,
    mode: "incremental",
    now: new Date("2026-06-28T10:01:00.000Z"),
  })

  const eventLines = readFileSync(path.join(codexHome, "skillpulse", "events.jsonl"), "utf8")
    .trim()
    .split(/\r?\n/)

  assert.equal(first.newEventCount, 1)
  assert.equal(second.newEventCount, 0)
  assert.equal(eventLines.length, 1)
})

test("aggregates usage and flags enabled skills unused across a seven-day window", () => {
  const activeUnused = createSkill({
    name: "unused",
    path: "C:\\Users\\User\\.codex\\skills\\unused\\SKILL.md",
  })
  const activeUsed = createSkill({
    name: "used",
    path: "C:\\Users\\User\\.codex\\skills\\used\\SKILL.md",
  })
  const disabledUnused = createSkill({
    name: "disabled",
    path: "C:\\Users\\User\\.codex\\skills\\disabled\\SKILL.md",
    status: "disabled",
    effectiveStatus: "disabled-by-skill",
  })

  const summary = aggregateSkillPulseUsage({
    skills: [activeUnused, activeUsed, disabledUnused],
    events: [
      {
        id: "event-1",
        occurredAt: "2026-06-27T09:00:00.000Z",
        sessionId: "session-1",
        sessionFile: "rollout.jsonl",
        skillPath: activeUsed.path,
        skillName: activeUsed.name,
        source: "session-jsonl-skill-read",
      },
    ],
    now: new Date("2026-06-28T10:00:00.000Z"),
    firstEventAt: "2026-06-20T09:00:00.000Z",
    lastSyncAt: "2026-06-28T10:00:00.000Z",
  })

  const unused = summary.skills.find((skill) => skill.skillName === "unused")
  const used = summary.skills.find((skill) => skill.skillName === "used")
  const disabled = summary.skills.find((skill) => skill.skillName === "disabled")

  assert.equal(unused?.recommendation, "disable-candidate")
  assert.equal(used?.recommendation, "keep")
  assert.equal(disabled?.recommendation, "keep")
  assert.equal(summary.totals.disableCandidateCount, 1)
})
