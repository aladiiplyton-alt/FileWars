# DropPaste

Simple file & link sharing between devices — no accounts, no registration.

## Quick Start

```bash
npm install
npm start
```

Open http://localhost:3000 in your browser.

## How it works

1. Click **"Создать комнату"** — a room with a 6-character code is created.
2. Upload files, add links.
3. Open the same URL on another device — all data syncs instantly.
4. Rooms auto-expire after **24 hours** (including files).

## Features

- Drag & drop file upload
- Save links with optional titles
- Copy room code to clipboard
- Dark UI
- No accounts / no database
- Auto-cleanup → nothing stays forever on the server

## Project Structure

```
file-share/
├── src/server.js      # Express server
├── public/
│   ├── index.html     # Home page + room page
│   └── 404.html       # Room-not-found page
├── uploads/           # Uploaded file storage
└── package.json
```

## Tech

- Node.js + Express
- Multer (multipart file uploads)
- In-memory room storage
- Vanilla JS frontend

## Deploy anywhere

One liners:
- **Railway:** connect Git repo, `npm start`, done.
- **Render / Fly / VPS:** copy `src/`, `public/`, `package.json`; run `npm install && npm start`.

Make sure to set `PORT` env var on remote (most hosts do automatically).
