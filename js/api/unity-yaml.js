// Парсер Unity YAML (.unity, .prefab).
// Unity пишет YAML-документы, разделённые заголовками вида
//   --- !u!<classID> &<fileID>
// Каждый документ содержит один компонент: GameObject, Transform, Camera и т.д.
//
// Модель: дерево GameObject'ов, мировые координаты XY (для 2D),
// размеры из SpriteRenderer и Canvas, признаки отрисовки на сцене.

import yaml from "https://esm.sh/js-yaml@4";

// Заголовок документа. Может оканчиваться на " stripped" — так Unity
// помечает компоненты, заимствованные из вложенного префаба. Их структура
// урезана, но они нужны как связующие ссылки в иерархии.
const UNITY_TAG_RE = /^---\s+!u!(\d+)\s+&(\d+)(\s+stripped)?\s*$/;

const CLASS_GAMEOBJECT = 1;
const CLASS_TRANSFORM = 4;
const CLASS_SPRITERENDERER = 212;
const CLASS_CANVAS = 223;
const CLASS_RECTTRANSFORM = 224;
const CLASS_PREFAB_INSTANCE = 1001;
const CLASS_SCENE_ROOTS = 1660057539;

const CLASS_NAMES = {
  1: "GameObject",
  4: "Transform",
  20: "Camera",
  21: "Material",
  23: "MeshRenderer",
  33: "MeshFilter",
  54: "Rigidbody",
  64: "MeshCollider",
  65: "BoxCollider",
  81: "AudioListener",
  82: "AudioSource",
  104: "RenderSettings",
  108: "Light",
  114: "MonoBehaviour",
  135: "SphereCollider",
  136: "CapsuleCollider",
  143: "CharacterController",
  157: "LightmapSettings",
  196: "NavMeshSettings",
  198: "ParticleSystem",
  199: "ParticleSystemRenderer",
  212: "SpriteRenderer",
  222: "CanvasRenderer",
  223: "Canvas",
  224: "RectTransform",
  225: "CanvasGroup",
  1001: "Prefab Instance",
  1660057539: "Scene Roots",
};

function splitDocuments(text) {
  const docs = [];
  let current = null;
  const lines = String(text || "").split(/\r?\n/);
  for (const line of lines) {
    if (/^%YAML\s/.test(line) || /^%TAG\s/.test(line)) continue;
    const m = line.match(UNITY_TAG_RE);
    if (m) {
      if (current) docs.push(current);
      current = {
        classID: parseInt(m[1], 10),
        fileID: m[2],
        stripped: !!m[3],
        body: [],
      };
      continue;
    }
    if (current) current.body.push(line);
  }
  if (current) docs.push(current);
  return docs;
}

export function parseUnityYaml(text) {
  const raw = splitDocuments(text);
  const docs = [];
  for (const r of raw) {
    let data = null;
    try {
      data = yaml.load(r.body.join("\n"));
    } catch (e) {
      data = null;
    }
    docs.push({ classID: r.classID, fileID: r.fileID, stripped: !!r.stripped, data });
  }
  return docs;
}

export function classDisplayName(classID) {
  return CLASS_NAMES[classID] || ("Class " + classID);
}

function findModValue(mods, path) {
  if (!Array.isArray(mods)) return undefined;
  for (const m of mods) {
    if (m && m.propertyPath === path) return m.value;
  }
  return undefined;
}

function toNum(v, fallback) {
  if (v === undefined || v === null) return fallback !== undefined ? fallback : 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : (fallback !== undefined ? fallback : 0);
}

function num3(o) {
  return { x: toNum(o && o.x), y: toNum(o && o.y), z: toNum(o && o.z) };
}

export function buildSceneModel(docs) {
  const byFileId = new Map();
  for (const d of docs) {
    if (d.fileID) byFileId.set(String(d.fileID), d);
  }

  const nodes = [];
  const nodeByFileId = new Map();

  // --- 1. GameObject'ы
  for (const d of docs) {
    if (d.classID !== CLASS_GAMEOBJECT) continue;
    const go = d.data && d.data.GameObject;
    if (!go) continue;

    const componentIds = [];
    let transformId = null;
    const comps = Array.isArray(go.m_Component) ? go.m_Component : [];
    for (const c of comps) {
      const fid = c && c.component && String(c.component.fileID);
      if (!fid) continue;
      componentIds.push(fid);
      if (!transformId) {
        const cd = byFileId.get(fid);
        if (cd && (cd.classID === CLASS_TRANSFORM || cd.classID === CLASS_RECTTRANSFORM)) {
          transformId = fid;
        }
      }
    }

    const node = {
      fileID: String(d.fileID),
      name: go.m_Name || "(unnamed)",
      active: go.m_IsActive !== 0,
      componentIds,
      transformId,
      parent: null,
      children: [],
      localPos: { x: 0, y: 0, z: 0 },
      localScale: { x: 1, y: 1, z: 1 },
      worldX: 0,
      worldY: 0,
      sizeX: null,
      sizeY: null,
      hasSprite: false,
      spriteColor: null,
      isCanvas: false,
      isPrefabInstance: false,
      sourceGuid: null,
    };
    nodes.push(node);
    nodeByFileId.set(node.fileID, node);
  }

  // --- 2. PrefabInstance — имя, позиция, масштаб из m_Modifications
  for (const d of docs) {
    if (d.classID !== CLASS_PREFAB_INSTANCE) continue;
    const pi = d.data && d.data.PrefabInstance;
    if (!pi) continue;
    const mods = pi.m_Modification && pi.m_Modification.m_Modifications;

    const nameOverride = findModValue(mods, "m_Name");
    const posX = findModValue(mods, "m_LocalPosition.x");
    const posY = findModValue(mods, "m_LocalPosition.y");
    const posZ = findModValue(mods, "m_LocalPosition.z");
    const scX = findModValue(mods, "m_LocalScale.x");
    const scY = findModValue(mods, "m_LocalScale.y");
    const scZ = findModValue(mods, "m_LocalScale.z");

    const node = {
      fileID: String(d.fileID),
      name: String(nameOverride || "(Prefab)"),
      active: true,
      componentIds: [String(d.fileID)],
      transformId: null,
      parent: null,
      children: [],
      localPos: { x: toNum(posX), y: toNum(posY), z: toNum(posZ) },
      localScale: { x: toNum(scX, 1), y: toNum(scY, 1), z: toNum(scZ, 1) },
      worldX: 0,
      worldY: 0,
      sizeX: null,
      sizeY: null,
      hasSprite: false,
      spriteColor: null,
      isCanvas: false,
      isPrefabInstance: true,
      sourceGuid: (pi.m_SourcePrefab && pi.m_SourcePrefab.guid) || null,
    };
    nodes.push(node);
    nodeByFileId.set(node.fileID, node);
  }

  const transformToNode = new Map();
  for (const n of nodes) {
    if (n.transformId) transformToNode.set(n.transformId, n);
  }

  // --- 3. Локальные трансформы
  for (const node of nodes) {
    if (node.isPrefabInstance) continue;
    if (!node.transformId) continue;
    const td = byFileId.get(node.transformId);
    const t = td && td.data && (td.data.Transform || td.data.RectTransform);
    if (!t) continue;
    if (t.m_LocalPosition) node.localPos = num3(t.m_LocalPosition);
    if (t.m_LocalScale) node.localScale = num3(t.m_LocalScale);
  }

  // --- 4. Размеры и признак отрисовки
  for (const node of nodes) {
    if (node.isPrefabInstance) continue;
    let spriteW = null, spriteH = null, color = null;
    let canvasW = null, canvasH = null;
    let spriteCount = 0;

    for (const cid of node.componentIds) {
      const cd = byFileId.get(cid);
      if (!cd) continue;

      if (cd.classID === CLASS_SPRITERENDERER && cd.data && cd.data.SpriteRenderer) {
        const sr = cd.data.SpriteRenderer;
        spriteCount++;
        if (sr.m_Size) {
          const sw = Math.abs(toNum(sr.m_Size.x, 1) * node.localScale.x);
          const sh = Math.abs(toNum(sr.m_Size.y, 1) * node.localScale.y);
          // Объединяем габариты всех спрайтов: берём максимум.
          if (spriteW === null || sw > spriteW) spriteW = sw;
          if (spriteH === null || sh > spriteH) spriteH = sh;
        }
        if (sr.m_Color && !color) color = sr.m_Color;
      }

      if (cd.classID === CLASS_CANVAS) {
        node.isCanvas = true;
        const td = node.transformId ? byFileId.get(node.transformId) : null;
        const rt = td && td.data && td.data.RectTransform;
        if (rt) {
          if (rt.m_SizeDelta) {
            canvasW = toNum(rt.m_SizeDelta.x);
            canvasH = toNum(rt.m_SizeDelta.y);
          } else if (rt.sizeDelta) {
            canvasW = toNum(rt.sizeDelta.x);
            canvasH = toNum(rt.sizeDelta.y);
          }
        }
      }

      if (cd.classID === 114 && cd.data && cd.data.MonoBehaviour) {
        const mb = cd.data.MonoBehaviour;
        const cls = mb.m_EditorClassIdentifier || "";
        if (cls.includes("CanvasScaler") && mb.m_ReferenceResolution) {
          if (!canvasW || !canvasH) {
            canvasW = toNum(mb.m_ReferenceResolution.x);
            canvasH = toNum(mb.m_ReferenceResolution.y);
          }
        }
      }
    }

    if (spriteW !== null && spriteH !== null) {
      node.hasSprite = true;
      node.spriteColor = color || { r: 1, g: 1, b: 1, a: 1 };
      node.sizeX = Math.abs(spriteW);
      node.sizeY = Math.abs(spriteH);
      node.spriteCount = spriteCount;
    } else if (node.isCanvas && canvasW !== null && canvasH !== null) {
      node.sizeX = Math.abs(canvasW);
      node.sizeY = Math.abs(canvasH);
    }
  }

  // --- 5. Иерархия
  for (const node of nodes) {
    if (node.isPrefabInstance) continue;
    if (!node.transformId) continue;
    const td = byFileId.get(node.transformId);
    const t = td && td.data && (td.data.Transform || td.data.RectTransform);
    if (!t) continue;
    const fatherFid = t.m_Father && String(t.m_Father.fileID);
    if (fatherFid && fatherFid !== "0") {
      const parent = transformToNode.get(fatherFid);
      if (parent) node.parent = parent;
    }
  }

  for (const node of nodes) {
    if (!node.isPrefabInstance) continue;
    const d = byFileId.get(node.fileID);
    const pi = d && d.data && d.data.PrefabInstance;
    const parentRef = pi && pi.m_Modification && pi.m_Modification.m_TransformParent;
    const parentFid = parentRef && String(parentRef.fileID);
    if (parentFid && parentFid !== "0") {
      const parent = transformToNode.get(parentFid);
      if (parent) node.parent = parent;
    }
  }

  for (const node of nodes) {
    if (node.parent) node.parent.children.push(node);
  }

  // --- 6. Мировые координаты XY
  for (const node of nodes) {
    let x = 0, y = 0, cur = node;
    while (cur) {
      x += cur.localPos.x;
      y += cur.localPos.y;
      cur = cur.parent;
    }
    node.worldX = x;
    node.worldY = y;
  }

  // --- 7. Порядок по SceneRoots
  const roots = nodes.filter((n) => !n.parent);

  const orderMap = new Map();
  for (const d of docs) {
    if (d.classID !== CLASS_SCENE_ROOTS) continue;
    const sr = d.data && d.data.SceneRoots;
    if (!sr || !Array.isArray(sr.m_Roots)) continue;
    let i = 0;
    for (const r of sr.m_Roots) {
      const fid = String(r.fileID);
      if (!orderMap.has(fid)) orderMap.set(fid, i++);
    }
  }
  if (orderMap.size) {
    const getOrder = (n) => {
      if (orderMap.has(n.fileID)) return orderMap.get(n.fileID);
      if (n.transformId && orderMap.has(n.transformId)) return orderMap.get(n.transformId);
      return 1e9;
    };
    roots.sort((a, b) => getOrder(a) - getOrder(b));
  }

  return { gameObjects: nodes, roots, byFileId, goByFileId: nodeByFileId };
}
