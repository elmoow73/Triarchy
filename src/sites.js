// =====================================================================
//  Triarchy 사이트 설정 파일
// ---------------------------------------------------------------------
//  사이트 화면이 바뀌어서 "입력창을 찾지 못했어요" 같은 오류가 나면
//  이 파일만 고치면 됩니다.
//
//  - url            : 홈(⌂) 버튼의 기본 주소. 앱 안 ⚙ 설정에서 바꾼 주소가 있으면 그게 우선입니다.
//  - inputSelectors : 글을 쓰는 입력칸을 찾는 규칙 (위에서부터 차례로 시도)
//  - sendSelectors  : 전송 버튼을 찾는 규칙 (위에서부터 차례로 시도)
//  - busySelectors  : 답변을 만드는 중일 때 보이는 "중지" 버튼. 보이면 그 칸에는 보내지 않습니다.
//  - excludeInside  : (선택) 이 안에 있는 편집칸은 입력창으로 고르지 않습니다. (답변 쪽 편집기 등)
//                     기본으로 답변 영역, 캔버스, 코드 편집기는 빼고 찾습니다.
//  - composerSelectors : (선택) 채팅 입력 상자(맨 아래 입력 영역) 전체를 찾는 규칙.
//                     있으면 이 안에 있는 편집칸을 가장 먼저 입력창으로 고릅니다.
//                     (이미 열려 있는 다른 글상자에 글이 들어가지 않도록)
//  - userAgent      : 'electron' 이면 그 칸은 Electron 기본 사용자 에이전트로 접속합니다.
//                     (Gemini: 칸 안에서 직접 구글 로그인해야 껐다 켜도 로그인이 유지됩니다)
//  규칙은 CSS 선택자 문법입니다. 새 규칙은 목록 맨 위에 추가하세요.
//  전송 버튼을 끝내 못 찾으면 Enter 키를 눌러서 보냅니다.
// =====================================================================

// 구글 로그인이 "안전하지 않은 브라우저" 라며 막힐 때 바꿔 볼 설정입니다.
//   'chrome'  : 일반 Chrome 인 것처럼 접속 (기본값)
//   'firefox' : 구글 로그인 페이지에서만 Firefox 인 것처럼 접속
const googleLoginMode = 'chrome';

const sites = [
  {
    id: 'chatgpt',
    name: 'ChatGPT',
    url: 'https://chatgpt.com/',
    inputSelectors: [
      '#prompt-textarea',
      'textarea[data-id="root"]',
      'div.ProseMirror[contenteditable="true"]',
      'textarea[name="prompt-textarea"]'
    ],
    composerSelectors: [
      'form[data-type="unified-composer"]',
      '[data-testid="composer"]',
      '#thread-bottom-container',
      '#thread-bottom',
      'form:has(#prompt-textarea)',
      'form:has(button[data-testid="send-button"])',
      'form:has(#composer-submit-button)',
      'form:has(button[data-testid="composer-speech-button"])',
      'form:has([data-testid="composer-plus-btn"])'
    ],
    // 질문 고치기 상자, 프로젝트 설명 등 팝업 창 안의 글상자는 입력창으로 고르지 않는다.
    excludeInside: [
      '[role="dialog"]',
      '[aria-modal="true"]'
    ],
    sendSelectors: [
      'button[data-testid="send-button"]',
      '#composer-submit-button',
      'button[aria-label="Send prompt"]',
      'button[aria-label="프롬프트 보내기"]'
    ],
    busySelectors: [
      'button[data-testid="stop-button"]',
      'button[aria-label*="Stop"]',
      'button[aria-label*="중지"]'
    ]
  },
  {
    id: 'claude',
    name: 'Claude',
    url: 'https://claude.ai/',
    inputSelectors: [
      'div[data-testid="chat-input"]',
      '.tiptap[contenteditable="true"]',
      'div.ProseMirror[contenteditable="true"]',
      '[contenteditable="true"][role="textbox"]',
      'fieldset div[contenteditable="true"]',
      'div[contenteditable="true"]',
      'textarea'
    ],
    sendSelectors: [
      'button[aria-label="Send message"]',
      'button[aria-label="메시지 보내기"]',
      'button[aria-label="Send Message"]',
      'fieldset button[type="submit"]'
    ],
    busySelectors: [
      'button[aria-label="Stop response"]',
      'button[aria-label*="Stop"]',
      'button[aria-label*="중지"]'
    ]
  },
  {
    id: 'gemini',
    name: 'Gemini',
    url: 'https://gemini.google.com/app',
    userAgent: 'electron',
    inputSelectors: [
      'rich-textarea div.ql-editor[contenteditable="true"]',
      'rich-textarea [contenteditable="true"]',
      'div.ql-editor[contenteditable="true"]',
      'div[contenteditable="true"][role="textbox"]',
      'textarea'
    ],
    sendSelectors: [
      'button.send-button',
      'button[aria-label="Send message"]',
      'button[aria-label="메시지 보내기"]',
      'button[aria-label*="Send"]'
    ],
    busySelectors: [
      'button.stop-button',
      'button[aria-label*="Stop"]',
      'button[aria-label*="중지"]'
    ]
  }
];

// 개인 홈 주소 (선택): 같은 폴더의 home-urls.local.json 이 있으면 그 주소를 기본값으로 쓴다.
// 예) { "chatgpt": "https://chatgpt.com/g/...", "claude": "https://claude.ai/...", "gemini": "https://gemini.google.com/..." }
// 이 파일은 개인 정보라 GitHub 에 올리지 않는다 (.gitignore).
try {
  const local = require('./home-urls.local.json');
  for (const site of sites) {
    if (typeof local[site.id] === 'string' && /^https?:\/\//.test(local[site.id])) site.url = local[site.id];
  }
} catch {}

module.exports = { sites, googleLoginMode };
