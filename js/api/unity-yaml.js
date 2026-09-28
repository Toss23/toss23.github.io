// Парсер Unity YAML (.unity, .prefab).
// Unity пишет YAML-документы, разделённые заголовками вида
//   --- !u!<classID> &<fileID>
// Каждый документ содержит один компонент: GameObject, Transform, Camera и т.д.

import yaml from "https://esm.sh/js-yaml@4";

const UNITY_TAG_RE = /^---\s+!u!(\d+)\s+&(\d+)\s*$/;

// Классы, которые нас интересуют.
const CLASS_GAMEOBJECT = 1;
const CLASS_TRANSFORM = 4;
const CLASS_RECTTRANSFORM = 224;

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
  82: "AudioSource",
  108: "Light",
  114: "MonoBehaviour",
  135: "SphereCollider",
  136: "CapsuleCollider",
  143: "CharacterController",
  198: "ParticleSystem",
  199: "ParticleSystemRenderer",
  212: "SpriteRenderer",
  222: "CanvasRenderer",
  223: "Canvas",
  224: "RectTransform",
  225: "CanvasGroup",
};

// Разбивает текст на документы, сохраняя classID и fileID.
function splitDocuments(text) {
  const docs = [];
  let current = null;
  const lines = String(text || "").split(/\r?\n/);
  for (const line of lines) {
    if (/^%YAML\s/.test(line) || /^%TAG\s/.test(line)) continue;
    const m = line.match(UNITY_TAG_RE);
    if (m) {
      if (current) docs.push(current);
      current = { classID: parseInt(m[1], 10), fileID: m[2], body: [] };
      continue;
    }
    if (current) current.body.push(line);
  }
  if (current) docs.push(current);
  return docs;
}

// Парсит файл и возвращает список {classID, fileID, data}.
// data — разобранный YAML одного компонента, вида { GameObject: {...} }
// или { Transform: {...} }, или { MonoBehaviour: {...} }.
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
    docs.push({ classID: r.classID, fileID: r.fileID, data });
  }
  return docs;
}

export function classDisplayName(classID) {
  return CLASS_NAMES[classID] || ("Class " + classID);
}

// Строит модель сцены: список GameObject'ов, дерево, локальные/мировые позиции.
export function buildSceneModel(docs) {
  const byFileId = new Map();
  for (const d of docs) {
    if (d.fileID) byFileId.set(String(d.fileID), d);
  }

  const gameObjects = [];
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

    gameObjects.push({
      fileID: String(d.fileID),
      name: go.m_Name || "(unnamed)",
      active: go.m_IsActive !== 0,
      componentIds,
      transformId,
      parent: null,
      children: [],
      localPos: { x: 0, y: 0, z: 0 },
      worldX: 0,
      worldZ: 0,
    });
  }

  const goByFileId = new Map(gameObjects.map((g) => [g.fileID, g]));

  for (const g of gameObjects) {
    if (!g.transformId) continue;
    const td = byFileId.get(g.transformId);
    const t = td && td.data && (td.data.Transform || td.data.RectTransform);
    if (!t) continue;
    if (t.m_LocalPosition) g.localPos = num3(t.m_LocalPosition);
    const fatherFid = t.m_Father && String(t.m_Father.fileID);
    if (fatherFid && fatherFid !== "0") {
      const parent = goByFileId.get(fatherFid);
      if (parent) g.parent = parent;
    }
  }

  for (const g of gameObjects) {
    if (g.parent) g.parent.children.push(g);
  }

  // Мировые координаты XZ — сумма локальных по цепочке родителей.
  // Повороты и масштабы не учитываем: для плоской схемы этого достаточно.
  for (const g of gameObjects) {
    let x = 0, z = 0, cur = g;
    while (cur) {
      x += cur.localPos.x;
      z += cur.localPos.z;
      cur = cur.parent;
    }
    g.worldX = x;
    g.worldZ = z;
  }

  const roots = gameObjects.filter((g) => !g.parent);
  return { gameObjects, roots, byFileId, goByFileId };
}

function num3(o) {
  return {
    x: toNum(o && o.x),
    y: toNum(o && o.y),
    z: toNum(o && o.z),
  };
}

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
