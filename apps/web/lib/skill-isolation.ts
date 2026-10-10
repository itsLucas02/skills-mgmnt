import {
  appendFileSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmdirSync,
  symlinkSync,
  writeFileSync,
} from "node:fs"
import { homedir } from "node:os"
import path from "node:path"
import { execFileSync } from "node:child_process"

export type IsolationEntry = {
  original: string
  stored: string
  adapters: string[]
  copies?: Array<{ original: string; stored: string }>
}
export function agentsHome() {
  return process.env.AGENTS_HOME ?? path.join(homedir(), ".agents")
}
export function isolationRoot() {
  return path.join(agentsHome(), "disabled-skills")
}
function manifestPath() {
  return path.join(agentsHome(), "registry", "skill-isolation.json")
}
export function isolationEntries(): IsolationEntry[] {
  if (!existsSync(manifestPath())) return []
  const entries: IsolationEntry[] = JSON.parse(
    readFileSync(manifestPath(), "utf8")
  ).entries
  for (const entry of entries) {
    canonicalFolder(path.join(entry.original, "SKILL.md"))
    if (
      entry.stored !== path.join(isolationRoot(), path.basename(entry.original))
    )
      throw new Error("Invalid isolation manifest storage path.")
    const validProviderPath = (p: string) => providerRoots().includes(path.dirname(p)) && !path.basename(p).startsWith(".")
    if (!entry.adapters.every(validProviderPath) || entry.copies?.some((copy, i) => !validProviderPath(copy.original) || copy.stored !== path.join(isolationRoot(), ".provider-copies", path.basename(entry.original), String(i))))
      throw new Error("Invalid isolation manifest provider path.")
  }
  return entries
}
export function actualSkillPath(original: string) {
  const entry = isolationEntries().find(
    (e) => path.resolve(e.original) === path.resolve(path.dirname(original))
  )
  return entry ? path.join(entry.stored, "SKILL.md") : original
}
function save(entries: IsolationEntry[]) {
  mkdirSync(path.dirname(manifestPath()), { recursive: true })
  writeFileSync(
    manifestPath(),
    JSON.stringify({ entries }, null, 2) + "\n",
    "utf8"
  )
}
function canonicalFolder(skillPath: string) {
  const folder = path.dirname(path.resolve(skillPath))
  if (
    path.basename(skillPath) !== "SKILL.md" ||
    path.dirname(folder) !== path.join(agentsHome(), "skills") ||
    path.basename(folder).startsWith(".")
  ) {
    throw new Error(
      "Isolation supports direct owner-managed .agents/skills entries only."
    )
  }
  return folder
}
export function canIsolate(skillPath: string) {
  try {
    canonicalFolder(skillPath)
    return true
  } catch {
    return false
  }
}
function providerRoots() {
  return [
    ".codex/skills",
    ".claude/skills",
    ".config/opencode/skills",
    ".opencode/skills",
    ".snowflake/cortex/skills",
  ].map((p) => path.join(homedir(), p))
}
function occupied(p: string) {
  try { lstatSync(p); return true } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false
    throw error
  }
}
function adaptersFor(folder: string) {
  const roots = providerRoots()
  const adapters: string[] = []
  const copies: string[] = []
  for (const root of roots) {
    if (!existsSync(root)) continue
    for (const name of readdirSync(root)) {
      const candidate = path.join(root, name)
      const stat = lstatSync(candidate)
      if (stat.isSymbolicLink()) {
        let resolved: string
        try {
          resolved = realpathSync(candidate)
        } catch {
          if (name === path.basename(folder))
            throw new Error(`Broken adapter requires review: ${candidate}`)
          continue
        }
        if (resolved.toLowerCase() === folder.toLowerCase())
          adapters.push(candidate)
        else if (name === path.basename(folder))
          throw new Error(`Duplicate skill requires review: ${candidate}`)
      } else if (name === path.basename(folder)) {
        if (
          !stat.isDirectory() ||
          !existsSync(path.join(candidate, "SKILL.md"))
        )
          throw new Error(`Unrecognized discovery entry: ${candidate}`)
        copies.push(candidate)
      }
    }
  }
  return { adapters, copies }
}
export function isolationLeaks(entry: IsolationEntry) {
  const { adapters, copies } = adaptersFor(entry.stored)
  return [
    ...(existsSync(entry.original) ? [entry.original] : []),
    ...adapters,
    ...copies,
  ]
}
export function isolationPreview(skillPath: string, enabled: boolean) {
  if (!canIsolate(skillPath))
    return "Codex configuration only; provider/native skill remains on disk."
  const folder = canonicalFolder(skillPath)
  const entry = isolationEntries().find((e) => e.original === folder)
  if (enabled)
    return entry
      ? `Restore isolated skill, ${entry.adapters.length} adapters, and ${entry.copies?.length ?? 0} preserved independent copies.`
      : "Keep skill discoverable."
  if (entry) return "Skill is already isolated."
  const { adapters, copies } = adaptersFor(folder)
  return `Move skill outside discovery roots; remove ${adapters.length} adapters. Preserve and isolate independent copies: ${copies.join(", ") || "none"}. New agent sessions required.`
}

/** Applies reversible filesystem changes; caller must commit only after config write succeeds. */
export function prepareIsolation(
  changes: Array<{ kind: string; target: string; enabled: boolean }>
) {
  const owned = changes.filter(
    (c) => c.kind === "skill" && canIsolate(c.target)
  )
  if (!owned.length)
    return {
      rollback() {},
      commit() {
        return undefined as string | undefined
      },
    }
  const registryPath = path.join(agentsHome(), ".skill-lock.json")
  const registryText = readFileSync(registryPath, "utf8")
  const registry = JSON.parse(registryText)
  for (const change of owned) {
    if (!registry.skills[path.basename(canonicalFolder(change.target))])
      throw new Error(
        "Missing canonical provenance; reconcile before isolation."
      )
  }
  const backup = path.join(
    agentsHome(),
    "registry",
    "backups",
    `skill-lock-isolation-${Date.now()}.json`
  )
  mkdirSync(path.dirname(backup), { recursive: true })
  copyFileSync(registryPath, backup)
  const before = isolationEntries()
  const next = [...before]
  const undo: Array<() => void> = []
  const events: Array<{ skill: string; action: string; stored?: string }> = []
  const journal: Array<{ operation: string; from: string; to?: string }> = []
  const recoveryPath = backup + ".recovery.json"
  const record = (operation: string, from: string, to?: string) => {
    journal.push({ operation, from, to })
    writeFileSync(
      recoveryPath,
      JSON.stringify(
        { status: "pending", before, changes: owned, journal },
        null,
        2
      ) + "\n",
      "utf8"
    )
  }
  const rollback = () => {
    const failures: string[] = []
    for (const action of [...undo].reverse()) {
      try {
        action()
      } catch (e) {
        failures.push(String(e))
      }
    }
    save(before)
    writeFileSync(registryPath, registryText, "utf8")
    for (const event of events) appendFileSync(path.join(agentsHome(), "registry", "skills-history.jsonl"), JSON.stringify({ skill: event.skill, action: "isolation-rollback", at: new Date().toISOString(), tool: "skills-mgmnt", incomplete: failures.length > 0 }) + "\n")
    writeFileSync(
      recoveryPath,
      JSON.stringify(
        {
          status: failures.length ? "rollback-incomplete" : "rolled-back",
          before,
          journal,
          failures,
        },
        null,
        2
      ) + "\n",
      "utf8"
    )
    if (failures.length)
      throw new Error(
        `Isolation rollback needs attention: ${failures.join("; ")}`
      )
  }
  try {
    for (const change of owned) {
      const folder = canonicalFolder(change.target)
      const entry = next.find((e) => e.original === folder)
      if (change.enabled && entry) {
        if (
          occupied(folder) ||
          entry.adapters.some(occupied) ||
          entry.copies?.some((c) => occupied(c.original))
        )
          throw new Error(
            "Restore destination is occupied; nothing overwritten."
          )
        record("move", entry.stored, folder)
        renameSync(entry.stored, folder)
        undo.push(() => renameSync(folder, entry.stored))
        for (const adapter of entry.adapters) {
          record("create-adapter", adapter, folder)
          symlinkSync(folder, adapter, "junction")
          undo.push(() => rmdirSync(adapter))
        }
        for (const copy of entry.copies ?? []) {
          record("move", copy.stored, copy.original)
          renameSync(copy.stored, copy.original)
          undo.push(() => renameSync(copy.original, copy.stored))
        }
        next.splice(next.indexOf(entry), 1)
        events.push({ skill: path.basename(folder), action: "enable" })
      } else if (!change.enabled && !entry) {
        if (
          !existsSync(path.join(folder, "SKILL.md")) ||
          lstatSync(folder).isSymbolicLink()
        )
          throw new Error("Canonical skill must be a real owned folder.")
        const stored = path.join(isolationRoot(), path.basename(folder))
        if (occupied(stored))
          throw new Error("Disabled-storage destination is occupied.")
        const { adapters, copies: copyPaths } = adaptersFor(folder)
        const copies = copyPaths.map((original, i) => ({
          original,
          stored: path.join(
            isolationRoot(),
            ".provider-copies",
            path.basename(folder),
            String(i)
          ),
        }))
        if (copies.some((c) => occupied(c.stored)))
          throw new Error("Preserved-copy destination is occupied.")
        mkdirSync(isolationRoot(), { recursive: true })
        for (const adapter of adapters) {
          record("remove-adapter", adapter, folder)
          rmdirSync(adapter)
          undo.push(() => symlinkSync(folder, adapter, "junction"))
        }
        record("move", folder, stored)
        renameSync(folder, stored)
        undo.push(() => renameSync(stored, folder))
        for (const copy of copies) {
          mkdirSync(path.dirname(copy.stored), { recursive: true })
          record("move", copy.original, copy.stored)
          renameSync(copy.original, copy.stored)
          undo.push(() => renameSync(copy.stored, copy.original))
        }
        next.push({ original: folder, stored, adapters, copies })
        events.push({ skill: path.basename(folder), action: "isolate", stored })
      }
    }
    save(next)
  } catch (error) {
    rollback()
    throw error
  }
  return {
    rollback,
    commit() {
      if (!events.length) return
      for (const event of events) {
        if (!registry.skills[event.skill])
          throw new Error(`Missing provenance record: ${event.skill}`)
        registry.skills[event.skill].isolationPath = event.stored ?? null
      }
      writeFileSync(
        registryPath,
        JSON.stringify(registry, null, 2) + "\n",
        "utf8"
      )
      for (const event of events)
        appendFileSync(
          path.join(agentsHome(), "registry", "skills-history.jsonl"),
          JSON.stringify({
            ...event,
            at: new Date().toISOString(),
            tool: "skills-mgmnt",
          }) + "\n"
        )
      writeFileSync(
        recoveryPath,
        JSON.stringify(
          { status: "committed", before, after: next, journal },
          null,
          2
        ) + "\n",
        "utf8"
      )
      const audit = path.join(agentsHome(), "tools", "audit-skills.ps1")
      if (existsSync(audit)) {
        try {
          execFileSync("powershell.exe", ["-NoProfile", "-File", audit], {
            windowsHide: true,
            timeout: 60000,
            stdio: "pipe",
          })
        } catch (e) {
          writeFileSync(
            path.join(agentsHome(), "registry", "last-isolation-audit.txt"),
            String(e)
          )
          return "Governed audit reported findings; inspect .agents/registry/last-isolation-audit.txt."
        }
      }
    },
  }
}
