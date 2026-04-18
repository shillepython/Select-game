const app = document.getElementById('app');
const nav = document.getElementById('nav');

const api = {
  async createPoll(title, games) {
    return fetchJson('/api/polls', { method: 'POST', body: { title, games } });
  },
  async getPoll(id) { return fetchJson(`/api/polls/${id}`); },
  async newSession(pollId) {
    return fetchJson(`/api/polls/${pollId}/sessions`, { method: 'POST' });
  },
  async getSession(sid) { return fetchJson(`/api/sessions/${sid}`); },
  async vote(sid, payload) {
    return fetchJson(`/api/sessions/${sid}/vote`, { method: 'POST', body: payload });
  },
};

async function fetchJson(url, opts = {}) {
  const r = await fetch(url, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
  return data;
}

function el(tag, attrs = {}, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else if (k === 'html') n.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null) n.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null) continue;
    n.append(c.nodeType ? c : document.createTextNode(c));
  }
  return n;
}

function setStatus(node, text, kind = '') {
  node.textContent = text;
  node.className = 'status' + (kind ? ' ' + kind : '');
  node.style.display = text ? 'block' : 'none';
}

function fmtDate(ts) {
  const d = new Date(ts);
  return d.toLocaleString();
}

function shareUrl(sid) {
  return `${location.origin}/#/s/${sid}`;
}

function renderNav(route) {
  nav.innerHTML = '';
  nav.append(el('a', { href: '#/' }, 'Новый опросник'));
  if (route && route.pollId) {
    nav.append(el('a', { href: `#/p/${route.pollId}` }, 'Опросник'));
  }
}

function parseRoute() {
  const h = location.hash.replace(/^#/, '') || '/';
  const parts = h.split('/').filter(Boolean);
  if (parts.length === 0) return { name: 'home' };
  if (parts[0] === 'p' && parts[1]) return { name: 'poll', pollId: parts[1] };
  if (parts[0] === 's' && parts[1]) return { name: 'session', sessionId: parts[1] };
  return { name: 'home' };
}

function viewHome() {
  const statusNode = el('div', { class: 'status', style: 'display:none' });
  const titleIn = el('input', { type: 'text', placeholder: 'Напр.: Во что поиграем вечером' });
  const gamesIn = el('textarea', {
    placeholder: 'По одной игре в строке:\nDota 2\nCS2\nValorant\nIt Takes Two'
  });
  const btn = el('button', {
    onclick: async () => {
      btn.disabled = true;
      setStatus(statusNode, '');
      try {
        const games = gamesIn.value.split('\n');
        const res = await api.createPoll(titleIn.value, games);
        location.hash = `#/p/${res.pollId}`;
      } catch (e) {
        setStatus(statusNode, e.message, 'err');
        btn.disabled = false;
      }
    }
  }, 'Создать опросник');

  app.innerHTML = '';
  app.append(
    el('h1', {}, 'Новый опросник игр'),
    el('p', { class: 'muted' },
      'Впиши список игр. Опросник сохранится — от него можно генерировать сессии, где двое голосуют (до 2 игр каждый) и видят совпадения.'
    ),
    el('div', { class: 'card' },
      el('label', {}, 'Название (необязательно)'),
      titleIn,
      el('label', {}, 'Игры (одна в строке)'),
      gamesIn,
      el('div', { class: 'row' }, btn),
      statusNode,
    ),
  );
}

async function viewPoll(pollId) {
  app.innerHTML = '';
  app.append(el('p', { class: 'muted' }, 'Загрузка…'));
  let data;
  try {
    data = await api.getPoll(pollId);
  } catch (e) {
    app.innerHTML = '';
    app.append(el('h1', {}, 'Ошибка'), el('p', { class: 'muted' }, e.message));
    return;
  }
  const { poll, sessions } = data;

  const statusNode = el('div', { class: 'status', style: 'display:none' });
  const sessionsList = el('ul', { class: 'session-list' });

  const renderSessions = () => {
    sessionsList.innerHTML = '';
    if (sessions.length === 0) {
      sessionsList.append(el('li', {}, 'Сессий ещё нет. Создай первую.'));
      return;
    }
    for (const s of sessions) {
      const statusTxt = s.bothVoted
        ? 'Оба проголосовали'
        : s.voterCount === 1 ? 'Ждём второго' : 'Пока никто не голосовал';
      sessionsList.append(
        el('li', {},
          el('div', {},
            el('a', { href: `#/s/${s.id}` }, s.id),
            el('div', { class: 'counter' }, `${fmtDate(s.createdAt)} · ${statusTxt}`),
          ),
          el('button', {
            class: 'secondary',
            onclick: () => {
              navigator.clipboard?.writeText(shareUrl(s.id));
              setStatus(statusNode, 'Ссылка скопирована', 'ok');
            }
          }, 'Копировать'),
        )
      );
    }
  };

  const newBtn = el('button', {
    onclick: async () => {
      newBtn.disabled = true;
      setStatus(statusNode, '');
      try {
        const res = await api.newSession(pollId);
        location.hash = `#/s/${res.sessionId}`;
      } catch (e) {
        setStatus(statusNode, e.message, 'err');
        newBtn.disabled = false;
      }
    }
  }, 'Создать новую сессию и открыть');

  app.innerHTML = '';
  app.append(
    el('h1', {}, poll.title),
    el('p', { class: 'muted' },
      el('span', { class: 'pill' }, `ID: ${poll.id}`),
      `${poll.games.length} игр · создан ${fmtDate(poll.createdAt)}`
    ),
    el('div', { class: 'card' },
      el('h2', {}, 'Список игр'),
      el('div', { class: 'games' },
        ...poll.games.map(g => el('div', { class: 'game disabled' }, g))
      ),
    ),
    el('div', { class: 'card' },
      el('h2', {}, 'Сессии голосования'),
      el('p', { class: 'muted' },
        'Каждая сессия — отдельная ссылка для двоих. Когда оба проголосуют, увидите совпавшие игры.'
      ),
      el('div', { class: 'row' }, newBtn),
      sessionsList,
      statusNode,
    ),
  );
  renderSessions();
}

async function viewSession(sessionId) {
  app.innerHTML = '';
  app.append(el('p', { class: 'muted' }, 'Загрузка…'));
  let state;
  try {
    state = await api.getSession(sessionId);
  } catch (e) {
    app.innerHTML = '';
    app.append(el('h1', {}, 'Ошибка'), el('p', { class: 'muted' }, e.message));
    return;
  }

  const storageKey = `sg:vote:${sessionId}`;
  const stored = JSON.parse(localStorage.getItem(storageKey) || 'null');

  const render = () => {
    app.innerHTML = '';
    const header = el('h1', {}, state.pollTitle);
    const sub = el('p', { class: 'muted' },
      el('span', { class: 'pill' }, 'Сессия'),
      `${state.voters.length}/2 проголосовало · ссылка для второго ниже`
    );
    const shareBox = el('div', { class: 'card' },
      el('h2', {}, 'Поделиться сессией'),
      el('div', { class: 'link-box' },
        el('input', { type: 'text', readonly: true, value: shareUrl(state.sessionId) }),
        el('button', {
          class: 'secondary',
          onclick: (e) => {
            navigator.clipboard?.writeText(shareUrl(state.sessionId));
            e.target.textContent = 'Скопировано';
            setTimeout(() => (e.target.textContent = 'Копировать'), 1500);
          }
        }, 'Копировать'),
      ),
    );

    app.append(header, sub, shareBox);

    if (state.bothVoted) {
      const matchCard = el('div', { class: 'card' });
      matchCard.append(el('h2', {}, 'Совпадения'));
      if (state.matches.length === 0) {
        matchCard.append(el('p', { class: 'muted' }, 'Увы, общих выборов нет. Создайте новую сессию и попробуйте снова.'));
      } else {
        matchCard.append(
          el('p', { class: 'muted' }, `Совпало ${state.matches.length}:`),
          el('div', { class: 'match-list' },
            ...state.matches.map(g => el('span', {}, g))
          )
        );
      }
      const summary = el('div', { class: 'vote-summary' },
        ...state.votes.map(v =>
          el('div', { class: 'vs' },
            el('b', {}, v.name),
            ': ',
            v.choices.join(', '),
          )
        )
      );
      matchCard.append(el('h2', {}, 'Кто что выбрал'), summary);
      app.append(matchCard);
      app.append(
        el('div', { class: 'row' },
          el('a', { href: `#/p/${state.pollId}` },
            el('button', { class: 'secondary' }, 'К опроснику')
          )
        )
      );
      return;
    }

    const alreadyVoted = !!(stored && stored.voterId
      && state.voters.find(v => v.name === stored.name));
    const locked = state.voters.length >= 2 && !stored;

    const statusNode = el('div', { class: 'status', style: 'display:none' });
    const counter = el('div', { class: 'counter' }, '');

    const nameIn = el('input', {
      type: 'text',
      placeholder: 'Как тебя зовут',
      value: stored?.name || ''
    });

    const selected = new Set(stored?.choices || []);
    const updateCounter = () => {
      counter.textContent = `Выбрано ${selected.size}/${state.maxChoices}`;
    };
    updateCounter();

    const gameNodes = state.games.map(g => {
      const node = el('label', { class: 'game' });
      const cb = el('input', { type: 'checkbox' });
      cb.checked = selected.has(g);
      if (selected.has(g)) node.classList.add('selected');
      cb.addEventListener('change', () => {
        if (cb.checked) {
          if (selected.size >= state.maxChoices) {
            cb.checked = false;
            setStatus(statusNode, `Можно выбрать не больше ${state.maxChoices}`, 'err');
            return;
          }
          selected.add(g);
          node.classList.add('selected');
        } else {
          selected.delete(g);
          node.classList.remove('selected');
        }
        setStatus(statusNode, '');
        updateCounter();
      });
      node.append(cb, document.createTextNode(g));
      return node;
    });

    const submitBtn = el('button', {
      onclick: async () => {
        setStatus(statusNode, '');
        if (!nameIn.value.trim()) {
          setStatus(statusNode, 'Укажи имя', 'err');
          return;
        }
        if (selected.size === 0) {
          setStatus(statusNode, 'Выбери хотя бы одну игру', 'err');
          return;
        }
        submitBtn.disabled = true;
        try {
          const res = await api.vote(state.sessionId, {
            name: nameIn.value,
            choices: [...selected],
            voterId: stored?.voterId,
          });
          localStorage.setItem(storageKey, JSON.stringify({
            voterId: res.voterId,
            name: nameIn.value.trim(),
            choices: [...selected],
          }));
          state = res.session;
          render();
        } catch (e) {
          setStatus(statusNode, e.message, 'err');
          submitBtn.disabled = false;
        }
      }
    }, alreadyVoted ? 'Обновить голос' : 'Отправить голос');

    const votersInfo = el('div', { class: 'vote-summary' },
      ...state.voters.map(v => el('div', { class: 'vs' }, el('b', {}, v.name), ' — уже проголосовал'))
    );

    const card = el('div', { class: 'card' },
      el('h2', {}, 'Твой голос'),
      el('p', { class: 'muted' }, `Выбери до ${state.maxChoices} игр. Когда оба проголосуют, здесь появятся совпадения.`),
      el('label', {}, 'Имя'),
      nameIn,
      el('label', {}, 'Игры'),
      counter,
      el('div', { class: 'games' }, ...gameNodes),
      el('div', { class: 'row' }, submitBtn),
      statusNode,
    );

    if (locked) {
      card.querySelectorAll('input, button').forEach(n => (n.disabled = true));
      setStatus(statusNode, 'Оба голоса уже отданы с других устройств.', 'err');
    }

    app.append(card);
    if (state.voters.length > 0) {
      app.append(
        el('div', { class: 'card' },
          el('h2', {}, 'Кто уже проголосовал'),
          votersInfo,
        )
      );
    }
  };

  render();
}

async function route() {
  const r = parseRoute();
  renderNav(r);
  if (r.name === 'home') return viewHome();
  if (r.name === 'poll') return viewPoll(r.pollId);
  if (r.name === 'session') return viewSession(r.sessionId);
}

window.addEventListener('hashchange', route);
route();
