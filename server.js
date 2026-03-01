const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3003;

const DATA_DIR = path.resolve(process.env.HOTLINE_DATA_DIR || __dirname);
const UPLOADS_DIR = path.join(DATA_DIR, "uploads");
const MESSAGES_FILE = path.join(DATA_DIR, "messages.json");
const TWILIO_BASE_URL = String(process.env.PUBLIC_BASE_URL || "").trim().replace(/\/+$/, "");
const TWILIO_GREETING =
  sanitizeText(
    process.env.TWILIO_GREETING ||
      "You reached Cry Baby Hotline. Leave your worry after the beep. Your message may be shared publicly.",
    280
  ) || "Leave your message after the beep.";
const TWILIO_MAX_LENGTH = Math.min(
  1800,
  Math.max(10, Number.parseInt(process.env.TWILIO_MAX_LENGTH_SECONDS || "120", 10) || 120)
);
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || "";
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || "";
const AREA_CODE_LOCATIONS = {
  "201": "North Jersey",
  "202": "Washington DC",
  "212": "Manhattan",
  "213": "Los Angeles",
  "214": "Dallas",
  "267": "Philadelphia",
  "301": "Maryland",
  "305": "Miami",
  "310": "West Los Angeles",
  "312": "Chicago",
  "323": "Los Angeles",
  "347": "New York City",
  "404": "Atlanta",
  "415": "San Francisco",
  "424": "Los Angeles",
  "469": "Dallas",
  "504": "New Orleans",
  "562": "Long Beach",
  "606": "Eastern Kentucky",
  "617": "Boston",
  "646": "Manhattan",
  "657": "Orange County",
  "678": "Atlanta",
  "702": "Las Vegas",
  "718": "New York City",
  "725": "Las Vegas",
  "747": "Los Angeles",
  "775": "Nevada",
  "818": "San Fernando Valley",
  "832": "Houston",
  "917": "New York City",
  "929": "New York City",
  "949": "Orange County"
};

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

if (!fs.existsSync(MESSAGES_FILE)) {
  fs.writeFileSync(MESSAGES_FILE, JSON.stringify([], null, 2));
}

backfillExistingMessages();

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(UPLOADS_DIR));

function readMessages() {
  try {
    const payload = JSON.parse(fs.readFileSync(MESSAGES_FILE, "utf8"));
    return Array.isArray(payload) ? payload : [];
  } catch {
    return [];
  }
}

function writeMessages(messages) {
  fs.writeFileSync(MESSAGES_FILE, JSON.stringify(messages, null, 2));
}

function sanitizeText(value, maxLength) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildPublicUrl(routePath) {
  if (!TWILIO_BASE_URL) return routePath;
  return `${TWILIO_BASE_URL}${routePath}`;
}

function maskPhone(value) {
  const clean = String(value || "").replace(/[^\d+]/g, "");
  if (clean.length < 4) return "Unknown";
  return `***${clean.slice(-4)}`;
}

function inferLocationFromPhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  const areaCode = digits.length === 11 && digits.startsWith("1") ? digits.slice(1, 4) : digits.slice(0, 3);
  return AREA_CODE_LOCATIONS[areaCode] || "";
}

function buildCallerLocation(body, fromNumber) {
  const city = sanitizeText(body.FromCity || body.CallerCity || "", 64);
  const state = sanitizeText(body.FromState || body.CallerState || "", 32);

  if (city && state) return `${city}, ${state}`;
  if (city) return city;
  if (state) return state;

  return inferLocationFromPhone(fromNumber) || "Location withheld";
}

function backfillExistingMessages() {
  const messages = readMessages();
  let changed = false;

  const updated = messages.map((message) => {
    if (message.source !== "twilio") return message;
    if (message.locationHint && message.locationHint !== "Location withheld") return message;

    const candidateNumber =
      message.callerNumber ||
      message.fromNumber ||
      (typeof message.locationHint === "string" && message.locationHint.includes("+") ? message.locationHint : "");
    const inferred = inferLocationFromPhone(candidateNumber);

    if (!inferred) return message;

    changed = true;
    return {
      ...message,
      locationHint: inferred
    };
  });

  if (changed) {
    writeMessages(updated);
  }
}

function safeOriginalName(name) {
  return path
    .basename(name, path.extname(name))
    .toLowerCase()
    .replace(/[^a-z0-9-_ ]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 60);
}

const ALLOWED_EXTENSIONS = new Set([".mp3", ".wav", ".m4a", ".ogg", ".oga", ".webm", ".aac", ".flac"]);
const ALLOWED_MIME_PREFIXES = ["audio/"];

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const safeExt = ALLOWED_EXTENSIONS.has(ext) ? ext : ".webm";
    const base = safeOriginalName(file.originalname || "voice-message") || "voice-message";
    const unique = `${Date.now()}-${crypto.randomBytes(5).toString("hex")}`;
    cb(null, `${base}-${unique}${safeExt}`);
  }
});

function fileFilter(_req, file, cb) {
  const ext = path.extname(file.originalname || "").toLowerCase();
  const mime = (file.mimetype || "").toLowerCase();

  const extAllowed = ALLOWED_EXTENSIONS.has(ext);
  const mimeAllowed = ALLOWED_MIME_PREFIXES.some((prefix) => mime.startsWith(prefix));

  if (!extAllowed && !mimeAllowed) {
    return cb(new Error("Only audio files are allowed."));
  }

  return cb(null, true);
}

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 25 * 1024 * 1024,
    files: 1
  }
});

app.all("/api/twilio/voice", (_req, res) => {
  const actionUrl = escapeXml(buildPublicUrl("/api/twilio/recording-complete"));
  const statusCallbackUrl = escapeXml(buildPublicUrl("/api/twilio/recording-status"));
  const greeting = escapeXml(TWILIO_GREETING);

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>${greeting}</Say>
  <Record action="${actionUrl}" method="POST" maxLength="${TWILIO_MAX_LENGTH}" playBeep="true" trim="trim-silence" recordingStatusCallback="${statusCallbackUrl}" recordingStatusCallbackMethod="POST"/>
  <Say>No recording received. Goodbye.</Say>
</Response>`;

  res.type("text/xml").send(twiml);
});

app.post("/api/twilio/recording-complete", (_req, res) => {
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Thank you. Your message has been recorded.</Say>
  <Hangup/>
</Response>`;

  res.type("text/xml").send(twiml);
});

app.post("/api/twilio/recording-status", async (req, res) => {
  const recordingStatus = String(req.body.RecordingStatus || "").toLowerCase();
  if (recordingStatus !== "completed") {
    return res.status(200).json({ message: "Ignored non-completed recording status." });
  }

  const twilioRecordingSid = sanitizeText(req.body.RecordingSid || "", 80);
  const recordingUrl = sanitizeText(req.body.RecordingUrl || "", 500);

  if (!twilioRecordingSid || !recordingUrl) {
    return res.status(200).json({ message: "Recording callback missing required fields." });
  }

  try {
    const existing = readMessages();
    if (existing.some((entry) => entry.twilioRecordingSid === twilioRecordingSid)) {
      return res.status(200).json({ message: "Recording already ingested." });
    }

    const authHeaders =
      TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN
        ? {
            Authorization: `Basic ${Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString("base64")}`
          }
        : {};

    const candidates = [`${recordingUrl}.mp3`, recordingUrl];
    let audioBuffer = null;

    for (const candidate of candidates) {
      const response = await fetch(candidate, {
        headers: {
          ...authHeaders,
          "User-Agent": "CryBabyHotline/1.0"
        }
      });

      if (response.ok) {
        const arrayBuffer = await response.arrayBuffer();
        audioBuffer = Buffer.from(arrayBuffer);
        break;
      }
    }

    if (!audioBuffer || !audioBuffer.length) {
      throw new Error("Could not download Twilio recording.");
    }

    const unique = `${Date.now()}-${crypto.randomBytes(5).toString("hex")}`;
    const filename = `call-${unique}.mp3`;
    const filePath = path.join(UPLOADS_DIR, filename);
    fs.writeFileSync(filePath, audioBuffer);

    let durationSeconds = Number(req.body.RecordingDuration);
    if (!Number.isFinite(durationSeconds) || durationSeconds < 0) {
      durationSeconds = null;
    } else {
      durationSeconds = Math.min(Math.round(durationSeconds), 1800);
    }

    const transcriptionText = sanitizeText(req.body.TranscriptionText || "", 140);
    const fromNumber = sanitizeText(req.body.From || "", 64);
    const callerLocation = buildCallerLocation(req.body, fromNumber);

    const entry = {
      id: crypto.randomUUID(),
      nickname: fromNumber ? `Caller ${maskPhone(fromNumber)}` : "Phone Caller",
      worry: transcriptionText || "Worry shared by phone call.",
      locationHint: callerLocation,
      createdAt: new Date().toISOString(),
      durationSeconds,
      sizeBytes: audioBuffer.length,
      audioUrl: `/uploads/${encodeURIComponent(filename)}`,
      source: "twilio",
      callerNumber: fromNumber,
      callerCity: sanitizeText(req.body.FromCity || req.body.CallerCity || "", 64),
      callerState: sanitizeText(req.body.FromState || req.body.CallerState || "", 32),
      twilioCallSid: sanitizeText(req.body.CallSid || "", 80),
      twilioRecordingSid
    };

    const messages = readMessages();
    messages.push(entry);
    writeMessages(messages);

    return res.status(200).json({ message: "Recording ingested." });
  } catch (error) {
    console.error("Twilio recording ingest failed:", error.message);
    return res.status(200).json({ message: "Recording callback received but ingest failed." });
  }
});

app.get("/api/messages", (_req, res) => {
  const messages = readMessages().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ messages });
});

app.post("/api/messages", upload.single("voice"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "An audio file is required." });
  }

  const nickname = sanitizeText(req.body.nickname || "Anonymous", 40) || "Anonymous";
  const worry = sanitizeText(req.body.worry || "", 140);
  const locationHint = sanitizeText(req.body.locationHint || "", 60);

  let durationSeconds = Number(req.body.durationSeconds);
  if (!Number.isFinite(durationSeconds) || durationSeconds < 0) {
    durationSeconds = null;
  } else {
    durationSeconds = Math.min(Math.round(durationSeconds), 1800);
  }

  const stats = fs.statSync(req.file.path);
  const message = {
    id: crypto.randomUUID(),
    nickname,
    worry,
    locationHint,
    createdAt: new Date().toISOString(),
    durationSeconds,
    sizeBytes: stats.size,
    audioUrl: `/uploads/${encodeURIComponent(req.file.filename)}`
  };

  const messages = readMessages();
  messages.push(message);
  writeMessages(messages);

  return res.status(201).json({ message: "Voice message posted.", entry: message });
});

app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: err.message });
  }

  if (err) {
    return res.status(400).json({ error: err.message || "Upload failed." });
  }

  return res.status(500).json({ error: "Server error." });
});

app.listen(PORT, () => {
  console.log(`Cry Baby Hotline running on http://localhost:${PORT}`);
});
