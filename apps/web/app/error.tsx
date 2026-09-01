"use client"

import { RefreshCwIcon } from "lucide-react"

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-4">
      <div className="flex max-w-xl flex-col gap-4 rounded-lg border bg-card p-6">
        <h1 className="font-heading text-2xl font-medium">
          Could not load the skill inventory
        </h1>
        <p className="text-sm text-muted-foreground">
          The local capability scan failed. This usually means a scanned folder
          disappeared while it was being read, or the local Codex config could
          not be parsed.
        </p>
        <p className="rounded-md bg-muted/40 px-3 py-2 font-mono text-xs break-all text-muted-foreground">
          {error.message}
        </p>
        <button
          type="button"
          onClick={reset}
          className="inline-flex w-fit items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          <RefreshCwIcon className="size-4" />
          Try again
        </button>
      </div>
    </main>
  )
}
