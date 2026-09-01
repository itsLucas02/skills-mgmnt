"use client"

import { useDeferredValue, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
  CheckCircle2Icon,
  ChevronDownIcon,
  ChevronRightIcon,
  FolderSearchIcon,
  InfoIcon,
  MoreHorizontalIcon,
  RefreshCwIcon,
} from "lucide-react"

import type { ConfigChange } from "@/lib/config-editor"
import type {
  SkillPulseSummaryResponse,
  SkillPulseSyncResult,
} from "@/lib/skillpulse"
import type { TrashEntry as SkillTrashEntry } from "@/lib/skill-trash"
import type {
  ControlGate,
  ManagedMcpServer,
  ManagedPlugin,
  ManagedSkill,
  SkillDetail,
  SkillSummary,
} from "@/lib/skills"
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs"
import { TooltipProvider } from "@workspace/ui/components/tooltip"
import { cn } from "@workspace/ui/lib/utils"

import { AdvancedDiagnostics } from "./skills/advanced-diagnostics"
import { ApplyChangesDialog } from "./skills/apply-changes-dialog"
import { CapabilitySection } from "./skills/capability-section"
import { CompactSummary } from "./skills/compact-summary"
import { DetailsDialog } from "./skills/details-dialog"
import { McpTable } from "./skills/mcp-table"
import { PageHeader } from "./skills/page-header"
import { PendingChangesBar } from "./skills/pending-changes-bar"
import { PluginBundleList } from "./skills/plugin-bundle-list"
import { SearchBar } from "./skills/search-bar"
import { SegmentedFilter, SkillPulsePanel } from "./skills/skillpulse-panel"
import { SkillTable } from "./skills/skill-table"
import { TrashPanel } from "./skills/trash-panel"
import {
  filterSkills,
  formatDateTime,
  getBaseSkillEnabled,
  getMcpChangeId,
  getPluginChangeId,
  getSkillChangeId,
  getSkillPulsePathKey,
} from "./skills/shared"

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
  const [trashEntries, setTrashEntries] = useState<SkillTrashEntry[]>([])

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
      try {
        const response = await fetch("/api/config/apply-state")
        if (!response.ok) {
          return
        }

        setApplyState((await response.json()) as ApplyState)
      } catch {
        // Apply state stays empty when the request fails; the restart banner
        // simply does not appear.
      }
    }

    void loadApplyState()
  }, [])

  useEffect(() => {
    void loadSkillPulseSummary()
  }, [])

  useEffect(() => {
    void loadSkillTrash()
  }, [])

  const pluginSearchIndex = useMemo(
    () =>
      new Map(
        inventory.plugins.map((plugin) => [
          plugin.key,
          `${plugin.displayName} ${plugin.description} ${plugin.key} ${plugin.marketplace} ${plugin.origin.label} ${plugin.controlGate.section ?? ""} ${plugin.skills
            .map((skill) => `${skill.name} ${skill.description}`)
            .join(" ")}`.toLowerCase(),
        ])
      ),
    [inventory.plugins]
  )
  const skillSearchIndex = useMemo(
    () =>
      new Map(
        inventory.skills.map((skill) => [
          skill.path,
          `${skill.name} ${skill.description} ${skill.parentPluginName ?? ""} ${skill.origin.label} ${skill.controlGate.section ?? ""} ${skill.relativePath} ${skill.parentPluginKey ?? ""}`.toLowerCase(),
        ])
      ),
    [inventory.skills]
  )
  const mcpSearchIndex = useMemo(
    () =>
      new Map(
        inventory.mcpServers.map((server) => [
          server.detailId,
          `${server.name} ${server.source} ${server.origin.label} ${server.endpoint} ${server.parentPluginKey ?? ""}`.toLowerCase(),
        ])
      ),
    [inventory.mcpServers]
  )

  const filteredPlugins = useMemo(
    () =>
      inventory.plugins.filter((plugin) => {
        const searchable = pluginSearchIndex.get(plugin.key) ?? ""
        return !normalizedQuery || searchable.includes(normalizedQuery)
      }),
    [inventory.plugins, pluginSearchIndex, normalizedQuery]
  )

  const filteredStandaloneSkills = useMemo(
    () => filterSkills(inventory.standaloneSkills, normalizedQuery, skillSearchIndex),
    [inventory.standaloneSkills, normalizedQuery, skillSearchIndex]
  )
  const filteredRawSkills = useMemo(
    () => filterSkills(inventory.skills, normalizedQuery, skillSearchIndex),
    [inventory.skills, normalizedQuery, skillSearchIndex]
  )
  const filteredMcpServers = useMemo(
    () =>
      inventory.mcpServers.filter((server) => {
        const searchable = mcpSearchIndex.get(server.detailId) ?? ""
        return !normalizedQuery || searchable.includes(normalizedQuery)
      }),
    [inventory.mcpServers, mcpSearchIndex, normalizedQuery]
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

    try {
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
    } catch {
      setNotice("Could not load details. The request failed.")
      setDetail(null)
      setDetailLoading(false)
    }
  }

  async function openExternal(detailId: string) {
    setNotice("")

    try {
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
    } catch {
      setNotice("Could not open external target. The request failed.")
    }
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

    try {
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
    } catch {
      setApplying(false)
      setNotice("Could not apply config changes. The request failed.")
    }
  }

  async function dismissRestartWarning() {
    try {
      const response = await fetch("/api/config/dismiss-restart", {
        method: "POST",
      })
      if (response.ok) {
        setApplyState((await response.json()) as ApplyState)
      }
    } catch {
      setNotice("Could not dismiss the restart warning. The request failed.")
    }
  }

  async function loadSkillPulseSummary() {
    setSkillPulseLoading(true)

    try {
      const response = await fetch("/api/skillpulse/summary")
      setSkillPulseLoading(false)

      if (!response.ok) {
        return
      }

      setSkillPulseSummary((await response.json()) as SkillPulseSummaryResponse)
    } catch {
      setSkillPulseLoading(false)
    }
  }

  async function syncSkillPulse(mode: "incremental" | "backfill-all") {
    setSkillPulseSyncing(mode)
    setNotice("")

    try {
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
    } catch {
      setSkillPulseSyncing(null)
      setNotice("Could not sync SkillPulse usage. The request failed.")
    }
  }

  async function setSkillPulseCollector(action: "start" | "stop") {
    setCollectorAction(action)
    setNotice("")

    try {
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
    } catch {
      setCollectorAction(null)
      setNotice(`Could not ${action} SkillPulse collector. The request failed.`)
    }
  }

  async function deleteSkill(target: { path: string; name: string }) {
    try {
      const response = await fetch("/api/skill-trash", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path: target.path, skillName: target.name }),
      })
      const payload = await response.json()

      if (!response.ok) {
        setNotice(payload.error ?? "Could not move the skill to trash.")
        return
      }

      setNotice(
        `Moved ${target.name} to the local trash. Restore it from the trash panel.`
      )
      router.refresh()
      await loadSkillTrash()
    } catch {
      setNotice("Could not move the skill to trash. The request failed.")
    }
  }

  async function loadSkillTrash() {
    try {
      const response = await fetch("/api/skill-trash/list")
      if (!response.ok) {
        return
      }

      const payload = (await response.json()) as { entries: SkillTrashEntry[] }
      setTrashEntries(payload.entries ?? [])
    } catch {
      // Trash listing is best-effort; the panel shows the last known state.
    }
  }

  async function restoreTrashedSkill(entryId: string) {
    try {
      const response = await fetch("/api/skill-trash/restore", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ entryId }),
      })
      const payload = await response.json()

      if (!response.ok) {
        setNotice(payload.error ?? "Could not restore the skill.")
        return
      }

      setNotice(`Restored ${payload.entry.skillName} to its original folder.`)
      router.refresh()
      await loadSkillTrash()
    } catch {
      setNotice("Could not restore the skill. The request failed.")
    }
  }

  async function purgeTrashedSkill(entryId: string) {
    try {
      const response = await fetch("/api/skill-trash/purge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ entryId }),
      })
      const payload = await response.json()

      if (!response.ok) {
        setNotice(payload.error ?? "Could not delete the trashed skill.")
        return
      }

      setNotice(`Permanently deleted ${payload.entry.skillName}.`)
      await loadSkillTrash()
    } catch {
      setNotice("Could not delete the trashed skill. The request failed.")
    }
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
                          onDelete={deleteSkill}
                          pageSize={50}
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

                    <TrashPanel
                      entries={trashEntries}
                      onRestore={restoreTrashedSkill}
                      onPurge={purgeTrashedSkill}
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
                      onDelete={deleteSkill}
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
  syncTabQueryParam(value)
}

function readActiveTab(): MainTab {
  if (typeof window === "undefined") {
    return "manage"
  }

  const fromUrl = new URLSearchParams(window.location.search).get("tab")
  if (isMainTab(fromUrl)) {
    return fromUrl
  }

  const value = window.localStorage.getItem(ACTIVE_TAB_KEY)
  return isMainTab(value) ? value : "manage"
}

function syncTabQueryParam(value: MainTab) {
  if (typeof window === "undefined") {
    return
  }

  const url = new URL(window.location.href)
  url.searchParams.set("tab", value)
  window.history.replaceState(null, "", url)
}

function isMainTab(value: string | null): value is MainTab {
  return mainTabs.some((item) => item.value === value)
}
