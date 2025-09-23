(function(){
  "use strict";

  const $ = (id) => document.getElementById(id);
  const A4 = { wMm: 210, hMm: 297, marginMm: 5 };

  function getLibs() {
    const { jsPDF } = window.jspdf || {};
    let s = null;
    if (typeof window.svg2pdf === "function") {
      s = window.svg2pdf;
    } else if (window.svg2pdf && typeof window.svg2pdf.svg2pdf === "function") {
      s = window.svg2pdf.svg2pdf;
    }
    return { jsPDF, svg2pdf: s };
  }

  // --- Triangulation ---
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

  // --- Helpers ---
  function midpoint(a, b) { return [(a[0]+b[0])/2, (a[1]+b[1])/2]; }
  function interp(a, b, t) { return [a[0] + (b[0]-a[0])*t, a[1] + (b[1]-a[1])*t]; }

  // --- Render with labels inside ---
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
    parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${w.toFixed(1)}mm" height="${h.toFixed(1)}mm" viewBox="${minX.toFixed(2)} ${minY.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)}" font-size="4">`);
    parts.push(`<path d="${path(inner)}" fill="none" stroke="black" stroke-width="0.35"/>`);
    parts.push(`<path d="${path(outer)}" fill="none" stroke="black" stroke-width="0.35"/>`);
    gens.forEach(([i, o]) => {
      parts.push(`<line x1="${i[0].toFixed(2)}" y1="${i[1].toFixed(2)}" x2="${o[0].toFixed(2)}" y2="${o[1].toFixed(2)}" stroke="black" stroke-width="0.2"/>`);
    });

    for (let i=0; i<inner.length-1; i++) {
      const li = Math.hypot(inner[i+1][0]-inner[i][0], inner[i+1][1]-inner[i][1]);
      const lo = Math.hypot(outer[i+1][0]-outer[i][0], outer[i+1][1]-outer[i][1]);
      const mi = midpoint(inner[i], inner[i+1]);
      const mo = midpoint(outer[i], outer[i+1]);
      const pInner = interp(mi, mo, 0.35);
      const pOuter = interp(mi, mo, 0.65);
      parts.push(`<text x="${pInner[0].toFixed(2)}" y="${pInner[1].toFixed(2)}" fill="blue" text-anchor="middle" dominant-baseline="middle">${li.toFixed(1)}</text>`);
      parts.push(`<text x="${pOuter[0].toFixed(2)}" y="${pOuter[1].toFixed(2)}" fill="red" text-anchor="middle" dominant-baseline="middle">${lo.toFixed(1)}</text>`);
    }

    parts.push(`</svg>`);
    return parts.join("");
  }

  // --- Hook UI ---
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

    if (rotSlider) rotSlider.addEventListener("input", (e) => {
      rot = parseInt(e.target.value || "0", 10) || 0;
      if (rotInput) rotInput.value = String(rot);
      draw();
    });
    if (rotInput) rotInput.addEventListener("input", (e) => {
      rot = parseInt(e.target.value || "0", 10) || 0;
      if (rotSlider) rotSlider.value = String(rot);
      draw();
    });

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
    btnPdf.addEventListener("click", async () => {
      const { jsPDF, svg2pdf } = getLibs();
      const svg = preview.querySelector("svg");
      if (!jsPDF || !svg2pdf || !svg) return alert("PDF-export saknar jsPDF/svg2pdf.");
      const doc = new jsPDF({ unit: "mm", format: "a4" });
      const margin = A4.marginMm;
      await svg2pdf(svg, doc, {
        x: margin,
        y: margin,
        width: A4.wMm - 2 * margin,
        height: A4.hMm - 2 * margin,
        useCSS: true,
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
