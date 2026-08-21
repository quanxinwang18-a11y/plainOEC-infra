import assert from 'node:assert/strict';
import { mkdtemp, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  assertOAuthState,
  AuthManager,
  buildAuthorizationUrl,
  generatePkcePair,
  loadToken,
  originFor,
  saveToken,
  tokenFile,
} from '../auth.mjs';

test('Pipeline PKCE uses S256 and origins are fixed to dev and test', () => {
  const { verifier, challenge } = generatePkcePair();
  assert.ok(verifier.length >= 43);
  assert.match(challenge, /^[A-Za-z0-9_-]+$/);
  const url = new URL(buildAuthorizationUrl({ environment: 'test', challenge, state: 'state-1' }));
  assert.equal(url.origin, 'https://one-test.iflytek.com');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('state'), 'state-1');
  assert.equal(originFor('dev'), 'https://one-dev.iflytek.com');
  assert.throws(() => originFor('prod'), /dev or test/);
  assert.doesNotThrow(() => assertOAuthState('expected', 'expected'));
  assert.throws(() => assertOAuthState('expected', 'wrong'), /state mismatch/);
});

test('Pipeline dev and test tokens are isolated and mode 0600', async () => {
  const dataDirectory = await mkdtemp(join(tmpdir(), 'oec-pipeline-auth-'));
  await saveToken('dev', { access_token: 'dev-token', expires_in: 3600 }, dataDirectory, 1000);
  await saveToken('test', { access_token: 'test-token', expires_in: 3600 }, dataDirectory, 1000);
  assert.equal((await loadToken('dev', dataDirectory)).access_token, 'dev-token');
  assert.equal((await loadToken('test', dataDirectory)).access_token, 'test-token');
  assert.notEqual(tokenFile('dev', dataDirectory), tokenFile('test', dataDirectory));
  assert.equal((await stat(tokenFile('dev', dataDirectory))).mode & 0o777, 0o600);
});

test('a rejected injected Pipeline token never enters OAuth recovery', async () => {
  const previous = process.env.SKILL_ACCESS_TOKEN;
  process.env.SKILL_ACCESS_TOKEN = 'injected-token';
  let authorizations = 0;
  const manager = new AuthManager({
    authorizeFn: async () => { authorizations += 1; return { access_token: 'unexpected' }; },
  });
  try {
    assert.deepEqual(await manager.getAccessToken('dev'), { token: 'injected-token', source: 'env' });
    await assert.rejects(manager.recoverAfter401('dev', 'env'), /replace SKILL_ACCESS_TOKEN/);
    assert.equal(authorizations, 0);
  } finally {
    if (previous === undefined) delete process.env.SKILL_ACCESS_TOKEN;
    else process.env.SKILL_ACCESS_TOKEN = previous;
  }
});
