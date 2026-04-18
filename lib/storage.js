const fs = require('fs');
const path = require('path');

const url = process.env.UPSTASH_REDIS_REST_URL
  || process.env.KV_REST_API_URL
  || process.env.REDIS_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN
  || process.env.KV_REST_API_TOKEN
  || process.env.REDIS_TOKEN;

const useRedis = Boolean(url && token);
const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

class StorageNotConfiguredError extends Error {
  constructor() {
    super('Хранилище не подключено. Добавь Upstash Redis в Vercel: Storage → Create Database → Upstash for Redis → Connect Project, затем Redeploy.');
    this.code = 'STORAGE_NOT_CONFIGURED';
    this.status = 503;
  }
}

function ensureConfigured() {
  if (!useRedis && isServerless) throw new StorageNotConfiguredError();
}

let redis = null;
if (useRedis) {
  const { Redis } = require('@upstash/redis');
  redis = new Redis({ url, token });
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
  mode: useRedis ? 'redis' : (isServerless ? 'missing' : 'file'),
  StorageNotConfiguredError,

  async getPoll(id) {
    ensureConfigured();
    if (useRedis) return parse(await redis.get(`poll:${id}`));
    return readFile().polls[id] || null;
  },

  async savePoll(poll) {
    ensureConfigured();
    if (useRedis) {
      await redis.set(`poll:${poll.id}`, JSON.stringify(poll));
      return;
    }
    const db = readFile();
    db.polls[poll.id] = poll;
    writeFile(db);
  },

  async getSession(id) {
    ensureConfigured();
    if (useRedis) return parse(await redis.get(`session:${id}`));
    return readFile().sessions[id] || null;
  },

  async saveSession(session) {
    ensureConfigured();
    if (useRedis) {
      await redis.set(`session:${session.id}`, JSON.stringify(session));
      await redis.sadd(`poll:${session.pollId}:sessions`, session.id);
      return;
    }
    const db = readFile();
    db.sessions[session.id] = session;
    writeFile(db);
  },

  async listSessions(pollId) {
    ensureConfigured();
    if (useRedis) {
      const ids = await redis.smembers(`poll:${pollId}:sessions`);
      if (!ids || ids.length === 0) return [];
      const values = await Promise.all(ids.map(id => redis.get(`session:${id}`)));
      return values.map(parse).filter(Boolean);
    }
    const db = readFile();
    return Object.values(db.sessions).filter(s => s.pollId === pollId);
  },
};
