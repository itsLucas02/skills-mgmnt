/* global process */

import { mkdirSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"

const codexHome = process.env.CODEX_HOME ?? path.join(homedir(), ".codex")
const baseUrl = process.env.SKILLPULSE_BASE_URL ?? "http://localhost:3020"
const intervalMs = Number(process.env.SKILLPULSE_INTERVAL_MS ?? "60000")
const skillPulseDir = path.join(codexHome, "skillpulse")
const statusPath = path.join(skillPulseDir, "collector-status.json")

mkdirSync(skillPulseDir, { recursive: true })

async function syncOnce() {
  const heartbeatAt = new Date().toISOString()

  try {
    const response = await fetch(`${baseUrl}/api/skillpulse/sync`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: "incremental" }),
    })
    const payload = await response.json().catch(() => ({}))

    if (!response.ok) {
      throw new Error(payload.error ?? `Sync failed with status ${response.status}`)
    }

    writeStatus({
      enabled: true,
      collectorRunning: true,
      pid: process.pid,
      lastHeartbeatAt: heartbeatAt,
      lastSyncAt: payload.syncedAt ?? heartbeatAt,
    })
  } catch (error) {
    writeStatus({
      enabled: true,
      collectorRunning: true,
      pid: process.pid,
      lastHeartbeatAt: heartbeatAt,
      lastError: error instanceof Error ? error.message : "Unknown SkillPulse collector error.",
    })
  }
}

function writeStatus(status) {
  writeFileSync(statusPath, `${JSON.stringify(status, null, 2)}\n`, "utf8")
}

writeStatus({
  enabled: true,
  collectorRunning: true,
  pid: process.pid,
  startedAt: new Date().toISOString(),
})

await syncOnce()
setInterval(syncOnce, Math.max(intervalMs, 10000))
