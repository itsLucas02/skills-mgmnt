export type OpenCommandCandidate = {
  name: string
  command: string
  args: string[]
}

export function getOpenCommandCandidates(targetPath: string, line: number): OpenCommandCandidate[] {
  const targetWithLine = `${targetPath}:${line}`

  return [
    {
      name: "Antigravity",
      command: "cmd.exe",
      args: ["/c", "antigravity.cmd", "--reuse-window", "--goto", targetWithLine],
    },
    {
      name: "VS Code",
      command: "cmd.exe",
      args: ["/c", "code.cmd", "--reuse-window", "--goto", targetWithLine],
    },
    {
      name: "Cursor",
      command: "cmd.exe",
      args: ["/c", "cursor.cmd", "--reuse-window", "--goto", targetWithLine],
    },
    {
      name: "Windows Explorer",
      command: "explorer.exe",
      args: [`/select,"${targetPath}"`],
    },
  ]
}

export function getTargetLine(line: number | undefined) {
  return line ?? 1
}
