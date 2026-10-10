"use client"

import { useEffect, useMemo, useState } from "react"
import { RefreshCwIcon } from "lucide-react"
import type { ManagedSkill } from "@/lib/skills"
import type { UpdateResult } from "@/lib/skill-updates"
import { provenanceRanking, provenanceCsv } from "@/lib/provenance-ranking"
import { formatDateTime } from "@/lib/date-format"
import { updateOutcomeMessage } from "@/lib/skill-update-feedback"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { PaginationFooter } from "./shared"

export function ProvenanceUpdatesPanel({ skills }: { skills: ManagedSkill[] }) {
  const [selected, setSelected] = useState<string[]>([])
  const [query, setQuery] = useState("")
  const [ownerFilter, setOwnerFilter] = useState("")
  const [rankByAuthor, setRankByAuthor] = useState(false)
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(50)
  const [results, setResults] = useState<UpdateResult[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const [review, setReview] = useState<UpdateResult | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [bulk, setBulk] = useState(false)
  useEffect(() => {
    let active = true
    void fetch("/api/skill-updates")
      .then((r) => r.json())
      .then((p) => {
        if (active && p.results) setResults(p.results)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])
  const rankings = useMemo(
    () => provenanceRanking(skills, rankByAuthor ? "author" : "owner"),
    [skills, rankByAuthor]
  )
  const unknownLabel = rankByAuthor ? "Author not declared" : "Source unknown"
  const knownRankings = rankings.filter(
    (r) => r.owner !== unknownLabel
  )
  const unattributed =
    rankings.find((r) => r.owner === unknownLabel)?.count ?? 0
  const totalUnique = rankings.reduce((sum, r) => sum + r.count, 0)
  const provenanceWarning = skills.find((s) => s.provenance?.warning)
    ?.provenance?.warning
  const visible = skills.filter(
    (s) =>
      (!ownerFilter ||
        (rankByAuthor ? s.provenance?.author : s.provenance?.owner ?? (s.provenance?.publisher ? `Publisher: ${s.provenance.publisher}` : s.provenance?.source === "local" ? "Local skill" : undefined)) ===
          ownerFilter ||
        (ownerFilter === unknownLabel &&
          !(rankByAuthor ? s.provenance?.author : s.provenance?.owner ?? s.provenance?.publisher ?? (s.provenance?.source === "local" ? "Local skill" : undefined)))) &&
      [s.name, s.provenance?.author, s.provenance?.owner, s.provenance?.source, s.provenance?.publisher]
        .join(" ")
        .toLowerCase()
        .includes(query.toLowerCase())
  )
  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize))
  const currentPage = Math.min(page, pageCount - 1)
  const pageSkills = visible.slice(currentPage * pageSize, (currentPage + 1) * pageSize)
  const pagination = (
    <PaginationFooter currentPage={currentPage} pageCount={pageCount}
      itemCount={visible.length} pageSize={pageSize} onPageChange={setPage}
      ariaLabel="Sources and updates pagination" />
  )
  const eligible = results.filter(
    (r) =>
      r.status === "Update available" &&
      r.token &&
      (!selected.length || selected.includes(r.path))
  )
  async function check() {
    setBusy(true)
    setResults([])
    const targets = selected.length
      ? skills.filter((s) => selected.includes(s.path))
      : skills
    const checked: UpdateResult[] = []
    try {
        setMessage(`Checking ${targets.length} skills; shared repositories are fetched once, up to 3 at a time…`)
        const response = await fetch("/api/skill-updates", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "check", paths: targets.map(s => s.path) }),
        })
        if (!response.ok) throw new Error((await response.json()).error)
        const reader = response.body!.getReader(), decoder = new TextDecoder()
        let pending = ""
        while (true) {
          const chunk = await reader.read()
          if (chunk.done) break
          pending += decoder.decode(chunk.value, { stream: true })
          let newline: number
          while ((newline = pending.indexOf("\n")) >= 0) {
            const event = JSON.parse(pending.slice(0, newline)); pending = pending.slice(newline + 1)
            if (event.error) throw new Error(event.error)
            if (event.result) {
              checked.push(event.result)
              setResults([...checked])
              setMessage(`Checked ${event.completed}/${event.total}: ${event.result.name} — ${event.result.status}`)
            }
            if (event.done) setMessage(`Checked ${event.total} skills across ${event.repositories} repositories in ${(event.elapsedMs / 1000).toFixed(1)}s. No updates applied.`)
          }
        }
    } catch (e) {
      setMessage(String(e))
    } finally {
      setBusy(false)
    }
  }
  async function apply(tokens: string[], individuallyReviewed: boolean) {
    setBusy(true)
    try {
      const response = await fetch("/api/skill-updates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "apply",
          tokens,
          reviewed: individuallyReviewed,
        }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error)
      setMessage(updateOutcomeMessage(payload.results))
      const completed = new Set(
        payload.results
          .filter((r: { success: boolean }) => r.success)
          .map((r: { token: string }) => r.token)
      )
      setResults((current) =>
        current.map((r) =>
          completed.has(r.token)
            ? {
                ...r,
                token: undefined,
                status: "Updated",
                message: "Applied; check again to verify current upstream.",
              }
            : payload.results.some((item: {token: string; success: boolean}) => item.token === r.token && !item.success)
              ? { ...r, token: undefined, status: "Blocked — check again", message: payload.results.find((item: {token: string}) => item.token === r.token)?.error ?? "Review again." }
              : r
        )
      )
      setReview(null)
      setBulk(false)
    } catch (e) {
      setMessage(String(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Authors, sources & updates</CardTitle>
        <CardDescription>
          Unique installed skills, including isolated skills. Repository
          ownership is separate from declared authorship. Update checks run only
          when you click.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {provenanceWarning && (
          <p role="alert" className="text-sm text-destructive">
            {provenanceWarning}
          </p>
        )}
        <p className="text-sm text-muted-foreground">
          {totalUnique - unattributed} of {totalUnique} unique skill identities
          have {rankByAuthor ? "declared authors" : "a known source or publisher"}.
          Duplicate provider versions are counted once.
          {" "}A known source does not mean an individual author is declared. Skills.sh installation sources come from the local registry; plugin publishers come from manifests.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={rankByAuthor ? "outline" : "secondary"}
            size="sm"
            aria-pressed={!rankByAuthor}
            onClick={() => {
              setRankByAuthor(false)
              setOwnerFilter("")
              setPage(0)
            }}
          >
            Repository owners & publishers
          </Button>
          <Button
            variant={rankByAuthor ? "secondary" : "outline"}
            aria-pressed={rankByAuthor}
            size="sm"
            onClick={() => {
              setRankByAuthor(true)
              setOwnerFilter("")
              setPage(0)
            }}
          >
            Declared authors
          </Button>
          <Button variant="ghost" size="sm" onClick={() => { setOwnerFilter(""); setPage(0) }}>
            All sources
          </Button>
          <Button
            variant={
              ownerFilter === unknownLabel
                ? "secondary"
                : "ghost"
            }
            size="sm"
            onClick={() => { setOwnerFilter(unknownLabel); setPage(0) }}
          >
            {unknownLabel} ({unattributed})
          </Button>
          {knownRankings.slice(0, 8).map((r) => (
            <Button
              key={r.owner}
              variant={ownerFilter === r.owner ? "secondary" : "outline"}
              size="sm"
              className="relative overflow-hidden border-primary/20 bg-primary/5"
              onClick={() => { setOwnerFilter(r.owner); setPage(0) }}
            >
              {r.owner}{" "}
              <span className="font-semibold tabular-nums">{r.count}</span>
              <span
                aria-hidden="true"
                className="absolute inset-x-0 bottom-0 h-0.5 origin-left bg-primary/50"
                style={{
                  transform: `scaleX(${r.count / (knownRankings[0]?.count || 1)})`,
                }}
              />
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Input
            className="min-w-0 flex-1"
            aria-label="Filter by skill, author, or repository owner"
            placeholder="Filter by skill, author, or repository owner"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setPage(0) }}
          />
          <Button disabled={busy} onClick={check}>
            <RefreshCwIcon className={busy ? "motion-safe:animate-spin" : ""} />
            {busy
              ? "Checking…"
              : selected.length
                ? `Check selected (${selected.length})`
                : "Check all for updates"}
          </Button>
          <Button
            variant="outline"
            disabled={busy || !eligible.length}
            onClick={() => {
              setConfirmed(false)
              setBulk(true)
            }}
          >
            Review {selected.length ? "selected" : "all eligible"} updates (
            {eligible.length})
          </Button>
          <Button
            variant="ghost"
            disabled={busy || !selected.length}
            onClick={() => setSelected([])}
          >
            Clear selection
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              const url = URL.createObjectURL(
                new Blob([provenanceCsv(skills)], {
                  type: "text/csv;charset=utf-8",
                })
              )
              const link = document.createElement("a")
              link.href = url
              link.download = "skill-provenance.csv"
              link.click()
              URL.revokeObjectURL(url)
            }}
          >
            Export sources CSV
          </Button>
        </div>
        {message && (
          <p
            role="status"
            className="dashboard-feedback rounded-lg bg-muted/40 p-3 text-sm break-words whitespace-pre-wrap"
          >
            {message}
          </p>
        )}
        <label className="flex flex-wrap items-center gap-2 text-sm">
          Rows per page
          <select className="rounded-md border bg-background px-3 py-2" value={pageSize}
            onChange={(e) => { setPageSize(Number(e.target.value)); setPage(0) }}>
            {[25, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}
          </select>
          <span className="text-muted-foreground">{visible.length} skills{selected.length ? ` · ${selected.length} selected across pages` : ""}</span>
        </label>
        {pagination}
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th className="p-3">Select</th>
                <th>Skill / attribution</th>
                <th>Update status</th>
                <th>Review</th>
              </tr>
            </thead>
            <tbody>
              {!visible.length && <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">No skills match your filters.</td></tr>}
              {pageSkills.map((skill) => {
                const result = results.find((r) => r.path === skill.path)
                return (
                  <tr className="border-t" key={skill.path}>
                    <td className="p-3">
                      <input
                        type="checkbox"
                        disabled={busy}
                        aria-label={`Select ${skill.name} for update check`}
                        checked={selected.includes(skill.path)}
                        onChange={(e) =>
                          setSelected((current) =>
                            e.target.checked
                              ? [...current, skill.path]
                              : current.filter((p) => p !== skill.path)
                          )
                        }
                      />
                    </td>
                    <td className="min-w-48 p-2">
                      <div className="font-medium">{skill.name}</div>
                      <div className="text-xs text-muted-foreground">
                        Author: {skill.provenance?.author ?? "Not declared"}
                      </div>
                      {skill.provenance?.publisher && <div className="text-xs text-muted-foreground">Plugin publisher: {skill.provenance.publisher}</div>}
                      {skill.provenance?.sourceUrl ? (
                        <a
                          href={skill.provenance.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs underline"
                        >
                          {skill.provenance.source ?? skill.provenance.sourceUrl}
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {skill.provenance?.publisher ? "Publisher known; repository not declared" : skill.provenance?.source === "local" ? "Locally authored; no upstream repository" : "Source unknown"}
                        </span>
                      )}
                      {skill.provenance?.evidence && <div className="text-xs text-muted-foreground">{skill.provenance.evidence}</div>}
                    </td>
                    <td className="min-w-40 p-2">
                      <div>{result?.status ?? "Not checked"}</div>
                      {result && (
                        <div className="text-xs text-muted-foreground">
                          {formatDateTime(result.checkedAt)}
                        </div>
                      )}
                    </td>
                    <td className="p-2">
                      {result?.token && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => {
                            setConfirmed(false)
                            setReview(result)
                          }}
                        >
                          Review
                        </Button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {pagination}
        <p className="text-xs text-muted-foreground">
          Checks compare only each skill&apos;s files. Unknown baselines and
          local edits are excluded from bulk updates. Review tokens expire after
          30 minutes or a server restart.
        </p>
      </CardContent>
      <Dialog
        open={!!review || bulk}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setReview(null)
            setBulk(false)
          }
        }}
      >
        <DialogContent className="flex max-h-[85dvh] max-w-3xl flex-col overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {review ? `Review ${review.name}` : "Review eligible updates"}
            </DialogTitle>
            <DialogDescription>
              Content is backed up before replacement. Isolation state is
              preserved. Updating may introduce new instructions or
              dependencies.
            </DialogDescription>
          </DialogHeader>
          {review ? (
            <>
              <p className="text-sm">{review.message}</p>
              <p className="text-xs break-all">
                Upstream revision: {review.revision}
              </p>
              <p className="text-sm">
                Changed files:{" "}
                {review.changedFiles?.join(", ") ||
                  "None — record verified baseline"}
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <h3 className="text-sm font-semibold">Installed SKILL.md</h3>
                  <pre className="max-h-60 overflow-auto rounded border p-3 text-xs whitespace-pre-wrap">
                    {review.before}
                  </pre>
                </div>
                <div>
                  <h3 className="text-sm font-semibold">Proposed SKILL.md</h3>
                  <pre className="max-h-60 overflow-auto rounded border p-3 text-xs whitespace-pre-wrap">
                    {review.after}
                  </pre>
                </div>
              </div>
              <ReviewDiff result={review} />
            </>
          ) : (
            <ul className="text-sm">
              {eligible.map((r) => (
                <li key={r.path} className="mb-3">
                  <strong>{r.name}</strong> · {r.revision}
                  <br />
                  Changed: {r.changedFiles?.join(", ")}
                  <ReviewDiff result={r} />
                </li>
              ))}
            </ul>
          )}
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            I reviewed the proposed replacement and accept any changed
            instructions/dependencies.
          </label>
          <Button
            disabled={busy || !confirmed}
            onClick={() =>
              apply(
                review?.token ? [review.token] : eligible.map((r) => r.token!),
                !!review
              )
            }
          >
            {busy
              ? "Applying…"
              : review?.status === "Up to date"
                ? "Record verified baseline"
                : review
                  ? "Apply reviewed update"
                  : `Update ${eligible.length} eligible skills`}
          </Button>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

function ReviewDiff({ result }: { result: UpdateResult }) {
  return (
    <div className="flex flex-col gap-2">
      {result.repositoryContext && <p className="text-xs text-muted-foreground">Upstream repository license/dependency context follows. These root files are not installed with the skill subtree; compare with your recorded license before applying.</p>}
      {result.repositoryContext?.map((context) => <details key={`context-${context.file}`} className="rounded border p-2"><summary className="cursor-pointer text-xs font-medium">Repository context: {context.file}</summary><pre className="max-h-60 overflow-auto p-2 text-xs whitespace-pre-wrap">{context.content}</pre></details>)}
      {result.diff?.map((change) => (
        <details key={change.file} className="rounded border p-2">
          <summary className="cursor-pointer text-xs font-medium">
            {change.file} — inspect replacement
          </summary>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <pre className="max-h-60 overflow-auto bg-muted/30 p-2 text-xs whitespace-pre-wrap">
              Installed: {change.before}
            </pre>
            <pre className="max-h-60 overflow-auto bg-muted/30 p-2 text-xs whitespace-pre-wrap">
              Proposed: {change.after}
            </pre>
          </div>
        </details>
      ))}
    </div>
  )
}
