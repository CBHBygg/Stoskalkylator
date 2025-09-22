(function () {
  "use strict";

  // ====================== Utilities ======================
  const mmToPt = (mm) => (mm * 72) / 25.4;
  const A4 = { wMm: 210, hMm: 297, marginMm: 5 };
  const $ = (id) => document.getElementById(id);

  function ready(fn) {
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }

  // ====================== Library detection ======================
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

  // ====================== Exporters ======================
  function exportSVG(previewId, filename) {
    try {
      const svg = document.querySelector(`#${previewId} svg`);
      if (!svg) { alert("Ingen SVG att exportera."); return; }
      const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename.endsWith(".svg") ? filename : filename + ".svg";
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (err) { console.error("exportSVG error:", err); }
  }

  async function exportMultiPagePDF(previewId, filenameBase) {
    try {
      const { jsPDF, svg2pdf } = getLibs();
      const svg = document.querySelector(`#${previewId} svg`);
      if (!svg) { alert("Ingen SVG att exportera."); return; }

      const widthMm = parseFloat(svg.getAttribute("width")?.replace("mm", "")) || A4.wMm;
      const heightMm = parseFloat(svg.getAttribute("height")?.replace("mm", "")) || A4.hMm;

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
          g.appendChild(body);

          clone.innerHTML = "";
          clone.appendChild(defs);
          clone.appendChild(g);
          clone.setAttribute("width", pageW + "mm");
          clone.setAttribute("height", pageH + "mm");
          clone.setAttribute("viewBox", `0 0 ${pageW} ${pageH}`);

          await svg2pdf(clone, pdf, {
            x: marginPt, y: marginPt,
            width: pageWpt - 2 * marginPt,
            height: pageHpt - 2 * marginPt,
            useCSS: true,
          });
        }
      }
      pdf.save((filenameBase || "pattern") + ".pdf");
    } catch (err) { console.error("exportMultiPagePDF error:", err); }
  }

  function printSVG(previewId) {
    try {
      const svg = document.querySelector(`#${previewId} svg`);
      if (!svg) { alert("Ingen SVG att skriva ut."); return; }
      const win = window.open("", "_blank");
      win.document.write(`<!doctype html><title>Skriv ut</title><style>html,body{margin:0;padding:0} svg{width:210mm;height:auto}</style>`);
      win.document.body.appendChild(svg.cloneNode(true));
      win.document.close(); win.focus(); win.print();
    } catch (err) { console.error("printSVG error:", err); }
  }

  function hookExport(previewId, svgBtnId, pdfBtnId, printBtnId, baseName) {
    $(svgBtnId).onclick = () => exportSVG(previewId, baseName + ".svg");
    $(pdfBtnId).onclick = () => exportMultiPagePDF(previewId, baseName);
    $(printBtnId).onclick = () => printSVG(previewId);
  }

  // ====================== STOS (unchanged) ======================
  function initStos() {
    const form = $("stosForm");
    if (!form) return;
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      try {
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
      } catch (err) {
        console.error("STOS error:", err);
        $("stosPreview").innerHTML = "<p style='color:red'>Kunde inte generera Stos-mönster.</p>";
      }
    });
  }

  // ====================== KONA (general oblique cut, half-pattern) ======================
  function initKona() {
    const form = $("konaForm");
    if (!form) return;

    let currentRot = 0;

    $("konaRotSlider")?.addEventListener("input", (e) => {
      currentRot = parseInt(e.target.value, 10) || 0;
      $("konaRotInput").value = currentRot;
      safeRerender();
    });
    $("konaRotInput")?.addEventListener("input", (e) => {
      currentRot = parseInt(e.target.value, 10) || 0;
      $("konaRotSlider").value = currentRot;
      safeRerender();
    });

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      safeRerender(true);
    });

    function safeRerender(autoRotate=false) {
      try {
        const topD = parseFloat($("konaTop").value);
        const botD = parseFloat($("konaBottom").value);
        let planeDeg = parseFloat($("konaSlope").value);
        if ([topD, botD, planeDeg].some((v) => isNaN(v) || v <= 0)) return;

        // clamp planeDeg to (0, 89.9] to avoid vertical plane singularity
        if (planeDeg <= 0) planeDeg = 0.0001;
        if (planeDeg >= 89.9) planeDeg = 89.9;

        if (autoRotate) {
          currentRot = findBestRotation(topD, botD, planeDeg);
          $("konaRotSlider").value = currentRot;
          $("konaRotInput").value = currentRot;
        }
        renderKona(topD, botD, planeDeg, currentRot);
      } catch (err) {
        console.error("Kona rerender error:", err);
        $("konaPreview").innerHTML = "<p style='color:red'>Kunde inte generera Kona-mönster.</p>";
        $("konaResult").style.display = "block";
      }
    }
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
      } catch {}
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

  // ---- Core geometry (any oblique plane angle; half-pattern) ----
  // Angle is plane tilt relative to horizontal. H = 30 mm above high side.
  function solveK(Rt, Rb, H, m) {
    if (Math.abs(m) < 1e-8) {
      // horizontal plane special case
      const k = (Rb - Rt) / H;
      return Math.max(1e-6, Math.min(k, 0.95));
    }
    // f(k) = Rb*(1 - m k)/(1 + m k) - H k - Rt
    const f = (k) => (Rb * (1 - m * k)) / (1 + m * k) - H * k - Rt;

    const kMax = Math.min(0.99 / Math.abs(m), 0.99); // avoid singularity mk->1
    let lo = 1e-6, hi = kMax;

    // ensure sign change; if not, fall back to Newton
    let flo = f(lo), fhi = f(hi);
    if (isFinite(flo) && isFinite(fhi) && flo * fhi < 0) {
      for (let i = 0; i < 80; i++) {
        const mid = 0.5 * (lo + hi);
        const fm = f(mid);
        if (!isFinite(fm) || Math.abs(hi - lo) < 1e-10) return mid;
        if (flo * fm <= 0) { hi = mid; fhi = fm; } else { lo = mid; flo = fm; }
      }
      return 0.5 * (lo + hi);
    }

    // Newton fallback
    let k = Math.min(0.1, kMax * 0.5);
    for (let i = 0; i < 80; i++) {
      const h = 1e-6;
      const fk = f(k);
      const df = (f(k + h) - f(k - h)) / (2 * h);
      const step = fk / (Math.abs(df) > 1e-12 ? df : 1e-12);
      k -= step;
      if (!isFinite(k) || k <= 1e-6) k = 1e-4;
      if (k >= kMax) k = kMax * 0.999;
      if (Math.abs(step) < 1e-10) break;
    }
    return k;
  }

  function generateKonaPoints(topD, botD, planeDeg, rotDeg) {
    const Rt = topD / 2;
    const Rb = botD / 2;
    const H = 30;           // top plane 30 mm above high side
    const N = 6;            // half-pattern segments
    const m = Math.tan((planeDeg * Math.PI) / 180); // plane tilt relative to horizontal
    const k = solveK(Rt, Rb, H, m);                 // cone half-angle slope

    const alpha = Math.atan(k);
    const sinA = Math.sin(alpha);

    // plane constant from low-side radius: r(0)=Rb => y0 = Rb(1 - m k)/k
    const y0 = (Rb * (1 - m * k)) / Math.max(k, 1e-9);

    // radii around azimuth for half circumference φ∈[0,π]
    const phi = [...Array(N)].map((_, i) => (Math.PI * i) / N);
    const r_bottom = phi.map((p) => {
      const den = 1 - m * k * Math.cos(p);
      const safeDen = Math.abs(den) < 1e-8 ? (den >= 0 ? 1e-8 : -1e-8) : den;
      return (k * y0) / safeDen;
    });

    const s_top = Rt / Math.max(sinA, 1e-9);
    const s_bottom = r_bottom.map((r) => r / Math.max(sinA, 1e-9));

    // development polar angles a = φ sinα
    const a = phi.map((p) => p * sinA);

    // polar -> cartesian
    const inner = a.map((ang) => [s_top * Math.cos(ang), s_top * Math.sin(ang)]);
    const outer = a.map((ang, i) => [s_bottom[i] * Math.cos(ang), s_bottom[i] * Math.sin(ang)]);

    // rotate
    const ang = (rotDeg * Math.PI) / 180;
    const rot2d = ([x, y]) => [x * Math.cos(ang) - y * Math.sin(ang), x * Math.sin(ang) + y * Math.cos(ang)];
    const innerR = inner.map(rot2d);
    const outerR = outer.map(rot2d);

    // generators
    const gens = innerR.map((p, i) => [p, outerR[i]]);

    return { inner: innerR, outer: outerR, gens };
  }

  function renderKona(topD, botD, planeDeg, rot) {
    const container = $("konaPreview");
    const meta = $("konaMeta");
    const result = $("konaResult");
    if (!container) return;

    try {
      const pts = generateKonaPoints(topD, botD, planeDeg, rot);
      const gens = pts.gens;

      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      pts.inner.concat(pts.outer).concat(gens.flat()).forEach(([x, y]) => {
        if (x < minX) minX = x; if (y < minY) minY = y;
        if (x > maxX) maxX = x; if (y > maxY) maxY = y;
      });
      const pad = 10;
      minX -= pad; minY -= pad; maxX += pad; maxY += pad;
      const width = maxX - minX, height = maxY - minY;

      const pl = (arr) => arr.map(([x, y]) => `${(x - minX).toFixed(2)},${(y - minY).toFixed(2)}`).join(" ");

      let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}mm" height="${height}mm" viewBox="0 0 ${width} ${height}" shape-rendering="geometricPrecision">`;
      svg += `<g fill="none" stroke="black" stroke-width="0.4">`;
      svg += `<polyline points="${pl(pts.inner)}"/>`;
      svg += `<polyline points="${pl(pts.outer)}"/>`;
      gens.forEach((seg) => {
        svg += `<line x1="${(seg[0][0]-minX).toFixed(2)}" y1="${(seg[0][1]-minY).toFixed(2)}" x2="${(seg[1][0]-minX).toFixed(2)}" y2="${(seg[1][1]-minY).toFixed(2)}"/>`;
      });
      // connect ends (seam) for clarity
      svg += `<line x1="${(pts.inner[0][0]-minX).toFixed(2)}" y1="${(pts.inner[0][1]-minY).toFixed(2)}" x2="${(pts.outer[0][0]-minX).toFixed(2)}" y2="${(pts.outer[0][1]-minY).toFixed(2)}"/>`;
      svg += `<line x1="${(pts.inner[pts.inner.length-1][0]-minX).toFixed(2)}" y1="${(pts.inner[pts.inner.length-1][1]-minY).toFixed(2)}" x2="${(pts.outer[pts.outer.length-1][0]-minX).toFixed(2)}" y2="${(pts.outer[pts.outer.length-1][1]-minY).toFixed(2)}"/>`;
      svg += `</g></svg>`;

      container.innerHTML = svg;
      if (meta) meta.textContent = `Rotation: ${rot}°`;
      if (result) result.style.display = "block";
      hookExport("konaPreview", "konaSvg", "konaPdf", "konaPrint", "kona_halvmonster");
    } catch (err) {
      console.error("renderKona error:", err);
      container.innerHTML = "<p style='color:red'>Kunde inte generera Kona-mönster.</p>";
      if (result) result.style.display = "block";
    }
  }

  // ====================== Init (tabs must always wire up) ======================
  ready(() => {
    try {
      initStos();
      initKona();
    } catch (err) {
      console.error("Init error:", err);
    }
  });
})();
