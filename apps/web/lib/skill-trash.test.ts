import assert from "node:assert/strict"
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"

import {
  listSkillTrash,
  purgeSkill,
  restoreSkill,
  trashSkill,
} from "./skill-trash.ts"

function setupCodexHome() {
  const codexHome = mkdtempSync(path.join(tmpdir(), "skills-mgmnt-trash-"))
  process.env.CODEX_HOME = codexHome
  return codexHome
}

function createSkill(codexHome: string, name: string) {
  const skillPath = path.join(codexHome, "skills", name, "SKILL.md")
  mkdirSync(path.dirname(skillPath), { recursive: true })
  writeFileSync(skillPath, `---\nname: ${name}\n---\n`, "utf8")
  return skillPath
}

test("moves a skill folder to trash and lists it", () => {
  const codexHome = setupCodexHome()
  const skillPath = createSkill(codexHome, "example")

  const entry = trashSkill(skillPath, "example")

  assert.ok(!existsSync(path.dirname(skillPath)), "original folder should be gone")
  assert.ok(existsSync(entry.trashedPath), "trashed folder should exist")
  assert.equal(listSkillTrash().length, 1)
  assert.equal(listSkillTrash()[0]?.skillName, "example")
})

test("restores a trashed skill to its original path", () => {
  const codexHome = setupCodexHome()
  const skillPath = createSkill(codexHome, "example")

  const entry = trashSkill(skillPath, "example")
  restoreSkill(entry.id)

  assert.ok(existsSync(skillPath), "skill file should be restored")
  assert.equal(listSkillTrash().length, 0)
})

test("purge deletes the trashed folder permanently", () => {
  const codexHome = setupCodexHome()
  const skillPath = createSkill(codexHome, "example")

  const entry = trashSkill(skillPath, "example")
  purgeSkill(entry.id)

  assert.ok(!existsSync(entry.trashedPath))
  assert.equal(listSkillTrash().length, 0)
})

test("trashSkill rejects unknown paths", () => {
  setupCodexHome()

  assert.throws(
    () => trashSkill(path.join("Z:", "missing", "SKILL.md"), "missing"),
    /not found/
  )
})

test("restore refuses to overwrite an existing skill", () => {
  const codexHome = setupCodexHome()
  const skillPath = createSkill(codexHome, "example")

  const entry = trashSkill(skillPath, "example")
  mkdirSync(path.dirname(skillPath), { recursive: true })
  writeFileSync(skillPath, "---\nname: recreated\n---\n", "utf8")

  assert.throws(() => restoreSkill(entry.id), /already exists/)
})
