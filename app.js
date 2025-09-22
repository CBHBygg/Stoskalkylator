
(function () {
  "use strict";

  // ---------------- Utils ----------------
  const $ = (id) => document.getElementById(id);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const mmToPt = (mm) => (mm * 72.0) / 25.4;
  const A4 = { wMm: 210, hMm: 297, marginMm: 5 };

  function getNumberFrom(ids, fallback) {
    for (const id of ids) {
      const el = $(id);
      if (el && el.value != null && el.value !== "") {
        const v = Number(String(el.value).replace(",", "."));
        if (!Number.isNaN(v)) return v;
      }
    }
    return fallback;
  }

  // ---------------- Library detection ----------------
  function getLibs() {
    const jsPDF = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
    let svg2pdf = window.svg2pdf || window.SVG2PDF;
    if (svg2pdf && typeof svg2pdf !== "function") {
      if (typeof svg2pdf.default === "function") {
        svg2pdf = svg2pdf.default;
      } else if (svg2pdf.svg2pdf && typeof svg2pdf.svg2pdf === "function") {
        svg2pdf = svg2pdf.svg2pdf;
      }
    }
    return { jsPDF, svg2pdf };
  }

  // ---------------- Export helpers (1:1 scale) ----------------
  function downloadText(filename, text, mime="image/svg+xml;charset=utf-8") {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportSVG(previewId, filename) {
    const svg = document.querySelector(`#${previewId} svg`);
    if (!svg) return alert("Ingen SVG att exportera.");
    const serializer = new XMLSerializer();
    const text = serializer.serializeToString(svg);
    downloadText(filename || "pattern.svg", text);
  }

  async function exportMultiPagePDF(previewId, filenameBase) {
    const { jsPDF, svg2pdf } = getLibs();
    if (!jsPDF || !svg2pdf) return alert("PDF-export misslyckades: jsPDF/svg2pdf inte laddad.");
    const svg = document.querySelector(`#${previewId} svg`);
    if (!svg) return alert("Ingen SVG att exportera.");
    const widthMm = parseFloat(svg.getAttribute("width"));
    const heightMm = parseFloat(svg.getAttribute("height"));
    const pageW = A4.wMm - 2 * A4.marginMm;
    const pageH = A4.hMm - 2 * A4.marginMm;
    const cols = Math.ceil(widthMm / pageW);
    const rows = Math.ceil(heightMm / pageH);
    const pdf = new jsPDF({ unit: "pt", format: "a4" });
    const pageWpt = pdf.internal.pageSize.getWidth();
    const pageHpt = pdf.internal.pageSize.getHeight();
    const marginPt = mmToPt(A4.marginMm);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (r !== 0 || c !== 0) pdf.addPage();
        const xMm = c * pageW;
        const yMm = r * pageH;
        const clone = svg.cloneNode(true);
        const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
        g.setAttribute("transform", `translate(${-xMm},${-yMm})`);
        const clipId = `clip_${r}_${c}`;
        const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
        const clipPath = document.createElementNS("http://www.w3.org/2000/svg", "clipPath");
        clipPath.setAttribute("id", clipId);
        const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        rect.setAttribute("x", xMm);
        rect.setAttribute("y", yMm);
        rect.setAttribute("width", pageW);
        rect.setAttribute("height", pageH);
        clipPath.appendChild(rect);
        defs.appendChild(clipPath);
        const body = (svg.querySelector("g") || svg).cloneNode(true);
        body.setAttribute("clip-path", `url(#${clipId})`);
        g.appendChild(body);
        clone.innerHTML = "";
        clone.appendChild(defs);
        clone.appendChild(g);
        clone.setAttribute("width", pageW + "mm");
        clone.setAttribute("height", pageH + "mm");
        clone.setAttribute("viewBox", `0 0 ${pageW} ${pageH}`);
        await svg2pdf(clone, pdf, {
          x: marginPt,
          y: marginPt,
          width: pageWpt - 2 * marginPt,
          height: pageHpt - 2 * marginPt,
          useCSS: true,
        });
      }
    }
    pdf.save((filenameBase || "pattern") + ".pdf");
  }

  function printPreview(previewId) {
    const svg = document.querySelector(`#${previewId} svg`);
    if (!svg) return alert("Ingen SVG att skriva ut.");
    const w = svg.getAttribute("width");
    const h = svg.getAttribute("height");
    const html = `<!doctype html><html><head><meta charset="utf-8">
      <style>
        @page { size: A4; margin: 10mm; }
        body{margin:0;padding:0}
      </style>
    </head>
    <body>
      ${svg.outerHTML}
      <script>window.onload = () => { window.print(); }</script>
    </body></html>`;
    const win = window.open("", "_blank");
    win.document.open();
    win.document.write(html);
    win.document.close();
  }

  function hookExport(previewId, svgBtnId, pdfBtnId, printBtnId) {
    const svgBtn = $(svgBtnId);
    const pdfBtn = $(pdfBtnId);
    const printBtn = $(printBtnId);
    if (svgBtn) svgBtn.onclick = () => exportSVG(previewId, "pattern.svg");
    if (pdfBtn) pdfBtn.onclick = () => exportMultiPagePDF(previewId, "pattern");
    if (printBtn) printBtn.onclick = () => printPreview(previewId);
  }

  // ---------------- KONA: half pattern, 1° auto-rotation, slider, 1:1, tiling ----------------
  function computeKonaTriangulation(topD, botD, angleDeg, segments = 6, extraMm = 30, rotDeg = 0) {
    const R2 = topD / 2;
    const R1 = botD / 2;
    const T = Math.tan((angleDeg * Math.PI) / 180);
    const E = extraMm;
    const B = E + T * (R1 + R2);
    const C = E * T * (R1 - R2);
    const H = 0.5 * (B + Math.sqrt(B * B + 4 * C));
    const k = (R1 - R2) / H;
    const sF = Math.hypot(1, k);
    const zApex = R1 / k;
    const Rin = (zApex - H) * sF;
    const thetas = Array.from({ length: segments + 1 }, (_, i) => (Math.PI * i) / segments); // half only
    function zAt(th) {
      const c = Math.cos(th);
      const denom = 1 - T * k * c;
      return (T * R1 * (1 - c)) / denom;
    }
    const pts3D = thetas.map((th) => {
      const z = zAt(th);
      const r = R1 - k * z;
      return { th, z, r, x: r * Math.cos(th), y: r * Math.sin(th) };
    });
    const Rb = pts3D.map((p) => (zApex - p.z) * sF);
    const chords = [];
    for (let i = 0; i < segments; i++) {
      const p = pts3D[i], q = pts3D[i + 1];
      chords.push(Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z));
    }
    const betas = [0];
    for (let i = 0; i < segments; i++) {
      const a = Rb[i], b = Rb[i + 1], c = chords[i];
      const cosPhi = clamp((a * a + b * b - c * c) / (2 * a * b), -1, 1);
      betas.push(betas[betas.length - 1] + Math.acos(cosPhi));
    }
    const outer = betas.map((b, i) => [Rb[i] * Math.cos(b), Rb[i] * Math.sin(b)]);
    const inner = betas.map((b) => [Rin * Math.cos(b), Rin * Math.sin(b)]);
    const ang = (rotDeg * Math.PI) / 180;
    const rotate = ([x, y]) => [x * Math.cos(ang) - y * Math.sin(ang), x * Math.sin(ang) + y * Math.cos(ang)];
    const outerR = outer.map(rotate);
    const innerR = inner.map(rotate);
    return { inner: innerR, outer: outerR };
  }

  function computeBBox(points) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x, y] of points) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
    return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
  }

  function findBestKonaRotation(topD, botD, angleDeg) {
    let best = 0, bestScore = -Infinity;
    for (let rot = 0; rot < 180; rot++) { // 1° steps
      const dev = computeKonaTriangulation(topD, botD, angleDeg, 6, 30, rot);
      const box = computeBBox(dev.inner.concat(dev.outer));
      const fitPortrait = Math.min((A4.wMm - 2 * A4.marginMm) / box.w, (A4.hMm - 2 * A4.marginMm) / box.h);
      const fitLandscape = Math.min((A4.hMm - 2 * A4.marginMm) / box.w, (A4.wMm - 2 * A4.marginMm) / box.h);
      const score = Math.max(fitPortrait, fitLandscape);
      if (score > bestScore) { bestScore = score; best = rot; }
    }
    return best;
  }

  let currentKonaRot = 0;

  function renderKona(topD, botD, angleDeg, manualRot = null) {
    const rot = manualRot !== null ? manualRot : findBestKonaRotation(topD, botD, angleDeg);
    currentKonaRot = rot;
    const dev = computeKonaTriangulation(topD, botD, angleDeg, 6, 30, rot);
    const { inner, outer } = dev;
    const all = outer.concat(inner);
    const bb = computeBBox(all);
    const margin = 10;
    const dx = -bb.minX + margin;
    const dy = -bb.minY + margin;
    const w = bb.w + 2 * margin;
    const h = bb.h + 2 * margin;
    const fmt = (x, y) => `${(x + dx).toFixed(2)},${(y + dy).toFixed(2)}`;
    const polyOuter = outer.map(([x, y]) => fmt(x, y)).join(" ");
    const polyInner = inner.map(([x, y]) => fmt(x, y)).join(" ");
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w.toFixed(2)}mm" height="${h.toFixed(2)}mm" viewBox="0 0 ${w.toFixed(2)} ${h.toFixed(2)}" shape-rendering="geometricPrecision">`;
    svg += `<polyline points="${polyOuter}" fill="none" stroke="black" stroke-width="0.35"/>`;
    svg += `<polyline points="${polyInner}" fill="none" stroke="black" stroke-width="0.35"/>`;
    for (let i = 0; i < inner.length; i++) {
      const xi = inner[i][0] + dx, yi = inner[i][1] + dy;
      const xo = outer[i][0] + dx, yo = outer[i][1] + dy;
      svg += `<line x1="${xi.toFixed(2)}" y1="${yi.toFixed(2)}" x2="${xo.toFixed(2)}" y2="${yo.toFixed(2)}" stroke="black" stroke-width="0.35"/>`;
    }
    svg += `</svg>`;
    $("konaPreview").innerHTML = svg;
    const meta = $("konaMeta");
    if (meta) meta.textContent = `Kona (halvmönster, rotation ${rot}°): ToppØ=${topD} mm, BottenØ=${botD} mm, Vinkel=${angleDeg}°`;
    const boxEl = $("konaResult");
    if (boxEl) boxEl.style.display = "block";
    const rs = $("konaRotSlider"), ri = $("konaRotInput");
    if (rs) rs.value = rot;
    if (ri) ri.value = rot;
    hookExport("konaPreview", "konaSvg", "konaPdf", "konaPrint");
  }

  // ---------------- STOS: half pattern of angled cut cylinder (sinusoid), 1:1, tiling, print ----------------
  function renderStos(diameter, angleDeg) {
    const R = diameter / 2;
    const T = Math.tan((angleDeg * Math.PI) / 180);
    const height = 2 * R * T;                 // skärningshöjd
    const halfWidth = Math.PI * diameter / 2; // omkrets/2
    const samples = 300;
    const pts = [];
    for (let i = 0; i <= samples; i++) {
      const theta = Math.PI * (i / samples); // 0..π for half pattern
      const x = (theta / Math.PI) * halfWidth;
      const y = R * T * (1 - Math.cos(theta)); // 0..2RT
      pts.push([x, y]);
    }
    const margin = 10;
    const w = halfWidth + 2 * margin;
    const h = height + 2 * margin;
    const fmt = (x, y) => `${(x + margin).toFixed(2)},${(y + margin).toFixed(2)}`;
    const poly = pts.map(([x, y]) => fmt(x, y)).join(" ");
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w.toFixed(2)}mm" height="${h.toFixed(2)}mm" viewBox="0 0 ${w.toFixed(2)} ${h.toFixed(2)}" shape-rendering="geometricPrecision">`;
    // bounding box
    svg += `<rect x="${margin}" y="${margin}" width="${halfWidth.toFixed(2)}" height="${height.toFixed(2)}" fill="none" stroke="#999" stroke-dasharray="4 4"/>`;
    // curve
    svg += `<polyline points="${poly}" fill="none" stroke="black" stroke-width="0.35"/>`;
    // size markers (optional light)
    svg += `</svg>`;
    $("stosPreview").innerHTML = svg;
    const meta = $("stosMeta");
    if (meta) meta.textContent = `Stos (halvmönster): Ø=${diameter} mm, Vinkel=${angleDeg}°, Skärningshöjd=${height.toFixed(2)} mm, Halvbredd=${halfWidth.toFixed(2)} mm`;
    const box = $("stosResult");
    if (box) box.style.display = "block";
    hookExport("stosPreview", "stosSvg", "stosPdf", "stosPrint");
  }

  // ---------------- Tabs ----------------
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
      btn.classList.add("active");
      const targetId = "tab-" + btn.dataset.tab;
      const tabEl = document.getElementById(targetId);
      if (tabEl) tabEl.classList.add("active");
    });
  });

  // ---------------- Wire forms & controls ----------------
  // Kona form
  const konaForm = $("konaForm");
  if (konaForm) {
    konaForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const topD = getNumberFrom(["konaTop","toppdiameter","Toppdiameter"], 50);
      const botD = getNumberFrom(["konaBottom","bottendiameter","Bottendiameter"], 70);
      const slopeDeg = getNumberFrom(["konaSlope","taklutning","Taklutning"], 45);
      renderKona(topD, botD, slopeDeg);
    });
  }
  const rs = $("konaRotSlider"), ri = $("konaRotInput");
  function rerenderKonaManual() {
    const topD = getNumberFrom(["konaTop","toppdiameter","Toppdiameter"], 50);
    const botD = getNumberFrom(["konaBottom","bottendiameter","Bottendiameter"], 70);
    const slopeDeg = getNumberFrom(["konaSlope","taklutning","Taklutning"], 45);
    renderKona(topD, botD, slopeDeg, currentKonaRot);
  }
  if (rs && ri) {
    rs.addEventListener("input", (e) => { currentKonaRot = parseInt(e.target.value); ri.value = currentKonaRot; rerenderKonaManual(); });
    ri.addEventListener("input", (e) => { currentKonaRot = parseInt(e.target.value); rs.value = currentKonaRot; rerenderKonaManual(); });
  }

  // Stos form
  const stosForm = $("stosForm");
  if (stosForm) {
    stosForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const d = getNumberFrom(["stosDiameter","stos_diameter","stosD","diameter","Diameter"], 100);
      const a = getNumberFrom(["stosAngle","stos_angle","stosTaklutning","stosSlope","TaklutningStos"], 45);
      renderStos(d, a);
    });
  }

  // Service worker register
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./service-worker.js");
    });
  }

  // Expose for console testing
  window.CBH = { renderKona, renderStos };
})();
