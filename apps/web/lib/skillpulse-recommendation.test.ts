import assert from "node:assert/strict"
import test from "node:test"

import type { ManagedSkill } from "./skills.ts"
import { getRecommendation } from "./skillpulse.ts"

function skill(overrides: Partial<ManagedSkill> = {}): ManagedSkill {
  return {
    id: "skill:example",
    detailId: "example",
    name: "example",
    description: "",
    source: "agents",
    path: "C:\\Users\\User\\.agents\\skills\\example\\SKILL.md",
    relativePath: "example/SKILL.md",
    status: "active",
    effectiveStatus: "active",
    statusReason: "",
    editable: true,
    origin: "skill",
    controlGate: "none",
    ...overrides,
  } as ManagedSkill
}

const mature = { dataCoverageDays: 200 }

test("a newly installed skill is never called unused", () => {
  // The live bug this guards against: emil-design-eng (4 days old, zero uses)
  // was being surfaced as a disable candidate.
  const result = getRecommendation({
    skill: skill(),
    loadsAllTime: 0,
    daysSinceLastUse: null,
    ageDays: 4,
    ...mature,
  })

  assert.equal(result, "insufficient-data")
})

test("threejs-style skills at 30 days old are still protected", () => {
  const result = getRecommendation({
    skill: skill(),
    loadsAllTime: 0,
    daysSinceLastUse: null,
    ageDays: 30,
    ...mature,
  })

  assert.equal(result, "insufficient-data")
})

test("a mature skill that was never adopted is a candidate", () => {
  const result = getRecommendation({
    skill: skill(),
    loadsAllTime: 0,
    daysSinceLastUse: null,
    ageDays: 155,
    ...mature,
  })

  assert.equal(result, "disable-candidate")
})

test("low total but recent use is kept", () => {
  // router has 3 uses but was used yesterday - low adoption is not evidence.
  const result = getRecommendation({
    skill: skill(),
    loadsAllTime: 3,
    daysSinceLastUse: 1,
    ageDays: 168,
    ...mature,
  })

  assert.equal(result, "keep")
})

test("a heavily used but idle skill is kept", () => {
  // docker-vps-2026 has 88 uses and was idle 41 days. Idleness is a lull here,
  // not a signal.
  const result = getRecommendation({
    skill: skill(),
    loadsAllTime: 88,
    daysSinceLastUse: 41,
    ageDays: 168,
    ...mature,
  })

  assert.equal(result, "keep")
})

test("a mature, lightly used, idle skill is a candidate", () => {
  const result = getRecommendation({
    skill: skill(),
    loadsAllTime: 2,
    daysSinceLastUse: 40,
    ageDays: 155,
    ...mature,
  })

  assert.equal(result, "disable-candidate")
})

test("disabled skills are never candidates", () => {
  const result = getRecommendation({
    skill: skill({ effectiveStatus: "disabled-by-skill" }),
    loadsAllTime: 0,
    daysSinceLastUse: null,
    ageDays: 400,
    ...mature,
  })

  assert.equal(result, "keep")
})

test("insufficient recorded history overrides everything", () => {
  const result = getRecommendation({
    skill: skill(),
    loadsAllTime: 0,
    daysSinceLastUse: null,
    ageDays: 400,
    dataCoverageDays: 3,
  })

  assert.equal(result, "insufficient-data")
})

test("an unknown install date does not block candidacy", () => {
  // 5 skills have no install date; they fall back to the folder date, and if
  // even that is missing we cannot claim the skill is new, so it stays judgeable.
  const result = getRecommendation({
    skill: skill(),
    loadsAllTime: 0,
    daysSinceLastUse: null,
    ageDays: undefined,
    ...mature,
  })

  assert.equal(result, "disable-candidate")
})

test("proven usage outranks the maturity gate", () => {
  // better-accessibility only has an estimated folder date of ~39 days, so the
  // maturity gate would call it new despite 78 recorded uses.
  const result = getRecommendation({
    skill: skill(),
    loadsAllTime: 78,
    daysSinceLastUse: 2,
    ageDays: 39,
    ...mature,
  })

  assert.equal(result, "keep")
})

test("an estimated folder date still protects a low-use recent skill", () => {
  // Exempting estimated dates outright was worse: it un-protected recently
  // added plugin skills, taking disable-candidates from 28 to 100.
  const result = getRecommendation({
    skill: skill(),
    loadsAllTime: 4,
    daysSinceLastUse: 45,
    ageDays: 39,
    ...mature,
  })

  assert.equal(result, "insufficient-data")
})

test("a registry date still protects a genuinely new skill", () => {
  const result = getRecommendation({
    skill: skill(),
    loadsAllTime: 0,
    daysSinceLastUse: null,
    ageDays: 3,
    ...mature,
  })

  assert.equal(result, "insufficient-data")
})
