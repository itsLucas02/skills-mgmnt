import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
} from "node:fs"
import { homedir } from "node:os"
import path from "node:path"

export type SkillSource =
  | "Codex local"
  | "Agent local"
  | "Plugin cache"
  | "Third party"

export type OriginConfidence = "known" | "inferred" | "unknown"

export type CapabilityOrigin = {
  label: string
  confidence: OriginConfidence
  detail: string
}

export type ControlGate = {
  type: "skill-config" | "plugin-config" | "mcp-config" | "plugin-manifest" | "default" | "folder"
  label: string
  path?: string
  relativePath?: string
  line?: number
  section?: string
  editable: boolean
  reason: string
  detailId?: string
}

export type EffectiveStatus =
  | "active"
  | "disabled-by-skill"
  | "disabled-by-plugin"
  | "installed-not-loaded"

export type ManagedSkill = {
  id: string
  detailId: string
  name: string
  description: string
  source: SkillSource
  path: string
  relativePath: string
  status: "active" | "disabled"
  effectiveStatus: EffectiveStatus
  statusReason: string
  editable: boolean
  origin: CapabilityOrigin
  controlGate: ControlGate
  parentPluginKey?: string
  parentPluginName?: string
}

export type ManagedPlugin = {
  key: string
  detailId: string
  name: string
  displayName: string
  description: string
  source: SkillSource
  marketplace: string
  path: string
  relativePath: string
  enabled: boolean
  statusReason: string
  origin: CapabilityOrigin
  controlGate: ControlGate
  version?: string
  repository?: string
  homepage?: string
  skills: ManagedSkill[]
  mcpServerCount: number
  appCount: number
}

export type ManagedMcpServer = {
  name: string
  detailId: string
  source: "Codex config" | "Plugin"
  parentPluginKey?: string
  enabled: boolean
  transport: "command" | "url" | "unknown"
  endpoint: string
  statusReason: string
  editable: boolean
  origin: CapabilityOrigin
  controlGate: ControlGate
  path?: string
  relativePath?: string
}

export type SkillSummary = {
  active: number
  disabled: number
  total: number
  sourceCounts: Record<SkillSource, number>
  pluginShare: number
  scannedRoots: string[]
  newestModifiedAt: string
  pluginCount: number
  activePluginCount: number
  standaloneSkillCount: number
  mcpServerCount: number
}

export type SkillDetail = {
  kind: "skill" | "plugin" | "mcp"
  title: string
  description: string
  status: string
  statusReason: string
  source: string
  origin: CapabilityOrigin
  controlGate: ControlGate
  path?: string
  relativePath?: string
  parentPluginKey?: string
  metadata: Array<{ label: string; value: string }>
  contentPreview?: string
}

const HOME = homedir()
const CODEX_HOME = process.env.CODEX_HOME ?? path.join(HOME, ".codex")
const AGENTS_HOME = process.env.AGENTS_HOME ?? path.join(HOME, ".agents")
const CODEX_CONFIG_PATH = path.join(CODEX_HOME, "config.toml")

const SEARCH_ROOTS = [
  { path: path.join(CODEX_HOME, "skills"), source: "Codex local" },
  { path: path.join(AGENTS_HOME, "skills"), source: "Agent local" },
  { path: path.join(CODEX_HOME, "plugins", "cache"), source: "Plugin cache" },
  { path: path.join(CODEX_HOME, ".tmp", "marketplaces"), source: "Third party" },
] satisfies Array<{ path: string; source: SkillSource }>

const SAFE_OPEN_ROOTS = [...SEARCH_ROOTS.map((root) => root.path), CODEX_CONFIG_PATH]

type ConfigGateEntry = {
  enabled: boolean
  line: number
  section: string
}

type CodexConfigState = {
  disabledSkillPaths: Set<string>
  skillEntries: Map<string, ConfigGateEntry>
  plugins: Map<string, ConfigGateEntry>
  mcpServers: Map<string, ManagedMcpServer>
}

type PluginMetadata = {
  name?: string
  version?: string
  description?: string
  repository?: string
  homepage?: string
  interface?: {
    displayName?: string
    shortDescription?: string
    longDescription?: string
  }
}

type AppMetadata = {
  apps?: Record<string, unknown>
}

export function getSkillInventory() {
  return getCapabilityInventory().skills
}

export function getCapabilityInventory() {
  const config = readCodexConfigState()
  const pluginMap = discoverPlugins(config)
  const skills: ManagedSkill[] = []
  const pluginKeysWithSkills = new Set<string>()

  for (const root of SEARCH_ROOTS) {
    walkForSkillFiles(root.path, root.source, skills, config, pluginMap, pluginKeysWithSkills)
  }

  for (const [key, plugin] of pluginMap) {
    if (!pluginKeysWithSkills.has(key)) {
      plugin.skills = []
    }
  }

  const plugins = [...pluginMap.values()].sort((left, right) =>
    left.displayName.localeCompare(right.displayName)
  )
  const standaloneSkills = skills
    .filter((skill) => !skill.parentPluginKey)
    .sort(sortSkills)
  const mcpServers = [
    ...config.mcpServers.values(),
    ...plugins.flatMap((plugin) => getPluginMcpServers(plugin)),
  ].sort((left, right) => left.name.localeCompare(right.name))

  return {
    skills: skills.sort(sortSkills),
    plugins,
    standaloneSkills,
    mcpServers,
    summary: getSkillSummary(skills, plugins, standaloneSkills, mcpServers),
  }
}

export function getSkillSummary(
  skills: ManagedSkill[],
  plugins: ManagedPlugin[] = [],
  standaloneSkills: ManagedSkill[] = skills.filter((skill) => !skill.parentPluginKey),
  mcpServers: ManagedMcpServer[] = []
): SkillSummary {
  const active = skills.filter((skill) => skill.status === "active").length
  const disabled = skills.length - active
  const sourceCounts = skills.reduce<Record<SkillSource, number>>(
    (counts, skill) => {
      counts[skill.source] += 1
      return counts
    },
    {
      "Agent local": 0,
      "Codex local": 0,
      "Plugin cache": 0,
      "Third party": 0,
    }
  )
  const pluginSkillCount = skills.filter((skill) => skill.parentPluginKey).length
  const pluginShare = skills.length
    ? Math.round((pluginSkillCount / skills.length) * 100)
    : 0

  return {
    active,
    disabled,
    total: skills.length,
    sourceCounts,
    pluginShare,
    scannedRoots: SEARCH_ROOTS.map((root) => root.path).filter((root) =>
      existsSync(root)
    ),
    newestModifiedAt: getNewestModifiedAt(skills),
    pluginCount: plugins.length,
    activePluginCount: plugins.filter((plugin) => plugin.enabled).length,
    standaloneSkillCount: standaloneSkills.length,
    mcpServerCount: mcpServers.length,
  }
}

export function getSkillDetail(detailId: string): SkillDetail | null {
  const decodedPath = decodeFilePart(detailId)

  if (!decodedPath || !isSafeLocalPath(decodedPath)) {
    return null
  }

  const inventory = getCapabilityInventory()
  const skill = inventory.skills.find((item) => item.path === decodedPath)

  if (skill) {
    return {
      kind: "skill",
      title: skill.name,
      description: skill.description,
      status: formatStatus(skill.effectiveStatus),
      statusReason: skill.statusReason,
      source: skill.source,
      origin: skill.origin,
      controlGate: skill.controlGate,
      path: skill.path,
      relativePath: skill.relativePath,
      parentPluginKey: skill.parentPluginKey,
      metadata: [
        { label: "Parent plugin", value: skill.parentPluginKey ?? "Standalone skill" },
        { label: "Path", value: skill.relativePath },
      ],
      contentPreview: readPreview(skill.path),
    }
  }

  const plugin = inventory.plugins.find((item) => item.path === decodedPath)

  if (plugin) {
    return {
      kind: "plugin",
      title: plugin.displayName,
      description: plugin.description,
      status: plugin.enabled ? "Active" : "Disabled by plugin config",
      statusReason: plugin.statusReason,
      source: plugin.source,
      origin: plugin.origin,
      controlGate: plugin.controlGate,
      path: plugin.path,
      relativePath: plugin.relativePath,
      metadata: [
        { label: "Plugin key", value: plugin.key },
        { label: "Marketplace", value: plugin.marketplace },
        { label: "Skills", value: plugin.skills.length.toString() },
        { label: "MCP servers", value: plugin.mcpServerCount.toString() },
        { label: "Apps/connectors", value: plugin.appCount.toString() },
        { label: "Repository", value: plugin.repository ?? "Not declared" },
      ],
      contentPreview: readPreview(path.join(plugin.path, ".codex-plugin", "plugin.json")),
    }
  }

  const mcpServer = inventory.mcpServers.find((item) => item.detailId === detailId)

  if (mcpServer) {
    return {
      kind: "mcp",
      title: mcpServer.name,
      description: `${mcpServer.transport.toUpperCase()} MCP server from ${mcpServer.source}.`,
      status: mcpServer.enabled ? "Active" : "Disabled",
      statusReason: mcpServer.statusReason,
      source: mcpServer.source,
      origin: mcpServer.origin,
      controlGate: mcpServer.controlGate,
      path: mcpServer.path,
      relativePath: mcpServer.relativePath,
      parentPluginKey: mcpServer.parentPluginKey,
      metadata: [
        { label: "Transport", value: mcpServer.transport },
        { label: "Endpoint", value: mcpServer.endpoint },
        { label: "Parent plugin", value: mcpServer.parentPluginKey ?? "Codex config" },
      ],
      contentPreview: mcpServer.source === "Codex config"
        ? "Codex config preview is intentionally hidden because config.toml can contain tokens or local secrets. Use Open config gate to inspect it locally."
        : mcpServer.path ? readPreview(mcpServer.path) : undefined,
    }
  }

  return null
}

export function decodeDetailId(detailId: string) {
  try {
    return Buffer.from(detailId, "base64url").toString("utf8")
  } catch {
    return null
  }
}

export function isSafeLocalPath(targetPath: string) {
  const resolved = path.resolve(targetPath)
  if (resolved === path.resolve(CODEX_CONFIG_PATH)) {
    return true
  }

  return SAFE_OPEN_ROOTS.some((root) => {
    const relative = path.relative(path.resolve(root), resolved)
    return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))
  })
}

function discoverPlugins(config: CodexConfigState) {
  const pluginMap = new Map<string, ManagedPlugin>()

  discoverPluginRoot(path.join(CODEX_HOME, "plugins", "cache"), "Plugin cache", config, pluginMap)
  discoverMarketplacePluginRoot(
    path.join(CODEX_HOME, ".tmp", "marketplaces"),
    "Third party",
    config,
    pluginMap
  )

  return pluginMap
}

function discoverPluginRoot(
  root: string,
  source: SkillSource,
  config: CodexConfigState,
  pluginMap: Map<string, ManagedPlugin>
) {
  if (!existsSync(root)) {
    return
  }

  for (const metadataPath of findPluginMetadataFiles(root)) {
    const pluginPath = path.dirname(path.dirname(metadataPath))
    const relative = path.relative(root, pluginPath).split(path.sep)
    const marketplace = relative[0]

    if (!marketplace) {
      continue
    }

    const metadata = readJson<PluginMetadata>(metadataPath) ?? {}
    const pluginName = metadata.name ?? relative[1] ?? path.basename(pluginPath)
    const key = `${pluginName}@${marketplace}`
    pluginMap.set(key, createManagedPlugin(key, pluginPath, marketplace, source, config, metadata))
  }
}

function discoverMarketplacePluginRoot(
  root: string,
  source: SkillSource,
  config: CodexConfigState,
  pluginMap: Map<string, ManagedPlugin>
) {
  if (!existsSync(root)) {
    return
  }

  for (const metadataPath of findPluginMetadataFiles(root)) {
    const pluginPath = path.dirname(path.dirname(metadataPath))
    const relative = path.relative(root, pluginPath).split(path.sep)
    const marketplace = relative[0]

    if (!marketplace) {
      continue
    }

    const metadata = readJson<PluginMetadata>(metadataPath) ?? {}
    const pluginName = metadata.name ?? relative.at(-1) ?? path.basename(pluginPath)
    const key = `${pluginName}@${marketplace}`
    pluginMap.set(key, createManagedPlugin(key, pluginPath, marketplace, source, config, metadata))
  }
}

function findPluginMetadataFiles(root: string) {
  const metadataFiles: string[] = []

  const walk = (currentPath: string) => {
    for (const entry of readdirSync(currentPath, { withFileTypes: true })) {
      const entryPath = path.join(currentPath, entry.name)

      if (!entry.isDirectory()) {
        continue
      }

      const metadataPath = path.join(entryPath, ".codex-plugin", "plugin.json")

      if (existsSync(metadataPath)) {
        metadataFiles.push(metadataPath)
        continue
      }

      if (entry.name === ".git" || entry.name === "node_modules") {
        continue
      }

      walk(entryPath)
    }
  }

  walk(root)
  return metadataFiles
}

function createManagedPlugin(
  key: string,
  pluginPath: string,
  marketplace: string,
  source: SkillSource,
  config: CodexConfigState,
  metadata: PluginMetadata
): ManagedPlugin {
  const configEntry = config.plugins.get(key)
  const enabled = configEntry?.enabled ?? true
  const appPath = path.join(pluginPath, ".app.json")
  const appMetadata = readJson<AppMetadata>(appPath)
  const origin = getPluginOrigin(marketplace, source)

  return {
    key,
    detailId: encodeDetailId(pluginPath),
    name: metadata.name ?? path.basename(pluginPath),
    displayName: metadata.interface?.displayName ?? metadata.name ?? path.basename(pluginPath),
    description:
      metadata.interface?.shortDescription ??
      metadata.description ??
      "No plugin description provided.",
    source,
    marketplace,
    path: pluginPath,
    relativePath: path.relative(HOME, pluginPath),
    enabled,
    statusReason: enabled
      ? "Enabled by Codex plugin config or default"
      : `Disabled by [plugins."${key}"] in Codex config`,
    origin,
    controlGate: getPluginControlGate(key, configEntry),
    version: metadata.version,
    repository: metadata.repository,
    homepage: metadata.homepage,
    skills: [],
    mcpServerCount: countPluginMcpServers(pluginPath),
    appCount: appMetadata?.apps ? Object.keys(appMetadata.apps).length : 0,
  }
}

function walkForSkillFiles(
  root: string,
  source: SkillSource,
  files: ManagedSkill[],
  config: CodexConfigState,
  pluginMap: Map<string, ManagedPlugin>,
  pluginKeysWithSkills: Set<string>
) {
  if (!existsSync(root)) {
    return
  }

  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const entryPath = path.join(root, entry.name)

    if (entry.isDirectory()) {
      walkForSkillFiles(entryPath, source, files, config, pluginMap, pluginKeysWithSkills)
      continue
    }

    if (entry.name !== "SKILL.md") {
      continue
    }

    const parsed = parseSkillMarkdown(entryPath)
    const pluginKey = getPluginKeyForSkillPath(entryPath)
    const parentPlugin = pluginKey ? pluginMap.get(pluginKey) : undefined
    const status = getSkillStatus(entryPath, config, parentPlugin)
    const origin = parentPlugin?.origin ?? getSkillOrigin(entryPath, source)
    const controlGate = getSkillControlGate(entryPath, status.effectiveStatus, config, parentPlugin)
    const skill: ManagedSkill = {
      id: entryPath,
      detailId: encodeDetailId(entryPath),
      name: parsed.name,
      description: parsed.description,
      source,
      path: entryPath,
      relativePath: path.relative(HOME, entryPath),
      status: status.effectiveStatus === "active" ? "active" : "disabled",
      effectiveStatus: status.effectiveStatus,
      statusReason: status.reason,
      editable:
        status.effectiveStatus !== "disabled-by-plugin" &&
        status.effectiveStatus !== "installed-not-loaded",
      origin,
      controlGate,
      parentPluginKey: parentPlugin?.key,
      parentPluginName: parentPlugin?.displayName,
    }

    files.push(skill)

    if (parentPlugin) {
      parentPlugin.skills.push(skill)
      parentPlugin.skills.sort(sortSkills)
      pluginKeysWithSkills.add(parentPlugin.key)
    }
  }
}

function parseSkillMarkdown(filePath: string) {
  const content = readFileSync(filePath, "utf8")
  const frontMatter = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  const block = frontMatter?.[1] ?? ""
  const titleMatch = content.match(/^#\s+(.+)$/m)

  const getField = (field: string) => {
    const lines = block.split(/\r?\n/)
    const fieldIndex = lines.findIndex((line) => line.startsWith(`${field}:`))

    if (fieldIndex === -1) {
      return undefined
    }

    const fieldLine = lines[fieldIndex]

    if (!fieldLine) {
      return undefined
    }

    const rawValue = fieldLine.slice(field.length + 1).trim()

    if (rawValue === ">" || rawValue === "|") {
      const foldedLines: string[] = []

      for (const line of lines.slice(fieldIndex + 1)) {
        if (!line.startsWith(" ") && !line.startsWith("\t")) {
          break
        }

        foldedLines.push(line.trim())
      }

      return foldedLines.filter(Boolean).join(" ")
    }

    return rawValue.replace(/^["']|["']$/g, "")
  }

  return {
    name: getField("name") ?? titleMatch?.[1]?.trim() ?? path.basename(path.dirname(filePath)),
    description: getField("description") ?? "No description provided.",
  }
}

function getSkillStatus(
  skillPath: string,
  config: CodexConfigState,
  parentPlugin?: ManagedPlugin
) {
  const normalizedPath = normalizePath(skillPath)

  if (config.disabledSkillPaths.has(normalizedPath)) {
    return {
      effectiveStatus: "disabled-by-skill" as const,
      reason: "Disabled by [[skills.config]] in Codex config",
    }
  }

  if (parentPlugin && !parentPlugin.enabled) {
    return {
      effectiveStatus: "disabled-by-plugin" as const,
      reason: `Disabled by parent plugin ${parentPlugin.key}`,
    }
  }

  if (
    skillPath.includes(`${path.sep}.disabled${path.sep}`) ||
    path.basename(path.dirname(skillPath)).endsWith(".disabled")
  ) {
    return {
      effectiveStatus: "installed-not-loaded" as const,
      reason: "Disabled by folder naming",
    }
  }

  return {
    effectiveStatus: "active" as const,
    reason: parentPlugin ? "Controlled by enabled plugin" : "Enabled by default",
  }
}

function getSkillOrigin(skillPath: string, source: SkillSource): CapabilityOrigin {
  if (isInsidePath(path.join(CODEX_HOME, "skills", ".system"), skillPath)) {
    return {
      label: "Codex system",
      confidence: "known",
      detail: "Bundled in the Codex system skills folder.",
    }
  }

  if (source === "Codex local") {
    return {
      label: "Codex local",
      confidence: "inferred",
      detail: "Installed or copied into the local Codex skills folder.",
    }
  }

  if (source === "Agent local") {
    return {
      label: "Agent shared",
      confidence: "inferred",
      detail: "Loaded from the shared .agents skills folder.",
    }
  }

  return {
    label: source,
    confidence: "inferred",
    detail: "Origin inferred from the scanned folder.",
  }
}

function getPluginOrigin(marketplace: string, source: SkillSource): CapabilityOrigin {
  if (marketplace.startsWith("openai-")) {
    return {
      label: "OpenAI plugin",
      confidence: "known",
      detail: `Installed from the ${marketplace} plugin marketplace/cache.`,
    }
  }

  if (source === "Third party") {
    return {
      label: "Third-party plugin",
      confidence: "inferred",
      detail: `Installed from the ${marketplace} marketplace cache.`,
    }
  }

  return {
    label: "Plugin",
    confidence: "inferred",
    detail: `Installed from the ${marketplace} plugin cache.`,
  }
}

function getSkillControlGate(
  skillPath: string,
  status: EffectiveStatus,
  config: CodexConfigState,
  parentPlugin?: ManagedPlugin
): ControlGate {
  if (parentPlugin) {
    return parentPlugin.controlGate
  }

  if (status === "installed-not-loaded") {
    return {
      type: "folder",
      label: "Folder naming",
      editable: false,
      reason: "This skill is disabled by its folder name, not by Codex config.",
    }
  }

  const configEntry = config.skillEntries.get(normalizePath(skillPath))
  if (configEntry) {
    return getConfigControlGate("skill-config", "Skill config", configEntry.section, configEntry.line, true)
  }

  return {
    type: "default",
    label: "Default-enabled skill",
    path: CODEX_CONFIG_PATH,
    relativePath: path.relative(HOME, CODEX_CONFIG_PATH),
    section: "config.toml",
    editable: false,
    reason: "No exact [[skills.config]] entry exists yet; this skill is enabled by default until a staged change writes one.",
  }
}

function getPluginControlGate(pluginKey: string, configEntry?: ConfigGateEntry): ControlGate {
  if (configEntry) {
    return getConfigControlGate("plugin-config", "Plugin config", configEntry.section, configEntry.line, true)
  }

  return {
    type: "default",
    label: "Default-enabled plugin",
    path: CODEX_CONFIG_PATH,
    relativePath: path.relative(HOME, CODEX_CONFIG_PATH),
    section: "config.toml",
    editable: false,
    reason: "No exact [plugins.*] entry exists yet; this plugin is enabled by default until a staged change writes one.",
  }
}

function getConfigControlGate(
  type: Extract<ControlGate["type"], "skill-config" | "plugin-config" | "mcp-config">,
  label: string,
  section: string,
  line: number,
  editable: boolean
): ControlGate {
  return {
    type,
    label,
    path: CODEX_CONFIG_PATH,
    relativePath: path.relative(HOME, CODEX_CONFIG_PATH),
    line,
    section,
    editable,
    reason: `Controlled by ${section} in Codex config.toml.`,
    detailId: encodeDetailId(`${CODEX_CONFIG_PATH}#line:${line}`),
  }
}

function readCodexConfigState(): CodexConfigState {
  const disabledSkillPaths = new Set<string>()
  const skillEntries = new Map<string, ConfigGateEntry>()
  const plugins = new Map<string, ConfigGateEntry>()
  const mcpServers = new Map<string, ManagedMcpServer>()

  if (!existsSync(CODEX_CONFIG_PATH)) {
    return { disabledSkillPaths, skillEntries, plugins, mcpServers }
  }

  const lines = readFileSync(CODEX_CONFIG_PATH, "utf8").split(/\r?\n/)
  let section = ""
  let sectionLine = 1
  let pendingSkillPath: string | null = null
  let pendingSkillLine = 1
  let currentMcpName: string | null = null
  let currentMcpLine = 1
  let currentMcpEnabled = true
  let currentMcpTransport: ManagedMcpServer["transport"] = "unknown"
  let currentMcpEndpoint = "Not declared"

  const flushMcp = () => {
    if (!currentMcpName) {
      return
    }

    mcpServers.set(currentMcpName, {
      name: currentMcpName,
      detailId: encodeDetailId(`${CODEX_CONFIG_PATH}#mcp:${currentMcpName}`),
      source: "Codex config",
      enabled: currentMcpEnabled,
      transport: currentMcpTransport,
      endpoint: currentMcpEndpoint,
      statusReason: currentMcpEnabled
        ? "Enabled in Codex MCP config"
        : "Disabled in Codex MCP config",
      editable: true,
      origin: {
        label: "Codex config",
        confidence: "known",
        detail: "Declared directly in Codex config.toml.",
      },
      controlGate: getConfigControlGate("mcp-config", `MCP server ${currentMcpName}`, `mcp_servers.${currentMcpName}`, currentMcpLine, true),
      path: CODEX_CONFIG_PATH,
      relativePath: path.relative(HOME, CODEX_CONFIG_PATH),
    })
  }

  for (const [index, line] of lines.entries()) {
    const lineNumber = index + 1
    const trimmed = line.trim()
    const sectionMatch = trimmed.match(/^\[(.+)]$/)

    if (sectionMatch) {
      flushMcp()
      section = sectionMatch[1] ?? ""
      sectionLine = lineNumber
      pendingSkillPath = null
      pendingSkillLine = lineNumber
      currentMcpName = null
      currentMcpLine = lineNumber
      currentMcpEnabled = true
      currentMcpTransport = "unknown"
      currentMcpEndpoint = "Not declared"

      const mcpMatch = section.match(/^mcp_servers\.([^.]+)$/)
      if (mcpMatch) {
        currentMcpName = mcpMatch[1]?.replace(/^"|"$/g, "") ?? null
        currentMcpLine = lineNumber
      }

      continue
    }

    if (section === "[skills.config]") {
      const pathMatch = trimmed.match(/^path\s*=\s*(.+)$/)
      const enabledMatch = trimmed.match(/^enabled\s*=\s*(true|false)$/)

      if (pathMatch) {
        pendingSkillPath = parseTomlString(pathMatch[1] ?? "")
        pendingSkillLine = sectionLine
        continue
      }

      if (enabledMatch?.[1] && pendingSkillPath) {
        const normalizedPath = normalizePath(pendingSkillPath)
        const enabled = enabledMatch[1] === "true"
        skillEntries.set(normalizedPath, {
          enabled,
          line: pendingSkillLine,
          section: "[[skills.config]]",
        })

        if (!enabled) {
          disabledSkillPaths.add(normalizedPath)
        }
      }

      continue
    }

    const pluginMatch = section.match(/^plugins\."(.+)"$/)
    if (pluginMatch && trimmed.startsWith("enabled =")) {
      const pluginKey = pluginMatch[1] ?? ""
      plugins.set(pluginKey, {
        enabled: trimmed.endsWith("true"),
        line: sectionLine,
        section: `plugins."${pluginKey}"`,
      })
      continue
    }

    if (currentMcpName) {
      if (trimmed === "enabled = false") {
        currentMcpEnabled = false
      } else if (trimmed.startsWith("command =")) {
        currentMcpTransport = "command"
        currentMcpEndpoint = parseTomlString(trimmed.slice("command =".length))
      } else if (trimmed.startsWith("url =")) {
        currentMcpTransport = "url"
        currentMcpEndpoint = parseTomlString(trimmed.slice("url =".length))
      }
    }
  }

  flushMcp()

  return { disabledSkillPaths, skillEntries, plugins, mcpServers }
}

function getPluginMcpServers(plugin: ManagedPlugin): ManagedMcpServer[] {
  const mcpPath = path.join(plugin.path, ".mcp.json")
  const mcpConfig = readJson<{ mcpServers?: Record<string, { command?: string; url?: string }> }>(mcpPath)

  if (!mcpConfig?.mcpServers) {
    return []
  }

  return Object.entries(mcpConfig.mcpServers).map(([name, server]) => ({
    name,
    detailId: encodeDetailId(`${mcpPath}#mcp:${name}`),
    source: "Plugin" as const,
    parentPluginKey: plugin.key,
    enabled: plugin.enabled,
    transport: server.url ? "url" : server.command ? "command" : "unknown",
    endpoint: server.url ?? server.command ?? "Not declared",
    statusReason: plugin.enabled
      ? "Controlled by enabled plugin"
      : "Inactive: plugin disabled",
    editable: false,
    origin: plugin.origin,
    controlGate: plugin.controlGate.path
      ? plugin.controlGate
      : {
          type: "plugin-manifest" as const,
          label: "Plugin MCP manifest",
          path: mcpPath,
          relativePath: path.relative(HOME, mcpPath),
          line: 1,
          section: "mcpServers",
          editable: false,
          reason: "This MCP server is declared by the plugin and gated by the parent plugin.",
          detailId: encodeDetailId(`${mcpPath}#line:1`),
        },
    path: mcpPath,
    relativePath: path.relative(HOME, mcpPath),
  }))
}

function countPluginMcpServers(pluginPath: string) {
  const mcpConfig = readJson<{ mcpServers?: Record<string, unknown> }>(
    path.join(pluginPath, ".mcp.json")
  )
  return mcpConfig?.mcpServers ? Object.keys(mcpConfig.mcpServers).length : 0
}

function getPluginKeyForSkillPath(skillPath: string) {
  const pluginCacheRoot = path.join(CODEX_HOME, "plugins", "cache")
  const marketplaceRoot = path.join(CODEX_HOME, ".tmp", "marketplaces")

  const pluginCacheRelative = path.relative(pluginCacheRoot, skillPath)

  if (!pluginCacheRelative.startsWith("..") && !path.isAbsolute(pluginCacheRelative)) {
    const [marketplace, plugin] = pluginCacheRelative.split(path.sep)
    return marketplace && plugin ? `${plugin}@${marketplace}` : null
  }

  const marketplaceRelative = path.relative(marketplaceRoot, skillPath)

  if (!marketplaceRelative.startsWith("..") && !path.isAbsolute(marketplaceRelative)) {
    const parts = marketplaceRelative.split(path.sep)
    const marketplace = parts[0]
    const plugin = parts[1] === "plugins" ? parts[2] : marketplace
    return marketplace && plugin ? `${plugin}@${marketplace}` : null
  }

  return null
}

function getNewestModifiedAt(skills: ManagedSkill[]) {
  const latest = skills.reduce<number | null>((newest, skill) => {
    const modified = statSync(skill.path).mtimeMs
    return newest === null || modified > newest ? modified : newest
  }, null)

  return latest ? new Date(latest).toLocaleString("en-MY") : "No skills found"
}

function readJson<T>(filePath: string) {
  if (!existsSync(filePath)) {
    return null
  }

  try {
    return JSON.parse(readFileSync(filePath, "utf8")) as T
  } catch {
    return null
  }
}

function readPreview(filePath: string) {
  if (!existsSync(filePath)) {
    return "Preview file is not available."
  }

  return readFileSync(filePath, "utf8").slice(0, 12000)
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

function normalizePath(filePath: string) {
  return path.resolve(filePath).toLowerCase()
}

function encodeDetailId(filePath: string) {
  return Buffer.from(filePath, "utf8").toString("base64url")
}

function decodeFilePart(detailId: string) {
  const decodedPath = decodeDetailId(detailId)
  return decodedPath?.split("#")[0] ?? null
}

function decodeLinePart(detailId: string) {
  const decodedPath = decodeDetailId(detailId)
  const lineMatch = decodedPath?.match(/#line:(\d+)$/)
  return lineMatch?.[1] ? Number(lineMatch[1]) : 1
}

function sortSkills(left: ManagedSkill, right: ManagedSkill) {
  const bySource = left.source.localeCompare(right.source)
  return bySource || left.name.localeCompare(right.name)
}

function formatStatus(status: EffectiveStatus) {
  const labels: Record<EffectiveStatus, string> = {
    active: "Active",
    "disabled-by-plugin": "Disabled by plugin",
    "disabled-by-skill": "Disabled by skill config",
    "installed-not-loaded": "Installed, not loaded",
  }
  return labels[status]
}

export function getOpenablePath(detailId: string) {
  return getOpenableTarget(detailId)?.path ?? null
}

export function getOpenableTarget(detailId: string) {
  const decodedPath = decodeFilePart(detailId)

  if (!decodedPath || !isSafeLocalPath(decodedPath)) {
    return null
  }

  return {
    path: decodedPath,
    line: decodeLinePart(detailId),
  }
}

function isInsidePath(root: string, targetPath: string) {
  const relative = path.relative(path.resolve(root), path.resolve(targetPath))
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))
}
