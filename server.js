const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_FILE = path.join(__dirname, 'data.json');
const PORT = process.env.PORT || 3000;
const MAX_CHOICES = 2;

const app = express();
app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, 'public')));

function loadDb() {
  if (!fs.existsSync(DATA_FILE)) return { polls: {}, sessions: {} };
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return { polls: {}, sessions: {} };
  }
}

function saveDb(db) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

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

app.post('/api/polls', (req, res) => {
  const { title, games } = req.body || {};
  const cleanGames = normalizeGames(games);
  if (cleanGames.length < 2) {
    return res.status(400).json({ error: 'Укажи минимум 2 игры' });
  }
  const cleanTitle = typeof title === 'string' && title.trim()
    ? title.trim().slice(0, 120)
    : 'Опросник';
  const db = loadDb();
  const id = genId(8);
  db.polls[id] = {
    id,
    title: cleanTitle,
    games: cleanGames,
    createdAt: Date.now(),
  };
  saveDb(db);
  res.json({ pollId: id });
});

app.get('/api/polls/:id', (req, res) => {
  const db = loadDb();
  const poll = db.polls[req.params.id];
  if (!poll) return res.status(404).json({ error: 'Опросник не найден' });
  const sessions = Object.values(db.sessions)
    .filter(s => s.pollId === poll.id)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(s => ({
      id: s.id,
      createdAt: s.createdAt,
      voterCount: Object.keys(s.votes).length,
      bothVoted: Object.keys(s.votes).length >= 2,
    }));
  res.json({ poll, sessions });
});

app.post('/api/polls/:id/sessions', (req, res) => {
  const db = loadDb();
  const poll = db.polls[req.params.id];
  if (!poll) return res.status(404).json({ error: 'Опросник не найден' });
  const sid = genId(10);
  db.sessions[sid] = {
    id: sid,
    pollId: poll.id,
    votes: {},
    createdAt: Date.now(),
  };
  saveDb(db);
  res.json({ sessionId: sid });
});

app.get('/api/sessions/:sid', (req, res) => {
  const db = loadDb();
  const session = db.sessions[req.params.sid];
  if (!session) return res.status(404).json({ error: 'Сессия не найдена' });
  const poll = db.polls[session.pollId];
  if (!poll) return res.status(404).json({ error: 'Опросник удалён' });
  res.json(publicSession(session, poll));
});

app.post('/api/sessions/:sid/vote', (req, res) => {
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
  const db = loadDb();
  const session = db.sessions[req.params.sid];
  if (!session) return res.status(404).json({ error: 'Сессия не найдена' });
  const poll = db.polls[session.pollId];
  if (!poll) return res.status(404).json({ error: 'Опросник удалён' });

  const gameSet = new Set(poll.games);
  const uniqueChoices = [...new Set(choices)].filter(c => gameSet.has(c));
  if (uniqueChoices.length === 0) {
    return res.status(400).json({ error: 'Выбор не из списка опросника' });
  }
  if (uniqueChoices.length > MAX_CHOICES) {
    return res.status(400).json({ error: `Не более ${MAX_CHOICES} игр` });
  }

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
  saveDb(db);
  res.json({ voterId: vid, session: publicSession(session, poll) });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Select-game on http://localhost:${PORT}`);
});
