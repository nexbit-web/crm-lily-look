/**
 * Non-interactive wrapper around the local shadcn-svelte CLI.
 *
 * The CLI always prompts (overwrite / continue / css updates) and treats a
 * closed stdin as a cancel, so we keep stdin open and answer "y" + Enter for
 * whatever prompt happens to be on screen.
 *
 *   node scripts/shadcn.mjs add button card table
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(root, 'node_modules', 'shadcn-svelte', 'dist', 'index.mjs');

const child = spawn(process.execPath, [cli, ...process.argv.slice(2)], {
	cwd: root,
	stdio: ['pipe', 'pipe', 'pipe']
});

const relay = (chunk) => process.stdout.write(chunk.toString());
child.stdout.on('data', relay);
child.stderr.on('data', relay);

const ticker = setInterval(() => {
	if (child.stdin.writable) child.stdin.write('y\r');
}, 400);

child.on('exit', (code) => {
	clearInterval(ticker);
	child.stdin.end();
	process.stdout.write(`\n[shadcn] exit code: ${code}\n`);
	process.exit(code ?? 1);
});
