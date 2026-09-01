import type { SkillPulseSummaryResponse } from "./skillpulse.ts"

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
    "loadsAllTime",
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
    skill.loadsAllTime.toString(),
    skill.lastLoadedAt ?? "",
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
