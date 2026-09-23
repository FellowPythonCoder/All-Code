const $ = (selector) => document.querySelector(selector);
const games = Array.from({ length: 7 }, (_, index) => window[`GAME_PACK_${index+1}`] || []).flat();
games.sort((a, b) => Number(b.id === 'geodash')-Number(a.id === 'geodash'));
let running = null;
let announcement = '';
function renderGames() {
  const filter = $('#game-filter').value.trim().toLowerCase();
  const visible = games.filter((game) => game.name.toLowerCase().includes(filter));
  $('#game-count').textContent = `${games.length} little escapes. No account required.`;
  $('#game-grid').replaceChildren();
  $('#no-games').hidden = visible.length > 0;
  for (const game of visible) {
    const card = document.createElement('button'); card.type = 'button'; card.className = `game-card${game.id === 'geodash' ? ' featured' : ''}`;
    const symbol = document.createElement('span'); symbol.className = 'game-symbol'; symbol.textContent = game.id === 'geodash' ? '◇' : game.name.slice(0, 1); symbol.setAttribute('aria-hidden', 'true');
    const arrow = document.createElement('span'); arrow.className = 'card-arrow'; arrow.textContent = '↗'; arrow.setAttribute('aria-hidden', 'true');
    const title = document.createElement('h3'); title.textContent = game.name;
    const description = document.createElement('p'); description.textContent = game.id === 'geodash' ? 'Cube → spaceship → wave. Ten levels + endless. Press 4 for autoplay.' : `Best score ${Arcade.Scores.get(game.id)} · Pick up and play`;
    card.append(symbol, arrow, title, description);
    card.addEventListener('click', () => startGame(game, card));
    $('#game-grid').append(card);
  }
}
function startGame(game, card) {
  $('#library').hidden = true;
  $('#player').hidden = false;
  $('#play-name').textContent = game.name;
  $('#play-controls').textContent = game.controls || 'Follow the on-screen instructions.';
  $('#auto-play').hidden = game.id !== 'geodash';
  $('#endless-play').hidden = game.id !== 'geodash';
  announcement = '';
  running = Arcade.start(game, $('#game-canvas'), (state) => {
    $('#play-score').textContent = `SCORE ${Math.floor(state.score)}${state.autoPlay ? ' · AUTOPLAY' : ''}`;
    $('#auto-play').setAttribute('aria-pressed', String(Boolean(state.autoPlay)));
    $('#auto-play').textContent = state.autoPlay ? 'Take over · 4' : 'Autoplay · 4';
    $('#auto-play').disabled = Boolean(state.selMode);
    $('#endless-play').hidden = game.id !== 'geodash' || !state.selMode;
    if (state.completed && state.completed !== announcement) {
      announcement = state.completed;
      $('#play-announcement').textContent = announcement;
    }
  });
  $('#game-canvas').focus();
}
function exitGame() {
  Arcade.stop(); running = null;
  $('#player').hidden = true; $('#library').hidden = false;
  renderGames();
  $('#game-filter').focus();
}
$('#exit-game').addEventListener('click', exitGame);
$('#auto-play').addEventListener('click', () => { if (running && !running.selMode) { running.toggleAuto(running); $('#game-canvas').focus(); } });
$('#endless-play').addEventListener('click', () => { if (running) { running.startLevel(running, 0, true); $('#game-canvas').focus(); } });
$('#game-filter').addEventListener('input', renderGames);
for (const name of ['play', 'chat']) {
  const tab = $(`#${name}-tab`);
  tab.addEventListener('click', () => {
    if (running) exitGame();
    for (const other of ['play', 'chat']) {
      $(`#${other}-tab`).setAttribute('aria-selected', String(name === other));
      $(`#${other}-tab`).tabIndex = name === other ? 0 : -1;
      $(`#${other}-panel`).hidden = name !== other;
    }
    tab.focus();
  });
  tab.addEventListener('keydown', (event) => {
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      $(`#${name === 'play' ? 'chat' : 'play'}-tab`).click();
    }
  });
}
renderGames();
let key = '';
let history = [];
let attachment = null;
let activeChat = null;
let chatSequence = 0;
const emptyChat = $('#chat-empty').cloneNode(true);
try {
  const legacyKey = localStorage.getItem('sreon_secret_gemini_key');
  const tabKey = sessionStorage.getItem('sreon-tab-key');
  key = tabKey || legacyKey || '';
  localStorage.removeItem('sreon_secret_gemini_key');
  $('#remember-key').checked = Boolean(tabKey);
  $('#api-key').value = key;
} catch {}
function connectionStatus() {
  $('#connection-status').textContent = key ? 'Key ready · Checked when you send' : 'Not connected';
  $('#connection-dot').classList.toggle('connected', Boolean(key));
}
connectionStatus();
$('#connection-form').addEventListener('submit', (event) => {
  event.preventDefault();
  key = $('#api-key').value.trim();
  try {
    sessionStorage.removeItem('sreon-tab-key');
    if (key && $('#remember-key').checked) sessionStorage.setItem('sreon-tab-key', key);
  } catch { $('#chat-status').textContent = 'Tab storage is unavailable. Your key will stay in memory only.'; }
  connectionStatus();
});
$('#remember-key').addEventListener('change', () => {
  try { if (!$('#remember-key').checked) sessionStorage.removeItem('sreon-tab-key'); } catch {}
});
$('#forget-key').addEventListener('click', () => {
  activeChat?.abort(); key = ''; $('#api-key').value = ''; $('#remember-key').checked = false;
  try { sessionStorage.removeItem('sreon-tab-key'); } catch {}
  connectionStatus();
});
function prompts() {
  document.querySelectorAll('[data-prompt]').forEach((button) => button.addEventListener('click', () => { $('#message').value = button.dataset.prompt; $('#message').focus(); }));
}
prompts();
function busy(value) { $('#send-chat').disabled = value; $('#stop-chat').hidden = !value; }
function clearAttachment() { attachment = null; $('#attachment').hidden = true; $('#attach-file').value = ''; }
$('#remove-attachment').addEventListener('click', clearAttachment);
$('.attach-button').addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); $('#attach-file').click(); } });
let attachmentSequence = 0;
$('#attach-file').addEventListener('change', async () => {
  const file = $('#attach-file').files[0];
  const id = ++attachmentSequence;
  clearAttachment();
  if (!file) return;
  if (file.size > 128*1024 || !(file.type.startsWith('text/') || /\.(txt|md|json|csv|js|ts|py|rs|css|html)$/i.test(file.name))) {
    $('#chat-status').textContent = 'Choose a text or code file no larger than 128 KiB.'; return;
  }
  const text = await file.text();
  if (id !== attachmentSequence) return;
  attachment = { name: file.name, text };
  $('#attachment-name').textContent = `${file.name} · ${Math.max(1, Math.round(file.size/1024))} KiB`;
  $('#attachment').hidden = false;
  $('#chat-status').textContent = 'The attachment will be sent with your next message.';
});
function addMessage(role, value) {
  $('#chat-empty')?.remove();
  const article = document.createElement('article'); article.className = `message ${role}`;
  const label = document.createElement('p'); label.className = 'role'; label.textContent = role === 'user' ? 'YOU' : 'SREON ASSISTANT';
  const body = document.createElement('div'); body.className = 'message-body';
  let position = 0;
  for (const match of value.matchAll(/```[^\n]*\n([\s\S]*?)```/g)) {
    body.append(document.createTextNode(value.slice(position, match.index)));
    const box = document.createElement('div'); box.className = 'code-block';
    const pre = document.createElement('pre'); pre.textContent = match[1];
    const copy = document.createElement('button'); copy.type = 'button'; copy.textContent = 'Copy code';
    copy.addEventListener('click', async () => { try { await navigator.clipboard.writeText(match[1]); copy.textContent = 'Copied'; } catch { copy.textContent = 'Select the code to copy'; } });
    box.append(copy, pre); body.append(box); position = match.index+match[0].length;
  }
  body.append(document.createTextNode(value.slice(position))); article.append(label, body); $('#messages').append(article); $('#messages').scrollTop = $('#messages').scrollHeight;
}
$('#clear-chat').addEventListener('click', () => {
  activeChat?.abort(); activeChat = null; chatSequence++; attachmentSequence++;
  history = []; clearAttachment(); $('#messages').replaceChildren(emptyChat.cloneNode(true)); prompts();
  $('#message').value = ''; $('#chat-status').textContent = 'Conversation cleared from this page.'; busy(false);
});
$('#stop-chat').addEventListener('click', () => activeChat?.abort());
$('#message').addEventListener('keydown', (event) => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); $('#chat-form').requestSubmit(); } });
$('#chat-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (activeChat) return;
  if (!key) { $('#chat-status').textContent = 'Connect your own API key first.'; $('#api-key').focus(); return; }
  const message = $('#message').value.trim();
  if (!message && !attachment) return;
  const model = $('#model').value.trim();
  if (!/^[A-Za-z0-9._-]{1,100}$/.test(model)) { $('#chat-status').textContent = 'Enter a valid model name.'; return; }
  const text = attachment ? `${message}\n\nAttached text (${attachment.name}):\n${attachment.text}` : message;
  const contents = [...history.slice(-20), { role: 'user', parts: [{ text }] }];
  const body = JSON.stringify({ contents, generationConfig: { maxOutputTokens: 4096 } });
  if (new Blob([body]).size > 512*1024) { $('#chat-status').textContent = 'This conversation is too large. Clear it to start a new one.'; return; }
  const sentAttachment = attachment;
  addMessage('user', message + (attachment ? `\nAttached: ${attachment.name}` : ''));
  $('#message').value = ''; clearAttachment();
  const controller = new AbortController(); activeChat = controller; const id = ++chatSequence;
  const timeout = setTimeout(() => controller.abort(), 60000);
  busy(true); $('#chat-status').textContent = 'Thinking…';
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body, signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (!response.ok) throw new Error(response.status === 429 ? 'Provider limit reached. Check your quota and try again later.' : response.status === 400 || response.status === 403 ? 'The provider rejected the request. Check your key, model, and permissions.' : 'The provider is unavailable or the model was not found. Check the model name and try again.');
    const data = await response.json();
    if (id !== chatSequence) return;
    const reply = data.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('\n');
    if (!reply) throw new Error('The provider returned no text. Try rephrasing your message.');
    history = [...contents, { role: 'model', parts: [{ text: reply }] }];
    addMessage('ai', reply); $('#chat-status').textContent = 'Reply received. AI can make mistakes; check important details.';
  } catch (error) {
    if (id === chatSequence) { $('#chat-status').textContent = error.name === 'AbortError' ? 'Stopped or timed out. Your message is ready to retry.' : error.message; if (!$('#message').value) $('#message').value = message;
      if (sentAttachment && !attachment) { attachment = sentAttachment; $('#attachment-name').textContent = sentAttachment.name; $('#attachment').hidden = false; } }
  } finally {
    clearTimeout(timeout);
    if (id === chatSequence) { activeChat = null; busy(false); }
  }
});
