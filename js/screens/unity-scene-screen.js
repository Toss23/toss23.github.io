import { $ } from "@core/dom.js";
import { parseUnityYaml, buildSceneModel, classDisplayName } from "@api/unity-yaml.js";
import { getPrefabMap, loadPrefabBoundingBox } from "@api/unity-prefabs.js";
import { showBusy, hideBusy, updateBusyText } from "@ui/busy.js";

// Read-only просмотр сцены Unity.
// Иерархия сверху (сворачиваемая, ~5 строк со скроллом), 2D-вид XY
// по центру, инспектор снизу (закрыт по умолчанию).
// На сцене рисуются только объекты с SpriteRenderer (свои или
// полученные из резолва префабов). Canvas и прочее — только в иерархии.
export function initUnitySceneScreen() {
  const pathEl = $("unity-scene-path");
  const hierEl = $("unity-hierarchy-list");
  const canvasEl = $("unity-canvas");
  const inspectorEl = $("unity-inspector-body");

  const hierarchyPanel = $("unity-hierarchy-panel") || document.querySelector(".unity-hierarchy");
  const inspectorPanel = $("unity-inspector-panel") || document.querySelector(".unity-inspector");

  const ctx = canvasEl ? canvasEl.getContext("2d") : null;

  let model = null;
  let selectedFileID = null;
  let view = { cx: 0, cy: 0, scale: 40 };
  let hierarchyToggleBtn = null;
  let inspectorCloseButton = null;
  let generation = 0;

  function injectStyles() {
    if (document.getElementById("unity-scene-styles")) return;
    const style = document.createElement("style");
    style.id = "unity-scene-styles";
    style.textContent = [
      ".unity-panel-title{display:flex;align-items:center;justify-content:space-between;gap:6px;padding:2px 6px 2px 10px;min-height:24px;}",
      ".unity-panel-title > span{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}",
      ".unity-panel-toggle{flex-shrink:0;background:transparent;border:none;color:#aaa;font-family:inherit;font-size:12px;line-height:1;cursor:pointer;min-width:24px;min-height:22px;padding:2px 6px;border-radius:3px;}",
      ".unity-panel-toggle:hover{background:#3c3c3c;color:#fff;}",
      ".unity-panel-toggle:active{background:#4a4a4a;}",
      ".unity-hierarchy{flex:0 0 140px !important;min-height:24px !important;overflow:hidden;display:flex;flex-direction:column;}",
      ".unity-hierarchy.collapsed{flex:0 0 auto !important;}",
      ".unity-hierarchy.collapsed .unity-tree{display:none;}",
      ".unity-hierarchy .unity-tree{flex:1;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch;}",
      ".unity-inspector.closed{display:none !important;}",
    ].join("");
    document.head.appendChild(style);
  }

  function ensureTitleSpan(titleEl) {
    if (!titleEl) return null;
    let span = titleEl.querySelector("span");
    if (!span) {
      const text = titleEl.textContent.trim();
      titleEl.textContent = "";
      span = document.createElement("span");
      span.textContent = text;
      titleEl.appendChild(span);
    }
    return span;
  }

  function ensureHierarchyToggle() {
    if (!hierarchyPanel) return;
    const title = hierarchyPanel.querySelector(".unity-panel-title");
    if (!title) return;
    if (title.querySelector(".unity-panel-toggle")) return;
    ensureTitleSpan(title);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "unity-panel-toggle";
    btn.title = "Свернуть";
    btn.textContent = "▾";
    btn.addEventListener("click", () => {
      const collapsed = hierarchyPanel.classList.toggle("collapsed");
      btn.textContent = collapsed ? "▸" : "▾";
      btn.title = collapsed ? "Развернуть" : "Свернуть";
    });
    title.appendChild(btn);
    hierarchyToggleBtn = btn;
  }

  function ensureInspectorClose() {
    if (!inspectorPanel) return;
    const title = inspectorPanel.querySelector(".unity-panel-title");
    if (!title) return;
    if (title.querySelector(".unity-panel-toggle")) return;
    ensureTitleSpan(title);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "unity-panel-toggle";
    btn.title = "Закрыть";
    btn.textContent = "✕";
    btn.addEventListener("click", () => {
      inspectorPanel.classList.add("closed");
    });
    title.appendChild(btn);
    inspectorCloseButton = btn;
  }

  function resizeCanvas() {
    if (!canvasEl || !ctx) return;
    const rect = canvasEl.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width));
    const h = Math.max(1, Math.floor(rect.height));
    const dpr = window.devicePixelRatio || 1;
    const needW = Math.floor(w * dpr);
    const needH = Math.floor(h * dpr);
    if (canvasEl.width !== needW || canvasEl.height !== needH) {
      canvasEl.width = needW;
      canvasEl.height = needH;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  function isDrawable(g) {
    return g.hasSprite && g.sizeX !== null && g.sizeY !== null &&
           g.sizeX > 0.001 && g.sizeY > 0.001;
  }

  function autoFit() {
    if (!canvasEl) return;
    const visible = model ? model.gameObjects.filter(isDrawable) : [];
    if (!visible.length) {
      view = { cx: 0, cy: 0, scale: 40 };
      return;
    }
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const g of visible) {
      const hw = (g.sizeX || 0) / 2;
      const hh = (g.sizeY || 0) / 2;
      if (g.worldX - hw < minX) minX = g.worldX - hw;
      if (g.worldX + hw > maxX) maxX = g.worldX + hw;
      if (g.worldY - hh < minY) minY = g.worldY - hh;
      if (g.worldY + hh > maxY) maxY = g.worldY + hh;
    }
    if (!Number.isFinite(minX)) {
      view = { cx: 0, cy: 0, scale: 40 };
      return;
    }
    const w = Math.max(0.5, maxX - minX);
    const h = Math.max(0.5, maxY - minY);
    const rect = canvasEl.getBoundingClientRect();
    const pad = 40;
    const sx = Math.max(1, rect.width - pad * 2) / w;
    const sy = Math.max(1, rect.height - pad * 2) / h;
    const s = Math.max(2, Math.min(400, Math.min(sx, sy)));
    view = { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, scale: s };
  }

  function toScreen(x, y) {
    const rect = canvasEl.getBoundingClientRect();
    return {
      x: rect.width / 2 + (x - view.cx) * view.scale,
      y: rect.height / 2 - (y - view.cy) * view.scale,
    };
  }

  function niceGridStep(scale) {
    const target = 60 / scale;
    const pow = Math.pow(10, Math.floor(Math.log10(target)));
    const m = target / pow;
    let step;
    if (m < 2) step = 1;
    else if (m < 5) step = 2;
    else step = 5;
    return step * pow;
  }

  // Рисует PSB-картинку, вписывая её в bbox без искажения пропорций.
  // Масштаб — единый по обеим осям (min из двух), центрируется внутри bbox.
  // Рамка выделения остаётся по границам bbox — по ней видно, где объект
  // «живёт» в мире, а картинка внутри уже сохраняет свои пропорции.
  function drawBitmap(g, bx, by, wPx, hPx, isSel) {
    const srcW = g.bitmap.width;
    const srcH = g.bitmap.height;
    if (srcW && srcH) {
      const scale = Math.min(wPx / srcW, hPx / srcH);
      const drawW = srcW * scale;
      const drawH = srcH * scale;
      const dx = bx + (wPx - drawW) / 2;
      const dy = by + (hPx - drawH) / 2;
      try {
        ctx.drawImage(g.bitmap, 0, 0, srcW, srcH, dx, dy, drawW, drawH);
      } catch (e) {
        ctx.strokeStyle = "#f48771";
        ctx.lineWidth = 1;
        ctx.strokeRect(bx, by, wPx, hPx);
      }
    }
    if (isSel) {
      ctx.strokeStyle = "#ffb454";
      ctx.lineWidth = 2;
      ctx.strokeRect(bx, by, wPx, hPx);
    }
    if (view.scale > 8 || isSel) {
      ctx.fillStyle = isSel ? "#fff" : "#999";
      ctx.font = "11px ui-monospace, monospace";
      ctx.fillText(g.name, bx + 6, by - 4);
    }
  }

  function draw() {
    if (!ctx || !canvasEl) return;
    const rect = canvasEl.getBoundingClientRect();
    const W = rect.width, H = rect.height;
    ctx.clearRect(0, 0, W, H);

    const gridStep = niceGridStep(view.scale);
    const viewMinX = view.cx - W / 2 / view.scale;
    const viewMaxX = view.cx + W / 2 / view.scale;
    const viewMinY = view.cy - H / 2 / view.scale;
    const viewMaxY = view.cy + H / 2 / view.scale;

    ctx.strokeStyle = "#2a2a2a";
    ctx.lineWidth = 1;
    const startX = Math.floor(viewMinX / gridStep) * gridStep;
    const startY = Math.floor(viewMinY / gridStep) * gridStep;
    for (let gx = startX; gx <= viewMaxX; gx += gridStep) {
      const a = toScreen(gx, viewMinY);
      const b = toScreen(gx, viewMaxY);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    for (let gy = startY; gy <= viewMaxY; gy += gridStep) {
      const a = toScreen(viewMinX, gy);
      const b = toScreen(viewMaxX, gy);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }

    ctx.strokeStyle = "#3e5a78";
    const yAxis = toScreen(0, viewMinY);
    const xAxis = toScreen(viewMinX, 0);
    if (yAxis.x >= 0 && yAxis.x <= W) {
      ctx.beginPath(); ctx.moveTo(yAxis.x, 0); ctx.lineTo(yAxis.x, H); ctx.stroke();
    }
    if (xAxis.y >= 0 && xAxis.y <= H) {
      ctx.beginPath(); ctx.moveTo(0, xAxis.y); ctx.lineTo(W, xAxis.y); ctx.stroke();
    }

    if (!model) return;

    for (const g of model.gameObjects) {
      if (!isDrawable(g)) continue;
      const isSel = g.fileID === selectedFileID;

      const c = g.spriteColor || { r: 1, g: 1, b: 1, a: 1 };
      const cr = Math.round((c.r || 0) * 255);
      const cg = Math.round((c.g || 0) * 255);
      const cb = Math.round((c.b || 0) * 255);
      const ca = c.a === undefined ? 1 : c.a;

      // 1. Есть картинка — рисуем её, сохраняя пропорции.
      if (g.bitmap) {
        const p = toScreen(g.worldX, g.worldY);
        const wPx = Math.max(2, Math.abs(g.sizeX) * view.scale);
        const hPx = Math.max(2, Math.abs(g.sizeY) * view.scale);
        const bx = p.x - wPx / 2;
        const by = p.y - hPx / 2;
        drawBitmap(g, bx, by, wPx, hPx, isSel);
        continue;
      }

      // 2. Иначе — прямоугольник по bbox.
      const p = toScreen(g.worldX, g.worldY);
      const w = Math.max(3, g.sizeX * view.scale);
      const h = Math.max(3, g.sizeY * view.scale);
      const x0 = p.x - w / 2;
      const y0 = p.y - h / 2;

      ctx.fillStyle = "rgba(" + cr + "," + cg + "," + cb + "," + (0.25 * ca) + ")";
      ctx.fillRect(x0, y0, w, h);
      ctx.strokeStyle = isSel
        ? "#ffb454"
        : "rgba(" + cr + "," + cg + "," + cb + "," + Math.min(1, ca + 0.3) + ")";
      ctx.lineWidth = isSel ? 2 : 1;
      ctx.strokeRect(x0, y0, w, h);

      if (view.scale > 8 || isSel) {
        ctx.fillStyle = isSel ? "#fff" : "#999";
        ctx.font = "11px ui-monospace, monospace";
        const labelOffset = h / 2 + 12;
        ctx.fillText(g.name, p.x + 8, p.y - labelOffset + 10);
      }

      if (isSel) {
        ctx.fillStyle = "#ffb454";
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  async function resolvePrefabs(myGen, context) {
    if (!context || !context.getContent) return;
    const instances = model ? model.gameObjects.filter((g) => g.isPrefabInstance && g.sourceGuid) : [];
    if (!instances.length) return;

    const token = showBusy("Поиск префабов…");
    try {
      updateBusyText("Сканирование .meta файлов…");
      const map = await getPrefabMap({
        repoKey: context.repoKey,
        headSha: context.headSha,
        files: context.files,
        getContent: context.getContent,
        onProgress: (done, total) => {
          if (total > 0) updateBusyText(`Сканирование: ${done} / ${total}`);
        },
      });
      const prefabMap = map.guidToPath || {};
      const kindByGuid = map.kindByGuid || {};
      const allGuids = Object.keys(prefabMap);
      console.log("[unity-scene] в карте", allGuids.length, "guid'ов");

      if (myGen !== generation) return;

      const uniqueGuids = [...new Set(instances.map((g) => g.sourceGuid))];
      console.log("[unity-scene] префаб-инстансов:", instances.length, "уникальных guid:", uniqueGuids.length);

      const resolved = new Map();
      let done = 0;
      for (const guid of uniqueGuids) {
        done++;
        updateBusyText(`Чтение префабов: ${done} / ${uniqueGuids.length}`);
        const prefabPath = prefabMap[guid];
        const kind = kindByGuid[guid] || "prefab";
        if (!prefabPath) {
          console.warn("[unity-scene] guid не найден в карте:", guid);
          continue;
        }
        console.log("[unity-scene] резолв:", guid, "kind:", kind, "→", prefabPath);
        try {
          const info = await loadPrefabBoundingBox({
            prefabPath,
            kind,
            getContent: context.getContent,
            getAssetBytes: context.getAssetBytes,
            prefabMap,
            kindByGuid,
            selfGuid: guid,
            visited: new Set(),
            depth: 0,
          });
          if (info && info.hasSprite) {
            console.log("[unity-scene] bbox найден:", guid, "размер:", (info.maxX - info.minX).toFixed(2), "×", (info.maxY - info.minY).toFixed(2), "спрайтов:", info.spriteCount);
            resolved.set(guid, info);
          } else {
            console.warn("[unity-scene] спрайтов не найдено:", guid, prefabPath);
          }
        } catch (e) {
          console.warn("prefab load:", prefabPath, e);
        }
      }

      if (myGen !== generation) return;

      for (const pi of instances) {
        const info = resolved.get(pi.sourceGuid);
        if (!info) continue;
        const w = Math.max(0.001, info.maxX - info.minX);
        const h = Math.max(0.001, info.maxY - info.minY);
        pi.hasSprite = true;
        pi.spriteColor = info.color || { r: 1, g: 1, b: 1, a: 1 };
        pi.sizeX = Math.abs(w * pi.localScale.x);
        pi.sizeY = Math.abs(h * pi.localScale.y);
        // Центр картинки = localPos + центр bbox.
        // Bbox префаба включает в себя localPosition всех дочерних
        // объектов (например, вложенного PrefabInstance с PSB). Если
        // origin GameObject'а в ногах персонажа — bbox будет выше нуля,
        // и картинка сдвинется вверх вместе с ним.
        const ccx = info.centerX || 0;
        const ccy = info.centerY || 0;
        pi.worldX = pi.localPos.x + ccx * pi.localScale.x;
        pi.worldY = pi.localPos.y + ccy * pi.localScale.y;

        pi.bitmap = info.bitmap || null;
        pi.bitmapW = info.imageWidth || (info.bitmap ? info.bitmap.width : 0);
        pi.bitmapH = info.imageHeight || (info.bitmap ? info.bitmap.height : 0);
        pi.bitmapPPU = info.imagePPU || 100;
        pi.docMinPx = info.docMinPx || 0;
        pi.docMaxPx = info.docMaxPx || 0;
        pi.docMinPy = info.docMinPy || 0;
        pi.docMaxPy = info.docMaxPy || 0;
        pi.docWidthPx = info.docWidthPx || 0;
        pi.docHeightPx = info.docHeightPx || 0;
        pi.atlasSprites = info.atlasSprites || null;

        console.log(
          "[unity-scene] применил:", pi.name,
          "localPos=" + pi.localPos.x.toFixed(2) + "," + pi.localPos.y.toFixed(2),
          "world=" + pi.worldX.toFixed(2) + "," + pi.worldY.toFixed(2),
          "size=" + pi.sizeX.toFixed(2) + "×" + pi.sizeY.toFixed(2),
          "scale=" + pi.localScale.x + "," + pi.localScale.y,
          "bitmap=" + pi.bitmapW + "×" + pi.bitmapH
        );
      }

      autoFit();
      draw();
      renderHierarchy();
      if (selectedFileID) renderInspector();
    } catch (e) {
      console.warn("resolvePrefabs:", e);
    } finally {
      if (token) hideBusy(token);
    }
  }

  function renderHierarchy() {
    if (!hierEl) return;
    hierEl.innerHTML = "";
    if (!model) return;
    for (const root of model.roots) {
      hierEl.appendChild(renderTreeNode(root, 0));
    }
  }

  function renderTreeNode(node, depth) {
    const li = document.createElement("li");
    li.className = "unity-tree-node";
    if (node.fileID === selectedFileID) li.classList.add("selected");
    if (!node.active) li.classList.add("inactive");
    if (node.isPrefabInstance) li.classList.add("prefab");

    const row = document.createElement("div");
    row.className = "unity-tree-row";
    row.style.paddingLeft = (depth * 14 + 6) + "px";

    const arrow = document.createElement("span");
    arrow.className = "unity-tree-arrow";
    arrow.textContent = node.children.length ? "▾" : "·";
    row.appendChild(arrow);

    const icon = document.createElement("span");
    icon.className = "unity-tree-icon";
    if (node.isPrefabInstance) icon.textContent = "◆";
    else if (node.hasSprite) icon.textContent = "▣";
    else if (node.isCanvas) icon.textContent = "▢";
    else icon.textContent = "◈";
    row.appendChild(icon);

    const name = document.createElement("span");
    name.className = "unity-tree-name";
    name.textContent = node.name;
    row.appendChild(name);

    row.addEventListener("click", (e) => {
      e.stopPropagation();
      selectNode(node.fileID);
    });
    li.appendChild(row);

    if (node.children.length) {
      const ul = document.createElement("ul");
      ul.className = "unity-tree-children";
      for (const ch of node.children) ul.appendChild(renderTreeNode(ch, depth + 1));
      li.appendChild(ul);
      arrow.addEventListener("click", (e) => {
        e.stopPropagation();
        const collapsed = ul.classList.toggle("collapsed");
        arrow.textContent = collapsed ? "▸" : "▾";
      });
    }

    return li;
  }

  function selectNode(fileID) {
    selectedFileID = fileID;
    if (inspectorPanel) inspectorPanel.classList.remove("closed");
    renderHierarchy();
    renderInspector();
    draw();
  }

  const SKIP_FIELDS = new Set([
    "m_ObjectHideFlags",
    "m_CorrespondingSourceObject",
    "m_PrefabInstance",
    "m_PrefabAsset",
    "m_GameObject",
  ]);

  function prettyName(name) {
    let s = String(name);
    if (s.startsWith("m_")) s = s.slice(2);
    s = s.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
    return s;
  }

  function renderInspector() {
    if (!inspectorEl) return;
    inspectorEl.innerHTML = "";
    if (!model || !selectedFileID) {
      inspectorEl.classList.add("empty");
      inspectorEl.textContent = "Выберите объект на сцене или в иерархии.";
      return;
    }
    inspectorEl.classList.remove("empty");
    const go = model.goByFileId.get(selectedFileID);
    if (!go) return;

    const head = document.createElement("div");
    head.className = "unity-insp-head";
    const icon = document.createElement("span");
    icon.className = "unity-insp-icon";
    icon.textContent = go.isPrefabInstance ? "◆" : "◈";
    head.appendChild(icon);
    const title = document.createElement("span");
    title.className = "unity-insp-title";
    title.textContent = go.name;
    head.appendChild(title);
    const badge = document.createElement("span");
    badge.className = "unity-insp-badge" + (go.active ? "" : " inactive");
    badge.textContent = go.active ? "active" : "inactive";
    head.appendChild(badge);
    inspectorEl.appendChild(head);

    if (go.isPrefabInstance) {
      renderPrefabInstance(go, inspectorEl);
      return;
    }

    const order = [];
    if (go.transformId) order.push(go.transformId);
    for (const cid of go.componentIds) {
      if (cid !== go.transformId) order.push(cid);
    }

    for (const cid of order) {
      const doc = model.byFileId.get(cid);
      if (!doc || !doc.data) continue;
      inspectorEl.appendChild(renderComponent(doc));
    }
  }

  function renderPrefabInstance(go, parent) {
    const doc = model.byFileId.get(go.fileID);
    const pi = doc && doc.data && doc.data.PrefabInstance;
    if (!pi) return;

    const wrap = document.createElement("details");
    wrap.className = "unity-component";
    wrap.open = false;
    const sum = document.createElement("summary");
    sum.className = "unity-component-title";
    sum.textContent = "Prefab Instance";
    wrap.appendChild(sum);

    const body = document.createElement("div");
    body.className = "unity-component-body";
    body.appendChild(makeStaticField("Source GUID", go.sourceGuid || "—"));
    body.appendChild(makeStaticField("Name", go.name));
    body.appendChild(makeVecField("Position", go.localPos, ["x", "y", "z"]));
    body.appendChild(makeVecField("Scale", go.localScale, ["x", "y", "z"]));

    if (go.hasSprite && go.sizeX !== null) {
      body.appendChild(makeStaticField(
        "Bounding size",
        fmtNum(go.sizeX) + " × " + fmtNum(go.sizeY)
      ));
    }
    if (go.bitmapW) {
      body.appendChild(makeStaticField("Image", go.bitmapW + " × " + go.bitmapH));
    }
    if (go.docWidthPx) {
      body.appendChild(makeStaticField("Document", go.docWidthPx + " × " + go.docHeightPx));
    }

    const mods = pi.m_Modification && pi.m_Modification.m_Modifications;
    if (Array.isArray(mods) && mods.length) {
      const details = document.createElement("details");
      details.className = "unity-subfields";
      const sum2 = document.createElement("summary");
      sum2.className = "unity-subfields-summary";
      sum2.textContent = "Переопределений: " + mods.length;
      details.appendChild(sum2);
      const inner = document.createElement("div");
      inner.className = "unity-subfields-body";
      for (const m of mods) {
        const f = document.createElement("div");
        f.className = "unity-field";
        const label = document.createElement("div");
        label.className = "unity-field-label";
        label.textContent = String(m.propertyPath || "?");
        f.appendChild(label);
        const ctrl = document.createElement("div");
        ctrl.className = "unity-field-control";
        const v = document.createElement("span");
        v.className = "unity-field-scalar";
        v.textContent = String(m.value !== undefined ? m.value : "—");
        ctrl.appendChild(v);
        f.appendChild(ctrl);
        inner.appendChild(f);
      }
      details.appendChild(inner);
      body.appendChild(details);
    }

    wrap.appendChild(body);
    parent.appendChild(wrap);
  }

  function makeStaticField(label, value) {
    const row = document.createElement("div");
    row.className = "unity-field";
    const l = document.createElement("div");
    l.className = "unity-field-label";
    l.textContent = label;
    row.appendChild(l);
    const c = document.createElement("div");
    c.className = "unity-field-control";
    const v = document.createElement("span");
    v.className = "unity-field-scalar";
    v.textContent = String(value);
    c.appendChild(v);
    row.appendChild(c);
    return row;
  }

  function makeVecField(label, obj, order) {
    const row = document.createElement("div");
    row.className = "unity-field";
    const l = document.createElement("div");
    l.className = "unity-field-label";
    l.textContent = label;
    row.appendChild(l);
    const c = document.createElement("div");
    c.className = "unity-field-control";
    const vec = document.createElement("div");
    vec.className = "unity-vec";
    for (const k of order) vec.appendChild(makeVecCell(k, obj[k]));
    c.appendChild(vec);
    row.appendChild(c);
    return row;
  }

  function renderComponent(doc) {
    const wrap = document.createElement("details");
    wrap.className = "unity-component";
    wrap.open = false;

    const sum = document.createElement("summary");
    sum.className = "unity-component-title";
    sum.textContent = classDisplayName(doc.classID);
    wrap.appendChild(sum);

    const body = document.createElement("div");
    body.className = "unity-component-body";
    const keys = Object.keys(doc.data || {});
    const inner = keys.length ? doc.data[keys[0]] : doc.data;
    if (inner && typeof inner === "object") {
      renderFieldsGui(inner, body, 0);
    } else {
      const row = document.createElement("div");
      row.className = "unity-field";
      row.textContent = String(inner);
      body.appendChild(row);
    }
    wrap.appendChild(body);
    return wrap;
  }

  function renderFieldsGui(obj, parent, depth) {
    if (depth > 6) return;
    for (const key of Object.keys(obj)) {
      if (SKIP_FIELDS.has(key)) continue;
      parent.appendChild(renderField(key, obj[key], depth));
    }
  }

  function renderField(key, val, depth) {
    const row = document.createElement("div");
    row.className = "unity-field";
    row.style.paddingLeft = (depth * 10) + "px";

    const label = document.createElement("div");
    label.className = "unity-field-label";
    label.textContent = prettyName(key);
    label.title = key;
    row.appendChild(label);

    const control = document.createElement("div");
    control.className = "unity-field-control";

    if (val === null || val === undefined) {
      const v = document.createElement("span");
      v.className = "unity-field-scalar null";
      v.textContent = "null";
      control.appendChild(v);
    } else if (Array.isArray(val)) {
      renderArrayControl(val, control);
    } else if (typeof val === "object") {
      renderObjectControl(val, control);
    } else {
      const v = document.createElement("span");
      v.className = "unity-field-scalar";
      if (typeof val === "boolean") {
        v.textContent = val ? "true" : "false";
        v.classList.add(val ? "true" : "false");
      } else {
        v.textContent = String(val);
      }
      control.appendChild(v);
    }

    row.appendChild(control);
    return row;
  }

  function renderObjectControl(obj, control) {
    const keys = Object.keys(obj);

    if (keys.length === 1 && keys[0] === "fileID") {
      const fid = String(obj.fileID);
      if (fid === "0") {
        const v = document.createElement("span");
        v.className = "unity-field-ref null";
        v.textContent = "None";
        control.appendChild(v);
        return;
      }
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "unity-field-ref";
      btn.textContent = "fileID: " + fid;
      if (model.goByFileId.has(fid)) {
        btn.classList.add("clickable");
        btn.title = model.goByFileId.get(fid).name;
        btn.addEventListener("click", () => selectNode(fid));
      }
      control.appendChild(btn);
      return;
    }

    const vecKeys = ["x", "y", "z", "w"];
    const isVector = keys.length > 0 && keys.every((k) => vecKeys.includes(k))
      && keys.includes("x") && keys.includes("y");
    if (isVector) {
      control.appendChild(makeVectorRow(obj, vecKeys));
      return;
    }

    if (keys.length === 4 && ["r", "g", "b", "a"].every((k) => k in obj)) {
      const c = document.createElement("div");
      c.className = "unity-vec unity-color";
      const sw = document.createElement("span");
      sw.className = "unity-color-swatch";
      sw.style.background = "rgba("
        + Math.round(num(obj.r) * 255) + ","
        + Math.round(num(obj.g) * 255) + ","
        + Math.round(num(obj.b) * 255) + ","
        + num(obj.a) + ")";
      c.appendChild(sw);
      for (const k of ["r", "g", "b", "a"]) c.appendChild(makeVecCell(k, obj[k]));
      control.appendChild(c);
      return;
    }

    const details = document.createElement("details");
    details.className = "unity-subfields";
    const sum = document.createElement("summary");
    sum.className = "unity-subfields-summary";
    sum.textContent = prettyName(keys[0] || "object") + " (" + keys.length + ")";
    details.appendChild(sum);
    const body = document.createElement("div");
    body.className = "unity-subfields-body";
    renderFieldsGui(obj, body, 0);
    details.appendChild(body);
    control.appendChild(details);
  }

  function makeVectorRow(obj, order) {
    const vec = document.createElement("div");
    vec.className = "unity-vec";
    for (const k of order) {
      if (!(k in obj)) continue;
      vec.appendChild(makeVecCell(k, obj[k]));
    }
    return vec;
  }

  function makeVecCell(key, value) {
    const f = document.createElement("div");
    f.className = "unity-vec-field";
    const kEl = document.createElement("span");
    kEl.className = "unity-vec-key";
    kEl.textContent = String(key).toUpperCase();
    f.appendChild(kEl);
    const vEl = document.createElement("span");
    vEl.className = "unity-vec-val";
    vEl.textContent = fmtNum(value);
    f.appendChild(vEl);
    return f;
  }

  function renderArrayControl(arr, control) {
    const details = document.createElement("details");
    details.className = "unity-array";
    const sum = document.createElement("summary");
    sum.className = "unity-array-summary";
    sum.textContent = "Элементов: " + arr.length;
    details.appendChild(sum);
    if (arr.length === 0) {
      control.appendChild(details);
      return;
    }
    const body = document.createElement("div");
    body.className = "unity-array-body";
    const limit = Math.min(arr.length, 50);
    for (let i = 0; i < limit; i++) {
      body.appendChild(renderField("[" + i + "]", arr[i], 0));
    }
    if (arr.length > limit) {
      const more = document.createElement("div");
      more.className = "unity-array-more";
      more.textContent = "…ещё " + (arr.length - limit);
      body.appendChild(more);
    }
    details.appendChild(body);
    control.appendChild(details);
  }

  function num(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  function fmtNum(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return String(v);
    if (Number.isInteger(n)) return String(n);
    return n.toFixed(4).replace(/\.?0+$/, "");
  }

  function hitTest(mx, my) {
    if (!model) return null;
    for (let i = model.gameObjects.length - 1; i >= 0; i--) {
      const g = model.gameObjects[i];
      if (!isDrawable(g)) continue;
      const p = toScreen(g.worldX, g.worldY);
      const w = Math.max(3, g.sizeX * view.scale);
      const h = Math.max(3, g.sizeY * view.scale);
      if (mx >= p.x - w / 2 && mx <= p.x + w / 2 &&
          my >= p.y - h / 2 && my <= p.y + h / 2) {
        return g;
      }
    }
    return null;
  }

  let dragState = null;

  if (canvasEl) {
    canvasEl.addEventListener("mousedown", (e) => {
      dragState = { x: e.clientX, y: e.clientY, moved: false };
    });
    window.addEventListener("mousemove", (e) => {
      if (!dragState) return;
      const dx = e.clientX - dragState.x;
      const dy = e.clientY - dragState.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) dragState.moved = true;
      view.cx -= dx / view.scale;
      view.cy += dy / view.scale;
      dragState.x = e.clientX;
      dragState.y = e.clientY;
      draw();
    });
    window.addEventListener("mouseup", () => { dragState = null; });

    canvasEl.addEventListener("wheel", (e) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      view.scale = Math.max(2, Math.min(400, view.scale * factor));
      draw();
    }, { passive: false });

    canvasEl.addEventListener("click", (e) => {
      const rect = canvasEl.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const hit = hitTest(mx, my);
      if (hit) selectNode(hit.fileID);
    });

    let touchStart = null;
    canvasEl.addEventListener("touchstart", (e) => {
      if (e.touches.length === 1) {
        touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now(), moved: false };
      } else if (e.touches.length === 2) {
        const d = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        touchStart = { pinch: d, scale: view.scale, moved: true };
      }
    }, { passive: true });

    canvasEl.addEventListener("touchmove", (e) => {
      if (!touchStart) return;
      if (e.touches.length === 1 && touchStart.x !== undefined) {
        const dx = e.touches[0].clientX - touchStart.x;
        const dy = e.touches[0].clientY - touchStart.y;
        if (Math.abs(dx) + Math.abs(dy) > 3) touchStart.moved = true;
        view.cx -= dx / view.scale;
        view.cy += dy / view.scale;
        touchStart.x = e.touches[0].clientX;
        touchStart.y = e.touches[0].clientY;
        draw();
      } else if (e.touches.length === 2 && touchStart.pinch) {
        const d = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        const factor = d / touchStart.pinch;
        view.scale = Math.max(2, Math.min(400, touchStart.scale * factor));
        draw();
      }
    }, { passive: true });

    canvasEl.addEventListener("touchend", (e) => {
      if (!touchStart) return;
      const elapsed = Date.now() - (touchStart.t || 0);
      if (touchStart.x !== undefined && elapsed < 400 && !touchStart.moved && e.changedTouches.length) {
        const touch = e.changedTouches[0];
        const rect = canvasEl.getBoundingClientRect();
        const hit = hitTest(touch.clientX - rect.left, touch.clientY - rect.top);
        if (hit) selectNode(hit.fileID);
      }
      touchStart = null;
    }, { passive: true });

    window.addEventListener("resize", resizeCanvas);

    if (window.ResizeObserver && canvasEl.parentElement) {
      let raf = 0;
      const ro = new ResizeObserver(() => {
        if (raf) return;
        raf = requestAnimationFrame(() => { raf = 0; resizeCanvas(); });
      });
      ro.observe(canvasEl.parentElement);
    }
  }

  function syncView() {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      resizeCanvas();
      autoFit();
      draw();
    }));
  }

  return {
    open(path, text, context) {
      if (pathEl) pathEl.textContent = path;
      injectStyles();
      ensureHierarchyToggle();
      ensureInspectorClose();
      generation++;
      const myGen = generation;
      const docs = parseUnityYaml(text);
      model = buildSceneModel(docs);
      selectedFileID = null;
      if (inspectorPanel) inspectorPanel.classList.add("closed");
      if (hierarchyPanel) hierarchyPanel.classList.remove("collapsed");
      if (hierarchyToggleBtn) {
        hierarchyToggleBtn.textContent = "▾";
        hierarchyToggleBtn.title = "Свернуть";
      }
      renderHierarchy();
      renderInspector();
      syncView();
      if (context) resolvePrefabs(myGen, context);
    },
    close() {
      generation++;
      model = null;
      selectedFileID = null;
      if (hierEl) hierEl.innerHTML = "";
      if (inspectorEl) inspectorEl.innerHTML = "";
      if (hierarchyPanel) hierarchyPanel.classList.remove("collapsed");
      if (inspectorPanel) inspectorPanel.classList.add("closed");
      if (hierarchyToggleBtn) {
        hierarchyToggleBtn.textContent = "▾";
        hierarchyToggleBtn.title = "Свернуть";
      }
      if (ctx && canvasEl) {
        const rect = canvasEl.getBoundingClientRect();
        ctx.clearRect(0, 0, rect.width, rect.height);
      }
    },
  };
}
