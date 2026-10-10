/**
 * When was each skill installed?
 *
 * Needed because "never used" and "installed yesterday" look identical in the
 * usage data, and treating the second as the first is how you end up deleting
 * something you just added. Observed live: `emil-design-eng` (4 days old, zero
 * uses) and `interface-review` (3 days old, zero uses) were both being flagged
 * as disable candidates.
 *
 * Two sources, in priority order:
 *
 *   1. The machine-wide registry (`~/.agents/.skill-lock.json`). Authoritative -
 *      the CLI writes `installedAt` when it installs. Covers 57 of 62 skills.
 *   2. The skill folder's creation time. Covers the 5 hand-reconciled skills that
 *      have no registry date (better-accessibility, better-interface,
 *      better-layout, better-writing, shadcn).
 *
 * Folder dates skew LATER than the true install date - `better-ui` reads
 * 2026-08-15 by folder versus 2026-07-14 in the registry - so the fallback makes
 * a skill look newer than it is. That biases toward keeping it, which is the
 * safe direction for a deletion decision.
 *
 * Imports only Node builtins so headless scripts can run it directly.
 */

import { existsSync, readFileSync, statSync } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"

export type InstallDateSource = "registry" | "folder" | "unknown"

export type SkillInstallDate = {
  installedAt?: string
  source: InstallDateSource
  /** Whole days between install and `now`. Undefined when the date is unknown. */
  ageDays?: number
}

export function getSkillLockPath(home = homedir()) {
  return path.join(home, ".agents", ".skill-lock.json")
}

/** name -> ISO installedAt, from the machine-wide provenance registry. */
function readRegistryInstallDates(home: string): Record<string, string> {
  const lockPath = getSkillLockPath(home)
  const out: Record<string, string> = {}

  if (!existsSync(lockPath)) {
    return out
  }

  try {
    const parsed = JSON.parse(readFileSync(lockPath, "utf8")) as {
      skills?: Record<string, { installedAt?: unknown }>
    }

    for (const [name, entry] of Object.entries(parsed.skills ?? {})) {
      if (typeof entry?.installedAt === "string") {
        out[name] = entry.installedAt
      }
    }
  } catch {
    // A malformed registry simply means no dates; callers fall back to folders.
  }

  return out
}

function readFolderInstallDate(skillFilePath: string): string | undefined {
  try {
    // skill.path points at .../<skill>/SKILL.md, so the folder is its parent.
    const stats = statSync(path.dirname(skillFilePath))
    const date = stats.birthtimeMs > 0 ? stats.birthtime : stats.ctime
    return date.toISOString()
  } catch {
    return undefined
  }
}

function ageInDays(installedAt: string, now: Date) {
  const installed = new Date(installedAt)

  if (Number.isNaN(installed.getTime())) {
    return undefined
  }

  return Math.max(0, Math.floor((now.getTime() - installed.getTime()) / (24 * 60 * 60 * 1000)))
}

export function readSkillInstallDates(
  skills: Array<{ name: string; path: string }>,
  { home = homedir(), now = new Date() }: { home?: string; now?: Date } = {}
): Record<string, SkillInstallDate> {
  const registry = readRegistryInstallDates(home)
  const out: Record<string, SkillInstallDate> = {}

  for (const skill of skills) {
    const registryDate = registry[skill.name]

    if (registryDate) {
      out[skill.name] = {
        installedAt: registryDate,
        source: "registry",
        ageDays: ageInDays(registryDate, now),
      }
      continue
    }

    const folderDate = readFolderInstallDate(skill.path)

    if (folderDate) {
      out[skill.name] = {
        installedAt: folderDate,
        source: "folder",
        ageDays: ageInDays(folderDate, now),
      }
      continue
    }

    out[skill.name] = { source: "unknown" }
  }

  return out
}
