const uploadForm = document.getElementById("upload-form");
const voiceInput = document.getElementById("voice");
const submitBtn = document.getElementById("submit-btn");
const statusEl = document.getElementById("status");
const orbitalFeedEl = document.getElementById("orbital-feed");
const unsmileyMarkEl = document.querySelector(".unsmiley-mark");
const activePlayers = new Set();
const orbitShells = new Set();
let mouthAnimationFrame = null;

function setStatus(message, isError = false) {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
}

function formatDate(iso) {
  const date = new Date(iso);
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(date);
}

function formatDuration(value) {
  if (!Number.isFinite(value) || value <= 0) return "Duration unknown";
  const mins = Math.floor(value / 60);
  const secs = value % 60;
  if (mins === 0) return `${secs}s`;
  return `${mins}m ${secs.toString().padStart(2, "0")}s`;
}

function buildOrbitSummary(message) {
  const lead = message.transcript || message.worry || "Voice note from the hotline.";
  const duration = formatDuration(message.durationSeconds);
  return duration === "Duration unknown" ? lead : `${lead} ${duration}.`;
}

function chunkTranscript(text) {
  const clean = String(text || "")
    .replace(/\s+/g, " ")
    .trim();

  if (!clean) return ["No transcript available."];

  const clauses = clean
    .split(/(?<=[.!?])\s+|,\s+|;\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  const chunks = [];
  clauses.forEach((clause) => {
    const words = clause.split(/\s+/).filter(Boolean);
    if (words.length <= 7) {
      chunks.push(clause);
      return;
    }

    for (let index = 0; index < words.length; index += 5) {
      chunks.push(words.slice(index, index + 5).join(" "));
    }
  });

  return chunks.slice(0, 18);
}

function classifyEmotion(message) {
  const haystack = `${message.worry || ""} ${message.locationHint || ""}`.toLowerCase();

  if (/(grief|mourning|loss|lost|death|dying|funeral|heartbreak|broke my heart)/.test(haystack)) {
    return "grief";
  }
  if (/(angry|anger|furious|rage|mad|pissed|resent|resentment|frustrat)/.test(haystack)) {
    return "anger";
  }
  if (/(afraid|fear|terrified|scared|panic|anxious|anxiety|unsafe|worry)/.test(haystack)) {
    return "fear";
  }
  if (/(lonely|alone|isolated|empty|numb|sad|depressed|depression|hopeless)/.test(haystack)) {
    return "sadness";
  }
  if (/(love|joy|grateful|gratitude|relief|hope|healing|tender|peace)/.test(haystack)) {
    return "hope";
  }
  if (/(confused|unclear|uncertain|lost|disoriented|overwhelmed|mixed)/.test(haystack)) {
    return "confusion";
  }

  return "longing";
}

function getMoonSize(durationSeconds) {
  const minSize = 160;
  const maxSize = 300;
  const safeDuration = Number.isFinite(durationSeconds) ? Math.max(0, Math.min(durationSeconds, 180)) : 45;
  const ratio = safeDuration / 180;
  return `${Math.round(minSize + (maxSize - minSize) * ratio)}px`;
}

function stopMouthAnimationIfIdle() {
  if (!unsmileyMarkEl || activePlayers.size) return;
  unsmileyMarkEl.classList.remove("is-speaking");
  unsmileyMarkEl.style.removeProperty("--mouth-open");
  if (mouthAnimationFrame) {
    cancelAnimationFrame(mouthAnimationFrame);
    mouthAnimationFrame = null;
  }
}

function tickMouthAnimation() {
  if (!unsmileyMarkEl || !activePlayers.size) {
    stopMouthAnimationIfIdle();
    return;
  }

  let energy = 0;
  activePlayers.forEach((player) => {
    if (player.paused || player.ended) return;
    energy += 0.9 + Math.abs(Math.sin(player.currentTime * 7.2)) * 0.95;
  });

  const mouthOpen = Math.min(2.35, 1 + energy * 0.22);
  unsmileyMarkEl.classList.add("is-speaking");
  unsmileyMarkEl.style.setProperty("--mouth-open", mouthOpen.toFixed(2));
  mouthAnimationFrame = requestAnimationFrame(tickMouthAnimation);
}

function startMouthAnimation(player) {
  if (!unsmileyMarkEl) return;
  activePlayers.add(player);
  if (!mouthAnimationFrame) {
    mouthAnimationFrame = requestAnimationFrame(tickMouthAnimation);
  }
}

function stopMouthAnimation(player) {
  activePlayers.delete(player);
  stopMouthAnimationIfIdle();
}

function pauseAllOrbits() {
  orbitShells.forEach((shell) => shell.classList.add("is-paused"));
}

function resumeAllOrbits() {
  orbitShells.forEach((shell) => shell.classList.remove("is-paused"));
}

function buildOrbitCard(message, index) {
  const shell = document.createElement("div");
  shell.className = `orbit-shell orbit-shell-${(index % 6) + 1}`;
  orbitShells.add(shell);

  const article = document.createElement("article");
  article.className = "orbit-card";
  article.style.setProperty("--moon-size", getMoonSize(message.durationSeconds));
  const emotion = classifyEmotion(message);
  article.dataset.emotion = emotion;
  article.dataset.active = "false";

  const city = document.createElement("p");
  city.className = "orbit-city";
  city.textContent = (message.locationHint || "Unknown").split(",")[0];

  const transcript = document.createElement("p");
  transcript.className = "orbit-transcript";
  const transcriptChunks = chunkTranscript(message.transcript || message.worry);
  transcript.textContent = transcriptChunks[0];

  const player = document.createElement("audio");
  player.controls = false;
  player.preload = "none";
  player.src = message.audioUrl;
  const updateTranscriptChunk = () => {
    if (!transcriptChunks.length) return;
    if (!Number.isFinite(player.duration) || player.duration <= 0) {
      transcript.textContent = transcriptChunks[0];
      return;
    }

    const ratio = Math.min(0.999, Math.max(0, player.currentTime / player.duration));
    const chunkIndex = Math.min(transcriptChunks.length - 1, Math.floor(ratio * transcriptChunks.length));
    transcript.textContent = transcriptChunks[chunkIndex];
  };
  player.addEventListener("play", () => {
    startMouthAnimation(player);
    pauseAllOrbits();
    article.dataset.active = "true";
    article.dataset.popping = "true";
    updateTranscriptChunk();
  });
  player.addEventListener("pause", () => {
    stopMouthAnimation(player);
    article.dataset.active = "false";
    article.dataset.popping = "false";
    transcript.textContent = transcriptChunks[0];
    resumeAllOrbits();
  });
  player.addEventListener("ended", () => {
    stopMouthAnimation(player);
    article.dataset.active = "false";
    article.dataset.popping = "false";
    transcript.textContent = transcriptChunks[0];
    resumeAllOrbits();
    player.currentTime = 0;
  });
  player.addEventListener("timeupdate", updateTranscriptChunk);

  article.append(city, transcript, player);

  article.addEventListener("click", () => {
    if (player.paused || player.ended) {
      const playAttempt = player.play();
      if (playAttempt && typeof playAttempt.catch === "function") {
        playAttempt.catch(() => {});
      }
    } else {
      player.pause();
    }
  });

  shell.appendChild(article);
  return shell;
}

async function fetchMessages() {
  const res = await fetch("/api/messages");
  if (!res.ok) {
    throw new Error("Could not load messages.");
  }

  const data = await res.json();
  return Array.isArray(data.messages) ? data.messages : [];
}

async function loadOrbitalMessages() {
  if (!orbitalFeedEl) return;

  const messages = await fetchMessages();
  orbitalFeedEl.innerHTML = "";

  if (!messages.length) {
    const empty = document.createElement("p");
    empty.className = "orbit-empty";
    empty.textContent = "No messages in orbit yet.";
    orbitalFeedEl.appendChild(empty);
    return;
  }

  messages.slice(0, 6).forEach((message, index) => {
    orbitalFeedEl.appendChild(buildOrbitCard(message, index));
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

if (orbitalFeedEl) {
  loadOrbitalMessages().catch(() => {});
}
