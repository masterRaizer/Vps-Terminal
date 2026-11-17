# Vps Terminal SSH

Настольный SSH/SFTP-клиент для Windows: Electron + React + TypeScript + Vite.

## Запуск

```bash
npm install
npm run dev        # режим разработки
npm run build      # сборка в out/
npm test           # интеграционные тесты SSH (встроенный ssh2-сервер)
npm run typecheck
```

## Архитектура

| Слой | Где | Что делает |
|---|---|---|
| main | `src/main` | ssh2-соединения (`SshManager`), проверка ключа сервера, валидация IPC, CSP |
| preload | `src/preload` | `contextBridge` → `window.api`, без доступа к Node из renderer |
| renderer | `src/renderer` | React 19 + zustand, xterm.js (fit / webgl / search) |
| shared | `src/shared/ipc.ts` | единый контракт IPC и типы |

Безопасность: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, запрет навигации и новых окон, отказ во всех permission-запросах, CSP. Пароль передаётся в main один раз для рукопожатия и нигде не сохраняется.

## Палитры

- **Harbor** (по умолчанию) — сине-чёрный фон `#0b0e14`, акцент мятный `#2dd4bf`, второй акцент `#6aa8ff`.
- **Ember** — тёплый графит `#121110`, акцент янтарный `#f5a524`, второй акцент `#5ab0ff`.

Переключение — кнопка палитры в строке состояния.

## Дорожная карта

1. ✅ Скелет Electron+React+Vite, безопасный preload, SSH-терминал по паролю
2. Менеджер хостов + SQLite + хранилище секретов
3. Ключи, SFTP, вкладки/сплиты
4. Сниппеты, туннели, known_hosts (TOFU)
5. Шифрованный vault + сервер синхронизации на VPS
6. electron-builder + GitHub Actions → .exe
