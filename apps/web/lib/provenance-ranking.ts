export function provenanceRanking(
  skills: Array<{
    path: string
    name?: string
    parentPluginKey?: string
    provenance?: {
      author?: string
      owner?: string
      publisher?: string
      source?: string
      skillPath?: string
    }
  }>,
  field: "owner" | "author" = "owner"
) {
  const unique = new Set<string>()
  const groups = new Map<string, number>()
  for (const skill of skills) {
    const p = skill.provenance
    const identity =
      p?.source && p.skillPath
        ? `${p.source}/${p.skillPath}`
        : skill.parentPluginKey && skill.name
          ? `plugin:${skill.parentPluginKey}/${skill.name}`
          : skill.path
    if (unique.has(identity)) continue
    unique.add(identity)
    const owner = field === "author" ? p?.author ?? "Author not declared" : p?.owner ?? (p?.publisher ? `Publisher: ${p.publisher}` : p?.source === "local" ? "Local skill" : "Source unknown")
    groups.set(owner, (groups.get(owner) ?? 0) + 1)
  }
  return [...groups]
    .map(([owner, count]) => ({ owner, count }))
    .sort((a, b) => b.count - a.count)
}

export function provenanceCsv(
  skills: Array<{
    name: string
    path: string
    status: string
    provenance?: { author?: string; owner?: string; sourceUrl?: string; publisher?: string; evidence?: string }
  }>
) {
  const rows = [
    [
      "Skill",
      "Declared author",
      "Repository owner",
      "Plugin publisher",
      "Source evidence",
      "Source URL",
      "Status",
      "Path",
    ],
    ...skills.map((s) => [
      s.name,
      s.provenance?.author ?? "Unknown",
      s.provenance?.owner ?? "Unknown",
      s.provenance?.publisher ?? "",
      s.provenance?.evidence ?? "",
      s.provenance?.sourceUrl ?? "",
      s.status,
      s.path,
    ]),
  ]
  return rows
    .map((row) =>
      row
        .map(
          (value) =>
            `"${(/^[=+@-]/.test(value) ? "'" : "") + value.replaceAll('"', '""')}"`
        )
        .join(",")
    )
    .join("\r\n")
}
