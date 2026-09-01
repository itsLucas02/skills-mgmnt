import assert from "node:assert/strict"
import test from "node:test"

import type { SkillPulseSummaryResponse } from "./skillpulse.ts"
import { buildSkillPulseCsv } from "./csv-export.ts"

function buildSummary(
  skills: SkillPulseSummaryResponse["skills"]
): SkillPulseSummaryResponse {
  return {
    status: {
      enabled: false,
      collectorRunning: false,
      lastSyncAt: undefined,
      firstEventAt: undefined,
      lastEventAt: undefined,
      dataCoverageDays: 10,
    },
    totals: {
      totalEvents: 0,
      loadedSkillCount: 0,
      disableCandidateCount: 0,
    },
    skills,
  }
}

test("exports skill usage rows as CSV", () => {
  const csv = buildSkillPulseCsv(
    buildSummary([
      {
        skillPath: "C:\\skills\\example\\SKILL.md",
        skillName: "example",
        parentPluginKey: undefined,
        effectiveStatus: "active",
        loads7d: 2,
        loads30d: 5,
        loadsAllTime: 9,
        lastLoadedAt: "2026-08-01T00:00:00.000Z",
        recommendation: "keep",
      },
    ])
  )

  const lines = csv.split("\r\n")
  assert.equal(
    lines[0],
    "skillName,skillPath,parentPluginKey,effectiveStatus,loads7d,loads30d,loadsAllTime,lastLoadedAt,recommendation"
  )
  assert.equal(
    lines[1],
    "example,C:\\skills\\example\\SKILL.md,,active,2,5,9,2026-08-01T00:00:00.000Z,keep"
  )
})

test("escapes quotes and commas in cell values", () => {
  const csv = buildSkillPulseCsv(
    buildSummary([
      {
        skillPath: "C:\\weird,path\\SKILL.md",
        skillName: 'skill "quoted"',
        parentPluginKey: "plugin@market",
        effectiveStatus: "active",
        loads7d: 0,
        loads30d: 0,
        loadsAllTime: 0,
        lastLoadedAt: undefined,
        recommendation: "insufficient-data",
      },
    ])
  )

  const dataLine = csv.split("\r\n")[1] ?? ""
  assert.ok(dataLine.includes('"skill ""quoted"""'))
  assert.ok(dataLine.includes('"C:\\weird,path\\SKILL.md"'))
})
