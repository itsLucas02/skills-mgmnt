import assert from "node:assert/strict"
import test from "node:test"

import { extractHarnessEventsFromTranscriptLine } from "./skill-harness-adapters.ts"

const ctx = {
  harness: "claude-code" as const,
  sessionFile: "C:\\Users\\User\\.claude\\projects\\demo\\abc.jsonl",
  sessionId: "abc",
}

test("captures a Claude Code Skill tool call as an invocation", () => {
  const line = JSON.stringify({
    timestamp: "2026-06-10T04:13:11.599Z",
    type: "assistant",
    message: {
      content: [
        {
          type: "tool_use",
          id: "toolu_1",
          name: "Skill",
          input: { skill: "system-diagnostics", args: "check crashes" },
        },
      ],
    },
  })

  const events = extractHarnessEventsFromTranscriptLine(line, ctx)

  assert.equal(events.length, 1)
  assert.equal(events[0]?.skillName, "system-diagnostics")
  assert.equal(events[0]?.harness, "claude-code")
  assert.equal(events[0]?.occurredAt, "2026-06-10T04:13:11.599Z")
  assert.equal(events[0]?.source, "harness-skill-tool")
})

test("captures a Read of a SKILL.md as a separate labelled source", () => {
  const line = JSON.stringify({
    timestamp: "2026-06-10T05:00:00.000Z",
    message: {
      content: [
        {
          type: "tool_use",
          id: "toolu_2",
          name: "Read",
          input: { file_path: "C:\\Users\\User\\.agents\\skills\\better-ui\\SKILL.md" },
        },
      ],
    },
  })

  const events = extractHarnessEventsFromTranscriptLine(line, ctx)

  assert.equal(events.length, 1)
  assert.equal(events[0]?.skillName, "better-ui")
  assert.equal(events[0]?.source, "harness-read-skill-md")
})

test("ignores ordinary tool calls", () => {
  const line = JSON.stringify({
    timestamp: "2026-06-10T05:00:00.000Z",
    message: {
      content: [
        { type: "tool_use", id: "toolu_3", name: "Bash", input: { command: "ls" } },
        { type: "tool_use", id: "toolu_4", name: "Read", input: { file_path: "C:\\src\\index.ts" } },
      ],
    },
  })

  assert.equal(extractHarnessEventsFromTranscriptLine(line, ctx).length, 0)
})

test("survives malformed lines and entries without a skill name", () => {
  assert.equal(extractHarnessEventsFromTranscriptLine("not json", ctx).length, 0)

  const noName = JSON.stringify({
    message: { content: [{ type: "tool_use", id: "t", name: "Skill", input: {} }] },
  })

  assert.equal(extractHarnessEventsFromTranscriptLine(noName, ctx).length, 0)
})

test("event ids are stable across runs so re-ingesting cannot double-count", () => {
  const line = JSON.stringify({
    timestamp: "2026-06-10T04:13:11.599Z",
    message: {
      content: [{ type: "tool_use", id: "toolu_1", name: "Skill", input: { skill: "baseline-ui" } }],
    },
  })

  const first = extractHarnessEventsFromTranscriptLine(line, ctx)
  const second = extractHarnessEventsFromTranscriptLine(line, ctx)

  assert.equal(first[0]?.id, second[0]?.id)
})
