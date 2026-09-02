#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import YAML from 'yaml';

export const DEV_AGENT_NAMES = ['change-checker', 'web-evaluator', 'task-implementer', 'task-researcher'];

function parseClaudeAgent(markdown, expectedName) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(markdown);
  if (!match) throw new Error(`agents/${expectedName}.md must have YAML frontmatter`);
  const metadata = YAML.parse(match[1]);
  if (metadata?.name !== expectedName) {
    throw new Error(`agents/${expectedName}.md must declare name: ${expectedName}`);
  }
  if (typeof metadata.description !== 'string' || metadata.description.trim().length === 0) {
    throw new Error(`agents/${expectedName}.md must declare a description`);
  }
  const body = markdown.slice(match[0].length).trim().replace(/^# .*\r?\n\r?\n/, '');
  if (!body) throw new Error(`agents/${expectedName}.md must have instructions`);
  if (body.includes('"""')) {
    throw new Error(`agents/${expectedName}.md cannot contain TOML triple quotes`);
  }
  return {
    description: metadata.description.replace(/\s+/g, ' ').trim(),
    body,
  };
}

export function renderCodexAgent(markdown, name) {
  const { description, body } = parseClaudeAgent(markdown, name);
  return [
    `# Generated from ../../agents/${name}.md. Do not edit directly.`,
    `name = ${JSON.stringify(name)}`,
    `description = ${JSON.stringify(description)}`,
    'sandbox_mode = "workspace-write"',
    '',
    'developer_instructions = """',
    body,
    '"""',
    '',
  ].join('\n');
}

export async function generateDevCodexAgents({ pluginRoot } = {}) {
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const root = pluginRoot ?? resolve(scriptDir, '..', 'oec-dev');
  const destination = resolve(root, '.codex-plugin', 'agents');
  await mkdir(destination, { recursive: true });

  const changed = [];
  for (const name of DEV_AGENT_NAMES) {
    const sourcePath = resolve(root, 'agents', `${name}.md`);
    const destinationPath = resolve(destination, `${name}.toml`);
    const generated = renderCodexAgent(await readFile(sourcePath, 'utf8'), name);
    let existing = null;
    try {
      existing = await readFile(destinationPath, 'utf8');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    if (existing !== generated) {
      await writeFile(destinationPath, generated, 'utf8');
      changed.push(name);
    }
  }
  return changed;
}

const isDirect = process.argv[1]
  && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isDirect) {
  const changed = await generateDevCodexAgents();
  process.stdout.write(`Generated ${DEV_AGENT_NAMES.length} Codex Agents${changed.length ? ` (${changed.join(', ')})` : ' (unchanged)'}\n`);
}
