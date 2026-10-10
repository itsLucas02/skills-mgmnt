import {
  appendFileSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { createHash } from "node:crypto"
import { homedir } from "node:os"
import path from "node:path"
import { StringDecoder } from "node:string_decoder"

import type { ManagedSkill } from "./skills"
import { readSkillUsageLedger, sumLedgerDays, type SkillUsageLedger } from "./skill-usage-ledger.ts"
import { readSkillInstallDates, type SkillInstallDate } from "./skill-install-dates.ts"
import { IDLE_DAYS, PROVEN_VALUE_USES, SKILL_MATURITY_DAYS } from "./skill-maturity.ts"

export type SkillPulseEvent = {
  id: string
  occurredAt: string
  skillName: string
  /** Which agent harness recorded the invocation. Absent on legacy events = "codex". */
  harness?: string
  /** Absolute path to the skill's SKILL.md, when the source reveals one. */
  skillPath?: string
  sessionId?: string
  sessionFile?: string
  parentPluginKey?: string
  source: string
}

export const DEFAULT_HARNESS = "codex"

/** Display names only. The adapters own collection; this avoids a runtime import. */
const HARNESS_DISPLAY_LABELS: Record<string, string> = {
  codex: "Codex CLI",
  "claude-code": "Claude Code",
  commandcode: "CommandCode",
  opencode: "opencode",
}

export function getEventHarness(event: SkillPulseEvent) {
  return event.harness ?? DEFAULT_HARNESS
}

export type SkillPulseSyncMode = "incremental" | "backfill-all"

export type SkillPulseSyncResult = {
  mode: SkillPulseSyncMode
  syncedAt: string
  processedFileCount: number
  scannedLineCount: number
  newEventCount: number
  totalEventCount: number
}

export type SkillPulseHarnessCoverage = {
  harness: string
  label: string
  eventCount: number
  firstEventAt?: string
  lastEventAt?: string
}

export type SkillPulseSummaryResponse = {
  status: {
    lastSyncAt?: string
    firstEventAt?: string
    lastEventAt?: string
    dataCoverageDays: number
    /** Per-harness capture evidence, so "unused" can be judged against what is actually covered. */
    harnesses: SkillPulseHarnessCoverage[]
    /** When the permanent ledger last folded new events in. */
    ledgerUpdatedAt?: string
  }
  totals: {
    totalEvents: number
    loadedSkillCount: number
    disableCandidateCount: number
  }
  skills: SkillPulseSkillUsage[]
}

export type SkillPulseSkillUsage = {
  skillPath: string
  skillName: string
  parentPluginKey?: string
  effectiveStatus: ManagedSkill["effectiveStatus"]
  loads7d: number
  loads30d: number
  loads90d: number
  loadsAllTime: number
  lastLoadedAt?: string
  /** When the skill was installed, and how trustworthy that date is. */
  installedAt?: string
  installDateSource?: "registry" | "folder" | "unknown"
  /** Whole days since install. Undefined when no date could be established. */
  ageDays?: number
  /** Whole days since the last recorded use. Null when never observed. */
  daysSinceLastUse: number | null
  /** Which agent harnesses invoked this skill, and how often. */
  byHarness: Record<string, number>
  recommendation: "keep" | "disable-candidate" | "insufficient-data"
}

type SkillPulseOffsetState = {
  files: Record<
    string,
    {
      size: number
      mtimeMs: number
      /**
       * Absolute line count already scanned. Needed so a resumed scan keeps the
       * same line numbers as a full scan - event ids fall back to the line
       * number when a session line carries no call id, and a shifted number
       * would produce a duplicate instead of a dedup hit.
       */
      lines?: number
    }
  >
  lastSyncAt?: string
}

const HOME = homedir()
const CODEX_HOME = process.env.CODEX_HOME ?? path.join(HOME, ".codex")
const SKILLPULSE_DIR_NAME = "skillpulse"
const EVENTS_FILE_NAME = "events.jsonl"
const OFFSETS_FILE_NAME = "offsets.json"
const SETTINGS_FILE_NAME = "settings.json"
const SESSION_READ_CHUNK_BYTES = 1024 * 1024
const MAX_SESSION_LINE_CHARS = 16 * 1024 * 1024
/**
 * How many archived event logs to keep. Every rotation writes ~1.4 MB and nothing
 * ever removed them, so this bounds disk growth. Safe to prune because the
 * permanent usage ledger holds the counts, and the ledger rebuild is monotonic
 * (see rebuildSkillUsageLedger), so it can never lower a total from missing files.
 */
const ARCHIVE_KEEP_COUNT = 3

export function syncSkillPulseUsage({
  codexHome = CODEX_HOME,
  mode,
  now = new Date(),
}: {
  codexHome?: string
  mode: SkillPulseSyncMode
  now?: Date
}): SkillPulseSyncResult {
  ensureSkillPulseDir(codexHome)

  const syncedAt = now.toISOString()
  const seenEventIds = readSeenEventIds(codexHome)
  const state = mode === "backfill-all" ? createEmptyOffsetState() : readOffsetState(codexHome)
  const sessionFiles = getSessionFiles(codexHome)
  const newEvents: SkillPulseEvent[] = []
  let processedFileCount = 0
  let scannedLineCount = 0

  for (const sessionFile of sessionFiles) {
    const stats = statSync(sessionFile)
    const previousFileState = state.files[sessionFile]

    if (
      mode === "incremental" &&
      previousFileState &&
      previousFileState.size === stats.size &&
      previousFileState.mtimeMs === stats.mtimeMs
    ) {
      continue
    }

    processedFileCount += 1
    const sessionId = getSessionIdFromFile(sessionFile)

  // Byte-offset resume. A session log is appended to while you work, and the
  // largest on this machine is over 600 MB - re-reading it from the start to
  // find one new line is the single biggest waste in the scan. Resume only
  // when the file strictly grew; a shrink or rewrite means start over.
  //
  // Files with no recorded line count yet simply take one full pass, which then
  // records it. That self-heals exactly where it matters: an unchanged file is
  // skipped entirely and never needs resume, while an actively appended file
  // pays one full read and then resumes from there on.
  const canResume =
      mode === "incremental" &&
      previousFileState !== undefined &&
      stats.size > previousFileState.size &&
      previousFileState.lines !== undefined

    const startOffset = canResume ? previousFileState.size : 0
    const startLineNumber = canResume ? previousFileState.lines ?? 0 : 0

    const totalLines = scanSessionFileLines(
      sessionFile,
      (line, lineNumber) => {
        if (!line.trim()) {
          return
        }

        scannedLineCount += 1
        const extractedEvents = extractSkillPulseEventsFromSessionLine(line, {
          sessionFile,
          sessionId,
          fallbackLineId: lineNumber,
        })

        for (const event of extractedEvents) {
          if (!seenEventIds.has(event.id)) {
            seenEventIds.add(event.id)
            newEvents.push(event)
          }
        }
      },
      { startOffset, startLineNumber }
    )

    state.files[sessionFile] = {
      size: stats.size,
      mtimeMs: stats.mtimeMs,
      lines: totalLines,
    }
  }

  const appended = appendSkillPulseEvents(newEvents, codexHome)

  // Prune on every sync rather than only on rotation: rotation needs 5,000 new
  // events, so archives accumulated from earlier runs would otherwise sit there
  // indefinitely. Pruning is a directory read plus a few unlinks.
  pruneArchivedEvents(codexHome)

  state.lastSyncAt = syncedAt
  writeJson(getOffsetsPath(codexHome), state)

  return {
    mode,
    syncedAt,
    processedFileCount,
    scannedLineCount,
    newEventCount: appended.addedCount,
    totalEventCount: appended.totalEventCount,
  }
}

/**
 * Single writer for the event log, shared by every harness adapter so dedup,
 * append and rotation behave identically no matter which source produced the
 * events. Dedup is by event id, which each adapter derives from stable source
 * fields, so re-ingesting the same transcript cannot double-count.
 */
export function appendSkillPulseEvents(
  events: SkillPulseEvent[],
  codexHome = CODEX_HOME
): { addedCount: number; totalEventCount: number; events: SkillPulseEvent[] } {
  if (!events.length) {
    return { addedCount: 0, totalEventCount: countSkillPulseEvents(codexHome), events: [] }
  }

  const seen = readSeenEventIds(codexHome)
  const fresh: SkillPulseEvent[] = []

  for (const event of events) {
    if (seen.has(event.id)) {
      continue
    }

    seen.add(event.id)
    fresh.push(event)
  }

  if (fresh.length) {
    ensureSkillPulseDir(codexHome)
    appendFileSync(
      getEventsPath(codexHome),
      `${fresh.map((event) => JSON.stringify(event)).join("\n")}\n`,
      "utf8"
    )
  }

  const totalEventCount = rotateEventsFileIfNeeded(codexHome, countSkillPulseEvents(codexHome))

  return { addedCount: fresh.length, totalEventCount, events: fresh }
}

const MAX_EVENTS_BEFORE_ROTATION = 5000
const ROTATION_KEPT_EVENTS = 2500
const ROTATION_ARCHIVE_PREFIX = "events.archived-"

function countSkillPulseEvents(codexHome: string) {
  const eventsPath = getEventsPath(codexHome)

  if (!existsSync(eventsPath)) {
    return 0
  }

  let count = 0

  for (const line of readFileSync(eventsPath, "utf8").split(/\r?\n/)) {
    if (line.trim()) {
      count += 1
    }
  }

  return count
}

function readSeenEventIds(codexHome: string) {
  const eventsPath = getEventsPath(codexHome)

  if (!existsSync(eventsPath)) {
    return new Set<string>()
  }

  const ids = new Set<string>()

  for (const line of readFileSync(eventsPath, "utf8").split(/\r?\n/)) {
    if (!line.trim()) {
      continue
    }

    const parsed = parseJsonObject(line)
    if (typeof parsed?.id === "string") {
      ids.add(parsed.id)
    }
  }

  return ids
}

function rotateEventsFileIfNeeded(codexHome: string, totalEventCount: number) {
  if (totalEventCount < MAX_EVENTS_BEFORE_ROTATION) {
    return totalEventCount
  }

  const eventsPath = getEventsPath(codexHome)
  const events = readSkillPulseEvents(codexHome)
  const keptEvents = events.slice(-ROTATION_KEPT_EVENTS)
  const archivedEvents = events.slice(0, events.length - keptEvents.length)
  const archivePath = path.join(
    getSkillPulseDir(codexHome),
    `${ROTATION_ARCHIVE_PREFIX}${new Date().toISOString().replace(/[:.]/g, "-")}.jsonl`
  )

  writeFileSync(archivePath, `${archivedEvents.map((event) => JSON.stringify(event)).join("\n")}\n`, "utf8")
  writeFileSync(eventsPath, keptEvents.length ? `${keptEvents.map((event) => JSON.stringify(event)).join("\n")}\n` : "", "utf8")

  return keptEvents.length
}

/**
 * Keeps only the newest few archived event logs.
 *
 * Archives were never removed, so they grew without bound (~1.4 MB per rotation).
 * Pruning is safe now for two reasons: the permanent usage ledger holds every
 * count, and rebuildSkillUsageLedger is monotonic, so a rebuild from a pruned set
 * cannot lower a total.
 *
 * Archive names embed an ISO timestamp, so a descending name sort is newest-first.
 */
export function pruneArchivedEvents(codexHome: string, keep = ARCHIVE_KEEP_COUNT) {
  const dir = getSkillPulseDir(codexHome)
  const removed: string[] = []

  try {
    const archives = readdirSync(dir)
      .filter((name) => name.startsWith(ROTATION_ARCHIVE_PREFIX))
      .sort()
      .reverse()

    for (const name of archives.slice(keep)) {
      try {
        rmSync(path.join(dir, name), { force: true })
        removed.push(name)
      } catch {
        // A file we cannot delete is not worth failing the scan over.
      }
    }
  } catch {
    // Missing directory simply means nothing to prune.
  }

  return removed
}

export function getSkillPulseSummary({
  skills,
  codexHome = CODEX_HOME,
  now = new Date(),
}: {
  skills: ManagedSkill[]
  codexHome?: string
  now?: Date
}): SkillPulseSummaryResponse {
  const events = readSkillPulseEvents(codexHome)
  const offsetState = readOffsetState(codexHome)
  const { skillPulseDir } = getSkillPulsePaths(codexHome)

  return aggregateSkillPulseUsage({
    skills,
    events,
    now,
    firstEventAt: getFirstEventAt(events),
    lastSyncAt: offsetState.lastSyncAt,
    ledger: readSkillUsageLedger(skillPulseDir),
    installDates: readSkillInstallDates(skills, { now }),
  })
}

export function aggregateSkillPulseUsage({
  skills,
  events,
  now = new Date(),
  firstEventAt,
  lastSyncAt,
  ledger,
  installDates,
}: {
  skills: ManagedSkill[]
  events: SkillPulseEvent[]
  now?: Date
  firstEventAt?: string
  lastSyncAt?: string
  ledger?: SkillUsageLedger
  installDates?: Record<string, SkillInstallDate>
}): SkillPulseSummaryResponse {
  const sevenDaysAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000
  const thirtyDaysAgo = now.getTime() - 30 * 24 * 60 * 60 * 1000
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString()
  const sevenDaysAgoIso = new Date(sevenDaysAgo).toISOString()
  const thirtyDaysAgoIso = new Date(thirtyDaysAgo).toISOString()
  const dataCoverageDays = firstEventAt
    ? Math.floor((now.getTime() - new Date(firstEventAt).getTime()) / (24 * 60 * 60 * 1000))
    : 0
  const bySkillPath = new Map<string, SkillPulseEvent[]>()
  const byStableSkillKey = new Map<string, SkillPulseEvent[]>()

  for (const event of events) {
    // Harnesses such as Claude Code and opencode record a skill NAME with no
    // path, so fall back to a name key rather than dropping the event.
    const key = event.skillPath
      ? normalizePath(event.skillPath)
      : `name:${event.skillName.toLowerCase()}`
    const pathEvents = bySkillPath.get(key)

    if (pathEvents) {
      pathEvents.push(event)
    } else {
      bySkillPath.set(key, [event])
    }

    const stableKey = event.skillPath
      ? getStableSkillUsageKey(event.skillPath, event.skillName)
      : null

    if (stableKey) {
      const stableEvents = byStableSkillKey.get(stableKey)

      if (stableEvents) {
        stableEvents.push(event)
      } else {
        byStableSkillKey.set(stableKey, [event])
      }
    }
  }

  const usage = getUniqueSkillPulseSkills(skills).map((skill) => {
    const exactEvents = bySkillPath.get(normalizePath(skill.path)) ?? bySkillPath.get(`name:${skill.name.toLowerCase()}`) ?? []
    const stableSkillKey = getStableSkillUsageKey(skill.path, skill.name)
    const stableEvents = stableSkillKey ? byStableSkillKey.get(stableSkillKey) ?? [] : []
    const skillEvents = stableSkillKey ? stableEvents : exactEvents
    const eventTimes = skillEvents.map((event) => new Date(event.occurredAt).getTime())

    // The permanent ledger is authoritative for lifetime and 7/30/90-day counts.
    // The event log rotates down to a recent window, so reading counts from it
    // alone makes historically-used skills look unused.
    const ledgerSkill = ledger?.skills[skill.name.toLowerCase()]
    const loads7d = ledgerSkill
      ? sumLedgerDays(ledgerSkill, sevenDaysAgoIso)
      : eventTimes.filter((time) => time >= sevenDaysAgo).length
    const loads30d = ledgerSkill
      ? sumLedgerDays(ledgerSkill, thirtyDaysAgoIso)
      : eventTimes.filter((time) => time >= thirtyDaysAgo).length
    const loads90d = ledgerSkill
      ? sumLedgerDays(ledgerSkill, ninetyDaysAgo)
      : eventTimes.filter((time) => time >= now.getTime() - 90 * 24 * 60 * 60 * 1000).length
    const loadsAllTime = ledgerSkill ? ledgerSkill.total : skillEvents.length
    const lastLoadedAt = ledgerSkill?.lastUsedAt
      ? ledgerSkill.lastUsedAt
      : eventTimes.length
        ? new Date(Math.max(...eventTimes)).toISOString()
        : undefined
    const daysSinceLastUse = lastLoadedAt
      ? Math.max(0, Math.floor((now.getTime() - new Date(lastLoadedAt).getTime()) / (24 * 60 * 60 * 1000)))
      : null
    const install = installDates?.[skill.name]
    const recommendation = getRecommendation({
      skill,
      loadsAllTime,
      daysSinceLastUse,
      ageDays: install?.ageDays,
      dataCoverageDays,
    })

    return {
      skillPath: skill.path,
      skillName: skill.name,
      parentPluginKey: skill.parentPluginKey,
      effectiveStatus: skill.effectiveStatus,
      loads7d,
      loads30d,
      loads90d,
      loadsAllTime,
      lastLoadedAt,
      installedAt: install?.installedAt,
      installDateSource: install?.source,
      ageDays: install?.ageDays,
      daysSinceLastUse,
      byHarness: ledgerSkill?.byHarness ?? {},
      recommendation,
    } satisfies SkillPulseSkillUsage
  }).sort((left, right) =>
    right.loads7d - left.loads7d ||
    right.loads30d - left.loads30d ||
    right.loadsAllTime - left.loadsAllTime ||
    left.skillName.localeCompare(right.skillName)
  )

  const harnessCoverage: SkillPulseHarnessCoverage[] = ledger
    ? Object.entries(ledger.harnesses)
        .map(([harness, rollup]) => ({
          harness,
          label: HARNESS_DISPLAY_LABELS[harness] ?? harness,
          eventCount: rollup.eventCount,
          firstEventAt: rollup.firstEventAt,
          lastEventAt: rollup.lastEventAt,
        }))
        .sort((left, right) => right.eventCount - left.eventCount)
    : []

  return {
    status: {
      lastSyncAt,
      firstEventAt,
      lastEventAt: getLastEventAt(events),
      dataCoverageDays,
      harnesses: harnessCoverage,
      ledgerUpdatedAt: ledger?.updatedAt,
    },
    totals: {
      totalEvents: events.length,
      loadedSkillCount: usage.filter((skill) => skill.loadsAllTime > 0).length,
      disableCandidateCount: usage.filter((skill) => skill.recommendation === "disable-candidate").length,
    },
    skills: usage,
  }
}

export function extractSkillPulseEventsFromSessionLine(
  line: string,
  options: {
    sessionFile: string
    sessionId?: string
    fallbackLineId?: number
  }
): SkillPulseEvent[] {
  const parsed = parseJsonObject(line)
  const payload = parseJsonObject(parsed?.payload)

  if (!payload || !isSkillPulseToolEvent(payload.type)) {
    return []
  }

  const timestamp = typeof parsed?.timestamp === "string"
    ? parsed.timestamp
    : new Date().toISOString()
  // Codex changed its session schema mid-2026. Older sessions carry the command
  // under `arguments` (payload.type "function_call"); newer ones carry it under
  // `input` (payload.type "custom_tool_call"). Reading only `arguments` silently
  // dropped every invocation recorded in the newer format - which is why
  // detection collapsed after June and produced nothing at all from July on.
  const argumentsText = stringifyUnknown(payload.arguments ?? payload.input)
  const skillPaths = extractSkillPaths(argumentsText)

  return skillPaths.map((skillPath, index) => {
    const skillName = getSkillNameFromPath(skillPath)
    const sourceId = [
      options.sessionFile,
      options.sessionId ?? "",
      payload.call_id ?? payload.id ?? options.fallbackLineId ?? "",
      skillPath,
      index,
    ].join("|")

    return {
      id: hashId(sourceId),
      occurredAt: timestamp,
      harness: DEFAULT_HARNESS,
      sessionId: options.sessionId ?? getSessionIdFromFile(options.sessionFile),
      sessionFile: options.sessionFile,
      skillPath,
      skillName,
      source: "session-jsonl-skill-read",
    }
  })
}

export function readSkillPulseEvents(codexHome = CODEX_HOME): SkillPulseEvent[] {
  const eventsPath = getEventsPath(codexHome)
  if (!existsSync(eventsPath)) {
    return []
  }

  return readFileSync(eventsPath, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => parseJsonObject(line))
    .filter(isSkillPulseEvent)
}

export function getSkillPulsePaths(codexHome = CODEX_HOME) {
  const skillPulseDir = path.join(codexHome, SKILLPULSE_DIR_NAME)
  return {
    skillPulseDir,
    eventsPath: path.join(skillPulseDir, EVENTS_FILE_NAME),
    offsetsPath: path.join(skillPulseDir, OFFSETS_FILE_NAME),
    settingsPath: path.join(skillPulseDir, SETTINGS_FILE_NAME),
  }
}

/**
 * Thresholds live in a client-safe module because the dashboard imports them
 * for badges; see lib/skill-maturity.ts for the reasoning.
 */
export function getRecommendation({
  skill,
  loadsAllTime,
  daysSinceLastUse,
  ageDays,
  dataCoverageDays,
}: {
  skill: ManagedSkill
  loadsAllTime: number
  daysSinceLastUse: number | null
  ageDays: number | undefined
  dataCoverageDays: number
}): SkillPulseSkillUsage["recommendation"] {
  // Not enough recorded history to judge anything yet.
  if (dataCoverageDays < 7) {
    return "insufficient-data"
  }

  // Maturity gate. A skill installed recently cannot have demonstrated its value
  // either way, so it is never a candidate. This is what stops a day-old skill
  // with zero uses from being called unused.
  //
  // The only bypass is proven usage: a skill with a large recorded total is
  // established by definition, which matters for the handful of skills whose
  // date is only an estimate from the folder. (Exempting estimated dates outright
  // was worse - it un-protected recently added plugin skills.)
  if (
    loadsAllTime < PROVEN_VALUE_USES &&
    ageDays !== undefined &&
    ageDays < SKILL_MATURITY_DAYS
  ) {
    return "insufficient-data"
  }

  if (skill.effectiveStatus !== "active") {
    return "keep"
  }

  // Proven value. Enough recorded use that idleness is a lull, not a signal.
  if (loadsAllTime >= PROVEN_VALUE_USES) {
    return "keep"
  }

  // Never used, or not used for a while. `null` means no recorded use at all,
  // which counts as idle rather than as recent activity.
  const idle = daysSinceLastUse === null || daysSinceLastUse >= IDLE_DAYS

  return idle ? "disable-candidate" : "keep"
}

function getSessionFiles(codexHome: string) {
  const sessionsRoot = path.join(codexHome, "sessions")
  if (!existsSync(sessionsRoot)) {
    return []
  }

  const files: string[] = []
  const walk = (currentPath: string) => {
    for (const entry of readdirSync(currentPath, { withFileTypes: true })) {
      const entryPath = path.join(currentPath, entry.name)
      if (entry.isDirectory()) {
        walk(entryPath)
      } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        files.push(entryPath)
      }
    }
  }

  walk(sessionsRoot)
  return files.sort()
}

/**
 * Streams a session file line by line and returns the absolute number of lines
 * scanned, so the caller can persist it and resume later.
 *
 * `startOffset` resumes mid-file, which is what makes an append-only session log
 * cheap to re-scan. Resuming skips the first partial line unless the byte before
 * the offset is a newline, so a line that was half-written when the previous scan
 * stopped is never cut in two. `startLineNumber` keeps numbering absolute so
 * line-number-derived event ids stay stable across a resume.
 */
function scanSessionFileLines(
  sessionFile: string,
  onLine: (line: string, lineNumber: number) => void,
  { startOffset = 0, startLineNumber = 0 }: { startOffset?: number; startLineNumber?: number } = {}
): number {
  const fd = openSync(sessionFile, "r")
  const buffer = Buffer.allocUnsafe(SESSION_READ_CHUNK_BYTES)
  const decoder = new StringDecoder("utf8")
  let pendingLine = ""
  let lineNumber = startLineNumber
  let skippingOversizedLine = false
  let discardPartialLine = false
  // Read position must be explicit. Passing null means "wherever the descriptor
  // currently is", which is always 0 for a freshly opened file - so a resume that
  // only computed an offset and never sought would silently re-read from the top.
  let position = startOffset

  try {
    if (startOffset > 0) {
      const previous = Buffer.allocUnsafe(1)
      const readPrevious = readSync(fd, previous, 0, 1, startOffset - 1)

      // Not sitting just after a newline, so the offset is mid-line.
      if (readPrevious === 1 && previous[0] !== 0x0a) {
        discardPartialLine = true
      }
    }

    while (true) {
      const bytesRead = readSync(fd, buffer, 0, buffer.length, position)
      if (bytesRead === 0) {
        break
      }

      position += bytesRead
      const chunk = decoder.write(buffer.subarray(0, bytesRead))
      const parts = chunk.split("\n")

      for (let index = 0; index < parts.length - 1; index += 1) {
        const line = `${pendingLine}${parts[index] ?? ""}`
        pendingLine = ""
        lineNumber += 1

        if (discardPartialLine) {
          discardPartialLine = false
          continue
        }

        if (skippingOversizedLine) {
          skippingOversizedLine = false
          continue
        }

        onLine(trimTrailingCarriageReturn(line), lineNumber)
      }

      pendingLine += parts[parts.length - 1] ?? ""

      if (pendingLine.length > MAX_SESSION_LINE_CHARS) {
        pendingLine = ""
        skippingOversizedLine = true
      }
    }

    pendingLine += decoder.end()

    if (pendingLine && !skippingOversizedLine && !discardPartialLine) {
      lineNumber += 1
      onLine(trimTrailingCarriageReturn(pendingLine), lineNumber)
    }
  } finally {
    closeSync(fd)
  }

  return lineNumber
}

function trimTrailingCarriageReturn(line: string) {
  return line.endsWith("\r") ? line.slice(0, -1) : line
}

function getUniqueSkillPulseSkills(skills: ManagedSkill[]) {
  const byKey = new Map<string, ManagedSkill>()

  for (const skill of skills) {
    const key = getSkillInventoryUsageKey(skill)
    const current = byKey.get(key)

    if (!current || shouldPreferSkillPulseSkill(skill, current)) {
      byKey.set(key, skill)
    }
  }

  return [...byKey.values()]
}

function getSkillInventoryUsageKey(skill: ManagedSkill) {
  return getStableSkillUsageKey(skill.path, skill.name) ?? normalizePath(skill.path)
}

function shouldPreferSkillPulseSkill(candidate: ManagedSkill, current: ManagedSkill) {
  if (candidate.parentPluginKey && !current.parentPluginKey) {
    return true
  }

  if (
    !candidate.path.toLowerCase().includes("\\plugin-backup-") &&
    current.path.toLowerCase().includes("\\plugin-backup-")
  ) {
    return true
  }

  return false
}

function getStableSkillUsageKey(skillPath: string, skillName: string) {
  const normalizedSkillPath = normalizePath(skillPath)
  const parts = normalizedSkillPath.split(/[\\/]/)
  const skillsIndex = parts.lastIndexOf("skills")

  if (skillsIndex < 3 || parts[skillsIndex + 1] !== skillName.toLowerCase()) {
    return null
  }

  const possiblePluginKey = parts[skillsIndex - 2]
  const cacheIndex = parts.lastIndexOf("cache")
  const possibleMarketplace = cacheIndex >= 0 ? parts[cacheIndex + 1] : parts[skillsIndex - 3]
  if (!possiblePluginKey || !possibleMarketplace) {
    return null
  }

  return `${possibleMarketplace}:${possiblePluginKey}:${skillName.toLowerCase()}`
}

function extractSkillPaths(value: string) {
  const normalizedValue = value.replace(/\\\\/g, "\\")
  const windowsMatches = normalizedValue.match(/[A-Za-z]:\\[^"'\r\n]*?SKILL\.md/g) ?? []
  const posixMatches = normalizedValue.match(/\/[^"'\r\n]*?SKILL\.md/g) ?? []

  return [...new Set([...windowsMatches, ...posixMatches].map((skillPath) =>
    skillPath.replace(/[),\]}]+$/g, "")
  ))]
}

function getSkillNameFromPath(skillPath: string) {
  const parts = skillPath.split(/[\\/]/)
  let skillFileIndex = -1

  for (let index = parts.length - 1; index >= 0; index -= 1) {
    if (parts[index] === "SKILL.md") {
      skillFileIndex = index
      break
    }
  }

  return skillFileIndex > 0 ? parts[skillFileIndex - 1] ?? "unknown" : "unknown"
}

function isSkillPulseToolEvent(type: unknown) {
  return type === "function_call" || type === "custom_tool_call" || type === "tool_search_call"
}

function getFirstEventAt(events: SkillPulseEvent[]) {
  if (!events.length) {
    return undefined
  }

  return new Date(Math.min(...events.map((event) => new Date(event.occurredAt).getTime()))).toISOString()
}

function getLastEventAt(events: SkillPulseEvent[]) {
  if (!events.length) {
    return undefined
  }

  return new Date(Math.max(...events.map((event) => new Date(event.occurredAt).getTime()))).toISOString()
}

function readOffsetState(codexHome: string): SkillPulseOffsetState {
  const offsetsPath = getOffsetsPath(codexHome)
  if (!existsSync(offsetsPath)) {
    return createEmptyOffsetState()
  }

  const parsed = parseJsonObject(readFileSync(offsetsPath, "utf8"))
  if (!parsed || typeof parsed.files !== "object" || !parsed.files) {
    return createEmptyOffsetState()
  }

  return {
    files: parsed.files as SkillPulseOffsetState["files"],
    lastSyncAt: typeof parsed.lastSyncAt === "string" ? parsed.lastSyncAt : undefined,
  }
}

function createEmptyOffsetState(): SkillPulseOffsetState {
  return { files: {} }
}

function ensureSkillPulseDir(codexHome: string) {
  return getSkillPulseDir(codexHome)
}

function getSkillPulseDir(codexHome: string) {
  const skillPulseDir = path.join(codexHome, SKILLPULSE_DIR_NAME)

  if (!existsSync(skillPulseDir)) {
    mkdirSync(skillPulseDir, { recursive: true })
  }

  return skillPulseDir
}

function getEventsPath(codexHome: string) {
  return getSkillPulsePaths(codexHome).eventsPath
}

function getOffsetsPath(codexHome: string) {
  return getSkillPulsePaths(codexHome).offsetsPath
}

function getSessionIdFromFile(sessionFile: string) {
  return path.basename(sessionFile, ".jsonl")
}

function isSkillPulseEvent(value: unknown): value is SkillPulseEvent {
  const event = parseJsonObject(value)
  // Only the fields every harness can supply are required. skillPath and the
  // session identifiers are optional because sources such as opencode and the
  // Claude Code Skill tool record a skill NAME with no filesystem path.
  return Boolean(
    event &&
    typeof event.id === "string" &&
    typeof event.occurredAt === "string" &&
    typeof event.skillName === "string" &&
    event.skillName !== "" &&
    typeof event.source === "string" &&
    event.source !== ""
  )
}

function parseJsonObject(value: unknown): Record<string, unknown> | null {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }

  if (typeof value !== "string") {
    return null
  }

  try {
    const parsed = JSON.parse(value) as unknown
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null
  } catch {
    return null
  }
}

function stringifyUnknown(value: unknown): string {
  if (typeof value === "string") {
    return value
  }

  if (value === undefined || value === null) {
    return ""
  }

  return JSON.stringify(value)
}

function normalizePath(filePath: string) {
  return path.resolve(filePath).toLowerCase()
}

function writeJson(filePath: string, value: unknown) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8")
}

function hashId(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 32)
}
