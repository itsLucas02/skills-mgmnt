# Skills Management improvement roadmap

Date: 10/10/2026 · Owner timezone: Asia/Kuala_Lumpur

**Status: implementation approved on 10/10/2026; local changes implemented. See [implementation evidence and remaining acceptance](IMPLEMENTATION-STATUS.md).**

This document records the approved direction for the five reported issues. Application and focused machine changes were authorized; the owner additionally authorized documenting, committing and pushing the integrated changes on 10/10/2026. Unrelated work remains excluded.

## Outcomes and delivery order

| Phase | Problem | Intended outcome | Depends on |
| --- | --- | --- | --- |
| 1 | Usage scans interrupt typing with a black terminal | Scheduled scans run without opening or focusing a window | Current task and process-chain verification |
| 2 | Disabled skills remain discoverable | Supported skills can be reversibly isolated from normal agent discovery | Discovery-path inventory and governance checks |
| 3 | Skill authors and origins are unclear | Traceable source information and useful contributor statistics | Registry-to-inventory matching |
| 4 | Skills have no manual update workflow | Owner checks, reviews, and updates selected or all eligible skills on demand | Phases 2 and 3; verified upstream baselines |
| 5 | Dashboard feels static and lifeless | Clear, responsive feedback and purposeful transitions | Final workflows from phases 1–4 |

The order puts the disruptive machine behavior and misleading disable behavior first. Motion can be evaluated earlier, but final polish should follow the functional changes.

## 1. Silent background usage scans

### Evidence and cause

The current `SkillPulse Hourly Scan` scheduled task launches `cmd.exe` in an interactive Windows session. Its batch wrapper redirects output to a log, which does not prevent a console window. The Node runner also launches a child process. The configured task explains the reported window; the complete focus-stealing process chain still needs to be observed during verification.

### Proposed solution

- Replace the interactive console launch with a verified hidden launcher. Keep the scan under the existing user, with its current permissions and hourly schedule.
- Ensure every process in the chain remains hidden, including child Node processes. Use explicit hidden/no-window launch settings where required.
- Preserve scan logs, expose the last successful scan and failure state, and return the actual scanner exit code through the wrapper and scheduled task.
- Back up the scheduled-task definition before changing its action. Preserve unrelated triggers, settings, and active workloads.
- Apply the same launcher behavior to the registration script so reinstalling the task does not restore the bug.

### Acceptance criteria

- A scheduled run completes while the owner types in another application, without a visible console or focus change.
- A manual scan still works and reports progress/completion in the dashboard.
- A forced scan failure produces a nonzero task result and useful local diagnostics.
- Overlapping runs remain prevented; collection continues when the dashboard is closed.
- Restoring the saved task definition reverses the change.

## 2. Disabled means isolated from discovery

### Evidence and cause

The dashboard currently writes `enabled = false` into an exact `[[skills.config]]` entry in Codex configuration. Impeccable remains physically present in `.agents/skills`. This is a Codex configuration preference, not a machine-wide discovery barrier. Other harnesses, duplicate copies, or previously loaded session instructions may still expose the skill. The reported fresh-agent behavior needs a controlled reproduction before attributing it to a specific harness bug.

### Proposed solution

- Inventory actual discovery paths and adapters for Codex, OpenCode/CommandCode, and Claude Code. Resolve junction targets and duplicate copies before moving anything.
- For owner-managed standalone skills, introduce reversible disabled storage outside every verified discovery root. Keep the provenance registry and inventory aware of that storage so isolated skills remain visible in this dashboard.
- Disable by moving the owned canonical folder to disabled storage and removing only verified discovery adapters belonging to that skill. Preserve upstream content and provenance.
- Enable by restoring the canonical folder and its recorded adapters. Detect occupied destinations and refuse to overwrite them.
- Keep preview/apply: show affected files, adapters, and harnesses before applying a batch. Record lifecycle events and run the governed audit.
- Make batch changes recoverable: record original locations before mutation, roll back partial failures, and report any rollback failure explicitly.
- Separate statuses such as **Enabled**, **Isolated**, **Disabled in Codex only**, and **Isolation incomplete**. Never imply machine-wide isolation when only a configuration flag changed.
- Keep provider-owned bundled/cached skills under provider control. Use supported provider controls; show the limitation when isolation cannot be guaranteed. Do not move their cache folders automatically.

### Acceptance criteria

- After a fresh session starts, isolated Impeccable is absent from the supported harnesses' discovered skill catalogs.
- Enabling restores the original content, provenance, and supported discovery adapters.
- Duplicate exposure is detected and prevents a false “Isolated” status.
- Interrupted moves, junction failures, and conflicting destinations do not silently lose or overwrite skills.
- Inventory, filtering, exports, and usage history retain isolated skills without counting them as discoverable.
- Registry writes remain UTF-8 without BOM; backups, lifecycle records, and audit results are retained.

### Boundary

This controls normal discovery. It cannot make a file unreadable to an unrestricted agent running as the same Windows user. Enforcing that stronger boundary requires separate permissions or sandbox identities. Existing agents may retain loaded instructions and need a new session; the UI must explain that limitation.

## 3. Author provenance and contributor statistics

### Evidence and cause

The local provenance registry records upstream repositories and source paths. The dashboard primarily exposes storage/provider origin rather than human authorship. A repository owner may be an organization or distributor and is not necessarily the skill author.

### Proposed solution

- Join inventory entries to existing registry records using verified identity/path relationships, not display-name guesses.
- Show declared author, upstream repository owner, source URL, and source path as distinct information in skill details. Show **Unknown** when evidence is missing.
- Prefer explicit existing author metadata; otherwise label repository ownership accurately. Do not modify third-party `SKILL.md` files to add local attribution.
- Add author/source filtering and an overview of who contributes the most installed skills. Show coverage and unattributed counts alongside rankings.
- Deduplicate the same skill exposed through multiple adapters. State whether totals include enabled and isolated skills, and keep plugin attribution separate when individual authors are unknown.
- Include attribution fields in exports. Use clickable upstream links and retain local-only provenance where appropriate.

### Acceptance criteria

- A known registry entry shows its exact upstream link and owner; a declared author is separately identified.
- Unknown origins remain visibly unknown; no inferred person is presented as confirmed author.
- Duplicate discovery adapters do not inflate rankings.
- Ranking totals reconcile with the explicitly stated inventory scope, including unattributed entries.
- Missing or malformed provenance does not break the inventory page.

## 4. Manual update checks and reviewed updates

### Owner requirement

Update checks are initiated by a button. There must be no scheduled checks, checks on page load, or network polling for upstream changes. Usage scanning remains a separate local workflow.

### Proposed workflow

1. Place **Check for updates** in the skills toolbar, beside selection/bulk actions. Clearly state whether it targets selected skills or all eligible skills.
2. Fetch upstream metadata only for that explicit check. Display per-skill progress, result, and last checked time in DD/MM/YYYY with Malaysia time.
3. Use separate fields for upstream status (**Up to date**, **Update available**, **Cannot verify**, **Check failed**, **Provider-managed**) and local modification status. A locally modified skill may also have an upstream update.
4. **Review update** shows the installed revision, proposed revision, changed skill files, and relevant dependency/license changes before applying anything.
5. **Update selected** and **Update all eligible** show an explicit batch preview. “All eligible” excludes unknown baselines, unsupported provider-managed entries, and unresolved local modifications.
6. Back up content and registry, validate paths and downloaded content, apply only the selected skill subtree, record revision/integrity and lifecycle events, then run the governed audit.
7. Preserve isolation state and discovery adapters. Updating a disabled skill must never re-enable it.
8. Report success/failure per skill; restore failed items from backups and keep successful updates identifiable. Never claim a batch succeeded after partial failure.

### Baselines and safety

- Record the installed upstream revision and content integrity where verifiable. Compare the relevant skill subtree; an unrelated repository commit must not mark every skill outdated.
- Missing installed revisions produce **Cannot verify**. Offer a reviewed baseline reconciliation step; do not guess an installed commit from a copied folder.
- Detect local modifications against a trustworthy baseline. Require review rather than silently overwriting them.
- Repositories may rename/delete skill paths or change dependencies. Treat these as review-required conditions, not automatic replacements.
- Use the provider's supported update path for provider-managed plugins. Clearly disclose when that operation updates an entire plugin rather than one child skill.
- Network failures/rate limits retain the last successful result with a stale/error label. Do not execute downloaded upstream scripts as part of checking or copying a skill.
- Follow machine-wide governance: snapshot before any `npx skills` invocation, preserve provenance, write BOM-free JSON, append lifecycle events, and audit changes.

### Acceptance criteria

- Opening/refreshing the dashboard and hourly usage scans cause no upstream update requests.
- Explicit selected/all checks issue only the intended requests and produce distinguishable success, unknown, and failure states.
- Unrelated upstream commits do not produce false update notifications.
- Review shows the exact content proposed for installation; changes between check and apply require a refreshed review.
- Isolated skills stay isolated after updates; locally edited files are not silently overwritten.
- Partial failures and rollback are tested using temporary skill fixtures, not the owner's live arsenal.

## 5. Purposeful motion and stronger visual feedback

### Evidence and cause

The previous refresh added subtle button press/color feedback and retained shared dialog animation, while navigation transitions were explicitly disabled. Most dashboard state changes and expandable sections remain abrupt. Therefore the interface has some motion, but too little visible feedback for the owner's preference.

### Skills and approach

- `find-animation-opportunities`: inspect actual workflows and propose a small list of useful transitions.
- `improve-animations`: turn approved opportunities into precise implementation changes.
- `review-animations`: assess timing, interruption, accessibility, and whether motion earns its place.
- Continue using `emil-design-eng` and `apple-design` for hierarchy, physical feedback, restraint, and consistency.

### Proposed motion candidates

| Moment | Purpose | Initial recipe for evaluation |
| --- | --- | --- |
| Scan/check begins and completes | Make background work and success/failure legible | Immediate status change; subtle progress icon; 160 ms opacity transition for completion feedback |
| Changes are staged or cleared | Confirm the action and reveal the next step | 160 ms opacity transition on the summary/action area; no delay before controls become usable |
| Advanced sections open/close | Bridge an abrupt content change | 180 ms opacity/transform transition, at most 4 px displacement |
| Detail/review dialog opens | Connect the interaction to its result | Evaluate existing animation; target 180 ms opacity and scale 0.97 to 1 with `cubic-bezier(0.23, 1, 0.32, 1)` |

These are candidates, not approved prescriptions. Validate them in the rendered UI and revise if they feel slow. Portaled dialogs need styles at the shared component scope rather than relying on a dashboard ancestor.

Avoid animated counters, perpetual decorative motion, staggered data rows, and delayed search/filter results. Keep keyboard navigation immediate. Honor reduced-motion preferences and restrict hover effects to fine pointers. Improve active/hover color and hierarchy alongside motion so liveliness does not depend on animation alone.

### Acceptance criteria

- Scan/check progress, completion, and staged changes are visibly understandable without guessing.
- Feedback starts immediately; repeated actions do not queue animations or leave stale visual states.
- Desktop and narrow mobile layouts remain stable, with no page overflow or shifting controls.
- Keyboard focus remains visible and predictable; reduced-motion mode avoids scale/displacement effects.
- Browser verification covers light/dark themes and actual workflows. The owner reviews the resulting feel before calling visual work complete.

## Implementation controls and approval checkpoints

- Approval is required before starting implementation. Each phase should produce a small, reviewable change and evidence against its acceptance criteria.
- Application work and machine changes must be identified separately. Before machine changes, explain the verified cause, exact affected settings/files, backup, and rollback.
- Use current governance at `C:\Users\User\.agents\SKILL_GOVERNANCE.md`. Do not weaken security protections to implement isolation or quiet scanning.
- Preserve the substantial pre-existing dirty worktree. Agree which changes are included in a release before staging, committing, or pushing.
- Use focused tests for isolation, provenance matching, update comparison, failures, and rollback. Use rendered browser checks for frontend workflows and actual Windows checks for invisible scanning.
- Maintain a dated troubleshooting record for the console interruption and discovery leakage when execution begins; record confirmed causes, repairs, rollback, evidence, and remaining limitations.

## Decisions to confirm before the relevant phase

| Decision | Recommended default |
| --- | --- |
| What should “disable” mean? | Isolate owner-managed standalone skills from every supported, verified discovery path; label provider limitations explicitly |
| Which harnesses must pass isolation checks? | Codex, OpenCode/CommandCode, and Claude Code where installed and discoverable |
| What should the contributor ranking count? | Unique installed skills, including isolated skills, with separate declared-author and repository-owner views |
| How should local edits affect updates? | Exclude from bulk updates until reviewed; never overwrite silently |
| Should updates happen automatically after checking? | No; check, review, and apply are separate owner actions |
| What may be published? | Decide after local verification; do not include unrelated unfinished work by default |

## Completion checklist

- [x] Roadmap reviewed and execution scope approved.
- [ ] Background scan tested without a window or focus interruption.
- [x] Fresh-session isolation verified and restoration/rollback tested.
- [x] Source/author details and deduplicated rankings verified.
- [x] Manual-only update workflow verified, including failures and disabled skills.
- [ ] Motion reviewed in browser across desktop/mobile, themes, and reduced motion.
- [x] Owner acceptance, release scope, and remaining limitations recorded.

No implementation deadlines are assigned until discovery gaps and approval scope are resolved.
