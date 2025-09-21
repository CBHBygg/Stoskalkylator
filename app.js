
(function () {
  "use strict";

  // ---------------- Utils ----------------
  const A4 = { wMm: 210, hMm: 297, marginMm: 5 };
  const $ = (id) => document.getElementById(id);
  const clamp = (n, a, b) => Math.min(Math.max(n, a), b);
  const deg2rad = (d) => (Math.PI / 180) * d;

  // ---------------- Tabs ----------------
  function setupTabs() {
    const buttons = document.querySelectorAll(".tab-btn");
    const tabs = document.querySelectorAll(".tab");
    buttons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const tgt = btn.getAttribute("data-tab");
        buttons.forEach((b) => b.classList.toggle("active", b === btn));
        tabs.forEach((t) => t.classList.toggle("active", t.id === `tab-${tgt}`));
      });
    });
  }

  // ---------------- Library detection for PDF export ----------------
  function getLibs() {
    const jsPDF = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
    let svg2pdf = window.svg2pdf || window.SVG2PDF;
    if (svg2pdf && typeof svg2pdf !== "function") {
      if (typeof svg2pdf.default === "function") svg2pdf = svg2pdf.default;
      else if (typeof svg2pdf.svg2pdf === "function") svg2pdf = svg2pdf.svg2pdf;
      else svg2pdf = null;
    }
    return { jsPDF, svg2pdf };
  }

  // ---------------- SVG helpers ----------------
  function clearNode(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function svgEl(name, attrs = {}, children = []) {
    const el = document.createElementNS("http://www.w3.org/2000/svg", name);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
    children.forEach((c) => el.appendChild(c));
    return el;
  }
  function ensurePreview(containerId) {
    const wrap = $(containerId);
    if (!wrap) return null;
    let svg = wrap.querySelector("svg");
    if (!svg) {
      svg = svgEl("svg", { width: "210mm", height: "297mm", viewBox: "0 0 210 297" });
      wrap.appendChild(svg);
    } else {
      clearNode(svg);
    }
    return svg;
  }

  // ---------------- Export & Print ----------------
  function exportSVG(previewId, filenameBase) {
    const svg = document.querySelector(`#${previewId} svg`);
    if (!svg) { alert("Ingen SVG att exportera."); return; }
    const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filenameBase.endsWith(".svg") ? filenameBase : filenameBase + ".svg";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function exportMultiPagePDF(previewId, filenameBase) {
    const svg = document.querySelector(`#${previewId} svg`);
    if (!svg) { alert("Ingen SVG att exportera."); return; }
    const { jsPDF, svg2pdf } = getLibs();
    if (!jsPDF || !svg2pdf) { alert("PDF-export misslyckades: jsPDF/svg2pdf inte hittad."); return; }

    const widthMm = parseFloat(svg.getAttribute("width").replace("mm", ""));
    const heightMm = parseFloat(svg.getAttribute("height").replace("mm", ""));

    const pageW = A4.wMm - 2 * A4.marginMm;
    const pageH = A4.hMm - 2 * A4.marginMm;
    const cols = Math.ceil(widthMm / pageW);
    const rows = Math.ceil(heightMm / pageH);

    const orientation = pageW >= pageH ? "landscape" : "portrait";
    const pdf = new jsPDF({ unit: "mm", format: "a4", orientation });

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

  function printSVG(previewId) {
    const svg = document.querySelector(`#${previewId} svg`);
    if (!svg) { alert("Ingen SVG att skriva ut."); return; }
    const win = window.open("", "_blank");
    win.document.write(`<!doctype html><title>Skriv ut</title><style>html,body{margin:0;padding:0} svg{width:210mm;height:auto}</style>`);
    win.document.body.appendChild(svg.cloneNode(true));
    win.document.close(); win.focus(); win.print();
  }

  // ---------------- Geometry: oblique-truncated cone (half pattern) ----------------
  // Uses: Top diameter (inner arc), Bottom diameter (max at front), Cut angle (roof pitch),
  // and fixed Hmin (minimum slant height at the back) = 30 mm.
  function computeKonaHalf(topD, bottomD, slopeDeg, opts = {}) {
    const N = opts.samples || 360;
    const Hmin = ("Hmin" in opts) ? opts.Hmin : 30;

    const R_top = topD / 2;
    const R_max = bottomD / 2;
    const alpha = deg2rad(slopeDeg);

    // Solve for semi-vertical angle psi with bisection:
    // (s_top + Hmin)*(cosψ + tanα sinψ) = R_max*(cotψ - tanα)
    function f(psi) {
      const s_top = R_top / Math.sin(psi);
      const left = (s_top + Hmin) * (Math.cos(psi) + Math.tan(alpha) * Math.sin(psi));
      const right = R_max * (1 / Math.tan(psi) - Math.tan(alpha));
      return left - right;
    }
    let lo = 1e-6, hi = deg2rad(89.0);
    for (let i = 0; i < 120; i++) {
      const mid = 0.5 * (lo + hi);
      const fm = f(mid);
      if (Math.abs(fm) < 1e-12) { lo = hi = mid; break; }
      const flo = f(lo);
      if (flo * fm <= 0) hi = mid; else lo = mid;
    }
    const psi = 0.5 * (lo + hi);
    const s_top = R_top / Math.sin(psi);
    const c = (s_top + Hmin) * (Math.cos(psi) + Math.tan(alpha) * Math.sin(psi));

    function s_out(phi) {
      const D = Math.cos(psi) - Math.tan(alpha) * Math.sin(psi) * Math.cos(phi);
      return c / D;
    }

    // Unwrap mapping preserving inner circumference:
    const unwrap = R_top / s_top; // equals sin(psi)
    const phiHalf = new Float64Array(N);
    const thetaHalf = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      phiHalf[i] = (Math.PI * i) / (N - 1);
      thetaHalf[i] = unwrap * phiHalf[i];
    }

    // Build Cartesian coordinates for half outline
    const inner = new Array(N);
    const outer = new Array(N);
    for (let i = 0; i < N; i++) {
      const th = thetaHalf[i];
      const rIn = s_top;
      const rOut = s_out(phiHalf[i]);
      inner[i] = [rIn * Math.cos(th), rIn * Math.sin(th)];
      outer[i] = [rOut * Math.cos(th), rOut * Math.sin(th)];
    }

    return { inner, outer, psi, s_top, unwrap };
  }

  function rotatePoints(points, rotDeg) {
    if (!rotDeg) return points.map(p => [p[0], p[1]]);
    const th = deg2rad(rotDeg);
    const c = Math.cos(th), s = Math.sin(th);
    return points.map(([x, y]) => [c * x - s * y, s * x + c * y]);
  }

  function bboxOf(points) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x, y] of points) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
    return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
  }

  // ---------------- Rendering (Kona) ----------------
  function renderKona(previewId, topD, bottomD, slopeDeg, rotDeg, opts = {}) {
    const svg = ensurePreview(previewId);
    if (!svg) return;

    // Compute geometry
    const { inner, outer } = computeKonaHalf(topD, bottomD, slopeDeg, { Hmin: 30, samples: 361 });
    const innerR = rotatePoints(inner, rotDeg || 0);
    const outerR = rotatePoints(outer, rotDeg || 0);

    // Layout: shift to positive coords with margin
    const allPts = innerR.concat(outerR);
    const bb = bboxOf(allPts);
    const margin = 10; // mm
    const offX = -bb.minX + margin;
    const offY = -bb.minY + margin;
    const W = bb.w + 2 * margin;
    const H = bb.h + 2 * margin;

    svg.setAttribute("width", `${W.toFixed(2)}mm`);
    svg.setAttribute("height", `${H.toFixed(2)}mm`);
    svg.setAttribute("viewBox", `0 0 ${W.toFixed(2)} ${H.toFixed(2)}`);

    // Styles
    const style = svgEl("style", {}, [
      document.createTextNode(`
        .edge { fill: none; stroke: #000; stroke-width: 0.35; }
        .seam { stroke: #E53935; stroke-width: 0.8; }
        .gen { stroke: #666; stroke-width: 0.3; stroke-dasharray: 2 2; }
        .label { font: 3.5px sans-serif; fill: #000; }
        .scale { font: 3.5px sans-serif; fill: #000; }
      `)
    ]);
    svg.appendChild(style);

    const layer = svgEl("g");
    svg.appendChild(layer);

    const moveTo = (p) => `M ${(p[0] + offX).toFixed(3)} ${(p[1] + offY).toFixed(3)}`;
    const lineTo = (p) => `L ${(p[0] + offX).toFixed(3)} ${(p[1] + offY).toFixed(3)}`;

    // Outline
    const d = [];
    d.push(moveTo(innerR[0]));
    for (let i = 1; i < innerR.length; i++) d.push(lineTo(innerR[i]));
    d.push(lineTo(outerR[outerR.length - 1]));
    for (let i = outerR.length - 2; i >= 0; i--) d.push(lineTo(outerR[i]));
    d.push("Z");
    layer.appendChild(svgEl("path", { d: d.join(" "), class: "edge" }));

    // Generators: 12 divisions across half
    const Ngen = 12;
    for (let i = 0; i <= Ngen; i++) {
      const idx = Math.round((i / Ngen) * (innerR.length - 1));
      const a = innerR[idx], b = outerR[idx];
      layer.appendChild(svgEl("line", {
        x1: (a[0] + offX).toFixed(3), y1: (a[1] + offY).toFixed(3),
        x2: (b[0] + offX).toFixed(3), y2: (b[1] + offY).toFixed(3),
        class: "gen"
      }));
      const mx = (a[0] + b[0]) / 2 + offX;
      const my = (a[1] + b[1]) / 2 + offY;
      const t = svgEl("text", { x: mx.toFixed(3), y: (my - 1.0).toFixed(3), class: "label" });
      t.textContent = String(i + 1);
      layer.appendChild(t);
    }

    // Seams A/A' and B/B'
    const A1 = innerR[0], A2 = outerR[0];
    const B1 = innerR[innerR.length - 1], B2 = outerR[outerR.length - 1];
    layer.appendChild(svgEl("line", {
      x1: (A1[0] + offX).toFixed(3), y1: (A1[1] + offY).toFixed(3),
      x2: (A2[0] + offX).toFixed(3), y2: (A2[1] + offY).toFixed(3),
      class: "seam"
    }));
    layer.appendChild(svgEl("line", {
      x1: (B1[0] + offX).toFixed(3), y1: (B1[1] + offY).toFixed(3),
      x2: (B2[0] + offX).toFixed(3), y2: (B2[1] + offY).toFixed(3),
      class: "seam"
    }));
    const tA = svgEl("text", { x: (A1[0] + offX).toFixed(3), y: (A1[1] + offY - 2).toFixed(3), class: "label" }); tA.textContent = "A";
    const tAp = svgEl("text", { x: (A2[0] + offX).toFixed(3), y: (A2[1] + offY + 4).toFixed(3), class: "label" }); tAp.textContent = "A'";
    const tB = svgEl("text", { x: (B1[0] + offX).toFixed(3), y: (B1[1] + offY - 2).toFixed(3), class: "label" }); tB.textContent = "B";
    const tBp = svgEl("text", { x: (B2[0] + offX).toFixed(3), y: (B2[1] + offY + 4).toFixed(3), class: "label" }); tBp.textContent = "B'";
    layer.appendChild(tA); layer.appendChild(tAp); layer.appendChild(tB); layer.appendChild(tBp);

    // Scale bar (100 mm)
    const sbLen = 100;
    const sbX = margin, sbY = H - margin - 6;
    layer.appendChild(svgEl("line", {
      x1: sbX, y1: sbY, x2: sbX + sbLen, y2: sbY, stroke: "#000", "stroke-width": 0.6
    }));
    const sbText = svgEl("text", { x: sbX + sbLen / 2, y: sbY - 1.5, class: "scale", "text-anchor": "middle" });
    sbText.textContent = "100 mm";
    layer.appendChild(sbText);

    return { widthMm: W, heightMm: H };
  }

  // ---------------- STOS (simple placeholder) ----------------
  function renderStos(previewId) {
    const svg = ensurePreview(previewId);
    if (!svg) return;
    const W = 180, H = 60;
    svg.setAttribute("width", `${W}mm`);
    svg.setAttribute("height", `${H}mm`);
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    const style = svgEl("style", {}, [document.createTextNode(`.hint{font:5px sans-serif; fill:#777}`)]);
    svg.appendChild(style);
    const t = svgEl("text", { x: W/2, y: H/2, class: "hint", "text-anchor": "middle" });
    t.textContent = "Stos-mönster (behåll ert befintliga om ni vill)";
    svg.appendChild(t);
  }

  // ---------------- Wire-up (Kona) ----------------
  let lastInputs = { topD: null, bottomD: null, slope: null, rot: 0 };

  function setupKona() {
    const form = $("konaForm");
    const result = $("konaResult");
    const meta = $("konaMeta");
    const rotSlider = $("konaRotSlider");
    const rotInput = $("konaRotInput");

    function draw() {
      const topD = clamp(parseFloat($("konaTop").value), 1, 5000);
      const bottomD = clamp(parseFloat($("konaBottom").value), topD + 0.01, 5000);
      const slopeDeg = clamp(parseFloat($("konaSlope").value), 0.1, 89.9);
      const rot = lastInputs.rot || 0;

      const box = renderKona("konaPreview", topD, bottomD, slopeDeg, rot, { Hmin: 30 });
      result.style.display = "block";
      meta.textContent = `Topp Ø: ${topD.toFixed(1)} mm · Botten (max) Ø: ${bottomD.toFixed(1)} mm · Vinkel: ${slopeDeg.toFixed(1)}° · Hmin: 30 mm · Mönsterstorlek: ${box.widthMm.toFixed(1)} × ${box.heightMm.toFixed(1)} mm`;
      lastInputs = { topD, bottomD, slope: slopeDeg, rot };
    }

    if (form) form.addEventListener("submit", (e) => { e.preventDefault(); draw(); });

    if (rotSlider) rotSlider.addEventListener("input", (e) => {
      lastInputs.rot = parseInt(e.target.value || "0", 10);
      if (lastInputs.topD) renderKona("konaPreview", lastInputs.topD, lastInputs.bottomD, lastInputs.slope, lastInputs.rot, { Hmin: 30 });
      $("konaRotInput").value = String(lastInputs.rot);
    });
    if (rotInput) rotInput.addEventListener("input", (e) => {
      lastInputs.rot = clamp(parseInt(e.target.value || "0", 10), 0, 359);
      if (lastInputs.topD) renderKona("konaPreview", lastInputs.topD, lastInputs.bottomD, lastInputs.slope, lastInputs.rot, { Hmin: 30 });
      $("konaRotSlider").value = String(lastInputs.rot);
    });

    // Export buttons
    const btnSvg = $("konaSvg");
    const btnPdf = $("konaPdf");
    const btnPrint = $("konaPrint");
    if (btnSvg) btnSvg.addEventListener("click", () => exportSVG("konaPreview", "kona_halvmonster.svg"));
    if (btnPdf) btnPdf.addEventListener("click", () => exportMultiPagePDF("konaPreview", "kona_halvmonster"));
    if (btnPrint) btnPrint.addEventListener("click", () => printSVG("konaPreview"));
  }

  function setupStos() {
    // Hook basic UI if present
    const form = $("stosForm");
    const result = $("stosResult");
    const meta = $("stosMeta");
    if (form) form.addEventListener("submit", (e) => {
      e.preventDefault();
      renderStos("stosPreview");
      if (result) result.style.display = "block";
      if (meta) meta.textContent = "Stos: demo";
      const btnSvg = $("stosSvg");
      const btnPdf = $("stosPdf");
      const btnPrint = $("stosPrint");
      if (btnSvg) btnSvg.addEventListener("click", () => exportSVG("stosPreview", "stos.svg"));
      if (btnPdf) btnPdf.addEventListener("click", () => exportMultiPagePDF("stosPreview", "stos"));
      if (btnPrint) btnPrint.addEventListener("click", () => printSVG("stosPreview"));
    });
  }

  // ---------------- Init ----------------
  document.addEventListener("DOMContentLoaded", () => {
    setupTabs();
    setupKona();
    setupStos();
  });
})();
