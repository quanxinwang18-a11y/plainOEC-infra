import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  AuthManager,
  assertOAuthState,
  buildAuthorizationUrl,
  generatePkcePair,
  redactSecrets,
  saveToken,
  tokenFile,
} from '../auth.mjs';
import { E3Client } from '../client.mjs';

test('PKCE uses S256 and OAuth callback state is enforced', () => {
  const { verifier, challenge } = generatePkcePair();
  assert.match(verifier, /^[A-Za-z0-9_-]{43,}$/);
  assert.match(challenge, /^[A-Za-z0-9_-]{43}$/);
  const url = new URL(buildAuthorizationUrl({ challenge, state: 'state-value' }));
  assert.equal(url.origin, 'https://one.iflytek.com');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('state'), 'state-value');
  assert.throws(() => assertOAuthState('expected', 'wrong'), /state mismatch/);
});

test('local token cache is mode 0600 and secrets are redacted', async () => {
  const data = await mkdtemp(join(tmpdir(), 'oec-auth-'));
  await saveToken({ access_token: 'access-secret', refresh_token: 'refresh-secret', expires_in: 60 }, data, 0);
  assert.equal((await stat(tokenFile(data))).mode & 0o777, 0o600);
  const cached = JSON.parse(await readFile(tokenFile(data), 'utf8'));
  assert.equal(cached.access_token, 'access-secret');
  const output = redactSecrets({ access_token: 'access-secret', acToken: 'access-secret', refresh_token: 'refresh-secret' }, ['access-secret', 'refresh-secret']);
  assert.doesNotMatch(output, /access-secret|refresh-secret/);
});

test('injected token has priority and is never refreshed after 401', async () => {
  const prior = process.env.SKILL_ACCESS_TOKEN;
  process.env.SKILL_ACCESS_TOKEN = 'injected-secret';
  try {
    const manager = new AuthManager({ dataDirectory: await mkdtemp(join(tmpdir(), 'oec-env-auth-')) });
    assert.deepEqual(await manager.getAccessToken(), { token: 'injected-secret', source: 'env' });
    await assert.rejects(manager.recoverAfter401('env'), /replace SKILL_ACCESS_TOKEN/);
  } finally {
    if (prior === undefined) delete process.env.SKILL_ACCESS_TOKEN;
    else process.env.SKILL_ACCESS_TOKEN = prior;
  }
});

test('expired local token refreshes and preserves a missing replacement refresh token', async () => {
  const prior = process.env.SKILL_ACCESS_TOKEN;
  delete process.env.SKILL_ACCESS_TOKEN;
  const data = await mkdtemp(join(tmpdir(), 'oec-refresh-'));
  try {
    await saveToken({ access_token: 'expired', refresh_token: 'keep-me', expires_in: -1 }, data, 0);
    const calls = [];
    const manager = new AuthManager({
      dataDirectory: data,
      now: () => 10_000,
      fetchFn: async (_url, options) => {
        calls.push(String(options.body));
        return new Response(JSON.stringify({ access_token: 'fresh', expires_in: 3600 }), { status: 200 });
      },
    });
    assert.deepEqual(await manager.getAccessToken(), { token: 'fresh', source: 'local' });
    assert.match(calls[0], /grant_type=refresh_token/);
    const stored = JSON.parse(await readFile(tokenFile(data), 'utf8'));
    assert.equal(stored.refresh_token, 'keep-me');
  } finally {
    if (prior !== undefined) process.env.SKILL_ACCESS_TOKEN = prior;
  }
});

test('client retries one 401 only after local reauthorization', async () => {
  const tokenCalls = [];
  const auth = {
    async getAccessToken() { return { token: 'old', source: 'local' }; },
    async recoverAfter401(source) {
      assert.equal(source, 'local');
      return { token: 'new', source: 'local' };
    },
  };
  const responses = [
    new Response('{}', { status: 401 }),
    new Response(JSON.stringify({ code: '0', data: [] }), { status: 200 }),
  ];
  const client = new E3Client({ auth, fetchFn: async (_url, options) => {
    tokenCalls.push(options.headers.acToken);
    return responses.shift();
  } });
  await client.listSpaces();
  assert.deepEqual(tokenCalls, ['old', 'new']);
});

test('client does not retry a rejected injected token and redacts HTTP failures', async () => {
  let calls = 0;
  const auth = {
    async getAccessToken() { return { token: 'injected-secret', source: 'env' }; },
    async recoverAfter401() { throw new Error('Injected E3 token was rejected; replace SKILL_ACCESS_TOKEN'); },
  };
  const client = new E3Client({ auth, fetchFn: async () => {
    calls += 1;
    return new Response(JSON.stringify({ message: 'injected-secret is invalid' }), { status: 401 });
  } });
  await assert.rejects(client.listSpaces(), /replace SKILL_ACCESS_TOKEN/);
  assert.equal(calls, 1);
});
