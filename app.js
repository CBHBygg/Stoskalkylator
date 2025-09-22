
/* CBH Calculators – app.js (triangulation build)
   - Kona: triangulation-based, half pattern (6 seg), +30 mm, 1° auto-rotation, manual slider
   - Stos: half pattern
   - Exports: 1:1 SVG, 1:1 tiled PDF, proper Print (no scaling)
   - No Hmin=30 shortcuts anywhere
*/
(function () {
  "use strict";

  // ---------- Utils ----------
  const $ = (id) => document.getElementById(id);
  const mmToPt = (mm) => (mm * 72.0) / 25.4;
  const A4 = { wMm: 210, hMm: 297, marginMm: 5 };

  // ---------- Vendor detection ----------
  function getLibs() {
    const jsPDF = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
    let svg2pdf = window.svg2pdf || window.SVG2PDF;
    if (svg2pdf && typeof svg2pdf !== "function") {
      if (typeof svg2pdf.default === "function") svg2pdf = svg2pdf.default;
      else if (svg2pdf.svg2pdf && typeof svg2pdf.svg2pdf === "function") svg2pdf = svg2pdf.svg2pdf;
      else svg2pdf = null;
    }
    return { jsPDF, svg2pdf };
  }

  // ---------- Export helpers (true 1:1) ----------
  function exportSVG(previewId, filename) {
    const svg = document.querySelector(`#${previewId} svg`);
    if (!svg) return alert("Ingen SVG att exportera.");
    const text = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([text], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename || "pattern.svg";
    a.click();
    URL.revokeObjectURL(url);
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
    const marginPt = mmToPt(A4.marginMm);
    const pageWpt = mmToPt(pageW);
    const pageHpt = mmToPt(pageH);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (r !== 0 || c !== 0) pdf.addPage();

        const xMm = c * pageW;
        const yMm = r * pageH;

        // Clone with clip + translate (mm for mm)
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
          width: pageWpt,
          height: pageHpt,
          useCSS: true
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
      <style>@page { size: A4; margin: 10mm; } body{margin:0} svg{width:${w};height:${h};}</style>
      </head><body>${svg.outerHTML}<script>window.onload=()=>{window.print()}</script></body></html>`;
    const win = window.open("", "_blank");
    win.document.open();
    win.document.write(html);
    win.document.close();
  }

  function hookExport(previewId, svgBtnId, pdfBtnId, printBtnId, baseName) {
    const svgBtn = $(svgBtnId);
    const pdfBtn = $(pdfBtnId);
    const printBtn = $(printBtnId);
    if (svgBtn) svgBtn.onclick = () => exportSVG(previewId, (baseName || "pattern") + ".svg");
    if (pdfBtn) pdfBtn.onclick = () => exportMultiPagePDF(previewId, baseName || "pattern");
    if (printBtn) printBtn.onclick = () => printPreview(previewId);
  }

  // ---------- Kona: triangulation (half pattern, +30 mm) ----------
  function computeKonaTriangulation(topD, botD, angleDeg, segments = 6, extraMm = 30, rotDeg = 0) {
    const R2 = topD / 2;
    const R1 = botD / 2;
    const T = Math.tan((angleDeg * Math.PI) / 180); // slope of oblique plane
    const E = extraMm;

    // Solve: H^2 - H*(E + T*(R1+R2)) - E*T*(R1 - R2) = 0  (positive root)
    const B = E + T * (R1 + R2);
    const C = E * T * (R1 - R2);
    const H = 0.5 * (B + Math.sqrt(B * B + 4 * C));

    // Cone linear profile r(z) = R1 - k z, apex at zApex (from low edge)
    const k = (R1 - R2) / H;
    const sF = Math.hypot(1, k);       // slant factor along generator
    const zApex = R1 / k;              // axis distance to apex
    const Rin = (zApex - H) * sF;      // slant to top rim

    // Half circumference param (0..π)
    const thetas = Array.from({ length: segments + 1 }, (_, i) => (Math.PI * i) / segments);

    // Intersection of oblique plane with cone -> z(θ)
    const zAt = (th) => {
      const c = Math.cos(th);
      return (T * R1 * (1 - c)) / (1 - T * k * c);
    };

    // 3D bottom points
    const pts3D = thetas.map((th) => {
      const z = zAt(th);
      const r = R1 - k * z;
      return { th, z, r, x: r * Math.cos(th), y: r * Math.sin(th) };
    });

    // Slant radii from apex to each bottom point
    const Rb = pts3D.map((p) => (zApex - p.z) * sF);

    // True 3D chords between neighboring rim points
    const chords = [];
    for (let i = 0; i < segments; i++) {
      const p = pts3D[i], q = pts3D[i + 1];
      chords.push(Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z));
    }

    // Unroll using Law of Cosines
    const betas = [0];
    for (let i = 0; i < segments; i++) {
      const a = Rb[i], b = Rb[i + 1], c = chords[i];
      const cosPhi = Math.max(-1, Math.min(1, (a * a + b * b - c * c) / (2 * a * b)));
      betas.push(betas[betas.length - 1] + Math.acos(cosPhi));
    }

    // 2D development
    let outer = betas.map((b, i) => [Rb[i] * Math.cos(b), Rb[i] * Math.sin(b)]);
    let inner = betas.map((b) => [Rin * Math.cos(b), Rin * Math.sin(b)]);

    // Rotate for packing
    const ang = (rotDeg * Math.PI) / 180;
    const rot = ([x, y]) => [x * Math.cos(ang) - y * Math.sin(ang), x * Math.sin(ang) + y * Math.cos(ang)];
    outer = outer.map(rot);
    inner = inner.map(rot);

    // Generators
    const gens = inner.map((p, i) => [p, outer[i]]);
    return { inner, outer, gens };
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
      const bb = computeBBox(dev.inner.concat(dev.outer));
      const fitPortrait = Math.min((A4.wMm - 2 * A4.marginMm) / bb.w, (A4.hMm - 2 * A4.marginMm) / bb.h);
      const fitLandscape = Math.min((A4.hMm - 2 * A4.marginMm) / bb.w, (A4.wMm - 2 * A4.marginMm) / bb.h);
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
    const { inner, outer, gens } = dev;

    const all = outer.concat(inner).concat(gens.flat());
    const bb = computeBBox(all);
    const m = 10;
    const dx = -bb.minX + m;
    const dy = -bb.minY + m;
    const w = bb.w + 2 * m;
    const h = bb.h + 2 * m;

    const fmt = (x, y) => `${(x + dx).toFixed(2)},${(y + dy).toFixed(2)}`;
    const polyOuter = outer.map(([x, y]) => fmt(x, y)).join(" ");
    const polyInner = inner.map(([x, y]) => fmt(x, y)).join(" ");

    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w.toFixed(2)}mm" height="${h.toFixed(2)}mm" viewBox="0 0 ${w.toFixed(2)} ${h.toFixed(2)}" shape-rendering="geometricPrecision">`;
    svg += `<polyline points="${polyOuter}" fill="none" stroke="black" stroke-width="0.35"/>`;
    svg += `<polyline points="${polyInner}" fill="none" stroke="black" stroke-width="0.35"/>`;
    for (const [[xi, yi], [xo, yo]] of gens) {
      svg += `<line x1="${(xi + dx).toFixed(2)}" y1="${(yi + dy).toFixed(2)}" x2="${(xo + dx).toFixed(2)}" y2="${(yo + dy).toFixed(2)}" stroke="black" stroke-width="0.35"/>`;
    }
    svg += `</svg>`;

    $("konaPreview").innerHTML = svg;
    const meta = $("konaMeta");
    if (meta) meta.textContent = `Kona (halvmönster, rotation ${rot}°): ToppØ=${topD} mm, BottenØ=${botD} mm, Vinkel=${angleDeg}°`;
    $("konaResult").style.display = "block";
    const rs = $("konaRotSlider"), ri = $("konaRotInput");
    if (rs) rs.value = rot;
    if (ri) ri.value = rot;
    hookExport("konaPreview", "konaSvg", "konaPdf", "konaPrint", "kona");
  }

  // ---------- Stos: half pattern ----------
  function renderStos(diameter, angleDeg) {
    const R = diameter / 2;
    const T = Math.tan((angleDeg * Math.PI) / 180);
    const height = 2 * R * T;
    const halfWidth = Math.PI * diameter / 2;
    const samples = 300;
    const pts = [];
    for (let i = 0; i <= samples; i++) {
      const theta = Math.PI * (i / samples);   // 0..π
      const x = (theta / Math.PI) * halfWidth; // wrap
      const y = R * T * (1 - Math.cos(theta));
      pts.push([x, y]);
    }
    const margin = 10;
    const w = halfWidth + 2 * margin;
    const h = height + 2 * margin;
    const fmt = (x, y) => `${(x + margin).toFixed(2)},${(y + margin).toFixed(2)}`;
    const poly = pts.map(([x, y]) => fmt(x, y)).join(" ");
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w.toFixed(2)}mm" height="${h.toFixed(2)}mm" viewBox="0 0 ${w.toFixed(2)} ${h.toFixed(2)}" shape-rendering="geometricPrecision">`;
    svg += `<polyline points="${poly}" fill="none" stroke="black" stroke-width="0.35"/>`;
    svg += `</svg>`;
    $("stosPreview").innerHTML = svg;
    const meta = $("stosMeta");
    if (meta) meta.textContent = `Stos (halvmönster): Ø=${diameter} mm, Vinkel=${angleDeg}°`;
    $("stosResult").style.display = "block";
    hookExport("stosPreview", "stosSvg", "stosPdf", "stosPrint", "stos");
  }

  // ---------- Tabs ----------
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
      btn.classList.add("active");
      const targetId = "tab-" + btn.dataset.tab;
      const el = document.getElementById(targetId);
      if (el) el.classList.add("active");
    });
  });

  // ---------- Wire forms + rotation ----------
  const stosForm = $("stosForm");
  if (stosForm) {
    stosForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const D = parseFloat($("stosDiameter").value);
      const a = parseFloat($("stosSlope").value);
      if (!isNaN(D) && !isNaN(a)) renderStos(D, a);
    });
  }

  let currentKonaRot = 0;
  const konaForm = $("konaForm");
  if (konaForm) {
    konaForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const topD = parseFloat($("konaTop").value);
      const botD = parseFloat($("konaBottom").value);
      const slopeDeg = parseFloat($("konaSlope").value);
      if (!isNaN(topD) && !isNaN(botD) && !isNaN(slopeDeg)) {
        const best = findBestKonaRotation(topD, botD, slopeDeg);
        currentKonaRot = best;
        renderKona(topD, botD, slopeDeg, best);
      }
    });
  }

  const rs = $("konaRotSlider"), ri = $("konaRotInput");
  function rerenderManual() {
    const topD = parseFloat($("konaTop").value);
    const botD = parseFloat($("konaBottom").value);
    const slopeDeg = parseFloat($("konaSlope").value);
    if (!isNaN(topD) && !isNaN(botD) && !isNaN(slopeDeg)) renderKona(topD, botD, slopeDeg, currentKonaRot);
  }
  if (rs) rs.addEventListener("input", (e) => { currentKonaRot = parseInt(e.target.value); if (ri) ri.value = currentKonaRot; rerenderManual(); });
  if (ri) ri.addEventListener("input", (e) => { currentKonaRot = parseInt(e.target.value); if (rs) rs.value = currentKonaRot; rerenderManual(); });

  // ---------- Service worker ----------
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./service-worker.js");
    });
  }
})();
