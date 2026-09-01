import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { homedir } from "node:os"
import path from "node:path"

type TrashEntry = {
  id: string
  originalPath: string
  trashedPath: string
  skillName: string
  trashedAt: string
}

type TrashManifest = {
  entries: TrashEntry[]
}

const TRASH_DIR_NAME = "skills-mgmnt-trash"
const MANIFEST_FILE_NAME = "manifest.json"

function getCodexHome() {
  return process.env.CODEX_HOME ?? path.join(homedir(), ".codex")
}

function getTrashDir() {
  return path.join(getCodexHome(), TRASH_DIR_NAME)
}

function getManifestPath() {
  return path.join(getTrashDir(), MANIFEST_FILE_NAME)
}

function readManifest(): TrashManifest {
  if (!existsSync(getManifestPath())) {
    return { entries: [] }
  }

  try {
    const parsed = JSON.parse(readFileSync(getManifestPath(), "utf8")) as TrashManifest
    return Array.isArray(parsed.entries) ? parsed : { entries: [] }
  } catch {
    return { entries: [] }
  }
}

function writeManifest(manifest: TrashManifest) {
  mkdirSync(getTrashDir(), { recursive: true })
  writeFileSync(getManifestPath(), `${JSON.stringify(manifest, null, 2)}\n`, "utf8")
}

export function listSkillTrash(): TrashEntry[] {
  return readManifest().entries
}

export function trashSkill(skillFilePath: string, skillName: string) {
  const skillDir = path.dirname(path.resolve(skillFilePath))
  const trashDir = getTrashDir()
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
  const safeName = skillName.replace(/[^a-zA-Z0-9._-]/g, "_") || "skill"
  const trashedPath = path.join(trashDir, `${safeName}-${timestamp}`)
  const manifest = readManifest()
  const alreadyTrashed = manifest.entries.some(
    (entry) => path.resolve(entry.originalPath) === skillDir
  )

  if (alreadyTrashed) {
    throw new Error("This skill folder is already tracked in the trash.")
  }

  if (!existsSync(skillDir)) {
    throw new Error(`Skill folder not found: ${skillDir}`)
  }

  mkdirSync(trashDir, { recursive: true })
  renameSync(skillDir, trashedPath)

  const entry: TrashEntry = {
    id: `${safeName}-${timestamp}`,
    originalPath: skillDir,
    trashedPath,
    skillName,
    trashedAt: new Date().toISOString(),
  }

  writeManifest({ entries: [entry, ...manifest.entries] })
  return entry
}

export function restoreSkill(entryId: string) {
  const manifest = readManifest()
  const entry = manifest.entries.find((item) => item.id === entryId)

  if (!entry) {
    throw new Error("Trash entry not found.")
  }

  if (existsSync(entry.originalPath)) {
    throw new Error(
      "A skill already exists at the original path. Remove it before restoring."
    )
  }

  mkdirSync(path.dirname(entry.originalPath), { recursive: true })
  renameSync(entry.trashedPath, entry.originalPath)

  writeManifest({
    entries: manifest.entries.filter((item) => item.id !== entryId),
  })

  return entry
}

export function purgeSkill(entryId: string) {
  const manifest = readManifest()
  const entry = manifest.entries.find((item) => item.id === entryId)

  if (!entry) {
    throw new Error("Trash entry not found.")
  }

  rmSync(entry.trashedPath, { recursive: true, force: true })

  writeManifest({
    entries: manifest.entries.filter((item) => item.id !== entryId),
  })

  return entry
}

export type { TrashEntry }
