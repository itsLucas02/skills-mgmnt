"use client"

import { ChevronDownIcon, ChevronRightIcon, PackageIcon } from "lucide-react"

import type { ConfigChange } from "@/lib/config-editor"
import type {
  ControlGate,
  ManagedPlugin,
  ManagedSkill,
} from "@/lib/skills"
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
import { Separator } from "@workspace/ui/components/separator"
import { Switch } from "@workspace/ui/components/switch"

import { SkillTable } from "./skill-table"
import {
  ActionButtons,
  EmptyState,
  Metric,
  OriginBadge,
  StatusBadge,
  getPluginChangeId,
} from "./shared"

export function PluginBundleList({
  plugins,
  collapsedPlugins,
  getPluginEnabled,
  getSkillEnabled,
  onPluginCollapse,
  onStageChange,
  onDetails,
  onOpenExternal,
  onOpenConfigGate,
}: {
  plugins: ManagedPlugin[]
  collapsedPlugins: Record<string, boolean>
  getPluginEnabled: (plugin: ManagedPlugin) => boolean
  getSkillEnabled: (skill: ManagedSkill) => boolean
  onPluginCollapse: (pluginKey: string) => void
  onStageChange: (change: ConfigChange, currentEnabled: boolean) => void
  onDetails: (detailId: string) => void
  onOpenExternal: (detailId: string) => void
  onOpenConfigGate: (gate: ControlGate) => void
}) {
  if (!plugins.length) {
    return <EmptyState title="No plugin bundles match this view" />
  }

  return (
    <div className="flex flex-col gap-3">
      {plugins.map((plugin) => {
        const pluginEnabled = getPluginEnabled(plugin)
        const collapsed = Boolean(collapsedPlugins[plugin.key])

        return (
          <Card key={plugin.key} size="sm">
            <CardHeader>
              <div className="flex min-w-0 flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`${collapsed ? "Expand" : "Collapse"} ${plugin.displayName}`}
                    onClick={() => onPluginCollapse(plugin.key)}
                  >
                    {collapsed ? <ChevronRightIcon /> : <ChevronDownIcon />}
                  </Button>
                  <PackageIcon className="size-4 text-muted-foreground" />
                  <CardTitle>{plugin.displayName}</CardTitle>
                  <StatusBadge
                    active={pluginEnabled}
                    label={pluginEnabled ? "Plugin active" : "Plugin disabled"}
                  />
                  <Badge variant="outline">{plugin.marketplace}</Badge>
                  <OriginBadge origin={plugin.origin} />
                </div>
                <CardDescription>{plugin.description}</CardDescription>
              </div>
              <CardAction>
                <div className="flex items-center gap-3">
                  <Switch
                    checked={pluginEnabled}
                    aria-label={`${plugin.displayName} plugin status`}
                    onCheckedChange={(enabled) =>
                      onStageChange(
                        {
                          id: getPluginChangeId(plugin),
                          kind: "plugin",
                          label: plugin.displayName,
                          target: plugin.key,
                          enabled,
                        },
                        plugin.enabled
                      )
                    }
                  />
                  <ActionButtons
                    detailId={plugin.detailId}
                    deleteLabel={`Delete ${plugin.displayName}`}
                    onDetails={onDetails}
                    onOpenExternal={onOpenExternal}
                    controlGate={plugin.controlGate}
                    onOpenConfigGate={onOpenConfigGate}
                  />
                </div>
              </CardAction>
            </CardHeader>
            {collapsed ? null : (
              <CardContent className="flex flex-col gap-3">
                <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-4">
                  <Metric
                    label="Skills"
                    value={plugin.skills.length.toString()}
                  />
                  <Metric
                    label="MCP"
                    value={plugin.mcpServerCount.toString()}
                  />
                  <Metric label="Apps" value={plugin.appCount.toString()} />
                  <Metric label="Version" value={plugin.version ?? "Unknown"} />
                </div>
                <Separator />
                <SkillTable
                  skills={plugin.skills}
                  emptyTitle="This plugin has no skill files"
                  getSkillEnabled={getSkillEnabled}
                  parentPluginEnabled={pluginEnabled}
                  onStageChange={onStageChange}
                  onDetails={onDetails}
                  onOpenExternal={onOpenExternal}
                  onOpenConfigGate={onOpenConfigGate}
                  compact
                />
              </CardContent>
            )}
          </Card>
        )
      })}
    </div>
  )
}
