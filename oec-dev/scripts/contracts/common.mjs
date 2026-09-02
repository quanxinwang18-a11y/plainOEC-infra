import { lstat, realpath, stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import YAML from 'yaml';

export class ContractError extends Error {
  constructor(code, message, path = undefined) {
    super(message);
    this.name = 'ContractError';
    this.code = code;
    if (path) this.path = path;
  }
}

export function issue(code, path, message, severity = 'error') {
  return { code, path, message, severity };
}

export function toPosix(path) {
  return path.split(sep).join('/');
}

export function isInside(parent, child) {
  const rel = relative(parent, child);
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel));
}

export async function pathExists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

export async function canonicalDirectory(input, code = 'workspace-invalid') {
  if (typeof input !== 'string' || input.trim().length === 0) {
    throw new ContractError(code, 'directory path is required');
  }
  let target;
  try {
    target = await realpath(resolve(input));
    const info = await stat(target);
    if (!info.isDirectory()) throw new Error('not a directory');
  } catch (error) {
    throw new ContractError(code, `directory does not exist or is not a directory: ${input}`);
  }
  return target;
}

export function relativePath(root, input, { allowDot = false } = {}) {
  if (typeof input !== 'string' || input.trim().length === 0) {
    throw new ContractError('path-invalid', 'path must be a non-empty string');
  }
  const value = input.trim();
  if (isAbsolute(value) || /^[A-Za-z]:[\\/]/.test(value)) {
    throw new ContractError('path-invalid', `path must be repository-relative: ${input}`);
  }
  if (value.includes('\\')) {
    throw new ContractError('path-invalid', `path must use POSIX separators: ${input}`);
  }
  if (value.split('/').some((part) => part === '.' || part === '..')) {
    throw new ContractError('path-escape', `path may not contain . or .. segments: ${input}`);
  }
  const lexical = resolve(root, value);
  if (!isInside(root, lexical)) {
    throw new ContractError('path-escape', `path escapes root: ${input}`);
  }
  const normalized = toPosix(relative(root, lexical));
  if (!normalized && !allowDot) throw new ContractError('path-invalid', `path may not be root: ${input}`);
  return normalized || '.';
}

export async function safeExistingFile(root, input, codePrefix = 'path') {
  const normalized = relativePath(root, input);
  const lexical = resolve(root, normalized);
  let info;
  try {
    info = await lstat(lexical);
  } catch (error) {
    if (error.code === 'ENOENT') throw new ContractError(`${codePrefix}-missing`, `file does not exist: ${normalized}`, normalized);
    throw error;
  }
  if (info.isSymbolicLink()) {
    throw new ContractError(`${codePrefix}-symlink`, `symbolic links are not allowed: ${normalized}`, normalized);
  }
  if (!info.isFile()) throw new ContractError(`${codePrefix}-invalid`, `path is not a file: ${normalized}`, normalized);
  const canonical = await realpath(lexical);
  if (!isInside(root, canonical)) {
    throw new ContractError(`${codePrefix}-escape`, `file resolves outside root: ${normalized}`, normalized);
  }
  return { relativePath: normalized, absolutePath: canonical };
}

export function parseFrontmatter(text, path, { required = true } = {}) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  if (!match) {
    if (required) throw new ContractError('frontmatter-missing', 'YAML frontmatter is required', path);
    return { metadata: {}, body: text };
  }
  let metadata;
  try {
    metadata = YAML.parse(match[1]);
  } catch (error) {
    throw new ContractError('frontmatter-invalid', error.message, path);
  }
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    throw new ContractError('frontmatter-invalid', 'frontmatter must be a YAML mapping', path);
  }
  return { metadata, body: text.slice(match[0].length) };
}

export function validateGlob(glob) {
  if (typeof glob !== 'string' || glob.length === 0) return 'glob must be a non-empty string';
  if (isAbsolute(glob) || /^[A-Za-z]:/.test(glob)) return 'glob must be repository-relative';
  if (glob.includes('\\')) return 'glob must use POSIX separators';
  if (glob.startsWith('/') || glob.endsWith('/') || glob.includes('//')) return 'glob has an invalid separator';
  if (!/^[A-Za-z0-9._/*?-]+$/.test(glob)) return 'glob uses unsupported syntax';
  if (glob.split('/').some((part) => part === '.' || part === '..')) return 'glob may not contain . or .. segments';
  return null;
}

export function globToRegExp(glob) {
  let pattern = '^';
  for (let index = 0; index < glob.length; index += 1) {
    const character = glob[index];
    if (character === '*') {
      if (glob[index + 1] === '*') {
        index += 1;
        if (glob[index + 1] === '/') {
          index += 1;
          pattern += '(?:.*/)?';
        } else {
          pattern += '.*';
        }
      } else {
        pattern += '[^/]*';
      }
    } else if (character === '?') {
      pattern += '[^/]';
    } else {
      pattern += character.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`${pattern}$`);
}

export function stringList(value, field, { required = false, pattern } = {}) {
  if (value === undefined && !required) return [];
  if (!Array.isArray(value) || (required && value.length === 0) || value.some((item) => typeof item !== 'string' || item.trim() === '')) {
    throw new ContractError('field-invalid', `${field} must be ${required ? 'a non-empty' : 'an'} array of strings`);
  }
  if (pattern) {
    for (const item of value) {
      if (!pattern.test(item)) throw new ContractError('field-invalid', `${field} contains invalid value: ${item}`);
    }
  }
  return value;
}

export function sectionBody(body, names) {
  const wanted = new Set(names.map((name) => name.toLowerCase()));
  const headings = [...body.matchAll(/^(#{1,6})\s+(.+?)\s*#*\s*$/gm)];
  for (let index = 0; index < headings.length; index += 1) {
    const heading = headings[index];
    if (!wanted.has(heading[2].trim().toLowerCase())) continue;
    const level = heading[1].length;
    const nextPeer = headings.slice(index + 1).find((candidate) => candidate[1].length <= level);
    const start = heading.index + heading[0].length;
    const end = nextPeer?.index ?? body.length;
    return body.slice(start, end).trim();
  }
  return null;
}

export function hasPlaceholder(text) {
  return /\{\{[^}]+\}\}|<\s*(?:placeholder|title|description|path|fill)[^>]*>|\b(?:TODO|TBD)\b|待补充/i.test(text);
}
