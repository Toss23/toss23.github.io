import { $ } from "@core/dom.js";
import { parseUnityYaml, buildSceneModel, classDisplayName } from "@api/unity-yaml.js";

// Read-only просмотр сцены Unity: иерархия сверху, 2D-вид по XZ по центру,
// инспектор снизу. Редактирование не поддерживается.
export function initUnitySceneScreen() {
  const pathEl = $("unity-scene-path");
  const hierEl = $("unity-hierarchy-list");
  const canvas = $("unity-canvas");
  const inspectorEl = $("unity-inspector-body");

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
    renderHierarchy();
    renderInspector();
    draw();
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
      renderFields(inner, body, 0, 6);
    } else {
      body.textContent = String(inner);
    }
    wrap.appendChild(body);
    return wrap;
  }

  function renderFields(obj, parent, depth, maxDepth) {
    if (depth > maxDepth) {
      const el = document.createElement("div");
      el.className = "unity-field-row";
      el.textContent = "…";
      parent.appendChild(el);
      return;
    }
    if (Array.isArray(obj)) {
      for (let i = 0; i < obj.length; i++) {
        const row = document.createElement("div");
        row.className = "unity-field-row";
        row.style.paddingLeft = (depth * 12) + "px";
        const k = document.createElement("span");
        k.className = "unity-field-key";
        k.textContent = "[" + i + "]";
        row.appendChild(k);
        const v = obj[i];
        if (v !== null && typeof v === "object") {
          const vEl = document.createElement("span");
          vEl.className = "unity-field-val unity-field-obj";
          vEl.textContent = formatRef(v);
          row.appendChild(vEl);
          const sub = document.createElement("div");
          sub.className = "unity-field-sub";
          renderFields(v, sub, depth + 1, maxDepth);
          row.appendChild(sub);
        } else {
          const vEl = document.createElement("span");
          vEl.className = "unity-field-val";
          vEl.textContent = formatScalar(v);
          row.appendChild(vEl);
        }
        parent.appendChild(row);
      }
      return;
    }
    for (const k of Object.keys(obj)) {
      if (k === "m_ObjectHideFlags") continue;
      const val = obj[k];
      const row = document.createElement("div");
      row.className = "unity-field-row";
      row.style.paddingLeft = (depth * 12) + "px";
      const kEl = document.createElement("span");
      kEl.className = "unity-field-key";
      kEl.textContent = k;
      row.appendChild(kEl);
      if (val !== null && typeof val === "object") {
        const vEl = document.createElement("span");
        vEl.className = "unity-field-val unity-field-obj";
        vEl.textContent = formatRef(val);
        row.appendChild(vEl);
        const sub = document.createElement("div");
        sub.className = "unity-field-sub";
        renderFields(val, sub, depth + 1, maxDepth);
        row.appendChild(sub);
      } else {
        const vEl = document.createElement("span");
        vEl.className = "unity-field-val";
        vEl.textContent = formatScalar(val);
        row.appendChild(vEl);
      }
      parent.appendChild(row);
    }
  }

  function formatRef(obj) {
    if (obj && obj.fileID !== undefined) return "{fileID: " + obj.fileID + "}";
    if (Array.isArray(obj)) return "[Array " + obj.length + "]";
    return "{...}";
  }

  function formatScalar(v) {
    if (v === null) return "null";
    if (v === undefined) return "";
    if (typeof v === "object") return JSON.stringify(v);
    return String(v);
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
      if (ctx && canvas) {
        const rect = canvas.getBoundingClientRect();
        ctx.clearRect(0, 0, rect.width, rect.height);
      }
    },
  };
}
