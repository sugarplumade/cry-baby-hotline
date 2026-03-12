const uploadForm = document.getElementById("upload-form");
const voiceInput = document.getElementById("voice");
const submitBtn = document.getElementById("submit-btn");
const statusEl = document.getElementById("status");
const hierarchyFeedEl = document.getElementById("hierarchy-feed");

let activePlayer = null;

const MOOD_ORDER = ["fear", "anger", "grief", "sadness", "hope", "confusion", "longing"];
const MOOD_COLORS = {
  fear: "#4aa7ff",
  anger: "#ff5b5b",
  grief: "#9f6de0",
  sadness: "#5f86e9",
  hope: "#53d39f",
  confusion: "#f0b44c",
  longing: "#ec77b5"
};

const GROUP_ANCHORS = [
  { x: 50, y: 54 },
  { x: 24, y: 56 },
  { x: 76, y: 56 },
  { x: 35, y: 24 },
  { x: 65, y: 24 },
  { x: 50, y: 82 },
  { x: 16, y: 26 }
];

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

function getBubbleDiameter(message) {
  const duration = Number.isFinite(message.durationSeconds) ? Math.max(0, Math.min(message.durationSeconds, 180)) : 45;
  const norm = duration / 180;
  return Math.round(18 + norm * 84);
}

function buildBubble(message, mood) {
  const bubble = document.createElement("button");
  bubble.type = "button";
  bubble.className = "hierarchy-bubble";
  bubble.dataset.mood = mood;
  bubble.style.width = `${getBubbleDiameter(message)}px`;
  bubble.style.height = `${getBubbleDiameter(message)}px`;

  const city = document.createElement("span");
  city.className = "hierarchy-bubble-city";
  city.textContent = (message.locationHint || "Unknown").split(",")[0];

  const date = document.createElement("span");
  date.className = "hierarchy-bubble-date";
  date.textContent = formatDateTime(message.createdAt);

  const audio = document.createElement("audio");
  audio.preload = "none";
  audio.src = message.audioUrl;

  audio.addEventListener("play", () => {
    if (activePlayer && activePlayer !== audio) {
      activePlayer.pause();
      activePlayer.currentTime = 0;
      activePlayer.parentElement?.classList.remove("is-active");
    }
    activePlayer = audio;
    bubble.classList.add("is-active");
  });

  audio.addEventListener("pause", () => {
    bubble.classList.remove("is-active");
    if (activePlayer === audio) {
      activePlayer = null;
    }
  });

  audio.addEventListener("ended", () => {
    bubble.classList.remove("is-active");
    audio.currentTime = 0;
    if (activePlayer === audio) {
      activePlayer = null;
    }
  });

  bubble.addEventListener("click", () => {
    if (audio.paused || audio.ended) {
      const attempt = audio.play();
      if (attempt && typeof attempt.catch === "function") attempt.catch(() => {});
    } else {
      audio.pause();
    }
  });

  bubble.append(city, date, audio);
  return bubble;
}

function packBubbles(bubbles, groupDiameter) {
  const radius = groupDiameter / 2;
  const placed = [];

  bubbles.forEach((bubble) => {
    const bubbleRadius = Number.parseFloat(bubble.style.width) / 2;
    let placedPoint = null;

    for (let ring = 0; ring <= radius - bubbleRadius; ring += 6) {
      for (let angle = 0; angle < 360; angle += 18) {
        const rad = (angle * Math.PI) / 180;
        const x = Math.cos(rad) * ring;
        const y = Math.sin(rad) * ring;

        const inside = Math.hypot(x, y) + bubbleRadius <= radius - 3;
        if (!inside) continue;

        let overlaps = false;
        for (const point of placed) {
          if (Math.hypot(point.x - x, point.y - y) < point.r + bubbleRadius + 2) {
            overlaps = true;
            break;
          }
        }

        if (!overlaps) {
          placedPoint = { x, y, r: bubbleRadius };
          break;
        }
      }
      if (placedPoint) break;
    }

    if (!placedPoint) {
      placedPoint = { x: 0, y: 0, r: bubbleRadius };
    }

    placed.push(placedPoint);
    bubble.style.left = `${radius + placedPoint.x}px`;
    bubble.style.top = `${radius + placedPoint.y}px`;
  });
}

function computeGroupSize(messages) {
  const weight = messages.reduce((sum, message) => {
    const d = getBubbleDiameter(message);
    return sum + d * d;
  }, 0);

  return Math.max(190, Math.min(520, Math.round(Math.sqrt(weight) * 1.2 + 70)));
}

function buildGroup(mood, messages, anchor, rank) {
  const group = document.createElement("section");
  group.className = "hierarchy-group";
  group.dataset.mood = mood;

  const diameter = computeGroupSize(messages);
  group.style.setProperty("--group-size", `${diameter}px`);
  group.style.setProperty("--group-x", `${anchor.x}%`);
  group.style.setProperty("--group-y", `${anchor.y}%`);
  group.style.setProperty("--group-rank", String(rank));
  group.style.setProperty("--group-color", MOOD_COLORS[mood]);

  const label = document.createElement("h2");
  label.className = "hierarchy-group-label";
  label.textContent = mood.toUpperCase();

  const core = document.createElement("div");
  core.className = "hierarchy-group-core";

  const bubbles = messages.map((message) => buildBubble(message, mood));
  bubbles
    .sort((a, b) => Number.parseFloat(b.style.width) - Number.parseFloat(a.style.width))
    .forEach((bubble) => core.appendChild(bubble));

  packBubbles(bubbles, diameter);
  group.append(label, core);
  return group;
}

async function fetchMessages() {
  const res = await fetch("/api/messages");
  if (!res.ok) throw new Error("Could not load messages.");
  const data = await res.json();
  return Array.isArray(data.messages) ? data.messages : [];
}

async function loadHierarchyMessages() {
  if (!hierarchyFeedEl) return;

  const messages = await fetchMessages();
  hierarchyFeedEl.innerHTML = "";

  if (!messages.length) {
    const empty = document.createElement("p");
    empty.className = "hierarchy-empty";
    empty.textContent = "No messages yet.";
    hierarchyFeedEl.appendChild(empty);
    return;
  }

  const grouped = {};
  MOOD_ORDER.forEach((mood) => {
    grouped[mood] = [];
  });

  messages.forEach((message) => {
    const mood = classifyEmotion(message);
    grouped[mood].push(message);
  });

  const present = MOOD_ORDER.filter((mood) => grouped[mood].length > 0);
  present.sort((a, b) => grouped[b].length - grouped[a].length);

  present.forEach((mood, index) => {
    const anchor = GROUP_ANCHORS[index] || {
      x: 50 + Math.cos(index) * 18,
      y: 50 + Math.sin(index) * 18
    };
    hierarchyFeedEl.appendChild(buildGroup(mood, grouped[mood], anchor, index));
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

if (hierarchyFeedEl) {
  loadHierarchyMessages().catch(() => {});
}
