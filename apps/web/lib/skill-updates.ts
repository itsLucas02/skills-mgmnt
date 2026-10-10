import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
  appendFileSync,
} from "node:fs"
import { createHash, randomUUID } from "node:crypto"
import { tmpdir } from "node:os"
import path from "node:path"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { agentsHome, actualSkillPath, canIsolate } from "./skill-isolation.ts"
import { provenanceFor } from "./skill-provenance.ts"

const exec = promisify(execFile)
export type UpdateResult = {
  path: string
  name: string
  status: string
  checkedAt: string
  message: string
  token?: string
  revision?: string
  changedFiles?: string[]
  before?: string
  after?: string
  diff?: Array<{ file: string; before: string; after: string }>
  repositoryContext?: Array<{ file: string; content: string }>
}
export type UpdatePlan = {
  file: string
  source: string
  revision: string
  currentHash: string
  nextHash: string
  temp: string
  created: number
  eligible: boolean
  repository?: string
  skillPath?: string
  contextHash?: string
}
function repositoryContext(repo: string) {
  return readdirSync(repo).sort().filter(name => /^(license|copying|notice)(\..*)?$|^(package\.json|requirements\.txt|pyproject\.toml)$/i.test(name)).filter(name => lstatSync(path.join(repo, name)).isFile()).map(name => {
    const data = readFileSync(path.join(repo, name))
    return { file: name, content: data.length > 100_000 || data.includes(0) ? `[Binary or large file; SHA256 ${createHash("sha256").update(data).digest("hex")}]` : data.toString("utf8") }
  })
}
const contextHash = (repo: string) => createHash("sha256").update(JSON.stringify(repositoryContext(repo))).digest("hex")
type Repository = { temp: string; repo: string; revision: string; baselines?: Map<string, Promise<string>> }
export type UpdateScan = { repositories: Map<string, Promise<Repository>>; paths: Map<string, string[]> }
export function createUpdateScan(files: string[]): UpdateScan {
  const paths = new Map<string, string[]>()
  for (const file of files) {
    if (!canIsolate(file)) continue
    const p = provenanceFor(file)
    if (!p.source || !p.skillPath) continue
    try { validateUpstream(p.source, p.skillPath) } catch { continue }
    paths.set(p.source, [...new Set([...(paths.get(p.source) ?? []), path.posix.dirname(p.skillPath)])])
  }
  return { repositories: new Map(), paths }
}
async function repositoryFor(source: string, scan: UpdateScan): Promise<Repository> {
  if (!scan.repositories.has(source)) scan.repositories.set(source, (async () => {
    const temp = mkdtempSync(path.join(tmpdir(), "skills-repository-"))
    const repo = path.join(temp, "repo")
    try {
      await exec("git", ["-c", "core.autocrlf=false", "-c", "core.hooksPath=" + path.join(temp, "no-hooks"), "clone", "--depth", "1", "--filter=blob:none", "--sparse", "--", `https://github.com/${source}.git`, repo], { windowsHide: true, timeout: 120000, maxBuffer: 1024 * 1024 })
      await exec("git", ["-C", repo, "sparse-checkout", "set", "--", ...(scan.paths.get(source) ?? [])], { windowsHide: true, timeout: 120000 })
      const revision = (await exec("git", ["-C", repo, "rev-parse", "HEAD"], { windowsHide: true })).stdout.trim()
      return { temp, repo, revision }
    } catch (error) { rmSync(temp, { recursive: true, force: true }); throw error }
  })())
  return scan.repositories.get(source)!
}
async function baselineFor(repository: Repository, revision: string) {
  repository.baselines ??= new Map()
  if (!repository.baselines.has(revision)) repository.baselines.set(revision, (async () => {
    await exec("git", ["-C", repository.repo, "fetch", "--depth", "1", "origin", revision], { windowsHide: true, timeout: 120000 })
    const folder = path.join(repository.temp, "baseline-" + revision)
    await exec("git", ["-C", repository.repo, "-c", "core.autocrlf=false", "-c", "core.hooksPath=" + path.join(repository.temp, "no-hooks"), "worktree", "add", "--detach", folder, revision], { windowsHide: true, timeout: 120000 })
    return folder
  })())
  return repository.baselines.get(revision)!
}
export async function closeUpdateScan(scan: UpdateScan) {
  for (const result of await Promise.allSettled(scan.repositories.values()))
    if (result.status === "fulfilled") rmSync(result.value.temp, { recursive: true, force: true })
}
export async function checkSkillUpdates(files: string[], onResult: (result: UpdateResult) => void) {
  const scan = createUpdateScan(files)
  const groups = new Map<string, string[]>()
  for (const file of files) {
    if (!canIsolate(file)) { onResult(await checkSkillUpdate(file, scan)); continue }
    const key = provenanceFor(file).source ?? file
    groups.set(key, [...(groups.get(key) ?? []), file])
  }
  const queue = [...groups.values()]
  try {
    const workers = await Promise.allSettled(Array.from({ length: Math.min(3, queue.length) }, async () => {
      while (queue.length) {
        const group = queue.shift()!
        for (const file of group) onResult(await checkSkillUpdate(file, scan))
      }
    }))
    const failure = workers.find((worker) => worker.status === "rejected")
    if (failure?.status === "rejected") throw failure.reason
    return { repositories: scan.repositories.size }
  } finally { await closeUpdateScan(scan) }
}
export function updateReviewName(token: string) {
  const plan = plans.get(token)
  return plan ? path.basename(path.dirname(plan.file)) : "Expired review"
}
export function rememberBlockedReview(token: string, message: string) {
  const plan = plans.get(token)
  if (plan) rememberUpdateCheck({ path: plan.file, name: path.basename(path.dirname(plan.file)), status: "Blocked — check again", message, checkedAt: new Date().toISOString(), revision: plan.revision })
}
const plans = new Map<string, UpdatePlan>()
const checksPath = () =>
  path.join(agentsHome(), "registry", "skill-update-checks.json")
export function lastUpdateChecks(): UpdateResult[] {
  return existsSync(checksPath())
    ? JSON.parse(readFileSync(checksPath(), "utf8"))
    : []
}
export function rememberUpdateCheck(result: UpdateResult) {
  const metadata = {
    path: result.path,
    name: result.name,
    status: result.status,
    checkedAt: result.checkedAt,
    message: result.message,
    revision: result.revision,
    changedFiles: result.changedFiles,
  }
  const checks = lastUpdateChecks().filter((r) => r.path !== result.path)
  checks.push(metadata)
  mkdirSync(path.dirname(checksPath()), { recursive: true })
  writeFileSync(checksPath(), JSON.stringify(checks, null, 2) + "\n", "utf8")
}
export function folderFiles(folder: string, prefix = ""): string[] {
  if (!prefix && lstatSync(folder).isSymbolicLink()) throw new Error("Skill root is a symlink; manual review required.")
  const files: string[] = []
  for (const name of readdirSync(path.join(folder, prefix))) {
    if (name === ".git") continue
    const relative = path.join(prefix, name)
    const stat = lstatSync(path.join(folder, relative))
    if (stat.isSymbolicLink())
      throw new Error("Skill contains a symlink; manual review required.")
    if (stat.isDirectory()) files.push(...folderFiles(folder, relative))
    else files.push(relative)
  }
  return files.sort()
}
export function folderHash(folder: string) {
  const hash = createHash("sha256")
  for (const file of folderFiles(folder)) {
    const data = readFileSync(path.join(folder, file))
    hash.update(file.replaceAll("\\", "/") + "\0" + data.length + "\0")
    hash.update(data)
  }
  return hash.digest("hex")
}
export function assertReviewedSubtree(repo: string, skillPath: string, reviewedHash: string) {
  const folder = path.join(repo, path.posix.dirname(skillPath))
  if (!existsSync(folder) || folderHash(folder) !== reviewedHash)
    throw new Error("This skill's upstream content changed after review; check and review again.")
}
export function updateStatus(
  current: string,
  upstream: string,
  baseline?: string
) {
  if (current === upstream) return "Up to date"
  if (!baseline) return "Cannot verify"
  return baseline === current ? "Update available" : "Locally modified"
}
export function validateUpstream(source: string, skillPath: string) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(source))
    throw new Error("Only verified GitHub repository sources are supported.")
  if (
    skillPath.includes("\\") ||
    skillPath.split("/").some((p) => p === ".." || p === "." || !p) ||
    path.posix.isAbsolute(skillPath) ||
    path.posix.basename(skillPath) !== "SKILL.md"
  )
    throw new Error("Unsafe or missing upstream skill path.")
}
function clearExpired() {
  for (const [token, plan] of plans)
    if (Date.now() - plan.created > 30 * 60_000) {
      rmSync(plan.temp, { recursive: true, force: true })
      plans.delete(token)
    }
}
export async function checkSkillUpdate(file: string, sharedScan?: UpdateScan): Promise<UpdateResult> {
  clearExpired()
  const result: UpdateResult = {
    path: file,
    name: path.basename(path.dirname(file)),
    checkedAt: new Date().toISOString(),
    status: "Cannot verify",
    message: "",
  }
  let temp: string | undefined
  const scan = sharedScan ?? createUpdateScan([file])
  try {
    if (!canIsolate(file))
      return {
        ...result,
        status: "Provider-managed",
        message:
          "Use the provider's update mechanism; this dashboard does not update cache/native skills.",
      }
    const p = provenanceFor(file)
    if (
      !p.source ||
      !p.skillPath ||
      !p.sourceUrl?.startsWith("https://github.com/")
    )
      return { ...result, status: "Cannot verify", message: "No verified upstream repository/path is recorded. Reconcile provenance before checking updates." }
    validateUpstream(p.source, p.skillPath)
    const url = new URL(p.sourceUrl)
    if (
      url.hostname !== "github.com" ||
      url.username ||
      url.password ||
      url.pathname.replace(/\.git$/, "").replace(/\/$/, "") !== `/${p.source}`
    )
      throw new Error("Registry source URL does not match repository identity.")
    temp = mkdtempSync(path.join(tmpdir(), "skills-update-"))
    const repository = await repositoryFor(p.source, scan)
    const { repo, revision } = repository
    const upstream = path.join(repo, path.posix.dirname(p.skillPath))
    if (!existsSync(path.join(upstream, "SKILL.md")))
      throw new Error("Upstream skill path was removed or renamed.")
    const context = repositoryContext(repo)
    const currentFolder = path.dirname(actualSkillPath(file))
    const currentHash = folderHash(currentFolder),
      nextHash = folderHash(upstream)
    const source = path.join(temp, "candidate")
    cpSync(upstream, source, { recursive: true, filter: (file) => path.basename(file) !== ".git" })
    let baseline = p.contentHash
    if (
      !baseline &&
      p.revision &&
      /^[a-f0-9]{40}$/i.test(p.revision) &&
      currentHash !== nextHash
    ) {
      try {
        const baselineFolder = await baselineFor(repository, p.revision)
        baseline = folderHash(path.join(baselineFolder, path.posix.dirname(p.skillPath)))
      } catch {
        /* Unverifiable history is excluded from bulk updates. */
      }
    }
    const status = updateStatus(currentHash, nextHash, baseline)
    const names = new Set([
      ...folderFiles(currentFolder),
      ...folderFiles(source),
    ])
    const changedFiles = [...names].filter((name) => {
      const a = path.join(currentFolder, name),
        b = path.join(source, name)
      return (
        !existsSync(a) ||
        !existsSync(b) ||
        !readFileSync(a).equals(readFileSync(b))
      )
    })
    const previewFile = (folder: string, name: string) => {
      const file = path.join(folder, name)
      if (!existsSync(file)) return "[File absent]"
      const data = readFileSync(file)
      if (data.length > 100_000 || data.includes(0))
        return `[Binary or large file: ${data.length} bytes; SHA256 ${createHash("sha256").update(data).digest("hex")}]`
      return data.toString("utf8")
    }
    const diff = changedFiles.map((name) => ({
      file: name,
      before: previewFile(currentFolder, name),
      after: previewFile(source, name),
    }))
    const token = randomUUID()
    plans.set(token, {
      file,
      source,
      revision,
      currentHash,
      nextHash,
      temp,
      created: Date.now(),
      eligible: status === "Update available",
      repository: p.source,
      skillPath: p.skillPath,
      contextHash: contextHash(repo),
    })
    return {
      ...result,
      status,
      token,
      revision,
      changedFiles,
      diff,
      repositoryContext: context,
      before: readFileSync(actualSkillPath(file), "utf8"),
      after: readFileSync(path.join(source, "SKILL.md"), "utf8"),
      message:
        status === "Cannot verify"
          ? "Installed baseline is unknown. Review before installing upstream content; excluded from bulk updates."
          : status === "Locally modified"
            ? "Installed content differs from its recorded baseline. Review required; excluded from bulk updates."
            : status === "Up to date"
              ? "Content matches current upstream. You may record this verified baseline."
              : "Upstream differs from the unchanged installed baseline.",
    }
  } catch (error) {
    if (temp) rmSync(temp, { recursive: true, force: true })
    return {
      ...result,
      status: "Check failed",
      message: error instanceof Error ? error.message : "Check failed",
    }
  } finally { if (!sharedScan) await closeUpdateScan(scan) }
}
export async function applySkillUpdate(token: string, reviewed: boolean) {
  clearExpired()
  const plan = plans.get(token)
  if (!plan) throw new Error("Review expired or server restarted; check again.")
  if (!reviewed && !plan.eligible)
    throw new Error("This item requires individual review.")
  const result = await installPreparedSkillUpdate(plan)
  try {
    rememberUpdateCheck({ path: plan.file, name: result.name, status: "Up to date", checkedAt: new Date().toISOString(), revision: plan.revision, message: "Reviewed update applied; installed content matches the checked revision." })
  } catch {
    result.auditWarning = [result.auditWarning, "Update succeeded, but saved check metadata could not be refreshed; check again."].filter(Boolean).join(" ")
  }
  plans.delete(token)
  rmSync(plan.temp, { recursive: true, force: true })
  return result
}
export async function installPreparedSkillUpdate(plan: UpdatePlan) {
  if (!canIsolate(plan.file)) throw new Error("Unsupported installation path.")
  const folder = path.dirname(actualSkillPath(plan.file))
  if (
    folderHash(folder) !== plan.currentHash ||
    folderHash(plan.source) !== plan.nextHash
  )
    throw new Error("Content changed after checking; check and review again.")
  const registryPath = path.join(agentsHome(), ".skill-lock.json")
  const registryText = readFileSync(registryPath, "utf8"),
    registry = JSON.parse(registryText)
  const name = path.basename(path.dirname(plan.file))
  if (!registry.skills[name]) throw new Error("Provenance record missing.")
  if (plan.repository) {
    if (registry.skills[name].source !== plan.repository)
      throw new Error("Provenance changed after checking; check again.")
    validateUpstream(plan.repository, registry.skills[name].skillPath)
    if (plan.skillPath !== registry.skills[name].skillPath)
      throw new Error("Upstream skill path changed; check and review again.")
    const latest = (
      await exec(
        "git",
        ["ls-remote", `https://github.com/${plan.repository}.git`, "HEAD"],
        { windowsHide: true, timeout: 60000 }
      )
    ).stdout.split(/\s/)[0]
    if (latest !== plan.revision) {
      const scan = createUpdateScan([plan.file])
      try {
        const current = await repositoryFor(plan.repository, scan)
        assertReviewedSubtree(current.repo, plan.skillPath!, plan.nextHash)
        if (plan.contextHash && contextHash(current.repo) !== plan.contextHash)
          throw new Error("Repository license/dependency context changed after review; check and review again.")
      } finally { await closeUpdateScan(scan) }
    }
  }
  const backupRoot = path.join(
    agentsHome(),
    "registry",
    "backups",
    `update-${name}-${Date.now()}`
  )
  mkdirSync(backupRoot, { recursive: true })
  writeFileSync(path.join(backupRoot, "skill-lock.json"), registryText, "utf8")
  const backup = path.join(backupRoot, "skill")
  const replacement = path.join(backupRoot, "replacement")
  cpSync(plan.source, replacement, { recursive: true })
  const recoveryPath = path.join(backupRoot, "operation.json")
  const record = (status: string) =>
    writeFileSync(
      recoveryPath,
      JSON.stringify(
        {
          status,
          original: folder,
          backup,
          replacement,
          file: plan.file,
          revision: plan.revision,
        },
        null,
        2
      ) + "\n",
      "utf8"
    )
  record("prepared")
  let swapped = false
  try {
    if (folderHash(folder) !== plan.currentHash)
      throw new Error(
        "Installed content changed during update preparation; review again."
      )
    renameSync(folder, backup)
    record("original-backed-up")
    renameSync(replacement, folder)
    swapped = true
    record("replacement-installed")
    registry.skills[name].installedRevision = plan.revision
    registry.skills[name].commit = plan.revision
    if (registry.skills[name].skillFolderHash) {
      registry.skills[name].previousSkillFolderHash =
        registry.skills[name].skillFolderHash
      delete registry.skills[name].skillFolderHash
    }
    registry.skills[name].installedContentHash = plan.nextHash
    registry.skills[name].updatedAt = new Date().toISOString()
    writeFileSync(
      registryPath,
      JSON.stringify(registry, null, 2) + "\n",
      "utf8"
    )
    appendFileSync(
      path.join(agentsHome(), "registry", "skills-history.jsonl"),
      JSON.stringify({
        at: new Date().toISOString(),
        action: "update",
        skill: name,
        revision: plan.revision,
        backup,
        tool: "skills-mgmnt",
      }) + "\n"
    )
    record("committed")
  } catch (error) {
    if (swapped) rmSync(folder, { recursive: true, force: true })
    if (existsSync(backup)) renameSync(backup, folder)
    writeFileSync(registryPath, registryText, "utf8")
    record("rolled-back")
    throw error
  } finally {
    if (existsSync(replacement))
      rmSync(replacement, { recursive: true, force: true })
  }
  let auditWarning: string | undefined
  const audit = path.join(agentsHome(), "tools", "audit-skills.ps1")
  if (existsSync(audit)) {
    try {
      await exec("powershell.exe", ["-NoProfile", "-File", audit], {
        windowsHide: true,
        timeout: 60000,
      })
    } catch {
      auditWarning =
        "Governed audit failed; inspect the registry and run the audit before further updates."
    }
  }
  return { name, backup, auditWarning }
}
