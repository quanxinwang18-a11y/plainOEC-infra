import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { chmod, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { spawn } from 'node:child_process';

export const CLIENT_ID = 'skill-b';
export const CALLBACK_PORT = 18090;
export const CALLBACK_PATH = '/callback';
export const PIPELINE_ORIGINS = Object.freeze({
  dev: 'https://one-dev.iflytek.com',
  test: 'https://one-test.iflytek.com',
});

export function originFor(environment) {
  const origin = PIPELINE_ORIGINS[environment];
  if (!origin) throw new Error('Pipeline environment must be dev or test');
  return origin;
}

function base64Url(value) {
  return Buffer.from(value).toString('base64url');
}

export function generatePkcePair() {
  const verifier = base64Url(randomBytes(64));
  const challenge = base64Url(createHash('sha256').update(verifier, 'ascii').digest());
  return { verifier, challenge };
}

export function buildAuthorizationUrl({ environment, challenge, state }) {
  const url = new URL(`${originFor(environment)}/login/oauth/authorize/`);
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: `http://127.0.0.1:${CALLBACK_PORT}${CALLBACK_PATH}`,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
  }).toString();
  return url.toString();
}

export function assertOAuthState(expected, actual) {
  if (!actual || actual !== expected) throw new Error('OAuth callback state mismatch');
}

function dataRoot(value = process.env.OEC_PLUGIN_DATA) {
  if (!value) throw new Error('OEC_PLUGIN_DATA is not available');
  return resolve(value, 'pipeline');
}

export function tokenFile(environment, dataDirectory) {
  originFor(environment);
  return join(dataRoot(dataDirectory), 'tokens', `skill-b-${environment}.json`);
}

async function atomicWriteJson(path, value, mode = 0o600) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${process.pid}.${randomBytes(8).toString('hex')}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode });
  await chmod(temporary, mode);
  await rename(temporary, path);
  await chmod(path, mode);
}

export async function loadToken(environment, dataDirectory) {
  try {
    return JSON.parse(await readFile(tokenFile(environment, dataDirectory), 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT' || error instanceof SyntaxError) return null;
    throw error;
  }
}

export async function saveToken(environment, token, dataDirectory, now = Date.now()) {
  if (!token?.access_token) throw new Error('OAuth response did not contain an access token');
  const expiresIn = Number(token.expires_in ?? 3600);
  const stored = {
    access_token: token.access_token,
    refresh_token: token.refresh_token,
    token_type: token.token_type ?? 'Bearer',
    expires_in: expiresIn,
    expires_at: now + expiresIn * 1000,
  };
  await atomicWriteJson(tokenFile(environment, dataDirectory), stored);
  return stored;
}

export async function clearToken(environment, dataDirectory) {
  try {
    await unlink(tokenFile(environment, dataDirectory));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

export function redactSecrets(value, knownSecrets = []) {
  let text = typeof value === 'string' ? value : JSON.stringify(value);
  text = text
    .replace(/(Bearer\s+)[A-Za-z0-9._~+\/-]+/gi, '$1[REDACTED]')
    .replace(/("?(?:access_token|refresh_token|authorization)"?\s*[:=]\s*"?)[^"\s,}]+/gi, '$1[REDACTED]');
  for (const secret of knownSecrets.filter(Boolean)) text = text.replaceAll(String(secret), '[REDACTED]');
  return text;
}

async function tokenRequest(environment, body, fetchFn = fetch) {
  const response = await fetchFn(`${originFor(environment)}/login/oauth/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams(body),
  });
  const text = await response.text();
  let result;
  try {
    result = text ? JSON.parse(text) : {};
  } catch {
    result = {};
  }
  if (!response.ok || !result.access_token) throw new Error(`OAuth token exchange failed (HTTP ${response.status})`);
  return result;
}

export function refreshAccessToken(environment, refreshToken, fetchFn = fetch) {
  return tokenRequest(environment, {
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: CLIENT_ID,
  }, fetchFn);
}

function openBrowser(url) {
  const [command, args] = process.platform === 'darwin'
    ? ['open', [url]]
    : process.platform === 'win32'
      ? ['cmd', ['/c', 'start', '', url]]
      : ['xdg-open', [url]];
  const child = spawn(command, args, { detached: true, stdio: 'ignore' });
  child.unref();
}

function waitForOAuthCallback(expectedState, timeoutMs = 120_000) {
  return new Promise((resolvePromise, reject) => {
    let settled = false;
    let timer;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      server.close();
      if (error) reject(error);
      else resolvePromise(result);
    };
    const server = createServer((request, response) => {
      const url = new URL(request.url, `http://127.0.0.1:${CALLBACK_PORT}`);
      if (url.pathname !== CALLBACK_PATH) {
        response.writeHead(404).end('Not found');
        return;
      }
      try {
        if (url.searchParams.get('error')) throw new Error('OAuth authorization was denied');
        assertOAuthState(expectedState, url.searchParams.get('state'));
        const code = url.searchParams.get('code');
        if (!code) throw new Error('OAuth callback did not include an authorization code');
        response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('Authorization complete. You can close this page.');
        finish(null, code);
      } catch (error) {
        response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('Authorization failed. Return to Claude Code for details.');
        finish(error);
      }
    });
    server.on('error', (error) => finish(error));
    server.listen(CALLBACK_PORT, '127.0.0.1');
    timer = setTimeout(() => finish(new Error('OAuth authorization timed out after 120 seconds')), timeoutMs);
  });
}

export async function authorizeWithPkce({ environment, fetchFn = fetch, openBrowserFn = openBrowser } = {}) {
  const { verifier, challenge } = generatePkcePair();
  const state = base64Url(randomBytes(32));
  const callback = waitForOAuthCallback(state);
  openBrowserFn(buildAuthorizationUrl({ environment, challenge, state }));
  const code = await callback;
  return tokenRequest(environment, {
    grant_type: 'authorization_code',
    code,
    code_verifier: verifier,
    client_id: CLIENT_ID,
    redirect_uri: `http://127.0.0.1:${CALLBACK_PORT}${CALLBACK_PATH}`,
  }, fetchFn);
}

export class AuthManager {
  constructor({ dataDirectory, fetchFn = fetch, authorizeFn = authorizeWithPkce, now = () => Date.now() } = {}) {
    this.dataDirectory = dataDirectory;
    this.fetchFn = fetchFn;
    this.authorizeFn = authorizeFn;
    this.now = now;
  }

  async getAccessToken(environment, { forceOAuth = false } = {}) {
    originFor(environment);
    const injected = process.env.SKILL_ACCESS_TOKEN;
    if (injected) return { token: injected, source: 'env' };
    if (!forceOAuth) {
      const cached = await loadToken(environment, this.dataDirectory);
      if (cached?.access_token && Number(cached.expires_at) > this.now() + 30_000) {
        return { token: cached.access_token, source: 'local' };
      }
      if (cached?.refresh_token) {
        try {
          const refreshed = await refreshAccessToken(environment, cached.refresh_token, this.fetchFn);
          if (!refreshed.refresh_token) refreshed.refresh_token = cached.refresh_token;
          const stored = await saveToken(environment, refreshed, this.dataDirectory, this.now());
          return { token: stored.access_token, source: 'local' };
        } catch {
          await clearToken(environment, this.dataDirectory);
        }
      }
    }
    const authorized = await this.authorizeFn({ environment, fetchFn: this.fetchFn });
    const stored = await saveToken(environment, authorized, this.dataDirectory, this.now());
    return { token: stored.access_token, source: 'local' };
  }

  async recoverAfter401(environment, source) {
    if (source === 'env') throw new Error('Injected Pipeline token was rejected; replace SKILL_ACCESS_TOKEN');
    await clearToken(environment, this.dataDirectory);
    return this.getAccessToken(environment, { forceOAuth: true });
  }
}
