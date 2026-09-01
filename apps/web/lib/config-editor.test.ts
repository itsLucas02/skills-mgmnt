import assert from "node:assert/strict"
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"

import type { ConfigChange } from "./config-editor.ts"
import {
  applyConfigChanges,
  dismissRestartWarning,
  getApplyState,
  previewConfigChanges,
  previewConfigDiff,
} from "./config-editor.ts"

function setupCodexHome(initialConfig: string) {
  const codexHome = mkdtempSync(path.join(tmpdir(), "skills-mgmnt-config-"))
  writeFileSync(path.join(codexHome, "config.toml"), initialConfig, "utf8")
  process.env.CODEX_HOME = codexHome
  return codexHome
}

function readConfig(codexHome: string) {
  return readFileSync(path.join(codexHome, "config.toml"), "utf8")
}

const skillPath = (name: string) =>
  path.join("C:", "Users", "User", ".codex", "skills", name, "SKILL.md")

function skillChange(name: string, enabled: boolean): ConfigChange {
  return {
    id: `skill-${name}-${enabled}`,
    kind: "skill",
    label: name,
    target: skillPath(name),
    enabled,
  }
}

function pluginChange(target: string, enabled: boolean): ConfigChange {
  return {
    id: `plugin-${target}-${enabled}`,
    kind: "plugin",
    label: target,
    target,
    enabled,
  }
}

function mcpChange(target: string, enabled: boolean): ConfigChange {
  return {
    id: `mcp-${target}-${enabled}`,
    kind: "mcp",
    label: target,
    target,
    enabled,
  }
}

test("toggles enabled in an existing [plugins.*] section", () => {
  const codexHome = setupCodexHome(`[plugins."foo@openai"]\nenabled = true\n`)

  applyConfigChanges([pluginChange("foo@openai", false)])

  assert.equal(
    readConfig(codexHome),
    `[plugins."foo@openai"]\nenabled = false\n\n`
  )
})

test("appends a missing [plugins.*] section", () => {
  const codexHome = setupCodexHome(`model = "gpt-5"\n`)

  applyConfigChanges([pluginChange("foo@openai", false)])

  assert.equal(
    readConfig(codexHome),
    `model = "gpt-5"\n\n[plugins."foo@openai"]\nenabled = false\n`
  )
})

test("reports before/after in the applied preview", () => {
  setupCodexHome(`[plugins."foo@openai"]\nenabled = true\n`)

  const result = applyConfigChanges([pluginChange("foo@openai", false)])

  assert.equal(result.preview[0]?.before, true)
  assert.equal(result.preview[0]?.after, false)
  assert.equal(result.preview[0]?.summary, "Plugin foo@openai: enabled -> disabled")
})

test("preserves unrelated keys when toggling a plugin section", () => {
  const codexHome = setupCodexHome(
    `[plugins."foo@openai"]\nenabled = true\nauto_update = false\n\n[plugins."bar@openai"]\nenabled = false\n`
  )

  applyConfigChanges([pluginChange("foo@openai", false)])

  const config = readConfig(codexHome)
  assert.match(config, /auto_update = false/)
  assert.match(config, /\[plugins\."bar@openai"\]\nenabled = false/)
})

test("deduplicates duplicate [plugins.*] sections before writing", () => {
  const codexHome = setupCodexHome(
    `[plugins."foo@openai"]\nenabled = true\n\n[plugins."foo@openai"]\nenabled = false\n`
  )

  applyConfigChanges([pluginChange("foo@openai", true)])

  const config = readConfig(codexHome)
  const headerCount = config.match(/\[plugins\."foo@openai"\]/g)?.length ?? 0
  assert.equal(headerCount, 1)
  assert.match(config, /\[plugins\."foo@openai"\]\nenabled = true/)
})

test("writes an existing [[skills.config]] path with new enabled value", () => {
  const target = skillPath("example")
  const codexHome = setupCodexHome(
    `[[skills.config]]\npath = "${target.replace(/\\/g, "\\\\")}"\nenabled = true\n`
  )

  applyConfigChanges([skillChange("example", false)])

  const config = readConfig(codexHome)
  assert.match(config, /enabled = false/)
  assert.ok(config.includes(target.replace(/\\/g, "\\\\")))
})

test("appends a missing [[skills.config]] block with escaped path", () => {
  const codexHome = setupCodexHome(`model = "gpt-5"\n`)

  applyConfigChanges([skillChange("example", false)])

  const config = readConfig(codexHome)
  assert.match(config, /\[\[skills\.config\]\]/)
  assert.match(config, /path = "C:\\\\Users\\\\User\\\\\.codex\\\\skills\\\\example\\\\SKILL\.md"/)
  assert.match(config, /enabled = false/)
})

test("matches a [[skills.config]] path case-insensitively", () => {
  const target = skillPath("example")
  const upperCased = target.toUpperCase()
  const codexHome = setupCodexHome(
    `[[skills.config]]\npath = "${upperCased.replace(/\\/g, "\\\\")}"\nenabled = true\n`
  )

  applyConfigChanges([skillChange("example", false)])

  const config = readConfig(codexHome)
  const enabledLines = config.match(/^enabled = .+$/gm) ?? []
  assert.equal(enabledLines.length, 1)
  assert.match(config, /enabled = false/)
})

test("deduplicates duplicate [[skills.config]] blocks for the same path", () => {
  const target = skillPath("example").replace(/\\/g, "\\\\")
  const codexHome = setupCodexHome(
    `[[skills.config]]\npath = "${target}"\nenabled = true\n\n[[skills.config]]\npath = "${target}"\nenabled = false\n`
  )

  applyConfigChanges([skillChange("example", true)])

  const config = readConfig(codexHome)
  const blockCount = config.match(/\[\[skills\.config\]\]/g)?.length ?? 0
  assert.equal(blockCount, 1)
  assert.match(config, /enabled = true/)
})

test("toggles [mcp_servers.*] sections", () => {
  const codexHome = setupCodexHome(`[mcp_servers.docs]\ncommand = "npx"\nenabled = true\n`)

  applyConfigChanges([mcpChange("docs", false)])

  assert.equal(
    readConfig(codexHome),
    `[mcp_servers.docs]\ncommand = "npx"\nenabled = false\n\n`
  )
})

test("previewConfigChanges does not modify the config", () => {
  const codexHome = setupCodexHome(`[plugins."foo@openai"]\nenabled = true\n`)

  const preview = previewConfigChanges([pluginChange("foo@openai", false)])

  assert.equal(readConfig(codexHome), `[plugins."foo@openai"]\nenabled = true\n`)
  assert.equal(preview[0]?.before, true)
  assert.equal(preview[0]?.after, false)
})

test("rejects plugin targets containing quotes or brackets", () => {
  setupCodexHome(`model = "gpt-5"\n`)

  assert.throws(() => applyConfigChanges([pluginChange('evil"asection', false)]), /unsupported characters/)
})

test("rejects MCP targets containing line breaks", () => {
  setupCodexHome(`model = "gpt-5"\n`)

  assert.throws(() => applyConfigChanges([mcpChange("evil\nmcp", false)]), /unsupported characters/)
})

test("creates a timestamped backup before writing", () => {
  setupCodexHome(`model = "gpt-5"\n`)

  const result = applyConfigChanges([pluginChange("foo@openai", false)])

  assert.ok(existsSync(result.backupPath))
  assert.ok(result.backupPath.includes("config.backup-"))
  assert.equal(readFileSync(result.backupPath, "utf8"), `model = "gpt-5"\n`)
})

test("applyConfigChanges writes apply state with restart flag", () => {
  setupCodexHome(`model = "gpt-5"\n`)

  const result = applyConfigChanges([pluginChange("foo@openai", false)])
  const state = getApplyState()

  assert.equal(state.lastAppliedAt, result.appliedAt)
  assert.equal(state.backupPath, result.backupPath)
  assert.equal(state.restartRequired, true)
})

test("dismissRestartWarning clears the restart flag", () => {
  setupCodexHome(`model = "gpt-5"\n`)

  applyConfigChanges([pluginChange("foo@openai", false)])
  const state = dismissRestartWarning()

  assert.equal(state.restartRequired, false)
  assert.ok(state.restartDismissedAt)
  assert.equal(getApplyState().restartRequired, false)
})

test("skips changes missing id, target, or label", () => {
  const codexHome = setupCodexHome(`model = "gpt-5"\n`)

  applyConfigChanges([
    { id: "", kind: "plugin", label: "x", target: "x@openai", enabled: false },
    { id: "y", kind: "plugin", label: "", target: "y@openai", enabled: false },
    { id: "z", kind: "plugin", label: "z", target: "", enabled: false },
  ])

  assert.equal(readConfig(codexHome), `model = "gpt-5"\n`)
})

test("dedupes changes by id keeping the last intent", () => {
  const codexHome = setupCodexHome(`[plugins."foo@openai"]\nenabled = true\n`)

  applyConfigChanges([pluginChange("foo@openai", false), pluginChange("foo@openai", true)])

  assert.match(readConfig(codexHome), /enabled = true/)
})

test("escapes quotes inside skill paths", () => {
  const codexHome = setupCodexHome(`model = "gpt-5"\n`)
  const change: ConfigChange = {
    id: "quoted",
    kind: "skill",
    label: "quoted",
    target: 'C:\\skills\\odd"name\\SKILL.md',
    enabled: false,
  }

  applyConfigChanges([change])

  const config = readConfig(codexHome)
  assert.match(config, /path = "C:\\\\skills\\\\odd\\"name\\\\SKILL\.md"/)
})

test("prunes old config backups after apply", () => {
  const codexHome = setupCodexHome(`model = "gpt-5"\n`)

  for (let index = 0; index < 12; index += 1) {
    const stamp = `202601${String(index + 10).padStart(2, "0")}T000000Z`
    writeFileSync(
      path.join(codexHome, `config.backup-${stamp}.toml`),
      `# old backup ${index}\n`,
      "utf8"
    )
  }

  applyConfigChanges([pluginChange("foo@openai", false)])

  const remaining = readdirSync(codexHome).filter((name) =>
    /^config\.backup-.+\.toml$/.test(name)
  )
  assert.ok(remaining.length <= 11, "keeps at most 10 old backups plus the new one")
  assert.ok(
    remaining.some((name) => name.includes("20260121")),
    "keeps the newest backups and drops the oldest"
  )
})

test("previewConfigDiff reports added and removed config lines", () => {
  setupCodexHome(`model = "gpt-5"\n`)

  const diff = previewConfigDiff([pluginChange("foo@openai", false)])
  const added = diff.filter((entry) => entry.kind === "added")
  const removed = diff.filter((entry) => entry.kind === "removed")

  assert.ok(added.some((entry) => entry.text.includes('[plugins."foo@openai"]')))
  assert.ok(added.some((entry) => entry.text.includes("enabled = false")))
  assert.ok(removed.every((entry) => !entry.text.includes("plugins")))
})

test("previewConfigDiff shows toggled enabled lines as removed and added", () => {
  setupCodexHome(`[plugins."foo@openai"]\nenabled = true\n`)

  const diff = previewConfigDiff([pluginChange("foo@openai", false)])

  assert.ok(diff.some((entry) => entry.kind === "removed" && entry.text === "enabled = true"))
  assert.ok(diff.some((entry) => entry.kind === "added" && entry.text === "enabled = false"))
})

test("previewConfigDiff collapses unchanged regions", () => {
  setupCodexHome(
    Array.from({ length: 40 }, (_, index) => `# padding line ${index}`).join("\n") +
      `\n[plugins."foo@openai"]\nenabled = true\n`
  )

  const diff = previewConfigDiff([pluginChange("foo@openai", false)])
  const hasEllipsis = diff.some((entry) => entry.text === "...")
  const contextLines = diff.filter((entry) => entry.kind === "context" && entry.text !== "...")

  assert.ok(hasEllipsis, "long unchanged regions should collapse to ...")
  assert.ok(contextLines.length <= 10, "collapsed diff should keep only nearby context")
})
