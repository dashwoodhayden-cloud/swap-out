// SWAP OUT — global daily leaderboard
// Runs as a Netlify Function; stores scores in Netlify Blobs.
// GET  /api/leaderboard?day=YYYY-MM-DD&id=<playerId>  -> top 10 + your rank
// POST /api/leaderboard {id, name, score}             -> submit today's score
import { getStore } from '@netlify/blobs';

function todayUTC() {
  return new Date().toISOString().slice(0, 10);
}
function validDay(d) {
  return /^\d{4}-\d{2}-\d{2}$/.test(d || '') ? d : todayUTC();
}

const BLOCKED = ['ASS', 'FUK', 'FCK', 'NIG', 'FAG', 'KKK', 'SEX', 'DIC', 'COK', 'CUM', 'TIT'];

export default async (req) => {
  const store = getStore('leaderboard');
  const url = new URL(req.url);

  if (req.method === 'GET') {
    const day = validDay(url.searchParams.get('day'));
    const data = (await store.get(day, { type: 'json' })) || {};
    const entries = Object.entries(data).map(([id, e]) => ({ name: e.name, score: e.score }));
    entries.sort((a, b) => b.score - a.score);
    const me = url.searchParams.get('id');
    let rank = null, myScore = null;
    if (me && data[me]) {
      myScore = data[me].score;
      rank = entries.filter((e) => e.score > myScore).length + 1;
    }
    return Response.json(
      { top: entries.slice(0, 10), players: entries.length, rank, myScore },
      { headers: { 'cache-control': 'no-store' } }
    );
  }

  if (req.method === 'POST') {
    let body;
    try { body = await req.json(); } catch { return new Response('bad json', { status: 400 }); }

    const day = todayUTC(); // scores can only be posted to today's board
    const id = String(body.id || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
    let name = String(body.name || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3) || 'AAA';
    if (BLOCKED.includes(name)) name = '***';
    const score = Math.floor(Number(body.score));

    // sanity gates: real ids, plausible scores only
    if (id.length < 6 || !Number.isFinite(score) || score < 0 || score > 500) {
      return new Response('rejected', { status: 400 });
    }

    const data = (await store.get(day, { type: 'json' })) || {};
    const prev = data[id];
    if (!prev || score > prev.score) data[id] = { name, score };
    else data[id].name = name; // allow renames without lowering their best

    await store.setJSON(day, data);

    const scores = Object.values(data).map((e) => e.score).sort((a, b) => b - a);
    const rank = scores.filter((s) => s > data[id].score).length + 1;
    return Response.json({ ok: true, rank, players: scores.length, best: data[id].score });
  }

  return new Response('method not allowed', { status: 405 });
};

export const config = { path: '/api/leaderboard' };
