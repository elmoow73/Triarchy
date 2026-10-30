// 칸 안의 사이트 페이지가 시작될 때 먼저 실행되는 코드 (Node 기능 없음).
//
// 구글 로그인 페이지가 "패스키 / 보안 키" 로그인을 시도하면 Windows 보안 창이
// "확인되지 않은 앱" 이라며 USB 보안 키를 요구하고 막혀 버린다.
// 그래서 구글 로그인 페이지에서만 패스키 기능을 없는 것처럼 보이게 해서,
// 구글이 비밀번호 / 휴대폰 확인 방식으로 로그인하도록 만든다.

const { contextBridge } = require('electron');

const PASSKEY_OFF_HOSTS = ['accounts.google.com'];

if (PASSKEY_OFF_HOSTS.includes(location.hostname)) {
  contextBridge.executeInMainWorld({
    func: () => {
      const refuse = () => Promise.reject(new DOMException('Passkeys are disabled in Triarchy', 'NotAllowedError'));
      try { delete window.PublicKeyCredential; } catch {}
      try { Object.defineProperty(window, 'PublicKeyCredential', { value: undefined, configurable: true }); } catch {}
      if (navigator.credentials) {
        try {
          navigator.credentials.get = refuse;
          navigator.credentials.create = refuse;
        } catch {}
      }
    }
  });
}
