"use client"

import { useState } from "react"

import type { ConfigChange } from "@/lib/config-editor"
import type {
  ControlGate,
  ManagedMcpServer,
} from "@/lib/skills"
import { Badge } from "@workspace/ui/components/badge"
import { Switch } from "@workspace/ui/components/switch"
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
  EmptyState,
  OriginBadge,
  PaginationFooter,
  StatusBadge,
  formatControlGateLabel,
  getMcpChangeId,
} from "./shared"

export function McpTable({
  servers,
  getMcpEnabled,
  onStageChange,
  onDetails,
  onOpenExternal,
  onOpenConfigGate,
  pageSize = 50,
}: {
  servers: ManagedMcpServer[]
  getMcpEnabled: (server: ManagedMcpServer) => boolean
  onStageChange: (change: ConfigChange, currentEnabled: boolean) => void
  onDetails: (detailId: string) => void
  onOpenExternal: (detailId: string) => void
  onOpenConfigGate: (gate: ControlGate) => void
  pageSize?: number
}) {
  const [page, setPage] = useState(0)
  const pageCount = Math.max(1, Math.ceil(servers.length / pageSize))
  const currentPage = Math.min(page, pageCount - 1)
  const visibleServers = servers.slice(
    currentPage * pageSize,
    (currentPage + 1) * pageSize
  )

  if (!servers.length) {
    return <EmptyState title="No MCP servers match this view" />
  }

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="max-h-[44rem] overflow-y-auto rounded-lg border">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-card">
            <TableRow>
              <TableHead>Server</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Endpoint</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleServers.map((server) => {
            const enabled = getMcpEnabled(server)

            return (
              <TableRow
                key={`${server.source}-${server.name}-${server.parentPluginKey ?? "config"}`}
                className="[contain-intrinsic-size:auto_5rem] [content-visibility:auto]"
              >
                <TableCell>
                  <div className="flex flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{server.name}</span>
                      <OriginBadge origin={server.origin} />
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {server.parentPluginKey ?? "Codex config"}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{server.source}</Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={enabled}
                      disabled={!server.editable}
                      aria-label={`${server.name} MCP status`}
                      onCheckedChange={(nextEnabled) =>
                        onStageChange(
                          {
                            id: getMcpChangeId(server),
                            kind: "mcp",
                            label: server.name,
                            target: server.name,
                            enabled: nextEnabled,
                          },
                          server.enabled
                        )
                      }
                    />
                    <StatusBadge
                      active={enabled}
                      label={enabled ? "Active" : "Disabled"}
                    />
                  </div>
                </TableCell>
                <TableCell className="max-w-80 truncate font-mono text-xs text-muted-foreground">
                  <div className="flex flex-col gap-1">
                    <span className="truncate">{server.endpoint}</span>
                    <span className="truncate font-sans text-[0.7rem]">
                      {server.editable
                        ? server.statusReason
                        : "Controlled by parent plugin"}
                    </span>
                    <span className="truncate font-sans text-[0.7rem]">
                      {formatControlGateLabel(server.controlGate)}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <ActionButtons
                    detailId={server.detailId}
                    deleteLabel={`Delete ${server.name}`}
                    onDetails={onDetails}
                    onOpenExternal={onOpenExternal}
                    controlGate={server.controlGate}
                    onOpenConfigGate={onOpenConfigGate}
                    canOpen={Boolean(server.path)}
                  />
                </TableCell>
              </TableRow>
            )
          })}
          </TableBody>
        </Table>
      </div>
      <PaginationFooter
        currentPage={currentPage}
        pageCount={pageCount}
        itemCount={servers.length}
        pageSize={pageSize}
        onPageChange={setPage}
        ariaLabel="MCP servers pagination"
      />
    </div>
  )
}
