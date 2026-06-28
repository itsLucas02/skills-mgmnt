import {
  appendFileSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { createHash } from "node:crypto"
import { homedir } from "node:os"
import path from "node:path"
import { StringDecoder } from "node:string_decoder"

import type { ManagedSkill } from "./skills"

export type SkillPulseEvent = {
  id: string
  occurredAt: string
  sessionId: string
  sessionFile: string
  skillPath: string
  skillName: string
  parentPluginKey?: string
  source: "session-jsonl-skill-read"
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

export type SkillPulseCollectorStatus = {
  enabled: boolean
  collectorRunning: boolean
  pid?: number
  startedAt?: string
  stoppedAt?: string
  lastHeartbeatAt?: string
  lastSyncAt?: string
  lastError?: string
}

export type SkillPulseSummaryResponse = {
  status: {
    enabled: boolean
    collectorRunning: boolean
    lastSyncAt?: string
    firstEventAt?: string
    lastEventAt?: string
    dataCoverageDays: number
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
  loadsAllTime: number
  lastLoadedAt?: string
  recommendation: "keep" | "disable-candidate" | "insufficient-data"
}

type SkillPulseOffsetState = {
  files: Record<string, { size: number; mtimeMs: number }>
  lastSyncAt?: string
}

const HOME = homedir()
const CODEX_HOME = process.env.CODEX_HOME ?? path.join(HOME, ".codex")
const SKILLPULSE_DIR_NAME = "skillpulse"
const EVENTS_FILE_NAME = "events.jsonl"
const OFFSETS_FILE_NAME = "offsets.json"
const COLLECTOR_STATUS_FILE_NAME = "collector-status.json"
const SETTINGS_FILE_NAME = "settings.json"
const SESSION_READ_CHUNK_BYTES = 1024 * 1024
const MAX_SESSION_LINE_CHARS = 16 * 1024 * 1024

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
  const eventsPath = getEventsPath(codexHome)
  const previousEvents = readSkillPulseEvents(codexHome)
  const seenEventIds = new Set(previousEvents.map((event) => event.id))
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

    scanSessionFileLines(sessionFile, (line, lineNumber) => {
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
    })

    state.files[sessionFile] = {
      size: stats.size,
      mtimeMs: stats.mtimeMs,
    }
  }

  if (newEvents.length) {
    appendFileSync(
      eventsPath,
      `${newEvents.map((event) => JSON.stringify(event)).join("\n")}\n`,
      "utf8"
    )
  }

  state.lastSyncAt = syncedAt
  writeJson(getOffsetsPath(codexHome), state)

  return {
    mode,
    syncedAt,
    processedFileCount,
    scannedLineCount,
    newEventCount: newEvents.length,
    totalEventCount: previousEvents.length + newEvents.length,
  }
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

  return aggregateSkillPulseUsage({
    skills,
    events,
    now,
    firstEventAt: getFirstEventAt(events),
    lastSyncAt: offsetState.lastSyncAt,
    collectorStatus: getSkillPulseCollectorStatus(codexHome),
  })
}

export function aggregateSkillPulseUsage({
  skills,
  events,
  now = new Date(),
  firstEventAt,
  lastSyncAt,
  collectorStatus = getDefaultCollectorStatus(),
}: {
  skills: ManagedSkill[]
  events: SkillPulseEvent[]
  now?: Date
  firstEventAt?: string
  lastSyncAt?: string
  collectorStatus?: SkillPulseCollectorStatus
}): SkillPulseSummaryResponse {
  const sevenDaysAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000
  const thirtyDaysAgo = now.getTime() - 30 * 24 * 60 * 60 * 1000
  const dataCoverageDays = firstEventAt
    ? Math.floor((now.getTime() - new Date(firstEventAt).getTime()) / (24 * 60 * 60 * 1000))
    : 0
  const bySkillPath = new Map<string, SkillPulseEvent[]>()

  for (const event of events) {
    const key = normalizePath(event.skillPath)
    bySkillPath.set(key, [...(bySkillPath.get(key) ?? []), event])
  }

  const usage = skills.map((skill) => {
    const skillEvents = bySkillPath.get(normalizePath(skill.path)) ?? []
    const eventTimes = skillEvents.map((event) => new Date(event.occurredAt).getTime())
    const loads7d = eventTimes.filter((time) => time >= sevenDaysAgo).length
    const loads30d = eventTimes.filter((time) => time >= thirtyDaysAgo).length
    const lastLoadedAt = eventTimes.length
      ? new Date(Math.max(...eventTimes)).toISOString()
      : undefined
    const recommendation = getRecommendation(skill, loads7d, dataCoverageDays)

    return {
      skillPath: skill.path,
      skillName: skill.name,
      parentPluginKey: skill.parentPluginKey,
      effectiveStatus: skill.effectiveStatus,
      loads7d,
      loads30d,
      loadsAllTime: skillEvents.length,
      lastLoadedAt,
      recommendation,
    } satisfies SkillPulseSkillUsage
  }).sort((left, right) =>
    right.loads7d - left.loads7d ||
    right.loads30d - left.loads30d ||
    right.loadsAllTime - left.loadsAllTime ||
    left.skillName.localeCompare(right.skillName)
  )

  return {
    status: {
      enabled: collectorStatus.enabled,
      collectorRunning: collectorStatus.collectorRunning,
      lastSyncAt,
      firstEventAt,
      lastEventAt: getLastEventAt(events),
      dataCoverageDays,
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
  const argumentsText = stringifyUnknown(payload.arguments)
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

export function getSkillPulseCollectorStatus(codexHome = CODEX_HOME): SkillPulseCollectorStatus {
  const statusPath = getCollectorStatusPath(codexHome)
  if (!existsSync(statusPath)) {
    return getDefaultCollectorStatus()
  }

  const status = parseJsonObject(readFileSync(statusPath, "utf8"))
  if (!status) {
    return getDefaultCollectorStatus()
  }

  return {
    enabled: Boolean(status.enabled),
    collectorRunning: Boolean(status.collectorRunning),
    pid: typeof status.pid === "number" ? status.pid : undefined,
    startedAt: typeof status.startedAt === "string" ? status.startedAt : undefined,
    stoppedAt: typeof status.stoppedAt === "string" ? status.stoppedAt : undefined,
    lastHeartbeatAt: typeof status.lastHeartbeatAt === "string" ? status.lastHeartbeatAt : undefined,
    lastSyncAt: typeof status.lastSyncAt === "string" ? status.lastSyncAt : undefined,
    lastError: typeof status.lastError === "string" ? status.lastError : undefined,
  }
}

export function writeSkillPulseCollectorStatus(
  status: SkillPulseCollectorStatus,
  codexHome = CODEX_HOME
) {
  ensureSkillPulseDir(codexHome)
  writeJson(getCollectorStatusPath(codexHome), status)
}

export function getSkillPulsePaths(codexHome = CODEX_HOME) {
  const skillPulseDir = path.join(codexHome, SKILLPULSE_DIR_NAME)
  return {
    skillPulseDir,
    eventsPath: path.join(skillPulseDir, EVENTS_FILE_NAME),
    offsetsPath: path.join(skillPulseDir, OFFSETS_FILE_NAME),
    collectorStatusPath: path.join(skillPulseDir, COLLECTOR_STATUS_FILE_NAME),
    settingsPath: path.join(skillPulseDir, SETTINGS_FILE_NAME),
  }
}

function getRecommendation(
  skill: ManagedSkill,
  loads7d: number,
  dataCoverageDays: number
): SkillPulseSkillUsage["recommendation"] {
  if (dataCoverageDays < 7) {
    return "insufficient-data"
  }

  if (skill.effectiveStatus === "active" && loads7d === 0) {
    return "disable-candidate"
  }

  return "keep"
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

function scanSessionFileLines(
  sessionFile: string,
  onLine: (line: string, lineNumber: number) => void
) {
  const fd = openSync(sessionFile, "r")
  const buffer = Buffer.allocUnsafe(SESSION_READ_CHUNK_BYTES)
  const decoder = new StringDecoder("utf8")
  let pendingLine = ""
  let lineNumber = 0
  let skippingOversizedLine = false

  try {
    while (true) {
      const bytesRead = readSync(fd, buffer, 0, buffer.length, null)
      if (bytesRead === 0) {
        break
      }

      const chunk = decoder.write(buffer.subarray(0, bytesRead))
      const parts = chunk.split("\n")

      for (let index = 0; index < parts.length - 1; index += 1) {
        const line = `${pendingLine}${parts[index] ?? ""}`
        pendingLine = ""
        lineNumber += 1

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

    if (pendingLine && !skippingOversizedLine) {
      lineNumber += 1
      onLine(trimTrailingCarriageReturn(pendingLine), lineNumber)
    }
  } finally {
    closeSync(fd)
  }
}

function trimTrailingCarriageReturn(line: string) {
  return line.endsWith("\r") ? line.slice(0, -1) : line
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
  mkdirSync(getSkillPulsePaths(codexHome).skillPulseDir, { recursive: true })
}

function getEventsPath(codexHome: string) {
  return getSkillPulsePaths(codexHome).eventsPath
}

function getOffsetsPath(codexHome: string) {
  return getSkillPulsePaths(codexHome).offsetsPath
}

function getCollectorStatusPath(codexHome: string) {
  return getSkillPulsePaths(codexHome).collectorStatusPath
}

function getSessionIdFromFile(sessionFile: string) {
  return path.basename(sessionFile, ".jsonl")
}

function isSkillPulseEvent(value: unknown): value is SkillPulseEvent {
  const event = parseJsonObject(value)
  return Boolean(
    event &&
    typeof event.id === "string" &&
    typeof event.occurredAt === "string" &&
    typeof event.sessionId === "string" &&
    typeof event.sessionFile === "string" &&
    typeof event.skillPath === "string" &&
    typeof event.skillName === "string" &&
    event.source === "session-jsonl-skill-read"
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

function getDefaultCollectorStatus(): SkillPulseCollectorStatus {
  return {
    enabled: false,
    collectorRunning: false,
  }
}
