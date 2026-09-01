"use client"

import type { ReactElement } from "react"
import {
  CheckCircle2Icon,
  ExternalLinkIcon,
  EyeIcon,
  FileCogIcon,
  FolderSearchIcon,
  PauseCircleIcon,
  Trash2Icon,
} from "lucide-react"

import type { ConfigChange } from "@/lib/config-editor"
import type {
  CapabilityOrigin,
  ControlGate,
  ManagedMcpServer,
  ManagedPlugin,
  ManagedSkill,
} from "@/lib/skills"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Switch } from "@workspace/ui/components/switch"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"
import { cn } from "@workspace/ui/lib/utils"

export function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border bg-muted/30 px-3 py-2">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="text-sm break-all" title={value}>
        {value}
      </div>
    </div>
  )
}

export function StatusBadge({ active, label }: { active: boolean; label: string }) {
  return (
    <Badge variant={active ? "secondary" : "outline"}>
      {active ? (
        <CheckCircle2Icon data-icon="inline-start" />
      ) : (
        <PauseCircleIcon data-icon="inline-start" />
      )}
      {label}
    </Badge>
  )
}

export function OriginBadge({ origin }: { origin: CapabilityOrigin }) {
  return (
    <Tooltip>
      <TooltipTrigger render={<span className="inline-flex" />}>
        <Badge
          variant="outline"
          className={getOriginBadgeClassName(origin.label)}
        >
          {origin.label}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        {origin.detail} Confidence: {origin.confidence}.
      </TooltipContent>
    </Tooltip>
  )
}

export function getOriginBadgeClassName(label: string) {
  const baseClassName = "border bg-opacity-100"

  switch (label) {
    case "Codex system":
      return cn(
        baseClassName,
        "border-sky-500/35 bg-sky-500/10 text-sky-700 dark:text-sky-300"
      )
    case "Codex local":
      return cn(
        baseClassName,
        "border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
      )
    case "Agent shared":
      return cn(
        baseClassName,
        "border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-300"
      )
    case "Plugin cache":
      return cn(
        baseClassName,
        "border-indigo-500/35 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300"
      )
    case "OpenAI plugin":
      return cn(
        baseClassName,
        "border-violet-500/35 bg-violet-500/10 text-violet-700 dark:text-violet-300"
      )
    case "Third-party plugin":
      return cn(
        baseClassName,
        "border-fuchsia-500/35 bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300"
      )
    case "Plugin":
      return cn(
        baseClassName,
        "border-cyan-500/35 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300"
      )
    case "Codex config":
      return cn(
        baseClassName,
        "border-slate-500/35 bg-slate-500/10 text-slate-700 dark:text-slate-300"
      )
    default:
      return cn(baseClassName, "border-border bg-muted text-muted-foreground")
  }
}

export function EmptyState({
  title,
  description = "Adjust your search or filters to see another capability group.",
  actionLabel,
  onAction,
}: {
  title: string
  description?: string
  actionLabel?: string
  onAction?: () => void
}) {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-lg border bg-muted/30 p-6 text-center">
      <FolderSearchIcon />
      <div className="font-medium text-balance">{title}</div>
      <p className="max-w-sm text-sm text-pretty text-muted-foreground">
        {description}
      </p>
      {actionLabel && onAction ? (
        <Button variant="outline" size="sm" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  )
}

export function TooltipIconButton({
  label,
  children,
}: {
  label: string
  children: ReactElement
}) {
  return (
    <Tooltip>
      <TooltipTrigger render={<span className="inline-flex" />}>
        {children}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

export function PaginationFooter({
  currentPage,
  pageCount,
  itemCount,
  pageSize,
  onPageChange,
  ariaLabel = "Pagination",
}: {
  currentPage: number
  pageCount: number
  itemCount: number
  pageSize: number
  onPageChange: (page: number) => void
  ariaLabel?: string
}) {
  if (pageCount <= 1) {
    return null
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-muted-foreground tabular-nums">
        Showing {currentPage * pageSize + 1}-
        {Math.min((currentPage + 1) * pageSize, itemCount)} of {itemCount}
      </p>
      <div className="flex gap-2" aria-label={ariaLabel}>
        <Button
          variant="outline"
          size="sm"
          disabled={currentPage === 0}
          onClick={() => onPageChange(Math.max(0, currentPage - 1))}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={currentPage === pageCount - 1}
          onClick={() => onPageChange(Math.min(pageCount - 1, currentPage + 1))}
        >
          Next
        </Button>
      </div>
    </div>
  )
}

export function ActionButtons({
  detailId,
  deleteLabel,
  onDetails,
  onOpenExternal,
  controlGate,
  onOpenConfigGate,
  canOpen = true,
  deleteTarget,
  onDelete,
}: {
  detailId: string
  deleteLabel: string
  onDetails: (detailId: string) => void
  onOpenExternal: (detailId: string) => void
  controlGate: ControlGate
  onOpenConfigGate: (gate: ControlGate) => void
  canOpen?: boolean
  deleteTarget?: { path: string; name: string }
  onDelete?: (target: { path: string; name: string }) => void
}) {
  return (
    <div className="flex justify-end gap-2">
      <TooltipIconButton label="View details">
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="View details"
          onClick={() => onDetails(detailId)}
        >
          <EyeIcon />
        </Button>
      </TooltipIconButton>
      <TooltipIconButton
        label={
          canOpen ? "Open source file or folder" : "No source path is available"
        }
      >
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Open source"
          disabled={!canOpen}
          onClick={() => onOpenExternal(detailId)}
        >
          <ExternalLinkIcon />
        </Button>
      </TooltipIconButton>
      <TooltipIconButton
        label={
          controlGate.detailId
            ? `Open config gate: ${controlGate.reason}`
            : controlGate.reason
        }
      >
        <Button
          variant="outline"
          size="icon-sm"
          aria-label={`Open config gate: ${controlGate.reason}`}
          disabled={!controlGate.detailId}
          onClick={() => onOpenConfigGate(controlGate)}
        >
          <FileCogIcon />
        </Button>
      </TooltipIconButton>
      <TooltipIconButton
        label={
          deleteTarget && onDelete
            ? "Move this skill folder to the local trash. Restore from the trash panel."
            : "Delete is only available for standalone skills"
        }
      >
        <Button
          variant="destructive"
          size="icon-sm"
          aria-label={deleteLabel}
          disabled={!deleteTarget || !onDelete}
          onClick={() => {
            if (deleteTarget && onDelete) {
              onDelete(deleteTarget)
            }
          }}
        >
          <Trash2Icon />
        </Button>
      </TooltipIconButton>
    </div>
  )
}

export function EffectiveStatusControl({
  skill,
  checked,
  parentPluginEnabled,
  onStageChange,
}: {
  skill: ManagedSkill
  checked: boolean
  parentPluginEnabled: boolean
  onStageChange: (change: ConfigChange, currentEnabled: boolean) => void
}) {
  const editable = skill.editable && parentPluginEnabled
  const active = checked && parentPluginEnabled
  const blockedByPlugin = !parentPluginEnabled && Boolean(skill.parentPluginKey)

  return (
    <div className="flex items-center gap-2">
      <Switch
        checked={active}
        disabled={!editable}
        aria-label={`${skill.name} skill status`}
        onCheckedChange={(enabled) =>
          onStageChange(
            {
              id: getSkillChangeId(skill),
              kind: "skill",
              label: skill.name,
              target: skill.path,
              enabled,
            },
            getBaseSkillEnabled(skill)
          )
        }
      />
      {active ? (
        <CheckCircle2Icon className="text-muted-foreground" />
      ) : (
        <PauseCircleIcon className="text-muted-foreground" />
      )}
      <Badge
        variant={
          active ? "secondary" : blockedByPlugin ? "destructive" : "outline"
        }
      >
        {blockedByPlugin
          ? "Plugin disabled"
          : active
            ? "Active"
            : "Skill disabled"}
      </Badge>
    </div>
  )
}

export function filterSkills(
  skills: ManagedSkill[],
  normalizedQuery: string,
  searchIndex: Map<string, string>
) {
  return skills.filter((skill) => {
    const searchable =
      searchIndex.get(skill.path) ??
      `${skill.name} ${skill.description} ${skill.parentPluginName ?? ""}`.toLowerCase()
    return !normalizedQuery || searchable.includes(normalizedQuery)
  })
}

export function getSkillPulsePathKey(skillPath: string) {
  return skillPath.toLowerCase()
}

export function getPluginChangeId(plugin: ManagedPlugin) {
  return `plugin:${plugin.key}`
}

export function getSkillChangeId(skill: ManagedSkill) {
  return `skill:${skill.path}`
}

export function getMcpChangeId(server: ManagedMcpServer) {
  return `mcp:${server.name}`
}

export function getBaseSkillEnabled(skill: ManagedSkill) {
  return (
    skill.effectiveStatus !== "disabled-by-skill" &&
    skill.effectiveStatus !== "installed-not-loaded"
  )
}

export function getSkillStatusReason(
  skill: ManagedSkill,
  parentPluginEnabled: boolean
) {
  if (skill.parentPluginKey && !parentPluginEnabled) {
    return `Disabled by parent plugin ${skill.parentPluginKey}`
  }

  if (!skill.editable && skill.effectiveStatus === "installed-not-loaded") {
    return "Not editable from config because the skill is disabled by folder naming"
  }

  return skill.statusReason
}

export function formatControlGateLabel(gate: ControlGate) {
  if (gate.relativePath) {
    return `${gate.label}: ${gate.relativePath}${gate.line ? `:${gate.line}` : ""}`
  }

  return `${gate.label}: ${gate.reason}`
}

export function formatDateTime(value: string) {
  return new Date(value).toLocaleString()
}
