const uploadForm = document.getElementById("upload-form");
const voiceInput = document.getElementById("voice");
const submitBtn = document.getElementById("submit-btn");
const statusEl = document.getElementById("status");
const callsFeedEl = document.getElementById("calls-feed");
const sceneStageEl = document.getElementById("scene-stage");
const scenePlayBtn = document.getElementById("scene-play-btn");
const scenePlayer = document.getElementById("scene-player");
const sceneCaptionEl = document.getElementById("scene-caption");
const sceneMetaEl = document.getElementById("scene-meta");
const sceneLocationEl = document.getElementById("scene-location");

let activePlayer = null;
let sceneMessage = null;
let sceneTimer = null;
let sceneFragments = [];

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

function buildSceneFragments(message) {
  const source = (message.transcript || message.worry || "A caller leaves a message for the city.").trim();
  const cleaned = source.replace(/\s+/g, " ");
  if (!cleaned) return ["A caller leaves a message for the city."];

  const words = cleaned.split(" ");
  const fragments = [];

  for (let index = 0; index < words.length; index += 6) {
    fragments.push(words.slice(index, index + 6).join(" "));
  }

  return fragments;
}

function setSceneMessage(message) {
  sceneMessage = message;
  sceneFragments = buildSceneFragments(message);

  if (sceneLocationEl) {
    sceneLocationEl.textContent = `${(message.locationHint || "Unknown place").split(",")[0]} • ${formatDateTime(message.createdAt)}`;
  }

  if (sceneCaptionEl) {
    sceneCaptionEl.textContent = sceneFragments[0] || "A caller leaves a message for the city.";
  }

  if (sceneMetaEl) {
    sceneMetaEl.textContent = "Latest call ready to stage.";
  }

  if (scenePlayer) {
    scenePlayer.src = message.audioUrl;
  }

  if (scenePlayBtn) {
    scenePlayBtn.disabled = false;
    scenePlayBtn.textContent = "Enter Booth";
  }
}

function clearSceneTimer() {
  if (sceneTimer) {
    clearInterval(sceneTimer);
    sceneTimer = null;
  }
}

function updateSceneCaption() {
  if (!scenePlayer || !sceneCaptionEl || !sceneFragments.length) return;

  const duration = scenePlayer.duration || sceneMessage?.durationSeconds || 0;
  if (!duration) {
    sceneCaptionEl.textContent = sceneFragments[0];
    return;
  }

  const progress = Math.min(scenePlayer.currentTime / duration, 0.999);
  const index = Math.min(sceneFragments.length - 1, Math.floor(progress * sceneFragments.length));
  sceneCaptionEl.textContent = sceneFragments[index];
}

async function startScenePlayback() {
  if (!sceneMessage || !scenePlayer || !sceneStageEl) return;

  if (activePlayer && activePlayer !== scenePlayer) {
    activePlayer.pause();
    activePlayer.currentTime = 0;
    activePlayer.closest(".call-card")?.classList.remove("is-playing");
  }

  clearSceneTimer();
  sceneStageEl.classList.remove("is-ended");
  sceneStageEl.classList.add("is-playing");
  scenePlayBtn.textContent = "Replay Scene";
  sceneMetaEl.textContent = "Caller crossing the street into the booth.";
  activePlayer = scenePlayer;

  try {
    scenePlayer.currentTime = 0;
    await scenePlayer.play();
    updateSceneCaption();
    sceneTimer = setInterval(updateSceneCaption, 220);
  } catch (error) {
    sceneStageEl.classList.remove("is-playing");
    sceneMetaEl.textContent = "Playback was blocked. Try again.";
  }
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

  if (sceneStageEl && messages[0]) {
    setSceneMessage(messages[0]);
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

if (scenePlayBtn) {
  scenePlayBtn.addEventListener("click", () => {
    startScenePlayback();
  });
}

if (scenePlayer && sceneStageEl) {
  scenePlayer.addEventListener("play", () => {
    sceneStageEl.classList.add("is-playing");
    sceneMetaEl.textContent = "The booth is carrying the call.";
  });

  scenePlayer.addEventListener("pause", () => {
    if (!scenePlayer.ended) {
      sceneStageEl.classList.remove("is-playing");
      sceneMetaEl.textContent = "Scene paused.";
    }
    clearSceneTimer();
    if (activePlayer === scenePlayer) activePlayer = null;
  });

  scenePlayer.addEventListener("ended", () => {
    clearSceneTimer();
    sceneStageEl.classList.remove("is-playing");
    sceneStageEl.classList.add("is-ended");
    sceneMetaEl.textContent = "Scene complete. Enter again to replay.";
    if (sceneCaptionEl && sceneFragments.length) {
      sceneCaptionEl.textContent = sceneFragments[sceneFragments.length - 1];
    }
    if (activePlayer === scenePlayer) activePlayer = null;
  });
}
