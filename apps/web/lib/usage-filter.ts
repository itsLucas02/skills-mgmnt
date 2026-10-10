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
  filter: UsageFilter
) {
  if (filter === "all") return true
  // Disabled skills are never cleanup candidates - they are already off.
  if (skill.effectiveStatus !== "active") return false

  // Maturity guard. A skill installed too recently to have demonstrated value
  // must never appear in a cleanup list, whatever its usage counts say. Without
  // this, a day-old skill with zero uses reads as "unused".
  if (skill.recommendation === "insufficient-data") return false

  // Each window reads its own bucket from the permanent ledger. The 90-day case
  // previously guessed from lastLoadedAt, which was both indirect and unable to
  // see the ledger's day buckets.
  if (filter === "never") return skill.loadsAllTime === 0
  if (filter === "7d") return skill.loads7d === 0
  if (filter === "30d") return skill.loads30d === 0
  if (filter === "90d") return skill.loads90d === 0

  return true
}
