import { $ } from "@core/dom.js";
import { parseUnityYaml, buildSceneModel, classDisplayName } from "@api/unity-yaml.js";

// Read-only просмотр сцены Unity: иерархия сверху, 2D-вид по XZ по центру,
// инспектор снизу. Редактирование не поддерживается.
export function initUnitySceneScreen() {
  const pathEl = $("unity-scene-path");
  const hierEl = $("unity-hierarchy-list");
  const canvas = $("unity-canvas");
  const inspectorEl = $("unity-inspector-body");
  const hierarchyPanel = $("unity-hierarchy-panel");
  const hierarchyToggle = $("unity-hierarchy-toggle");
  const inspectorPanel = $("unity-inspector-panel");
  const inspectorCloseBtn = $("unity-inspector-close");

  const ctx = canvas ? canvas.getContext("2d") : null;

  let model = null;
  let selectedFileID = null;
  let view = { cx: 0, cz: 0, scale: 40 };

  /* ---------- Canvas ---------- */

  function resizeCanvas() {
    if (!canvas || !ctx) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  function autoFit() {
    if (!canvas) return;
    if (!model || !model.gameObjects.length) {
      view = { cx: 0, cz: 0, scale: 40 };
      return;
    }
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const g of model.gameObjects) {
      if (g.worldX < minX) minX = g.worldX;
      if (g.worldX > maxX) maxX = g.worldX;
      if (g.worldZ < minZ) minZ = g.worldZ;
      if (g.worldZ > maxZ) maxZ = g.worldZ;
    }
    const w = Math.max(1, maxX - minX);
    const h = Math.max(1, maxZ - minZ);
    const rect = canvas.getBoundingClientRect();
    const pad = 40;
    const sx = Math.max(1, rect.width - pad * 2) / w;
    const sz = Math.max(1, rect.height - pad * 2) / h;
    const s = Math.max(4, Math.min(200, Math.min(sx, sz)));
    view = { cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2, scale: s };
  }

  function toScreen(x, z) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: rect.width / 2 + (x - view.cx) * view.scale,
      y: rect.height / 2 - (z - view.cz) * view.scale,
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

  function draw() {
    if (!ctx || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);

    const gridStep = niceGridStep(view.scale);
    const viewMinX = view.cx - rect.width / 2 / view.scale;
    const viewMaxX = view.cx + rect.width / 2 / view.scale;
    const viewMinZ = view.cz - rect.height / 2 / view.scale;
    const viewMaxZ = view.cz + rect.height / 2 / view.scale;

    // Сетка
    ctx.strokeStyle = "#2a2a2a";
    ctx.lineWidth = 1;
    const startX = Math.floor(viewMinX / gridStep) * gridStep;
    const startZ = Math.floor(viewMinZ / gridStep) * gridStep;
    for (let gx = startX; gx <= viewMaxX; gx += gridStep) {
      const a = toScreen(gx, viewMinZ);
      const b = toScreen(gx, viewMaxZ);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    for (let gz = startZ; gz <= viewMaxZ; gz += gridStep) {
      const a = toScreen(viewMinX, gz);
      const b = toScreen(viewMaxX, gz);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }

    // Оси через 0
    ctx.strokeStyle = "#3e5a78";
    const yAxis = toScreen(0, viewMinZ);
    const xAxis = toScreen(viewMinX, 0);
    if (yAxis.x >= 0 && yAxis.x <= rect.width) {
      ctx.beginPath(); ctx.moveTo(yAxis.x, 0); ctx.lineTo(yAxis.x, rect.height); ctx.stroke();
    }
    if (xAxis.y >= 0 && xAxis.y <= rect.height) {
      ctx.beginPath(); ctx.moveTo(0, xAxis.y); ctx.lineTo(rect.width, xAxis.y); ctx.stroke();
    }

    if (!model) return;

    // Объекты
    for (const g of model.gameObjects) {
      const p = toScreen(g.worldX, g.worldZ);
      if (p.x < -50 || p.x > rect.width + 50 || p.y < -50 || p.y > rect.height + 50) continue;
      const isSel = g.fileID === selectedFileID;
      const r = isSel ? 8 : 5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fillStyle = isSel ? "#ffb454" : (g.active ? "#7db0f0" : "#555");
      ctx.fill();
      if (isSel) {
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      if (view.scale > 8 || isSel) {
        ctx.fillStyle = isSel ? "#fff" : "#999";
        ctx.font = "11px ui-monospace, monospace";
        ctx.fillText(g.name, p.x + 10, p.y - 6);
      }
    }
  }

  /* ---------- Иерархия ---------- */

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

    const row = document.createElement("div");
    row.className = "unity-tree-row";
    row.style.paddingLeft = (depth * 14 + 6) + "px";

    const arrow = document.createElement("span");
    arrow.className = "unity-tree-arrow";
    arrow.textContent = node.children.length ? "▾" : "·";
    row.appendChild(arrow);

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
    openInspector();
    renderHierarchy();
    renderInspector();
    draw();
  }

  function openInspector() {
    if (inspectorPanel) inspectorPanel.classList.remove("closed");
  }

  function closeInspector() {
    if (inspectorPanel) inspectorPanel.classList.add("closed");
  }

  /* ---------- Инспектор ---------- */

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
    icon.textContent = "◈";
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

  // Служебные поля Unity, которые прячем из GUI — они бесполезны для чтения.
  const SKIP_FIELDS = new Set([
    "m_ObjectHideFlags",
    "m_CorrespondingSourceObject",
    "m_PrefabInstance",
    "m_PrefabAsset",
  ]);

  // m_LocalPosition → «Local Position», m_IsActive → «Is Active».
  function prettyName(name) {
    let s = String(name);
    if (s.startsWith("m_")) s = s.slice(2);
    s = s.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
    return s;
  }

  function renderComponent(doc) {
    const wrap = document.createElement("details");
    wrap.className = "unity-component";
    wrap.open = true;

    const sum = document.createElement("summary");
    sum.className = "unity-component-title";
    sum.textContent = classDisplayName(doc.classID);
    wrap.appendChild(sum);

    const body = document.createElement("div");
    body.className = "unity-component-body";
    const keys = Object.keys(doc.data);
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

    // Ссылка {fileID: N} — кнопка, кликабельная, если ссылается на GameObject.
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

    // Векторы: 2/3/4 компонента x/y/z/w.
    const vecKeys = ["x", "y", "z", "w"];
    const isVector = keys.length > 0 && keys.every((k) => vecKeys.includes(k))
      && keys.includes("x") && keys.includes("y");
    if (isVector) {
      control.appendChild(makeVectorRow(obj, vecKeys));
      return;
    }

    // Цвет: r, g, b, a + свотч.
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

    // Прочее — раскрываемый подраздел со вложенными полями.
    const details = document.createElement("details");
    details.className = "unity-subfields";
    const sum = document.createElement("summary");
    sum.className = "unity-subfields-summary";
    sum.textContent = prettyName(Object.keys(obj)[0] || "object") + " (" + keys.length + ")";
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

  /* ---------- Управление видом ---------- */

  let dragState = null;

  if (canvas) {
    canvas.addEventListener("mousedown", (e) => {
      dragState = { x: e.clientX, y: e.clientY };
    });
    window.addEventListener("mousemove", (e) => {
      if (!dragState) return;
      const dx = e.clientX - dragState.x;
      const dy = e.clientY - dragState.y;
      view.cx -= dx / view.scale;
      view.cz += dy / view.scale;
      dragState.x = e.clientX;
      dragState.y = e.clientY;
      draw();
    });
    window.addEventListener("mouseup", () => { dragState = null; });

    canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      view.scale = Math.max(2, Math.min(400, view.scale * factor));
      draw();
    }, { passive: false });

    canvas.addEventListener("click", (e) => {
      if (!model) return;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      let best = null, bestD = 14;
      for (const g of model.gameObjects) {
        const p = toScreen(g.worldX, g.worldZ);
        const d = Math.hypot(p.x - mx, p.y - my);
        if (d < bestD) { bestD = d; best = g; }
      }
      if (best) selectNode(best.fileID);
    });

    let touchStart = null;
    canvas.addEventListener("touchstart", (e) => {
      if (e.touches.length === 1) {
        touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() };
      } else if (e.touches.length === 2) {
        const d = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        touchStart = { pinch: d, scale: view.scale };
      }
    }, { passive: true });

    canvas.addEventListener("touchmove", (e) => {
      if (!touchStart) return;
      if (e.touches.length === 1 && touchStart.x !== undefined) {
        const dx = e.touches[0].clientX - touchStart.x;
        const dy = e.touches[0].clientY - touchStart.y;
        view.cx -= dx / view.scale;
        view.cz += dy / view.scale;
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

    canvas.addEventListener("touchend", (e) => {
      if (!touchStart) return;
      const elapsed = Date.now() - (touchStart.t || 0);
      if (touchStart.x !== undefined && elapsed < 300 && e.changedTouches.length) {
        const touch = e.changedTouches[0];
        const rect = canvas.getBoundingClientRect();
        const mx = touch.clientX - rect.left;
        const my = touch.clientY - rect.top;
        const dx = touch.clientX - touchStart.x;
        const dy = touch.clientY - touchStart.y;
        if (Math.hypot(dx, dy) < 8 && model) {
          let best = null, bestD = 20;
          for (const g of model.gameObjects) {
            const p = toScreen(g.worldX, g.worldZ);
            const d = Math.hypot(p.x - mx, p.y - my);
            if (d < bestD) { bestD = d; best = g; }
          }
          if (best) selectNode(best.fileID);
        }
      }
      touchStart = null;
    }, { passive: true });

    window.addEventListener("resize", resizeCanvas);

    // Пересобираем канвас и при изменении размеров контейнера:
    // инспектор может разворачиваться/сворачиваться, а сцена должна
    // тянуться за ним без артефактов.
    if (window.ResizeObserver && canvas.parentElement) {
      let raf = 0;
      const ro = new ResizeObserver(() => {
        if (raf) return;
        raf = requestAnimationFrame(() => { raf = 0; resizeCanvas(); });
      });
      ro.observe(canvas.parentElement);
    }

    // Сворачивание иерархии.
    if (hierarchyToggle && hierarchyPanel) {
      hierarchyToggle.addEventListener("click", () => {
        const collapsed = hierarchyPanel.classList.toggle("collapsed");
        hierarchyToggle.textContent = collapsed ? "▸" : "▾";
        hierarchyToggle.title = collapsed ? "Развернуть" : "Свернуть";
      });
    }

    // Закрытие инспектора. Открывается снова при выборе объекта.
    if (inspectorCloseBtn && inspectorPanel) {
      inspectorCloseBtn.addEventListener("click", () => {
        closeInspector();
      });
    }
  }

  return {
    open(path, text) {
      if (pathEl) pathEl.textContent = path;
      const docs = parseUnityYaml(text);
      model = buildSceneModel(docs);
      selectedFileID = null;
      renderHierarchy();
      renderInspector();
      setTimeout(() => {
        resizeCanvas();
        autoFit();
        draw();
      }, 0);
    },
    close() {
      model = null;
      selectedFileID = null;
      if (hierEl) hierEl.innerHTML = "";
      if (inspectorEl) inspectorEl.innerHTML = "";
      if (hierarchyPanel) hierarchyPanel.classList.remove("collapsed");
      if (inspectorPanel) inspectorPanel.classList.remove("closed");
      if (hierarchyToggle) {
        hierarchyToggle.textContent = "▾";
        hierarchyToggle.title = "Свернуть";
      }
      if (ctx && canvas) {
        const rect = canvas.getBoundingClientRect();
        ctx.clearRect(0, 0, rect.width, rect.height);
      }
    },
  };
}
