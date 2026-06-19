import assert from "node:assert/strict"
import test from "node:test"

import { getOpenCommandCandidates, getTargetLine } from "./open-external.ts"

test("builds editor candidates before explorer fallback", () => {
  assert.deepEqual(getOpenCommandCandidates("C:\\Users\\User\\file with spaces.md", 7), [
    {
      name: "Antigravity",
      command: "cmd.exe",
      args: ["/c", "antigravity.cmd", "--reuse-window", "--goto", "C:\\Users\\User\\file with spaces.md:7"],
    },
    {
      name: "VS Code",
      command: "cmd.exe",
      args: ["/c", "code.cmd", "--reuse-window", "--goto", "C:\\Users\\User\\file with spaces.md:7"],
    },
    {
      name: "Cursor",
      command: "cmd.exe",
      args: ["/c", "cursor.cmd", "--reuse-window", "--goto", "C:\\Users\\User\\file with spaces.md:7"],
    },
    {
      name: "Windows Explorer",
      command: "explorer.exe",
      args: ["/select,\"C:\\Users\\User\\file with spaces.md\""],
    },
  ])
})

test("defaults missing target lines to one", () => {
  assert.equal(getTargetLine(undefined), 1)
})
