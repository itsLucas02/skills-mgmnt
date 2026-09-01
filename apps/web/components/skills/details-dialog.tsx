"use client"

import type { SkillDetail } from "@/lib/skills"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { ScrollArea } from "@workspace/ui/components/scroll-area"
import { Separator } from "@workspace/ui/components/separator"

import { Metric, formatControlGateLabel } from "./shared"

export function DetailsDialog({
  detail,
  open,
  loading,
  onOpenChange,
}: {
  detail: SkillDetail | null
  open: boolean
  loading: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {loading
              ? "Loading details"
              : (detail?.title ?? "Details unavailable")}
          </DialogTitle>
          <DialogDescription>
            {detail?.description ??
              "Inspect metadata and local source content."}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
            Loading local metadata...
          </div>
        ) : detail ? (
          <div className="flex flex-col gap-4">
            <div className="grid gap-2 sm:grid-cols-2">
              <Metric label="Status" value={detail.status} />
              <Metric
                label="Origin"
                value={`${detail.origin.label} (${detail.origin.confidence})`}
              />
              <Metric
                label="Control gate"
                value={formatControlGateLabel(detail.controlGate)}
              />
              <Metric label="Reason" value={detail.statusReason} />
              <Metric
                label="Path"
                value={detail.relativePath ?? "Not available"}
              />
              {detail.metadata.map((item) => (
                <Metric
                  key={`${item.label}-${item.value}`}
                  label={item.label}
                  value={item.value}
                />
              ))}
            </div>
            <Separator />
            <ScrollArea className="h-80 rounded-lg border bg-muted/30 p-3">
              <pre className="font-mono text-xs leading-5 whitespace-pre-wrap text-muted-foreground">
                {detail.contentPreview ?? "No local preview is available."}
              </pre>
            </ScrollArea>
          </div>
        ) : (
          <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
            No detail record could be loaded for this item.
          </div>
        )}

        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
  )
}
