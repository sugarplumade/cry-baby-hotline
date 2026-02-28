const uploadForm = document.getElementById("upload-form");
const voiceInput = document.getElementById("voice");
const submitBtn = document.getElementById("submit-btn");
const statusEl = document.getElementById("status");
const orbitalFeedEl = document.getElementById("orbital-feed");

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
  const lead = message.worry || "Voice note from the hotline.";
  const duration = formatDuration(message.durationSeconds);
  return duration === "Duration unknown" ? lead : `${lead} ${duration}.`;
}

function buildOrbitCard(message, index) {
  const shell = document.createElement("div");
  shell.className = `orbit-shell orbit-shell-${(index % 6) + 1}`;

  const article = document.createElement("article");
  article.className = "orbit-card";

  const meta = document.createElement("p");
  meta.className = "orbit-meta";
  const location = message.locationHint || "Location withheld";
  meta.textContent = `${formatDate(message.createdAt)} • ${location}`;

  const summary = document.createElement("p");
  summary.className = "orbit-summary";
  summary.textContent = buildOrbitSummary(message);

  const player = document.createElement("audio");
  player.controls = true;
  player.preload = "none";
  player.src = message.audioUrl;

  article.append(meta, summary, player);
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
