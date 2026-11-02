// 화면(3칸 + 공통 입력창)을 그리고, 공통 입력창의 글을 각 칸에 넣어 보낸다.

const sleep = ms => new Promise(r => setTimeout(r, ms));

const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v === null ? fallback : JSON.parse(v);
    } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
  }
};

const panes = [];
let settings = { homeUrls: {} };

function homeUrlOf(site) {
  return (settings.homeUrls && settings.homeUrls[site.id]) || site.url;
}

// ---------------------------------------------------------------------
// 칸 안의 사이트 페이지에서 실행되는 코드
// ---------------------------------------------------------------------

// 답변 안에 있는 편집기(ChatGPT 캔버스·코드 편집기 등)는 입력창으로 고르지 않는다.
const ANSWER_AREAS = [
  '[data-message-author-role]',
  '[data-testid^="conversation-turn"]',
  '[data-testid*="canvas"]',
  '[id*="canvas"]',
  'article',
  '.markdown',
  'model-response',
  'message-content',
  '.cm-editor',
  '.monaco-editor'
];

// 입력창을 찾아 포커스하고 기존 글을 선택해 둔다 (새 글로 덮어쓰기 위해).
// 찾은 입력창에는 표시(data-triarchy-input)를 붙여 두고, 글을 넣은 뒤 제대로 들어갔는지 확인한다.
// 찾는 순서: ① 채팅 입력 상자(composerSelectors) 안의 편집칸 ② 그 밖의 편집칸 (답변·팝업 안은 제외)
// 다른 글상자(질문 고치기 상자 등)에 포커스가 있으면 먼저 포커스를 빼서, 글이 그쪽으로 새지 않게 한다.
function focusInputScript(site, text, dry = false, checkBusy = true) {
  return `(() => {
    const selectors = ${JSON.stringify(site.inputSelectors)};
    const composers = ${JSON.stringify(site.composerSelectors || [])}.join(',');
    const exclude = ${JSON.stringify(excludeOf(site))}.join(',');
    const visible = el => el && el.getClientRects().length > 0;
    if (${checkBusy}) {
      for (const sel of ${JSON.stringify(site.busySelectors || [])}) {
        if ([...document.querySelectorAll(sel)].some(visible)) return 'busy';
      }
    }
    const pick = inComposerOnly => {
      for (const sel of selectors) {
        let found = [...document.querySelectorAll(sel)].filter(e => visible(e) && !e.closest(exclude));
        if (inComposerOnly) found = found.filter(e => e.closest(composers));
        if (found.length) {
          // 여러 개면 화면 맨 아래쪽(채팅 입력창 자리)에 있는 것을 고른다.
          return found.reduce((a, b) => b.getBoundingClientRect().bottom > a.getBoundingClientRect().bottom ? b : a);
        }
      }
      return null;
    };
    const el = (composers && pick(true)) || pick(false);
    if (!el) return 'no-input';
    if (${dry}) return 'found';
    document.querySelectorAll('[data-triarchy-input]').forEach(e => e.removeAttribute('data-triarchy-input'));
    el.setAttribute('data-triarchy-input', '1');
    const isMine = () => document.activeElement === el || el.contains(document.activeElement);
    // 다른 글상자에 포커스가 있으면 빼낸다.
    const active = document.activeElement;
    if (active && active !== document.body && !isMine()) { try { active.blur(); } catch {} }
    window.getSelection().removeAllRanges();
    el.focus();
    if (!isMine()) {
      el.click();
      el.focus();
    }
    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
      const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set;
      setter.call(el, ${JSON.stringify(text)});
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return 'textarea';
    }
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    return 'editable';
  })()`;
}

// 글이 표시해 둔 입력창에 들어갔는지 확인한다.
function checkInputScript(text) {
  return `(() => {
    const el = document.querySelector('[data-triarchy-input]');
    if (!el) return false;
    const now = (el.value !== undefined && el.tagName !== 'DIV' ? el.value : el.innerText).replace(/\\s+/g, '');
    const want = ${JSON.stringify(text)}.replace(/\\s+/g, '').slice(0, 30);
    return now.includes(want);
  })()`;
}

// 포커스(커서)가 표시해 둔 입력창 안에 있는지 확인한다. 아니면 키 입력을 보내지 않는다.
const INPUT_FOCUSED_SCRIPT = `(() => {
  const el = document.querySelector('[data-triarchy-input]');
  return !!el && (document.activeElement === el || el.contains(document.activeElement));
})()`;

// 표시해 둔 입력창에 직접 글을 넣는다.
// 포커스가 그 입력창에 있을 때만 insertText 를 쓰고 (다른 상자로 새지 않게),
// 아니면 그 입력창에 "붙여넣기" 이벤트를 직접 보낸다.
function forceInsertScript(text) {
  return `(() => {
    const el = document.querySelector('[data-triarchy-input]');
    if (!el) return 'no-input';
    const isMine = () => document.activeElement === el || el.contains(document.activeElement);
    if (!isMine()) {
      const active = document.activeElement;
      if (active && active !== document.body) { try { active.blur(); } catch {} }
      el.focus();
    }
    if (isMine()) {
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      document.execCommand('insertText', false, ${JSON.stringify(text)});
      return 'inserted';
    }
    const dt = new DataTransfer();
    dt.setData('text/plain', ${JSON.stringify(text)});
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    return 'pasted';
  })()`;
}

// 전송 버튼이 눌릴 수 있게 될 때까지 잠시 기다렸다가 누른다.
// 입력창 가까이에 있는 버튼부터 찾는다 (답변 쪽 편집기의 버튼을 누르지 않도록).
function clickSendScript(selectors) {
  return `(async () => {
    const selectors = ${JSON.stringify(selectors)};
    const ready = b => b && b.getClientRects().length > 0 && !b.disabled &&
      b.getAttribute('aria-disabled') !== 'true';
    const input = document.querySelector('[data-triarchy-input]');
    const scopes = [];
    for (let p = input && input.parentElement; p && p !== document.body; p = p.parentElement) scopes.push(p);
    scopes.push(document);
    for (let i = 0; i < 25; i++) {
      for (const scope of scopes) {
        for (const sel of selectors) {
          const btn = [...scope.querySelectorAll(sel)].find(ready);
          if (btn) { btn.click(); return 'clicked'; }
        }
      }
      // 규칙으로 못 찾으면 입력창이 들어 있는 form 의 전송(submit) 버튼을 누른다.
      const form = input && input.closest('form');
      const submit = form && [...form.querySelectorAll('button[type="submit"]')].find(ready);
      if (submit) { submit.click(); return 'clicked'; }
      await new Promise(r => setTimeout(r, 200));
    }
    return 'no-button';
  })()`;
}

// ---------------------------------------------------------------------
// 한 칸에 보내기
// ---------------------------------------------------------------------

async function pressKey(webview, keyCode, modifiers = []) {
  webview.sendInputEvent({ type: 'keyDown', keyCode, modifiers });
  if (keyCode === 'Enter' && modifiers.length === 0) {
    webview.sendInputEvent({ type: 'char', keyCode: '\r', modifiers });
  }
  webview.sendInputEvent({ type: 'keyUp', keyCode, modifiers });
  await sleep(30);
}

function excludeOf(site) {
  return ANSWER_AREAS.concat(site.excludeInside || []);
}

async function hasInput(pane) {
  try {
    const r = await pane.webview.executeJavaScript(
      focusInputScript(pane.site, '', true, false));
    return r === 'found';
  } catch { return false; }
}

// 입력창이 생길 때까지 잠시 기다린다.
async function waitForInput(pane, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    await sleep(500);
    if (pane.ready && await hasInput(pane)) return true;
  }
  return false;
}

// 칸마다 마지막으로 채팅 입력창이 있던 화면(대화 주소)을 기억해 둔다.
function rememberChatUrl(pane) {
  setTimeout(async () => {
    if (await hasInput(pane)) pane.lastChatUrl = pane.webview.getURL();
  }, 1500);
}

// 입력창이 없는 화면(.md 파일 보기 등)이면 원래 대화로 돌아간다.
// Esc (열린 창 닫기) → 뒤로 가기 (최대 3번) → 기억해 둔 대화 주소 열기 순서로 시도한다.
async function returnToChat(pane) {
  const { webview } = pane;
  if (!pane.lastChatUrl) return false;
  setPaneStatus(pane, '입력창이 없어 원래 대화로 돌아가는 중…');
  webview.focus();
  await pressKey(webview, 'Escape');
  if (await waitForInput(pane, 1000)) return true;
  for (let i = 0; i < 3 && webview.canGoBack(); i++) {
    webview.goBack();
    if (await waitForInput(pane, 4000)) return true;
    if (webview.getURL() === pane.lastChatUrl) break;
  }
  if (webview.getURL() !== pane.lastChatUrl) {
    webview.loadURL(pane.lastChatUrl);
    if (await waitForInput(pane, 15000)) return true;
  }
  return false;
}

async function sendToPane(pane, text) {
  const { site, webview } = pane;
  if (!pane.ready) return { ok: false, msg: '아직 페이지를 불러오는 중' };

  webview.focus();
  await sleep(80);

  let mode = await webview.executeJavaScript(focusInputScript(site, text));
  if (mode === 'no-input' && await returnToChat(pane)) {
    await sleep(500);
    mode = await webview.executeJavaScript(focusInputScript(site, text));
  }
  if (mode === 'busy') return { ok: false, msg: '답변을 만드는 중이라 건너뜀' };
  if (mode === 'no-input') return { ok: false, msg: '입력창을 찾지 못함 (로그인 필요?)' };

  // GPT 버전처럼 찾은 입력창에 직접 글을 넣는다. (키 입력은 포커스를 가진 다른 편집기로 새어 나갈 수 있음)
  if (mode === 'editable') {
    await webview.executeJavaScript(forceInsertScript(text));
    await sleep(300);
  }
  if (!(await webview.executeJavaScript(checkInputScript(text))) && mode === 'editable') {
    // 직접 넣기가 안 먹히는 사이트면 키보드로 한 줄씩 입력해 본다.
    // 단, 커서가 찾은 입력창 안에 있을 때만 (다른 글상자에 글이 들어가지 않도록).
    await webview.executeJavaScript(focusInputScript(site, text, false, false));
    if (await webview.executeJavaScript(INPUT_FOCUSED_SCRIPT)) {
      const lines = text.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (i > 0) await pressKey(webview, 'Enter', ['shift']);
        if (lines[i]) await webview.insertText(lines[i]);
      }
      await sleep(300);
    }
  }
  if (!(await webview.executeJavaScript(checkInputScript(text)))) {
    return { ok: false, msg: '채팅 입력창에 글이 들어가지 않아 보내지 않음' };
  }

  await sleep(200);
  pane.lastChatUrl = webview.getURL();
  const result = await webview.executeJavaScript(clickSendScript(site.sendSelectors));
  if (result === 'no-button') {
    // 전송 버튼을 못 찾으면 Enter 키로 보낸다.
    webview.focus();
    await webview.executeJavaScript(`(() => { const el = document.querySelector('[data-triarchy-input]'); if (el) el.focus(); })()`);
    if (!(await webview.executeJavaScript(INPUT_FOCUSED_SCRIPT))) {
      return { ok: false, msg: '전송 버튼을 찾지 못함 (글은 입력창에 들어가 있음)' };
    }
    await pressKey(webview, 'Enter');
    return { ok: true, msg: 'Enter 키로 보냄' };
  }
  return { ok: true, msg: '보냄' };
}

function setPaneStatus(pane, msg, kind = '') {
  pane.statusEl.textContent = msg;
  pane.statusEl.title = msg;
  pane.statusEl.className = 'pane-status ' + kind;
}

// ---------------------------------------------------------------------
// 공통 입력창
// ---------------------------------------------------------------------

const promptEl = document.getElementById('prompt');
const sendBtn = document.getElementById('send');
const statusEl = document.getElementById('status');
let sending = false;

async function sendAll() {
  if (sending) return;
  const text = promptEl.value.trim();
  if (!text) return;

  const targets = panes.filter(p => p.visible && p.targetBox.checked);
  if (targets.length === 0) {
    statusEl.textContent = '보낼 칸이 없어요';
    return;
  }

  sending = true;
  sendBtn.disabled = true;
  statusEl.textContent = '보내는 중…';
  panes.forEach(p => setPaneStatus(p, ''));

  let okCount = 0;
  // 사람이 하나씩 보내는 것처럼 칸마다 차례로, 사이에 잠깐 쉬면서 보낸다.
  for (const pane of targets) {
    setPaneStatus(pane, '보내는 중…');
    let res;
    try {
      res = await sendToPane(pane, text);
    } catch (err) {
      res = { ok: false, msg: '오류: ' + (err && err.message ? err.message : err) };
    }
    setPaneStatus(pane, res.ok ? '✓ ' + res.msg : '⚠ ' + res.msg, res.ok ? 'ok' : 'err');
    if (res.ok) okCount++;
    await sleep(300);
  }

  if (okCount === targets.length) {
    promptEl.value = '';
    onPromptChanged();
    statusEl.textContent = `${okCount}칸에 보냈어요`;
  } else {
    statusEl.textContent = `${targets.length}칸 중 ${okCount}칸 성공`;
  }
  sendBtn.disabled = false;
  sending = false;
  promptEl.focus();
}

promptEl.addEventListener('keydown', e => {
  // 한글 입력 중(조합 중)에 누른 Enter 는 무시한다.
  if (e.isComposing || e.keyCode === 229) return;
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendAll();
  }
});
sendBtn.addEventListener('click', sendAll);

// 쓰던 글은 자동으로 저장해 두었다가 다음에 앱을 켤 때 되살린다.
const draftStateEl = document.getElementById('draft-state');
const charCountEl = document.getElementById('char-count');

function onPromptChanged() {
  store.set('draft', promptEl.value);
  charCountEl.textContent = `${promptEl.value.length}자`;
  draftStateEl.textContent = promptEl.value ? '자동 저장됨' : '';
}

promptEl.addEventListener('input', onPromptChanged);
promptEl.value = store.get('draft', '');
onPromptChanged();

document.getElementById('select-all').addEventListener('click', () => {
  promptEl.focus();
  promptEl.select();
});

document.getElementById('copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(promptEl.value);
  } catch {
    promptEl.select();
    document.execCommand('copy');
  }
  statusEl.textContent = '공통 프롬프트를 복사했어요';
});

document.getElementById('clear').addEventListener('click', () => {
  promptEl.value = '';
  onPromptChanged();
  promptEl.focus();
});

// 공통 프롬프트의 "전송 대상" 체크박스 (끈 칸은 흐리게 보인다)
const targetsEl = document.getElementById('targets');

function setSending(pane, on) {
  pane.sending = on;
  pane.targetBox.checked = on;
  pane.root.classList.toggle('not-sending', !on);
  store.set(`send:${pane.site.id}`, on);
  reportState();
}

function loadSending(site) {
  const saved = store.get(`send:${site.id}`, null);
  if (saved !== null) return saved;
  // 예전 버전의 "보내지 않기" 설정을 이어받는다.
  return !store.get(`skip:${site.id}`, false);
}

// ---------------------------------------------------------------------
// 공통 입력창 옮기기 / 접기
// ---------------------------------------------------------------------

const composerEl = document.getElementById('composer');
const unfoldBtn = document.getElementById('unfold');
const dragCover = document.getElementById('drag-cover');

function placeComposer(left, top) {
  composerEl.style.transform = 'none';
  const maxLeft = window.innerWidth - composerEl.offsetWidth;
  const maxTop = window.innerHeight - composerEl.offsetHeight;
  left = Math.max(0, Math.min(maxLeft, left));
  top = Math.max(0, Math.min(maxTop, top));
  composerEl.style.left = left + 'px';
  composerEl.style.top = top + 'px';
  composerEl.style.bottom = 'auto';
  return { left, top };
}

function setFolded(folded) {
  composerEl.classList.toggle('folded', folded);
  unfoldBtn.classList.toggle('show', folded);
  store.set('composer:folded', folded);
  if (!folded) promptEl.focus();
}

const dockBtn = document.getElementById('dock');
const dragLabel = document.getElementById('drag-handle');

function setDocked(docked) {
  composerEl.classList.toggle('docked', docked);
  store.set('composer:docked', docked);
  dockBtn.textContent = docked ? '↗ 띄워서 쓰기' : '📌 아래에 고정';
  dragLabel.textContent = docked ? '공통 프롬프트' : '⠿ 공통 프롬프트';
  if (docked) {
    composerEl.style.left = composerEl.style.top = composerEl.style.bottom = composerEl.style.transform = '';
  } else {
    const pos = store.get('composer:pos', null);
    if (pos) placeComposer(pos.left, pos.top);
  }
}

dockBtn.addEventListener('click', () => setDocked(!composerEl.classList.contains('docked')));
document.getElementById('fold').addEventListener('click', () => setFolded(true));
unfoldBtn.addEventListener('click', () => setFolded(false));

dragLabel.addEventListener('mousedown', e => {
  if (composerEl.classList.contains('docked')) return;
  e.preventDefault();
  const rect = composerEl.getBoundingClientRect();
  const dx = e.clientX - rect.left;
  const dy = e.clientY - rect.top;
  dragCover.classList.add('show');
  const move = ev => placeComposer(ev.clientX - dx, ev.clientY - dy);
  const up = () => {
    dragCover.classList.remove('show');
    window.removeEventListener('mousemove', move);
    window.removeEventListener('mouseup', up);
    const r = composerEl.getBoundingClientRect();
    store.set('composer:pos', { left: r.left, top: r.top });
  };
  window.addEventListener('mousemove', move);
  window.addEventListener('mouseup', up);
});

function restoreComposer() {
  setDocked(store.get('composer:docked', false));
  setFolded(store.get('composer:folded', false));
}

// 창 크기가 바뀌어도 입력창이 화면 밖으로 나가지 않게
window.addEventListener('resize', () => {
  if (!composerEl.classList.contains('docked') && store.get('composer:pos', null)) {
    const r = composerEl.getBoundingClientRect();
    placeComposer(r.left, r.top);
  }
});

// ---------------------------------------------------------------------
// 보이는 칸 고르기 (맨 위 체크) / 한 칸 크게 보기 / 칸 너비 조절
// ---------------------------------------------------------------------

let maximizedId = null;
let ratios = loadRatios();
let dividers = [];

function loadRatios() {
  const r = store.get('ratios', null);
  if (Array.isArray(r) && r.length === 3 && r.every(n => n >= 0.1)) return r;
  return [1, 1, 1];
}

const visiblePanes = () => panes.filter(p => p.visible);

// 칸 너비만 다시 계산한다 (경계선을 끄는 동안 계속 불림).
function applyFlex() {
  panes.forEach((p, i) => {
    const shown = maximizedId ? p.site.id === maximizedId : p.visible;
    p.root.style.flex = shown ? (maximizedId ? '1 1 0' : `${ratios[i]} 1 0`) : '0 0 0';
    p.root.classList.toggle('collapsed', !shown);
  });
}

// 보이는 칸·크게 보기가 바뀌면 화면 전체를 다시 배치한다.
function applyLayout() {
  if (maximizedId && !visiblePanes().some(p => p.site.id === maximizedId)) maximizedId = null;
  document.getElementById('panes').classList.toggle('maximized', !!maximizedId);
  applyFlex();
  renderDividers();
  const several = visiblePanes().length > 1;
  for (const p of panes) {
    const on = p.site.id === maximizedId;
    p.maxBtn.classList.toggle('on', on);
    p.maxBtn.style.display = several ? '' : 'none';
    p.maxBtn.textContent = on ? '⧉' : '⛶';
    p.maxBtn.title = on ? '원래 칸 배치로 돌아가기' : '이 칸만 크게 보기';
  }
  reportState();
}

// 보이는 칸 사이에만 경계선을 놓는다. 끌어서 두 칸의 너비를 조절한다.
function renderDividers() {
  dividers.forEach(d => d.remove());
  dividers = [];
  if (maximizedId) return;
  const panesEl = document.getElementById('panes');
  const shown = panes.map((p, i) => ({ p, i })).filter(x => x.p.visible);
  for (let k = 0; k < shown.length - 1; k++) {
    const a = shown[k].i;
    const b = shown[k + 1].i;
    const d = document.createElement('div');
    d.className = 'divider';
    d.title = '끌어서 칸 너비 조절 (두 번 누르면 같은 너비로)';
    panes[a].root.after(d);
    dividers.push(d);
    d.addEventListener('dblclick', resetLayout);
    d.addEventListener('mousedown', e => {
      e.preventDefault();
      const startX = e.clientX;
      const total = shown.reduce((sum, x) => sum + ratios[x.i], 0);
      const width = panesEl.clientWidth;
      const before = [...ratios];
      dragCover.classList.add('show', 'col');
      const move = ev => {
        const delta = ((ev.clientX - startX) / width) * total;
        const min = total * 0.15;
        const left = Math.max(min, Math.min(before[a] + before[b] - min, before[a] + delta));
        ratios[a] = left;
        ratios[b] = before[a] + before[b] - left;
        applyFlex();
      };
      const up = () => {
        dragCover.classList.remove('show', 'col');
        window.removeEventListener('mousemove', move);
        window.removeEventListener('mouseup', up);
        store.set('ratios', ratios);
        reportState();
      };
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
    });
  }
}

// 배치 초기화: 보이는 칸을 모두 같은 너비로 (한 칸만 보이면 그대로), 크게 보기도 해제
function resetLayout() {
  ratios = [1, 1, 1];
  store.set('ratios', ratios);
  maximizedId = null;
  applyLayout();
}

function toggleMaximize(pane) {
  maximizedId = maximizedId === pane.site.id ? null : pane.site.id;
  applyLayout();
}

// 맨 위 "보이기" 체크: 끈 칸은 화면에서 사라지고, 공통 프롬프트 전송 대상에서도 빠진다 (회색으로 잠김).
// 최소 한 칸은 항상 보여야 하므로, 마지막 남은 체크는 끌 수 없다.
function setVisible(pane, on, save = true) {
  if (!on && pane.visible && visiblePanes().length <= 1) {
    pane.showBox.checked = true;
    statusEl.textContent = '최소 한 칸은 보여야 해요';
    return false;
  }
  pane.visible = on;
  pane.root.classList.toggle('hidden-pane', !on);
  if (save) store.set(`show:${pane.site.id}`, on);
  updateVisibilityControls();
  applyLayout();
  return true;
}

// 여러 칸을 한꺼번에 보이게/숨기게 (명령줄 --panes 등에서 사용). 하나도 없으면 무시한다.
function setVisibleSet(ids) {
  const want = new Set(ids);
  if (!panes.some(p => want.has(p.site.id))) return false;
  for (const p of panes) {
    p.visible = want.has(p.site.id);
    p.root.classList.toggle('hidden-pane', !p.visible);
    store.set(`show:${p.site.id}`, p.visible);
  }
  updateVisibilityControls();
  applyLayout();
  return true;
}

function updateVisibilityControls() {
  const onlyOne = visiblePanes().length <= 1;
  for (const p of panes) {
    p.showBox.checked = p.visible;
    // 마지막 하나 남은 체크는 끌 수 없게 잠근다.
    p.showBox.disabled = onlyOne && p.visible;
    p.showLabel.classList.toggle('locked', p.showBox.disabled);
    p.showLabel.title = p.showBox.disabled ? '최소 한 칸은 보여야 해요' : `${p.site.name} 칸 보이기 / 숨기기`;
    // 숨긴 칸은 공통 프롬프트 "전송 대상"에서 체크 해제 + 비활성화. 다시 보이면 전에 고른 대로 돌아온다.
    p.targetBox.disabled = !p.visible;
    p.targetBox.checked = p.visible && p.sending;
    p.targetLabel.classList.toggle('disabled', !p.visible);
    p.targetLabel.title = p.visible ? '' : '숨긴 칸에는 보내지 않아요 (맨 위에서 다시 체크하면 켜짐)';
  }
}

// 지금 화면 상태를 %APPDATA%\Triarchy\state.json 에 적어 둔다 (AI 에이전트·스크립트가 읽을 수 있게).
let reportTimer = null;
function reportState() {
  clearTimeout(reportTimer);
  reportTimer = setTimeout(() => {
    if (!window.triarchy.reportState) return;
    window.triarchy.reportState({
      visiblePanes: visiblePanes().map(p => p.site.id),
      sendTargets: panes.filter(p => p.visible && p.targetBox.checked).map(p => p.site.id),
      maximized: maximizedId,
      ratios: Object.fromEntries(panes.map((p, i) => [p.site.id, Math.round(ratios[i] * 1000) / 1000]))
    });
  }, 200);
}

// 명령줄 등 바깥에서 온 명령 처리
const PANE_ALIASES = { gpt: 'chatgpt', openai: 'chatgpt', anthropic: 'claude', google: 'gemini', bard: 'gemini' };
function runControl(cmd) {
  if (!cmd || !cmd.type) return;
  if (cmd.type === 'panes') {
    const ids = (cmd.ids || []).map(x => PANE_ALIASES[x] || x);
    const list = ids.includes('all') ? panes.map(p => p.site.id) : ids;
    if (!setVisibleSet(list)) statusEl.textContent = '--panes 에 알맞은 칸 이름이 없어요 (chatgpt, claude, gemini)';
  } else if (cmd.type === 'reset-layout') {
    resetLayout();
  }
}

// 앱을 켰을 때 사이트가 스스로 다른 화면(지난 대화·스레드 등)으로 넘어가 버리면 홈 화면으로 되돌린다.
// 켜고 처음 20초 동안만, 최대 3번까지 지켜본다.
// 로그인 화면으로 넘어간 경우는 그대로 둔다.
const STARTUP_WATCH_MS = 20000;
const STARTUP_MAX_RETURNS = 3;

function watchStartupRedirect(pane) {
  const started = Date.now();
  let returns = 0;
  const check = () => {
    if (returns >= STARTUP_MAX_RETURNS || Date.now() - started > STARTUP_WATCH_MS) return;
    let now, home;
    try {
      now = new URL(pane.webview.getURL());
      home = new URL(homeUrlOf(pane.site));
    } catch { return; }
    if (now.hostname !== home.hostname) return;
    if (/login|signin|auth/i.test(now.pathname)) return;
    if (now.pathname.replace(/\/$/, '') !== home.pathname.replace(/\/$/, '')) {
      returns++;
      pane.webview.loadURL(home.href);
    }
  };
  // 사이트가 화면을 바꿀 때마다(주소 이동, 페이지 안 이동) 잠깐 뒤에 확인한다.
  const later = () => setTimeout(check, 700);
  pane.webview.addEventListener('did-navigate', later);
  pane.webview.addEventListener('did-navigate-in-page', later);
  pane.webview.addEventListener('dom-ready', () => setTimeout(check, 3000));
}

// ---------------------------------------------------------------------
// 맨 위 전체 메뉴줄
// ---------------------------------------------------------------------

document.getElementById('reload-all').addEventListener('click', () => {
  panes.forEach(p => p.webview.reload());
});
document.getElementById('home-all').addEventListener('click', () => {
  panes.forEach(p => p.webview.loadURL(homeUrlOf(p.site)));
});
document.getElementById('restore-layout').addEventListener('click', resetLayout);
const paneTogglesEl = document.getElementById('pane-toggles');
document.getElementById('fullscreen').addEventListener('click', () => window.triarchy.toggleFullscreen());
document.getElementById('open-settings').addEventListener('click', () => openSettings());

const themeBtn = document.getElementById('theme');
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  themeBtn.textContent = theme === 'light' ? '☾ 다크' : '☀ 라이트';
  store.set('theme', theme);
}
themeBtn.addEventListener('click', () => {
  applyTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light');
});
applyTheme(store.get('theme', 'dark'));

window.triarchy.getVersion().then(v => {
  document.getElementById('version').textContent = 'v' + v;
});

// ---------------------------------------------------------------------
// 3칸 만들기
// ---------------------------------------------------------------------

function createPane(site) {
  const tpl = document.getElementById('pane-template');
  const root = tpl.content.firstElementChild.cloneNode(true);
  root.dataset.site = site.id;
  root.querySelector('.name').textContent = site.name;

  const webview = document.createElement('webview');
  webview.setAttribute('partition', `persist:${site.id}`);
  webview.setAttribute('allowpopups', '');
  webview.setAttribute('src', homeUrlOf(site));
  root.querySelector('.view-wrap').appendChild(webview);

  const pane = {
    site,
    webview,
    ready: false,
    root,
    statusEl: root.querySelector('.pane-status'),
    urlEl: root.querySelector('.pane-url')
  };

  const backBtn = root.querySelector('.back');
  const fwdBtn = root.querySelector('.forward');
  const zoomLabel = root.querySelector('.zoom-level');

  const updateNav = () => {
    if (!pane.ready) return;
    pane.urlEl.textContent = webview.getURL();
    pane.urlEl.title = webview.getURL();
    backBtn.disabled = !webview.canGoBack();
    fwdBtn.disabled = !webview.canGoForward();
  };

  let zoom = store.get(`zoom:${site.id}`, 1);
  const applyZoom = () => {
    zoom = Math.min(2, Math.max(0.5, Math.round(zoom * 10) / 10));
    store.set(`zoom:${site.id}`, zoom);
    zoomLabel.textContent = Math.round(zoom * 100) + '%';
    if (pane.ready) webview.setZoomFactor(zoom);
  };

  webview.addEventListener('dom-ready', () => {
    pane.ready = true;
    webview.setZoomFactor(zoom);
    updateNav();
  });
  watchStartupRedirect(pane);
  webview.addEventListener('did-navigate', updateNav);
  webview.addEventListener('did-navigate-in-page', updateNav);
  webview.addEventListener('did-stop-loading', () => rememberChatUrl(pane));
  webview.addEventListener('did-navigate-in-page', () => rememberChatUrl(pane));
  webview.addEventListener('did-fail-load', e => {
    if (e.isMainFrame && e.errorCode !== -3) setPaneStatus(pane, '⚠ 페이지를 열지 못함 (인터넷 확인)', 'err');
  });

  backBtn.addEventListener('click', () => webview.canGoBack() && webview.goBack());
  fwdBtn.addEventListener('click', () => webview.canGoForward() && webview.goForward());
  root.querySelector('.reload').addEventListener('click', () => webview.reload());
  root.querySelector('.home').addEventListener('click', () => webview.loadURL(homeUrlOf(site)));
  root.querySelector('.maximize').addEventListener('click', () => toggleMaximize(pane));
  root.querySelector('.external').addEventListener('click', () => {
    if (pane.ready) window.triarchy.openExternal(webview.getURL());
  });
  webview.addEventListener('did-start-loading', () => {
    if (!pane.statusEl.textContent) setPaneStatus(pane, '● 불러오는 중…');
  });
  webview.addEventListener('did-stop-loading', () => {
    if (pane.statusEl.textContent === '● 불러오는 중…') setPaneStatus(pane, '');
  });
  root.querySelector('.zoom-in').addEventListener('click', () => { zoom += 0.1; applyZoom(); });
  root.querySelector('.zoom-out').addEventListener('click', () => { zoom -= 0.1; applyZoom(); });

  const targetLabel = document.createElement('label');
  targetLabel.innerHTML = '<input type="checkbox"> ';
  targetLabel.append(site.name);
  pane.targetLabel = targetLabel;
  pane.targetBox = targetLabel.querySelector('input');
  targetsEl.appendChild(targetLabel);
  pane.targetBox.addEventListener('change', () => setSending(pane, pane.targetBox.checked));
  setSending(pane, loadSending(site));

  // 맨 위 "보이기" 체크
  const showLabel = document.createElement('label');
  showLabel.innerHTML = '<input type="checkbox"> ';
  showLabel.dataset.site = site.id;
  showLabel.append(site.name);
  pane.showLabel = showLabel;
  pane.showBox = showLabel.querySelector('input');
  paneTogglesEl.appendChild(showLabel);
  pane.showBox.addEventListener('change', () => setVisible(pane, pane.showBox.checked));
  pane.visible = store.get(`show:${site.id}`, true) !== false;

  backBtn.disabled = true;
  fwdBtn.disabled = true;
  applyZoom();

  pane.maxBtn = root.querySelector('.maximize');
  document.getElementById('panes').appendChild(root);
  panes.push(pane);
}

// ---------------------------------------------------------------------
// 설정 창 (각 칸의 홈 주소)
// ---------------------------------------------------------------------

const settingsBackdrop = document.getElementById('settings-backdrop');
const settingsRows = document.getElementById('settings-rows');
const settingsError = document.getElementById('settings-error');

function isValidUrl(text) {
  try {
    const u = new URL(text);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch { return false; }
}

function openSettings() {
  settingsRows.innerHTML = '';
  settingsError.textContent = '';
  const tpl = document.getElementById('settings-row-template');
  for (const pane of panes) {
    const row = tpl.content.firstElementChild.cloneNode(true);
    const input = row.querySelector('.settings-url');
    row.querySelector('.settings-label').textContent = pane.site.name;
    input.value = homeUrlOf(pane.site);
    input.dataset.siteId = pane.site.id;
    row.querySelector('.use-current').addEventListener('click', () => {
      if (pane.ready) input.value = pane.webview.getURL();
    });
    row.querySelector('.use-default').addEventListener('click', () => { input.value = pane.site.url; });
    settingsRows.appendChild(row);
  }
  settingsBackdrop.classList.add('show');
}

function closeSettings() {
  settingsBackdrop.classList.remove('show');
}

document.getElementById('settings-cancel').addEventListener('click', closeSettings);
settingsBackdrop.addEventListener('mousedown', e => {
  if (e.target === settingsBackdrop) closeSettings();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && settingsBackdrop.classList.contains('show')) closeSettings();
});

document.getElementById('settings-save').addEventListener('click', async () => {
  const homeUrls = {};
  let ok = true;
  for (const input of settingsRows.querySelectorAll('.settings-url')) {
    const value = input.value.trim();
    const site = panes.find(p => p.site.id === input.dataset.siteId).site;
    const valid = value === site.url || isValidUrl(value);
    input.classList.toggle('invalid', !valid);
    if (!valid) ok = false;
    if (value !== site.url) homeUrls[site.id] = value;
  }
  if (!ok) {
    settingsError.textContent = 'https:// 로 시작하는 주소를 넣어 주세요.';
    return;
  }
  settings = { ...settings, homeUrls };
  try {
    await window.triarchy.saveSettings(settings);
  } catch (err) {
    settingsError.textContent = '저장하지 못했어요: ' + (err && err.message ? err.message : err);
    return;
  }
  closeSettings();
  statusEl.textContent = '설정을 저장했어요';
});

Promise.all([window.triarchy.getSites(), window.triarchy.getSettings()]).then(([sites, saved]) => {
  settings = { homeUrls: {}, ...saved };
  sites.forEach(createPane);
  // 저장된 값이 잘못되어 모두 꺼져 있으면 모두 보이게 한다.
  if (!panes.some(p => p.visible)) panes.forEach(p => { p.visible = true; });
  panes.forEach(p => p.root.classList.toggle('hidden-pane', !p.visible));
  updateVisibilityControls();
  applyLayout();
  restoreComposer();
  promptEl.focus();
  // 명령줄로 받은 명령 (예: Triarchy.exe --panes=chatgpt,claude)
  if (window.triarchy.getStartupCommands) {
    window.triarchy.getStartupCommands().then(cmds => (cmds || []).forEach(runControl)).catch(() => {});
  }
  if (window.triarchy.onControl) window.triarchy.onControl(runControl);
});
