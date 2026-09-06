/**
 * Ганяє справжній Chrome через CDP: логінимось, ходимо по сторінках і збираємо
 * помилки консолі. Без CDP «працює/не працює» не відрізнити від 200 OK.
 */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'http://localhost:5173';
const PORT = 9222;

const chrome = spawn(
	CHROME,
	[
		'--headless=new',
		'--disable-gpu',
		`--remote-debugging-port=${PORT}`,
		'--user-data-dir=' + process.env.TEMP + '/chrome-hydrate-check',
		'--no-first-run',
		'--no-default-browser-check',
		'about:blank'
	],
	{ stdio: 'ignore' }
);

async function cdpUrl() {
	for (let i = 0; i < 60; i++) {
		try {
			const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
			return (await res.json()).webSocketDebuggerUrl;
		} catch {
			await sleep(500);
		}
	}
	throw new Error('CDP не піднявся');
}

const ws = new WebSocket(await cdpUrl());
await new Promise((resolve) => ws.addEventListener('open', resolve));

let id = 0;
const pending = new Map();
const events = [];

ws.addEventListener('message', (event) => {
	const msg = JSON.parse(event.data);
	if (msg.id && pending.has(msg.id)) {
		pending.get(msg.id)(msg);
		pending.delete(msg.id);
	} else if (msg.method) {
		events.push(msg);
	}
});

function send(method, params = {}, sessionId) {
	const message = { id: ++id, method, params };
	if (sessionId) message.sessionId = sessionId;
	return new Promise((resolve) => {
		pending.set(message.id, resolve);
		ws.send(JSON.stringify(message));
	});
}

const { result: target } = await send('Target.createTarget', { url: 'about:blank' });
const { result: attached } = await send('Target.attachToTarget', {
	targetId: target.targetId,
	flatten: true
});
const session = attached.sessionId;

await send('Runtime.enable', {}, session);
await send('Log.enable', {}, session);
await send('Page.enable', {}, session);
await send('Network.enable', {}, session);

function drain() {
	const problems = [];
	for (const event of events) {
		if (event.sessionId !== session) continue;
		if (event.method === 'Runtime.exceptionThrown') {
			const d = event.params.exceptionDetails;
			problems.push(`EXCEPTION: ${d.exception?.description ?? d.text}`);
		}
		if (event.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(event.params.type)) {
			const text = event.params.args.map((a) => a.value ?? a.description ?? '').join(' ');
			problems.push(`CONSOLE.${event.params.type}: ${text}`);
		}
		if (event.method === 'Log.entryAdded' && event.params.entry.level === 'error') {
			problems.push(`LOG: ${event.params.entry.text} ${event.params.entry.url ?? ''}`);
		}
		if (event.method === 'Network.loadingFailed') {
			problems.push(`NET FAIL: ${event.params.errorText}`);
		}
	}
	events.length = 0;
	return problems;
}

async function evaluate(expression) {
	const { result } = await send(
		'Runtime.evaluate',
		{ expression, awaitPromise: true, returnByValue: true },
		session
	);
	return result?.result?.value;
}

async function go(path) {
	await send('Page.navigate', { url: BASE + path }, session);
	await sleep(3500);
}

console.log('=== 1. /login ===');
await go('/login');
console.log('problems:', drain());
console.log('hydrated (svelte kit client present):', await evaluate('!!window.__sveltekit_dev'));

console.log('=== 2. sign in via the form ===');
console.log(
	await evaluate(`(async () => {
  const email = document.querySelector('input[type=email]');
  const pass = document.querySelector('input[type=password]');
  if (!email || !pass) return 'FORM NOT FOUND';
  email.value = ${JSON.stringify(process.env.CRM_EMAIL)};
  email.dispatchEvent(new Event('input', { bubbles: true }));
  pass.value = ${JSON.stringify(process.env.CRM_PASSWORD)};
  pass.dispatchEvent(new Event('input', { bubbles: true }));
  document.querySelector('form').requestSubmit();
  return 'submitted';
})()`)
);
await sleep(5000);
console.log('problems:', drain());
console.log('url now:', await evaluate('location.pathname'));

console.log('=== 3. client-side nav to /products (no reload) ===');
await evaluate('window.__navMarker = "kept"');
console.log(
	await evaluate(`(() => {
  const link = [...document.querySelectorAll('a')].find((a) => a.getAttribute('href') === '/products');
  if (!link) return 'NO /products LINK';
  link.click();
  return 'clicked';
})()`)
);
await sleep(3500);
console.log('url now:', await evaluate('location.pathname'));
console.log('marker survived (true = SPA nav, false = full reload):', await evaluate('window.__navMarker === "kept"'));
console.log('problems:', drain());

console.log('=== 4. /products/new ===');
await go('/products/new');
console.log('problems:', drain());
console.log(
	'form controls:',
	await evaluate(
		`JSON.stringify({ inputs: document.querySelectorAll('input').length, buttons: document.querySelectorAll('button').length })`
	)
);

ws.close();
chrome.kill();
process.exit(0);
