"use client"

import { RotateCcwIcon } from "lucide-react"

import type { ConfigChange } from "@/lib/config-editor"
import { Button } from "@workspace/ui/components/button"

export function PendingChangesBar({
  changes,
  onReview,
  onDiscard,
}: {
  changes: ConfigChange[]
  onReview: () => void
  onDiscard: () => void
}) {
  if (!changes.length) return null

  const enableCount = changes.filter((change) => change.enabled).length
  const disableCount = changes.length - enableCount

  return (
    <div className="dashboard-feedback fixed inset-x-0 bottom-0 z-40 border-t bg-background px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-lg">
      <div className="mx-auto flex max-w-[96rem] flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="font-medium tabular-nums">
            {changes.length} pending change{changes.length === 1 ? "" : "s"}
          </div>
          <p className="text-sm text-muted-foreground">
            {enableCount} to enable, {disableCount} to disable. Nothing has been
            written yet.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onDiscard}>
            <RotateCcwIcon data-icon="inline-start" />
            Discard
          </Button>
          <Button onClick={onReview}>Review changes</Button>
        </div>
      </div>
    </div>
  )
}
