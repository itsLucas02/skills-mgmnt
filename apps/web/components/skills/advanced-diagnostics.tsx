"use client"

import type { SkillSummary } from "@/lib/skills"
import { Progress } from "@workspace/ui/components/progress"

export function AdvancedDiagnostics({
  open,
  onOpenChange,
  summary,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  summary: SkillSummary
}) {
  return (
    <details
      id="advanced-diagnostics"
      open={open}
      onToggle={(event) => onOpenChange(event.currentTarget.open)}
      className="rounded-lg border bg-muted/20"
    >
      <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
        Advanced diagnostics
      </summary>
      {open ? (
        <div className="flex flex-col gap-5 border-t p-4">
          <div className="grid gap-5 lg:grid-cols-2">
            <section className="flex flex-col gap-3">
              <div>
                <h3 className="font-medium">Source coverage</h3>
                <p className="text-sm text-pretty text-muted-foreground">
                  Where the current capability set was discovered.
                </p>
              </div>
              {Object.entries(summary.sourceCounts).map(([label, count]) => (
                <div key={label} className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span>{label}</span>
                    <span className="text-muted-foreground tabular-nums">
                      {count}
                    </span>
                  </div>
                  <Progress
                    value={summary.total ? (count / summary.total) * 100 : 0}
                  />
                </div>
              ))}
            </section>
            <section className="flex flex-col gap-3">
              <div>
                <h3 className="font-medium">Scanned folders</h3>
                <p className="text-sm text-pretty text-muted-foreground">
                  Read-only roots used to build this inventory.
                </p>
              </div>
              {summary.scannedRoots.map((root) => (
                <code
                  key={root}
                  className="block rounded-md bg-background px-2 py-1 text-xs break-all text-muted-foreground"
                >
                  {root}
                </code>
              ))}
              <p className="text-xs text-muted-foreground">
                Last changed skill file:{" "}
                <span className="font-medium text-foreground">
                  {summary.newestModifiedAt}
                </span>
              </p>
            </section>
          </div>
        </div>
      ) : null}
    </details>
  )
}
