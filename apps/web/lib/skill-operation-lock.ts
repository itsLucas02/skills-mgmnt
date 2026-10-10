import {
  closeSync,
  existsSync,
  readFileSync,
  readdirSync,
  mkdirSync,
  openSync,
  unlinkSync,
  writeFileSync,
} from "node:fs"
import path from "node:path"
import { agentsHome } from "./skill-isolation.ts"

export function acquireSkillOperation() {
  const file = path.join(
    agentsHome(),
    "registry",
    "skills-mgmnt-operation.lock"
  )
  mkdirSync(path.dirname(file), { recursive: true })
  let descriptor: number
  try {
    descriptor = openSync(file, "wx")
  } catch {
    throw new Error(
      "Another skill mutation is running, or an interrupted operation needs recovery. Inspect .agents/registry/skills-mgmnt-operation.lock."
    )
  }
  writeFileSync(
    descriptor,
    JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() })
  )
  const backupRoot = path.join(agentsHome(), "registry", "backups")
  try {
    if (existsSync(backupRoot))
      for (const name of readdirSync(backupRoot)) {
        const journal = name.endsWith(".recovery.json")
          ? path.join(backupRoot, name)
          : name.startsWith("update-")
            ? path.join(backupRoot, name, "operation.json")
            : undefined
        if (journal && existsSync(journal)) {
          const status = JSON.parse(readFileSync(journal, "utf8")).status
          if (!["committed", "rolled-back"].includes(status))
            throw new Error(
              `Interrupted skill operation requires recovery: ${journal}`
            )
        }
      }
  } catch (error) {
    closeSync(descriptor)
    unlinkSync(file)
    throw error
  }
  return () => {
    closeSync(descriptor)
    unlinkSync(file)
  }
}
