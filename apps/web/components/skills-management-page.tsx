"use client"

import type { ReactElement } from "react"
import { useEffect, useMemo, useState } from "react"
import Image from "next/image"
import { useRouter } from "next/navigation"
import {
  ArchiveIcon,
  CheckCircle2Icon,
  ChevronDownIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
  FileCogIcon,
  EyeIcon,
  FolderSearchIcon,
  InfoIcon,
  PackageIcon,
  PackagePlusIcon,
  PauseCircleIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  SaveIcon,
  SearchIcon,
  ShieldAlertIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react"

import type { ConfigChange, ConfigChangePreview } from "@/lib/config-editor"
import type {
  CapabilityOrigin,
  ControlGate,
  ManagedMcpServer,
  ManagedPlugin,
  ManagedSkill,
  SkillDetail,
  SkillSummary,
} from "@/lib/skills"
import { Alert, AlertDescription, AlertTitle } from "@workspace/ui/components/alert"
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { Progress } from "@workspace/ui/components/progress"
import { ScrollArea } from "@workspace/ui/components/scroll-area"
import { Separator } from "@workspace/ui/components/separator"
import { Switch } from "@workspace/ui/components/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@workspace/ui/components/tabs"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"
import { cn } from "@workspace/ui/lib/utils"

type CapabilityInventory = {
  skills: ManagedSkill[]
  plugins: ManagedPlugin[]
  standaloneSkills: ManagedSkill[]
  mcpServers: ManagedMcpServer[]
  summary: SkillSummary
}

type MainTab = "plugins" | "standalone" | "mcp" | "raw"

type ApplyState = {
  lastAppliedAt?: string
  backupPath?: string
  restartRequired?: boolean
  restartDismissedAt?: string
}

type ApplyResult = {
  appliedAt: string
  backupPath: string
  preview: ConfigChangePreview[]
}

const mainTabs = [
  { value: "plugins", label: "Plugins" },
  { value: "standalone", label: "Standalone Skills" },
  { value: "mcp", label: "MCP Servers" },
  { value: "raw", label: "Raw Inventory" },
] satisfies Array<{ value: MainTab; label: string }>

const COLLAPSED_PLUGINS_KEY = "skills-mgmnt-collapsed-plugins"

export function SkillsManagementPage({
  inventory,
}: {
  inventory: CapabilityInventory
}) {
  const router = useRouter()
  const [query, setQuery] = useState("")
  const [tab, setTab] = useState<MainTab>("plugins")
  const [detail, setDetail] = useState<SkillDetail | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [notice, setNotice] = useState("")
  const [stagedChanges, setStagedChanges] = useState<Record<string, ConfigChange>>({})
  const [collapsedPlugins, setCollapsedPlugins] = useState<Record<string, boolean>>({})
  const [applyState, setApplyState] = useState<ApplyState>({})
  const [applyOpen, setApplyOpen] = useState(false)
  const [applying, setApplying] = useState(false)
  const [lastApplyResult, setLastApplyResult] = useState<ApplyResult | null>(null)

  const normalizedQuery = query.trim().toLowerCase()
  const stagedList = useMemo(() => Object.values(stagedChanges), [stagedChanges])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setCollapsedPlugins(readCollapsedPlugins())
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [])

  useEffect(() => {
    async function loadApplyState() {
      const response = await fetch("/api/config/apply-state")
      if (!response.ok) {
        return
      }

      setApplyState((await response.json()) as ApplyState)
    }

    void loadApplyState()
  }, [])

  const filteredPlugins = useMemo(
    () =>
      inventory.plugins.filter((plugin) => {
        const searchable = `${plugin.displayName} ${plugin.description} ${plugin.key} ${plugin.marketplace} ${plugin.origin.label} ${plugin.controlGate.section ?? ""} ${plugin.skills
          .map((skill) => `${skill.name} ${skill.description}`)
          .join(" ")}`.toLowerCase()
        return !normalizedQuery || searchable.includes(normalizedQuery)
      }),
    [inventory.plugins, normalizedQuery]
  )

  const filteredStandaloneSkills = useMemo(
    () => filterSkills(inventory.standaloneSkills, normalizedQuery),
    [inventory.standaloneSkills, normalizedQuery]
  )
  const filteredRawSkills = useMemo(
    () => filterSkills(inventory.skills, normalizedQuery),
    [inventory.skills, normalizedQuery]
  )
  const filteredMcpServers = useMemo(
    () =>
      inventory.mcpServers.filter((server) => {
        const searchable = `${server.name} ${server.source} ${server.origin.label} ${server.endpoint} ${server.parentPluginKey ?? ""}`.toLowerCase()
        return !normalizedQuery || searchable.includes(normalizedQuery)
      }),
    [inventory.mcpServers, normalizedQuery]
  )

  function saveCollapsedState(nextState: Record<string, boolean>) {
    setCollapsedPlugins(nextState)
    window.localStorage.setItem(COLLAPSED_PLUGINS_KEY, JSON.stringify(nextState))
  }

  function togglePluginCollapse(pluginKey: string) {
    saveCollapsedState({
      ...collapsedPlugins,
      [pluginKey]: !collapsedPlugins[pluginKey],
    })
  }

  function setAllPluginsCollapsed(collapsed: boolean) {
    saveCollapsedState(
      Object.fromEntries(inventory.plugins.map((plugin) => [plugin.key, collapsed]))
    )
  }

  function stageChange(change: ConfigChange, currentEnabled: boolean) {
    setNotice("")
    setLastApplyResult(null)
    setStagedChanges((current) => {
      const next = { ...current }

      if (change.enabled === currentEnabled) {
        delete next[change.id]
      } else {
        next[change.id] = change
      }

      return next
    })
  }

  function getPluginEnabled(plugin: ManagedPlugin) {
    return stagedChanges[getPluginChangeId(plugin)]?.enabled ?? plugin.enabled
  }

  function getSkillEnabled(skill: ManagedSkill) {
    return stagedChanges[getSkillChangeId(skill)]?.enabled ?? getBaseSkillEnabled(skill)
  }

  function getMcpEnabled(server: ManagedMcpServer) {
    return stagedChanges[getMcpChangeId(server)]?.enabled ?? server.enabled
  }

  async function showDetails(detailId: string) {
    setDetailLoading(true)
    setDetailOpen(true)
    setNotice("")

    const response = await fetch(`/api/skill-details?id=${encodeURIComponent(detailId)}`)
    const payload = await response.json()

    if (!response.ok) {
      setNotice(payload.error ?? "Could not load details.")
      setDetail(null)
      setDetailLoading(false)
      return
    }

    setDetail(payload)
    setDetailLoading(false)
  }

  async function openExternal(detailId: string) {
    setNotice("")

    const response = await fetch("/api/open-external", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: detailId }),
    })
    const payload = await response.json()

    setNotice(
      response.ok
        ? `Opened with ${payload.openedWith}.`
        : payload.error ?? "Could not open external target."
    )
  }

  async function openConfigGate(gate: ControlGate) {
    if (!gate.detailId) {
      setNotice(gate.reason)
      return
    }

    await openExternal(gate.detailId)
  }

  async function applyChanges() {
    if (!stagedList.length) {
      return
    }

    setApplying(true)
    setNotice("")

    const response = await fetch("/api/config/apply-changes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ changes: stagedList }),
    })
    const payload = await response.json()
    setApplying(false)

    if (!response.ok) {
      setNotice(payload.error ?? "Could not apply config changes.")
      return
    }

    setLastApplyResult(payload as ApplyResult)
    setApplyState({
      lastAppliedAt: payload.appliedAt,
      backupPath: payload.backupPath,
      restartRequired: true,
    })
    setStagedChanges({})
    setApplyOpen(false)
    setNotice(`Applied ${payload.preview.length} config change${payload.preview.length === 1 ? "" : "s"}. Restart Codex for the session to load them.`)
    router.refresh()
  }

  async function dismissRestartWarning() {
    const response = await fetch("/api/config/dismiss-restart", { method: "POST" })
    if (response.ok) {
      setApplyState((await response.json()) as ApplyState)
    }
  }

  return (
    <TooltipProvider>
      <main className="min-h-svh bg-background text-foreground">
      <section className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8">
        <PageHeader />

        <Alert>
          <ShieldAlertIcon />
          <AlertTitle>Staged config safety model</AlertTitle>
          <AlertDescription>
            Toggles are staged first. Apply writes targeted entries to the local Codex config, creates a backup,
            and then asks you to restart Codex before trusting the new session state.
          </AlertDescription>
        </Alert>

        {applyState.restartRequired ? (
          <Alert>
            <RefreshCwIcon />
            <AlertTitle>Restart Codex to finish loading applied changes</AlertTitle>
            <AlertDescription className="flex flex-col gap-3">
              <span>
                The config file was updated{applyState.lastAppliedAt ? ` at ${formatDateTime(applyState.lastAppliedAt)}` : ""}.
                This running Codex session may still show the old active skill list until it restarts.
              </span>
              {applyState.backupPath ? (
                <code className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
                  Backup: {applyState.backupPath}
                </code>
              ) : null}
              <div>
                <Button variant="outline" size="sm" onClick={dismissRestartWarning}>
                  <CheckCircle2Icon data-icon="inline-start" />
                  I restarted Codex
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        ) : null}

        {notice ? (
          <Alert>
            <InfoIcon />
            <AlertTitle>Action result</AlertTitle>
            <AlertDescription>{notice}</AlertDescription>
          </Alert>
        ) : null}

        <SummaryGrid summary={inventory.summary} />

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <Card>
            <CardHeader>
              <CardTitle>Capability bundles</CardTitle>
              <CardDescription>
                Manage by ownership first: plugin bundles, standalone skills, and MCP servers.
              </CardDescription>
              <CardAction>
                <Badge variant="secondary">{inventory.summary.active} active skills</Badge>
              </CardAction>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
                <SearchBar query={query} onQueryChange={setQuery} />
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setAllPluginsCollapsed(false)}>
                    <ChevronDownIcon data-icon="inline-start" />
                    Expand all
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setAllPluginsCollapsed(true)}>
                    <ChevronRightIcon data-icon="inline-start" />
                    Collapse all
                  </Button>
                </div>
              </div>

              <Tabs value={tab} onValueChange={(value) => setTab(value as MainTab)}>
                <TabsList>
                  {mainTabs.map((item) => (
                    <TabsTrigger key={item.value} value={item.value}>
                      {item.label}
                    </TabsTrigger>
                  ))}
                </TabsList>

                <TabsContent value="plugins">
                  <PluginBundleList
                    plugins={filteredPlugins}
                    collapsedPlugins={collapsedPlugins}
                    getPluginEnabled={getPluginEnabled}
                    getSkillEnabled={getSkillEnabled}
                    onPluginCollapse={togglePluginCollapse}
                    onStageChange={stageChange}
                    onDetails={showDetails}
                    onOpenExternal={openExternal}
                    onOpenConfigGate={openConfigGate}
                  />
                </TabsContent>

                <TabsContent value="standalone">
                  <SkillTable
                    skills={filteredStandaloneSkills}
                    emptyTitle="No standalone skills match this view"
                    getSkillEnabled={getSkillEnabled}
                    onStageChange={stageChange}
                    onDetails={showDetails}
                    onOpenExternal={openExternal}
                    onOpenConfigGate={openConfigGate}
                  />
                </TabsContent>

                <TabsContent value="mcp">
                  <McpTable
                    servers={filteredMcpServers}
                    getMcpEnabled={getMcpEnabled}
                    onStageChange={stageChange}
                    onDetails={showDetails}
                    onOpenExternal={openExternal}
                    onOpenConfigGate={openConfigGate}
                  />
                </TabsContent>

                <TabsContent value="raw">
                  <SkillTable
                    skills={filteredRawSkills}
                    emptyTitle="No skills match this raw inventory view"
                    getSkillEnabled={getSkillEnabled}
                    onStageChange={stageChange}
                    onDetails={showDetails}
                    onOpenExternal={openExternal}
                    onOpenConfigGate={openConfigGate}
                    showParent
                  />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          <Sidebar
            summary={inventory.summary}
            stagedChanges={stagedList}
            lastApplyResult={lastApplyResult}
            onApply={() => setApplyOpen(true)}
            onDiscard={() => {
              setStagedChanges({})
              setNotice("Discarded staged changes.")
            }}
            onRemoveChange={(id) =>
              setStagedChanges((current) => {
                const next = { ...current }
                delete next[id]
                return next
              })
            }
          />
        </div>
      </section>

      <DetailsDialog
        detail={detail}
        open={detailOpen}
        loading={detailLoading}
        onOpenChange={setDetailOpen}
      />
      <ApplyChangesDialog
        open={applyOpen}
        applying={applying}
        changes={stagedList}
        onApply={applyChanges}
        onOpenChange={setApplyOpen}
      />
      </main>
    </TooltipProvider>
  )
}

function PageHeader() {
  return (
    <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
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
          Local Codex control center
        </div>
        <h1 className="font-heading text-3xl font-medium leading-tight tracking-normal sm:text-4xl">
          Skills management
        </h1>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
          Inspect and stage local Codex plugin, skill, and MCP enablement changes from one dashboard.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled>
          <ArchiveIcon data-icon="inline-start" />
          Export inventory
        </Button>
        <Button disabled>
          <PackagePlusIcon data-icon="inline-start" />
          Install skill
        </Button>
      </div>
    </header>
  )
}

function SummaryGrid({ summary }: { summary: SkillSummary }) {
  const activePercent = summary.total ? Math.round((summary.active / summary.total) * 100) : 0

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
      <SummaryCard title="Plugins" value={`${summary.activePluginCount}/${summary.pluginCount}`} description="Enabled plugin bundles" />
      <SummaryCard title="Standalone" value={summary.standaloneSkillCount.toString()} description="Local direct skills" />
      <SummaryCard title="MCP servers" value={`${summary.activeMcpServerCount}/${summary.mcpServerCount}`} description="Active / installed servers" />
      <SummaryCard title="Installed skills" value={summary.total.toString()} description="Enabled and disabled skills" />
      <SummaryCard title="Active skills" value={summary.active.toString()} description={`${activePercent}% enabled effectively`} />
    </div>
  )
}

function SummaryCard({
  title,
  value,
  description,
}: {
  title: string
  value: string
  description: string
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="font-heading text-3xl font-medium tabular-nums">{value}</div>
      </CardContent>
    </Card>
  )
}

function SearchBar({
  query,
  onQueryChange,
}: {
  query: string
  onQueryChange: (query: string) => void
}) {
  return (
    <label className="relative flex min-w-0 flex-1 items-center">
      <SearchIcon data-icon="inline-start" className="pointer-events-none absolute left-2 text-muted-foreground" />
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

function PluginBundleList({
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
                  <StatusBadge active={pluginEnabled} label={pluginEnabled ? "Plugin active" : "Plugin disabled"} />
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
                  <Metric label="Skills" value={plugin.skills.length.toString()} />
                  <Metric label="MCP" value={plugin.mcpServerCount.toString()} />
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

function SkillTable({
  skills,
  emptyTitle,
  getSkillEnabled,
  onStageChange,
  onDetails,
  onOpenExternal,
  onOpenConfigGate,
  showParent = false,
  compact = false,
  parentPluginEnabled = true,
}: {
  skills: ManagedSkill[]
  emptyTitle: string
  getSkillEnabled: (skill: ManagedSkill) => boolean
  onStageChange: (change: ConfigChange, currentEnabled: boolean) => void
  onDetails: (detailId: string) => void
  onOpenExternal: (detailId: string) => void
  onOpenConfigGate: (gate: ControlGate) => void
  showParent?: boolean
  compact?: boolean
  parentPluginEnabled?: boolean
}) {
  if (!skills.length) {
    return <EmptyState title={emptyTitle} />
  }

  return (
    <div className={compact ? "overflow-hidden rounded-lg border" : "max-h-[44rem] overflow-y-auto rounded-lg border"}>
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-card">
          <TableRow>
            <TableHead>Skill</TableHead>
            {showParent ? <TableHead>Parent</TableHead> : null}
            <TableHead>Status</TableHead>
            <TableHead>Path</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {skills.map((skill) => (
            <TableRow key={skill.id}>
              <TableCell className="min-w-64 whitespace-normal">
                <div className="flex flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{skill.name}</span>
                    <OriginBadge origin={skill.origin} />
                  </div>
                  <span className="line-clamp-2 text-muted-foreground">{skill.description}</span>
                </div>
              </TableCell>
              {showParent ? (
                <TableCell>
                  <Badge variant="outline">{skill.parentPluginKey ?? "Standalone"}</Badge>
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
              <TableCell className="max-w-72 truncate font-mono text-xs text-muted-foreground">
                <div className="flex flex-col gap-1">
                  <span className="truncate">{skill.relativePath}</span>
                  <span className="truncate font-sans text-[0.7rem]">{getSkillStatusReason(skill, parentPluginEnabled)}</span>
                  <span className="truncate font-sans text-[0.7rem]">{formatControlGateLabel(skill.controlGate)}</span>
                </div>
              </TableCell>
              <TableCell>
                <ActionButtons
                  detailId={skill.detailId}
                  deleteLabel={`Delete ${skill.name}`}
                  onDetails={onDetails}
                  onOpenExternal={onOpenExternal}
                  controlGate={skill.controlGate}
                  onOpenConfigGate={onOpenConfigGate}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function EffectiveStatusControl({
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
      <Badge variant={active ? "secondary" : blockedByPlugin ? "destructive" : "outline"}>
        {blockedByPlugin ? "Plugin disabled" : active ? "Active" : "Skill disabled"}
      </Badge>
    </div>
  )
}

function McpTable({
  servers,
  getMcpEnabled,
  onStageChange,
  onDetails,
  onOpenExternal,
  onOpenConfigGate,
}: {
  servers: ManagedMcpServer[]
  getMcpEnabled: (server: ManagedMcpServer) => boolean
  onStageChange: (change: ConfigChange, currentEnabled: boolean) => void
  onDetails: (detailId: string) => void
  onOpenExternal: (detailId: string) => void
  onOpenConfigGate: (gate: ControlGate) => void
}) {
  if (!servers.length) {
    return <EmptyState title="No MCP servers match this view" />
  }

  return (
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
          {servers.map((server) => {
            const enabled = getMcpEnabled(server)

            return (
              <TableRow key={`${server.source}-${server.name}-${server.parentPluginKey ?? "config"}`}>
                <TableCell>
                  <div className="flex flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{server.name}</span>
                      <OriginBadge origin={server.origin} />
                    </div>
                    <span className="text-xs text-muted-foreground">{server.parentPluginKey ?? "Codex config"}</span>
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
                    <StatusBadge active={enabled} label={enabled ? "Active" : "Disabled"} />
                  </div>
                </TableCell>
                <TableCell className="max-w-80 truncate font-mono text-xs text-muted-foreground">
                  <div className="flex flex-col gap-1">
                    <span className="truncate">{server.endpoint}</span>
                    <span className="truncate font-sans text-[0.7rem]">
                      {server.editable ? server.statusReason : "Controlled by parent plugin"}
                    </span>
                    <span className="truncate font-sans text-[0.7rem]">{formatControlGateLabel(server.controlGate)}</span>
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
  )
}

function ActionButtons({
  detailId,
  deleteLabel,
  onDetails,
  onOpenExternal,
  controlGate,
  onOpenConfigGate,
  canOpen = true,
}: {
  detailId: string
  deleteLabel: string
  onDetails: (detailId: string) => void
  onOpenExternal: (detailId: string) => void
  controlGate: ControlGate
  onOpenConfigGate: (gate: ControlGate) => void
  canOpen?: boolean
}) {
  return (
    <div className="flex gap-2">
      <TooltipIconButton label="View details">
        <Button variant="outline" size="icon-sm" aria-label="View details" onClick={() => onDetails(detailId)}>
          <EyeIcon />
        </Button>
      </TooltipIconButton>
      <TooltipIconButton label={canOpen ? "Open source file or folder" : "No source path is available"}>
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
      <TooltipIconButton label={controlGate.detailId ? `Open config gate: ${controlGate.reason}` : controlGate.reason}>
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
      <TooltipIconButton label="Delete is not available yet">
        <Button variant="destructive" size="icon-sm" aria-label={deleteLabel} disabled>
          <Trash2Icon />
        </Button>
      </TooltipIconButton>
    </div>
  )
}

function TooltipIconButton({
  label,
  children,
}: {
  label: string
  children: ReactElement
}) {
  return (
    <Tooltip>
      <TooltipTrigger render={<span className="inline-flex" />}>{children}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

function Sidebar({
  summary,
  stagedChanges,
  lastApplyResult,
  onApply,
  onDiscard,
  onRemoveChange,
}: {
  summary: SkillSummary
  stagedChanges: ConfigChange[]
  lastApplyResult: ApplyResult | null
  onApply: () => void
  onDiscard: () => void
  onRemoveChange: (id: string) => void
}) {
  return (
    <aside className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Pending changes</CardTitle>
          <CardDescription>Nothing writes to config until you apply it.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {stagedChanges.length ? (
            <>
              <ScrollArea className="max-h-72">
                <div className="flex flex-col gap-2 pr-2">
                  {stagedChanges.map((change) => (
                    <div key={change.id} className="flex items-start justify-between gap-3 rounded-lg border bg-muted/30 p-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline">{change.kind}</Badge>
                          <StatusBadge active={change.enabled} label={change.enabled ? "Enable" : "Disable"} />
                        </div>
                        <div className="mt-1 truncate text-sm font-medium">{change.label}</div>
                        <div className="truncate font-mono text-xs text-muted-foreground">{change.target}</div>
                      </div>
                      <Button variant="ghost" size="icon-sm" aria-label={`Remove ${change.label}`} onClick={() => onRemoveChange(change.id)}>
                        <XIcon />
                      </Button>
                    </div>
                  ))}
                </div>
              </ScrollArea>
              <div className="flex gap-2">
                <Button className="flex-1" onClick={onApply}>
                  <SaveIcon data-icon="inline-start" />
                  Apply
                </Button>
                <Button variant="outline" onClick={onDiscard}>
                  <RotateCcwIcon data-icon="inline-start" />
                  Discard
                </Button>
              </div>
            </>
          ) : (
            <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
              Use the plugin, skill, or MCP toggles to stage changes here.
            </div>
          )}
          {lastApplyResult ? (
            <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
              Last backup: <span className="font-mono">{lastApplyResult.backupPath}</span>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Source coverage</CardTitle>
          <CardDescription>Where the current skill set comes from.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {Object.entries(summary.sourceCounts).map(([label, count]) => (
            <div key={label} className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="font-medium">{label}</span>
                <span className="text-muted-foreground">{count}</span>
              </div>
              <Progress value={summary.total ? (count / summary.total) * 100 : 0} />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Scanned folders</CardTitle>
          <CardDescription>Read-only roots used for this inventory.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {summary.scannedRoots.map((root) => (
            <code key={root} className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
              {root}
            </code>
          ))}
          <Separator />
          <div className="text-sm text-muted-foreground">
            Last changed skill file: <span className="font-medium text-foreground">{summary.newestModifiedAt}</span>
          </div>
        </CardContent>
      </Card>
    </aside>
  )
}

function DetailsDialog({
  detail,
  open,
  loading,
  onOpenChange,
}: {
  detail: SkillDetail | null
  open: boolean
  loading: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{loading ? "Loading details" : detail?.title ?? "Details unavailable"}</DialogTitle>
          <DialogDescription>{detail?.description ?? "Inspect metadata and local source content."}</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
            Loading local metadata...
          </div>
        ) : detail ? (
          <div className="flex flex-col gap-4">
            <div className="grid gap-2 sm:grid-cols-2">
              <Metric label="Status" value={detail.status} />
              <Metric label="Origin" value={`${detail.origin.label} (${detail.origin.confidence})`} />
              <Metric label="Control gate" value={formatControlGateLabel(detail.controlGate)} />
              <Metric label="Reason" value={detail.statusReason} />
              <Metric label="Path" value={detail.relativePath ?? "Not available"} />
              {detail.metadata.map((item) => (
                <Metric key={`${item.label}-${item.value}`} label={item.label} value={item.value} />
              ))}
            </div>
            <Separator />
            <ScrollArea className="h-80 rounded-lg border bg-muted/30 p-3">
              <pre className="whitespace-pre-wrap font-mono text-xs leading-5 text-muted-foreground">
                {detail.contentPreview ?? "No local preview is available."}
              </pre>
            </ScrollArea>
          </div>
        ) : (
          <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
            No detail record could be loaded for this item.
          </div>
        )}

        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
  )
}

function ApplyChangesDialog({
  open,
  applying,
  changes,
  onApply,
  onOpenChange,
}: {
  open: boolean
  applying: boolean
  changes: ConfigChange[]
  onApply: () => void
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Apply staged config changes?</DialogTitle>
          <DialogDescription>
            This writes to your local Codex config and creates a timestamped backup before the write.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-3">
          {changes.map((change) => (
            <div key={change.id} className="flex items-center justify-between gap-3 text-sm">
              <span className="truncate">{change.label}</span>
              <StatusBadge active={change.enabled} label={change.enabled ? "Enable" : "Disable"} />
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" disabled={applying} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={applying || !changes.length} onClick={onApply}>
            <SaveIcon data-icon="inline-start" />
            {applying ? "Applying" : "Apply changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border bg-muted/30 px-3 py-2">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="truncate text-sm">{value}</div>
    </div>
  )
}

function StatusBadge({ active, label }: { active: boolean; label: string }) {
  return (
    <Badge variant={active ? "secondary" : "outline"}>
      {active ? <CheckCircle2Icon data-icon="inline-start" /> : <PauseCircleIcon data-icon="inline-start" />}
      {label}
    </Badge>
  )
}

function OriginBadge({ origin }: { origin: CapabilityOrigin }) {
  return (
    <Tooltip>
      <TooltipTrigger render={<span className="inline-flex" />}>
        <Badge variant="outline" className={getOriginBadgeClassName(origin.label)}>
          {origin.label}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        {origin.detail} Confidence: {origin.confidence}.
      </TooltipContent>
    </Tooltip>
  )
}

function getOriginBadgeClassName(label: string) {
  const baseClassName = "border bg-opacity-100"

  switch (label) {
    case "Codex system":
      return cn(baseClassName, "border-sky-500/35 bg-sky-500/10 text-sky-700 dark:text-sky-300")
    case "Codex local":
      return cn(baseClassName, "border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300")
    case "Agent shared":
      return cn(baseClassName, "border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-300")
    case "Plugin cache":
      return cn(baseClassName, "border-indigo-500/35 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300")
    case "OpenAI plugin":
      return cn(baseClassName, "border-violet-500/35 bg-violet-500/10 text-violet-700 dark:text-violet-300")
    case "Third-party plugin":
      return cn(baseClassName, "border-fuchsia-500/35 bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300")
    case "Plugin":
      return cn(baseClassName, "border-cyan-500/35 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300")
    case "Codex config":
      return cn(baseClassName, "border-slate-500/35 bg-slate-500/10 text-slate-700 dark:text-slate-300")
    default:
      return cn(baseClassName, "border-border bg-muted text-muted-foreground")
  }
}

function EmptyState({ title }: { title: string }) {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center gap-2 rounded-lg border bg-muted/30 p-6 text-center">
      <FolderSearchIcon />
      <div className="font-medium">{title}</div>
      <p className="max-w-sm text-sm text-muted-foreground">
        Adjust the search term or switch tabs to inspect another capability group.
      </p>
    </div>
  )
}

function filterSkills(skills: ManagedSkill[], normalizedQuery: string) {
  return skills.filter((skill) => {
    const searchable = `${skill.name} ${skill.description} ${skill.origin.label} ${skill.controlGate.section ?? ""} ${skill.relativePath} ${skill.parentPluginKey ?? ""}`.toLowerCase()
    return !normalizedQuery || searchable.includes(normalizedQuery)
  })
}

function getPluginChangeId(plugin: ManagedPlugin) {
  return `plugin:${plugin.key}`
}

function getSkillChangeId(skill: ManagedSkill) {
  return `skill:${skill.path}`
}

function getMcpChangeId(server: ManagedMcpServer) {
  return `mcp:${server.name}`
}

function getBaseSkillEnabled(skill: ManagedSkill) {
  return skill.effectiveStatus !== "disabled-by-skill" && skill.effectiveStatus !== "installed-not-loaded"
}

function getSkillStatusReason(skill: ManagedSkill, parentPluginEnabled: boolean) {
  if (skill.parentPluginKey && !parentPluginEnabled) {
    return `Disabled by parent plugin ${skill.parentPluginKey}`
  }

  if (!skill.editable && skill.effectiveStatus === "installed-not-loaded") {
    return "Not editable from config because the skill is disabled by folder naming"
  }

  return skill.statusReason
}

function formatControlGateLabel(gate: ControlGate) {
  if (gate.relativePath) {
    return `${gate.label}: ${gate.relativePath}${gate.line ? `:${gate.line}` : ""}`
  }

  return `${gate.label}: ${gate.reason}`
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString()
}

function readCollapsedPlugins() {
  if (typeof window === "undefined") {
    return {}
  }

  const raw = window.localStorage.getItem(COLLAPSED_PLUGINS_KEY)
  if (!raw) {
    return {}
  }

  try {
    return JSON.parse(raw) as Record<string, boolean>
  } catch {
    return {}
  }
}
