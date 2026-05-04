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
  validateConfigText(nextConfigText)
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

function validateConfigText(configText: string) {
  const gluedHeaderMatch = /=[ \t]*(true|false)(\[\[?)/.exec(configText)

  if (gluedHeaderMatch) {
    throw new Error("Refusing to write invalid TOML: a table header is glued to an enabled value.")
  }

  const seenPluginSections = new Set<string>()
  const duplicatePluginMatch = configText.matchAll(/^\[plugins\."(.+)"\][ \t]*$/gm)

  for (const match of duplicatePluginMatch) {
    const pluginKey = match[1]

    if (!pluginKey) {
      continue
    }

    if (seenPluginSections.has(pluginKey)) {
      throw new Error(`Refusing to write invalid TOML: duplicate plugin section ${pluginKey}.`)
    }

    seenPluginSections.add(pluginKey)
  }
}

function getSectionEnabled(configText: string, sectionName: string) {
  const section = findSection(configText, sectionName)

  if (!section) {
    return null
  }

  const enabledMatch = section.body.match(/^[ \t]*enabled[ \t]*=[ \t]*(true|false)[ \t]*$/m)
  return enabledMatch ? enabledMatch[1] === "true" : true
}

function setSectionEnabled(configText: string, sectionName: string, enabled: boolean) {
  const dedupedConfigText = removeDuplicateSections(configText, sectionName)
  const section = findSection(dedupedConfigText, sectionName)
  const enabledLine = `enabled = ${enabled}`

  if (!section) {
    return appendTomlBlock(dedupedConfigText, `[${sectionName}]\n${enabledLine}\n`)
  }

  const nextBody = setEnabledLine(section.body, enabledLine)

  return `${dedupedConfigText.slice(0, section.bodyStart)}${nextBody}${dedupedConfigText.slice(section.bodyEnd)}`
}

function findSection(configText: string, sectionName: string) {
  return findSections(configText, sectionName)[0] ?? null
}

function findSections(configText: string, sectionName: string) {
  const escapedSectionName = escapeRegExp(sectionName)
  const headerPattern = new RegExp(`^\\[${escapedSectionName}\\][ \\t]*$`, "gm")
  const sections: Array<{
    headerStart: number
    bodyStart: number
    bodyEnd: number
    blockEnd: number
    body: string
  }> = []
  let headerMatch: RegExpExecArray | null

  while ((headerMatch = headerPattern.exec(configText))) {
    const headerStart = headerMatch.index
    const bodyStart = headerStart + headerMatch[0].length + lineEndingLengthAfter(configText, headerMatch.index + headerMatch[0].length)
    const nextHeaderMatch = /^\[/m.exec(configText.slice(bodyStart))
    const bodyEnd = nextHeaderMatch ? bodyStart + nextHeaderMatch.index : configText.length

    sections.push({
      headerStart,
      bodyStart,
      bodyEnd,
      blockEnd: bodyEnd,
      body: configText.slice(bodyStart, bodyEnd),
    })
  }

  return sections
}

function getSkillBlockEnabled(configText: string, skillPath: string) {
  const block = findSkillBlock(configText, skillPath)

  if (!block) {
    return null
  }

  const enabledMatch = block.body.match(/^[ \t]*enabled[ \t]*=[ \t]*(true|false)[ \t]*$/m)
  return enabledMatch ? enabledMatch[1] === "true" : true
}

function setSkillEnabled(configText: string, skillPath: string, enabled: boolean) {
  const dedupedConfigText = removeDuplicateSkillBlocks(configText, skillPath)
  const block = findSkillBlock(dedupedConfigText, skillPath)
  const pathLine = `path = ${formatTomlString(skillPath)}`
  const enabledLine = `enabled = ${enabled}`

  if (!block) {
    return appendTomlBlock(dedupedConfigText, `[[skills.config]]\n${pathLine}\n${enabledLine}\n`)
  }

  const nextBodyWithEnabled = setEnabledLine(block.body, enabledLine)

  return `${dedupedConfigText.slice(0, block.bodyStart)}${nextBodyWithEnabled}${dedupedConfigText.slice(block.bodyEnd)}`
}

function findSkillBlock(configText: string, skillPath: string) {
  return findSkillBlocks(configText, skillPath)[0] ?? null
}

function findSkillBlocks(configText: string, skillPath: string) {
  const blockPattern = /^\[\[skills\.config\]\]\s*$/gm
  let match: RegExpExecArray | null
  const blocks: Array<{
    headerStart: number
    bodyStart: number
    bodyEnd: number
    blockEnd: number
    body: string
  }> = []

  while ((match = blockPattern.exec(configText))) {
    const headerStart = match.index
    const bodyStart = headerStart + match[0].length + lineEndingLengthAfter(configText, headerStart + match[0].length)
    const nextBlockMatch = /^\[/m.exec(configText.slice(bodyStart))
    const bodyEnd = nextBlockMatch ? bodyStart + nextBlockMatch.index : configText.length
    const body = configText.slice(bodyStart, bodyEnd)
    const pathMatch = body.match(/^\s*path\s*=\s*(.+)\s*$/m)

    if (pathMatch && parseTomlString(pathMatch[1] ?? "") === skillPath) {
      blocks.push({
        headerStart,
        bodyStart,
        bodyEnd,
        blockEnd: bodyEnd,
        body,
      })
    }
  }

  return blocks
}

function setEnabledLine(body: string, enabledLine: string) {
  const enabledPattern = /^[ \t]*enabled[ \t]*=[ \t]*(true|false)[ \t]*$/m
  const nextBody = enabledPattern.test(body)
    ? body.replace(enabledPattern, enabledLine)
    : `${body.replace(/[ \t\r\n]*$/, "")}\n${enabledLine}`

  return `${nextBody.replace(/[ \t\r\n]*$/, "")}\n\n`
}

function removeDuplicateSections(configText: string, sectionName: string) {
  const sections = findSections(configText, sectionName)

  if (sections.length <= 1) {
    return configText
  }

  return removeRanges(
    configText,
    sections.slice(1).map((section) => ({
      start: section.headerStart,
      end: section.blockEnd,
    }))
  )
}

function removeDuplicateSkillBlocks(configText: string, skillPath: string) {
  const blocks = findSkillBlocks(configText, skillPath)

  if (blocks.length <= 1) {
    return configText
  }

  return removeRanges(
    configText,
    blocks.slice(1).map((block) => ({
      start: block.headerStart,
      end: block.blockEnd,
    }))
  )
}

function removeRanges(text: string, ranges: Array<{ start: number; end: number }>) {
  return ranges
    .sort((left, right) => right.start - left.start)
    .reduce((currentText, range) => {
      const before = currentText.slice(0, range.start).replace(/[ \t]*$/, "")
      const after = currentText.slice(range.end).replace(/^[ \t\r\n]*/, "")
      return `${before}\n\n${after}`
    }, text)
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

function appendTomlBlock(configText: string, blockText: string) {
  return `${trimTrailing(configText)}\n\n${blockText.replace(/[ \t\r\n]*$/, "")}\n`
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
