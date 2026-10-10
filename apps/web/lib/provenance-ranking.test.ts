import { test } from "node:test"
import assert from "node:assert/strict"
import { provenanceRanking, provenanceCsv } from "./provenance-ranking.ts"
test("rankings deduplicate registry identity without inventing author names", () => {
  const skills = [
    {
      path: "canonical",
      provenance: {
        source: "owner/repo",
        skillPath: "skills/a/SKILL.md",
        owner: "owner",
        author: "writer",
      },
    },
    {
      path: "adapter",
      provenance: {
        source: "owner/repo",
        skillPath: "skills/a/SKILL.md",
        owner: "owner",
        author: "writer",
      },
    },
    { path: "unknown" },
  ]
  assert.equal(
    provenanceRanking(skills).find((r) => r.owner === "owner")?.count,
    1
  )
  assert.equal(
    provenanceRanking(skills, "author").find((r) => r.owner === "writer")
      ?.count,
    1
  )
  assert.ok(
    provenanceRanking(skills).find((r) => r.owner === "Source unknown")
  )
  assert.match(
    provenanceCsv([{ name: '=FORMULA("x")', path: "path", status: "active" }]),
    /'=/
  )
})
