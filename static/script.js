(() => {
  "use strict";

  // Order matters: this is the visual layout of the spectrum bar,
  // roughly low/heavy emotions on the left drifting to bright ones on the right.
  const EMOTIONS = [
    { key: "sadness",  label: "sadness",  emoji: "😢", color: "--sadness"  },
    { key: "fear",     label: "fear",     emoji: "😨", color: "--fear"     },
    { key: "anger",    label: "anger",    emoji: "😠", color: "--anger"    },
    { key: "surprise", label: "surprise", emoji: "😲", color: "--surprise" },
    { key: "love",     label: "love",     emoji: "❤️", color: "--love"     },
    { key: "joy",      label: "joy",      emoji: "😄", color: "--joy"      },
  ];
  const EMOTION_BY_KEY = Object.fromEntries(EMOTIONS.map(e => [e.key, e]));

  const $ = (id) => document.getElementById(id);

  const textInput     = $("textInput");
  const charCount      = $("charCount");
  const analyzeBtn     = $("analyzeBtn");
  const errorMsg       = $("errorMsg");
  const resultBlock    = $("resultBlock");
  const resultEmoji    = $("resultEmoji");
  const resultEmotion  = $("resultEmotion");
  const resultConfidence = $("resultConfidence");
  const spectrum       = $("spectrum");
  const spectrumMarker = $("spectrumMarker");
  const spectrumLabels = $("spectrumLabels");
  const breakdown      = $("breakdown");
  const recentBlock    = $("recentBlock");
  const recentChips    = $("recentChips");
  const statusDot      = $("statusDot");
  const statusText     = $("statusText");
  const pulseDot       = $("pulseDot");
  const glowA          = $("glowA");
  const glowB          = $("glowB");

  let activeGlow = glowA;
  let idleGlow   = glowB;
  let history    = [];

  // ---- build static spectrum segments + labels once ----
  EMOTIONS.forEach((e) => {
    const seg = document.createElement("div");
    seg.className = "spectrum-seg";
    seg.dataset.key = e.key;
    seg.style.background = `var(${e.color})`;
    spectrum.insertBefore(seg, spectrumMarker);

    const label = document.createElement("span");
    label.textContent = e.emoji;
    spectrumLabels.appendChild(label);
  });

  // ---- char counter ----
  textInput.addEventListener("input", () => {
    charCount.textContent = textInput.value.length;
  });

  textInput.addEventListener("keydown", (evt) => {
    if ((evt.metaKey || evt.ctrlKey) && evt.key === "Enter") {
      evt.preventDefault();
      runAnalysis();
    }
  });

  analyzeBtn.addEventListener("click", runAnalysis);

  // ---- health check on load ----
  fetch("/health")
    .then((r) => r.json())
    .then((data) => {
      if (data && data.model_loaded) {
        statusDot.classList.add("ready");
        statusText.textContent = "model ready";
      } else {
        statusDot.classList.add("down");
        statusText.textContent = "model loading";
      }
    })
    .catch(() => {
      statusDot.classList.add("down");
      statusText.textContent = "server unreachable";
    });

  function setLoading(isLoading) {
    analyzeBtn.disabled = isLoading;
    analyzeBtn.classList.toggle("loading", isLoading);
  }

  function showError(message) {
    errorMsg.textContent = message;
    errorMsg.classList.add("visible");
  }

  function clearError() {
    errorMsg.textContent = "";
    errorMsg.classList.remove("visible");
  }

  async function runAnalysis() {
    const text = textInput.value.trim();
    clearError();

    if (!text) {
      showError("Type something first — even a fragment works.");
      textInput.focus();
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      if (!res.ok) {
        if (res.status === 503) {
          throw new Error("The model is still warming up. Try again in a moment.");
        }
        throw new Error("Couldn't read that one — try rephrasing it.");
      }

      const data = await res.json();
      renderResult(data);
      pushRecent(data);
    } catch (err) {
      showError(err.message || "Something went wrong reaching the model.");
    } finally {
      setLoading(false);
    }
  }

  function renderResult(data) {
    const top = EMOTION_BY_KEY[data.predicted_emotion];
    if (!top) return;

    // headline
    resultEmoji.textContent = top.emoji;
    resultEmotion.textContent = top.label;
    resultEmotion.style.setProperty("--result-color", `var(${top.color})`);
    resultConfidence.textContent = Math.round(data.confidence * 100);

    // ambient glow crossfade
    setMood(top.color);

    // pulse dot + idle accent take on the mood too, briefly
    pulseDot.style.background = `var(${top.color})`;

    // spectrum marker position + active segment
    const idx = EMOTIONS.findIndex((e) => e.key === top.key);
    const segWidth = 100 / EMOTIONS.length;
    const posPct = segWidth * idx + segWidth / 2;
    spectrumMarker.style.left = `${posPct}%`;
    spectrumMarker.style.background = `var(${top.color})`;
    spectrumMarker.style.boxShadow = `0 0 0 ${4 + data.confidence * 10}px rgba(255,255,255,${0.05 + data.confidence * 0.1})`;

    document.querySelectorAll(".spectrum-seg").forEach((seg) => {
      seg.classList.toggle("active", seg.dataset.key === top.key);
    });

    // breakdown rows, sorted high to low
    const sorted = Object.entries(data.all_probabilites).sort((a, b) => b[1] - a[1]);
    breakdown.innerHTML = "";
    sorted.forEach(([key, prob], i) => {
      const meta = EMOTION_BY_KEY[key];
      if (!meta) return;

      const row = document.createElement("div");
      row.className = "b-row";

      row.innerHTML = `
        <span class="b-name">${meta.emoji} ${meta.label}</span>
        <span class="b-track"><span class="b-fill" style="background:var(${meta.color})"></span></span>
        <span class="b-pct">${Math.round(prob * 100)}%</span>
      `;
      breakdown.appendChild(row);

      // stagger the reveal + fill
      setTimeout(() => {
        row.classList.add("shown");
        row.querySelector(".b-fill").style.width = `${Math.max(prob * 100, 2)}%`;
      }, 80 * i);
    });

    resultBlock.classList.add("visible");
  }

  function setMood(colorVar) {
    idleGlow.style.background = `radial-gradient(circle at 50% -10%, var(${colorVar}) 0%, transparent 55%)`;
    // force reflow so the browser registers the new background before we fade it in
    void idleGlow.offsetWidth;
    activeGlow.classList.remove("visible");
    idleGlow.classList.add("visible");
    [activeGlow, idleGlow] = [idleGlow, activeGlow];
  }

  function pushRecent(data) {
    history.unshift(data);
    history = history.slice(0, 5);

    recentChips.innerHTML = "";
    history.forEach((entry) => {
      const meta = EMOTION_BY_KEY[entry.predicted_emotion];
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "chip";
      chip.style.setProperty("--chip-color", meta ? `var(${meta.color})` : "");
      chip.innerHTML = `
        <span class="chip-dot"></span>
        <span class="chip-text">${escapeHtml(entry.text)}</span>
      `;
      chip.addEventListener("click", () => {
        textInput.value = entry.text;
        charCount.textContent = entry.text.length;
        textInput.focus();
      });
      recentChips.appendChild(chip);
    });

    recentBlock.hidden = history.length === 0;
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }
})();
