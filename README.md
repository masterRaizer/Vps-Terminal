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

## Интерфейс

- Верхняя полоса: меню, вкладка «Хранилище», вкладка SFTP, вкладки SSH-сессий с цветом статуса, «+» — новое подключение.
- Хранилище: левое меню (Хосты, Ключи, Проброс портов, Сниппеты, Известные хосты, Журнал), строка поиска/подключения (`ssh user@host -p 22`, Ctrl+K), сетки карточек, редактор в выезжающей правой панели.
- Сессия: терминал во всё окно + правая панель (поиск Ctrl+Shift+F, действия, сниппеты, история, темы и размер шрифта).
- SFTP: две панели — локальная и удалённая.
- Палитра интерфейса — тёмно-синяя (`#151a2b` / `#1d2134` / карточки `#282d41`, акцент `#1d8cf8`); 7 тем терминала: Navy Green (по умолчанию), Navy Classic, Paper, Ember, Glacier, Phosphor, Cinder.

## Дорожная карта

1. ✅ Скелет Electron+React+Vite, безопасный preload, SSH-терминал по паролю
2. Менеджер хостов + SQLite + хранилище секретов
3. Ключи, SFTP, вкладки/сплиты
4. Сниппеты, туннели, known_hosts (TOFU)
5. Шифрованный vault + сервер синхронизации на VPS
6. electron-builder + GitHub Actions → .exe
