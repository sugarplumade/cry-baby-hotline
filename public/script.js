const uploadForm = document.getElementById("upload-form");
const voiceInput = document.getElementById("voice");
const submitBtn = document.getElementById("submit-btn");
const statusEl = document.getElementById("status");
const callsFeedEl = document.getElementById("calls-feed");

let activePlayer = null;

function setStatus(message, isError = false) {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
}

function formatDateTime(iso) {
  const date = new Date(iso);
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function classifyEmotion(message) {
  const haystack = `${message.worry || ""} ${message.locationHint || ""}`.toLowerCase();

  if (/(grief|mourning|loss|lost|death|dying|funeral|heartbreak|broke my heart)/.test(haystack)) return "grief";
  if (/(angry|anger|furious|rage|mad|pissed|resent|resentment|frustrat)/.test(haystack)) return "anger";
  if (/(afraid|fear|terrified|scared|panic|anxious|anxiety|unsafe|worry)/.test(haystack)) return "fear";
  if (/(lonely|alone|isolated|empty|numb|sad|depressed|depression|hopeless)/.test(haystack)) return "sadness";
  if (/(love|joy|grateful|gratitude|relief|hope|healing|tender|peace)/.test(haystack)) return "hope";
  if (/(confused|unclear|uncertain|lost|disoriented|overwhelmed|mixed)/.test(haystack)) return "confusion";
  return "longing";
}

function buildCallCard(message) {
  const mood = classifyEmotion(message);

  const card = document.createElement("article");
  card.className = "call-card";
  card.dataset.mood = mood;

  const header = document.createElement("div");
  header.className = "call-header";

  const city = document.createElement("p");
  city.className = "call-city";
  city.textContent = (message.locationHint || "Unknown").split(",")[0];

  const date = document.createElement("p");
  date.className = "call-date";
  date.textContent = formatDateTime(message.createdAt);

  header.append(city, date);

  const moodTag = document.createElement("p");
  moodTag.className = "call-mood";
  moodTag.textContent = mood;

  const text = document.createElement("p");
  text.className = "call-text";
  text.textContent = message.transcript || message.worry || "Voice note from the hotline.";

  const player = document.createElement("audio");
  player.className = "call-player";
  player.controls = true;
  player.preload = "none";
  player.src = message.audioUrl;

  player.addEventListener("play", () => {
    if (activePlayer && activePlayer !== player) {
      activePlayer.pause();
      activePlayer.currentTime = 0;
      activePlayer.closest(".call-card")?.classList.remove("is-playing");
    }
    activePlayer = player;
    card.classList.add("is-playing");
  });

  player.addEventListener("pause", () => {
    card.classList.remove("is-playing");
    if (activePlayer === player) activePlayer = null;
  });

  player.addEventListener("ended", () => {
    card.classList.remove("is-playing");
    if (activePlayer === player) activePlayer = null;
  });

  card.append(header, moodTag, text, player);
  return card;
}

async function fetchMessages() {
  const res = await fetch("/api/messages");
  if (!res.ok) throw new Error("Could not load messages.");
  const data = await res.json();
  return Array.isArray(data.messages) ? data.messages : [];
}

async function loadCalls() {
  if (!callsFeedEl) return;

  const messages = await fetchMessages();
  callsFeedEl.innerHTML = "";

  if (!messages.length) {
    const empty = document.createElement("p");
    empty.className = "calls-empty";
    empty.textContent = "No calls yet.";
    callsFeedEl.appendChild(empty);
    return;
  }

  messages.forEach((message) => {
    callsFeedEl.appendChild(buildCallCard(message));
  });
}

function getAudioDuration(file) {
  return new Promise((resolve) => {
    if (!file) {
      resolve(null);
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    const audio = document.createElement("audio");
    audio.preload = "metadata";
    audio.src = objectUrl;

    const finish = (value) => {
      URL.revokeObjectURL(objectUrl);
      resolve(Number.isFinite(value) ? Math.round(value) : null);
    };

    audio.onloadedmetadata = () => finish(audio.duration);
    audio.onerror = () => finish(null);
  });
}

if (uploadForm) {
  uploadForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const file = voiceInput?.files?.[0];
    if (!file) {
      setStatus("Choose an audio file before posting.", true);
      return;
    }

    if (submitBtn) submitBtn.disabled = true;
    setStatus("Posting voice message...");

    try {
      const duration = await getAudioDuration(file);
      const formData = new FormData(uploadForm);
      if (duration !== null) {
        formData.append("durationSeconds", String(duration));
      }

      const res = await fetch("/api/messages", {
        method: "POST",
        body: formData
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Upload failed.");
      }

      uploadForm.reset();
      setStatus("Voice message posted.");
    } catch (error) {
      setStatus(error.message || "Upload failed.", true);
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });
}

if (callsFeedEl) {
  loadCalls().catch(() => {});
}
