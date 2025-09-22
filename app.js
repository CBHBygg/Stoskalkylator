
(function () {
  "use strict";

  // ---------------- Utils ----------------
  const mmToPt = (mm) => (mm * 72) / 25.4;
  const A4 = { wMm: 210, hMm: 297, marginMm: 5 };
  const $ = (id) => document.getElementById(id);

  // ---------------- Library detection ----------------
  function getLibs() {
    const jsPDF = window.jspdf?.jsPDF || window.jsPDF;
    let svg2pdf = window.svg2pdf || window.SVG2PDF;
    if (svg2pdf && typeof svg2pdf !== "function") {
      if (typeof svg2pdf.default === "function") {
        svg2pdf = svg2pdf.default;
      } else if (typeof svg2pdf.svg2pdf === "function") {
        svg2pdf = svg2pdf.svg2pdf;
      } else {
        console.warn("svg2pdf global is not a function:", svg2pdf);
        svg2pdf = null;
      }
    }
    if (!jsPDF || !svg2pdf) {
      alert("PDF-export misslyckades: jsPDF/svg2pdf inte hittad.");
      throw new Error("Libraries not found");
    }
    return { jsPDF, svg2pdf };
  }

  // ---------------- Exporters ----------------
  function exportSVG(previewId, filename) {
    const svg = document.querySelector(`#${previewId} svg`);
    if (!svg) { alert("Ingen SVG att exportera."); return; }
    const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename.endsWith(".svg") ? filename : filename + ".svg";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function exportMultiPagePDF(previewId, filenameBase) {
    const { jsPDF, svg2pdf } = getLibs();
    const svg = document.querySelector(`#${previewId} svg`);
    if (!svg) { alert("Ingen SVG att exportera."); return; }

    const widthMm = parseFloat(svg.getAttribute("width").replace("mm", ""));
    const heightMm = parseFloat(svg.getAttribute("height").replace("mm", ""));

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
        const xMm = c * pageW, yMm = r * pageH;
        const clone = svg.cloneNode(true);
        const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
        g.setAttribute("transform", `translate(${-xMm},${-yMm})`);
        const clipId = `clip_${r}_${c}`;
        const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
        const clipPath = document.createElementNS("http://www.w3.org/2000/svg", "clipPath");
        clipPath.setAttribute("id", clipId);
        const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        rect.setAttribute("x", xMm); rect.setAttribute("y", yMm);
        rect.setAttribute("width", pageW); rect.setAttribute("height", pageH);
        clipPath.appendChild(rect); defs.appendChild(clipPath);
        const originalBody = svg.querySelector("g") || svg;
        const body = originalBody.cloneNode(true);
        body.setAttribute("clip-path", `url(#${clipId})`);
        g.appendChild(body); clone.innerHTML = ""; clone.appendChild(defs); clone.appendChild(g);
        clone.setAttribute("width", pageW + "mm"); clone.setAttribute("height", pageH + "mm");
        clone.setAttribute("viewBox", `0 0 ${pageW} ${pageH}`);
        await svg2pdf(clone, pdf, {
          x: marginPt, y: marginPt,
          width: pageWpt - 2 * marginPt, height: pageHpt - 2 * marginPt,
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

  function hookExport(previewId, svgBtnId, pdfBtnId, printBtnId, baseName) {
    $(svgBtnId).onclick = () => exportSVG(previewId, baseName + ".svg");
    $(pdfBtnId).onclick = () => exportMultiPagePDF(previewId, baseName);
    $(printBtnId).onclick = () => printSVG(previewId);
  }

  // ---------------- STOS (unchanged) ----------------
  $("stosForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const D = parseFloat($("stosDiameter").value);
    const Hmin = parseFloat($("stosHeight").value);
    const slopeDeg = parseFloat($("stosSlope").value);
    if (isNaN(D) || isNaN(Hmin) || isNaN(slopeDeg)) return;
    const R = D/2, alpha = slopeDeg*Math.PI/180;
    const L = Math.PI*D/2, A = R*Math.tan(alpha), Hs = 2*A;
    const N=400, pts=[];
    for(let i=0;i<=N;i++){ const t=Math.PI*i/N; const x=L*t/Math.PI; const y=A*(1+Math.cos(t)); pts.push([x,y]); }
    const poly=pts.map(([x,y])=>`${x.toFixed(2)},${(Hs-y).toFixed(2)}`).join(' ');
    let svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${L}mm" height="${Hs}mm" viewBox="0 0 ${L} ${Hs}" shape-rendering="geometricPrecision">`;
    svg+=`<rect x="0" y="0" width="${L}" height="${Hs}" fill="none" stroke="black" stroke-width="0.4"/>`;
    svg+=`<polyline points="${poly}" fill="none" stroke="black" stroke-width="0.4"/>`;
    svg+=`</svg>`;
    $("stosPreview").innerHTML=svg;
    $("stosMeta").textContent=`Bredd = ${L.toFixed(1)} mm · Skärningshöjd = ${Hs.toFixed(1)} mm · H(min) = ${Hmin.toFixed(1)} mm`;
    $("stosResult").style.display='block';
    hookExport("stosPreview","stosSvg","stosPdf","stosPrint","stos_halvmonster");
  });

  // ---------------- KONA (fixed) ----------------
  let currentRot = 0;

  $("konaForm").addEventListener("submit", (e) => {
    e.preventDefault();
    try {
      const topD = parseFloat($("konaTop").value);
      const botD = parseFloat($("konaBottom").value);
      const planeDeg = parseFloat($("konaSlope").value);
      if (isNaN(topD) || isNaN(botD) || isNaN(planeDeg)) return;
      const best = findBestRotation(topD, botD, planeDeg);
      currentRot = best;
      $("konaRotSlider").value = currentRot;
      $("konaRotInput").value = currentRot;
      renderKona(topD, botD, planeDeg, currentRot);
    } catch(err){ console.error("Kona error:", err); }
  });

  $("konaRotSlider").addEventListener("input", (e) => {
    currentRot = parseInt(e.target.value, 10);
    $("konaRotInput").value = currentRot;
    rerenderIfInputs();
  });
  $("konaRotInput").addEventListener("input", (e) => {
    currentRot = parseInt(e.target.value, 10);
    $("konaRotSlider").value = currentRot;
    rerenderIfInputs();
  });

  function rerenderIfInputs() {
    try {
      const t = parseFloat($("konaTop").value);
      const b = parseFloat($("konaBottom").value);
      const s = parseFloat($("konaSlope").value);
      if (!isNaN(t) && !isNaN(b) && !isNaN(s)) renderKona(t, b, s, currentRot);
    } catch(err){ console.error("Kona rerender error:", err); }
  }

  function findBestRotation(topD, botD, planeDeg) {
    let bestAngle = 0, bestScore = -Infinity;
    for (let ang = 0; ang < 180; ang += 5) {
      try {
        const box = computeKonaBBox(topD, botD, planeDeg, ang);
        const m = 10;
        const fitP = Math.min((A4.wMm - 2 * m) / box.w, (A4.hMm - 2 * m) / box.h);
        const fitL = Math.min((A4.hMm - 2 * m) / box.w, (A4.wMm - 2 * m) / box.h);
        const score = Math.max(fitP, fitL);
        if (score > bestScore) { bestScore = score; bestAngle = ang; }
      } catch{}
    }
    return bestAngle;
  }

  function computeKonaBBox(topD, botD, planeDeg, rot) {
    const pts = generateKonaPoints(topD, botD, planeDeg, rot);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    pts.inner.concat(pts.outer).concat(pts.gens.flat()).forEach(([x, y]) => {
      if (x < minX) minX = x; if (y < minY) minY = y;
      if (x > maxX) maxX = x; if (y > maxY) maxY = y;
    });
    return { w: maxX - minX, h: maxY - minY };
  }

  function solveK(Rt, Rb, H, m) {
    const f = (k) => (Rb * (1 - m * k)) / (1 + m * k) - H * k - Rt;
    const kMax = (m > 0 ? Math.min(0.95 / m, 0.95) : 0.95);
    let k = Math.min(0.1, kMax * 0.5);
    for (let i = 0; i < 80; i++) {
      const h = 1e-6;
      const fk = f(k);
      const df = (f(k + h) - f(k - h)) / (2 * h);
      const step = fk / (Math.abs(df) > 1e-12 ? df : 1e-12);
      k -= step;
      if (!isFinite(k) || k <= 1e-6) k = 1e-3;
      if (k >= kMax) k = kMax;
      if (Math.abs(step) < 1e-10) break;
    }
    return k;
  }

  function generateKonaPoints(topD, botD, planeDeg, rotDeg) {
    const Rt = topD / 2;
    const Rb = botD / 2;
    const H = 30;
    const N = 6; // half-pattern

    const m = Math.tan((planeDeg * Math.PI) / 180);
    const k = solveK(Rt, Rb, H, m);
    const alpha = Math.atan(k);
    const sinA = Math.sin(alpha);
    const y0 = (Rb * (1 - m * k)) / k;
    const phi = [...Array(N)].map((_, i) => (Math.PI * i) / N);
    const r_bottom = phi.map((p) => {
      const den = (1 - m * k * Math.cos(p));
      return (k * y0) / (Math.abs(den) < 1e-9 ? (den >= 0 ? 1e-9 : -1e-9) : den);
    });
    const s_top = Rt / sinA;
    const s_bottom = r_bottom.map((r) => r / sinA);
    const a = phi.map((p) => p * sinA);
    const inner = a.map((ang) => [s_top * Math.cos(ang), s_top * Math.sin(ang)]);
    const outer = a.map((ang, i) => [s_bottom[i] * Math.cos(ang), s_bottom[i] * Math.sin(ang)]);
    const ang = (rotDeg * Math.PI) / 180;
    const rot2d = ([x, y]) => [x * Math.cos(ang) - y * Math.sin(ang), x * Math.sin(ang) + y * Math.cos(ang)];
    const innerR = inner.map(rot2d);
    const outerR = outer.map(rot2d);
    const gens = innerR.map((p, i) => [p, outerR[i]]);
    return { inner: innerR, outer: outerR, gens };
  }

  function renderKona(topD, botD, planeDeg, rot) {
    try {
      const pts = generateKonaPoints(topD, botD, planeDeg, rot);
      const gens = pts.gens;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      pts.inner.concat(pts.outer).concat(gens.flat()).forEach(([x, y]) => {
        if (x < minX) minX = x; if (y < minY) minY = y;
        if (x > maxX) maxX = x; if (y > maxY) maxY = y;
      });
      const m = 10; minX -= m; minY -= m; maxX += m; maxY += m;
      const width = maxX - minX, height = maxY - minY;
      const pl = (arr) => arr.map(([x, y]) => `${(x - minX).toFixed(2)},${(y - minY).toFixed(2)}`).join(" ");
      let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}mm" height="${height}mm" viewBox="0 0 ${width} ${height}" shape-rendering="geometricPrecision">`;
      svg += `<g fill="none" stroke="black" stroke-width="0.4">`;
      svg += `<polyline points="${pl(pts.inner)}"/>`;
      svg += `<polyline points="${pl(pts.outer)}"/>`;
      gens.forEach((seg) => {
        svg += `<line x1="${(seg[0][0]-minX).toFixed(2)}" y1="${(seg[0][1]-minY).toFixed(2)}" x2="${(seg[1][0]-minX).toFixed(2)}" y2="${(seg[1][1]-minY).toFixed(2)}"/>`;
      });
      svg += `</g></svg>`;
      $("konaPreview").innerHTML = svg;
      $("konaMeta").textContent = `Rotation: ${rot}°`;
      $("konaResult").style.display = "block";
      hookExport("konaPreview", "konaSvg", "konaPdf", "konaPrint", "kona_halvmonster");
    } catch(err) {
      console.error("RenderKona error:", err);
      $("konaPreview").innerHTML = "<p style='color:red'>Kunde inte generera Kona-mönster.</p>";
    }
  }
})();
