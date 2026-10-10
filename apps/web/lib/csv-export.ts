import type { SkillPulseSummaryResponse } from "./skillpulse.ts"
import { formatDateTime } from "./date-format.ts"

export function buildSkillPulseCsv(
  summary: SkillPulseSummaryResponse
): string {
  const header = [
    "skillName",
    "skillPath",
    "parentPluginKey",
    "effectiveStatus",
    "loads7d",
    "loads30d",
    "loads90d",
    "loadsAllTime",
    "harnesses",
    "lastLoadedAt",
    "recommendation",
  ]
  const rows = summary.skills.map((skill) => [
    skill.skillName,
    skill.skillPath,
    skill.parentPluginKey ?? "",
    skill.effectiveStatus,
    skill.loads7d.toString(),
    skill.loads30d.toString(),
    skill.loads90d.toString(),
    skill.loadsAllTime.toString(),
    // e.g. "codex:341|opencode:3" - kept readable so the export answers
    // "which tools actually use this?" without opening the dashboard.
    Object.entries(skill.byHarness)
      .sort((left, right) => right[1] - left[1])
      .map(([harness, count]) => `${harness}:${count}`)
      .join("|"),
    skill.lastLoadedAt ? formatDateTime(skill.lastLoadedAt) : "",
    skill.recommendation,
  ])

  return [header, ...rows]
    .map((row) => row.map(escapeCsvCell).join(","))
    .join("\r\n")
}

function escapeCsvCell(value: string) {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }

  return value
}
