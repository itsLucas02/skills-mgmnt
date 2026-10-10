import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"

test("plugin backups and staging folders do not count as installed skills or plugins", async () => {
  const codexHome = mkdtempSync(path.join(tmpdir(), "skills-archive-fixture-"))
  const agentsHome = mkdtempSync(path.join(tmpdir(), "skills-archive-agents-"))
  for (const directory of ["active", "plugin-backup-fixture", "marketplace-backup-fixture", ".staging"]) {
    const root = path.join(codexHome, "plugins", "cache", directory, "plugin", "1")
    mkdirSync(path.join(root, ".codex-plugin"), { recursive: true })
    mkdirSync(path.join(root, "skills", "example"), { recursive: true })
    writeFileSync(path.join(root, ".codex-plugin", "plugin.json"), JSON.stringify({ name: "fixture-plugin" }))
    writeFileSync(path.join(root, "skills", "example", "SKILL.md"), "---\nname: example\ndescription: Example\n---\n")
  }
  process.env.CODEX_HOME = codexHome; process.env.AGENTS_HOME = agentsHome
  const { getCapabilityInventory } = await import(`./skills.ts?archive=${Date.now()}`) as typeof import("./skills.ts")
  const inventory = getCapabilityInventory()
  assert.equal(inventory.skills.length, 1)
  assert.equal(inventory.plugins.length, 1)
  assert.equal(inventory.plugins[0]?.marketplace, "active")
})

test("marks skills disabled by Codex [[skills.config]] blocks", async () => {
  const codexHome = mkdtempSync(path.join(tmpdir(), "skills-mgmnt-codex-"))
  const agentsHome = mkdtempSync(path.join(tmpdir(), "skills-mgmnt-agents-"))
  const skillPath = path.join(codexHome, "skills", "example", "SKILL.md")

  mkdirSync(path.dirname(skillPath), { recursive: true })
  writeFileSync(
    skillPath,
    [
      "---",
      "name: example",
      "description: Example disabled skill.",
      "---",
      "",
      "# Example",
      "",
    ].join("\n"),
    "utf8"
  )
  writeFileSync(
    path.join(codexHome, "config.toml"),
    [
      "[[skills.config]]",
      `path = "${skillPath.replace(/\\/g, "\\\\")}"`,
      "enabled = false",
      "",
    ].join("\n"),
    "utf8"
  )

  process.env.CODEX_HOME = codexHome
  process.env.AGENTS_HOME = agentsHome

  const { getCapabilityInventory } = await import("./skills.ts")
  const inventory = getCapabilityInventory()
  const skill = inventory.skills.find((item) => item.path === skillPath)

  assert.equal(skill?.effectiveStatus, "disabled-by-skill")
  assert.equal(skill?.status, "disabled")
})

test("marks skills disabled by Codex skill config blocks with TOML header spacing", async () => {
  const codexHome = mkdtempSync(path.join(tmpdir(), "skills-mgmnt-codex-"))
  const agentsHome = mkdtempSync(path.join(tmpdir(), "skills-mgmnt-agents-"))
  const skillPath = path.join(codexHome, "skills", "spaced-header", "SKILL.md")

  mkdirSync(path.dirname(skillPath), { recursive: true })
  writeFileSync(
    skillPath,
    [
      "---",
      "name: spaced-header",
      "description: Example disabled skill with a spaced TOML header.",
      "---",
      "",
      "# Spaced Header",
      "",
    ].join("\n"),
    "utf8"
  )
  writeFileSync(
    path.join(codexHome, "config.toml"),
    [
      "[[ skills.config ]]",
      `path = "${skillPath.replace(/\\/g, "\\\\")}"`,
      "enabled = false",
      "",
    ].join("\n"),
    "utf8"
  )

  process.env.CODEX_HOME = codexHome
  process.env.AGENTS_HOME = agentsHome

  const { getCapabilityInventory } = await import(
    `./skills.ts?case=${Date.now()}`
  ) as typeof import("./skills.ts")
  const inventory = getCapabilityInventory()
  const skill = inventory.skills.find((item) => item.path === skillPath)

  assert.equal(skill?.effectiveStatus, "disabled-by-skill")
  assert.equal(skill?.status, "disabled")
})

test("reuses the cached inventory until a scanned root changes", async () => {
  const codexHome = mkdtempSync(path.join(tmpdir(), "skills-mgmnt-codex-"))
  const agentsHome = mkdtempSync(path.join(tmpdir(), "skills-mgmnt-agents-"))
  const skillPath = path.join(codexHome, "skills", "cache-check", "SKILL.md")

  mkdirSync(path.dirname(skillPath), { recursive: true })
  writeFileSync(
    skillPath,
    "---\nname: cache-check\ndescription: Cache check skill.\n---\n",
    "utf8"
  )

  process.env.CODEX_HOME = codexHome
  process.env.AGENTS_HOME = agentsHome

  const { getCapabilityInventory, invalidateInventoryCache } = await import(
    `./skills.ts?case=${Date.now()}`
  ) as typeof import("./skills.ts")

  const first = getCapabilityInventory()
  const cached = getCapabilityInventory()
  assert.equal(cached, first, "unchanged roots should return the cached inventory")

  // Bump the skill folder mtime to invalidate the cache.
  writeFileSync(
    path.join(codexHome, "config.toml"),
    `[[skills.config]]\npath = "${skillPath.replace(/\\/g, "\\\\")}"\nenabled = false\n`,
    "utf8"
  )

  const refreshed = getCapabilityInventory()
  assert.notEqual(refreshed, first, "config changes should invalidate the cache")
  assert.equal(
    refreshed.skills.find((item) => item.path === skillPath)?.effectiveStatus,
    "disabled-by-skill"
  )

  invalidateInventoryCache()
})
