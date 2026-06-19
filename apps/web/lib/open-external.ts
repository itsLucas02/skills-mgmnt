export function getExplorerSelectArgs(targetPath: string) {
  return [`/select,${targetPath}`]
}

export function getTargetLine(line: number | undefined) {
  return line ?? 1
}
