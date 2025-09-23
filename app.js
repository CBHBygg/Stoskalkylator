(function () {
  "use strict";

  // ---------------- Utils ----------------
  const mmToPt = (mm) => (mm * 72) / 25.4;
  const A4 = { wMm: 210, hMm: 297, marginMm: 5 };
  const $ = (id) => document.getElementById(id);

  // ---------------- Library detection ----------------
  function getLibs() {
    const jsPDF = window.jspdf?.jsPDF || window.jsPDF;
    const svg2pdf = window.svg2pdf || window.SVG2PDF || window.svg2pdf?.default;
    if (!jsPDF || !svg2pdf) {
      alert("PDF-export misslyckades: jsPDF/svg2pdf inte hittad.");
      throw new Error("Libraries not found");
    }
    return { jsPDF, svg2pdf };
  }

  // ---------------- Exporters ----------------
  function exportSVG(previewId, filename) {
    const svg = document.querySelector(`#${previewId} svg`);
    if (!svg) return;
    const blob = new Blob([svg.outerHTML], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportPDF(previewId, filename) {
    const svg = document.querySelector(`#${previewId} svg`);
    if (!svg) return;
    const { jsPDF, svg2pdf } = getLibs();
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const scale = mmToPt(1);
    const margin = mmToPt(A4.marginMm);

    svg2pdf(svg, doc, {
      x: margin,
      y: margin,
      width: mmToPt(A4.wMm - 2 * A4.marginMm),
      height: mmToPt(A4.hMm - 2 * A4.marginMm),
    });

    doc.save(filename);
  }

  // ---------------- Stos logic (unchanged) ----------------
  function computeStos(d, h, slope) {
    const r = d / 2;
    const T = Math.tan((slope * Math.PI) / 180);
    const pts = [];
    for (let i = 0; i <= 180; i += 5) {
      const rad = (i * Math.PI) / 180;
      const y = r * Math.cos(rad);
      const x = r * Math.sin(rad);
      const z = h + T * y;
      pts.push([x, z]);
    }
    return pts;
  }

  function renderStos(d, h, slope) {
    const pts = computeStos(d, h, slope);
    const w = d;
    const maxH = Math.max(...pts.map((p) => p[1]));
    const svg = [`<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${maxH}mm" viewBox="0 0 ${w} ${maxH}">`];
    svg.push(`<path d="M ${pts.map((p) => `${p[0]},${maxH - p[1]}`).join(" L ")}" fill="none" stroke="black"/>`);
    svg.push("</svg>");
    return svg.join("");
  }

  $("stosForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const d = parseFloat($("stosDiameter").value);
    const h = parseFloat($("stosHeight").value);
    const slope = parseFloat($("stosSlope").value);
    const svg = renderStos(d, h, slope);
    $("stosPreview").innerHTML = svg;
    $("stosResult").style.display = "block";
    $("stosMeta").textContent = `Diameter: ${d} mm, Höjd: ${h} mm, Taklutning: ${slope}°`;
  });
  $("stosSvg").addEventListener("click", () => exportSVG("stosPreview", "stos.svg"));
  $("stosPdf").addEventListener("click", () => exportPDF("stosPreview", "stos.pdf"));
  $("stosPrint").addEventListener("click", () => window.print());

  // ---------------- Kona logic (triangulation) ----------------
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
      const cosPhi = Math.max(-1, Math.min(1, (a * a + b * b - c * c) / (2 * a * b)));
      betas.push(betas[i] + Math.acos(cosPhi));
    }

    const ang = (rotDeg * Math.PI) / 180;
    const rot = ([x, y]) => [x * Math.cos(ang) - y * Math.sin(ang), x * Math.sin(ang) + y * Math.cos(ang)];

    const outer = betas.map((b, i) => rot([Rb[i] * Math.cos(b), Rb[i] * Math.sin(b)]));
    const inner = betas.map((b) => rot([Rin * Math.cos(b), Rin * Math.sin(b)]));
    const gens = inner.map((p, i) => [p, outer[i]]);

    return { inner, outer, gens };
  }

  function renderKona(topD, botD, slope, rotDeg) {
    const { inner, outer, gens } = computeKonaTriangulation(topD, botD, slope, 6, 30, rotDeg);
    const all = inner.concat(outer);
    const xs = all.map((p) => p[0]);
    const ys = all.map((p) => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const w = maxX - minX, h = maxY - minY;

    const svg = [`<svg xmlns="http://www.w3.org/2000/svg" width="${w.toFixed(1)}mm" height="${h.toFixed(1)}mm" viewBox="${minX.toFixed(2)} ${minY.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)}">`];
    const path = (pts) => `M ${pts.map((p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(" L ")}`;
    svg.push(`<path d="${path(inner)}" fill="none" stroke="black"/>`);
    svg.push(`<path d="${path(outer)}" fill="none" stroke="black"/>`);
    gens.forEach(([i, o]) => {
      svg.push(`<line x1="${i[0].toFixed(2)}" y1="${i[1].toFixed(2)}" x2="${o[0].toFixed(2)}" y2="${o[1].toFixed(2)}" stroke="black" stroke-width="0.2"/>`);
    });
    svg.push("</svg>");
    return svg.join("");
  }

  // ---------------- Kona events ----------------
  let currentKonaRot = 0;
  $("konaForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const topD = parseFloat($("konaTop").value);
    const botD = parseFloat($("konaBottom").value);
    const slope = parseFloat($("konaSlope").value);
    currentKonaRot = 0;
    const svg = renderKona(topD, botD, slope, currentKonaRot);
    $("konaPreview").innerHTML = svg;
    $("konaResult").style.display = "block";
    $("konaMeta").textContent = `Topp: ${topD} mm, Botten: ${botD} mm, Taklutning: ${slope}°`;
    $("konaRotSlider").value = 0;
    $("konaRotInput").value = 0;
  });

  $("konaRotSlider").addEventListener("input", (e) => {
    currentKonaRot = parseInt(e.target.value);
    const topD = parseFloat($("konaTop").value);
    const botD = parseFloat($("konaBottom").value);
    const slope = parseFloat($("konaSlope").value);
    $("konaPreview").innerHTML = renderKona(topD, botD, slope, currentKonaRot);
    $("konaRotInput").value = currentKonaRot;
  });

  $("konaRotInput").addEventListener("input", (e) => {
    currentKonaRot = parseInt(e.target.value);
    const topD = parseFloat($("konaTop").value);
    const botD = parseFloat($("konaBottom").value);
    const slope = parseFloat($("konaSlope").value);
    $("konaPreview").innerHTML = renderKona(topD, botD, slope, currentKonaRot);
    $("konaRotSlider").value = currentKonaRot;
  });

  $("konaSvg").addEventListener("click", () => exportSVG("konaPreview", "kona.svg"));
  $("konaPdf").addEventListener("click", () => exportPDF("konaPreview", "kona.pdf"));
  $("konaPrint").addEventListener("click", () => window.print());
})();
