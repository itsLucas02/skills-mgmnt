import { test } from "node:test"
import assert from "node:assert/strict"
import {
  updateStatus,
  validateUpstream,
  folderHash,
  installPreparedSkillUpdate,
  assertReviewedSubtree,
  createUpdateScan,
  checkSkillUpdate,
} from "./skill-updates.ts"
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  existsSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { prepareIsolation, actualSkillPath } from "./skill-isolation.ts"
test("update comparison distinguishes unknown baselines and local modifications", () => {
  assert.equal(updateStatus("a", "a"), "Up to date")
  assert.equal(updateStatus("a", "b"), "Cannot verify")
  assert.equal(updateStatus("a", "b", "a"), "Update available")
  assert.equal(updateStatus("edited", "b", "a"), "Locally modified")
  assert.throws(() => validateUpstream("owner/repo", "../SKILL.md"))
  assert.throws(() =>
    validateUpstream("owner/repo;command", "skills/a/SKILL.md")
  )
  validateUpstream("owner/repo", "skills/a/SKILL.md")
  validateUpstream("owner/repo", "SKILL.md")
})
test("review validity depends on skill content, not unrelated repository files", () => {
  const root = mkdtempSync(path.join(tmpdir(), "review-subtree-"))
  try {
    const skill = path.join(root, "skills", "example")
    mkdirSync(skill, { recursive: true })
    writeFileSync(path.join(skill, "SKILL.md"), "reviewed")
    const hash = folderHash(skill)
    writeFileSync(path.join(root, "unrelated.txt"), "new repository commit")
    assert.doesNotThrow(() => assertReviewedSubtree(root, "skills/example/SKILL.md", hash))
    writeFileSync(path.join(skill, "SKILL.md"), "changed instructions")
    assert.throws(() => assertReviewedSubtree(root, "skills/example/SKILL.md", hash), /upstream content changed/)
  } finally { rmSync(root, { recursive: true, force: true }) }
})
test("a shared repository snapshot checks multiple skills without additional clones", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "scan-group-"))
  const previous = process.env.AGENTS_HOME
  process.env.AGENTS_HOME = root
  try {
    const skills: Record<string, unknown> = {}
    const files = ["one", "two"].map(name => {
      const folder = path.join(root, "skills", name)
      mkdirSync(folder, { recursive: true }); writeFileSync(path.join(folder, "SKILL.md"), name)
      const upstream = path.join(root, "repo", "skills", name)
      mkdirSync(upstream, { recursive: true }); writeFileSync(path.join(upstream, "SKILL.md"), name)
      skills[name] = { source: "owner/repo", sourceType: "github", sourceUrl: "https://github.com/owner/repo.git", skillPath: `skills/${name}/SKILL.md` }
      return path.join(folder, "SKILL.md")
    })
    writeFileSync(path.join(root, ".skill-lock.json"), JSON.stringify({ skills }))
    const scan = createUpdateScan(files)
    assert.equal(scan.paths.size, 1)
    assert.deepEqual(scan.paths.get("owner/repo"), ["skills/one", "skills/two"])
    scan.repositories.set("owner/repo", Promise.resolve({ temp: root, repo: path.join(root, "repo"), revision: "a".repeat(40) }))
    const results = await Promise.all(files.map(file => checkSkillUpdate(file, scan)))
    assert.deepEqual(results.map(r => r.status), ["Up to date", "Up to date"])
    assert.equal(scan.repositories.size, 1)
  } finally {
    if (previous === undefined) delete process.env.AGENTS_HOME; else process.env.AGENTS_HOME = previous
    rmSync(root, { recursive: true, force: true })
  }
})
test("reviewed updates preserve isolation, backup content, and reject stale reviews", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "skill-update-test-"))
  const previous = process.env.AGENTS_HOME
  process.env.AGENTS_HOME = root
  try {
    const folder = path.join(root, "skills", "update-test-unique"),
      file = path.join(folder, "SKILL.md")
    const source = path.join(root, "candidate")
    mkdirSync(folder, { recursive: true })
    mkdirSync(source)
    writeFileSync(file, "old")
    writeFileSync(path.join(source, "SKILL.md"), "new")
    writeFileSync(
      path.join(root, ".skill-lock.json"),
      JSON.stringify({ skills: { "update-test-unique": { source: "local" } } })
    )
    prepareIsolation([{ kind: "skill", target: file, enabled: false }]).commit()
    const plan = {
      file,
      source,
      revision: "a".repeat(40),
      currentHash: folderHash(path.dirname(actualSkillPath(file))),
      nextHash: folderHash(source),
      temp: root,
      created: Date.now(),
      eligible: true,
    }
    const result = await installPreparedSkillUpdate(plan)
    assert.equal(existsSync(file), false)
    assert.equal(readFileSync(actualSkillPath(file), "utf8"), "new")
    assert.equal(
      readFileSync(path.join(result.backup, "SKILL.md"), "utf8"),
      "old"
    )
    const registry = JSON.parse(
      readFileSync(path.join(root, ".skill-lock.json"), "utf8")
    )
    assert.ok(registry.skills["update-test-unique"].isolationPath)
    assert.equal(
      registry.skills["update-test-unique"].installedRevision,
      plan.revision
    )
    await assert.rejects(installPreparedSkillUpdate(plan), /Content changed/)
    const history = path.join(root, "registry", "skills-history.jsonl")
    rmSync(history); mkdirSync(history)
    writeFileSync(path.join(source, "SKILL.md"), "third")
    const retry = { ...plan, currentHash: folderHash(path.dirname(actualSkillPath(file))), nextHash: folderHash(source) }
    const registryBefore = readFileSync(path.join(root, ".skill-lock.json"), "utf8")
    await assert.rejects(installPreparedSkillUpdate(retry))
    assert.equal(readFileSync(actualSkillPath(file), "utf8"), "new")
    assert.equal(readFileSync(path.join(root, ".skill-lock.json"), "utf8"), registryBefore)
  } finally {
    if (previous === undefined) delete process.env.AGENTS_HOME
    else process.env.AGENTS_HOME = previous
    rmSync(root, { recursive: true, force: true })
  }
})
