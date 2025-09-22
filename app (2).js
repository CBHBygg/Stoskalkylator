
(function () {
  "use strict";

  // ---------------- Utils ----------------
  const $ = (id) => document.getElementById(id);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const mmToPt = (mm) => (mm * 72.0) / 25.4;
  const A4 = { wMm: 210, hMm: 297, marginMm: 5 };

  function onReady(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn);
    } else {
      fn();
    }
  }

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

  function setText(id, txt) {
    const el = $(id);
    if (el) el.textContent = txt;
  }

  function setHTML(id, html) {
    const el = $(id);
    if (el) el.innerHTML = html;
  }

  // ---------------- Library detection (for offline PDF) ----------------
  function getLibs() {
    // jsPDF UMD
    const jsPDF = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
    // svg2pdf UMD
    const svg2pdf =
      window.svg2pdf ||
      (window.SVG2PDF && window.SVG2PDF) ||
      (window.svg2pdf && window.svg2pdf.default);

    if (!jsPDF || !svg2pdf) {
      console.warn("PDF-export libraries missing", { jsPDF, svg2pdf });
    }
    return { jsPDF, svg2pdf };
  }

  // ---------------- Geometry: oblique-cut truncated cone ----------------
  // Triangulation-based development (12 segments) with +30 mm extra height
  function computeObliqueConeTriangulation(topD, botD, angleDeg, segments = 12, extraMm = 30) {
    if (!(topD > 0 && botD > 0 && angleDeg > 0 && segments >= 3)) {
      throw new Error("Invalid inputs for Kona pattern.");
    }
    const R2 = topD / 2;
    const R1 = botD / 2;
    const T = Math.tan((angleDeg * Math.PI) / 180); // oblique bottom plane slope
    const E = extraMm;

    // Solve for H (axial height) so top plane is E above the highest point of the oblique cut.
    // H^2 - H*(E + T*(R1+R2)) - E*T*(R1 - R2) = 0 (positive root)
    const B = E + T * (R1 + R2);
    const C = E * T * (R1 - R2);
    const H = 0.5 * (B + Math.sqrt(B * B + 4 * C));

    // Cone linear radius drop k, slant factor sF, apex position along axis
    const k = (R1 - R2) / H;             // dr/dz
    const sF = Math.hypot(1, k);         // scale from axis height to slant distance
    const zApex = R1 / k;                // distance from cut low-point to apex along axis
    const Rin = (zApex - H) * sF;        // apex->top slant (inner radius of development)

    const thetas = Array.from({ length: segments + 1 }, (_, i) => (2 * Math.PI * i) / segments);

    // Axis height where oblique plane intersects the cone at azimuth angle th
    const zAt = (th) => {
      // Derived intersection of plane z = T * x (choosing x-axis for "uphill") with cone r(z) = R1 - k z.
      // After eliminating x,y using r^2 = x^2 + y^2 and x = r cos th, algebra gives:
      // z(th) = [ T * R1 * (1 - cos th) ] / [ 1 - T * k * cos th ]
      const c = Math.cos(th);
      const denom = 1 - T * k * c;
      return (T * R1 * (1 - c)) / denom;
    };

    // Sample 3D points around the oblique lower rim; compute outer slant radii from apex
    const pts3D = thetas.map((th) => {
      const z = zAt(th);
      const r = R1 - k * z;
      return { th, z, r, x: r * Math.cos(th), y: r * Math.sin(th) };
    });

    const Rb = pts3D.map((p) => (zApex - p.z) * sF); // apex->rim slant (outer radius per vertex)

    // True 3D chords along the rim between neighbors (used to unroll via triangle solving)
    const chords = [];
    for (let i = 0; i < segments; i++) {
      const p = pts3D[i], q = pts3D[i + 1];
      const dx = p.x - q.x, dy = p.y - q.y, dz = p.z - q.z;
      chords.push(Math.hypot(dx, dy, dz));
    }

    // Accumulate angles in the development (betas) using Law of Cosines
    const betas = [0];
    for (let i = 0; i < segments; i++) {
      const a = Rb[i], b = Rb[i + 1], c = chords[i];
      const cosPhi = clamp((a * a + b * b - c * c) / (2 * a * b), -1, 1);
      betas.push(betas[betas.length - 1] + Math.acos(cosPhi));
    }

    // Construct 2D development polylines (outer rim at Rb, inner rim at Rin)
    const outer = betas.map((b, i) => [Rb[i] * Math.cos(b), Rb[i] * Math.sin(b)]);
    const inner = betas.map((b) => [Rin * Math.cos(b), Rin * Math.sin(b)]);

    // Bounding box & translate to positive coords with margin
    const allPts = outer.concat(inner);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x, y] of allPts) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
    const margin = 10; // mm
    const dx = -minX + margin;
    const dy = -minY + margin;
    const w = maxX - minX + 2 * margin;
    const h = maxY - minY + 2 * margin;

    const fmt = (p) => `${(p[0] + dx).toFixed(2)},${(p[1] + dy).toFixed(2)}`;
    const polyOuter = outer.map(fmt).join(" ");
    const polyInner = inner.map(fmt).join(" ");

    const rays = outer.map((o, i) => {
      const xi = inner[i][0] + dx, yi = inner[i][1] + dy;
      const xo = o[0] + dx, yo = o[1] + dy;
      return { xi, yi, xo, yo };
    });

    return { widthMm: w, heightMm: h, inner, outer, dx, dy, rays, margin };
  }

  function buildKonaSVG(topD, botD, angleDeg, segments = 12, extraMm = 30) {
    const dev = computeObliqueConeTriangulation(topD, botD, angleDeg, segments, extraMm);
    const { widthMm, heightMm, inner, outer, dx, dy, rays } = dev;

    const fmt = (x, y) => `${(x + dx).toFixed(2)},${(y + dy).toFixed(2)}`;
    const polyOuter = outer.map(([x, y]) => fmt(x, y)).join(" ");
    const polyInner = inner.map(([x, y]) => fmt(x, y)).join(" ");

    const lines = rays
      .map(({ xi, yi, xo, yo }) => {
        return `<line x1="${xi.toFixed(2)}" y1="${yi.toFixed(2)}" x2="${xo.toFixed(2)}" y2="${yo.toFixed(2)}" stroke="black" stroke-width="0.35"/>`;
      })
      .join("");

    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${widthMm.toFixed(2)}mm" height="${heightMm.toFixed(2)}mm" viewBox="0 0 ${widthMm.toFixed(2)} ${heightMm.toFixed(2)}" shape-rendering="geometricPrecision">` +
      `<polyline points="${polyOuter}" fill="none" stroke="black" stroke-width="0.35"/>` +
      `<polyline points="${polyInner}" fill="none" stroke="black" stroke-width="0.35"/>` +
      lines +
      `</svg>`;

    return { svg, widthMm, heightMm };
  }

  // ---------------- Exporters ----------------
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
    if (!wrap) return alert("Preview not found");
    const svg = wrap.querySelector("svg");
    if (!svg) return alert("No SVG to export");

    const serializer = new XMLSerializer();
    const text = serializer.serializeToString(svg);
    downloadText(filename || "kona.svg", text);
  }

  function exportPDF(previewId, filename) {
    const wrap = document.querySelector(`#${previewId}`);
    if (!wrap) return alert("Preview not found");
    const svgEl = wrap.querySelector("svg");
    if (!svgEl) return alert("No SVG to export");

    const { jsPDF, svg2pdf } = getLibs();
    if (!jsPDF || !svg2pdf) {
      alert("PDF-export misslyckades: jsPDF/svg2pdf inte laddad.");
      return;
    }

    // Parse SVG size in mm
    const wAttr = svgEl.getAttribute("width") || "200mm";
    const hAttr = svgEl.getAttribute("height") || "200mm";
    const wMm = parseFloat(wAttr);
    const hMm = parseFloat(hAttr);

    // Create portrait A4 and rotate if needed to fit better
    let pdfW = A4.wMm, pdfH = A4.hMm;
    if ((wMm > hMm && pdfW < pdfH) || (wMm > pdfW - 2 * A4.marginMm)) {
      // landscape
      pdfW = A4.hMm; pdfH = A4.wMm;
    }
    const doc = new jsPDF({ unit: "pt", format: [mmToPt(pdfW), mmToPt(pdfH)] });

    const xPt = mmToPt(A4.marginMm);
    const yPt = mmToPt(A4.marginMm);
    const maxWPt = mmToPt(pdfW - 2 * A4.marginMm);
    const maxHPt = mmToPt(pdfH - 2 * A4.marginMm);

    const targetScale = Math.min(maxWPt / mmToPt(wMm), maxHPt / mmToPt(hMm));

    // Clone SVG to ensure clean rendering
    const svgClone = svgEl.cloneNode(true);

    svg2pdf(svgClone, doc, {
      x: xPt,
      y: yPt,
      assumePt: true,
      scale: targetScale * (mmToPt(1)), // 1 mm in SVG -> 1 mm in PDF
      useCSS: true,
      precision: 4
    });

    doc.save(filename || "kona.pdf");
  }

  function hookExport(previewId, svgBtnId, pdfBtnId, printBtnId) {
    const svgBtn = $(svgBtnId);
    const pdfBtn = $(pdfBtnId);
    const printBtn = $(printBtnId);

    if (svgBtn) svgBtn.onclick = () => exportSVG(previewId, "kona.svg");
    if (pdfBtn) pdfBtn.onclick = () => exportPDF(previewId, "kona.pdf");
    if (printBtn) printBtn.onclick = () => {
      exportPDF(previewId, "kona.pdf");
      // let the user print the PDF from their viewer
    };
  }

  // ---------------- Public renderers ----------------
  function renderKonaOblique(opts) {
    const topD = Number(opts.topD);
    const botD = Number(opts.botD);
    const angleDeg = Number(opts.angleDeg);
    const segments = Number(opts.segments || 12);
    const extra = Number(opts.extra || 30);

    const { svg, widthMm, heightMm } = buildKonaSVG(topD, botD, angleDeg, segments, extra);

    setHTML("konaPreview", svg);
    setText("konaMeta", `Kona (oblique): ToppØ=${topD} mm, BottØ=${botD} mm, Vinkel=${angleDeg}°, Segment=${segments}, +${extra} mm`);
    const box = $("konaResult");
    if (box) box.style.display = "block";

    // wire export buttons if present
    hookExport("konaPreview", "konaSvg", "konaPdf", "konaPrint");

    return { widthMm, heightMm };
  }

  // Try to wire to existing UI if the page provides known IDs
  function tryWireUI() {
    const topIds = ["kona_top", "konaTop", "toppdiameter", "Toppdiameter"];
    const botIds = ["kona_bottom", "konaBottom", "bottendiameter", "Bottendiameter"];
    const angIds = ["kona_angle", "konaAngle", "taklutning", "Taklutning"];

    function readAndRender() {
      const topD = getNumberFrom(topIds, 50);
      const botD = getNumberFrom(botIds, 70);
      const angle = getNumberFrom(angIds, 45);
      renderKonaOblique({ topD, botD, angleDeg: angle, segments: 12, extra: 30 });
    }

    // Buttons
    const genBtn = $("kona_generate") || $("konaGen") || $("konaBtn");
    if (genBtn) genBtn.onclick = readAndRender;

    // Auto-generate on input if fields exist
    const topEl = topIds.map($).find(Boolean);
    const botEl = botIds.map($).find(Boolean);
    const angEl = angIds.map($).find(Boolean);
    const previewWrap = $("konaPreview");

    if (topEl && botEl && angEl && previewWrap) {
      ["input", "change"].forEach((ev) => {
        topEl.addEventListener(ev, readAndRender);
        botEl.addEventListener(ev, readAndRender);
        angEl.addEventListener(ev, readAndRender);
      });
      // initial render
      readAndRender();
    }
  }

  // Expose in global for legacy code to call
  window.renderKonaOblique = renderKonaOblique;
  window.Kona = {
    render: renderKonaOblique,
    compute: computeObliqueConeTriangulation,
    svg: buildKonaSVG,
    exportSVG,
    exportPDF,
  };

  onReady(tryWireUI);
})();
