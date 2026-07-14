import type { SkillPulseSummaryResponse } from "./skillpulse.ts"

export type UsageFilter = "7d" | "30d" | "90d" | "never" | "all"

export function getUsageFilterDescription(filter: UsageFilter) {
  const descriptions: Record<UsageFilter, string> = {
    "7d": "Showing enabled skills with no observed uses in the last 7 days.",
    "30d": "Showing enabled skills with no observed uses in the last 30 days.",
    "90d":
      "Showing enabled skills last observed more than 90 days ago, including skills never observed.",
    never:
      "Showing enabled skills that have never been observed in local session history.",
    all: "Showing every tracked skill. The usage columns remain the same for direct comparison.",
  }

  return descriptions[filter]
}

export function matchesUsageFilter(
  skill: SkillPulseSummaryResponse["skills"][number],
  filter: UsageFilter,
  now = Date.now()
) {
  if (filter === "all") return true
  if (skill.effectiveStatus !== "active") return false
  if (filter === "never") return skill.loadsAllTime === 0
  if (filter === "7d") return skill.loads7d === 0
  if (filter === "30d") return skill.loads30d === 0

  if (!skill.lastLoadedAt) return true
  const ninetyDaysAgo = now - 90 * 24 * 60 * 60 * 1000
  return new Date(skill.lastLoadedAt).getTime() < ninetyDaysAgo
}
