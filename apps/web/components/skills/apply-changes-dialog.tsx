"use client"

import { useEffect, useState } from "react"
import { ChevronDownIcon, SaveIcon } from "lucide-react"

import type { ConfigChange, ConfigChangePreview } from "@/lib/config-editor"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

import { StatusBadge } from "./shared"

type ConfigDiffEntry = {
  kind: "added" | "removed" | "context"
  text: string
  beforeLine: number | null
  afterLine: number | null
}

export function ApplyChangesDialog({
  open,
  applying,
  changes,
  onApply,
  onOpenChange,
}: {
  open: boolean
  applying: boolean
  changes: ConfigChange[]
  onApply: () => void
  onOpenChange: (open: boolean) => void
}) {
  const [diff, setDiff] = useState<ConfigDiffEntry[] | null>(null)
  const [preview, setPreview] = useState<ConfigChangePreview[] | null>(null)
  const [previewError, setPreviewError] = useState("")
  const [diffLoading, setDiffLoading] = useState(false)
  const [showDiff, setShowDiff] = useState(false)
  const hasChanges = changes.length > 0

  useEffect(() => {
    if (!open || !hasChanges) {
      return
    }

    let cancelled = false

    async function loadDiff() {
      setDiffLoading(true)
      setPreview(null)
      setPreviewError("")

      try {
        const response = await fetch("/api/config/preview-changes", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ changes }),
        })
        const payload = await response.json()
        if (cancelled) {
          return
        }

        if (response.ok) {
          setDiff((payload.diff ?? []) as ConfigDiffEntry[])
          setPreview(payload.preview)
        } else {
          setDiff(null)
          setPreviewError(payload.error ?? "Could not preview changes.")
        }
      } catch {
        if (!cancelled) {
          setDiff(null)
          setPreviewError("Could not preview changes. Retry before applying.")
        }
      } finally {
        if (!cancelled) {
          setDiffLoading(false)
        }
      }
    }

    void loadDiff()

    return () => {
      cancelled = true
    }
  }, [open, hasChanges, changes])

  const visibleDiff = open && hasChanges ? diff : null
  const visibleDiffLoading = open && hasChanges && diffLoading

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-xl min-w-0 flex-col overflow-hidden">
        <DialogHeader className="min-w-0 shrink-0">
          <DialogTitle>Apply staged capability changes?</DialogTitle>
          <DialogDescription>
            Review the affected discovery paths below. Owner-managed skills are
            isolated or restored; provider/native controls update Codex configuration only.
            Backups and restore records are preserved.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 min-w-0 overflow-y-auto overscroll-contain rounded-lg border bg-muted/30 p-2">
          {changes.map((change) => (
            <div
              key={change.id}
              className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-3 border-b px-2 py-2.5 text-sm last:border-b-0"
            >
              <div className="min-w-0">
                <div className="font-medium [overflow-wrap:anywhere] break-words">
                  {change.label}
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground capitalize">
                  {change.kind}
                </div>
                <p className="mt-2 text-xs text-muted-foreground break-words">{preview?.find(p => p.id === change.id)?.summary ?? "Preparing scope preview…"}</p>
              </div>
              <StatusBadge
                active={change.enabled}
                label={change.enabled ? "Enable" : "Disable"}
              />
            </div>
          ))}
        </div>
        {previewError && <p role="alert" className="text-sm text-destructive">{previewError}</p>}

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="justify-start px-2"
          disabled={visibleDiffLoading || !visibleDiff?.length}
          onClick={() => setShowDiff((value) => !value)}
        >
          <ChevronDownIcon
            data-icon="inline-start"
            className={cn(
              "transition-transform",
              showDiff && "rotate-180"
            )}
          />
          {visibleDiffLoading
            ? "Loading config diff"
            : visibleDiff?.length
              ? showDiff
                ? "Hide config.toml changes"
                : `Show config.toml changes (${visibleDiff.filter((entry) => entry.kind !== "context").length} lines)`
              : "No config diff available"}
        </Button>

        {showDiff && visibleDiff?.length ? (
          <div className="min-h-0 overflow-auto rounded-lg border bg-muted/20 font-mono text-xs">
            {visibleDiff.map((entry, index) => (
              <div
                key={`${entry.afterLine ?? entry.beforeLine ?? "x"}-${index}`}
                className={cn(
                  "flex gap-3 whitespace-pre px-2 py-0.5",
                  entry.kind === "added" && "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
                  entry.kind === "removed" && "bg-red-500/15 text-red-700 dark:text-red-300",
                  entry.text === "..." && "text-muted-foreground"
                )}
              >
                <span className="w-8 shrink-0 text-right text-muted-foreground select-none">
                  {entry.beforeLine ?? ""}
                </span>
                <span className="w-8 shrink-0 text-right text-muted-foreground select-none">
                  {entry.afterLine ?? ""}
                </span>
                <span className="w-4 shrink-0 select-none">
                  {entry.kind === "added" ? "+" : entry.kind === "removed" ? "-" : " "}
                </span>
                <span className="min-w-0 [overflow-wrap:anywhere]">{entry.text}</span>
              </div>
            ))}
          </div>
        ) : null}

        <DialogFooter className="shrink-0">
          <Button
            variant="outline"
            disabled={applying}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button disabled={applying || !changes.length || diffLoading || !preview || !!previewError} onClick={onApply}>
            <SaveIcon data-icon="inline-start" />
            {applying ? "Applying" : "Apply changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
