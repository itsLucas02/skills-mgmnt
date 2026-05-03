"use client"

import { useMemo, useState } from "react"
import {
  ArchiveIcon,
  CheckCircle2Icon,
  ExternalLinkIcon,
  EyeIcon,
  FolderSearchIcon,
  InfoIcon,
  PackageIcon,
  PackagePlusIcon,
  PauseCircleIcon,
  SearchIcon,
  ShieldAlertIcon,
  Trash2Icon,
} from "lucide-react"

import type {
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

type CapabilityInventory = {
  skills: ManagedSkill[]
  plugins: ManagedPlugin[]
  standaloneSkills: ManagedSkill[]
  mcpServers: ManagedMcpServer[]
  summary: SkillSummary
}

type MainTab = "plugins" | "standalone" | "mcp" | "raw"

const mainTabs = [
  { value: "plugins", label: "Plugins" },
  { value: "standalone", label: "Standalone Skills" },
  { value: "mcp", label: "MCP Servers" },
  { value: "raw", label: "Raw Inventory" },
] satisfies Array<{ value: MainTab; label: string }>

export function SkillsManagementPage({
  inventory,
}: {
  inventory: CapabilityInventory
}) {
  const [query, setQuery] = useState("")
  const [tab, setTab] = useState<MainTab>("plugins")
  const [detail, setDetail] = useState<SkillDetail | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [notice, setNotice] = useState("")

  const normalizedQuery = query.trim().toLowerCase()

  const filteredPlugins = useMemo(
    () =>
      inventory.plugins.filter((plugin) => {
        const searchable = `${plugin.displayName} ${plugin.description} ${plugin.key} ${plugin.marketplace} ${plugin.skills
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
        const searchable = `${server.name} ${server.source} ${server.endpoint} ${server.parentPluginKey ?? ""}`.toLowerCase()
        return !normalizedQuery || searchable.includes(normalizedQuery)
      }),
    [inventory.mcpServers, normalizedQuery]
  )

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

  return (
    <main className="min-h-svh bg-background text-foreground">
      <section className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8">
        <PageHeader />

        <Alert>
          <ShieldAlertIcon />
          <AlertTitle>Inspection-first safety model</AlertTitle>
          <AlertDescription>
            This dashboard now reflects Codex config gates and plugin ownership. Enable, delete, and install
            remain disabled until a confirmation-backed action layer is added.
          </AlertDescription>
        </Alert>

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
              <SearchBar query={query} onQueryChange={setQuery} />

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
                    onDetails={showDetails}
                    onOpenExternal={openExternal}
                  />
                </TabsContent>

                <TabsContent value="standalone">
                  <SkillTable
                    skills={filteredStandaloneSkills}
                    emptyTitle="No standalone skills match this view"
                    onDetails={showDetails}
                    onOpenExternal={openExternal}
                  />
                </TabsContent>

                <TabsContent value="mcp">
                  <McpTable servers={filteredMcpServers} onDetails={showDetails} onOpenExternal={openExternal} />
                </TabsContent>

                <TabsContent value="raw">
                  <SkillTable
                    skills={filteredRawSkills}
                    emptyTitle="No skills match this raw inventory view"
                    onDetails={showDetails}
                    onOpenExternal={openExternal}
                    showParent
                  />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          <Sidebar summary={inventory.summary} />
        </div>
      </section>

      <DetailsDialog
        detail={detail}
        open={detailOpen}
        loading={detailLoading}
        onOpenChange={setDetailOpen}
      />
    </main>
  )
}

function PageHeader() {
  return (
    <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div className="flex max-w-3xl flex-col gap-2">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <FolderSearchIcon data-icon="inline-start" />
          Local Codex control center
        </div>
        <h1 className="font-heading text-3xl font-medium leading-tight tracking-normal sm:text-4xl">
          Skills management
        </h1>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
          Inspect skills, plugin bundles, and MCP servers from one local dashboard. Plugin children now
          follow their parent plugin enablement gate.
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
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <SummaryCard title="Plugins" value={`${summary.activePluginCount}/${summary.pluginCount}`} description="Enabled plugin bundles" />
      <SummaryCard title="Standalone" value={summary.standaloneSkillCount.toString()} description="Local direct skills" />
      <SummaryCard title="MCP servers" value={summary.mcpServerCount.toString()} description="Config and plugin servers" />
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
  onDetails,
  onOpenExternal,
}: {
  plugins: ManagedPlugin[]
  onDetails: (detailId: string) => void
  onOpenExternal: (detailId: string) => void
}) {
  if (!plugins.length) {
    return <EmptyState title="No plugin bundles match this view" />
  }

  return (
    <div className="flex flex-col gap-3">
      {plugins.map((plugin) => (
        <Card key={plugin.key} size="sm">
          <CardHeader>
            <div className="flex min-w-0 flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <PackageIcon className="size-4 text-muted-foreground" />
                <CardTitle>{plugin.displayName}</CardTitle>
                <StatusBadge active={plugin.enabled} label={plugin.enabled ? "Plugin active" : "Plugin disabled"} />
                <Badge variant="outline">{plugin.marketplace}</Badge>
              </div>
              <CardDescription>{plugin.description}</CardDescription>
            </div>
            <CardAction>
              <ActionButtons
                detailId={plugin.detailId}
                deleteLabel={`Delete ${plugin.displayName}`}
                onDetails={onDetails}
                onOpenExternal={onOpenExternal}
              />
            </CardAction>
          </CardHeader>
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
              onDetails={onDetails}
              onOpenExternal={onOpenExternal}
              compact
            />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function SkillTable({
  skills,
  emptyTitle,
  onDetails,
  onOpenExternal,
  showParent = false,
  compact = false,
}: {
  skills: ManagedSkill[]
  emptyTitle: string
  onDetails: (detailId: string) => void
  onOpenExternal: (detailId: string) => void
  showParent?: boolean
  compact?: boolean
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
                  <span className="font-medium">{skill.name}</span>
                  <span className="line-clamp-2 text-muted-foreground">{skill.description}</span>
                </div>
              </TableCell>
              {showParent ? (
                <TableCell>
                  <Badge variant="outline">{skill.parentPluginKey ?? "Standalone"}</Badge>
                </TableCell>
              ) : null}
              <TableCell>
                <EffectiveStatusControl skill={skill} />
              </TableCell>
              <TableCell className="max-w-72 truncate font-mono text-xs text-muted-foreground">
                <div className="flex flex-col gap-1">
                  <span className="truncate">{skill.relativePath}</span>
                  <span className="truncate font-sans text-[0.7rem]">{skill.statusReason}</span>
                </div>
              </TableCell>
              <TableCell>
                <ActionButtons
                  detailId={skill.detailId}
                  deleteLabel={`Delete ${skill.name}`}
                  onDetails={onDetails}
                  onOpenExternal={onOpenExternal}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function EffectiveStatusControl({ skill }: { skill: ManagedSkill }) {
  const active = skill.effectiveStatus === "active"
  const pluginDisabled = skill.effectiveStatus === "disabled-by-plugin"

  return (
    <div className="flex items-center gap-2">
      <Switch checked={active} disabled aria-label={`${skill.name} effective status`} />
      {active ? (
        <CheckCircle2Icon className="text-muted-foreground" />
      ) : (
        <PauseCircleIcon className="text-muted-foreground" />
      )}
      <Badge variant={active ? "secondary" : pluginDisabled ? "destructive" : "outline"}>
        {statusLabel(skill.effectiveStatus)}
      </Badge>
    </div>
  )
}

function McpTable({
  servers,
  onDetails,
  onOpenExternal,
}: {
  servers: ManagedMcpServer[]
  onDetails: (detailId: string) => void
  onOpenExternal: (detailId: string) => void
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
          {servers.map((server) => (
            <TableRow key={`${server.source}-${server.name}-${server.parentPluginKey ?? "config"}`}>
              <TableCell>
                <div className="flex flex-col gap-1">
                  <span className="font-medium">{server.name}</span>
                  <span className="text-xs text-muted-foreground">{server.parentPluginKey ?? "Codex config"}</span>
                </div>
              </TableCell>
              <TableCell>
                <Badge variant="outline">{server.source}</Badge>
              </TableCell>
              <TableCell>
                <StatusBadge active={server.enabled} label={server.enabled ? "Active" : "Disabled"} />
              </TableCell>
              <TableCell className="max-w-80 truncate font-mono text-xs text-muted-foreground">
                {server.endpoint}
              </TableCell>
              <TableCell>
                <ActionButtons
                  detailId={server.detailId}
                  deleteLabel={`Delete ${server.name}`}
                  onDetails={onDetails}
                  onOpenExternal={onOpenExternal}
                  canOpen={Boolean(server.path)}
                />
              </TableCell>
            </TableRow>
          ))}
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
  canOpen = true,
}: {
  detailId: string
  deleteLabel: string
  onDetails: (detailId: string) => void
  onOpenExternal: (detailId: string) => void
  canOpen?: boolean
}) {
  return (
    <div className="flex gap-2">
      <Button variant="outline" size="icon-sm" aria-label="View details" onClick={() => onDetails(detailId)}>
        <EyeIcon />
      </Button>
      <Button
        variant="outline"
        size="icon-sm"
        aria-label="Open external"
        disabled={!canOpen}
        onClick={() => onOpenExternal(detailId)}
      >
        <ExternalLinkIcon />
      </Button>
      <Button variant="destructive" size="icon-sm" aria-label={deleteLabel} disabled>
        <Trash2Icon />
      </Button>
    </div>
  )
}

function Sidebar({ summary }: { summary: SkillSummary }) {
  return (
    <aside className="flex flex-col gap-4">
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
              <Metric label="Source" value={detail.source} />
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
    const searchable = `${skill.name} ${skill.description} ${skill.relativePath} ${skill.parentPluginKey ?? ""}`.toLowerCase()
    return !normalizedQuery || searchable.includes(normalizedQuery)
  })
}

function statusLabel(status: ManagedSkill["effectiveStatus"]) {
  const labels: Record<ManagedSkill["effectiveStatus"], string> = {
    active: "Active",
    "disabled-by-plugin": "Plugin disabled",
    "disabled-by-skill": "Skill disabled",
    "installed-not-loaded": "Not loaded",
  }
  return labels[status]
}
