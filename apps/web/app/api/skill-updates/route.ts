import { NextResponse } from "next/server"
import { isLocalRequest } from "@/lib/local-request"
import { getCapabilityInventory, invalidateInventoryCache } from "@/lib/skills"
import {
  checkSkillUpdates,
  updateReviewName,
  rememberBlockedReview,
  applySkillUpdate,
  lastUpdateChecks,
  rememberUpdateCheck,
} from "@/lib/skill-updates"
import { acquireSkillOperation } from "@/lib/skill-operation-lock"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
let busy = false
export function GET(request: Request) {
  if (!isLocalRequest(request))
    return NextResponse.json({ error: "Local-only endpoint." }, { status: 403 })
  return NextResponse.json({ results: lastUpdateChecks() })
}
export async function POST(request: Request) {
  if (
    !isLocalRequest(request) ||
    (request.headers.get("origin") &&
      new URL(request.headers.get("origin")!).host !==
        request.headers.get("host"))
  )
    return NextResponse.json(
      { error: "Local same-origin requests only." },
      { status: 403 }
    )
  if (busy)
    return NextResponse.json(
      { error: "An update operation is already running." },
      { status: 409 }
    )
  const payload = await request.json().catch(() => null)
  if (!payload || !["check", "apply"].includes(payload.action))
    return NextResponse.json({ error: "Invalid action." }, { status: 400 })
  busy = true
  let release: (() => void) | undefined
  let streaming = false
  try {
    if (payload.action === "check") {
      if (
        !Array.isArray(payload.paths) ||
        !payload.paths.length ||
        payload.paths.some((p: unknown) => typeof p !== "string")
      )
        throw new Error("Select skills to check.")
      const inventory = getCapabilityInventory()
      const paths: string[] = [...new Set<string>(payload.paths)]
      if (paths.some((p) => !inventory.skills.some((s) => s.path === p)))
        throw new Error("Unknown inventory entry.")
      streaming = true
      const encoder = new TextEncoder()
      let cancelled = false
      const stream = new ReadableStream({
        async start(controller) {
          let completed = 0
          const started = Date.now()
          const send = (value: unknown) => { if (!cancelled) controller.enqueue(encoder.encode(JSON.stringify(value) + "\n")) }
          try {
            const stats = await checkSkillUpdates(paths, (result) => {
              rememberUpdateCheck(result)
              send({ result, completed: ++completed, total: paths.length })
            })
            send({ done: true, elapsedMs: Date.now() - started, total: paths.length, repositories: stats.repositories })
          } catch (error) { send({ error: String(error) }) }
          finally { busy = false; if (!cancelled) controller.close() }
        },
        cancel() { cancelled = true },
      })
      return new Response(stream, { headers: { "content-type": "application/x-ndjson", "cache-control": "no-store" } })
    }
    if (
      !Array.isArray(payload.tokens) ||
      !payload.tokens.length ||
      payload.tokens.some((t: unknown) => typeof t !== "string")
    )
      throw new Error("Missing review tokens.")
    if (payload.reviewed === true && payload.tokens.length !== 1)
      throw new Error(
        "Individual review is required for each noneligible skill."
      )
    const results = []
    release = acquireSkillOperation()
    for (const token of [...new Set<string>(payload.tokens)]) {
      const name = updateReviewName(token)
      try {
        results.push({
          token,
          success: true,
          ...(await applySkillUpdate(token, payload.reviewed === true)),
        })
      } catch (error) {
        try { rememberBlockedReview(token, String(error)) } catch { /* Keep the original failure in the response. */ }
        results.push({ token, name, success: false, error: String(error) })
      }
    }
    invalidateInventoryCache()
    return NextResponse.json({ results })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 400 })
  } finally {
    release?.()
    if (!streaming) busy = false
  }
}
