# HEART AI — HEART FM NEWS Auto-Poster Bot

A Facebook Messenger bot built with `ws3-fca` and `stfca` that auto-posts the latest Tagalog / Philippines and worldwide news every **8 minutes, 24/7** with both **image + text** from `newsdata.io`.

## Files

| File | Purpose |
|---|---|
| `main.js` | Bot entry point — login, command listener, autopost scheduler |
| `Database.js` | Free, file-based JSON storage (writes to `database.json`) — unlimited capacity |
| `appstate.json` | **You must paste your Facebook session cookies here** (array format) |
| `package.json` | Dependencies: `ws3-fca`, `stfca` |

## Command (only one)

| Command | Who | What |
|---|---|---|
| `autopost on` | Admin only (`61588479630286`) | Starts auto-posting news in the current thread every 8 min |
| `autopost off` | Admin only (`61588479630286`) | Stops auto-posting in the current thread |

Non-admin users get an "ACCESS DENIED" reply.

## How to use

1. Open `appstate.json` and paste your real Facebook appstate (a JSON array of cookies). The current file is an empty `[]` placeholder.
2. The workflow `HEART AI` runs `node main.js` and stays alive 24/7.
3. From the admin Facebook account (UID `61588479630286`), send `autopost on` in any thread/group where you want the bot to post.
4. The bot will immediately post one news item, then continue every 8 minutes forever.
5. Send `autopost off` to stop posting in that thread.

## News sources (rotated)

- `https://newsdata.io/api/1/latest?apikey=…&q=Philippines`
- `https://newsdata.io/api/1/latest?apikey=…&country=ph&language=tl`
- `https://newsdata.io/api/1/latest?apikey=…&category=top,world`

Articles already posted are remembered in `database.json` to avoid duplicates.

## Health endpoint

`GET /` or `GET /health` on port `5000` returns JSON with bot status, total posts, and uptime.
