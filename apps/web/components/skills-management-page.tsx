"use client"

import type { ReactElement } from "react"
import { useDeferredValue, useEffect, useMemo, useState } from "react"
import Image from "next/image"
import { useRouter } from "next/navigation"
import {
  ActivityIcon,
  CheckCircle2Icon,
  ChevronDownIcon,
  ChevronRightIcon,
  ClockIcon,
  ExternalLinkIcon,
  FileCogIcon,
  EyeIcon,
  FolderSearchIcon,
  InfoIcon,
  MoreHorizontalIcon,
  PackageIcon,
  PauseCircleIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  SaveIcon,
  SearchIcon,
  ShieldAlertIcon,
  Trash2Icon,
} from "lucide-react"

import type { ConfigChange } from "@/lib/config-editor"
import type {
  SkillPulseSummaryResponse,
  SkillPulseSyncResult,
} from "@/lib/skillpulse"
import {
  getUsageFilterDescription,
  matchesUsageFilter,
  type UsageFilter,
} from "@/lib/usage-filter"
import type {
  CapabilityOrigin,
  ControlGate,
  ManagedMcpServer,
  ManagedPlugin,
  ManagedSkill,
  SkillDetail,
  SkillSummary,
} from "@/lib/skills"
import { getCompactPathLabel } from "@/lib/path-display"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs"
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

type MainTab = "manage" | "all-skills" | "usage"
type ManageFilter = "plugins" | "skills" | "mcp"

type ApplyState = {
  lastAppliedAt?: string
  backupPath?: string
  restartRequired?: boolean
  restartDismissedAt?: string
}

const mainTabs = [
  { value: "manage", label: "Manage" },
  { value: "all-skills", label: "All skills" },
  { value: "usage", label: "Usage & cleanup" },
] satisfies Array<{ value: MainTab; label: string }>

const COLLAPSED_PLUGINS_KEY = "skills-mgmnt-collapsed-plugins"
const ACTIVE_TAB_KEY = "skills-mgmnt-active-tab"

export function SkillsManagementPage({
  inventory,
}: {
  inventory: CapabilityInventory
}) {
  const router = useRouter()
  const [query, setQuery] = useState("")
  const [tab, setTab] = useState<MainTab>("manage")
  const [manageFilter, setManageFilter] = useState<ManageFilter>("plugins")
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [detail, setDetail] = useState<SkillDetail | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [notice, setNotice] = useState("")
  const [stagedChanges, setStagedChanges] = useState<
    Record<string, ConfigChange>
  >({})
  const [collapsedPlugins, setCollapsedPlugins] = useState<
    Record<string, boolean>
  >(() =>
    Object.fromEntries(inventory.plugins.map((plugin) => [plugin.key, true]))
  )
  const [applyState, setApplyState] = useState<ApplyState>({})
  const [applyOpen, setApplyOpen] = useState(false)
  const [applying, setApplying] = useState(false)
  const [skillPulseSummary, setSkillPulseSummary] =
    useState<SkillPulseSummaryResponse | null>(null)
  const [skillPulseLoading, setSkillPulseLoading] = useState(false)
  const [skillPulseSyncing, setSkillPulseSyncing] = useState<
    "incremental" | "backfill-all" | null
  >(null)
  const [collectorAction, setCollectorAction] = useState<
    "start" | "stop" | null
  >(null)
  const [lastSkillPulseSync, setLastSkillPulseSync] =
    useState<SkillPulseSyncResult | null>(null)

  const deferredQuery = useDeferredValue(query)
  const normalizedQuery = deferredQuery.trim().toLowerCase()
  const stagedList = useMemo(
    () => Object.values(stagedChanges),
    [stagedChanges]
  )

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const savedCollapsedPlugins = readCollapsedPlugins()
      if (Object.keys(savedCollapsedPlugins).length) {
        setCollapsedPlugins(
          Object.fromEntries(
            inventory.plugins.map((plugin) => [
              plugin.key,
              savedCollapsedPlugins[plugin.key] ?? true,
            ])
          )
        )
      }
      setTab(readActiveTab())
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [inventory.plugins])

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

  useEffect(() => {
    void loadSkillPulseSummary()
  }, [])

  const filteredPlugins = useMemo(
    () =>
      inventory.plugins.filter((plugin) => {
        const searchable =
          `${plugin.displayName} ${plugin.description} ${plugin.key} ${plugin.marketplace} ${plugin.origin.label} ${plugin.controlGate.section ?? ""} ${plugin.skills
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
        const searchable =
          `${server.name} ${server.source} ${server.origin.label} ${server.endpoint} ${server.parentPluginKey ?? ""}`.toLowerCase()
        return !normalizedQuery || searchable.includes(normalizedQuery)
      }),
    [inventory.mcpServers, normalizedQuery]
  )
  const skillByUsagePath = useMemo(
    () =>
      new Map(
        inventory.skills.map((skill) => [
          getSkillPulsePathKey(skill.path),
          skill,
        ])
      ),
    [inventory.skills]
  )

  function saveCollapsedState(nextState: Record<string, boolean>) {
    setCollapsedPlugins(nextState)
    window.localStorage.setItem(
      COLLAPSED_PLUGINS_KEY,
      JSON.stringify(nextState)
    )
  }

  function togglePluginCollapse(pluginKey: string) {
    saveCollapsedState({
      ...collapsedPlugins,
      [pluginKey]: !collapsedPlugins[pluginKey],
    })
  }

  function setAllPluginsCollapsed(collapsed: boolean) {
    saveCollapsedState(
      Object.fromEntries(
        inventory.plugins.map((plugin) => [plugin.key, collapsed])
      )
    )
  }

  function showAdvancedDiagnostics() {
    setAdvancedOpen(true)
    window.setTimeout(() => {
      document
        .getElementById("advanced-diagnostics")
        ?.scrollIntoView({ block: "start" })
    }, 0)
  }

  function selectTab(value: string) {
    if (!isMainTab(value)) {
      return
    }

    setTab(value)
    saveActiveTab(value)
  }

  function stageChange(change: ConfigChange, currentEnabled: boolean) {
    setNotice("")
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
    return (
      stagedChanges[getSkillChangeId(skill)]?.enabled ??
      getBaseSkillEnabled(skill)
    )
  }

  function getMcpEnabled(server: ManagedMcpServer) {
    return stagedChanges[getMcpChangeId(server)]?.enabled ?? server.enabled
  }

  async function showDetails(detailId: string) {
    setDetailLoading(true)
    setDetailOpen(true)
    setNotice("")

    const response = await fetch(
      `/api/skill-details?id=${encodeURIComponent(detailId)}`
    )
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
        : (payload.error ?? "Could not open external target.")
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

    setApplyState({
      lastAppliedAt: payload.appliedAt,
      backupPath: payload.backupPath,
      restartRequired: true,
    })
    setStagedChanges({})
    setApplyOpen(false)
    setNotice(
      `Applied ${payload.preview.length} config change${payload.preview.length === 1 ? "" : "s"}. Restart Codex for the session to load them.`
    )
    router.refresh()
  }

  async function dismissRestartWarning() {
    const response = await fetch("/api/config/dismiss-restart", {
      method: "POST",
    })
    if (response.ok) {
      setApplyState((await response.json()) as ApplyState)
    }
  }

  async function loadSkillPulseSummary() {
    setSkillPulseLoading(true)
    const response = await fetch("/api/skillpulse/summary")
    setSkillPulseLoading(false)

    if (!response.ok) {
      return
    }

    setSkillPulseSummary((await response.json()) as SkillPulseSummaryResponse)
  }

  async function syncSkillPulse(mode: "incremental" | "backfill-all") {
    setSkillPulseSyncing(mode)
    setNotice("")

    const response = await fetch("/api/skillpulse/sync", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode }),
    })
    const payload = await response.json()
    setSkillPulseSyncing(null)

    if (!response.ok) {
      setNotice(payload.error ?? "Could not sync SkillPulse usage.")
      return
    }

    setLastSkillPulseSync(payload as SkillPulseSyncResult)
    setNotice(
      `SkillPulse synced ${payload.newEventCount} new skill-load event${payload.newEventCount === 1 ? "" : "s"}.`
    )
    await loadSkillPulseSummary()
  }

  async function setSkillPulseCollector(action: "start" | "stop") {
    setCollectorAction(action)
    setNotice("")

    const response = await fetch(`/api/skillpulse/collector/${action}`, {
      method: "POST",
    })
    const payload = await response.json()
    setCollectorAction(null)

    if (!response.ok) {
      setNotice(payload.error ?? `Could not ${action} SkillPulse collector.`)
      return
    }

    setNotice(
      action === "start"
        ? "SkillPulse collector started."
        : "SkillPulse collector stopped."
    )
    await loadSkillPulseSummary()
  }

  return (
    <TooltipProvider>
      <main
        className={cn(
          "min-h-svh bg-background text-foreground",
          stagedList.length && "pb-24"
        )}
      >
        <section className="mx-auto flex w-full max-w-[96rem] flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
          <PageHeader />

          {applyState.restartRequired ? (
            <Alert>
              <RefreshCwIcon />
              <AlertTitle>Restart Codex to load your changes</AlertTitle>
              <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-pretty">
                  Changes were applied
                  {applyState.lastAppliedAt
                    ? ` at ${formatDateTime(applyState.lastAppliedAt)}`
                    : ""}
                  . The current session may still use the previous capability
                  list.
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={dismissRestartWarning}
                >
                  <CheckCircle2Icon data-icon="inline-start" />I restarted Codex
                </Button>
              </AlertDescription>
            </Alert>
          ) : null}

          {notice ? (
            <Alert>
              <InfoIcon />
              <AlertTitle>Update</AlertTitle>
              <AlertDescription>{notice}</AlertDescription>
            </Alert>
          ) : null}

          <CompactSummary
            summary={inventory.summary}
            unusedCount={skillPulseSummary?.totals.disableCandidateCount}
          />

          <Tabs value={tab} onValueChange={selectTab} className="min-w-0">
            <TabsList aria-label="Skills management views" className="mb-4">
              {mainTabs.map((item) => (
                <TabsTrigger key={item.value} value={item.value}>
                  {item.label}
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value="manage">
              {tab === "manage" ? (
                <Card className="min-w-0">
                  <CardHeader>
                    <div>
                      <CardTitle className="text-balance">
                        Manage capabilities
                      </CardTitle>
                      <CardDescription className="text-pretty">
                        Find and control skills, plugin bundles, and MCP servers
                        from one place.
                      </CardDescription>
                    </div>
                    <CardAction>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={<Button variant="outline" size="sm" />}
                        >
                          <MoreHorizontalIcon data-icon="inline-start" />
                          Advanced
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                          <DropdownMenuGroup>
                            <DropdownMenuLabel>
                              Plugin display
                            </DropdownMenuLabel>
                            <DropdownMenuItem
                              onClick={() => setAllPluginsCollapsed(false)}
                            >
                              <ChevronDownIcon /> Expand plugin bundles
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => setAllPluginsCollapsed(true)}
                            >
                              <ChevronRightIcon /> Collapse plugin bundles
                            </DropdownMenuItem>
                          </DropdownMenuGroup>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={showAdvancedDiagnostics}>
                            <FolderSearchIcon /> Show diagnostics
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </CardAction>
                  </CardHeader>
                  <CardContent className="flex min-w-0 flex-col gap-5">
                    <div className="flex flex-col gap-4 rounded-lg border bg-muted/20 p-3 sm:p-4">
                      <SegmentedFilter
                        label="Capability type"
                        value={manageFilter}
                        options={[
                          {
                            value: "plugins",
                            label: `Plugins (${inventory.summary.pluginCount})`,
                          },
                          {
                            value: "skills",
                            label: `Standalone skills (${inventory.standaloneSkills.length})`,
                          },
                          {
                            value: "mcp",
                            label: `MCP servers (${inventory.summary.mcpServerCount})`,
                          },
                        ]}
                        onChange={setManageFilter}
                      />
                      <SearchBar query={query} onQueryChange={setQuery} />
                    </div>

                    {manageFilter === "plugins" ? (
                      <CapabilitySection
                        title="Plugin bundles"
                        count={filteredPlugins.length}
                      >
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
                      </CapabilitySection>
                    ) : null}

                    {manageFilter === "skills" ? (
                      <CapabilitySection
                        title="Standalone skills"
                        count={filteredStandaloneSkills.length}
                      >
                        <SkillTable
                          skills={filteredStandaloneSkills}
                          emptyTitle="No standalone skills match your search"
                          getSkillEnabled={getSkillEnabled}
                          onStageChange={stageChange}
                          onDetails={showDetails}
                          onOpenExternal={openExternal}
                          onOpenConfigGate={openConfigGate}
                        />
                      </CapabilitySection>
                    ) : null}

                    {manageFilter === "mcp" ? (
                      <CapabilitySection
                        title="MCP servers"
                        count={filteredMcpServers.length}
                      >
                        <McpTable
                          servers={filteredMcpServers}
                          getMcpEnabled={getMcpEnabled}
                          onStageChange={stageChange}
                          onDetails={showDetails}
                          onOpenExternal={openExternal}
                          onOpenConfigGate={openConfigGate}
                        />
                      </CapabilitySection>
                    ) : null}

                    <AdvancedDiagnostics
                      open={advancedOpen}
                      onOpenChange={setAdvancedOpen}
                      summary={inventory.summary}
                    />
                  </CardContent>
                </Card>
              ) : null}
            </TabsContent>

            <TabsContent value="all-skills">
              {tab === "all-skills" ? (
                <Card className="min-w-0">
                  <CardHeader>
                    <div>
                      <CardTitle className="text-balance">
                        All discovered skills
                      </CardTitle>
                      <CardDescription className="text-pretty">
                        Every standalone and plugin-owned skill found on this
                        computer.
                      </CardDescription>
                    </div>
                    <CardAction>
                      <Badge variant="secondary" className="tabular-nums">
                        {inventory.summary.total} skills
                      </Badge>
                    </CardAction>
                  </CardHeader>
                  <CardContent className="flex min-w-0 flex-col gap-4">
                    <SearchBar query={query} onQueryChange={setQuery} />
                    <SkillTable
                      key={`all-skills-${normalizedQuery}`}
                      skills={filteredRawSkills}
                      emptyTitle="No skills match your search"
                      getSkillEnabled={getSkillEnabled}
                      onStageChange={stageChange}
                      onDetails={showDetails}
                      onOpenExternal={openExternal}
                      onOpenConfigGate={openConfigGate}
                      pageSize={50}
                      showParent
                    />
                  </CardContent>
                </Card>
              ) : null}
            </TabsContent>

            <TabsContent value="usage">
              {tab === "usage" ? (
                <SkillPulsePanel
                  summary={skillPulseSummary}
                  loading={skillPulseLoading}
                  syncing={skillPulseSyncing}
                  collectorAction={collectorAction}
                  lastSync={lastSkillPulseSync}
                  skillByUsagePath={skillByUsagePath}
                  getSkillEnabled={getSkillEnabled}
                  onSync={syncSkillPulse}
                  onCollectorAction={setSkillPulseCollector}
                  onStageChange={stageChange}
                />
              ) : null}
            </TabsContent>
          </Tabs>
        </section>

        <PendingChangesBar
          changes={stagedList}
          onReview={() => setApplyOpen(true)}
          onDiscard={() => {
            setStagedChanges({})
            setNotice("Discarded pending changes.")
          }}
        />

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
    <header className="flex flex-col gap-3 border-b pb-5 sm:flex-row sm:items-end sm:justify-between">
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
        <h1 className="font-heading text-3xl leading-tight font-medium text-balance sm:text-4xl">
          Skills
        </h1>
        <p className="max-w-2xl text-sm leading-6 text-pretty text-muted-foreground">
          Decide what Codex can use and clean up capabilities you no longer
          need.
        </p>
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <ShieldAlertIcon className="size-4" />
        Changes are reviewed before they are applied
      </div>
    </header>
  )
}

function CompactSummary({
  summary,
  unusedCount,
}: {
  summary: SkillSummary
  unusedCount?: number
}) {
  const activePercent = summary.total
    ? Math.round((summary.active / summary.total) * 100)
    : 0

  return (
    <section
      aria-label="Capability overview"
      className="overflow-hidden rounded-lg border bg-card"
    >
      <div className="grid grid-cols-2 divide-x divide-y sm:grid-cols-6 sm:divide-y-0">
        <SummaryStat
          className="sm:col-span-2"
          label="Installed"
          value={summary.total}
        />
        <SummaryStat
          className="sm:col-span-2"
          label="Enabled"
          value={summary.active}
          detail={`${activePercent}% of installed`}
        />
        <SummaryStat
          label="Plugins"
          value={summary.activePluginCount}
          detail={`of ${summary.pluginCount}`}
        />
        <SummaryStat
          label="MCP servers"
          value={summary.activeMcpServerCount}
          detail={`of ${summary.mcpServerCount}`}
        />
      </div>
      {unusedCount !== undefined ? (
        <div className="flex items-center justify-between gap-4 border-t bg-muted/20 px-4 py-3 sm:px-5">
          <div>
            <div className="text-sm font-medium">Cleanup opportunity</div>
            <div className="text-xs text-muted-foreground">
              Skills not observed in the last 7 days
            </div>
          </div>
          <div className="font-mono text-2xl font-semibold tabular-nums">
            {unusedCount}
          </div>
        </div>
      ) : null}
    </section>
  )
}

function SummaryStat({
  label,
  value,
  detail,
  className,
}: {
  label: string
  value: string | number
  detail?: string
  className?: string
}) {
  return (
    <div className={cn("min-w-0 px-4 py-4 sm:px-5 sm:py-5", className)}>
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="font-mono text-2xl leading-none font-semibold tabular-nums sm:text-3xl">
          {value}
        </span>
        {detail ? (
          <span className="text-xs text-muted-foreground">{detail}</span>
        ) : null}
      </div>
    </div>
  )
}

function CapabilitySection({
  title,
  count,
  children,
}: {
  title: string
  count: number
  children: ReactElement
}) {
  return (
    <section
      className="flex min-w-0 flex-col gap-3"
      aria-labelledby={`section-${title.replaceAll(" ", "-").toLowerCase()}`}
    >
      <div className="flex items-center gap-2">
        <h2
          id={`section-${title.replaceAll(" ", "-").toLowerCase()}`}
          className="font-heading text-lg font-medium text-balance"
        >
          {title}
        </h2>
        <Badge variant="secondary" className="tabular-nums">
          {count}
        </Badge>
      </div>
      {children}
    </section>
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
  pageSize,
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
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {pageSize && pageCount > 1 ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground tabular-nums">
            Showing {currentPage * pageSize + 1}-
            {Math.min((currentPage + 1) * pageSize, skills.length)} of{" "}
            {skills.length}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage === 0}
              onClick={() => setPage((value) => Math.max(0, value - 1))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage === pageCount - 1}
              onClick={() =>
                setPage((value) => Math.min(pageCount - 1, value + 1))
              }
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}
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
              <TableRow
                key={`${server.source}-${server.name}-${server.parentPluginKey ?? "config"}`}
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
  )
}

function SkillPulsePanel({
  summary,
  loading,
  syncing,
  collectorAction,
  lastSync,
  skillByUsagePath,
  getSkillEnabled,
  onSync,
  onCollectorAction,
  onStageChange,
}: {
  summary: SkillPulseSummaryResponse | null
  loading: boolean
  syncing: "incremental" | "backfill-all" | null
  collectorAction: "start" | "stop" | null
  lastSync: SkillPulseSyncResult | null
  skillByUsagePath: Map<string, ManagedSkill>
  getSkillEnabled: (skill: ManagedSkill) => boolean
  onSync: (mode: "incremental" | "backfill-all") => void
  onCollectorAction: (action: "start" | "stop") => void
  onStageChange: (change: ConfigChange, currentEnabled: boolean) => void
}) {
  const collectorRunning = Boolean(summary?.status.collectorRunning)
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
            disabled={Boolean(syncing)}
            onClick={() => onSync("incremental")}
          >
            <RefreshCwIcon data-icon="inline-start" />
            {syncing === "incremental" ? "Updating usage" : "Update usage now"}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex min-w-0 flex-col gap-5">
        <div className="flex flex-col gap-4 rounded-lg border bg-muted/20 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <ActivityIcon className="mt-0.5 size-5 text-muted-foreground" />
            <div className="flex min-w-0 flex-col gap-1">
              <span className="font-medium">
                Track skill usage automatically
              </span>
              <p className="max-w-2xl text-sm text-pretty text-muted-foreground">
                Reads local Codex session logs every minute to record which
                skills were loaded. Nothing is uploaded.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge
              active={collectorRunning}
              label={collectorRunning ? "On" : "Off"}
            />
            <Switch
              checked={collectorRunning}
              disabled={collectorAction !== null}
              aria-label="Track skill usage automatically"
              onCheckedChange={(checked) =>
                onCollectorAction(checked ? "start" : "stop")
              }
            />
          </div>
        </div>

        {summary ? (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <Metric
                label="Usage history"
                value={`${summary.status.dataCoverageDays} days`}
              />
              <Metric
                label="Skills observed"
                value={summary.totals.loadedSkillCount.toString()}
              />
              <Metric
                label="Last updated"
                value={
                  summary.status.lastSyncAt
                    ? formatDateTime(summary.status.lastSyncAt)
                    : "Not yet updated"
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
                    Rescans every local session log. Existing events are
                    deduplicated; use this only when history looks incomplete.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={Boolean(syncing)}
                  onClick={() => onSync("backfill-all")}
                >
                  <ClockIcon data-icon="inline-start" />
                  {syncing === "backfill-all"
                    ? "Rebuilding history"
                    : "Rebuild history"}
                </Button>
              </div>
              {lastSync ? (
                <p className="mt-3 text-xs text-muted-foreground">
                  Last update scanned {lastSync.processedFileCount} session file
                  {lastSync.processedFileCount === 1 ? "" : "s"} and found{" "}
                  {lastSync.newEventCount} new event
                  {lastSync.newEventCount === 1 ? "" : "s"}.
                </p>
              ) : null}
            </details>
          </>
        ) : (
          <EmptyState
            title={
              loading ? "Loading usage history" : "No usage history available"
            }
            description="Update usage to scan local Codex session logs."
            actionLabel="Update usage now"
            onAction={() => onSync("incremental")}
          />
        )}
      </CardContent>
    </Card>
  )
}

function SegmentedFilter<TValue extends string>({
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
}: {
  skills: SkillPulseSummaryResponse["skills"]
  usageFilter: UsageFilter
  skillByUsagePath: Map<string, ManagedSkill>
  getSkillEnabled: (skill: ManagedSkill) => boolean
  selectedPaths: Set<string>
  onSelectedChange: (skillPath: string, selected: boolean) => void
  onStageChange: (change: ConfigChange, currentEnabled: boolean) => void
}) {
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
      <div className="max-h-[44rem] overflow-auto rounded-lg border">
        <table className="w-full min-w-[62rem] table-fixed caption-bottom text-sm xl:min-w-0">
          <thead className="[&_tr]:border-b">
            <tr className="border-b">
              <th className="sticky top-0 z-20 h-10 w-10 bg-card px-2 text-left align-middle font-medium text-foreground">
                <span className="sr-only">Select</span>
              </th>
              <th className="sticky top-0 z-20 h-10 w-[32%] bg-card px-2 text-left align-middle font-medium whitespace-nowrap text-foreground">
                Skill
              </th>
              <th className="sticky top-0 z-20 h-10 w-[14%] bg-card px-2 text-left align-middle font-medium whitespace-nowrap text-foreground">
                Status
              </th>
              <th className="sticky top-0 z-20 h-10 w-[9%] bg-card px-2 text-left align-middle font-medium whitespace-nowrap text-foreground">
                Uses 7d
              </th>
              <th className="sticky top-0 z-20 h-10 w-[9%] bg-card px-2 text-left align-middle font-medium whitespace-nowrap text-foreground">
                Uses 30d
              </th>
              <th className="sticky top-0 z-20 h-10 w-[20%] bg-card px-2 text-left align-middle font-medium whitespace-nowrap text-foreground">
                Last observed
              </th>
              <th className="sticky top-0 z-20 h-10 w-[20%] bg-card px-2 text-left align-middle font-medium whitespace-nowrap text-foreground">
                Action
              </th>
            </tr>
          </thead>
          <tbody className="[&_tr:last-child]:border-0">
            {skills.map((skill) => {
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
                  className="border-b transition-colors hover:bg-muted/50"
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
                  <td className="p-2 align-middle tabular-nums">
                    {skill.loads7d}
                  </td>
                  <td className="p-2 align-middle tabular-nums">
                    {skill.loads30d}
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
      <TooltipIconButton label="Delete is not available yet">
        <Button
          variant="destructive"
          size="icon-sm"
          aria-label={deleteLabel}
          disabled
        >
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
      <TooltipTrigger render={<span className="inline-flex" />}>
        {children}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

function AdvancedDiagnostics({
  open,
  onOpenChange,
  summary,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  summary: SkillSummary
}) {
  return (
    <details
      id="advanced-diagnostics"
      open={open}
      onToggle={(event) => onOpenChange(event.currentTarget.open)}
      className="rounded-lg border bg-muted/20"
    >
      <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
        Advanced diagnostics
      </summary>
      {open ? (
        <div className="flex flex-col gap-5 border-t p-4">
          <div className="grid gap-5 lg:grid-cols-2">
            <section className="flex flex-col gap-3">
              <div>
                <h3 className="font-medium">Source coverage</h3>
                <p className="text-sm text-pretty text-muted-foreground">
                  Where the current capability set was discovered.
                </p>
              </div>
              {Object.entries(summary.sourceCounts).map(([label, count]) => (
                <div key={label} className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span>{label}</span>
                    <span className="text-muted-foreground tabular-nums">
                      {count}
                    </span>
                  </div>
                  <Progress
                    value={summary.total ? (count / summary.total) * 100 : 0}
                  />
                </div>
              ))}
            </section>
            <section className="flex flex-col gap-3">
              <div>
                <h3 className="font-medium">Scanned folders</h3>
                <p className="text-sm text-pretty text-muted-foreground">
                  Read-only roots used to build this inventory.
                </p>
              </div>
              {summary.scannedRoots.map((root) => (
                <code
                  key={root}
                  className="block rounded-md bg-background px-2 py-1 text-xs break-all text-muted-foreground"
                >
                  {root}
                </code>
              ))}
              <p className="text-xs text-muted-foreground">
                Last changed skill file:{" "}
                <span className="font-medium text-foreground">
                  {summary.newestModifiedAt}
                </span>
              </p>
            </section>
          </div>
        </div>
      ) : null}
    </details>
  )
}

function PendingChangesBar({
  changes,
  onReview,
  onDiscard,
}: {
  changes: ConfigChange[]
  onReview: () => void
  onDiscard: () => void
}) {
  if (!changes.length) return null

  const enableCount = changes.filter((change) => change.enabled).length
  const disableCount = changes.length - enableCount

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-lg">
      <div className="mx-auto flex max-w-[96rem] flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="font-medium tabular-nums">
            {changes.length} pending change{changes.length === 1 ? "" : "s"}
          </div>
          <p className="text-sm text-muted-foreground">
            {enableCount} to enable, {disableCount} to disable. Nothing has been
            written yet.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onDiscard}>
            <RotateCcwIcon data-icon="inline-start" />
            Discard
          </Button>
          <Button onClick={onReview}>Review changes</Button>
        </div>
      </div>
    </div>
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
          <DialogTitle>
            {loading
              ? "Loading details"
              : (detail?.title ?? "Details unavailable")}
          </DialogTitle>
          <DialogDescription>
            {detail?.description ??
              "Inspect metadata and local source content."}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
            Loading local metadata...
          </div>
        ) : detail ? (
          <div className="flex flex-col gap-4">
            <div className="grid gap-2 sm:grid-cols-2">
              <Metric label="Status" value={detail.status} />
              <Metric
                label="Origin"
                value={`${detail.origin.label} (${detail.origin.confidence})`}
              />
              <Metric
                label="Control gate"
                value={formatControlGateLabel(detail.controlGate)}
              />
              <Metric label="Reason" value={detail.statusReason} />
              <Metric
                label="Path"
                value={detail.relativePath ?? "Not available"}
              />
              {detail.metadata.map((item) => (
                <Metric
                  key={`${item.label}-${item.value}`}
                  label={item.label}
                  value={item.value}
                />
              ))}
            </div>
            <Separator />
            <ScrollArea className="h-80 rounded-lg border bg-muted/30 p-3">
              <pre className="font-mono text-xs leading-5 whitespace-pre-wrap text-muted-foreground">
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
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-xl min-w-0 flex-col overflow-hidden">
        <DialogHeader className="min-w-0 shrink-0">
          <DialogTitle>Apply staged config changes?</DialogTitle>
          <DialogDescription>
            This writes to your local Codex config and creates a timestamped
            backup before the write.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 min-w-0 overflow-y-auto overscroll-contain rounded-lg border bg-muted/30 p-2">
          {changes.map((change) => (
            <div
              key={change.id}
              className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-3 border-b px-2 py-2.5 text-sm last:border-b-0"
            >
              <div className="min-w-0">
                <div className="font-medium [overflow-wrap:anywhere] break-words">
                  {change.label}
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground capitalize">
                  {change.kind}
                </div>
              </div>
              <StatusBadge
                active={change.enabled}
                label={change.enabled ? "Enable" : "Disable"}
              />
            </div>
          ))}
        </div>

        <DialogFooter className="shrink-0">
          <Button
            variant="outline"
            disabled={applying}
            onClick={() => onOpenChange(false)}
          >
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
      <div className="text-sm break-all" title={value}>
        {value}
      </div>
    </div>
  )
}

function StatusBadge({ active, label }: { active: boolean; label: string }) {
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

function OriginBadge({ origin }: { origin: CapabilityOrigin }) {
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

function getOriginBadgeClassName(label: string) {
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

function EmptyState({
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

function filterSkills(skills: ManagedSkill[], normalizedQuery: string) {
  return skills.filter((skill) => {
    const searchable =
      `${skill.name} ${skill.description} ${skill.origin.label} ${skill.controlGate.section ?? ""} ${skill.relativePath} ${skill.parentPluginKey ?? ""}`.toLowerCase()
    return !normalizedQuery || searchable.includes(normalizedQuery)
  })
}

function getSkillPulsePathKey(skillPath: string) {
  return skillPath.toLowerCase()
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
  return (
    skill.effectiveStatus !== "disabled-by-skill" &&
    skill.effectiveStatus !== "installed-not-loaded"
  )
}

function getSkillStatusReason(
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

function formatControlGateLabel(gate: ControlGate) {
  if (gate.relativePath) {
    return `${gate.label}: ${gate.relativePath}${gate.line ? `:${gate.line}` : ""}`
  }

  return `${gate.label}: ${gate.reason}`
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString()
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

function saveActiveTab(value: string) {
  if (!isMainTab(value)) {
    return
  }

  window.localStorage.setItem(ACTIVE_TAB_KEY, value)
}

function readActiveTab(): MainTab {
  if (typeof window === "undefined") {
    return "manage"
  }

  const value = window.localStorage.getItem(ACTIVE_TAB_KEY)
  return isMainTab(value) ? value : "manage"
}

function isMainTab(value: string | null): value is MainTab {
  return mainTabs.some((item) => item.value === value)
}
