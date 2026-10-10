/**
 * Multi-harness skill invocation capture.
 *
 * Each adapter turns one harness's own session record into SkillPulseEvent rows.
 * Everything here was verified against real files on this machine (2026-09-22):
 *
 *   codex        ~/.codex/sessions/**\/*.jsonl
 *                Older sessions: payload.type "function_call", command in
 *                payload.arguments. Newer: payload.type "custom_tool_call",
 *                command in payload.input. Handled by skillpulse.ts.
 *
 *   claude-code  ~/.claude/projects/**\/*.jsonl
 *                message.content[] entry { type: "tool_use", name: "Skill",
 *                input: { skill: "<name>" } }. Unambiguous - no path guessing.
 *
 *   commandcode  ~/.commandcode/projects/**\/*.jsonl
 *                Same schema as Claude Code. Covers only the STANDALONE
 *                CommandCode CLI. A CommandCode GOAT subscription driven from
 *                inside the opencode CLI never writes here - that usage is
 *                recorded by opencode and captured by the opencode adapter.
 *                So a zero from this adapter is normal, not a broken reader.
 *                (Verified 2026-09-23: two standalone sessions exist, Aug 27 and
 *                Sep 3, neither invoking a skill, while 27 skills are installed
 *                under ~/.commandcode/skills.)
 *
 *   opencode     ~/.local/share/opencode/opencode.db  (SQLite)
 *                table `part`, data JSON { type: "tool", tool: "skill",
 *                state: { input: { name: "<skill>" } } }.
 *
 * Runner note: imports only Node builtins, so the headless scanner can execute
 * this directly under `node --experimental-strip-types`.
 */

import { createHash } from "node:crypto"
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"

import type { SkillPulseEvent } from "./skillpulse"

export type HarnessId = "codex" | "claude-code" | "commandcode" | "opencode"

export const HARNESS_LABELS: Record<HarnessId, string> = {
  codex: "Codex CLI",
  "claude-code": "Claude Code",
  commandcode: "CommandCode",
  opencode: "opencode",
}

export type HarnessOffsetState = {
  version: 1
  /** filePath -> { size, mtimeMs } for JSONL-backed harnesses. */
  files: Record<string, { size: number; mtimeMs: number }>
  /** Highest opencode `part.time_created` folded in so far. */
  opencodeWatermark?: number
}

export function createEmptyHarnessOffsetState(): HarnessOffsetState {
  return { version: 1, files: {} }
}

export function readHarnessOffsetState(skillPulseDir: string): HarnessOffsetState {
  const offsetPath = path.join(skillPulseDir, "harness-offsets.json")

  if (!existsSync(offsetPath)) {
    return createEmptyHarnessOffsetState()
  }

  try {
    const parsed = JSON.parse(readFileSync(offsetPath, "utf8")) as HarnessOffsetState

    if (parsed?.version !== 1 || typeof parsed.files !== "object" || parsed.files === null) {
      return createEmptyHarnessOffsetState()
    }

    return parsed
  } catch {
    return createEmptyHarnessOffsetState()
  }
}

export function writeHarnessOffsetState(skillPulseDir: string, state: HarnessOffsetState) {
  writeFileSync(
    path.join(skillPulseDir, "harness-offsets.json"),
    `${JSON.stringify(state, null, 2)}\n`,
    "utf8"
  )
}

function hashId(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 32)
}

function walkJsonlFiles(root: string, out: string[] = []) {
  if (!existsSync(root)) {
    return out
  }

  let entries

  try {
    entries = readdirSync(root, { withFileTypes: true })
  } catch {
    return out
  }

  for (const entry of entries) {
    const full = path.join(root, entry.name)

    if (entry.isDirectory()) {
      walkJsonlFiles(full, out)
    } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
      out.push(full)
    }
  }

  return out
}

/**
 * Claude Code and CommandCode both record skill invocations as a `Skill` tool
 * call. Two signals are captured, labelled by source so they stay separable:
 *   - skill-tool : the harness's own "run this skill" tool call (authoritative)
 *   - read-skill : a Read tool call whose target is a SKILL.md (mirrors how
 *                  Codex exposes it, since not every harness uses a Skill tool)
 */
export function extractHarnessEventsFromTranscriptLine(
  line: string,
  ctx: { harness: HarnessId; sessionFile: string; sessionId: string }
): SkillPulseEvent[] {
  let parsed: unknown

  try {
    parsed = JSON.parse(line)
  } catch {
    return []
  }

  if (typeof parsed !== "object" || parsed === null) {
    return []
  }

  const record = parsed as Record<string, unknown>
  const message = record.message as Record<string, unknown> | undefined
  const content = message?.content

  if (!Array.isArray(content)) {
    return []
  }

  const timestamp =
    typeof record.timestamp === "string" ? record.timestamp : new Date().toISOString()
  const events: SkillPulseEvent[] = []

  for (const [index, rawItem] of content.entries()) {
    if (typeof rawItem !== "object" || rawItem === null) {
      continue
    }

    const item = rawItem as Record<string, unknown>

    if (item.type !== "tool_use") {
      continue
    }

    const toolName = String(item.name ?? "")
    const input = (item.input ?? {}) as Record<string, unknown>
    const callId = String(item.id ?? item.call_id ?? index)

    if (toolName === "Skill" || toolName === "skill") {
      const skillName = typeof input.skill === "string" ? input.skill : undefined

      if (!skillName) {
        continue
      }

      events.push({
        id: hashId([ctx.harness, ctx.sessionFile, callId, skillName.toLowerCase(), "skill-tool"].join("|")),
        occurredAt: timestamp,
        harness: ctx.harness,
        skillName,
        sessionId: ctx.sessionId,
        sessionFile: ctx.sessionFile,
        source: "harness-skill-tool",
      })
      continue
    }

    const filePath = typeof input.file_path === "string" ? input.file_path : undefined

    if ((toolName === "Read" || toolName === "read") && filePath && /[\\/]SKILL\.md$/.test(filePath)) {
      const skillName = skillNameFromPath(filePath)

      events.push({
        id: hashId([ctx.harness, ctx.sessionFile, callId, filePath, "read-skill"].join("|")),
        occurredAt: timestamp,
        harness: ctx.harness,
        skillName,
        skillPath: filePath,
        sessionId: ctx.sessionId,
        sessionFile: ctx.sessionFile,
        source: "harness-read-skill-md",
      })
    }
  }

  return events
}

function skillNameFromPath(skillPath: string) {
  const parts = skillPath.split(/[\\/]/)

  for (let index = parts.length - 1; index >= 0; index -= 1) {
    if (parts[index] === "SKILL.md" && index > 0) {
      return parts[index - 1] ?? "unknown"
    }
  }

  return "unknown"
}

export type HarnessCollectResult = {
  harness: HarnessId
  label: string
  filesScanned: number
  events: SkillPulseEvent[]
  note?: string
}

function collectTranscriptHarness({
  harness,
  root,
  state,
  includeUnchanged = false,
}: {
  harness: HarnessId
  root: string
  state: HarnessOffsetState
  includeUnchanged?: boolean
}): HarnessCollectResult {
  const label = HARNESS_LABELS[harness]

  if (!existsSync(root)) {
    return { harness, label, filesScanned: 0, events: [], note: "not found on this machine" }
  }

  const files = walkJsonlFiles(root)
  const events: SkillPulseEvent[] = []
  let filesScanned = 0

  for (const file of files) {
    let stats

    try {
      stats = statSync(file)
    } catch {
      continue
    }

    const previous = state.files[file]

    if (!includeUnchanged && previous && previous.size === stats.size && previous.mtimeMs === stats.mtimeMs) {
      continue
    }

    filesScanned += 1
    const sessionId = path.basename(file, ".jsonl")
    let text = ""

    try {
      text = readFileSync(file, "utf8")
    } catch {
      continue
    }

    for (const line of text.split("\n")) {
      if (!line.trim()) {
        continue
      }

      events.push(...extractHarnessEventsFromTranscriptLine(line, { harness, sessionFile: file, sessionId }))
    }

    state.files[file] = { size: stats.size, mtimeMs: stats.mtimeMs }
  }

  return { harness, label, filesScanned, events }
}

/**
 * opencode stores sessions in SQLite. `node:sqlite` is only available with
 * --experimental-sqlite, which the Next.js server does not run with, so the
 * headless scanner is the only place this can execute. Failure is reported as a
 * note rather than thrown, so a missing or locked database never breaks a scan.
 */
async function collectOpencode({ state }: { state: HarnessOffsetState }): Promise<HarnessCollectResult> {
  const harness: HarnessId = "opencode"
  const label = HARNESS_LABELS[harness]
  const dbPath = path.join(homedir(), ".local", "share", "opencode", "opencode.db")

  if (!existsSync(dbPath)) {
    return { harness, label, filesScanned: 0, events: [], note: "database not found" }
  }

  let sqlite: typeof import("node:sqlite")

  try {
    sqlite = await import("node:sqlite")
  } catch {
    return {
      harness,
      label,
      filesScanned: 0,
      events: [],
      note: "node:sqlite unavailable - run the scanner with --experimental-sqlite",
    }
  }

  let db

  try {
    db = new sqlite.DatabaseSync(dbPath, { readOnly: true })
  } catch (error) {
    return {
      harness,
      label,
      filesScanned: 0,
      events: [],
      note: `could not open database: ${error instanceof Error ? error.message : "unknown"}`,
    }
  }

  const events: SkillPulseEvent[] = []

  try {
    const watermark = state.opencodeWatermark ?? 0
    const rows = db
      .prepare(
        "select id, session_id, time_created, data from part where time_created > ? and data like '%\"tool\":\"skill\"%'"
      )
      .all(watermark) as Array<{ id: string; session_id: string; time_created: number; data: string }>

    let highest = watermark

    for (const row of rows) {
      if (row.time_created > highest) {
        highest = row.time_created
      }

      let data: Record<string, unknown>

      try {
        data = JSON.parse(row.data) as Record<string, unknown>
      } catch {
        continue
      }

      const toolState = (data.state ?? {}) as Record<string, unknown>
      const input = (toolState.input ?? {}) as Record<string, unknown>
      const skillName = typeof input.name === "string" ? input.name : undefined

      if (!skillName) {
        continue
      }

      // time_created is milliseconds since epoch in opencode's schema.
      const occurredAt = new Date(row.time_created).toISOString()

      events.push({
        id: hashId(["opencode", row.session_id, row.id, skillName.toLowerCase()].join("|")),
        occurredAt,
        harness,
        skillName,
        sessionId: row.session_id,
        source: "harness-skill-tool",
      })
    }

    state.opencodeWatermark = highest
  } catch (error) {
    return {
      harness,
      label,
      filesScanned: 0,
      events,
      note: `query failed: ${error instanceof Error ? error.message : "unknown"}`,
    }
  } finally {
    try {
      db.close()
    } catch {
      // ignore
    }
  }

  return { harness, label, filesScanned: 1, events }
}

export function getHarnessRoots() {
  const home = homedir()

  return {
    "claude-code": path.join(home, ".claude", "projects"),
    commandcode: path.join(home, ".commandcode", "projects"),
  }
}

/**
 * Collect skill invocations from every non-Codex harness. Codex is handled by
 * skillpulse.ts (its schema needs the custom_tool_call/arguments pair logic).
 */
export async function collectHarnessSkillEvents({
  skillPulseDir,
  backfill = false,
}: {
  skillPulseDir: string
  backfill?: boolean
}): Promise<{ results: HarnessCollectResult[]; state: HarnessOffsetState }> {
  const state = backfill ? createEmptyHarnessOffsetState() : readHarnessOffsetState(skillPulseDir)
  const roots = getHarnessRoots()

  const results: HarnessCollectResult[] = [
    collectTranscriptHarness({
      harness: "claude-code",
      root: roots["claude-code"],
      state,
      includeUnchanged: backfill,
    }),
    collectTranscriptHarness({
      harness: "commandcode",
      root: roots.commandcode,
      state,
      includeUnchanged: backfill,
    }),
    await collectOpencode({ state }),
  ]

  // Deliberately NOT persisted here. The caller must write this state only
  // AFTER the collected events are safely appended, otherwise a crash between
  // the two would advance the watermark past events that were never stored and
  // lose them permanently.
  return { results, state }
}
