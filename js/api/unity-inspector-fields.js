// Whitelist полей инспектора Unity и утилиты для их редактирования.
//
// Для базовых классов Unity показывает только часть полей — остальные
// (m_ObjectHideFlags, m_CorrespondingSourceObject, serializedVersion и т.д.)
// служебные и в инспекторе не видны. Здесь перечислено то, что Unity
// действительно показывает. Для MonoBehaviour список не задан — у скрипта
// свои сериализованные поля, их показываем все.
//
// Типы полей:
//   number / int    — числовой input
//   boolean         — чекбокс
//   string          — текстовый input
//   vec2 / vec3     — N числовых полей
//   quat / vec4     — 4 числа (readonly)
//   color           — {r,g,b,a} (readonly)
//   ref             — ссылка {fileID} (readonly)
//   layerMask       — целое (readonly)

const WHITELIST = {
  1: [
    { key: "m_Name", label: "Name", type: "string" },
    { key: "m_TagString", label: "Tag", type: "string" },
    { key: "m_Layer", label: "Layer", type: "int" },
    { key: "m_IsActive", label: "Active", type: "boolean" },
  ],
  4: [
    { key: "m_LocalPosition", label: "Position", type: "vec3" },
    { key: "m_LocalRotation", label: "Rotation", type: "quat", readonly: true },
    { key: "m_LocalScale", label: "Scale", type: "vec3" },
    { key: "m_ConstrainProportionsScale", label: "Constrain Proportions", type: "boolean" },
  ],
  20: [
    { key: "m_ClearFlags", label: "Clear Flags", type: "int" },
    { key: "m_BackGroundColor", label: "Background", type: "color", readonly: true },
    { key: "m_projectionMatrixMode", label: "Projection", type: "int" },
    { key: "orthographic", label: "Orthographic", type: "boolean" },
    { key: "orthographic size", label: "Size", type: "number" },
    { key: "field of view", label: "Field of View", type: "number" },
    { key: "near clip plane", label: "Near", type: "number" },
    { key: "far clip plane", label: "Far", type: "number" },
    { key: "m_Depth", label: "Depth", type: "number" },
  ],
  82: [
    { key: "m_Enabled", label: "Enabled", type: "boolean" },
    { key: "m_PlayOnAwake", label: "Play On Awake", type: "boolean" },
    { key: "m_Loop", label: "Loop", type: "boolean" },
    { key: "m_Volume", label: "Volume", type: "number" },
    { key: "m_Pitch", label: "Pitch", type: "number" },
    { key: "m_Mute", label: "Mute", type: "boolean" },
    { key: "m_Clip", label: "Clip", type: "ref" },
    { key: "m_Priority", label: "Priority", type: "int" },
  ],
  108: [
    { key: "m_Enabled", label: "Enabled", type: "boolean" },
    { key: "m_Type", label: "Type", type: "int" },
    { key: "m_Color", label: "Color", type: "color", readonly: true },
    { key: "m_Intensity", label: "Intensity", type: "number" },
    { key: "m_Range", label: "Range", type: "number" },
    { key: "m_SpotAngle", label: "Spot Angle", type: "number" },
  ],
  212: [
    { key: "m_Enabled", label: "Enabled", type: "boolean" },
    { key: "m_Sprite", label: "Sprite", type: "ref" },
    { key: "m_Color", label: "Color", type: "color", readonly: true },
    { key: "m_FlipX", label: "Flip X", type: "boolean" },
    { key: "m_FlipY", label: "Flip Y", type: "boolean" },
    { key: "m_DrawMode", label: "Draw Mode", type: "int" },
    { key: "m_Size", label: "Size", type: "vec2" },
    { key: "m_SortingLayerID", label: "Sorting Layer", type: "int" },
    { key: "m_SortingOrder", label: "Order in Layer", type: "int" },
    { key: "m_MaskInteraction", label: "Mask Interaction", type: "int" },
    { key: "m_SpriteSortPoint", label: "Sprite Sort Point", type: "int" },
  ],
  223: [
    { key: "m_Enabled", label: "Enabled", type: "boolean" },
    { key: "m_RenderMode", label: "Render Mode", type: "int" },
    { key: "m_Camera", label: "Render Camera", type: "ref" },
    { key: "m_PlaneDistance", label: "Plane Distance", type: "number" },
    { key: "m_PixelPerfect", label: "Pixel Perfect", type: "boolean" },
    { key: "m_SortingOrder", label: "Sort Order", type: "int" },
  ],
  224: [
    { key: "m_LocalPosition", label: "Position", type: "vec3" },
    { key: "m_LocalRotation", label: "Rotation", type: "quat", readonly: true },
    { key: "m_LocalScale", label: "Scale", type: "vec3" },
    { key: "m_AnchorMin", label: "Anchor Min", type: "vec2" },
    { key: "m_AnchorMax", label: "Anchor Max", type: "vec2" },
    { key: "m_AnchoredPosition", label: "Anchored Position", type: "vec2" },
    { key: "m_SizeDelta", label: "Size Delta", type: "vec2" },
    { key: "m_Pivot", label: "Pivot", type: "vec2" },
  ],
  225: [
    { key: "m_Alpha", label: "Alpha", type: "number" },
    { key: "m_Interactable", label: "Interactable", type: "boolean" },
    { key: "m_BlocksRaycasts", label: "Blocks Raycasts", type: "boolean" },
    { key: "m_IgnoreParentGroups", label: "Ignore Parent Groups", type: "boolean" },
  ],
};

// Поля, которые никогда не показываем.
export const ALWAYS_HIDDEN = new Set([
  "m_ObjectHideFlags",
  "m_CorrespondingSourceObject",
  "m_PrefabInstance",
  "m_PrefabAsset",
  "m_GameObject",
  "m_EditorHideFlags",
]);

export function getWhitelist(classID) {
  return WHITELIST[classID] || null;
}

export function isEditableFieldType(type) {
  return type === "number" || type === "int" ||
         type === "boolean" || type === "string" ||
         type === "vec2" || type === "vec3";
}

function numStr(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "0";
  if (Number.isInteger(n)) return String(n);
  return String(n);
}

export function serializeYamlValue(value, type) {
  if (type === "boolean") return value ? "1" : "0";
  if (type === "vec2") {
    return "{x: " + numStr(value.x) + ", y: " + numStr(value.y) + "}";
  }
  if (type === "vec3") {
    return "{x: " + numStr(value.x) + ", y: " + numStr(value.y) + ", z: " + numStr(value.z) + "}";
  }
  if (type === "number" || type === "int") return numStr(value);
  return String(value);
}

// Заменяет значение поля в сыром теле YAML-документа.
// fieldKey — точное имя из YAML, например "m_Name" или "orthographic size".
export function replaceFieldValue(bodyText, fieldKey, newValue) {
  const lines = bodyText.split(/\r?\n/);
  const needle = "  " + fieldKey + ":";
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.startsWith(needle)) continue;
    const after = line.slice(needle.length);
    const m = after.match(/^(\s*)/);
    const space = m ? m[1] : " ";
    lines[i] = needle + space + newValue;
    return lines.join("\n");
  }
  return bodyText;
}
