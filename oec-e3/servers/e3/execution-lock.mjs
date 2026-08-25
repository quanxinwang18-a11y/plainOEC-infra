import { createHash } from 'node:crypto';
import { mkdir, open, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';

function lockKey(identity) {
  return createHash('sha256').update(identity).digest('hex');
}

export async function acquireExecutionLock(pluginRoot, identity) {
  const path = join(pluginRoot, 'execution-locks', `${lockKey(identity)}.lock`);
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  let handle;
  try {
    handle = await open(path, 'wx', 0o600);
    await handle.writeFile(`${JSON.stringify({ pid: process.pid, claimedAt: Date.now() })}\n`);
    await handle.close();
  } catch (error) {
    if (handle) await handle.close().catch(() => {});
    if (error.code === 'EEXIST') return null;
    throw error;
  }
  return async () => {
    try {
      await unlink(path);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  };
}
