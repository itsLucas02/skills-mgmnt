"use client"

import Image from "next/image"
import { ShieldCheckIcon } from "lucide-react"

export function PageHeader() {
  return (
    <header className="flex flex-col gap-5 py-2 sm:flex-row sm:items-center sm:justify-between">
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
          Your local control center
        </div>
        <h1 className="text-3xl leading-tight font-semibold tracking-tight text-balance sm:text-4xl">
          Skills Management
        </h1>
        <p className="max-w-2xl text-sm leading-6 text-pretty text-muted-foreground">
          Know what your agents can use. Keep what earns its place.
        </p>
      </div>
      <div className="flex w-fit items-center gap-2 rounded-full border bg-card px-3 py-2 text-xs font-medium text-muted-foreground">
        <ShieldCheckIcon className="size-4 text-primary" />
        Local only · Review before applying
      </div>
    </header>
  )
}
