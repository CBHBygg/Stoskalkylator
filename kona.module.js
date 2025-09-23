(function(){
  "use strict";

  // --------- Small helpers (scoped) ---------
  const $ = (id) => document.getElementById(id);
  const mmToPt = (mm) => (mm * 72.0) / 25.4;
  const A4 = { wMm: 210, hMm: 297, marginMm: 5 };

  function getLibs() {
    const jsPDF = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
    const svg2pdf = window.svg2pdf || window.SVG2PDF || (window.svg2pdf && window.svg2pdf.default);
    if (!jsPDF || !svg2pdf) return null;
    return { jsPDF, svg2pdf };
  }

  // --------- Triangulation (final logic) ---------
  function computeKonaTriangulation(topD, botD, angleDeg, segments = 6, extraMm = 30, rotDeg = 0) {
    const R2 = topD / 2;
    const R1 = botD / 2;
    const T = Math.tan((angleDeg * Math.PI) / 180);
    const E = extraMm;

    // Solve for vertical height H
    const B = E + T * (R1 + R2);
    const C = E * T * (R1 - R2);
    const H = 0.5 * (B + Math.sqrt(B * B + 4 * C));

    const k = (R1 - R2) / H;
    const sF = Math.hypot(1, k);
    const zApex = R1 / k;
    const Rin = (zApex - H) * sF;

    const thetas = Array.from({ length: segments + 1 }, (_, i) => (Math.PI * i) / segments);

    const zAt = (th) => {
      const c = Math.cos(th);
      return (T * R1 * (1 - c)) / (1 - T * k * c);
    };

    const pts3D = thetas.map((th) => {
      const z = zAt(th);
      const r = R1 - k * z;
      return { z, r, x: r * Math.cos(th), y: r * Math.sin(th) };
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
      const cosPhi = Math.max(-1, Math.min(1, (a*a + b*b - c*c) / (2*a*b)));
      betas.push(betas[i] + Math.acos(cosPhi));
    }

    const ang = (rotDeg * Math.PI) / 180;
    const rot = ([x, y]) => [x*Math.cos(ang) - y*Math.sin(ang), x*Math.sin(ang) + y*Math.cos(ang)];

    const outer = betas.map((b, i) => rot([Rb[i] * Math.cos(b), Rb[i] * Math.sin(b)]));
    const inner = betas.map((b) => rot([Rin * Math.cos(b), Rin * Math.sin(b)]));
    const gens  = inner.map((p, i) => [p, outer[i]]);

    return { inner, outer, gens };
  }

  // --------- Render SVG (mm sizing, 1:1) ---------
  function renderKonaSVG(topD, botD, slopeDeg, rotDeg = 0) {
    const { inner, outer, gens } = computeKonaTriangulation(topD, botD, slopeDeg, 6, 30, rotDeg);
    const all = inner.concat(outer);
    const xs = all.map((p) => p[0]);
    const ys = all.map((p) => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const w = maxX - minX, h = maxY - minY;

    const fmt = (p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`;
    const path = (pts) => `M ${pts.map(fmt).join(" L ")}`;

    const parts = [];
    parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${w.toFixed(1)}mm" height="${h.toFixed(1)}mm" viewBox="${minX.toFixed(2)} ${minY.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)}" shape-rendering="geometricPrecision">`);
    parts.push(`<path d="${path(inner)}" fill="none" stroke="black" stroke-width="0.35"/>`);
    parts.push(`<path d="${path(outer)}" fill="none" stroke="black" stroke-width="0.35"/>`);
    gens.forEach(([i, o]) => {
      parts.push(`<line x1="${i[0].toFixed(2)}" y1="${i[1].toFixed(2)}" x2="${o[0].toFixed(2)}" y2="${o[1].toFixed(2)}" stroke="black" stroke-width="0.2"/>`);
    });
    parts.push(`</svg>`);
    return parts.join("");
  }

  // --------- Attach to Kona UI ---------
  function hookKona() {
    const form = $("konaForm");
    const preview = $("konaPreview");
    const meta = $("konaMeta");
    const rotSlider = $("konaRotSlider");
    const rotInput  = $("konaRotInput");
    const btnSvg = $("konaSvg");
    const btnPdf = $("konaPdf");
    const btnPrint = $("konaPrint");

    if (!form || !preview) return;

    let rot = 0;
    const draw = () => {
      const topD = parseFloat($("konaTop")?.value);
      const botD = parseFloat($("konaBottom")?.value);
      const slope = parseFloat($("konaSlope")?.value);
      if (isNaN(topD) || isNaN(botD) || isNaN(slope)) return;
      preview.innerHTML = renderKonaSVG(topD, botD, slope, rot);
      if (meta) meta.textContent = `Topp: ${topD} mm, Botten: ${botD} mm, Taklutning: ${slope}°`;
    };

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      rot = 0;
      if (rotSlider) rotSlider.value = "0";
      if (rotInput)  rotInput.value  = "0";
      draw();
      const result = document.getElementById("konaResult");
      if (result) result.style.display = "block";
    });

    if (rotSlider) {
      rotSlider.addEventListener("input", (e) => {
        rot = parseInt(e.target.value || "0", 10) || 0;
        if (rotInput) rotInput.value = String(rot);
        draw();
      });
    }
    if (rotInput) {
      rotInput.addEventListener("input", (e) => {
        rot = parseInt(e.target.value || "0", 10) || 0;
        if (rotSlider) rotSlider.value = String(rot);
        draw();
      });
    }

    if (btnSvg) {
      btnSvg.addEventListener("click", () => {
        const svg = preview.querySelector("svg");
        if (!svg) return;
        const blob = new Blob([svg.outerHTML], { type: "image/svg+xml" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "kona.svg";
        a.click();
        URL.revokeObjectURL(url);
      });
    }

    if (btnPdf) {
      btnPdf.addEventListener("click", () => {
        const libs = getLibs();
        const svg = preview.querySelector("svg");
        if (!libs || !svg) return alert("PDF-export saknar jsPDF/svg2pdf.");
        const { jsPDF, svg2pdf } = libs;
        const doc = new jsPDF({ unit: "pt", format: "a4" });
        const margin = mmToPt(A4.marginMm);
        svg2pdf(svg, doc, {
          x: margin,
          y: margin,
          width: mmToPt(A4.wMm - 2 * A4.marginMm),
          height: mmToPt(A4.hMm - 2 * A4.marginMm),
        });
        doc.save("kona.pdf");
      });
    }

    if (btnPrint) {
      btnPrint.addEventListener("click", () => window.print());
    }
  }

  document.addEventListener("DOMContentLoaded", hookKona);
})();
