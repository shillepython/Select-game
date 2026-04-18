const fs = require('fs');
const path = require('path');

const restUrl = process.env.UPSTASH_REDIS_REST_URL
  || process.env.KV_REST_API_URL;
const restToken = process.env.UPSTASH_REDIS_REST_TOKEN
  || process.env.KV_REST_API_TOKEN;

const tcpUrl = process.env.UPSTASH_REDIS_REDIS_URL
  || process.env.REDIS_URL
  || process.env.KV_URL;

const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

let mode;
let client = null;

if (restUrl && restToken) {
  const { Redis } = require('@upstash/redis');
  client = new Redis({ url: restUrl, token: restToken });
  mode = 'redis';
} else if (tcpUrl) {
  const IORedis = require('ioredis');
  client = new IORedis(tcpUrl, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: false,
  });
  client.on('error', (e) => console.error('[redis]', e.message));
  mode = 'redis';
} else if (isServerless) {
  mode = 'missing';
} else {
  mode = 'file';
}

class StorageNotConfiguredError extends Error {
  constructor() {
    super('Хранилище не подключено. Добавь Upstash Redis в Vercel и сделай Redeploy.');
    this.code = 'STORAGE_NOT_CONFIGURED';
    this.status = 503;
  }
}

function ensureConfigured() {
  if (mode === 'missing') throw new StorageNotConfiguredError();
}

const DATA_FILE = path.join(process.cwd(), 'data.json');

function readFile() {
  if (!fs.existsSync(DATA_FILE)) return { polls: {}, sessions: {} };
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return { polls: {}, sessions: {} };
  }
}

function writeFile(db) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

function parse(v) {
  if (v == null) return null;
  if (typeof v === 'string') {
    try { return JSON.parse(v); } catch { return null; }
  }
  return v;
}

module.exports = {
  mode,
  StorageNotConfiguredError,

  async getPoll(id) {
    ensureConfigured();
    if (client) return parse(await client.get(`poll:${id}`));
    return readFile().polls[id] || null;
  },

  async savePoll(poll) {
    ensureConfigured();
    if (client) {
      await client.set(`poll:${poll.id}`, JSON.stringify(poll));
      return;
    }
    const db = readFile();
    db.polls[poll.id] = poll;
    writeFile(db);
  },

  async getSession(id) {
    ensureConfigured();
    if (client) return parse(await client.get(`session:${id}`));
    return readFile().sessions[id] || null;
  },

  async saveSession(session) {
    ensureConfigured();
    if (client) {
      await client.set(`session:${session.id}`, JSON.stringify(session));
      await client.sadd(`poll:${session.pollId}:sessions`, session.id);
      return;
    }
    const db = readFile();
    db.sessions[session.id] = session;
    writeFile(db);
  },

  async listSessions(pollId) {
    ensureConfigured();
    if (client) {
      const ids = await client.smembers(`poll:${pollId}:sessions`);
      if (!ids || ids.length === 0) return [];
      const values = await Promise.all(ids.map(id => client.get(`session:${id}`)));
      return values.map(parse).filter(Boolean);
    }
    const db = readFile();
    return Object.values(db.sessions).filter(s => s.pollId === pollId);
  },
};
