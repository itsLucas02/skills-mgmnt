type ThemeHotkeyEvent = {
  key?: string
  defaultPrevented?: boolean
  repeat?: boolean
  metaKey?: boolean
  ctrlKey?: boolean
  altKey?: boolean
}

export function shouldToggleThemeForKey(event: ThemeHotkeyEvent) {
  if (event.defaultPrevented || event.repeat) {
    return false
  }

  if (event.metaKey || event.ctrlKey || event.altKey) {
    return false
  }

  return event.key?.toLowerCase() === "d"
}
