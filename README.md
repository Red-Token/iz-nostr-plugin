# nos2x для Electron

Адаптация расширения [nos2x](https://github.com/fiatjaf/nos2x) для использования в Electron-приложениях. Позволяет добавить поддержку [протокола Nostr](https://github.com/nostr-protocol/nostr) в ваше Electron приложение.

## Особенности

- Предоставляет глобальный `window.nostr` API в ваших веб-страницах
- Безопасное хранение ключей с использованием средств Electron
- Управление разрешениями для различных операций
- Поддержка шифрования сообщений (NIP-04, NIP-44)
- Полностью совместим со стандартным [NIP-07](https://github.com/nostr-protocol/nips/blob/master/07.md)

## Установка

### Вариант 1: Интеграция в существующее Electron приложение

```bash
# Клонирование репозитория
git clone https://github.com/yourusername/nos2x-electron.git

# Переход в директорию проекта
cd nos2x-electron

# Установка зависимостей
npm install

# Сборка расширения
npm run build
```

После сборки содержимое директории `dist/` нужно скопировать в ваш проект.

### Вариант 2: Установка через npm

```bash
npm install nos2x-electron --save
```

## Интеграция

### Основной процесс (main)

```javascript
// Импортируйте инициализатор расширения
// Важно: для ESM нужно добавить расширение .js к пути импорта
import {initializeExtension} from 'nos2x-electron'
// или при локальном копировании файлов:
// import { initializeExtension } from './extension-init.js';

import {app, BrowserWindow} from 'electron'
import path from 'path'

// Укажите путь к файлам расширения
const extensionPath = path.join(__dirname, 'node_modules/nos2x-electron/dist/extension')
// или при локальном копировании:
// const extensionPath = path.join(__dirname, 'extension');

// Инициализируйте расширение
const nos2x = initializeExtension({
	extensionPath: extensionPath,
	debug: true // установите false в production
})

// Создание окна с preload из расширения
function createWindow() {
	const mainWindow = new BrowserWindow({
		width: 800,
		height: 600,
		webPreferences: {
			preload: nos2x.getPreloadPath(), // Используйте preload из расширения
			contextIsolation: true,
			nodeIntegration: false
		}
	})

	// Загрузите вашу страницу
	mainWindow.loadFile('index.html')
	// или
	// mainWindow.loadURL('https://your-site.com');
}

app.whenReady().then(() => {
	createWindow()
})
```

### Важно: Настройка окон разрешений и настроек

При вызове некоторых API, особенно требующих подписи или шифрования, расширение может открывать дополнительные окна:

1. **Окно подтверждения (prompt)** - открывается когда приложение запрашивает разрешение на использование приватного ключа
2. **Окно настроек (options)** - позволяет пользователю управлять ключами и разрешениями

Для корректной работы этих окон, необходимо:

```javascript
// В вашем main процессе
app.on('web-contents-created', (_, contents) => {
	// Разрешить создание новых окон из расширения
	contents.setWindowOpenHandler(({url}) => {
		// Можно добавить дополнительные проверки url при необходимости
		return {action: 'allow'}
	})
})
```

Также убедитесь, что у вашего приложения есть права на создание новых окон. Если вы используете Content Security Policy (CSP), добавьте:

```html
<!-- В вашем HTML -->
<meta
	http-equiv="Content-Security-Policy"
	content="default-src 'self'; script-src 'self'; child-src 'self';"
/>
```

### Использование в веб-странице

После интеграции, `window.nostr` станет доступным на всех веб-страницах вашего приложения:

```javascript
// Проверка доступности API
if (window.nostr) {
	// Получение публичного ключа
	const pubkey = await window.nostr.getPublicKey()
	console.log('Публичный ключ:', pubkey)

	// Подписание события
	const event = await window.nostr.signEvent({
		kind: 1,
		created_at: Math.floor(Date.now() / 1000),
		tags: [],
		content: 'Привет из Electron!'
	})
	console.log('Подписанное событие:', event)

	// Шифрование сообщения (NIP-04)
	const encrypted = await window.nostr.nip04.encrypt(recipientPubkey, 'Секретное сообщение')
	console.log('Зашифрованное сообщение:', encrypted)

	// Дешифрование сообщения
	const decrypted = await window.nostr.nip04.decrypt(senderPubkey, encryptedMessage)
	console.log('Расшифрованное сообщение:', decrypted)
}
```

## Компоненты UI

Расширение включает три основных UI компонента:

1. **prompt.html/jsx** - диалог для запроса разрешений (обязательный)
2. **options.html/jsx** - страница настроек (опциональный)
3. **popup.html/jsx** - всплывающее меню (опциональный)

При первом использовании функций, требующих доступа к приватному ключу, пользователю будет показано окно настроек для импорта/создания ключа, а затем окно подтверждения для разрешения доступа.

## Структура проекта

```
dist/
├── extension/           # Скомпилированные файлы расширения
│   ├── background.js    # Основная логика расширения
│   ├── content-script.js # Скрипт для внедрения в страницы
│   ├── nostr-provider.js # API window.nostr
│   ├── preload.js       # Preload скрипт для Electron
│   ├── prompt.html      # HTML для диалога разрешений
│   ├── prompt.js        # JS для диалога разрешений
│   ├── ...              # Прочие файлы
├── extension-init.js    # Модуль инициализации для main процесса
├── index.js             # Экспорт основных функций
```

## API

### Main процесс

```typescript
interface InitOptions {
	extensionPath?: string // Путь к файлам расширения
	debug?: boolean // Включение отладочных сообщений
}

function initializeExtension(options?: InitOptions): {
	getPreloadPath(): string // Возвращает путь к preload.js
}
```

### Window.nostr (клиентский API)

```typescript
interface NostrAPI {
	getPublicKey(): Promise<string>
	signEvent(event: NostrEvent): Promise<NostrEvent>
	getRelays?(): Promise<Record<string, {read: boolean; write: boolean}>>
	nip04: {
		encrypt(pubkey: string, plaintext: string): Promise<string>
		decrypt(pubkey: string, ciphertext: string): Promise<string>
	}
	nip44?: {
		encrypt(pubkey: string, plaintext: string): Promise<string>
		decrypt(pubkey: string, ciphertext: string): Promise<string>
	}
}
```

## Разработка

### Сборка проекта

```bash
# Стандартная сборка с sourcemaps
npm run build

# Production сборка (без sourcemaps)
npm run build:prod

# Очистка директорий сборки
npm run clean
```

### Требования к зависимостям

- `electron` >= 16.0.0
- `nostr-tools` >= 1.14.0

## Лицензия

MIT
