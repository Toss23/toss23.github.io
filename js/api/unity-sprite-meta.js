// Парсер .meta для спрайт-ассетов Unity (.psb, .psd, .png, .jpg, .tga).
// Извлекает spritePixelsToUnits (PPU) и список спрайтов атласа —
// каждый со своим spriteID, rect (область в атласе) и spritePosition
// (позиция центра на холсте Photoshop-документа).
//
// Именно spritePosition использует Unity при раскладке частей персонажа:
// rect задаёт, откуда брать пиксели, spritePosition — где рисовать.

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
      const sp = s.spritePosition || null;
      const centerX = sp ? Number(sp.x) || 0 : (Number(s.rect.x) || 0) + w / 2;
      const centerY = sp ? Number(sp.y) || 0 : (Number(s.rect.y) || 0) + h / 2;
      const pivot = s.pivot || null;
      sprites.push({
        name: s.name || "",
        spriteID: s.spriteID || "",
        rect: {
          x: Number(s.rect.x) || 0,
          y: Number(s.rect.y) || 0,
          width: w,
          height: h,
        },
        centerX,
        centerY,
        pivot: pivot ? {
          x: Number(pivot.x) || 0.5,
          y: Number(pivot.y) || 0.5,
        } : { x: 0.5, y: 0.5 },
      });
    }
  };
  collect(si.layeredSpriteImportData);
  collect(si.multiSpriteImportData);
  collect(si.singleSpriteImportData);

  // documentAlignment — как pivot привязан к документу Photoshop.
  // Unity SpriteAlignment:
  //   0=Center, 1=TopLeft, 2=TopCenter, 3=TopRight, 4=LeftCenter,
  //   5=RightCenter, 6=BottomLeft, 7=BottomCenter, 8=BottomRight.
  // Если поля нет — undefined, вызывающий подставит bottom-center.
  const documentAlignment = (si.documentAlignment !== undefined)
    ? Number(si.documentAlignment)
    : undefined;

  return { ppu, sprites, documentAlignment };
}
