import { test } from "node:test"
import assert from "node:assert/strict"
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import {
  actualSkillPath,
  canIsolate,
  isolationEntries,
  prepareIsolation,
} from "./skill-isolation.ts"

test("isolation restores content and can roll back a batch without losing provenance", () => {
  const root = mkdtempSync(path.join(tmpdir(), "skill-isolation-"))
  const previous = process.env.AGENTS_HOME
  process.env.AGENTS_HOME = root
  try {
    const folder = path.join(root, "skills", "fixture-unique-isolation")
    mkdirSync(folder, { recursive: true })
    const file = path.join(folder, "SKILL.md")
    writeFileSync(file, "original content")
    writeFileSync(
      path.join(root, ".skill-lock.json"),
      JSON.stringify({
        version: 3,
        skills: { "fixture-unique-isolation": { source: "local" }, missing: { source: "local" } },
      })
    )
    assert.equal(
      canIsolate(path.join(root, "skills", "..", "elsewhere", "SKILL.md")),
      false
    )
    const disabled = prepareIsolation([
      { kind: "skill", target: file, enabled: false },
    ])
    disabled.commit()
    assert.equal(existsSync(file), false)
    assert.equal(
      readFileSync(actualSkillPath(file), "utf8"),
      "original content"
    )
    assert.equal(readFileSync(path.join(root, ".skill-lock.json"))[0], 123)
    const enabled = prepareIsolation([
      { kind: "skill", target: file, enabled: true },
    ])
    enabled.rollback()
    assert.equal(existsSync(file), false)
    assert.equal(isolationEntries().length, 1)
    const manifest = path.join(root, "registry", "skill-isolation.json")
    const goodManifest = readFileSync(manifest, "utf8")
    const tampered = JSON.parse(goodManifest)
    tampered.entries[0].adapters = [path.join(root, "outside", "victim")]
    writeFileSync(manifest, JSON.stringify(tampered))
    assert.throws(() => isolationEntries(), /provider path/)
    writeFileSync(manifest, goodManifest)
    prepareIsolation([{ kind: "skill", target: file, enabled: true }]).commit()
    assert.equal(readFileSync(file, "utf8"), "original content")
    assert.equal(isolationEntries().length, 0)
    assert.throws(() =>
      prepareIsolation([
        { kind: "skill", target: file, enabled: false },
        {
          kind: "skill",
          target: path.join(root, "skills", "missing", "SKILL.md"),
          enabled: false,
        },
      ])
    )
    assert.equal(existsSync(file), true)
  } finally {
    if (previous === undefined) delete process.env.AGENTS_HOME
    else process.env.AGENTS_HOME = previous
    rmSync(root, { recursive: true, force: true })
  }
})
