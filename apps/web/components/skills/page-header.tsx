"use client"

import Image from "next/image"
import { ShieldAlertIcon } from "lucide-react"

export function PageHeader() {
  return (
    <header className="flex flex-col gap-3 border-b pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex max-w-3xl flex-col gap-2">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Image
            src="/skills-mgmnt-logo.png"
            alt=""
            width={18}
            height={18}
            className="size-4 rounded-[4px]"
            priority
          />
          Local Codex control center
        </div>
        <h1 className="font-heading text-3xl leading-tight font-medium text-balance sm:text-4xl">
          Skills
        </h1>
        <p className="max-w-2xl text-sm leading-6 text-pretty text-muted-foreground">
          Decide what Codex can use and clean up capabilities you no longer
          need.
        </p>
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <ShieldAlertIcon className="size-4" />
        Changes are reviewed before they are applied
      </div>
    </header>
  )
}
