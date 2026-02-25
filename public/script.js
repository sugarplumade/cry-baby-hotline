const uploadForm = document.getElementById("upload-form");
const voiceInput = document.getElementById("voice");
const submitBtn = document.getElementById("submit-btn");
const statusEl = document.getElementById("status");
const feedEl = document.getElementById("message-feed");
const refreshBtn = document.getElementById("refresh-btn");

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
}

function formatDate(iso) {
  const date = new Date(iso);
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function formatDuration(value) {
  if (!Number.isFinite(value) || value <= 0) return "Duration unknown";
  const mins = Math.floor(value / 60);
  const secs = value % 60;
  if (mins === 0) return `${secs}s`;
  return `${mins}m ${secs.toString().padStart(2, "0")}s`;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function buildCard(message) {
  const article = document.createElement("article");
  article.className = "message-card";

  const meta = document.createElement("div");
  meta.className = "message-meta";

  const name = document.createElement("strong");
  name.textContent = message.nickname || "Anonymous";

  const time = document.createElement("time");
  time.dateTime = message.createdAt;
  time.textContent = formatDate(message.createdAt);

  meta.append(name, time);

  const sub = document.createElement("p");
  sub.className = "message-sub";
  const tags = [];
  if (message.worry) tags.push(message.worry);
  if (message.locationHint) tags.push(`@ ${message.locationHint}`);
  tags.push(formatDuration(message.durationSeconds));
  if (message.sizeBytes) tags.push(formatBytes(message.sizeBytes));
  sub.textContent = tags.join(" • ");

  const player = document.createElement("audio");
  player.controls = true;
  player.preload = "none";
  player.src = message.audioUrl;

  article.append(meta, sub, player);
  return article;
}

async function loadMessages() {
  const res = await fetch("/api/messages");
  if (!res.ok) {
    throw new Error("Could not load messages.");
  }

  const data = await res.json();
  feedEl.innerHTML = "";

  if (!data.messages.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "No hotline recordings yet. Upload the first one.";
    feedEl.appendChild(empty);
    return;
  }

  data.messages.forEach((message) => {
    feedEl.appendChild(buildCard(message));
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

uploadForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const file = voiceInput.files?.[0];
  if (!file) {
    setStatus("Choose an audio file before posting.", true);
    return;
  }

  submitBtn.disabled = true;
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
    await loadMessages();
  } catch (error) {
    setStatus(error.message || "Upload failed.", true);
  } finally {
    submitBtn.disabled = false;
  }
});

refreshBtn.addEventListener("click", () => {
  loadMessages().catch((error) => {
    setStatus(error.message, true);
  });
});

loadMessages().catch((error) => {
  setStatus(error.message, true);
});
