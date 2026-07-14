import assert from "node:assert/strict"
import test from "node:test"

import type { SkillPulseSummaryResponse } from "./skillpulse.ts"
import {
  getUsageFilterDescription,
  matchesUsageFilter,
} from "./usage-filter.ts"

type UsageSkill = SkillPulseSummaryResponse["skills"][number]

function createUsageSkill(overrides: Partial<UsageSkill> = {}): UsageSkill {
  return {
    skillPath: "C:\\skills\\example\\SKILL.md",
    skillName: "example",
    effectiveStatus: "active",
    loads7d: 0,
    loads30d: 0,
    loadsAllTime: 0,
    recommendation: "disable-candidate",
    ...overrides,
  }
}

test("matches factual unused windows without including disabled skills", () => {
  const activeUnused = createUsageSkill()
  const activeUsed = createUsageSkill({
    loads7d: 1,
    loads30d: 4,
    loadsAllTime: 9,
  })
  const disabledUnused = createUsageSkill({
    effectiveStatus: "disabled-by-skill",
  })

  assert.equal(matchesUsageFilter(activeUnused, "7d"), true)
  assert.equal(matchesUsageFilter(activeUsed, "7d"), false)
  assert.equal(matchesUsageFilter(disabledUnused, "7d"), false)
  assert.equal(matchesUsageFilter(disabledUnused, "all"), true)
})

test("distinguishes never-observed skills from skills unused for ninety days", () => {
  const now = new Date("2026-07-14T00:00:00.000Z").getTime()
  const neverObserved = createUsageSkill()
  const oldUsage = createUsageSkill({
    loadsAllTime: 3,
    lastLoadedAt: "2026-03-01T00:00:00.000Z",
  })
  const recentUsage = createUsageSkill({
    loadsAllTime: 3,
    lastLoadedAt: "2026-07-01T00:00:00.000Z",
  })

  assert.equal(matchesUsageFilter(neverObserved, "never", now), true)
  assert.equal(matchesUsageFilter(oldUsage, "never", now), false)
  assert.equal(matchesUsageFilter(oldUsage, "90d", now), true)
  assert.equal(matchesUsageFilter(recentUsage, "90d", now), false)
})

test("describes every filter with the selected time window", () => {
  assert.match(getUsageFilterDescription("7d"), /7 days/)
  assert.match(getUsageFilterDescription("30d"), /30 days/)
  assert.match(getUsageFilterDescription("90d"), /90 days/)
  assert.match(getUsageFilterDescription("never"), /never/)
  assert.match(getUsageFilterDescription("all"), /every tracked skill/)
})
