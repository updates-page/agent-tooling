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

// Every fact AGENTS.md says stays in sync — author and keywords included.
// A description that matches while the author differs is still divergent
// metadata shipped under one plugin identity.
const SHARED = ['name', 'version', 'description', 'author', 'homepage', 'repository', 'license', 'keywords'];
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
// Codex's validator "rejects unsupported manifest fields", so an allow-list is
// the only correct shape — naming $schema and hooks individually would pass
// anything else somebody adds next.
const CODEX_ALLOWED = new Set(['name', 'version', 'description', 'author', 'homepage',
  'repository', 'license', 'keywords', 'skills', 'mcpServers', 'apps', 'interface']);
const CODEX_INTERFACE_ALLOWED = new Set(['displayName', 'shortDescription', 'longDescription',
  'developerName', 'category', 'capabilities', 'websiteURL', 'privacyPolicyURL',
  'termsOfServiceURL', 'defaultPrompt', 'brandColor', 'composerIcon', 'logo', 'logoDark',
  'screenshots']);

const codexExtra = Object.keys(codex).filter((k) => !CODEX_ALLOWED.has(k));
if (codexExtra.length) {
  fail(`.codex-plugin/plugin.json has fields Codex's validator rejects: ${codexExtra.join(', ')}` +
       (codexExtra.includes('hooks') ? ' (hooks is documented but rejected)' : ''));
} else ok('.codex-plugin/plugin.json top-level fields are all supported');

const ifaceExtra = Object.keys(codex.interface ?? {}).filter((k) => !CODEX_INTERFACE_ALLOWED.has(k));
if (ifaceExtra.length) fail(`.codex-plugin/plugin.json interface has unsupported fields: ${ifaceExtra.join(', ')}`);
for (const key of ['displayName', 'category', 'capabilities']) {
  if (!codex.interface?.[key]) fail(`.codex-plugin/plugin.json is missing required interface.${key}`);
}
if (!/^\d+\.\d+\.\d+$/.test(codex.version ?? '')) fail('.codex-plugin/plugin.json version is not strict semver');
for (const key of ['websiteURL', 'privacyPolicyURL', 'termsOfServiceURL']) {
  const v = codex.interface?.[key];
  if (v === undefined) continue;
  // Parsed, not prefix-matched: "https://" and "https://not a host" both pass
  // a startsWith check and are not absolute URLs.
  let url;
  try { url = new URL(v); } catch { url = null; }
  if (!url || url.protocol !== 'https:' || !url.hostname || !url.hostname.includes('.')) {
    fail(`.codex-plugin/plugin.json interface.${key} is not a valid absolute https URL: ${JSON.stringify(v)}`);
  }
}
const prompts = codex.interface?.defaultPrompt ?? [];
if (prompts.length > 3) fail('.codex-plugin/plugin.json defaultPrompt has more than 3 entries; the rest are dropped silently');
if (prompts.some((p) => p.length > 128)) fail('.codex-plugin/plugin.json has a defaultPrompt entry over 128 chars');
if (!failures.some((f) => f.includes('.codex-plugin'))) ok('.codex-plugin/plugin.json satisfies the native schema');

// The plugin name is immutable once published, so agreement is not the test —
// a coordinated rename agrees with itself and still orphans every install.
// It is checked against the literal.
const PLUGIN_NAME = 'updates-page';
const names = { 'plugin.json': portable.name, '.codex-plugin/plugin.json': codex.name,
                '.claude-plugin/plugin.json': claude.name,
                '.claude-plugin/marketplace.json': market.plugins?.[0]?.name };
const wrong = Object.entries(names).filter(([, v]) => v !== PLUGIN_NAME);
if (wrong.length) {
  fail(`the plugin name is immutable and must stay "${PLUGIN_NAME}": ` +
    wrong.map(([f, v]) => `${f}=${JSON.stringify(v)}`).join(' '));
} else {
  ok(`plugin name "${PLUGIN_NAME}" everywhere, including the marketplace entry`);
}
if (market.name !== PLUGIN_NAME) fail(`marketplace name is "${market.name}", expected "${PLUGIN_NAME}"`);

console.log('');
if (failures.length) {
  for (const f of failures) console.error(`  FAIL ${f}`);
  process.exit(1);
}
console.log('Manifests agree on the facts and differ only where they must.');
