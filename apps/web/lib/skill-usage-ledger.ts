/**
 * Permanent skill-usage scoreboard.
 *
 * Why this exists: the event log rotates (5,000 events trigger an archive, the
 * active file keeps the newest 2,500). So reading counts from the event log
 * only ever tells you about the recent window - a skill used heavily six months
 * ago would read as "never used", which is exactly the false signal that leads
 * to deleting something still in demand.
 *
 * This ledger is the durable source of truth for counts:
 *
 *   - `total` is MONOTONIC. It only ever increases, so deleting event files,
 *     archives, or transcripts can never reduce a counter.
 *   - counts are keyed by skill NAME, so they survive plugin-cache path changes
 *     (…/cache/openai-curated/<version>/skills/<name>/SKILL.md).
 *   - `days` keeps per-day buckets for a bounded window so 7/30/90-day windows
 *     stay answerable without the raw events.
 *
 * Updating is incremental and idempotent: we fold in only the bytes of the
 * event log not yet counted, tracked by byte offset plus a head hash that
 * detects rotation. A rotation moves already-counted events, so on rotation we
 * skip to the end rather than recount.
 *
 * Runner note: this module imports only Node builtins, so the headless scanner
 * can run it directly under `node --experimental-strip-types`.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs"
import path from "node:path"

import type { SkillPulseEvent } from "./skillpulse"

/**
 * Kept local rather than imported from skillpulse.ts: a value import would need
 * a runtime module edge, and the ledger is deliberately standalone so the
 * headless scanner can load it without pulling in the whole sync pipeline.
 * Legacy events predate the harness field and belong to Codex.
 */
function harnessOf(event: SkillPulseEvent) {
  return event.harness ?? "codex"
}

export type LedgerHarnessRollup = {
  firstEventAt?: string
  lastEventAt?: string
  eventCount: number
}

export type LedgerSkillRollup = {
  skillName: string
  /** All-time count. Monotonic - never recomputed downward. */
  total: number
  firstUsedAt?: string
  lastUsedAt?: string
  byHarness: Record<string, number>
  /** "YYYY-MM-DD" -> count, retained for DAY_RETENTION_DAYS. */
  days: Record<string, number>
}

export type SkillUsageLedger = {
  version: 1
  updatedAt: string
  firstCaptureAt?: string
  /** Bytes of the active event log already folded into these counters. */
  countedThroughBytes: number
  /** First-line hash of the active event log, to detect rotation. */
  eventsFileHeadHash?: string
  harnesses: Record<string, LedgerHarnessRollup>
  skills: Record<string, LedgerSkillRollup>
}

const LEDGER_FILE_NAME = "usage-ledger.json"
const EVENTS_FILE_NAME = "events.jsonl"
const ARCHIVE_PREFIX = "events.archived-"
/**
 * Day buckets are only needed for the 90-day window, so 120 days gives headroom
 * while keeping the ledger tiny regardless of how long the machine has run.
 */
export const DAY_RETENTION_DAYS = 120

export function getSkillUsageLedgerPath(skillPulseDir: string) {
  return path.join(skillPulseDir, LEDGER_FILE_NAME)
}

export function createEmptyLedger(): SkillUsageLedger {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    countedThroughBytes: 0,
    harnesses: {},
    skills: {},
  }
}

export function readSkillUsageLedger(skillPulseDir: string): SkillUsageLedger {
  const ledgerPath = getSkillUsageLedgerPath(skillPulseDir)

  if (!existsSync(ledgerPath)) {
    return createEmptyLedger()
  }

  try {
    const parsed = JSON.parse(readFileSync(ledgerPath, "utf8")) as SkillUsageLedger

    if (parsed?.version !== 1 || typeof parsed.skills !== "object" || parsed.skills === null) {
      return createEmptyLedger()
    }

    return {
      ...createEmptyLedger(),
      ...parsed,
      harnesses: parsed.harnesses ?? {},
      skills: parsed.skills ?? {},
    }
  } catch {
    return createEmptyLedger()
  }
}

export function writeSkillUsageLedger(skillPulseDir: string, ledger: SkillUsageLedger) {
  mkdirSync(skillPulseDir, { recursive: true })
  // BOM-free on purpose: a UTF-8 BOM makes Node's JSON.parse throw, and the
  // skills CLI resets any registry it cannot parse.
  writeFileSync(
    getSkillUsageLedgerPath(skillPulseDir),
    `${JSON.stringify(ledger, null, 2)}\n`,
    { encoding: "utf8" }
  )
}

function dayKey(iso: string) {
  const date = new Date(iso)

  if (Number.isNaN(date.getTime())) {
    return null
  }

  return date.toISOString().slice(0, 10)
}

function skillKeyForEvent(event: SkillPulseEvent) {
  return event.skillName.trim().toLowerCase()
}

export function foldEventsIntoLedger(ledger: SkillUsageLedger, events: SkillPulseEvent[]) {
  for (const event of events) {
    const key = skillKeyForEvent(event)

    if (!key) {
      continue
    }

    const harness = harnessOf(event)
    const skill = ledger.skills[key] ?? {
      skillName: event.skillName,
      total: 0,
      byHarness: {},
      days: {},
    }

    skill.total += 1
    skill.byHarness[harness] = (skill.byHarness[harness] ?? 0) + 1

    if (!skill.firstUsedAt || event.occurredAt < skill.firstUsedAt) {
      skill.firstUsedAt = event.occurredAt
    }

    if (!skill.lastUsedAt || event.occurredAt > skill.lastUsedAt) {
      skill.lastUsedAt = event.occurredAt
    }

    const day = dayKey(event.occurredAt)

    if (day) {
      skill.days[day] = (skill.days[day] ?? 0) + 1
    }

    ledger.skills[key] = skill

    const harnessRollup = ledger.harnesses[harness] ?? { eventCount: 0 }
    harnessRollup.eventCount += 1

    if (!harnessRollup.firstEventAt || event.occurredAt < harnessRollup.firstEventAt) {
      harnessRollup.firstEventAt = event.occurredAt
    }

    if (!harnessRollup.lastEventAt || event.occurredAt > harnessRollup.lastEventAt) {
      harnessRollup.lastEventAt = event.occurredAt
    }

    ledger.harnesses[harness] = harnessRollup

    if (!ledger.firstCaptureAt || event.occurredAt < ledger.firstCaptureAt) {
      ledger.firstCaptureAt = event.occurredAt
    }
  }
}

export function pruneLedgerDays(ledger: SkillUsageLedger, now = new Date(), keepDays = DAY_RETENTION_DAYS) {
  const cutoff = new Date(now.getTime() - keepDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  for (const skill of Object.values(ledger.skills)) {
    for (const day of Object.keys(skill.days)) {
      if (day < cutoff) {
        delete skill.days[day]
      }
    }
  }
}

function headHashOfFirstLine(text: string) {
  const newlineIndex = text.indexOf("\n")

  if (newlineIndex < 0) {
    return ""
  }

  return text.slice(0, newlineIndex).slice(0, 512)
}

/**
 * Fold newly-appended events into the ledger.
 *
 * Incremental by byte offset, so this is O(new bytes) and can be run as often
 * as you like. `prune` keeps the day buckets bounded.
 */
export function updateSkillUsageLedger({
  skillPulseDir,
  now = new Date(),
}: {
  skillPulseDir: string
  now?: Date
}): { addedEvents: number; skills: number; harnesses: string[] } {
  const ledger = readSkillUsageLedger(skillPulseDir)
  const eventsPath = path.join(skillPulseDir, EVENTS_FILE_NAME)

  if (!existsSync(eventsPath)) {
    ledger.updatedAt = now.toISOString()
    pruneLedgerDays(ledger, now)
    writeSkillUsageLedger(skillPulseDir, ledger)
    return { addedEvents: 0, skills: Object.keys(ledger.skills).length, harnesses: Object.keys(ledger.harnesses) }
  }

  const size = statSync(eventsPath).size
  const text = readFileSync(eventsPath, "utf8")
  const headHash = headHashOfFirstLine(text)

  // Rotation rewrites the active log with the newest events, all of which were
  // already folded in. Detecting a changed head therefore means "skip to end",
  // never "recount from zero".
  const rotated =
    ledger.eventsFileHeadHash !== undefined &&
    ledger.eventsFileHeadHash !== "" &&
    headHash !== "" &&
    ledger.eventsFileHeadHash !== headHash

  if (rotated || size < ledger.countedThroughBytes) {
    // Only advance past complete lines.
    const lastNewline = text.lastIndexOf("\n")
    ledger.countedThroughBytes = lastNewline < 0 ? 0 : lastNewline + 1
  }

  let addedEvents = 0

  if (size > ledger.countedThroughBytes) {
    const tail = text.slice(ledger.countedThroughBytes)
    const lastNewline = tail.lastIndexOf("\n")

    if (lastNewline >= 0) {
      const complete = tail.slice(0, lastNewline)
      const parsed: SkillPulseEvent[] = []

      for (const line of complete.split("\n")) {
        if (!line.trim()) {
          continue
        }

        try {
          const event = JSON.parse(line) as SkillPulseEvent

          if (event && typeof event.id === "string" && typeof event.skillName === "string") {
            parsed.push(event)
          }
        } catch {
          // A malformed line is skipped rather than aborting the whole fold.
        }
      }

      foldEventsIntoLedger(ledger, parsed)
      addedEvents = parsed.length
      ledger.countedThroughBytes += lastNewline + 1
    }
  }

  ledger.eventsFileHeadHash = headHash
  ledger.updatedAt = now.toISOString()
  pruneLedgerDays(ledger, now)
  writeSkillUsageLedger(skillPulseDir, ledger)

  return {
    addedEvents,
    skills: Object.keys(ledger.skills).length,
    harnesses: Object.keys(ledger.harnesses),
  }
}

/**
 * Repair path: recompute the ledger from every event still on disk (active log
 * plus archives).
 *
 * This is authoritative rather than additive: it dedupes by event id, because
 * archives can overlap (a rotation copies events that may also be present in an
 * older archive), and without dedup each skill's total inflates by the number
 * of copies on disk.
 *
 * Incremental updates remain monotonic; only this explicit rebuild can lower a
 * count, and only because it is re-deriving from source.
 */
export function rebuildSkillUsageLedger(skillPulseDir: string, now = new Date()) {
  const files = readdirSync(skillPulseDir).filter(
    (name) => name === EVENTS_FILE_NAME || name.startsWith(ARCHIVE_PREFIX)
  )
  const derived = createEmptyLedger()
  const seenIds = new Set<string>()

  for (const file of files) {
    const text = readFileSync(path.join(skillPulseDir, file), "utf8")

    for (const line of text.split("\n")) {
      if (!line.trim()) {
        continue
      }

      try {
        const event = JSON.parse(line) as SkillPulseEvent

        if (!event || typeof event.id !== "string" || typeof event.skillName !== "string") {
          continue
        }

        if (seenIds.has(event.id)) {
          continue
        }

        seenIds.add(event.id)
        foldEventsIntoLedger(derived, [event])
      } catch {
        // ignore malformed lines
      }
    }
  }

  derived.updatedAt = now.toISOString()

  // Monotonic merge against the existing ledger.
  //
  // Two separate safety properties are needed, and they are easy to conflate:
  //   - id dedup above stops archives that OVERLAP from inflating a total
  //   - this max() stops pruned or deleted archives from DEFLATING one
  // Without the max, pruning the archive files (which keeps disk bounded) would
  // let a rebuild produce a smaller total than the ledger already holds, and the
  // whole point of the ledger is that a count never goes down.
  const previous = readSkillUsageLedger(skillPulseDir)

  for (const [key, previousSkill] of Object.entries(previous.skills)) {
    const next = derived.skills[key]

    if (!next) {
      // No longer derivable from disk, but it was counted, so it stays counted.
      derived.skills[key] = previousSkill
      continue
    }

    next.total = Math.max(next.total, previousSkill.total)

    for (const [harness, count] of Object.entries(previousSkill.byHarness)) {
      next.byHarness[harness] = Math.max(next.byHarness[harness] ?? 0, count)
    }

    if (
      previousSkill.lastUsedAt &&
      (!next.lastUsedAt || previousSkill.lastUsedAt > next.lastUsedAt)
    ) {
      next.lastUsedAt = previousSkill.lastUsedAt
    }

    if (
      previousSkill.firstUsedAt &&
      (!next.firstUsedAt || previousSkill.firstUsedAt < next.firstUsedAt)
    ) {
      next.firstUsedAt = previousSkill.firstUsedAt
    }
  }

  // Recompute the per-harness rollup from the merged per-skill counts so the
  // "tools covered" totals always agree with the per-row breakdown the UI shows.
  //
  // After a rebuild against pruned archives a skill's `total` can be slightly
  // higher than the sum of its per-harness counts: `total` is preserved
  // monotonically, while per-harness figures can only be maxed individually.
  // Rolling up from the per-harness numbers keeps the harness view self-consistent.
  const harnessTotals: Record<string, number> = {}

  for (const skill of Object.values(derived.skills)) {
    for (const [harness, count] of Object.entries(skill.byHarness)) {
      harnessTotals[harness] = (harnessTotals[harness] ?? 0) + count
    }
  }

  for (const [harness, total] of Object.entries(harnessTotals)) {
    const rollup = derived.harnesses[harness] ?? { eventCount: 0 }
    rollup.eventCount = total
    derived.harnesses[harness] = rollup
  }

  // Critically, mark the active event log as already folded. Without this the
  // next incremental run would start from byte 0 and double every counter.
  const eventsPath = path.join(skillPulseDir, EVENTS_FILE_NAME)

  if (existsSync(eventsPath)) {
    const activeText = readFileSync(eventsPath, "utf8")
    const lastNewline = activeText.lastIndexOf("\n")
    derived.countedThroughBytes = lastNewline < 0 ? 0 : lastNewline + 1
    derived.eventsFileHeadHash = headHashOfFirstLine(activeText)
  }

  pruneLedgerDays(derived, now)
  writeSkillUsageLedger(skillPulseDir, derived)

  return {
    files: files.length,
    uniqueEvents: seenIds.size,
    skills: Object.keys(derived.skills).length,
    harnesses: Object.keys(derived.harnesses),
  }
}

export function sumLedgerDays(skill: LedgerSkillRollup, sinceIso: string) {
  let count = 0

  for (const [day, value] of Object.entries(skill.days)) {
    if (day >= sinceIso.slice(0, 10)) {
      count += value
    }
  }

  return count
}
