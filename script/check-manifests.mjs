#!/usr/bin/env node
/**
 * The three manifests describe one plugin in three schemas. AGENTS.md says the
 * shared facts stay in sync and the shapes deliberately do not — this asserts
 * both halves, because a drifted version or a `$schema` in the Codex manifest
 * are each invisible until an install fails somewhere nobody is looking.
 */
import { readFileSync } from 'node:fs';

const failures = [];
const fail = (m) => failures.push(m);
const ok = (m) => console.log(`  ok   ${m}`);
const read = (p) => JSON.parse(readFileSync(p, 'utf8'));

const portable = read('plugin.json');
const codex = read('.codex-plugin/plugin.json');
const claude = read('.claude-plugin/plugin.json');
const market = read('.claude-plugin/marketplace.json');

const SHARED = ['name', 'version', 'description', 'homepage', 'repository', 'license'];
for (const key of SHARED) {
  const values = new Map([['plugin.json', portable[key]], ['.codex-plugin/plugin.json', codex[key]], ['.claude-plugin/plugin.json', claude[key]]]);
  const distinct = new Set([...values.values()].map((v) => JSON.stringify(v)));
  if (distinct.size !== 1) {
    fail(`\`${key}\` differs across manifests: ` +
      [...values].map(([f, v]) => `${f}=${JSON.stringify(v)}`).join(' '));
  }
}
if (!failures.length) ok(`shared facts identical across three manifests (${SHARED.join(', ')})`);

// Agent Plugins 1.0: closed schema, ten permitted top-level fields.
const PORTABLE_ALLOWED = new Set(['$schema', 'name', 'version', 'description', 'author', 'homepage', 'repository', 'license', 'keywords', 'extensions']);
const portableExtra = Object.keys(portable).filter((k) => !PORTABLE_ALLOWED.has(k));
if (portableExtra.length) fail(`plugin.json has fields outside the Agent Plugins 1.0 closed schema: ${portableExtra.join(', ')}`);
else ok('plugin.json conforms to the closed schema');

if (portable.$schema !== 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json') {
  fail('plugin.json $schema is not the canonical Agent Plugins 1.0 identifier');
} else ok('plugin.json declares the canonical $schema');

// Codex native: rejects unsupported fields, requires an interface block.
if ('$schema' in codex) fail('.codex-plugin/plugin.json contains $schema, which Codex’s validator rejects');
else ok('.codex-plugin/plugin.json has no $schema');
if ('hooks' in codex) fail('.codex-plugin/plugin.json contains `hooks`, which Codex rejects');
for (const key of ['displayName', 'category', 'capabilities']) {
  if (!codex.interface?.[key]) fail(`.codex-plugin/plugin.json is missing required interface.${key}`);
}
if (!/^\d+\.\d+\.\d+$/.test(codex.version ?? '')) fail('.codex-plugin/plugin.json version is not strict semver');
for (const key of ['websiteURL', 'privacyPolicyURL', 'termsOfServiceURL']) {
  const v = codex.interface?.[key];
  if (v !== undefined && !v.startsWith('https://')) fail(`.codex-plugin/plugin.json interface.${key} must be an absolute https URL`);
}
const prompts = codex.interface?.defaultPrompt ?? [];
if (prompts.length > 3) fail('.codex-plugin/plugin.json defaultPrompt has more than 3 entries; the rest are dropped silently');
if (prompts.some((p) => p.length > 128)) fail('.codex-plugin/plugin.json has a defaultPrompt entry over 128 chars');
if (!failures.some((f) => f.includes('.codex-plugin'))) ok('.codex-plugin/plugin.json satisfies the native schema');

// The plugin name is immutable once published; assert every copy agrees.
const names = new Set([portable.name, codex.name, claude.name, market.plugins?.[0]?.name]);
if (names.size !== 1) fail(`plugin name is not the same everywhere: ${[...names].join(', ')}`);
else ok(`plugin name "${portable.name}" consistent, including the marketplace entry`);

console.log('');
if (failures.length) {
  for (const f of failures) console.error(`  FAIL ${f}`);
  process.exit(1);
}
console.log('Manifests agree on the facts and differ only where they must.');
