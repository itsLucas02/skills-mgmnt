const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"])

export function isLocalRequest(request: Request) {
  return isLocalHostHeader(request.headers.get("host"))
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
