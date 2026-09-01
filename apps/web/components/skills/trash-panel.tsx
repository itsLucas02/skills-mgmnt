"use client"

import { useState } from "react"
import { RotateCcwIcon, Trash2Icon } from "lucide-react"

import type { TrashEntry as SkillTrashEntry } from "@/lib/skill-trash"
import { getCompactPathLabel } from "@/lib/path-display"
import { Button } from "@workspace/ui/components/button"

import { formatDateTime } from "./shared"

export function TrashPanel({
  entries,
  onRestore,
  onPurge,
}: {
  entries: SkillTrashEntry[]
  onRestore: (entryId: string) => void
  onPurge: (entryId: string) => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <details
      className="rounded-lg border bg-muted/20"
      open={open || entries.length > 0}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
        Deleted skills ({entries.length})
      </summary>
      <div className="border-t p-4">
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No deleted skills. Deleted standalone skills move to a local trash
            folder and can be restored or permanently removed here.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {entries.map((entry) => (
              <li
                key={entry.id}
                className="flex flex-col gap-2 rounded-md border bg-background px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium">{entry.skillName}</div>
                  <div
                    className="truncate font-mono text-xs text-muted-foreground"
                    title={entry.originalPath}
                  >
                    {getCompactPathLabel(entry.originalPath)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Deleted {formatDateTime(entry.trashedAt)}
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onRestore(entry.id)}
                  >
                    <RotateCcwIcon data-icon="inline-start" />
                    Restore
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => onPurge(entry.id)}
                  >
                    <Trash2Icon data-icon="inline-start" />
                    Delete forever
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  )
}
