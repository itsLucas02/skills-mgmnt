import { SkillsManagementPage } from "@/components/skills-management-page"
import { isLocalHostHeader } from "@/lib/local-request"
import { getCapabilityInventory } from "@/lib/skills"
import { headers } from "next/headers"

export const dynamic = "force-dynamic"

export default async function Page() {
  const requestHeaders = await headers()

  if (!isLocalHostHeader(requestHeaders.get("host"))) {
    return (
      <main style={{ padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
        <h1>Local-only dashboard</h1>
        <p>This app reads local agent configuration and only renders on localhost.</p>
      </main>
    )
  }

  const inventory = getCapabilityInventory()

  return <SkillsManagementPage inventory={inventory} />
}
