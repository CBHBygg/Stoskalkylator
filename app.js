
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

  async 
function exportMultiPagePDF(previewId, filenameBase) {
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

    const pdf = new jsPDF({ unit: "mm", format: "a4" });

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (r !== 0 || c !== 0) pdf.addPage();
        const xMm = c * pageW;
        const yMm = r * pageH;

        // Build a wrapper SVG that clips to the tile area and translates the content
        const NS = "http://www.w3.org/2000/svg";
        const wrap = document.createElementNS(NS, "svg");
        wrap.setAttribute("xmlns", NS);
        wrap.setAttribute("width", `${pageW}mm`);
        wrap.setAttribute("height", `${pageH}mm`);
        wrap.setAttribute("viewBox", `0 0 ${pageW} ${pageH}`);

        const defs = document.createElementNS(NS, "defs");
        const clipPath = document.createElementNS(NS, "clipPath");
        const clipId = `clip_${r}_${c}`;
        clipPath.setAttribute("id", clipId);
        const rect = document.createElementNS(NS, "rect");
        rect.setAttribute("x", xMm);
        rect.setAttribute("y", yMm);
        rect.setAttribute("width", pageW);
        rect.setAttribute("height", pageH);
        clipPath.appendChild(rect);
        defs.appendChild(clipPath);
        wrap.appendChild(defs);

        const g = document.createElementNS(NS, "g");
        g.setAttribute("clip-path", `url(#${clipId})`);
        g.setAttribute("transform", `translate(${-xMm},${-yMm})`);

        // Clone CHILDREN of the original SVG (not the <svg> itself) to avoid nested <svg> issues
        Array.from(svg.childNodes).forEach(node => {
          g.appendChild(node.cloneNode(true));
        });
        wrap.appendChild(g);

        // Render this tile into the PDF at the page margins
        await svg2pdf(wrap, pdf, {
          x: A4.marginMm,
          y: A4.marginMm,
          width: pageW,
          height: pageH,
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
    if (printBtn) printBtn.onclick = () => window.print();
  }

  
// ---------------- Stos logic (half development, boxed tightly) ----------------
function computeStos(d, h, slope, steps = 180) {
  const r = d / 2;
  const T = Math.tan((slope * Math.PI) / 180);
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const th = (Math.PI * i) / steps; // 0..π
    const arc = r * th;               // arc length along circumference
    const y = r * Math.cos(th);
    const z = h + T * y;              // oblique cut height
    pts.push([arc, z]);
  }
  return pts;
}

function renderStos(d, h, slope) {
  const pts = computeStos(d, h, slope);
  const w = Math.PI * d / 2; // half circumference
  const zVals = pts.map((p) => p[1]);
  const minZ = Math.min(...zVals);
  const maxZ = Math.max(...zVals);
  const boxH = maxZ - minZ;

  const pathD = pts.map(([x,z]) => {
    const y = (z - minZ);
    return `${x.toFixed(2)},${(boxH - y).toFixed(2)}`;
  }).join(" L ");

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w.toFixed(2)}mm" height="${boxH.toFixed(2)}mm" viewBox="0 0 ${w.toFixed(2)} ${boxH.toFixed(2)}" font-size="6" shape-rendering="geometricPrecision">`;
  svg += `<path d="M ${pathD}" fill="none" stroke="black" stroke-width="0.35"/>`;
  svg += `<rect x="0" y="0" width="${w.toFixed(2)}" height="${boxH.toFixed(2)}" fill="none" stroke="black" stroke-dasharray="4"/>`;
  svg += `<text x="${(w/2).toFixed(2)}" y="10" text-anchor="middle" fill="blue">${w.toFixed(1)} mm</text>`;
  svg += `<text x="${(w-3).toFixed(2)}" y="${(boxH/2).toFixed(2)}" text-anchor="middle" dominant-baseline="middle" fill="blue" transform="rotate(-90 ${(w-3).toFixed(2)} ${(boxH/2).toFixed(2)})">${boxH.toFixed(1)} mm</text>`;
  svg += `</svg>`;
  $("stosPreview").innerHTML = svg;
  $("stosMeta").textContent = `Diameter: ${d} mm, Höjd kortaste: ${h} mm, Taklutning: ${slope}°`;
  $("stosResult").style.display = "block";
  hookExport("stosPreview", "stosSvg", "stosPdf", "stosPrint");
}

// Stos form submit
const stosForm = $("stosForm");
if (stosForm) {
  stosForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const d = parseFloat($("stosDiameter").value);
    const h = parseFloat($("stosHeight").value);
    const slope = parseFloat($("stosSlope").value);
    if (isNaN(d) || isNaN(h) || isNaN(slope)) return;
    renderStos(d, h, slope);
  });
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

    // bounding box
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x, y] of inner.concat(outer)) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
    const margin = 10;
    const dx = -minX + margin;
    const dy = -minY + margin;
    const w = (maxX - minX) + 2 * margin;
    const h = (maxY - minY) + 2 * margin;

    const fmtPt = (x, y) => `${(x + dx).toFixed(2)},${(y + dy).toFixed(2)}`;
    const polyOuter = outer.map(([x, y]) => fmtPt(x, y)).join(" ");
    const polyInner = inner.map(([x, y]) => fmtPt(x, y)).join(" ");

    // Build SVG
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w.toFixed(2)}mm" height="${h.toFixed(2)}mm" viewBox="0 0 ${w.toFixed(2)} ${h.toFixed(2)}" shape-rendering="geometricPrecision" font-size="4">`;
    svg += `<polyline points="${polyOuter}" fill="none" stroke="black" stroke-width="0.35"/>`;
    svg += `<polyline points="${polyInner}" fill="none" stroke="black" stroke-width="0.35"/>`;
    // generator lines + segment labels
    function mid(ax,ay,bx,by){ return [(ax+bx)/2,(ay+by)/2]; }
    function interp(ax,ay,bx,by,t){ return [ax + (bx-ax)*t, ay + (by-ay)*t]; }

    for (let i = 0; i < inner.length; i++) {
      const xi = inner[i][0] + dx, yi = inner[i][1] + dy;
      const xo = outer[i][0] + dx, yo = outer[i][1] + dy;
      svg += `<line x1="${xi.toFixed(2)}" y1="${yi.toFixed(2)}" x2="${xo.toFixed(2)}" y2="${yo.toFixed(2)}" stroke="black" stroke-width="0.35"/>`;
    }
    for (let i = 0; i < inner.length - 1; i++) {
      const xi1 = inner[i][0] + dx, yi1 = inner[i][1] + dy;
      const xi2 = inner[i+1][0] + dx, yi2 = inner[i+1][1] + dy;
      const xo1 = outer[i][0] + dx, yo1 = outer[i][1] + dy;
      const xo2 = outer[i+1][0] + dx, yo2 = outer[i+1][1] + dy;
      const li = Math.hypot(xi2 - xi1, yi2 - yi1);
      const lo = Math.hypot(xo2 - xo1, yo2 - yo1);
      const [mix, miy] = mid(xi1, yi1, xi2, yi2);
      const [mox, moy] = mid(xo1, yo1, xo2, yo2);
      const [pinx, piny] = interp(mix, miy, mox, moy, 0.35);
      const [poutx, pouty] = interp(mix, miy, mox, moy, 0.65);
      svg += `<text x="${pinx.toFixed(2)}" y="${piny.toFixed(2)}" fill="blue" text-anchor="middle" dominant-baseline="middle">${li.toFixed(1)}</text>`;
      svg += `<text x="${poutx.toFixed(2)}" y="${pouty.toFixed(2)}" fill="red" text-anchor="middle" dominant-baseline="middle">${lo.toFixed(1)}</text>`;
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
})(

// Tab switching
document.addEventListener("DOMContentLoaded", () => {
  const btns = document.querySelectorAll(".tab-btn");
  const tabs = document.querySelectorAll(".tab");
  btns.forEach((btn) => {
    btn.addEventListener("click", () => {
      btns.forEach((b) => b.classList.remove("active"));
      tabs.forEach((t) => t.classList.remove("active"));
      btn.classList.add("active");
      const targetId = "tab-" + btn.dataset.tab;
      const target = document.getElementById(targetId);
      if (target) target.classList.add("active");
    });
  });
});

})();
