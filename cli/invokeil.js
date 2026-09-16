#!/usr/bin/env node
/**
 * Invokeil Pay CLI — zero-dependency developer companion (node:http / node:https only).
 *
 *   node invokeil.js --help
 *   node invokeil.js listen 9876                 # webhook listener (env INVOKEIL_TARGET, INVOKEIL_SECRET)
 *   node invokeil.js api GET /api/v1/checkout/abc --key sk_live_xxx --base https://pay.example.com
 *   node invokeil.js api POST /api/v1/checkout --key sk_live_xxx --data '{"amount":500}'
 *   node invokeil.js trigger checkout.paid       # POST /api/admin/dev/webhook-simulate
 *   node invokeil.js replay <deliveryId>         # POST /api/admin/dev/webhook-replay
 *
 * Environment variables:
 *   INVOKEIL_BASE_URL   default --base
 *   INVOKEIL_API_KEY    default --key
 *   INVOKEIL_COOKIE     default --cookie (session cookie for /api/admin/* endpoints)
 *   INVOKEIL_TARGET     `listen` forward target, e.g. https://pay.example.com/webhooks
 *   INVOKEIL_SECRET     `listen` webhook secret — enables signature verification display
 */
'use strict';

const http = require('http');
const https = require('https');
const { URL } = require('url');

// ── helpers ─────────────────────────────────────────────────────────────────

const C = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
};

function help() {
  console.log(`${C.bold('invokeil')} — Invokeil Pay developer CLI

${C.bold('USAGE')}
  invokeil listen <localPort> [options]          Start a local webhook listener
  invokeil api <METHOD> <path> [options]         Call any Invokeil Pay endpoint
  invokeil trigger <event> [options]             POST /api/admin/dev/webhook-simulate
  invokeil replay <deliveryId> [options]         POST /api/admin/dev/webhook-replay

${C.bold('OPTIONS')}
  --base <url>      Instance base URL (env INVOKEIL_BASE_URL)
  --key <sk_...>    API key, sent as Authorization: Bearer (env INVOKEIL_API_KEY)
  --cookie <c>      Session cookie string for /api/admin/* (env INVOKEIL_COOKIE)
  --data '<json>'   JSON request body
  --quiet           Print only the response body
  -h, --help        Show this help

${C.bold('LISTEN (webhook debugging)')}
  Starts an HTTP server on <localPort>, prints every incoming webhook
  (headers, body, signature check) and forwards it to env INVOKEIL_TARGET.
    INVOKEIL_TARGET=https://pay.example.com  \\
    INVOKEIL_SECRET=whsec_xxx                 \\
    invokeil listen 9876
  Point your store's webhook URL at http://your-lan-ip:9876 while developing.

${C.bold('EVENTS for trigger')}
  checkout.paid | checkout.created | checkout.cancelled | invoice.paid |
  payment_link.paid | transaction.matched | transaction.reversed |
  device.online | test

${C.bold('EXAMPLES')}
  invokeil api POST /api/v1/checkout --key sk_live_xxx \\
      --data '{"amount":500,"customer_mobile":"01712345678"}'
  invokeil trigger checkout.paid --cookie "ilp_session=..."
  invokeil replay clx1234567890abcdef`);
}

/** Parse `--flag value` pairs and positional args (no deps). */
function parseArgv(argv) {
  const args = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') { args.flags.help = true; continue; }
    if (a === '--quiet') { args.flags.quiet = true; continue; }
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) { args.flags[key] = next; i++; }
      else args.flags[key] = true;
    } else {
      args._.push(a);
    }
  }
  return args;
}

function cfgOf(args) {
  return {
    base: (args.flags.base || process.env.INVOKEIL_BASE_URL || 'http://localhost:3000').replace(/\/+$/, ''),
    key: args.flags.key || process.env.INVOKEIL_API_KEY || '',
    cookie: args.flags.cookie || process.env.INVOKEIL_COOKIE || '',
  };
}

/** Minimal HTTP request via node:http / node:https. Returns {status, body}. */
function request(method, urlStr, headers, body) {
  return new Promise((resolve, reject) => {
    let u;
    try { u = new URL(urlStr); } catch (e) { return reject(new Error(`Invalid URL: ${urlStr}`)); }
    const mod = u.protocol === 'https:' ? https : http;
    const req = mod.request(u, { method, headers }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.setTimeout(20000, () => req.destroy(new Error('Request timed out')));
    if (body !== undefined) req.write(body);
    req.end();
  });
}

function pretty(json, fallback) {
  try { return JSON.stringify(JSON.parse(json), null, 2); } catch (e) { return fallback != null ? fallback : json; }
}

async function callApi(args, method, path, bodyOverride) {
  const cfg = cfgOf(args);
  const headers = { Accept: 'application/json' };
  if (cfg.key) headers.Authorization = `Bearer ${cfg.key}`;
  if (cfg.cookie) headers.Cookie = cfg.cookie;
  let body;
  if (bodyOverride !== undefined) {
    body = bodyOverride;
    headers['Content-Type'] = 'application/json';
  } else if (args.flags.data) {
    body = args.flags.data;
    try { JSON.parse(body); } catch (e) { return fail('--data must be valid JSON'); }
    headers['Content-Type'] = 'application/json';
  }
  if (!args.flags.quiet) {
    console.error(C.dim(`→ ${method} ${cfg.base}${path}`));
  }
  try {
    const res = await request(method, cfg.base + path, headers, body);
    const ok = res.status < 400;
    if (!args.flags.quiet) {
      console.error(ok ? C.green(`← ${res.status}`) : C.red(`← ${res.status}`));
    }
    console.log(pretty(res.body));
    process.exitCode = ok ? 0 : 1;
  } catch (e) {
    return fail(e.message);
  }
}

function fail(msg) {
  console.error(C.red(`error: ${msg}`));
  process.exitCode = 1;
}

// ── commands ────────────────────────────────────────────────────────────────

/** `listen <localPort>` — webhook printer + forwarder. */
function cmdListen(args) {
  const port = parseInt(args._[1], 10);
  if (!Number.isFinite(port) || port <= 0) return fail('usage: invokeil listen <localPort>');
  const target = (process.env.INVOKEIL_TARGET || '').replace(/\/+$/, '');
  const secret = process.env.INVOKEIL_SECRET || '';

  const server = http.createServer((req, res) => {
    let chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', async () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      const sig = req.headers['x-invokeil-signature'] || '';
      const event = req.headers['x-invokeil-event'] || '(none)';
      const line = '─'.repeat(58);
      console.log(`\n${C.cyan(line)}`);
      console.log(`${C.bold('← webhook')} ${req.method} ${req.url}  ${C.dim(new Date().toISOString())}`);
      console.log(`${C.bold('  event:')} ${event}`);
      console.log(`${C.bold('  signature:')} ${sig || C.yellow('(missing)')}`);
      if (secret && sig) {
        const ok = verifySignature(raw, sig, secret);
        console.log(`${C.bold('  verify:')} ${ok ? C.green('VALID') : C.red('INVALID')}`);
      } else if (!secret) {
        console.log(`${C.bold('  verify:')} ${C.dim('skipped (INVOKEIL_SECRET not set)')}`);
      }
      console.log(`${C.bold('  body:')} ${pretty(raw, raw)}`);
      if (!target) {
        console.log(C.yellow('  (no INVOKEIL_TARGET set — not forwarding)'));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"ok":true,"forwarded":false}');
        return;
      }
      const fwdHeaders = { ...req.headers };
      delete fwdHeaders.host;
      delete fwdHeaders['content-length'];
      fwdHeaders['content-length'] = Buffer.byteLength(raw);
      try {
        const out = await request(req.method, target + req.url, fwdHeaders, raw);
        console.log(`${C.bold('  forward:')} ${out.status === 200 ? C.green(out.status) : C.red(out.status)} ${C.dim('→ ' + target + req.url)}`);
        res.writeHead(out.status, { 'Content-Type': 'application/json' });
        res.end(out.body);
      } catch (e) {
        console.log(`${C.bold('  forward:')} ${C.red('FAILED')} ${C.dim(e.message)}`);
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end('{"ok":false,"error":"forward failed"}');
      }
    });
  });

  server.listen(port, () => {
    console.log(`${C.bold('invokeil listener')} on ${C.cyan('http://0.0.0.0:' + port)}`);
    console.log(C.dim(`  forward target: ${target || '(unset — INVOKEIL_TARGET env)'}`));
    console.log(C.dim(`  secret verify:  ${secret ? 'enabled' : 'disabled (INVOKEIL_SECRET env)'}`));
    console.log(C.dim('  Ctrl+C to stop. Point your webhook URL here.'));
  });
}

/** Copy of the server scheme: t=<ms>,v1=hex(hmac_sha256(secret,"<t>.<body>")). */
function verifySignature(rawBody, header, secret) {
  let t, v1;
  for (const kv of String(header).split(',')) {
    const i = kv.indexOf('=');
    if (i > 0) {
      const k = kv.slice(0, i).trim();
      if (k === 't') t = kv.slice(i + 1).trim();
      if (k === 'v1') v1 = kv.slice(i + 1).trim();
    }
  }
  if (!t || !v1) return false;
  if (Math.abs(Date.now() - Number(t)) > 300000) return false;
  const crypto = require('crypto');
  const expected = crypto.createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex');
  if (expected.length !== v1.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(v1));
}

/** `api <METHOD> <path>` */
function cmdApi(args) {
  const method = (args._[1] || '').toUpperCase();
  const path = args._[2] || '';
  if (!method || !path) return fail('usage: invokeil api <METHOD> <path> [options]');
  if (!/^https?:\/\/|^\/.*/.test(path) && !path.startsWith('/')) return fail('path must start with /');
  return callApi(args, method, path);
}

/** `trigger <event>` — webhook simulator. */
function cmdTrigger(args) {
  const event = args._[1];
  if (!event) return fail('usage: invokeil trigger <event> [--data \'{"...":"custom payload"}\']');
  const body = { event };
  if (args.flags.data) {
    try { body.payload = JSON.parse(args.flags.data); } catch (e) { return fail('--data must be valid JSON'); }
  }
  return callApi(args, 'POST', '/api/admin/dev/webhook-simulate', JSON.stringify(body));
}

/** `replay <deliveryId>` — webhook replay. */
function cmdReplay(args) {
  const id = args._[1];
  if (!id) return fail('usage: invokeil replay <deliveryId>');
  return callApi(args, 'POST', '/api/admin/dev/webhook-replay', JSON.stringify({ id }));
}

// ── main ────────────────────────────────────────────────────────────────────

function main() {
  const args = parseArgv(process.argv.slice(2));
  if (args.flags.help || args._.length === 0) { help(); return; }
  const cmd = args._[0];
  switch (cmd) {
    case 'listen': return cmdListen(args);
    case 'api': return cmdApi(args);
    case 'trigger': return cmdTrigger(args);
    case 'replay': return cmdReplay(args);
    default:
      fail(`unknown command '${cmd}' — try --help`);
  }
}

main();
