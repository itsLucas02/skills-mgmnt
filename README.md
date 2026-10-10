# Skills Management

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**A local control center for the skills, plugins, and MCP servers your AI agents can use.**

Agent tools accumulate capabilities quickly. Skills Management helps you see what is installed, understand what controls it, review actual usage, and turn off capabilities you no longer need—all from one dashboard.

Built primarily for Codex configuration and usage tracking. This is an independent community project, not an official OpenAI product.

## What you can do

- **Inspect your inventory:** browse local skills, plugin bundles, their child skills, and MCP servers.
- **Understand availability:** distinguish enabled skills from skills disabled individually or through a parent plugin.
- **Review changes first:** stage enable/disable changes, inspect the config diff, and apply them with a backup.
- **Find cleanup candidates:** review observed usage, install age, last use, and which agent tool loaded a skill.
- **Keep history:** the permanent SkillPulse ledger preserves usage counts when recent event logs rotate.
- **Recover mistakes:** supported standalone skills can be moved to local trash and restored.
- **Inspect source:** preview SKILL.md and open the associated local file or configuration.
- **Trace contributors:** compare declared authors with repository owners, filter sources, and export deduplicated attribution.
- **Isolate disabled skills:** supported owner-managed `.agents/skills` folders and recorded provider copies move outside discovery roots; enable restores them. Provider-native controls remain configuration-only. Start fresh agent sessions after applying changes.
- **Check updates manually:** Sources & updates checks selected/all skills only when clicked. Review content and upstream license/dependency context before applying; backups and provenance are retained. Unknown baselines and local edits are excluded from bulk apply.
- **Export usage:** download CSV reports. Displayed dates use DD/MM/YYYY and Malaysia time (UTC+8).

Zero recorded usage means the tracker has not observed a load; it does not prove a skill was never used. Nothing is disabled automatically.

Scheduled usage scans use a hidden Windows launcher. They do not check upstream updates. See [local implementation status](docs/IMPLEMENTATION-STATUS.md) for verification and current limitations.

## Quick start

Requires **Node.js 20+** and npm. Windows is the primary development environment; some external-editor and task-scheduling integrations are Windows-specific.

```bash
git clone https://github.com/itsLucas02/skills-mgmnt.git
cd skills-mgmnt
npm install
npm run dev
```

Open **http://localhost:3020**.

Run commands from the directory containing `package.json`. If your download or checkout is nested inside another `skills-mgmnt` folder, enter the inner project directory first.

## How it works

The Next.js dashboard reads local skill folders such as `~/.agents/skills` and `~/.codex/skills`, Codex plugin metadata, and Codex configuration. Skills remain on disk when disabled; enabling them again does not require reinstalling them. Restart Codex to load configuration changes into its capability catalog.

Enable/disable controls target **Codex configuration**. They do not automatically change OpenCode or Claude Code configuration. Cross-tool usage tracking is a separate feature.

SkillPulse provides observed usage and cleanup information. Cross-tool tracking, a permanent usage ledger, and headless scan/report commands are under local development and are not included in the published release yet.

## Privacy and local access

**The source is public; your dashboard should stay private.** Do not deploy it to a public hosting service or expose it through a public tunnel.

The application reads agent configuration and local session records, which may contain sensitive information. Local APIs reject non-localhost requests. Keep the dashboard on localhost, do not weaken those guards, and do not commit local configuration, session records, credentials, databases, or generated usage logs.

Configuration changes are backed up locally. Review proposed changes before applying them. Permanent trash deletion cannot be undone through the dashboard.

## Development

Built with Next.js, React, TypeScript, Tailwind CSS, Base UI components, and Turborepo.

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the dashboard on port 3020 |
| `npm run typecheck` | Check TypeScript |
| `npm run lint` | Run lint checks |
| `npm run test` | Run tests |
| `npm run build` | Build the workspace |

```text
apps/web/                 Dashboard, local APIs, inventory and usage tracking
packages/ui/              Shared interface components and styling
packages/eslint-config/   Shared lint configuration
packages/typescript-config/ Shared TypeScript configuration
```

Issues and pull requests are welcome. Describe the agent tool, operating system, expected behavior, and a sanitized reproduction. Never attach credentials or raw private session logs.

## License

[MIT](LICENSE). Dependency and third-party skill licenses remain their respective owners' licenses. This project does not relicense the skills or plugins it discovers on your computer.
