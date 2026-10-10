import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { provenanceFor } from "./skill-provenance.ts"
import { provenanceRanking } from "./provenance-ranking.ts"

test("plugin publisher is attributed without inventing skill authorship", () => {
  const root = mkdtempSync(path.join(tmpdir(), "provenance-fixture-"))
  try {
    mkdirSync(path.join(root, ".codex-plugin"))
    mkdirSync(path.join(root, "skills", "example"), { recursive: true })
    const file = path.join(root, "skills", "example", "SKILL.md")
    writeFileSync(file, "---\nname: example\n---\nExample")
    writeFileSync(path.join(root, ".codex-plugin", "plugin.json"), JSON.stringify({ author: { name: "Publisher" }, repository: "https://github.com/owner/plugin" }))
    const p = provenanceFor(file)
    assert.equal(p.publisher, "Publisher")
    assert.equal(p.author, undefined)
    assert.equal(p.owner, "owner")
    assert.equal(p.skillPath, "skills/example/SKILL.md")
    assert.equal(p.evidence, "Plugin manifest")
    assert.equal(provenanceRanking([{ path: file, provenance: p }], "author")[0]?.owner, "Author not declared")
    writeFileSync(path.join(root, ".codex-plugin", "plugin.json"), JSON.stringify({ author: { name: "Publisher" } }))
    const missingRepo = provenanceFor(file)
    assert.equal(missingRepo.publisher, "Publisher")
    assert.equal(missingRepo.source, undefined)
    assert.equal(provenanceRanking([{ path: file, provenance: missingRepo }])[0]?.owner, "Publisher: Publisher")
  } finally { rmSync(root, { recursive: true, force: true }) }
})
