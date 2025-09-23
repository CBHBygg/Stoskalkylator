
(function () {
  "use strict";

  // ---------------- Utils ----------------
  const $ = (id) => document.getElementById(id);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const mmToPt = (mm) => (mm * 72.0) / 25.4;
  const A4 = { wMm: 210, hMm: 297, marginMm: 5 };

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

  // ---------------- Export helpers ----------------
  function downloadText(filename, text) {
    const blob = new Blob([text], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportSVG(previewId, filename) {
    const wrap = document.querySelector(`#${previewId}`);
    if (!wrap) return;
    const svg = wrap.querySelector("svg");
    if (!svg) return;
    const serializer = new XMLSerializer();
    const text = serializer.serializeToString(svg);
    downloadText(filename || "pattern.svg", text);
  }

  async function exportMultiPagePDF(previewId, filenameBase) {
    const { jsPDF, svg2pdf } = getLibs();
    if (!jsPDF || !svg2pdf) {
      alert("PDF-export misslyckades: jsPDF/svg2pdf inte laddad.");
      return;
    }
    const svg = document.querySelector(`#${previewId} svg`);
    if (!svg) { alert("Ingen SVG att exportera."); return; }
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
        const originalBody = svg.querySelector("g") || svg;
        const body = originalBody.cloneNode(true);
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

  function hookExport(previewId, svgBtnId, pdfBtnId, printBtnId) {
    const svgBtn = $(svgBtnId);
    const pdfBtn = $(pdfBtnId);
    const printBtn = $(printBtnId);
    if (svgBtn) svgBtn.onclick = () => exportSVG(previewId, "pattern.svg");
    if (pdfBtn) pdfBtn.onclick = () => exportMultiPagePDF(previewId, "pattern");
    if (printBtn) pdfBtn.onclick = () => exportMultiPagePDF(previewId, "pattern");
  }

  // ---------------- Kona logic (half pattern with auto rotation) ----------------
  function computeObliqueConeTriangulation(topD, botD, angleDeg, segments = 6, extraMm = 30, rotDeg = 0) {
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
    const thetas = Array.from({ length: segments + 1 }, (_, i) => (Math.PI * i) / segments); // half circle only
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

  function computeBBox(inner, outer) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x, y] of inner.concat(outer)) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
    return { w: maxX - minX, h: maxY - minY, minX, minY, maxX, maxY };
  }

  function findBestRotation(topD, botD, angleDeg) {
    let best = 0, bestScore = -Infinity;
    for (let rot = 0; rot < 180; rot += 5) {
      const pts = computeObliqueConeTriangulation(topD, botD, angleDeg, 6, 30, rot);
      const box = computeBBox(pts.inner, pts.outer);
      const fitPortrait = Math.min((A4.wMm - 2 * A4.marginMm) / box.w, (A4.hMm - 2 * A4.marginMm) / box.h);
      const fitLandscape = Math.min((A4.hMm - 2 * A4.marginMm) / box.w, (A4.wMm - 2 * A4.marginMm) / box.h);
      const score = Math.max(fitPortrait, fitLandscape);
      if (score > bestScore) { bestScore = score; best = rot; }
    }
    return best;
  }

  function renderKona(topD, botD, angleDeg) {
    const rot = findBestRotation(topD, botD, angleDeg);
    const dev = computeObliqueConeTriangulation(topD, botD, angleDeg, 6, 30, rot);
    const { inner, outer } = dev;
    const all = outer.concat(inner);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x, y] of all) { if (x < minX) minX = x; if (y < minY) minY = y; if (x > maxX) maxX = x; if (y > maxY) maxY = y; }
    const margin = 10;
    const dx = -minX + margin;
    const dy = -minY + margin;
    const w = maxX - minX + 2 * margin;
    const h = maxY - minY + 2 * margin;
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
    $("konaMeta").textContent = `Kona (halvmönster, auto rotation ${rot}°): ToppØ=${topD} mm, BottenØ=${botD} mm, Vinkel=${angleDeg}°`;
    $("konaResult").style.display = "block";
    hookExport("konaPreview", "konaSvg", "konaPdf", "konaPrint");
  }

  // ---------------- Tabs ----------------
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
      btn.classList.add("active");
      const targetId = "tab-" + btn.dataset.tab;
      document.getElementById(targetId).classList.add("active");
    });
  });

  // ---------------- Kona form submit ----------------
  const konaForm = $("konaForm");
  if (konaForm) {
    konaForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const topD = parseFloat($("konaTop").value);
      const botD = parseFloat($("konaBottom").value);
      const slopeDeg = parseFloat($("konaSlope").value);
      if (isNaN(topD) || isNaN(botD) || isNaN(slopeDeg)) return;
      renderKona(topD, botD, slopeDeg);
    });
  }
})();
