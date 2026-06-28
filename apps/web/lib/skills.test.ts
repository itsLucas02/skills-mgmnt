import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"

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
