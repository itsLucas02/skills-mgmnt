export function getCompactPathLabel(filePath: string, visibleSegments = 5) {
  const separator = filePath.includes("\\") ? "\\" : "/"
  const segments = filePath.split(/[\\/]/).filter(Boolean)

  if (segments.length <= visibleSegments) {
    return filePath
  }

  return `...${separator}${segments.slice(-visibleSegments).join(separator)}`
}
