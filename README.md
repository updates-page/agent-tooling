# updates.page agent tooling

**Your changelog should be published by the thing that shipped the code.**

This repo packages [updates.page](https://updates.page) for coding agents: an
[Agent Skill](https://agentskills.io) that teaches a model how to write and
publish a changelog entry, wrapped as a plugin for Claude Code and for every
[Agent Plugins 1.0](https://agent-plugins.org) client — VS Code, Cursor,
GitHub Copilot, ChatGPT, Codex and Kiro.

Install it and "ship the changelog" becomes a thing you can say out loud.

```
> write release notes for everything since v1.4.0 and draft them

  Reading git log v1.4.0..HEAD… 14 commits, 2 user-visible changes.
  Drafted post 218 — "Scheduled posts and a faster feed"

  Publish it with: updates publish 218
```

---

## Install

**Claude Code**

```bash
/plugin marketplace add updates-page/agent-tooling
/plugin install updates-page@updates-page
```

**Anything else** — VS Code, Cursor, Copilot, Codex, Kiro, and ~45 other
clients that read the Agent Skills standard:

```bash
npx skills add updates-page/agent-tooling
```

**Just the skill, by hand** — copy `skills/updates-page/` into your project's
`.claude/skills/`, `.agents/skills/`, or wherever your client looks.

Every route installs the same `SKILL.md`. There is one copy of it in this repo
and every surface reads it.

## What you get

| | |
|---|---|
| **The skill** | Loads on intent — "ship the changelog", "announce this release", "write release notes for this PR" — even when updates.page is never named. |
| **`/changelog`** | A slash command in Claude Code. Give it a subject or a git range, or nothing at all and it reads your commits since the last tag. |
| **Draft-first by default** | The agent writes, you approve. Publishing reaches the public page, the RSS feed and every embedded widget at once, and there is no unsend — so the skill drafts unless you were unambiguous about going live. |
| **Real error handling** | The CLI's exit codes distinguish "you got the command wrong" from "the token expired" from "the network is down", and the skill knows what to do about each. It will not retry a `login` loop against an entitlement problem. |

## Requirements

The [`@updatespage/cli`](https://www.npmjs.com/package/@updatespage/cli), which
the skill installs if it is missing:

```bash
npm install -g @updatespage/cli
updates login --device
```

`--device` prints a short code to approve in a browser on any device. A bare
`updates login` opens a browser on the machine it ran on and waits, which hangs
an agent session on macOS and Windows.

An updates.page account. API access is included for the first 14 days of a new
account and continues on the Pro plan, so an agent can publish a real post
before anybody reaches for a card.

For CI and other unattended runs, set `UPDATESPAGE_TOKEN` in the environment —
never pass a token as a command-line argument, where it lands in shell history
and in the process list.

## Layout

```
skills/updates-page/SKILL.md   the skill — the one artifact every surface reads
commands/changelog.md          /changelog, for Claude Code
.claude-plugin/plugin.json     Claude Code plugin manifest
.claude-plugin/marketplace.json  self-hosted marketplace
plugin.json                    Agent Plugins 1.0 manifest (portable clients)
.codex-plugin/plugin.json      Codex CLI's native manifest location
```

Three manifests, because three clients read three different shapes: Claude Code
keeps its own plugin format, Agent Plugins 1.0 is the portable standard read
from the repo root, and Codex CLI has its own native manifest schema. All three
describe the same plugin and point at the same `skills/`.

## Links

- [updates.page](https://updates.page) — the product
- [Documentation](https://docs.updates.page) · [Using updates.page from an agent](https://docs.updates.page/agents)
- [CLI source](https://github.com/updates-page/cli) · [npm](https://www.npmjs.com/package/@updatespage/cli)
- [API reference](https://app.updates.page/api/openapi.json)

## Licence

MIT.
