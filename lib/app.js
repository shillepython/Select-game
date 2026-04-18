const express = require('express');
const path = require('path');
const crypto = require('crypto');
const storage = require('./storage');

const MAX_CHOICES = 2;

function genId(len = 8) {
  return crypto.randomBytes(len).toString('base64url').slice(0, len);
}

function normalizeGames(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const g of raw) {
    if (typeof g !== 'string') continue;
    const t = g.trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length >= 200) break;
  }
  return out;
}

function publicSession(session, poll) {
  const voters = Object.values(session.votes);
  const bothVoted = voters.length >= 2;
  let matches = [];
  if (bothVoted) {
    const [a, b] = voters;
    const setB = new Set(b.choices);
    matches = a.choices.filter(g => setB.has(g));
  }
  return {
    sessionId: session.id,
    pollId: session.pollId,
    pollTitle: poll.title,
    games: poll.games,
    maxChoices: MAX_CHOICES,
    voters: voters.map(v => ({ name: v.name, votedAt: v.votedAt })),
    votes: bothVoted ? voters.map(v => ({ name: v.name, choices: v.choices })) : null,
    matches: bothVoted ? matches : null,
    bothVoted,
    createdAt: session.createdAt,
  };
}

function createApp() {
  const app = express();
  app.use(express.json({ limit: '100kb' }));

  const publicDir = path.join(__dirname, '..', 'public');
  app.use(express.static(publicDir));

  app.post('/api/polls', async (req, res, next) => {
    try {
      const { title, games } = req.body || {};
      const cleanGames = normalizeGames(games);
      if (cleanGames.length < 2) {
        return res.status(400).json({ error: 'Укажи минимум 2 игры' });
      }
      const cleanTitle = typeof title === 'string' && title.trim()
        ? title.trim().slice(0, 120)
        : 'Опросник';
      const id = genId(8);
      await storage.savePoll({
        id,
        title: cleanTitle,
        games: cleanGames,
        createdAt: Date.now(),
      });
      res.json({ pollId: id });
    } catch (e) { next(e); }
  });

  app.get('/api/polls/:id', async (req, res, next) => {
    try {
      const poll = await storage.getPoll(req.params.id);
      if (!poll) return res.status(404).json({ error: 'Опросник не найден' });
      const all = await storage.listSessions(poll.id);
      const sessions = all
        .sort((a, b) => b.createdAt - a.createdAt)
        .map(s => ({
          id: s.id,
          createdAt: s.createdAt,
          voterCount: Object.keys(s.votes || {}).length,
          bothVoted: Object.keys(s.votes || {}).length >= 2,
        }));
      res.json({ poll, sessions });
    } catch (e) { next(e); }
  });

  app.post('/api/polls/:id/sessions', async (req, res, next) => {
    try {
      const poll = await storage.getPoll(req.params.id);
      if (!poll) return res.status(404).json({ error: 'Опросник не найден' });
      const sid = genId(10);
      await storage.saveSession({
        id: sid,
        pollId: poll.id,
        votes: {},
        createdAt: Date.now(),
      });
      res.json({ sessionId: sid });
    } catch (e) { next(e); }
  });

  app.get('/api/sessions/:sid', async (req, res, next) => {
    try {
      const session = await storage.getSession(req.params.sid);
      if (!session) return res.status(404).json({ error: 'Сессия не найдена' });
      const poll = await storage.getPoll(session.pollId);
      if (!poll) return res.status(404).json({ error: 'Опросник удалён' });
      res.json(publicSession(session, poll));
    } catch (e) { next(e); }
  });

  app.post('/api/sessions/:sid/vote', async (req, res, next) => {
    try {
      const { name, choices, voterId } = req.body || {};
      if (typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ error: 'Укажи имя' });
      }
      if (!Array.isArray(choices) || choices.length === 0) {
        return res.status(400).json({ error: 'Выбери хотя бы одну игру' });
      }
      if (choices.length > MAX_CHOICES) {
        return res.status(400).json({ error: `Не более ${MAX_CHOICES} игр` });
      }
      const session = await storage.getSession(req.params.sid);
      if (!session) return res.status(404).json({ error: 'Сессия не найдена' });
      const poll = await storage.getPoll(session.pollId);
      if (!poll) return res.status(404).json({ error: 'Опросник удалён' });

      const gameSet = new Set(poll.games);
      const uniqueChoices = [...new Set(choices)].filter(c => gameSet.has(c));
      if (uniqueChoices.length === 0) {
        return res.status(400).json({ error: 'Выбор не из списка опросника' });
      }
      if (uniqueChoices.length > MAX_CHOICES) {
        return res.status(400).json({ error: `Не более ${MAX_CHOICES} игр` });
      }

      session.votes = session.votes || {};
      let vid = typeof voterId === 'string' && session.votes[voterId] ? voterId : null;
      if (!vid) {
        if (Object.keys(session.votes).length >= 2) {
          return res.status(409).json({ error: 'Оба голоса уже отданы' });
        }
        vid = genId(6);
      }
      session.votes[vid] = {
        id: vid,
        name: name.trim().slice(0, 40),
        choices: uniqueChoices,
        votedAt: Date.now(),
      };
      await storage.saveSession(session);
      res.json({ voterId: vid, session: publicSession(session, poll) });
    } catch (e) { next(e); }
  });

  app.get('/healthz', (req, res) => {
    res.json({ ok: true, storage: storage.mode });
  });

  app.get('*', (req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });

  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  });

  return app;
}

module.exports = { createApp };
