import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { acquireSkillOperation } from "./skill-operation-lock.ts"
test("mutations serialize and unfinished recovery journals block further changes", () => {
  const root = mkdtempSync(path.join(tmpdir(), "skill-lock-test-"))
  const previous = process.env.AGENTS_HOME
  process.env.AGENTS_HOME = root
  try {
    const release = acquireSkillOperation()
    assert.throws(acquireSkillOperation, /Another skill mutation/)
    release()
    const backup = path.join(root, "registry", "backups")
    mkdirSync(backup, { recursive: true })
    const journal = path.join(backup, "fixture.recovery.json")
    writeFileSync(journal, JSON.stringify({ status: "pending" }))
    assert.throws(acquireSkillOperation, /requires recovery/)
    writeFileSync(journal, JSON.stringify({ status: "rolled-back" }))
    acquireSkillOperation()()
  } finally {
    if (previous === undefined) delete process.env.AGENTS_HOME
    else process.env.AGENTS_HOME = previous
    rmSync(root, { recursive: true, force: true })
  }
})
