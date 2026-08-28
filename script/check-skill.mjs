#!/usr/bin/env node
/**
 * Guards the one thing this repo cannot check by reading itself: whether
 * SKILL.md still describes the CLI it documents.
 *
 * The skill lives here and `@updatespage/cli` lives in updates-page/cli, so a
 * flag renamed there breaks nothing here — the file just starts telling agents
 * to run something that no longer works. That is the standing cost of the
 * split, and this is the thing that pays it.
 *
 * Also enforces the frontmatter rules, which are silent when violated:
 * Claude Code tolerates a seventh field while claude.ai uploads and the Skills
 * API treat it as a hard error, so `claude plugin validate` passing locally
 * proves nothing about the other install paths.
 *
 *   node script/check-skill.mjs            # against the published `latest`
 *   node script/check-skill.mjs 1.4.1      # against a specific version
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const SKILL = 'skills/updates-page/SKILL.md';
const FRONTMATTER_FIELDS = new Set([
  'name', 'description', 'license', 'allowed-tools', 'metadata', 'compatibility',
]);
const DESCRIPTION_MAX = 1024;

const failures = [];
const fail = (msg) => failures.push(msg);
const ok = (msg) => console.log(`  ok   ${msg}`);

const source = readFileSync(SKILL, 'utf8');

// ---------------------------------------------------------------- frontmatter
// Parsed as YAML, not pattern-matched: `"version": 1.2.3` is a valid seventh
// field that a regex for unquoted keys never sees, and Skills consumers reject
// the file for it while every local check stays green.
execFileSync('npm', ['install', '--no-save', '--silent', 'js-yaml@4'], { stdio: 'inherit' });
const yaml = createRequire(import.meta.url)('js-yaml');

const fm = source.match(/^---\n([\s\S]*?)\n---\n/);
if (!fm) {
  fail(`${SKILL}: no frontmatter block`);
} else {
  let parsed = null;
  try {
    parsed = yaml.load(fm[1]);
  } catch (e) {
    fail(`frontmatter is not valid YAML: ${e.message.split('\n')[0]}`);
  }
  if (parsed !== null && (typeof parsed !== 'object' || Array.isArray(parsed))) {
    fail('frontmatter is not a mapping');
    parsed = null;
  }
  const keys = parsed ? Object.keys(parsed) : [];
  const extra = keys.filter((k) => !FRONTMATTER_FIELDS.has(k));
  if (extra.length) {
    fail(`frontmatter has fields outside the permitted six: ${extra.join(', ')}\n` +
         `       Claude Code tolerates these; claude.ai uploads and the Skills API reject the file.`);
  } else {
    ok(`frontmatter fields (${keys.join(', ')})`);
  }

  const flat = String(parsed?.description ?? '').replace(/\s+/g, ' ').trim();
  if (!flat) fail('frontmatter: description is empty');
  else if (flat.length > DESCRIPTION_MAX) fail(`description is ${flat.length} chars, max ${DESCRIPTION_MAX}`);
  else ok(`description length ${flat.length}/${DESCRIPTION_MAX}`);

  if (/[<>]/.test(flat)) fail('description contains an angle bracket, which is rejected on upload');
  else ok('description has no angle brackets');
}

// ------------------------------------------------------------------ CLI drift
const version = process.argv[2] ?? 'latest';
const spec = `@updatespage/cli@${version}`;
console.log(`\n  installing ${spec}…`);
execFileSync('npm', ['install', '--no-save', '--silent', spec], { stdio: 'inherit' });
const updates = 'node_modules/.bin/updates';

const help = (args) => {
  try {
    return execFileSync(updates, [...args, '--help'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch {
    return null;
  }
};

// Subcommands the skill names, e.g. `updates draft`.
const explicit = [...new Set([...source.matchAll(/`updates ([a-z][a-z-]*)/g)].map((m) => m[1]))];

// Plus the shorthand run-on the commands table uses — `updates whoami` /
// `login` / `logout` — where only the first carries the prefix. Reading just
// the prefixed form meant a removed `logout` was invisible.
const tableShorthand = new Set();
for (const row of source.split('\n').filter((l) => /^\|\s*`updates /.test(l))) {
  const cell = row.split('|')[1] ?? '';
  for (const m of cell.matchAll(/`(?:updates )?([a-z][a-z-]*)[^`]*`/g)) tableShorthand.add(m[1]);
}
const commands = [...new Set([...explicit, ...tableShorthand])];

const globalHelp = help([]) ?? '';

// Existence is read off the root help's Commands block, not off an exit code:
// `updates <anything> --help` short-circuits to the root help and exits 0, so
// a bad subcommand looks healthy. This was found by negative-testing the
// check itself, which is the only way that kind of hole shows up.
const listed = new Set(
  (globalHelp.match(/\nCommands\n([\s\S]*?)\n\n/)?.[1] ?? '')
    .split('\n')
    .map((line) => line.trim().split(/\s+/)[0])
    .filter(Boolean),
);
if (!listed.size) fail('could not read the command list out of `updates --help`');

const perCommand = new Map();
for (const cmd of commands) {
  if (!listed.has(cmd)) {
    fail(`SKILL.md documents \`updates ${cmd}\`, which the CLI does not have`);
    continue;
  }
  const out = help([cmd]);
  // Unreadable help is a failure, not something to drop quietly: skipping it
  // silently disables every flag check that depends on that command.
  if (out === null) fail(`\`updates ${cmd} --help\` could not be read; its flags went unchecked`);
  else perCommand.set(cmd, out);
}
if (perCommand.size === commands.length) ok(`all ${commands.length} documented commands exist`);

// Every documented flag must exist on the command the skill uses it with.
//
// A single combined haystack was not enough: a flag dropped from `draft` but
// still present on `upload` would pass, while the skill's own recipe had gone
// stale. Attribution comes from the document — a code line's flags belong to
// the command it invokes, and a prose paragraph's flags belong to whichever
// commands that paragraph names.
const OTHER_TOOLS = /\b(git|jq|npm|npx|cat|curl|echo|tar)\b/;
const flagsIn = (text) =>
  [...new Set([...text.matchAll(/(?<![\w-])(--[a-z][a-z-]+)/g)].map((m) => m[1]))];

/** flag -> Set of commands it is documented against ('' = global/unattributed) */
const attributed = new Map();
const attribute = (flag, cmd) => {
  if (!attributed.has(flag)) attributed.set(flag, new Set());
  attributed.get(flag).add(cmd);
};

// Code lines: `updates <cmd> … --flag` attributes to that command.
const codeInvocations = [...source.matchAll(/^\s*(?:\w+=\$\()?updates\s+([a-z][a-z-]*)([^\n]*)$/gm)];
for (const [, cmd, rest] of codeInvocations) {
  if (!listed.has(cmd)) continue;
  for (const f of flagsIn(rest)) attribute(f, cmd);
}

// Prose: each markdown table ROW is its own scope, not the whole table. The
// commands table names every command and `--status` in one block, so treating
// it as a paragraph attributed --status to all thirteen.
const units = [];
for (const para of source.split(/\n\s*\n/)) {
  const rows = para.split('\n').filter((l) => l.trim().startsWith('|'));
  if (rows.length) units.push(...rows);
  else units.push(para);
}
for (const para of units) {
  if (OTHER_TOOLS.test(para) && !/\bupdates\b/.test(para)) continue;
  const flags = flagsIn(para);
  if (!flags.length) continue;
  const named = [...listed].filter((c) => new RegExp(`\`(?:updates )?${c}\``).test(para));
  for (const f of flags) {
    if (named.length) named.forEach((c) => attribute(f, c));
    else attribute(f, '');
  }
}

const globalFlags = new Set(flagsIn(globalHelp));
const mismatches = [];
for (const [flag, cmds] of attributed) {
  if (globalFlags.has(flag)) continue;
  for (const cmd of cmds) {
    if (cmd === '') {
      // Unattributed: must exist somewhere, which is the weaker old check.
      const anywhere = [...perCommand.values()].some((h) => new RegExp(`${flag}(?![a-z-])`).test(h));
      if (!anywhere) mismatches.push(`${flag} (documented, exists on no command)`);
    } else {
      const help = perCommand.get(cmd);
      if (help && !new RegExp(`${flag}(?![a-z-])`).test(help)) {
        mismatches.push(`\`updates ${cmd} ${flag}\` — that command has no such flag`);
      }
    }
  }
}
if (mismatches.length) {
  fail(`SKILL.md pairs flags with commands that do not accept them:\n` +
    mismatches.map((m) => `         ${m}`).join('\n'));
} else {
  ok(`all ${attributed.size} documented flags exist on the commands they are used with`);
}

// ----------------------------------------------------------------------- done
console.log('');
if (failures.length) {
  for (const f of failures) console.error(`  FAIL ${f}`);
  console.error(`\n${failures.length} problem(s). If the CLI changed deliberately, update ${SKILL} to match.`);
  process.exit(1);
}
console.log(`${SKILL} matches ${spec}.`);
