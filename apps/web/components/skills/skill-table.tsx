"use client"

import { useState } from "react"

import type { ConfigChange } from "@/lib/config-editor"
import type {
  ControlGate,
  ManagedSkill,
} from "@/lib/skills"
import { getCompactPathLabel } from "@/lib/path-display"
import { Badge } from "@workspace/ui/components/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

import {
  ActionButtons,
  EffectiveStatusControl,
  EmptyState,
  OriginBadge,
  PaginationFooter,
  formatControlGateLabel,
  getSkillStatusReason,
} from "./shared"

export function SkillTable({
  skills,
  emptyTitle,
  getSkillEnabled,
  onStageChange,
  onDetails,
  onOpenExternal,
  onOpenConfigGate,
  onDelete,
  showParent = false,
  compact = false,
  parentPluginEnabled = true,
  pageSize,
}: {
  skills: ManagedSkill[]
  emptyTitle: string
  getSkillEnabled: (skill: ManagedSkill) => boolean
  onStageChange: (change: ConfigChange, currentEnabled: boolean) => void
  onDetails: (detailId: string) => void
  onOpenExternal: (detailId: string) => void
  onOpenConfigGate: (gate: ControlGate) => void
  onDelete?: (target: { path: string; name: string }) => void
  showParent?: boolean
  compact?: boolean
  parentPluginEnabled?: boolean
  pageSize?: number
}) {
  const [page, setPage] = useState(0)
  const pageCount = pageSize
    ? Math.max(1, Math.ceil(skills.length / pageSize))
    : 1
  const currentPage = Math.min(page, pageCount - 1)
  const visibleSkills = pageSize
    ? skills.slice(currentPage * pageSize, (currentPage + 1) * pageSize)
    : skills

  if (!skills.length) {
    return <EmptyState title={emptyTitle} />
  }

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div
        className={
          compact
            ? "overflow-hidden rounded-lg border"
            : "max-h-[44rem] overflow-y-auto rounded-lg border"
        }
      >
        <Table className="table-fixed">
          <TableHeader className="sticky top-0 z-10 bg-card">
            <TableRow>
              <TableHead className={showParent ? "w-[28%]" : "w-[34%]"}>
                Skill
              </TableHead>
              {showParent ? (
                <TableHead className="w-[14%]">Parent</TableHead>
              ) : null}
              <TableHead className="w-44">Status</TableHead>
              <TableHead>Path</TableHead>
              <TableHead className="w-44 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleSkills.map((skill) => (
              <TableRow
                key={skill.id}
                className="[contain-intrinsic-size:auto_5rem] [content-visibility:auto]"
              >
                <TableCell className="min-w-0 whitespace-normal">
                  <div className="flex flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{skill.name}</span>
                      <OriginBadge origin={skill.origin} />
                    </div>
                    <span className="line-clamp-2 text-muted-foreground">
                      {skill.description}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {skill.provenance?.author ? `Author: ${skill.provenance.author} · ` : ""}
                      {skill.provenance?.sourceUrl ? <a className="underline underline-offset-4 hover:text-foreground" href={skill.provenance.sourceUrl} target="_blank" rel="noreferrer">{skill.provenance.source ?? skill.provenance.sourceUrl}</a> : skill.provenance?.publisher ? `Plugin publisher: ${skill.provenance.publisher}` : "Source unknown"}
                    </span>
                  </div>
                </TableCell>
                {showParent ? (
                  <TableCell>
                    <Badge variant="outline">
                      {skill.parentPluginKey ?? "Standalone"}
                    </Badge>
                  </TableCell>
                ) : null}
                <TableCell>
                  <EffectiveStatusControl
                    skill={skill}
                    checked={getSkillEnabled(skill)}
                    parentPluginEnabled={parentPluginEnabled}
                    onStageChange={onStageChange}
                  />
                </TableCell>
                <TableCell className="min-w-0 overflow-hidden font-mono text-xs text-muted-foreground">
                  <div className="flex min-w-0 flex-col gap-1">
                    <span
                      className="truncate"
                      title={skill.relativePath}
                      aria-label={skill.relativePath}
                    >
                      {getCompactPathLabel(skill.relativePath)}
                    </span>
                    <span className="truncate font-sans text-[0.7rem]">
                      {getSkillStatusReason(skill, parentPluginEnabled)}
                    </span>
                    <span
                      className="truncate font-sans text-[0.7rem]"
                      title={formatControlGateLabel(skill.controlGate)}
                    >
                      {formatControlGateLabel(skill.controlGate)}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <ActionButtons
                    detailId={skill.detailId}
                    deleteLabel={`Delete ${skill.name}`}
                    onDetails={onDetails}
                    onOpenExternal={onOpenExternal}
                    controlGate={skill.controlGate}
                    onOpenConfigGate={onOpenConfigGate}
                    deleteTarget={
                      onDelete && !skill.parentPluginKey && !skill.isolated
                        ? { path: skill.path, name: skill.name }
                        : undefined
                    }
                    onDelete={onDelete}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {pageSize && pageCount > 1 ? (
        <PaginationFooter
          currentPage={currentPage}
          pageCount={pageCount}
          itemCount={skills.length}
          pageSize={pageSize}
          onPageChange={setPage}
        />
      ) : null}
    </div>
  )
}
