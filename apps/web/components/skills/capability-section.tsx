"use client"

import type { ReactElement } from "react"
import { Badge } from "@workspace/ui/components/badge"

export function CapabilitySection({
  title,
  count,
  children,
}: {
  title: string
  count: number
  children: ReactElement
}) {
  return (
    <section
      className="flex min-w-0 flex-col gap-3"
      aria-labelledby={`section-${title.replaceAll(" ", "-").toLowerCase()}`}
    >
      <div className="flex items-center gap-2">
        <h2
          id={`section-${title.replaceAll(" ", "-").toLowerCase()}`}
          className="font-heading text-lg font-medium text-balance"
        >
          {title}
        </h2>
        <Badge variant="secondary" className="tabular-nums">
          {count}
        </Badge>
      </div>
      {children}
    </section>
  )
}
