const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"])

export function isLocalRequest(request: Request) {
  if (!isLocalHostHeader(request.headers.get("host"))) return false
  const origin = request.headers.get("origin")
  if (origin) {
    try { if (new URL(origin).host !== request.headers.get("host")) return false }
    catch { return false }
  }
  return request.headers.get("sec-fetch-site") !== "cross-site"
}

export function isLocalHostHeader(hostHeader: string | null) {
  if (!hostHeader) {
    return false
  }

  const host = hostHeader.startsWith("[")
    ? hostHeader.slice(0, hostHeader.indexOf("]") + 1)
    : hostHeader.split(":")[0]

  return LOCAL_HOSTS.has(host ?? "")
}
