import { existsSync, readFileSync, realpathSync } from "node:fs"
import path from "node:path"
import { agentsHome, actualSkillPath } from "./skill-isolation.ts"

export type SkillProvenance = {
  author?: string
  publisher?: string
  evidence?: string
  owner?: string
  sourceUrl?: string
  source?: string
  skillPath?: string
  revision?: string
  contentHash?: string
  warning?: string
}
export function pluginProvenance(file: string): SkillProvenance {
  let folder = path.dirname(file)
  for (let i = 0; i < 8; i++) {
    for (const directory of [".codex-plugin", ".claude-plugin"]) {
      const manifest = path.join(folder, directory, "plugin.json")
      if (!existsSync(manifest)) continue
      try {
        const metadata = JSON.parse(readFileSync(manifest, "utf8"))
        const declaredPublisher = typeof metadata.author === "string" ? metadata.author : metadata.author?.name ?? metadata.interface?.developerName
        const publisher = typeof declaredPublisher === "string" ? declaredPublisher : undefined
        const repository = typeof metadata.repository === "string" ? metadata.repository : metadata.repository?.url
        let url: URL | undefined
        try { url = new URL(repository ?? metadata.homepage ?? "") } catch { /* Repository may be undeclared. */ }
        if (!url || url.protocol !== "https:" || url.username || url.password) return { publisher, evidence: "Plugin manifest" }
        const source = url.hostname === "github.com" && /^\/[\w.-]+\/[\w.-]+\/?$/.test(url.pathname.replace(/\.git$/, "")) ? url.pathname.replace(/^\//, "").replace(/\.git$/, "").replace(/\/$/, "") : undefined
        return { publisher,
          sourceUrl: url.protocol === "https:" ? url.href : undefined, source, owner: source?.split("/")[0],
          skillPath: source ? path.relative(folder, file).replaceAll("\\", "/") : undefined,
          evidence: "Plugin manifest" }
      } catch { return {} }
    }
    const parent = path.dirname(folder)
    if (parent === folder) break
    folder = parent
  }
  return {}
}
export function provenanceFor(file: string): SkillProvenance {
  const registryPath = path.join(agentsHome(), ".skill-lock.json")
  let record: Record<string, string> | undefined
  let warning: string | undefined
  if (existsSync(registryPath)) {
    try {
      const registry = JSON.parse(readFileSync(registryPath, "utf8"))
      const canonicalRoot = path.join(agentsHome(), "skills")
      let resolved = file
      try {
        resolved = realpathSync(file)
      } catch {
        /* Isolated entries retain canonical identity. */
      }
      if (
        path.dirname(path.dirname(resolved)) === canonicalRoot ||
        path.dirname(path.dirname(file)) === canonicalRoot
      ) {
        const raw =
          registry.skills?.[path.basename(path.dirname(resolved))] ??
          registry.skills?.[path.basename(path.dirname(file))]
        if (raw && typeof raw === "object")
          record = Object.fromEntries(
            Object.entries(raw).filter(
              (pair): pair is [string, string] => typeof pair[1] === "string"
            )
          )
      }
    } catch {
      warning =
        "Provenance registry could not be read; reconcile it before making changes."
    }
  }
  const content = existsSync(actualSkillPath(file))
    ? readFileSync(actualSkillPath(file), "utf8")
    : ""
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content)?.[1] ?? ""
  const declaredAuthor = /^[ \t]*author:[ \t]*["']?([^\r\n"'[{]+)["']?[ \t]*$/m
    .exec(frontmatter)?.[1]
    ?.trim()
    ?? /^[ \t]*author:[ \t]*\r?\n[ \t]+name:[ \t]*["']?([^\r\n"']+)["']?[ \t]*$/m.exec(frontmatter)?.[1]?.trim()
  let sourceUrl: string | undefined
  try {
    const url = new URL(record?.sourceUrl ?? "")
    if (url.protocol === "https:") sourceUrl = url.href
  } catch {
    /* Unknown source is explicit. */
  }
  const plugin = pluginProvenance(file)
  return {
    ...plugin,
    warning,
    author: declaredAuthor ?? record?.author,
    evidence: record ? "Canonical installation registry" : plugin.evidence,
    sourceUrl: sourceUrl ?? plugin.sourceUrl,
    source: record?.source ?? plugin.source,
    skillPath: record?.skillPath ?? plugin.skillPath,
    owner: record?.sourceType === "github" && /^[\w.-]+\/[\w.-]+$/.test(record.source ?? "") ? record.source?.split("/")[0] : plugin.owner,
    revision:
      record?.installedRevision ?? record?.commit ?? record?.sourceCommit,
    contentHash: record?.installedContentHash,
  }
}
