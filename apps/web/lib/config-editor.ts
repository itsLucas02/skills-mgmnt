import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"

export type ConfigChangeKind = "plugin" | "skill" | "mcp"

export type ConfigChange = {
  id: string
  kind: ConfigChangeKind
  label: string
  target: string
  enabled: boolean
}

export type ConfigChangePreview = ConfigChange & {
  before: boolean | null
  after: boolean
  summary: string
}

const HOME = homedir()
const CODEX_HOME = process.env.CODEX_HOME ?? path.join(HOME, ".codex")
export const CODEX_CONFIG_PATH = path.join(CODEX_HOME, "config.toml")
const APPLY_STATE_PATH = path.join(CODEX_HOME, "skills-mgmnt-apply-state.json")

type ApplyState = {
  lastAppliedAt?: string
  backupPath?: string
  restartRequired?: boolean
  restartDismissedAt?: string
}

export function previewConfigChanges(changes: ConfigChange[]) {
  const configText = readConfigText()

  return normalizeChanges(changes).map((change) => {
    const before = getCurrentEnabled(configText, change)
    return {
      ...change,
      before,
      after: change.enabled,
      summary: `${labelForKind(change.kind)} ${change.label}: ${formatEnabled(before)} -> ${formatEnabled(change.enabled)}`,
    } satisfies ConfigChangePreview
  })
}

export function applyConfigChanges(changes: ConfigChange[]) {
  const normalizedChanges = normalizeChanges(changes)
  const configText = readConfigText()
  const preview = previewConfigChanges(normalizedChanges)
  const backupPath = createConfigBackup()
  const nextConfigText = normalizedChanges.reduce(
    (currentText, change) => applyChange(currentText, change),
    configText
  )
  writeFileSync(CODEX_CONFIG_PATH, nextConfigText, "utf8")

  const appliedAt = new Date().toISOString()
  writeApplyState({
    lastAppliedAt: appliedAt,
    backupPath,
    restartRequired: true,
  })

  return {
    appliedAt,
    backupPath,
    preview,
  }
}

export function getApplyState(): ApplyState {
  if (!existsSync(APPLY_STATE_PATH)) {
    return {}
  }

  try {
    return JSON.parse(readFileSync(APPLY_STATE_PATH, "utf8")) as ApplyState
  } catch {
    return {}
  }
}

export function dismissRestartWarning() {
  const state = getApplyState()
  const nextState = {
    ...state,
    restartRequired: false,
    restartDismissedAt: new Date().toISOString(),
  }
  writeApplyState(nextState)
  return nextState
}

function normalizeChanges(changes: ConfigChange[]) {
  const deduped = new Map<string, ConfigChange>()

  for (const change of changes) {
    if (!change.id || !change.target || !change.label) {
      continue
    }

    deduped.set(change.id, change)
  }

  return [...deduped.values()]
}

function readConfigText() {
  if (!existsSync(CODEX_CONFIG_PATH)) {
    throw new Error(`Codex config not found at ${CODEX_CONFIG_PATH}`)
  }

  return readFileSync(CODEX_CONFIG_PATH, "utf8")
}

function createConfigBackup() {
  const timestamp = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z")
  const backupPath = path.join(CODEX_HOME, `config.backup-${timestamp}.toml`)
  copyFileSync(CODEX_CONFIG_PATH, backupPath)
  return backupPath
}

function writeApplyState(state: ApplyState) {
  writeFileSync(APPLY_STATE_PATH, `${JSON.stringify(state, null, 2)}\n`, "utf8")
}

function getCurrentEnabled(configText: string, change: ConfigChange) {
  if (change.kind === "plugin") {
    return getSectionEnabled(configText, `plugins."${change.target}"`)
  }

  if (change.kind === "mcp") {
    return getSectionEnabled(configText, `mcp_servers.${change.target}`)
  }

  return getSkillBlockEnabled(configText, change.target)
}

function applyChange(configText: string, change: ConfigChange) {
  if (change.kind === "plugin") {
    return setSectionEnabled(configText, `plugins."${change.target}"`, change.enabled)
  }

  if (change.kind === "mcp") {
    return setSectionEnabled(configText, `mcp_servers.${change.target}`, change.enabled)
  }

  return setSkillEnabled(configText, change.target, change.enabled)
}

function getSectionEnabled(configText: string, sectionName: string) {
  const section = findSection(configText, sectionName)

  if (!section) {
    return null
  }

  const enabledMatch = section.body.match(/^\s*enabled\s*=\s*(true|false)\s*$/m)
  return enabledMatch ? enabledMatch[1] === "true" : true
}

function setSectionEnabled(configText: string, sectionName: string, enabled: boolean) {
  const section = findSection(configText, sectionName)
  const enabledLine = `enabled = ${enabled}`

  if (!section) {
    return `${trimTrailing(configText)}\n\n[${sectionName}]\n${enabledLine}\n`
  }

  const nextBody = section.body.match(/^\s*enabled\s*=\s*(true|false)\s*$/m)
    ? section.body.replace(/^\s*enabled\s*=\s*(true|false)\s*$/m, enabledLine)
    : `${section.body.replace(/\s*$/, "")}\n${enabledLine}\n`

  return `${configText.slice(0, section.bodyStart)}${nextBody}${configText.slice(section.bodyEnd)}`
}

function findSection(configText: string, sectionName: string) {
  const escapedSectionName = escapeRegExp(sectionName)
  const headerPattern = new RegExp(`^\\[${escapedSectionName}\\]\\s*$`, "m")
  const headerMatch = headerPattern.exec(configText)

  if (!headerMatch || headerMatch.index === undefined) {
    return null
  }

  const headerStart = headerMatch.index
  const bodyStart = headerStart + headerMatch[0].length + lineEndingLengthAfter(configText, headerMatch.index + headerMatch[0].length)
  const nextHeaderMatch = /^\[/m.exec(configText.slice(bodyStart))
  const bodyEnd = nextHeaderMatch ? bodyStart + nextHeaderMatch.index : configText.length

  return {
    headerStart,
    bodyStart,
    bodyEnd,
    body: configText.slice(bodyStart, bodyEnd),
  }
}

function getSkillBlockEnabled(configText: string, skillPath: string) {
  const block = findSkillBlock(configText, skillPath)

  if (!block) {
    return null
  }

  const enabledMatch = block.body.match(/^\s*enabled\s*=\s*(true|false)\s*$/m)
  return enabledMatch ? enabledMatch[1] === "true" : true
}

function setSkillEnabled(configText: string, skillPath: string, enabled: boolean) {
  const block = findSkillBlock(configText, skillPath)
  const pathLine = `path = ${formatTomlString(skillPath)}`
  const enabledLine = `enabled = ${enabled}`

  if (!block) {
    return `${trimTrailing(configText)}\n\n[[skills.config]]\n${pathLine}\n${enabledLine}\n`
  }

  const nextBodyWithEnabled = block.body.match(/^\s*enabled\s*=\s*(true|false)\s*$/m)
    ? block.body.replace(/^\s*enabled\s*=\s*(true|false)\s*$/m, enabledLine)
    : `${block.body.replace(/\s*$/, "")}\n${enabledLine}\n`

  return `${configText.slice(0, block.bodyStart)}${nextBodyWithEnabled}${configText.slice(block.bodyEnd)}`
}

function findSkillBlock(configText: string, skillPath: string) {
  const blockPattern = /^\[\[skills\.config\]\]\s*$/gm
  let match: RegExpExecArray | null

  while ((match = blockPattern.exec(configText))) {
    const headerStart = match.index
    const bodyStart = headerStart + match[0].length + lineEndingLengthAfter(configText, headerStart + match[0].length)
    const nextBlockMatch = /^\[/m.exec(configText.slice(bodyStart))
    const bodyEnd = nextBlockMatch ? bodyStart + nextBlockMatch.index : configText.length
    const body = configText.slice(bodyStart, bodyEnd)
    const pathMatch = body.match(/^\s*path\s*=\s*(.+)\s*$/m)

    if (pathMatch && parseTomlString(pathMatch[1] ?? "") === skillPath) {
      return {
        headerStart,
        bodyStart,
        bodyEnd,
        body,
      }
    }
  }

  return null
}

function parseTomlString(value: string) {
  const trimmed = value.trim()

  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1)
  }

  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed
      .slice(1, -1)
      .replace(/\\\\/g, "\\")
      .replace(/\\"/g, '"')
  }

  return trimmed
}

function formatTomlString(value: string) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`
}

function formatEnabled(value: boolean | null) {
  if (value === null) {
    return "default"
  }

  return value ? "enabled" : "disabled"
}

function labelForKind(kind: ConfigChangeKind) {
  const labels: Record<ConfigChangeKind, string> = {
    plugin: "Plugin",
    skill: "Skill",
    mcp: "MCP",
  }
  return labels[kind]
}

function lineEndingLengthAfter(text: string, index: number) {
  if (text[index] === "\r" && text[index + 1] === "\n") {
    return 2
  }

  if (text[index] === "\n") {
    return 1
  }

  return 0
}

function trimTrailing(value: string) {
  return value.replace(/\s*$/, "")
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
