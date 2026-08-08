#!/usr/bin/env node
/**
 * Answers "is anything the API depends on down right now?" without
 * booting the API, which fails at the first bad dependency and tells
 * you about that one only.
 *
 * Reads apps/api/.env, so it reports on whichever profile is active.
 * Every check is a real authenticated round trip: a DNS lookup or an
 * open TCP port proves nothing about whether credentials still work or
 * a free-tier database has been suspended out from under you.
 *
 *   pnpm health
 *
 * Named `health`, not `doctor`: `pnpm doctor` is a built-in pnpm
 * command, so a script by that name is shadowed and never runs.
 *
 * Exit code is 1 if any required dependency is down, so CI can gate on
 * it. Mongo is optional by design (env.ts marks it so) and a Mongo
 * failure is reported as a warning, not an error.
 */

import fs from 'node:fs';
import net from 'node:net';
import tls from 'node:tls';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API = path.join(ROOT, 'apps', 'api');
const TIMEOUT = 8000;

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

const results = [];
const record = (name, state, detail) => {
  results.push({ name, state, detail });
  const color = state === 'up' ? GREEN : state === 'warn' ? YELLOW : RED;
  const label = state === 'up' ? 'UP  ' : state === 'warn' ? 'WARN' : 'DOWN';
  console.log(`  ${color}${label}${RESET}  ${name.padEnd(11)} ${DIM}${detail}${RESET}`);
};

function loadEnv(file) {
  if (!fs.existsSync(file)) return null;
  const out = {};
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#') || !t.includes('=')) continue;
    const i = t.indexOf('=');
    out[t.slice(0, i).trim()] = t
      .slice(i + 1)
      .trim()
      .replace(/^["']|["']$/g, '');
  }
  return out;
}

/** Hostname only, so a password never reaches the terminal or CI logs. */
const where = (url) => {
  try {
    const u = new URL(url);
    return u.hostname + (u.port ? ':' + u.port : '');
  } catch {
    return '(unparseable url)';
  }
};

const ms = (t) => `${Date.now() - t}ms`;

async function checkPostgres(url) {
  const t = Date.now();
  try {
    const { PrismaClient } = await import(
      path.join(API, 'node_modules/@prisma/client/index.js')
    );
    const prisma = new PrismaClient({ datasources: { db: { url } } });
    try {
      const [{ v }] = await prisma.$queryRawUnsafe('select version() as v');
      const [{ n }] = await prisma.$queryRawUnsafe(
        `select count(*)::int as n from information_schema.tables where table_schema = 'public'`,
      );
      // A reachable database with no tables is a different failure from
      // an unreachable one, and the fix (migrate) is different too.
      const applied = await prisma
        .$queryRawUnsafe(
          `select count(*)::int as n from "_prisma_migrations" where finished_at is not null`,
        )
        .then((r) => r[0].n)
        .catch(() => null);
      const onDisk = fs.existsSync(path.join(API, 'prisma/migrations'))
        ? fs
            .readdirSync(path.join(API, 'prisma/migrations'))
            .filter((d) => /^\d{14}_/.test(d)).length
        : null;
      let note = `${v.split(' ').slice(0, 2).join(' ')}, ${n} tables`;
      if (applied !== null && onDisk !== null) {
        note += `, migrations ${applied}/${onDisk}`;
        if (applied < onDisk) {
          record(
            'postgres',
            'warn',
            `${where(url)}  ${note}  <- run: pnpm --filter api exec prisma migrate deploy`,
          );
          return 'warn';
        }
      }
      record('postgres', 'up', `${where(url)}  ${note}  ${ms(t)}`);
      return 'up';
    } finally {
      await prisma.$disconnect();
    }
  } catch (e) {
    record(
      'postgres',
      'down',
      `${where(url)}  ${String(e.message).split('\n')[0].slice(0, 120)}`,
    );
    return 'down';
  }
}

function checkRedis(url) {
  return new Promise((resolve) => {
    const t = Date.now();
    let u;
    try {
      u = new URL(url);
    } catch {
      record('redis', 'down', 'unparseable REDIS_URL');
      return resolve('down');
    }
    const secure = u.protocol === 'rediss:';
    const port = Number(u.port) || 6379;
    const opts = { host: u.hostname, port };
    if (secure) opts.servername = u.hostname;

    const done = (state, detail) => {
      record('redis', state, detail);
      sock.destroy();
      resolve(state);
    };

    const sock = (secure ? tls : net).connect(opts, () => {
      const pass = decodeURIComponent(u.password || '');
      const user = decodeURIComponent(u.username || 'default');
      // AUTH is skipped for a passwordless local container; sending it
      // there returns an error that looks like a real auth failure.
      sock.write((pass ? `AUTH ${user} ${pass}\r\n` : '') + 'PING\r\n');
    });

    let buf = '';
    sock.on('data', (d) => {
      buf += d.toString();
      if (buf.includes('PONG'))
        done('up', `${where(url)}  ${secure ? 'TLS, ' : ''}PING ok  ${ms(t)}`);
      else if (buf.startsWith('-') || buf.includes('\r\n-'))
        done(
          'down',
          `${where(url)}  ${
            buf
              .trim()
              .split('\r\n')
              .find((l) => l.startsWith('-')) || buf.trim()
          }`,
        );
    });
    sock.setTimeout(TIMEOUT, () =>
      done('down', `${where(url)}  timed out after ${TIMEOUT}ms`),
    );
    sock.on('error', (e) => done('down', `${where(url)}  ${e.message}`));
  });
}

async function checkMongo(uri, dbName) {
  const t = Date.now();
  try {
    const { MongoClient } = await import(
      path.join(API, 'node_modules/mongodb/lib/index.js')
    );
    const client = new MongoClient(uri, { serverSelectionTimeoutMS: TIMEOUT });
    try {
      await client.connect();
      await client.db(dbName).admin().ping();
      const count = await client
        .db(dbName)
        .collection('audit_events')
        .estimatedDocumentCount()
        .catch(() => null);
      record(
        'mongo',
        'up',
        `${where(uri)}  db=${dbName}${count === null ? '' : `, ${count} audit events`}  ${ms(t)}`,
      );
      return 'up';
    } finally {
      await client.close().catch(() => {});
    }
  } catch (e) {
    record(
      'mongo',
      'warn',
      `${where(uri)}  ${String(e.message).split('\n')[0].slice(0, 120)}  (optional)`,
    );
    return 'warn';
  }
}

function checkContainers() {
  try {
    const out = execFileSync('docker', ['compose', 'ps', '--format', 'json'], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (!out)
      return console.log(`  ${DIM}no compose containers running (pnpm infra:up)${RESET}`);
    // Compose emits either a JSON array or newline-delimited objects
    // depending on version.
    const rows = out.startsWith('[')
      ? JSON.parse(out)
      : out.split('\n').map((l) => JSON.parse(l));
    for (const r of rows) {
      const healthy = /healthy/.test(r.Health || r.Status || '');
      console.log(
        `  ${healthy ? GREEN + 'UP  ' : YELLOW + 'WARN'}${RESET}  ${String(r.Service).padEnd(11)} ${DIM}${r.Name}  ${r.Status}${RESET}`,
      );
    }
  } catch {
    console.log(`  ${DIM}docker unavailable, skipping container check${RESET}`);
  }
}

const main = async () => {
  const envPath = path.join(API, '.env');
  const env = loadEnv(envPath);
  if (!env) {
    console.error(`no apps/api/.env found. Run ./setup.sh first.`);
    process.exit(1);
  }

  let profile = 'custom';
  for (const p of ['local', 'cloud']) {
    const f = path.join(API, `.env.${p}`);
    if (
      fs.existsSync(f) &&
      fs.readFileSync(f, 'utf8') === fs.readFileSync(envPath, 'utf8')
    )
      profile = p;
  }

  console.log(`\n${DIM}profile:${RESET} ${profile}\n`);

  console.log('containers');
  checkContainers();

  console.log('\ndependencies');
  const states = [];
  states.push(
    env.DATABASE_URL
      ? await checkPostgres(env.DATABASE_URL)
      : record('postgres', 'down', 'DATABASE_URL unset') || 'down',
  );
  states.push(
    env.REDIS_URL
      ? await checkRedis(env.REDIS_URL)
      : record('redis', 'down', 'REDIS_URL unset') || 'down',
  );
  if (env.MONGODB_URI)
    states.push(await checkMongo(env.MONGODB_URI, env.MONGODB_DB || 'enroll_audit'));
  else
    record(
      'mongo',
      'warn',
      'MONGODB_URI unset; audit rows stay in the Postgres outbox (optional)',
    );

  const down = results.filter((r) => r.state === 'down');
  console.log();
  if (down.length) {
    console.log(
      `${RED}${down.length} required dependency down: ${down.map((d) => d.name).join(', ')}${RESET}\n`,
    );
    process.exit(1);
  }
  const warn = results.filter((r) => r.state === 'warn');
  console.log(
    `${GREEN}all required dependencies up${RESET}${warn.length ? `, ${warn.length} warning(s)` : ''}\n`,
  );
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
