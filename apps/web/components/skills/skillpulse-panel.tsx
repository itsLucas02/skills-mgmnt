"use client"

import { useMemo, useState } from "react"
import {
  ActivityIcon,
  ClockIcon,
  DownloadIcon,
  RefreshCwIcon,
} from "lucide-react"

import type { ConfigChange } from "@/lib/config-editor"
import { buildSkillPulseCsv } from "@/lib/csv-export"
import type {
  SkillPulseSummaryResponse,
} from "@/lib/skillpulse"
import {
  getUsageFilterDescription,
  matchesUsageFilter,
  type UsageFilter,
} from "@/lib/usage-filter"
import {
  IMMATURE_LABEL,
  IMMATURE_NOTE,
  PROVEN_VALUE_USES,
  SKILL_MATURITY_DAYS,
} from "@/lib/skill-maturity"
import type { ManagedSkill } from "@/lib/skills"
import { getCompactPathLabel } from "@/lib/path-display"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

import {
  EmptyState,
  Metric,
  PaginationFooter,
  formatDateTime,
  getBaseSkillEnabled,
  getSkillChangeId,
  getSkillPulsePathKey,
} from "./shared"

export function SkillPulsePanel({
  summary,
  loading,
  scanning,
  skillByUsagePath,
  getSkillEnabled,
  onScan,
  onStageChange,
}: {
  summary: SkillPulseSummaryResponse | null
  loading: boolean
  scanning: "incremental" | "backfill-all" | null
  skillByUsagePath: Map<string, ManagedSkill>
  getSkillEnabled: (skill: ManagedSkill) => boolean
  onScan: (mode: "incremental" | "backfill-all") => void
  onStageChange: (change: ConfigChange, currentEnabled: boolean) => void
}) {
  const skills = useMemo(() => summary?.skills ?? [], [summary?.skills])
  const [usageFilter, setUsageFilter] = useState<UsageFilter>("30d")
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(
    () => new Set()
  )
  const filteredSkills = useMemo(
    () => skills.filter((skill) => matchesUsageFilter(skill, usageFilter)),
    [skills, usageFilter]
  )
  const selectedSkills = filteredSkills.filter((skill) =>
    selectedPaths.has(skill.skillPath)
  )

  function setSelected(skillPath: string, selected: boolean) {
    setSelectedPaths((current) => {
      const next = new Set(current)
      if (selected) next.add(skillPath)
      else next.delete(skillPath)
      return next
    })
  }

  function stageSelectedForDisable() {
    for (const usage of selectedSkills) {
      const skill = skillByUsagePath.get(getSkillPulsePathKey(usage.skillPath))
      if (
        !skill ||
        !skill.editable ||
        !getSkillEnabled(skill) ||
        usage.effectiveStatus === "disabled-by-plugin"
      )
        continue

      onStageChange(
        {
          id: getSkillChangeId(skill),
          kind: "skill",
          label: skill.name,
          target: skill.path,
          enabled: false,
        },
        getBaseSkillEnabled(skill)
      )
    }
    setSelectedPaths(new Set())
  }

  return (
    <Card className="min-w-0">
      <CardHeader>
        <div>
          <CardTitle className="text-balance">Usage & cleanup</CardTitle>
          <CardDescription className="text-pretty">
            Review observed usage before deciding what to disable. Nothing is
            disabled automatically.
          </CardDescription>
        </div>
        <CardAction>
          <Button
            variant="outline"
            size="sm"
            disabled={!summary?.skills.length}
            onClick={() => {
              if (!summary) {
                return
              }

              const csv = buildSkillPulseCsv(summary)
              const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
              const url = URL.createObjectURL(blob)
              const link = document.createElement("a")
              link.href = url
              link.download = "skillpulse-usage.csv"
              link.click()
              URL.revokeObjectURL(url)
            }}
          >
            <DownloadIcon data-icon="inline-start" />
            Export CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={Boolean(scanning)}
            onClick={() => onScan("incremental")}
          >
            <RefreshCwIcon data-icon="inline-start" className={scanning ? "motion-safe:animate-spin" : undefined} />
            {scanning === "incremental" ? "Scanning" : "Scan now"}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex min-w-0 flex-col gap-5">
        <div className="flex flex-col gap-4 rounded-lg border bg-muted/20 p-4">
          <div className="flex min-w-0 items-start gap-3">
            <ActivityIcon className="mt-0.5 size-5 text-muted-foreground" />
            <div className="flex min-w-0 flex-col gap-1">
              <span className="font-medium">Track skill usage automatically</span>
              <p className="max-w-2xl text-sm text-pretty text-muted-foreground">
                Reads the local session records of every supported agent tool and
                records which skills were loaded. It runs on its own every hour
                via the &quot;SkillPulse Hourly Scan&quot; task, and on demand with
                Scan now. Nothing is uploaded.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Tools covered
            </span>
            <div className="flex flex-wrap gap-2">
              {(summary?.status.harnesses ?? []).map((harness) => (
                <div
                  key={harness.harness}
                  className="flex items-center gap-2 rounded-md border bg-background px-3 py-1.5"
                >
                  <Badge variant="secondary">{harness.label}</Badge>
                  <span className="text-xs tabular-nums text-foreground">
                    {harness.eventCount.toLocaleString()} uses
                  </span>
                  <span className="text-xs text-muted-foreground">
                    last{" "}
                    {harness.lastEventAt
                      ? formatDateTime(harness.lastEventAt)
                      : "never"}
                  </span>
                </div>
              ))}
              {summary && summary.status.harnesses.length === 0 ? (
                <span className="text-sm text-muted-foreground">
                  No usage recorded yet. Run Scan now.
                </span>
              ) : null}
            </div>
            <p className="text-xs text-pretty text-muted-foreground">
              CommandCode used through the opencode CLI is recorded by opencode,
              so it appears under opencode rather than as its own row.
            </p>
          </div>
        </div>

        {summary ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Metric
                label="Usage history"
                value={`${summary.status.dataCoverageDays} days`}
              />
              <Metric
                label="Skills observed"
                value={summary.totals.loadedSkillCount.toString()}
              />
              <Metric
                label="Recorded uses"
                value={(summary.status.harnesses ?? [])
                  .reduce((total, harness) => total + harness.eventCount, 0)
                  .toLocaleString()}
              />
              <Metric
                label="Last scanned"
                value={
                  summary.status.ledgerUpdatedAt
                    ? formatDateTime(summary.status.ledgerUpdatedAt)
                    : "Not yet scanned"
                }
              />
            </div>

            <div className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-3 lg:flex-row lg:items-center lg:justify-between">
              <SegmentedFilter
                label="Show"
                value={usageFilter}
                options={[
                  { value: "7d", label: "Unused 7d" },
                  { value: "30d", label: "Unused 30d" },
                  { value: "90d", label: "Unused 90d" },
                  { value: "never", label: "Never observed" },
                  { value: "all", label: "All" },
                ]}
                onChange={(value) => {
                  setUsageFilter(value)
                  setSelectedPaths(new Set())
                }}
              />
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground tabular-nums">
                    {filteredSkills.length}
                  </span>{" "}
                  skills
                </span>
                {selectedSkills.length ? (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={stageSelectedForDisable}
                  >
                    Stage disable for {selectedSkills.length}
                  </Button>
                ) : null}
              </div>
            </div>

            <SkillPulseTable
              skills={filteredSkills}
              usageFilter={usageFilter}
              skillByUsagePath={skillByUsagePath}
              getSkillEnabled={getSkillEnabled}
              selectedPaths={selectedPaths}
              onSelectedChange={setSelected}
              onStageChange={onStageChange}
            />

            <details className="rounded-lg border bg-muted/20 p-3">
              <summary className="cursor-pointer text-sm font-medium">
                Advanced usage tools
              </summary>
              <div className="mt-3 flex flex-col gap-3 border-t pt-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-sm font-medium">
                    Rebuild historical usage
                  </div>
                  <p className="text-xs text-pretty text-muted-foreground">
                    Rescans every session record from every tool and rebuilds the
                    permanent counts. Existing events are deduplicated, so this is
                    safe to repeat. Use it only when history looks incomplete -
                    it takes around half a minute.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={Boolean(scanning)}
                  onClick={() => onScan("backfill-all")}
                >
                  <ClockIcon data-icon="inline-start" />
                  {scanning === "backfill-all"
                    ? "Rebuilding history"
                    : "Rebuild history"}
                </Button>
              </div>
            </details>
          </>
        ) : (
          <EmptyState
            title={
              loading ? "Loading usage history" : "No usage history available"
            }
            description="Update usage to scan local Codex session logs."
            actionLabel="Update usage now"
            onAction={() => onScan("incremental")}
          />
        )}
      </CardContent>
    </Card>
  )
}

export function SegmentedFilter<TValue extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: TValue
  options: Array<{ value: TValue; label: string }>
  onChange: (value: TValue) => void
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <span className="text-sm font-semibold text-foreground">{label}</span>
      <div
        className="flex min-w-0 flex-wrap gap-1.5"
        role="group"
        aria-label={label}
      >
        {options.map((option) => (
          <Button
            key={option.value}
            variant={option.value === value ? "default" : "outline"}
            size="sm"
            aria-pressed={option.value === value}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>
    </div>
  )
}

function SkillPulseTable({
  skills,
  usageFilter,
  skillByUsagePath,
  getSkillEnabled,
  selectedPaths,
  onSelectedChange,
  onStageChange,
  pageSize = 50,
}: {
  skills: SkillPulseSummaryResponse["skills"]
  usageFilter: UsageFilter
  skillByUsagePath: Map<string, ManagedSkill>
  getSkillEnabled: (skill: ManagedSkill) => boolean
  selectedPaths: Set<string>
  onSelectedChange: (skillPath: string, selected: boolean) => void
  onStageChange: (change: ConfigChange, currentEnabled: boolean) => void
  pageSize?: number
}) {
  const [page, setPage] = useState(0)
  const pageCount = Math.max(1, Math.ceil(skills.length / pageSize))
  const currentPage = Math.min(page, pageCount - 1)
  const visibleSkills = skills.slice(
    currentPage * pageSize,
    (currentPage + 1) * pageSize
  )

  if (!skills.length) {
    return (
      <EmptyState
        title="No skills match this usage window"
        description="Try a shorter period or show all tracked skills."
      />
    )
  }

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <p className="text-sm text-muted-foreground">
        {getUsageFilterDescription(usageFilter)}
      </p>
      <p className="text-xs text-muted-foreground">{IMMATURE_NOTE}</p>
      <div className="max-h-[44rem] overflow-auto rounded-lg border">
        <table className="w-full min-w-[74rem] table-fixed caption-bottom text-sm xl:min-w-0">
          <thead className="[&_tr]:border-b">
            <tr className="border-b">
              <th className="sticky top-0 z-20 h-10 w-10 bg-card px-2 text-left align-middle font-medium text-foreground">
                <span className="sr-only">Select</span>
              </th>
              <th className="sticky top-0 z-20 h-10 w-[18%] bg-card px-2 text-left align-middle font-medium whitespace-nowrap text-foreground">
                Skill
              </th>
              <th className="sticky top-0 z-20 h-10 w-[9%] bg-card px-2 text-left align-middle font-medium whitespace-nowrap text-foreground">
                Status
              </th>
              <th
                className="sticky top-0 z-20 h-10 w-[8%] bg-card px-2 text-left align-middle font-medium whitespace-nowrap text-foreground"
                title="Skills younger than 60 days are never treated as unused"
              >
                Installed
              </th>
              <th className="sticky top-0 z-20 h-10 w-[7%] bg-card px-2 text-left align-middle font-medium whitespace-nowrap text-foreground">
                Uses 7d
              </th>
              <th className="sticky top-0 z-20 h-10 w-[7%] bg-card px-2 text-left align-middle font-medium whitespace-nowrap text-foreground">
                Uses 30d
              </th>
              <th className="sticky top-0 z-20 h-10 w-[7%] bg-card px-2 text-left align-middle font-medium whitespace-nowrap text-foreground">
                Uses 90d
              </th>
              <th
                className="sticky top-0 z-20 h-10 w-[8%] bg-card px-2 text-left align-middle font-medium whitespace-nowrap text-foreground"
                title="All-time uses, kept in the permanent ledger so log cleanup cannot lose them"
              >
                Uses total
              </th>
              <th
                className="sticky top-0 z-20 h-10 w-[15%] bg-card px-2 text-left align-middle font-medium whitespace-nowrap text-foreground"
                title="Which agent tools used this skill"
              >
                Used by
              </th>
              <th className="sticky top-0 z-20 h-10 w-[11%] bg-card px-2 text-left align-middle font-medium whitespace-nowrap text-foreground">
                Last observed
              </th>
              <th className="sticky top-0 z-20 h-10 w-[10%] bg-card px-2 text-left align-middle font-medium whitespace-nowrap text-foreground">
                Action
              </th>
            </tr>
          </thead>
          <tbody className="[&_tr:last-child]:border-0">
            {visibleSkills.map((skill) => {
              const managedSkill = skillByUsagePath.get(
                getSkillPulsePathKey(skill.skillPath)
              )
              const canSelect = Boolean(
                managedSkill &&
                managedSkill.editable &&
                getSkillEnabled(managedSkill) &&
                skill.effectiveStatus !== "disabled-by-plugin"
              )

              return (
                <tr
                  key={skill.skillPath}
                  className="border-b transition-colors [contain-intrinsic-size:auto_5rem] [content-visibility:auto] hover:bg-muted/50"
                >
                  <td className="p-2 align-middle">
                    <input
                      type="checkbox"
                      className="size-4 rounded border-input accent-primary"
                      checked={selectedPaths.has(skill.skillPath)}
                      disabled={!canSelect}
                      aria-label={`Select ${skill.skillName}`}
                      onChange={(event) =>
                        onSelectedChange(
                          skill.skillPath,
                          event.currentTarget.checked
                        )
                      }
                    />
                  </td>
                  <td className="p-2 align-middle">
                    <div className="flex min-w-0 flex-col gap-1">
                      <span className="truncate font-medium">
                        {skill.skillName}
                      </span>
                      <span className="truncate font-mono text-xs text-muted-foreground">
                        {getCompactPathLabel(skill.skillPath)}
                      </span>
                      {skill.parentPluginKey ? (
                        <span className="truncate text-xs text-muted-foreground">
                          {skill.parentPluginKey}
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className="p-2 align-middle">
                    <Badge
                      variant={
                        skill.effectiveStatus === "active"
                          ? "secondary"
                          : "outline"
                      }
                    >
                      {formatSkillPulseStatus(skill.effectiveStatus)}
                    </Badge>
                  </td>
                  <td className="p-2 align-middle">
                    <InstalledCell
                      installedAt={skill.installedAt}
                      ageDays={skill.ageDays}
                      source={skill.installDateSource}
                      loadsAllTime={skill.loadsAllTime}
                    />
                  </td>
                  <td className="p-2 align-middle tabular-nums">
                    {skill.loads7d}
                  </td>
                  <td className="p-2 align-middle tabular-nums">
                    {skill.loads30d}
                  </td>
                  <td className="p-2 align-middle tabular-nums">
                    {skill.loads90d}
                  </td>
                  <td className="p-2 align-middle font-medium tabular-nums">
                    {skill.loadsAllTime}
                  </td>
                  <td className="p-2 align-middle">
                    <HarnessUsageBadges byHarness={skill.byHarness} />
                  </td>
                  <td className="p-2 align-middle text-sm text-muted-foreground">
                    {skill.lastLoadedAt
                      ? formatDateTime(skill.lastLoadedAt)
                      : "Never"}
                  </td>
                  <td className="p-2 align-middle">
                    <SkillPulseActionControl
                      usage={skill}
                      skill={managedSkill}
                      getSkillEnabled={getSkillEnabled}
                      onStageChange={onStageChange}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <PaginationFooter
        currentPage={currentPage}
        pageCount={pageCount}
        itemCount={skills.length}
        pageSize={pageSize}
        onPageChange={setPage}
        ariaLabel="SkillPulse pagination"
      />
    </div>
  )
}

function SkillPulseActionControl({
  usage,
  skill,
  getSkillEnabled,
  onStageChange,
}: {
  usage: SkillPulseSummaryResponse["skills"][number]
  skill?: ManagedSkill
  getSkillEnabled: (skill: ManagedSkill) => boolean
  onStageChange: (change: ConfigChange, currentEnabled: boolean) => void
}) {
  if (!skill) {
    return (
      <span className="text-xs text-muted-foreground">Not configurable</span>
    )
  }

  const enabled = getSkillEnabled(skill)
  const editable =
    skill.editable && usage.effectiveStatus !== "disabled-by-plugin"
  const nextEnabled = !enabled

  return (
    <div className="flex min-w-0 flex-col items-start gap-1">
      <Button
        variant="outline"
        size="sm"
        disabled={!editable}
        onClick={() =>
          onStageChange(
            {
              id: getSkillChangeId(skill),
              kind: "skill",
              label: skill.name,
              target: skill.path,
              enabled: nextEnabled,
            },
            getBaseSkillEnabled(skill)
          )
        }
      >
        {nextEnabled ? "Stage enable" : "Stage disable"}
      </Button>
      {!editable ? (
        <span className="text-xs text-muted-foreground">
          {usage.effectiveStatus === "disabled-by-plugin"
            ? "Enable the parent plugin first"
            : "Not editable"}
        </span>
      ) : null}
    </div>
  )
}

/** Short labels so the "Used by" column stays readable at a glance. */
const HARNESS_SHORT_LABELS: Record<string, string> = {
  codex: "Codex",
  "claude-code": "Claude",
  commandcode: "CmdCode",
  opencode: "opencode",
}

/**
 * Shows which agent tools actually invoked a skill. This is the column that
 * stops a skill from being deleted just because the tool you happened to be
 * watching never used it.
 */
function HarnessUsageBadges({ byHarness }: { byHarness: Record<string, number> }) {
  const entries = Object.entries(byHarness).sort(
    (left, right) => right[1] - left[1]
  )

  if (!entries.length) {
    return <span className="text-xs text-muted-foreground">-</span>
  }

  return (
    <div className="flex flex-wrap gap-1">
      {entries.map(([harness, count]) => (
        <Badge key={harness} variant="outline" className="tabular-nums">
          {HARNESS_SHORT_LABELS[harness] ?? harness} {count}
        </Badge>
      ))}
    </div>
  )
}

/**
 * Install date, with an explicit "New" marker for skills too young to judge.
 *
 * Without this the table shows a skill added days ago sitting beside a skill
 * that has genuinely never been used, and they look identical.
 */
function InstalledCell({
  installedAt,
  ageDays,
  source,
  loadsAllTime,
}: {
  installedAt?: string
  ageDays?: number
  source?: "registry" | "folder" | "unknown"
  loadsAllTime: number
}) {
  if (!installedAt || ageDays === undefined) {
    return <span className="text-xs text-muted-foreground">Unknown</span>
  }

  // Mirrors getRecommendation: a folder estimate can be later than the true
  // install date, and proven usage means the skill is established regardless.
  const immature =
    ageDays < SKILL_MATURITY_DAYS && loadsAllTime < PROVEN_VALUE_USES

  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm tabular-nums text-foreground">{ageDays}d ago</span>
      <span className="text-xs text-muted-foreground">
        {formatDateTime(installedAt)}
      </span>
      {immature ? (
        <Badge variant="secondary" title="Too new to judge - excluded from cleanup">
          {IMMATURE_LABEL}
        </Badge>
      ) : null}
      {source === "folder" ? (
        <span className="text-[10px] text-muted-foreground">estimated</span>
      ) : null}
    </div>
  )
}

function formatSkillPulseStatus(
  status: SkillPulseSummaryResponse["skills"][number]["effectiveStatus"]
) {
  const labels: Record<
    SkillPulseSummaryResponse["skills"][number]["effectiveStatus"],
    string
  > = {
    active: "Active",
    "disabled-by-plugin": "Plugin disabled",
    "disabled-by-skill": "Skill disabled",
    "installed-not-loaded": "Not loaded",
  }
  return labels[status]
}
