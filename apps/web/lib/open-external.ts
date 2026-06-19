export type OpenCommandCandidate = {
  name: string
  command: string
  args: string[]
}

type OpenCommandEnv = {
  LOCALAPPDATA?: string
  ProgramFiles?: string
  "ProgramFiles(x86)"?: string
  WINDIR?: string
  [key: string]: string | undefined
}

export function getOpenCommandCandidates(
  targetPath: string,
  line: number,
  env: OpenCommandEnv = process.env
): OpenCommandCandidate[] {
  const targetWithLine = `${targetPath}:${line}`
  const localAppData = env.LOCALAPPDATA
  const programFiles = env.ProgramFiles
  const programFilesX86 = env["ProgramFiles(x86)"]
  const windowsRoot = env.WINDIR
  const candidates: OpenCommandCandidate[] = [
    {
      name: "Windows Explorer",
      command: windowsRoot ? `${windowsRoot}\\explorer.exe` : "explorer.exe",
      args: [`/select,"${targetPath}"`],
    },
    {
      name: "Antigravity",
      command: "cmd.exe",
      args: ["/c", "antigravity.cmd", "--reuse-window", "--goto", targetWithLine],
    },
  ]

  if (localAppData) {
    candidates.push({
      name: "VS Code",
      command: `${localAppData}\\Programs\\Microsoft VS Code\\Code.exe`,
      args: ["--reuse-window", "--goto", targetWithLine],
    })
  }

  if (programFiles) {
    candidates.push({
      name: "VS Code",
      command: `${programFiles}\\Microsoft VS Code\\Code.exe`,
      args: ["--reuse-window", "--goto", targetWithLine],
    })
  }

  if (programFilesX86) {
    candidates.push({
      name: "VS Code",
      command: `${programFilesX86}\\Microsoft VS Code\\Code.exe`,
      args: ["--reuse-window", "--goto", targetWithLine],
    })
  }

  if (programFiles) {
    candidates.push({
      name: "Cursor",
      command: `${programFiles}\\cursor\\Cursor.exe`,
      args: ["--reuse-window", "--goto", targetWithLine],
    })
  }

  if (localAppData) {
    candidates.push({
      name: "Cursor",
      command: `${localAppData}\\Programs\\Cursor\\Cursor.exe`,
      args: ["--reuse-window", "--goto", targetWithLine],
    })
  }

  return candidates
}

export function getTargetLine(line: number | undefined) {
  return line ?? 1
}
