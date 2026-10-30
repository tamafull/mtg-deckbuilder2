const API = 'https://api.scryfall.com';
const STORE = 'mtg-deckbuilder2:deck:v1';
const $ = (s) => document.querySelector(s);

const state = {
  deck: { name: 'Untitled Deck', format: 'freeform', main: [], side: [] },
  game: null,
};

const els = {
  searchForm: $('#searchForm'), searchInput: $('#searchInput'), searchStatus: $('#searchStatus'), searchResults: $('#searchResults'),
  deckName: $('#deckName'), formatSelect: $('#formatSelect'), mainDeck: $('#mainDeck'), sideboard: $('#sideboard'), mainCount: $('#mainCount'), sideCount: $('#sideCount'),
  deckSummary: $('#deckSummary'), manaCurve: $('#manaCurve'), colorStats: $('#colorStats'), saveDeckBtn: $('#saveDeckBtn'), exportDeckBtn: $('#exportDeckBtn'), importDeckBtn: $('#importDeckBtn'),
  clearMainBtn: $('#clearMainBtn'), clearSideBtn: $('#clearSideBtn'), importDialog: $('#importDialog'), importText: $('#importText'), importStatus: $('#importStatus'), runImportBtn: $('#runImportBtn'),
  exportDialog: $('#exportDialog'), exportText: $('#exportText'), copyExportBtn: $('#copyExportBtn'), newGameBtn: $('#newGameBtn'), drawBtn: $('#drawBtn'), nextTurnBtn: $('#nextTurnBtn'),
  mulliganBtn: $('#mulliganBtn'), shuffleBtn: $('#shuffleBtn'), untapBtn: $('#untapBtn'), resetGameBtn: $('#resetGameBtn'), lifeMinusBtn: $('#lifeMinusBtn'), lifePlusBtn: $('#lifePlusBtn'),
  lifeValue: $('#lifeValue'), turnValue: $('#turnValue'), simStatus: $('#simStatus'), handZone: $('#handZone'), battlefieldZone: $('#battlefieldZone'), graveyardZone: $('#graveyardZone'), exileZone: $('#exileZone'),
  handCount: $('#handCount'), battlefieldCount: $('#battlefieldCount'), graveyardCount: $('#graveyardCount'), exileCount: $('#exileCount'), libraryCount: $('#libraryCount'), revealTopBtn: $('#revealTopBtn'), revealedCard: $('#revealedCard'),
};

const esc = (v = '') => String(v).replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
const qty = (xs) => xs.reduce((n, x) => n + x.qty, 0);
const keyOf = (c) => c.oracle_id || c.id || c.name.toLowerCase();
const imageOf = (c) => c.image_uris?.normal || c.card_faces?.find((f) => f.image_uris)?.image_uris?.normal || c.image || '';
const compact = (c) => ({
  id: c.id, oracle_id: c.oracle_id || c.id, name: c.name, mana_cost: c.mana_cost || c.card_faces?.[0]?.mana_cost || '', cmc: Number(c.cmc || 0),
  type_line: c.type_line || '', colors: c.colors || c.card_faces?.flatMap((f) => f.colors || []) || [], color_identity: c.color_identity || [], set: c.set || '', image: imageOf(c),
});
const status = (el, text, error = false) => { el.textContent = text; el.classList.toggle('error', error); };
const shuffle = (xs) => { const a = [...xs]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
let autosaveTimer;
const autosave = () => { clearTimeout(autosaveTimer); autosaveTimer = setTimeout(() => localStorage.setItem(STORE, JSON.stringify(state.deck)), 250); };

function loadDeck() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE) || 'null');
    if (saved && Array.isArray(saved.main) && Array.isArray(saved.side)) state.deck = { ...state.deck, ...saved };
  } catch (e) { console.warn(e); }
}
function saveDeck() { localStorage.setItem(STORE, JSON.stringify(state.deck)); status(els.searchStatus, 'デッキを保存しました。'); }

function addCard(card, zone = 'main', amount = 1) {
  const target = zone === 'side' ? state.deck.side : state.deck.main;
  const c = compact(card); const found = target.find((x) => keyOf(x.card) === keyOf(c));
  if (found) found.qty += amount; else target.push({ card: c, qty: amount });
  target.sort((a, b) => a.card.cmc - b.card.cmc || a.card.name.localeCompare(b.card.name));
  renderDeck(); autosave();
}
function changeQty(zone, key, delta) {
  const target = zone === 'side' ? state.deck.side : state.deck.main;
  const e = target.find((x) => keyOf(x.card) === key); if (!e) return;
  e.qty += delta; if (e.qty <= 0) target.splice(target.indexOf(e), 1);
  renderDeck(); autosave();
}
function moveEntry(zone, key) {
  const from = zone === 'side' ? state.deck.side : state.deck.main;
  const e = from.find((x) => keyOf(x.card) === key); if (!e) return;
  from.splice(from.indexOf(e), 1); addCard(e.card, zone === 'side' ? 'main' : 'side', e.qty);
}

function renderList(el, items, zone) {
  el.innerHTML = '';
  if (!items.length) { el.innerHTML = '<div class="empty-state">まだカードがありません。</div>'; return; }
  items.forEach((e) => {
    const k = keyOf(e.card), row = document.createElement('div'); row.className = 'deck-row';
    row.innerHTML = `<div class="qty-control"><button data-a="minus">−</button><strong>${e.qty}</strong><button data-a="plus">＋</button></div>
      <div title="${esc(e.card.name)}"><div class="deck-card-name">${esc(e.card.name)}</div><div class="deck-card-info">MV ${e.card.cmc} · ${esc(e.card.type_line)}</div></div>
      <div class="row-actions"><button data-a="move" title="移動">⇄</button><button data-a="remove" title="削除">×</button></div>`;
    row.onclick = (ev) => { const a = ev.target?.dataset?.a; if (a === 'minus') changeQty(zone, k, -1); if (a === 'plus') changeQty(zone, k, 1); if (a === 'remove') changeQty(zone, k, -e.qty); if (a === 'move') moveEntry(zone, k); };
    el.append(row);
  });
}

function renderStats() {
  const cards = state.deck.main.flatMap(({ card, qty: n }) => Array.from({ length: n }, () => card));
  const lands = cards.filter((c) => /Land/i.test(c.type_line)).length;
  const creatures = cards.filter((c) => /Creature/i.test(c.type_line)).length;
  const spells = cards.filter((c) => !/Land/i.test(c.type_line));
  const avg = spells.length ? spells.reduce((s, c) => s + c.cmc, 0) / spells.length : 0;
  const expected = state.deck.format === 'commander' ? 100 : 60;
  els.deckSummary.innerHTML = [['メイン', cards.length], ['土地', lands], ['クリーチャー', creatures], ['平均MV', avg.toFixed(2)], ['目安', cards.length >= expected ? '最低枚数OK' : `あと${expected - cards.length}枚`]]
    .map(([a, b]) => `<span class="summary-chip">${a}: <strong>${b}</strong></span>`).join('');
  const buckets = Array(8).fill(0); spells.forEach((c) => buckets[Math.min(7, Math.floor(c.cmc))]++); const max = Math.max(1, ...buckets);
  els.manaCurve.innerHTML = buckets.map((n, i) => `<div class="curve-column"><strong>${n}</strong><div class="curve-bar" style="height:${Math.max(4, Math.round(n / max * 70))}px"></div><span>${i === 7 ? '7+' : i}</span></div>`).join('');
  const names = { W: '白', U: '青', B: '黒', R: '赤', G: '緑', C: '無色' }, css = { W: '#f8f0d6', U: '#7ab7ff', B: '#b7a7c8', R: '#ff8b73', G: '#82c995', C: '#b0b8c3' }, counts = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
  cards.forEach((c) => (c.colors?.length ? [...new Set(c.colors)] : ['C']).forEach((x) => { if (x in counts) counts[x]++; }));
  els.colorStats.innerHTML = Object.entries(counts).filter(([, n]) => n).map(([c, n]) => `<span class="color-dot" style="color:${css[c]}"><span class="color-swatch"></span>${names[c]} ${n}</span>`).join('') || '<span class="muted">カードを追加すると表示されます。</span>';
}
function renderDeck() {
  els.deckName.value = state.deck.name; els.formatSelect.value = state.deck.format; els.mainCount.textContent = `(${qty(state.deck.main)})`; els.sideCount.textContent = `(${qty(state.deck.side)})`;
  renderList(els.mainDeck, state.deck.main, 'main'); renderList(els.sideboard, state.deck.side, 'side'); renderStats();
}

async function searchCards(q) {
  if (!q.trim()) return; status(els.searchStatus, '検索中…'); els.searchResults.innerHTML = '';
  try {
    const r = await fetch(`${API}/cards/search?q=${encodeURIComponent(q.trim())}&order=name&unique=cards`), data = await r.json();
    if (!r.ok) throw new Error(data.details || '検索に失敗しました。');
    const cards = data.data.slice(0, 30); status(els.searchStatus, `${data.total_cards}件中 ${cards.length}件を表示`); renderSearch(cards);
  } catch (e) { status(els.searchStatus, e.message || '検索に失敗しました。', true); }
}
function renderSearch(cards) {
  els.searchResults.innerHTML = '';
  cards.forEach((card) => {
    const node = document.createElement('article'); node.className = 'search-card'; const img = imageOf(card);
    node.innerHTML = `${img ? `<img src="${img}" alt="${esc(card.name)}" loading="lazy">` : '<div class="empty-state">画像なし</div>'}<div class="search-card-body"><h3 class="search-card-title">${esc(card.name)}</h3><div class="search-card-meta"><span>${esc(card.mana_cost || card.card_faces?.[0]?.mana_cost || '')}</span><span>${esc(card.set_name || '')}</span></div><div class="search-card-actions"><button class="btn primary" data-zone="main">メイン +1</button><button class="btn secondary" data-zone="side">サイド +1</button></div></div>`;
    node.querySelectorAll('[data-zone]').forEach((b) => b.onclick = () => addCard(card, b.dataset.zone)); els.searchResults.append(node);
  });
}

function exportText() {
  const out = [`Deck: ${state.deck.name}`, '']; state.deck.main.forEach((e) => out.push(`${e.qty} ${e.card.name}`));
  if (state.deck.side.length) { out.push('', 'Sideboard'); state.deck.side.forEach((e) => out.push(`${e.qty} ${e.card.name}`)); }
  return out.join('\n');
}
async function importText(text) {
  const parsed = { main: [], side: [] }; let zone = 'main';
  for (const line0 of text.split(/\r?\n/)) {
    const line = line0.trim(); if (!line || /^deck:?$/i.test(line)) continue;
    if (/^deck:\s*/i.test(line)) { state.deck.name = line.replace(/^deck:\s*/i, '').trim() || state.deck.name; continue; }
    if (/^sideboard:?$/i.test(line)) { zone = 'side'; continue; }
    const m = line.match(/^(\d+)\s+(.+?)(?:\s+\([A-Z0-9]+\)\s+\d+[A-Za-z]?)?$/i); if (m) parsed[zone].push({ qty: Number(m[1]), name: m[2].trim() });
  }
  if (!parsed.main.length && !parsed.side.length) throw new Error('読み込めるカード行がありません。');
  const result = { main: [], side: [] };
  for (const z of ['main', 'side']) for (let i = 0; i < parsed[z].length; i++) {
    const x = parsed[z][i]; status(els.importStatus, `${x.name} を取得中… (${i + 1}/${parsed[z].length})`);
    const r = await fetch(`${API}/cards/named?fuzzy=${encodeURIComponent(x.name)}`), data = await r.json();
    if (!r.ok) throw new Error(`「${x.name}」を取得できませんでした: ${data.details || 'unknown error'}`); result[z].push({ qty: x.qty, card: compact(data) });
  }
  state.deck.main = result.main; state.deck.side = result.side; renderDeck(); saveDeck();
}

function expandDeck() { return state.deck.main.flatMap(({ card, qty: n }) => Array.from({ length: n }, () => ({ ...card, instanceId: crypto.randomUUID(), tapped: false }))); }
function startGame() {
  const all = expandDeck(); if (all.length < 7) return status(els.simStatus, '一人回しにはメインデッキが7枚以上必要です。', true);
  state.game = { library: shuffle(all), hand: [], battlefield: [], graveyard: [], exile: [], turn: 1, life: state.deck.format === 'commander' ? 40 : 20, mulligans: 0, revealed: null };
  draw(7, false); status(els.simStatus, '初手7枚を引きました。'); renderGame();
}
function draw(n = 1, redraw = true) {
  if (!state.game) return; for (let i = 0; i < n; i++) { const c = state.game.library.shift(); if (!c) { status(els.simStatus, 'ライブラリーが空です。', true); break; } state.game.hand.push(c); }
  state.game.revealed = null; if (redraw) renderGame();
}
function moveCard(from, to, id) {
  const src = state.game?.[from]; if (!src) return; const i = src.findIndex((c) => c.instanceId === id); if (i < 0) return;
  const [c] = src.splice(i, 1); c.tapped = false; state.game[to].push(c); state.game.revealed = null; renderGame();
}
function mulligan() {
  if (!state.game) return; state.game.library = shuffle([...state.game.library, ...state.game.hand]); state.game.hand = []; state.game.mulligans++; draw(7, false);
  status(els.simStatus, `マリガン ${state.game.mulligans} 回目。必要なら手札の「ボトム」で ${state.game.mulligans} 枚戻してください。`); renderGame();
}
function nextTurn() { if (!state.game) return; state.game.turn++; state.game.battlefield.forEach((c) => c.tapped = false); draw(1, false); status(els.simStatus, `ターン ${state.game.turn}。アンタップ後、1枚引きました。`); renderGame(); }

function renderZone(el, cards, zone) {
  el.innerHTML = ''; if (!cards.length) { el.innerHTML = '<div class="empty-state">なし</div>'; return; }
  cards.forEach((card) => {
    if (zone === 'graveyard' || zone === 'exile') {
      const n = document.createElement('div'); n.className = 'mini-card'; n.innerHTML = `<span>${esc(card.name)}</span><button class="text-btn">手札へ</button>`; n.querySelector('button').onclick = () => moveCard(zone, 'hand', card.instanceId); el.append(n); return;
    }
    const n = document.createElement('article'); n.className = `sim-card${card.tapped ? ' tapped' : ''}`;
    n.innerHTML = `${card.image ? `<img src="${card.image}" alt="${esc(card.name)}">` : ''}<p class="sim-card-name">${esc(card.name)}</p><div class="sim-card-actions">${zone === 'hand' ? '<button data-a="battlefield">戦場</button>' : '<button data-a="tap">タップ</button>'}<button data-a="graveyard">墓地</button><button data-a="exile">追放</button>${zone === 'hand' ? '<button data-a="bottom">ボトム</button>' : ''}${zone === 'battlefield' ? '<button data-a="hand">手札</button>' : ''}</div>`;
    n.onclick = (ev) => { const a = ev.target?.dataset?.a; if (!a) return; if (a === 'tap') { card.tapped = !card.tapped; return renderGame(); } if (a === 'bottom') { const i = state.game.hand.findIndex((c) => c.instanceId === card.instanceId); if (i >= 0) state.game.library.push(state.game.hand.splice(i, 1)[0]); return renderGame(); } moveCard(zone, a, card.instanceId); }; el.append(n);
  });
}
function renderGame() {
  const g = state.game, on = !!g; [els.drawBtn, els.nextTurnBtn, els.mulliganBtn, els.shuffleBtn, els.untapBtn, els.resetGameBtn, els.lifeMinusBtn, els.lifePlusBtn, els.revealTopBtn].forEach((b) => b.disabled = !on);
  if (!g) { els.turnValue.textContent = '0'; els.lifeValue.textContent = state.deck.format === 'commander' ? '40' : '20'; [els.handCount, els.battlefieldCount, els.graveyardCount, els.exileCount, els.libraryCount].forEach((x) => x.textContent = '0'); [els.handZone, els.battlefieldZone, els.graveyardZone, els.exileZone, els.revealedCard].forEach((x) => x.innerHTML = ''); return; }
  els.turnValue.textContent = g.turn; els.lifeValue.textContent = g.life; els.handCount.textContent = g.hand.length; els.battlefieldCount.textContent = g.battlefield.length; els.graveyardCount.textContent = g.graveyard.length; els.exileCount.textContent = g.exile.length; els.libraryCount.textContent = g.library.length;
  renderZone(els.handZone, g.hand, 'hand'); renderZone(els.battlefieldZone, g.battlefield, 'battlefield'); renderZone(els.graveyardZone, g.graveyard, 'graveyard'); renderZone(els.exileZone, g.exile, 'exile');
  els.revealedCard.innerHTML = g.revealed ? `${g.revealed.image ? `<img src="${g.revealed.image}" alt="${esc(g.revealed.name)}">` : ''}<p>${esc(g.revealed.name)}</p>` : '';
}

els.searchForm.onsubmit = (e) => { e.preventDefault(); searchCards(els.searchInput.value); };
els.deckName.oninput = () => { state.deck.name = els.deckName.value || 'Untitled Deck'; autosave(); };
els.formatSelect.onchange = () => { state.deck.format = els.formatSelect.value; renderStats(); renderGame(); autosave(); };
els.saveDeckBtn.onclick = saveDeck;
els.clearMainBtn.onclick = () => { if (confirm('メインデッキを空にしますか？')) { state.deck.main = []; renderDeck(); autosave(); } };
els.clearSideBtn.onclick = () => { if (confirm('サイドボードを空にしますか？')) { state.deck.side = []; renderDeck(); autosave(); } };
els.importDeckBtn.onclick = () => { els.importStatus.textContent = ''; els.importDialog.showModal(); };
els.runImportBtn.onclick = async () => { els.runImportBtn.disabled = true; try { await importText(els.importText.value); status(els.importStatus, '読み込み完了。'); setTimeout(() => els.importDialog.close(), 400); } catch (e) { status(els.importStatus, e.message || '読み込みに失敗しました。', true); } finally { els.runImportBtn.disabled = false; } };
els.exportDeckBtn.onclick = () => { els.exportText.value = exportText(); els.exportDialog.showModal(); };
els.copyExportBtn.onclick = async () => { await navigator.clipboard.writeText(els.exportText.value); els.copyExportBtn.textContent = 'コピー済み'; setTimeout(() => els.copyExportBtn.textContent = 'コピー', 1000); };
els.newGameBtn.onclick = startGame; els.drawBtn.onclick = () => draw(); els.nextTurnBtn.onclick = nextTurn; els.mulliganBtn.onclick = mulligan;
els.shuffleBtn.onclick = () => { if (!state.game) return; state.game.library = shuffle(state.game.library); state.game.revealed = null; status(els.simStatus, 'ライブラリーをシャッフルしました。'); renderGame(); };
els.untapBtn.onclick = () => { if (!state.game) return; state.game.battlefield.forEach((c) => c.tapped = false); renderGame(); };
els.resetGameBtn.onclick = () => { state.game = null; status(els.simStatus, 'ゲームを終了しました。'); renderGame(); };
els.lifeMinusBtn.onclick = () => { if (state.game) { state.game.life--; renderGame(); } }; els.lifePlusBtn.onclick = () => { if (state.game) { state.game.life++; renderGame(); } };
els.revealTopBtn.onclick = () => { if (!state.game) return; state.game.revealed = state.game.library[0] || null; renderGame(); };

loadDeck(); renderDeck(); renderGame(); status(els.searchStatus, 'カード名または Scryfall 検索構文を入力してください。');
