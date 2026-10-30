const { app, BrowserWindow, Menu, ipcMain, session, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const { sites, googleLoginMode } = require('./sites');

// Electron 이름이 빠진, 일반 Chrome 과 같은 사용자 에이전트
const platformPart = {
  win32: 'Windows NT 10.0; Win64; x64',
  darwin: 'Macintosh; Intel Mac OS X 10_15_7',
  linux: 'X11; Linux x86_64'
}[process.platform] || 'Windows NT 10.0; Win64; x64';
const chromeMajor = process.versions.chrome.split('.')[0];
const CHROME_UA =
  `Mozilla/5.0 (${platformPart}) AppleWebKit/537.36 (KHTML, like Gecko) ` +
  `Chrome/${chromeMajor}.0.0.0 Safari/537.36`;
const FIREFOX_UA =
  `Mozilla/5.0 (${platformPart}; rv:140.0) Gecko/20100101 Firefox/140.0`;

// Electron 기본 사용자 에이전트. 구글(Gemini)은 이걸 그대로 쓴다 (아래 setupSession 참고).
const ELECTRON_UA = app.userAgentFallback;
app.userAgentFallback = CHROME_UA;

// 예전 이름(Triarcy)으로 저장된 로그인·설정 폴더가 있으면 새 이름으로 옮겨서 그대로 쓴다.
(function migrateOldUserData() {
  const appData = app.getPath('appData');
  const oldDir = path.join(appData, 'Triarcy');
  const newDir = path.join(appData, 'Triarchy');
  try {
    if (fs.existsSync(oldDir) && !fs.existsSync(newDir)) fs.renameSync(oldDir, newDir);
  } catch {}
  app.setPath('userData', newDir);
})();

// 이미 켜져 있으면 새 창을 열지 않고, 켜져 있는 창을 앞으로 가져온다.
if (!app.requestSingleInstanceLock()) {
  app.exit(0);
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows().find(w => !w.getParentWindow());
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  });
}

// 로그인 창(팝업)으로 열어 줄 주소들. 나머지 새 창 링크는 기본 브라우저로 연다.
const AUTH_HOSTS = [
  'accounts.google.com',
  'auth.openai.com',
  'auth0.openai.com',
  'appleid.apple.com',
  'login.microsoftonline.com',
  'login.live.com'
];

function hostOf(url) {
  try { return new URL(url).hostname; } catch { return ''; }
}

function isAuthUrl(url) {
  const host = hostOf(url);
  return url === 'about:blank' || AUTH_HOSTS.some(h => host === h || host.endsWith('.' + h));
}

function isSiteUrl(url) {
  const host = hostOf(url);
  return sites.some(s => {
    const siteHost = hostOf(s.url);
    return host === siteHost || host.endsWith('.' + siteHost);
  });
}

// 로그인 유지: 사이트가 "브라우저를 닫으면 지워지는 쿠키"로 로그인시켜도
// 30일짜리 저장 쿠키로 바꿔 두어서, 앱을 껐다 켜도 로그인이 남게 한다.
const KEEP_LOGIN_DAYS = 30;

function keepLogin(ses) {
  ses.cookies.on('changed', (_e, cookie, _cause, removed) => {
    if (removed || !cookie.session) return;
    const host = cookie.domain.replace(/^\./, '');
    const details = {
      url: `${cookie.secure ? 'https' : 'http'}://${host}${cookie.path || '/'}`,
      name: cookie.name,
      value: cookie.value,
      path: cookie.path,
      secure: cookie.secure,
      httpOnly: cookie.httpOnly,
      sameSite: cookie.sameSite,
      expirationDate: Date.now() / 1000 + KEEP_LOGIN_DAYS * 24 * 3600
    };
    if (!cookie.hostOnly) details.domain = cookie.domain;
    ses.cookies.set(details).catch(() => {});
  });
  // 쿠키를 디스크에 자주 저장해 둔다 (갑자기 꺼져도 로그인이 남도록).
  setInterval(() => ses.cookies.flushStore().catch(() => {}), 60 * 1000);
}

function setupSession(ses, site) {
  // Gemini 는 GPT 버전처럼 Electron 기본 사용자 에이전트로 칸 안에서 직접 로그인한다.
  ses.setUserAgent(site.userAgent === 'electron' ? ELECTRON_UA : CHROME_UA);
  ses.registerPreloadScript({ type: 'frame', filePath: path.join(__dirname, 'site-preload.js') });
  keepLogin(ses);
  if (googleLoginMode === 'firefox') {
    ses.webRequest.onBeforeSendHeaders({ urls: ['https://accounts.google.com/*'] }, (details, cb) => {
      details.requestHeaders['User-Agent'] = FIREFOX_UA;
      for (const k of Object.keys(details.requestHeaders)) {
        if (k.toLowerCase().startsWith('sec-ch-ua')) delete details.requestHeaders[k];
      }
      cb({ requestHeaders: details.requestHeaders });
    });
  }
}

// 창 크기·위치를 기억했다가 다음에 켤 때 그대로 연다.
function windowStatePath() {
  return path.join(app.getPath('userData'), 'window.json');
}

function loadWindowState() {
  try {
    return JSON.parse(fs.readFileSync(windowStatePath(), 'utf8'));
  } catch {
    return { maximized: true };
  }
}

function saveWindowState(win) {
  try {
    const state = { bounds: win.getNormalBounds(), maximized: win.isMaximized() };
    fs.writeFileSync(windowStatePath(), JSON.stringify(state, null, 2), 'utf8');
  } catch {}
}

function createWindow() {
  const saved = loadWindowState();
  const bounds = saved.bounds || {};
  const win = new BrowserWindow({
    width: bounds.width || 1600,
    height: bounds.height || 950,
    x: bounds.x,
    y: bounds.y,
    minWidth: 900,
    minHeight: 600,
    title: `Triarchy v${app.getVersion()}`,
    backgroundColor: '#1e1f22',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      webviewTag: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.on('page-title-updated', e => e.preventDefault());
  win.on('close', () => saveWindowState(win));
  if (saved.maximized) win.maximize();
  win.loadFile(path.join(__dirname, 'index.html'));
}

app.on('web-contents-created', (_e, contents) => {
  // 칸 안의 사이트(webview)에는 Node 기능을 절대 주지 않는다.
  contents.on('will-attach-webview', (_ev, webPreferences, params) => {
    delete webPreferences.preload;
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;
    if (!sites.some(s => params.partition === `persist:${s.id}`)) _ev.preventDefault();
  });

  if (contents.getType() !== 'webview' && contents.getType() !== 'window') return;

  // 칸 안에서 F5 / Ctrl+R 은 그 칸 새로고침, F11 은 전체 화면
  contents.on('before-input-event', (ev, input) => {
    if (input.type !== 'keyDown') return;
    const key = input.key.toLowerCase();
    if (key === 'f5' || (input.control && key === 'r')) {
      ev.preventDefault();
      contents.reload();
    } else if (key === 'f11') {
      ev.preventDefault();
      const host = BrowserWindow.fromWebContents(contents.hostWebContents || contents);
      if (host) host.setFullScreen(!host.isFullScreen());
    }
  });

  contents.setWindowOpenHandler(({ url }) => {
    if (isAuthUrl(url)) {
      // 로그인 팝업은 같은 칸의 로그인 저장소를 쓰는 작은 창으로 연다.
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 520,
          height: 720,
          autoHideMenuBar: true,
          webPreferences: { session: contents.session, contextIsolation: true, nodeIntegration: false }
        }
      };
    }
    if (isSiteUrl(url)) {
      contents.loadURL(url);
    } else if (/^https?:/.test(url)) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // 오른쪽 클릭 메뉴 (복사 / 붙여넣기 등)
  contents.on('context-menu', (_ev, params) => {
    const template = [];
    if (params.linkURL) {
      template.push({ label: '링크를 기본 브라우저로 열기', click: () => shell.openExternal(params.linkURL) });
      template.push({ type: 'separator' });
    }
    if (params.isEditable) {
      template.push({ role: 'cut', label: '잘라내기' });
      template.push({ role: 'copy', label: '복사' });
      template.push({ role: 'paste', label: '붙여넣기' });
      template.push({ role: 'selectAll', label: '모두 선택' });
    } else {
      template.push({ role: 'copy', label: '복사', enabled: !!params.selectionText });
      template.push({ role: 'selectAll', label: '모두 선택' });
    }
    template.push({ type: 'separator' });
    template.push({ label: '뒤로', enabled: contents.navigationHistory.canGoBack(), click: () => contents.navigationHistory.goBack() });
    template.push({ label: '새로고침', click: () => contents.reload() });
    template.push({ type: 'separator' });
    template.push({ label: '요소 검사 (설정 파일 고칠 때)', click: () => contents.inspectElement(params.x, params.y) });
    Menu.buildFromTemplate(template).popup();
  });
});

// 사용자 설정 (홈 주소 등). %APPDATA%\Triarchy\settings.json 에 저장된다.
function settingsPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function loadSettings() {
  try {
    return JSON.parse(fs.readFileSync(settingsPath(), 'utf8'));
  } catch {
    return {};
  }
}

ipcMain.handle('get-sites', () => sites);
ipcMain.handle('get-version', () => app.getVersion());
ipcMain.handle('toggle-fullscreen', e => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (win) win.setFullScreen(!win.isFullScreen());
});
ipcMain.handle('open-external', (_e, url) => {
  if (/^https?:\/\//.test(url)) shell.openExternal(url);
});
ipcMain.handle('get-settings', () => loadSettings());
ipcMain.handle('save-settings', (_e, settings) => {
  fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2), 'utf8');
  return true;
});

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  for (const s of sites) setupSession(session.fromPartition(`persist:${s.id}`), s);
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

let flushed = false;
app.on('before-quit', e => {
  if (flushed) return;
  e.preventDefault();
  flushed = true;
  Promise.all(sites.map(s => {
    const ses = session.fromPartition(`persist:${s.id}`);
    ses.flushStorageData();
    return ses.cookies.flushStore().catch(() => {});
  }))
    .finally(() => app.quit());
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
