# Triarchy

ChatGPT, Claude, Gemini 를 한 화면에 3칸으로 나란히 띄워 쓰는 Windows 데스크톱 앱 (Electron).

- 각 칸에 실제 사이트를 그대로 띄우고, 칸마다 로그인 저장소를 따로 둡니다.
- 공통 입력창에 쓰고 Enter 를 누르면 세 칸에 같은 글을 넣고 전송합니다. (Shift+Enter 줄바꿈)
- 사이트가 바뀌어 자동 입력이 안 되면 `src/sites.js` 만 고치면 됩니다.

## 그냥 쓰기
Releases 의 `Triarchy-vX.Y.Z-Windows.zip` 을 받아 압축을 풀면 `Triarchy` 폴더가 나옵니다. 그 안의 `Triarchy.exe` 를 실행하세요.
새 버전은 같은 위치에 압축을 풀어 덮어쓰면 됩니다. (로그인·설정은 `%APPDATA%\Triarchy` 에 따로 저장되어 그대로 남습니다)
자세한 사용법은 `USAGE.txt` 를 보세요.

## 내 프로젝트 화면을 홈으로
앱 맨 위 ⚙ 설정에서 칸마다 홈 주소를 정할 수 있습니다. (`%APPDATA%\Triarchy\settings.json` 에 저장)
기본값 자체를 바꾸려면 `src/home-urls.local.json` 파일을 만드세요. 이 파일은 `.gitignore` 에 들어 있어 GitHub 에 올라가지 않습니다.
```json
{ "chatgpt": "https://chatgpt.com/g/...", "claude": "https://claude.ai/...", "gemini": "https://gemini.google.com/..." }
```

## 직접 빌드하기 (개발자용)
```
npm install
npm start          # 바로 실행
npm run pack:win   # dist/Triarchy-win32-x64 폴더에 Windows 실행 파일 생성
```

변경 기록은 [CHANGELOG.md](CHANGELOG.md) 를 보세요.
