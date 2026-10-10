"use client"

import type { SkillSummary } from "@/lib/skills"
import { cn } from "@workspace/ui/lib/utils"

export function CompactSummary({
  summary,
  unusedCount,
}: {
  summary: SkillSummary
  unusedCount?: number
}) {
  const activePercent = summary.total
    ? Math.round((summary.active / summary.total) * 100)
    : 0

  return (
    <section
      aria-label="Capability overview"
      className="overview overflow-hidden rounded-2xl border bg-card"
    >
      <div className="grid grid-cols-2 sm:grid-cols-4">
        <SummaryStat
          label="Installed"
          value={summary.total}
        />
        <SummaryStat
          label="Enabled"
          value={summary.active}
          detail={`${activePercent}% of installed`}
        />
        <SummaryStat
          label="Plugins"
          value={summary.activePluginCount}
          detail={`of ${summary.pluginCount}`}
        />
        <SummaryStat
          label="MCP servers"
          value={summary.activeMcpServerCount}
          detail={`of ${summary.mcpServerCount}`}
        />
      </div>
      {unusedCount !== undefined ? (
        <div className="flex items-center justify-between gap-4 border-t bg-muted/20 px-4 py-3 sm:px-5">
          <div>
              <div className="text-sm font-medium">Ready to review</div>
              <div className="text-xs text-muted-foreground">
                Skills installed 60+ days ago with little use and no activity in 30+ days.
              </div>
          </div>
          <div className="text-2xl font-semibold tabular-nums">
            {unusedCount}
          </div>
        </div>
      ) : null}
    </section>
  )
}

function SummaryStat({
  label,
  value,
  detail,
  className,
}: {
  label: string
  value: string | number
  detail?: string
  className?: string
}) {
  return (
    <div className={cn("overview-stat min-w-0 px-5 py-5 sm:px-6 sm:py-6", className)}>
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="text-3xl leading-none font-semibold tracking-tight tabular-nums sm:text-4xl">
          {value}
        </span>
        {detail ? (
          <span className="text-xs text-muted-foreground">{detail}</span>
        ) : null}
      </div>
    </div>
  )
}
