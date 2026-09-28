import { $ } from "@core/dom.js";

// MIME-типы по расширению. Нужно, потому что Blob из хранилища может
// прийти без типа, а браузер не всегда правильно угадывает формат.
const AUDIO_MIME = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  opus: "audio/ogg",
  flac: "audio/flac",
  aac: "audio/aac",
  m4a: "audio/mp4",
  weba: "audio/webm",
  mid: "audio/midi",
  midi: "audio/midi",
};

function guessMime(path) {
  const ext = (path.split(".").pop() || "").toLowerCase();
  return AUDIO_MIME[ext] || "";
}

export function initAudioScreen() {
  const audio = $("audio-content");
  const pathLabel = $("audio-path");
  let currentUrl = null;

  return {
    open(path, blob) {
      pathLabel.textContent = path;
      if (currentUrl) URL.revokeObjectURL(currentUrl);

      // Если MIME не определён — подставляем по расширению.
      let useBlob = blob;
      const guess = guessMime(path);
      if (guess && (!blob.type || blob.type === "application/octet-stream")) {
        useBlob = new Blob([blob], { type: guess });
      }

      currentUrl = URL.createObjectURL(useBlob);
      audio.src = currentUrl;
      audio.load();
    },
    close() {
      try { audio.pause(); } catch {}
      if (currentUrl) {
        URL.revokeObjectURL(currentUrl);
        currentUrl = null;
      }
      audio.removeAttribute("src");
      try { audio.load(); } catch {}
      pathLabel.textContent = "";
    },
  };
}
