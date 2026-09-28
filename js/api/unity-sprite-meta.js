// Парсер .meta для спрайт-ассетов Unity (.psb, .psd, .png, .jpg, .tga).
// Извлекает spritePixelsToUnits (PPU) и список спрайтов атласа —
// каждый со своим spriteID и прямоугольником в пикселях.
//
// Используется резолвером префабов: когда SpriteRenderer или PrefabInstance
// ссылается на атлас, размер берётся не из всего файла, а из bbox его
// спрайтов.

import yaml from "https://esm.sh/js-yaml@4";

export function parseSpriteMeta(text) {
  if (typeof text !== "string" || !text.length) return null;
  let data;
  try {
    data = yaml.load(text);
  } catch (e) {
    console.warn("unity-sprite-meta: yaml error", e.message);
    return null;
  }
  const si = data && data.ScriptedImporter;
  if (!si) return null;

  const settings = si.textureImporterSettings || {};
  const ppu = Number(settings.spritePixelsToUnits) || 100;

  const sprites = [];
  const collect = (arr) => {
    if (!Array.isArray(arr)) return;
    for (const s of arr) {
      if (!s || !s.rect) continue;
      const w = Number(s.rect.width) || 0;
      const h = Number(s.rect.height) || 0;
      if (w <= 0 || h <= 0) continue;
      sprites.push({
        name: s.name || "",
        spriteID: s.spriteID || "",
        rect: {
          x: Number(s.rect.x) || 0,
          y: Number(s.rect.y) || 0,
          width: w,
          height: h,
        },
      });
    }
  };
  collect(si.layeredSpriteImportData);
  collect(si.multiSpriteImportData);
  collect(si.singleSpriteImportData);

  return { ppu, sprites };
}
