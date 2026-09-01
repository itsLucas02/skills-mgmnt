"use client"

import { SearchIcon } from "lucide-react"
import { Input } from "@workspace/ui/components/input"

export function SearchBar({
  query,
  onQueryChange,
}: {
  query: string
  onQueryChange: (query: string) => void
}) {
  return (
    <label className="relative flex min-w-0 flex-1 items-center">
      <SearchIcon
        data-icon="inline-start"
        className="pointer-events-none absolute left-2 text-muted-foreground"
      />
      <span className="sr-only">Search capabilities</span>
      <Input
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        placeholder="Search plugins, skills, MCP servers, descriptions, or paths"
        className="pl-8"
      />
    </label>
  )
}
