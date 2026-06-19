import assert from "node:assert/strict"
import test from "node:test"

import { getOpenCommandCandidates, getTargetLine } from "./open-external.ts"

test("builds explorer candidate before editor fallbacks", () => {
  assert.deepEqual(getOpenCommandCandidates("C:\\Users\\User\\file with spaces.md", 7, {
    LOCALAPPDATA: "C:\\Users\\User\\AppData\\Local",
    ProgramFiles: "C:\\Program Files",
    "ProgramFiles(x86)": "C:\\Program Files (x86)",
    WINDIR: "C:\\WINDOWS",
  }), [
    {
      name: "Windows Explorer",
      command: "C:\\WINDOWS\\explorer.exe",
      args: ["/select,\"C:\\Users\\User\\file with spaces.md\""],
    },
    {
      name: "Antigravity",
      command: "cmd.exe",
      args: ["/c", "antigravity.cmd", "--reuse-window", "--goto", "C:\\Users\\User\\file with spaces.md:7"],
    },
    {
      name: "VS Code",
      command: "C:\\Users\\User\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe",
      args: ["--reuse-window", "--goto", "C:\\Users\\User\\file with spaces.md:7"],
    },
    {
      name: "VS Code",
      command: "C:\\Program Files\\Microsoft VS Code\\Code.exe",
      args: ["--reuse-window", "--goto", "C:\\Users\\User\\file with spaces.md:7"],
    },
    {
      name: "VS Code",
      command: "C:\\Program Files (x86)\\Microsoft VS Code\\Code.exe",
      args: ["--reuse-window", "--goto", "C:\\Users\\User\\file with spaces.md:7"],
    },
    {
      name: "Cursor",
      command: "C:\\Program Files\\cursor\\Cursor.exe",
      args: ["--reuse-window", "--goto", "C:\\Users\\User\\file with spaces.md:7"],
    },
    {
      name: "Cursor",
      command: "C:\\Users\\User\\AppData\\Local\\Programs\\Cursor\\Cursor.exe",
      args: ["--reuse-window", "--goto", "C:\\Users\\User\\file with spaces.md:7"],
    },
  ])
})

test("defaults missing target lines to one", () => {
  assert.equal(getTargetLine(undefined), 1)
})
