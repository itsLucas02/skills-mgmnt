export type ApplyOutcome = { token: string; name: string; success: boolean; backup?: string; auditWarning?: string; error?: string }

export function updateOutcomeMessage(results: ApplyOutcome[]) {
  const succeeded = results.filter(r => r.success).length
  return `${succeeded} updated, ${results.length - succeeded} blocked.\n` + results.map(r => r.success
    ? `${r.name}: updated. Backup: ${r.backup}. ${r.auditWarning ?? ""}`
    : `${r.name}: blocked. ${r.error} Check and review this skill again.`).join("\n")
}
