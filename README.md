# Cry Baby Hotline

A standalone website for hosting public voice messages submitted from your hotline project.

## Features

- Brand logo + favicon support via `public/crybabyredlogo.png`
- Upload a voice message (`mp3`, `wav`, `m4a`, `ogg`, `webm`, `aac`, `flac`)
- Attach optional metadata: nickname, worry topic, location tag
- Public feed of playable recordings sorted newest first
- Local file storage in `uploads/` with metadata in `messages.json`
- Optional Twilio phone number integration so callers can leave voicemails directly

## Run

```bash
cd "/Users/adekunlesomade/Documents/New project/apps/cry-baby-hotline"
npm install
npm start
```

Then open `http://localhost:3003`.

## Deploy To The Web (Render)

This is the fastest way to get a permanent public URL.

### 1) Push this folder to GitHub

Render deploys from a Git repo. Push your project to GitHub first.

### 2) Create a Web Service on Render

- New -> `Web Service`
- Connect your GitHub repo
- Root Directory: `apps/cry-baby-hotline`
- Runtime: `Node`
- Build Command: `npm install`
- Start Command: `npm start`

### 3) Set Render environment variables

Add these in Render -> Environment:

- `PUBLIC_BASE_URL=https://YOUR-RENDER-DOMAIN.onrender.com`
- `TWILIO_ACCOUNT_SID=AC...`
- `TWILIO_AUTH_TOKEN=...`
- `TWILIO_GREETING=You reached Cry Baby Hotline. Leave your worry after the beep.`
- `TWILIO_MAX_LENGTH_SECONDS=120`

### 4) Update Twilio webhook

In Twilio Console for your number:

- `A Call Comes In` -> `Webhook`
- Method: `POST`
- URL: `https://YOUR-RENDER-DOMAIN.onrender.com/api/twilio/voice`

### 5) Test from another device

Open your Render URL in any browser and confirm you can view/upload/play audio.

Important:
- This app stores uploads on local disk (`uploads/`), which can be lost on restarts/redeploys in some hosting plans. Use persistent disk/object storage for long-term archives.
- Rotate Twilio auth token if it was ever shared.

## Direct Call-In Number (Twilio)

You can connect a real phone number so people call and recordings land in this site automatically.

### 1) Start the app with Twilio env vars

```bash
cd "/Users/adekunlesomade/Documents/New project/apps/cry-baby-hotline"
PUBLIC_BASE_URL="https://YOUR-PUBLIC-URL" \
TWILIO_ACCOUNT_SID="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" \
TWILIO_AUTH_TOKEN="your_auth_token" \
TWILIO_GREETING="You reached Cry Baby Hotline. Leave your worry after the beep." \
TWILIO_MAX_LENGTH_SECONDS="120" \
npm start
```

Notes:
- `PUBLIC_BASE_URL` is required for Twilio callbacks (for example an `ngrok` URL).
- `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN` are used to download recordings from Twilio.

### 2) Expose local server to the internet

Example with `ngrok`:

```bash
ngrok http 3003
```

Set `PUBLIC_BASE_URL` to the HTTPS forwarding URL from ngrok.

### 3) Configure Twilio number

In Twilio Console for your purchased number:
- `Voice Configuration` -> `A Call Comes In`
- Set to `Webhook`
- Method: `HTTP POST`
- URL: `https://YOUR-PUBLIC-URL/api/twilio/voice`

### 4) Call the number

Flow:
- Caller hears greeting
- Twilio records message
- App ingests the recording via `/api/twilio/recording-status`
- Message appears in the site feed
