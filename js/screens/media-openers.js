// Открытие бинарных файлов, картинок, аудио и сцен Unity.
// Все эти функции раньше жили в main.js; вынесены отдельным модулем,
// чтобы main оставался оркестратором.
//
// Модуль принимает зависимости через initMediaOpeners и возвращает
// объект с методами.

import { getState, setState } from "@core/store.js";
import * as storage from "@core/storage.js";
import { base64ToBytes } from "@core/encoding.js";
import { formatSize } from "@core/format.js";
import {
  SCREENS, isImagePath, isAudioPath, isUnityScenePath,
} from "@core/config.js";
import { readPsdInfo, extractPsdThumbnail } from "@core/psd-preview.js";
import { loadPsbImage } from "@core/psb-image.js";
import { getBlobRaw } from "@api/github.js";

export function initMediaOpeners({
  setStatus,
  setScreen,
  dialogs,
  imageScreen,
  audioScreen,
  unitySceneScreen,
  getCurrentFileContent,
}) {

  async function openBinaryFile(file) {
    const { octokit, repo } = getState();
    if (!octokit || !repo) return;

    if (isImagePath(file.path)) {
      return openImage(file);
    }
    if (isAudioPath(file.path)) {
      return openAudio(file);
    }

    await dialogs.alert({
      title: "Бинарный файл",
      text: `${file.path}\n${formatSize(file.size || 0)}\n\nПросмотр недоступен.`,
    });
  }

  async function openImage(file) {
    const { octokit, repo, cloned, mode } = getState();
    if (!octokit || !repo) return;

    setStatus(`Загрузка ${file.path}...`);
    try {
      let blob = null;

      if (mode === "local" && cloned && file.isNew) {
        const entry = await storage.getFile(cloned.key, file.path);
        if (entry && entry.isBinary) {
          const bytes = base64ToBytes(entry.content);
          blob = new Blob([bytes]);
        }
      }

      if (!blob) {
        let sha = file.sha;
        if (!sha && mode === "local" && cloned) {
          const entry = await storage.getFile(cloned.key, file.path);
          sha = entry?.sha;
        }
        if (!sha) {
          setStatus("Нет данных для просмотра", true);
          return;
        }
        blob = await getBlobRaw(octokit, repo.owner, repo.name, sha);
      }

      // PSD/PSB — браузер их не умеет рисовать. Пытаемся показать полное
      // изображение через ag-psd. Если не получается — встроенное превью.
      const ext = (file.path.split(".").pop() || "").toLowerCase();
      if (ext === "psd" || ext === "psb") {
        const buf = new Uint8Array(await blob.arrayBuffer());
        const info = readPsdInfo(buf);
        if (!info) {
          await dialogs.alert({
            title: "Не удалось прочитать файл",
            text: file.path + "\n\nПохоже, это не PSD/PSB или файл повреждён.",
          });
          setStatus("");
          return;
        }

        const MAX_DIM = 4096;
        let useFull = true;
        if (info.width > MAX_DIM || info.height > MAX_DIM) {
          const ok = await dialogs.confirm({
            title: "Файл слишком большой",
            text:
              file.path + "\n\n" +
              "Размер документа: " + info.width + " × " + info.height + ".\n\n" +
              "Полное изображение может занять много времени и памяти. Показать полное изображение?",
            okText: "Полное изображение",
            cancelText: "Показать превью",
          });
          if (!ok) useFull = false;
        }

        if (useFull) {
          try {
            const bitmap = await loadPsbImage(buf, file.path);
            if (!bitmap) throw new Error("Декодирование не удалось");
            const canvas = document.createElement("canvas");
            canvas.width = bitmap.width;
            canvas.height = bitmap.height;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(bitmap, 0, 0);
            blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
            if (!blob) throw new Error("Canvas toBlob failed");
          } catch (e) {
            console.warn("Полное изображение не удалось:", e);
            const ok = await dialogs.confirm({
              title: "Не удалось показать полное изображение",
              text: "Показать встроенное превью?",
              okText: "Показать превью",
              cancelText: "Отмена",
            });
            if (!ok) { setStatus(""); return; }
            useFull = false;
          }
        }

        if (!useFull) {
          const preview = extractPsdThumbnail(buf);
          if (!preview) {
            await dialogs.alert({
              title: "Превью недоступно",
              text:
                file.path + "\n\n" +
                "Размер документа: " + info.width + " × " + info.height + ".\n\n" +
                "В файле нет встроенного превью. Откройте его в Photoshop " +
                "и сохраните с включённой опцией «Максимальная совместимость».",
            });
            setStatus("");
            return;
          }
          blob = preview;
        }
      }

      imageScreen.open(file.path, blob);
      setState({ openFile: { path: file.path } });
      setScreen(SCREENS.IMAGE);
      setStatus("");
    } catch (e) {
      setStatus("Не удалось открыть: " + e.message, true);
    }
  }

  // Читает байты Unity-ассета (psb, psd, png, jpg, tga).
  // Работает, даже если файл не попал в state.files из-за размера.
  // Возвращает Uint8Array или null.
  async function readUnityAssetBytes(path) {
    const { octokit, repo, branch, mode, cloned } = getState();
    if (!repo) return null;

    // 1. Local — из IndexedDB.
    if (mode === "local" && cloned) {
      try {
        const entry = await storage.getFile(cloned.key, path);
        if (entry && entry.isBinary && typeof entry.content === "string") {
          return base64ToBytes(entry.content);
        }
        if (entry && typeof entry.content === "string") {
          const enc = new TextEncoder();
          return enc.encode(entry.content);
        }
      } catch (e) {
        console.warn("readUnityAssetBytes local:", path, e);
      }
    }

    // Remote — через octokit Git Blob API.
    try {
      const file = getState().files.find((f) => f.path === path);
      let sha = file && file.sha;

      if (!sha) {
        const res = await octokit.repos.getContent({
          owner: repo.owner, repo: repo.name, path, ref: branch,
        });
        const d = res && res.data;
        if (d && typeof d === "object") {
          if (d.sha) sha = d.sha;
          else if (d.content && d.encoding === "base64") {
            const bin = atob(String(d.content).replace(/\s/g, ""));
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            console.log("[readAsset] getContent:", path, bytes.length, "байт");
            return bytes;
          }
        }
      }

      if (sha) {
        const blob = await getBlobRaw(octokit, repo.owner, repo.name, sha);
        const bytes = new Uint8Array(await blob.arrayBuffer());
        console.log("[readAsset] getBlob:", path, bytes.length, "байт");
        return bytes;
      }
    } catch (e) {
      console.warn("[readAsset] не удалось:", path, e.message);
    }

    return null;
  }

  async function openUnityScene(file) {
    setStatus(`Загрузка ${file.path}...`);
    try {
      const content = await getCurrentFileContent(file.path);
      if (typeof content !== "string") {
        setStatus("Файл сцены не читается как текст", true);
        return;
      }
      const { repo, branch, files, cloned, mode, baseHeadSha } = getState();
      const repoKey = storage.makeRepoKey(repo.owner, repo.name, branch);
      const headSha = mode === "local" && cloned ? cloned.headSha : baseHeadSha;
      const context = {
        repoKey,
        headSha,
        files,
        getContent: (p) => getCurrentFileContent(p),
        getAssetBytes: (p) => readUnityAssetBytes(p),
      };
      setState({ openFile: { path: file.path } });
      unitySceneScreen.open(file.path, content, context);
      setScreen(SCREENS.UNITY_SCENE);
      setStatus("");
    } catch (e) {
      setStatus("Не удалось открыть сцену: " + e.message, true);
    }
  }

  async function openAudio(file) {
    const { octokit, repo, cloned, mode } = getState();
    if (!octokit || !repo) return;

    setStatus(`Загрузка ${file.path}...`);
    try {
      let blob = null;

      // Local — читаем из IndexedDB напрямую, включая локально изменённые файлы.
      if (mode === "local" && cloned) {
        const entry = await storage.getFile(cloned.key, file.path);
        if (entry && entry.isBinary) {
          const bytes = base64ToBytes(entry.content);
          blob = new Blob([bytes]);
        }
      }

      // Если локально не нашли — берём с GitHub по SHA.
      if (!blob) {
        let sha = file.sha;
        if (!sha && mode === "local" && cloned) {
          const entry = await storage.getFile(cloned.key, file.path);
          sha = entry?.sha;
        }
        if (!sha) {
          setStatus("Нет данных для воспроизведения", true);
          return;
        }
        blob = await getBlobRaw(octokit, repo.owner, repo.name, sha);
      }

      audioScreen.open(file.path, blob);
      setState({ openFile: { path: file.path } });
      setScreen(SCREENS.AUDIO);
      setStatus("");
    } catch (e) {
      setStatus("Не удалось открыть: " + e.message, true);
    }
  }

  return { openBinaryFile, openImage, readUnityAssetBytes, openUnityScene, openAudio };
}
