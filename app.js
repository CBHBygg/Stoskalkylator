
(function () {
  "use strict";

  // ---------------- Utils ----------------
  const mmToPt = (mm) => (mm * 72) / 25.4;
  const A4 = { wMm: 210, hMm: 297, marginMm: 5 };
  const $ = (id) => document.getElementById(id);

  function clamp(n, a, b) { return Math.min(Math.max(n, a), b); }
  function deg2rad(d) { return (Math.PI / 180) * d; }

  // ---------------- Library detection ----------------
  function getLibs() {
    const jsPDF = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
    const svg2pdf = window.svg2pdf || window.SVG2PDF || (window.svg2pdf && window.svg2pdf.default);

    if (!jsPDF || !svg2pdf) {
      console.warn("PDF export libs missing:", { jsPDF, svg2pdf });
    }
    return { jsPDF, svg2pdf };
  }

  // ---------------- SVG helpers ----------------
  function clearNode(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  function svgEl(name, attrs = {}, children = []) {
    const el = document.createElementNS("http://www.w3.org/2000/svg", name);
    for (const [k, v] of Object.entries(attrs)) {
      el.setAttribute(k, String(v));
    }
    for (const c of children) el.appendChild(c);
    return el;
  }

  function ensurePreview(id) {
    const wrap = $(id);
    if (!wrap) return null;
    let svg = wrap.querySelector("svg");
    if (!svg) {
      svg = svgEl("svg", { width: "100%", height: "100%", viewBox: "0 0 210 297" });
      wrap.appendChild(svg);
    } else {
      clearNode(svg);
    }
    return svg;
  }

  // ---------------- Exporters ----------------
  function exportSVG(previewId, filename) {
    const svg = document.querySelector(`#${previewId} svg`);
    if (!svg) {
      alert("Ingen SVG att exportera.");
      return;
    }
    const blob = new Blob([svg.outerHTML], { type: "image/svg+xml;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename || "pattern.svg";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function exportPDF(previewId, filename) {
    const svg = document.querySelector(`#${previewId} svg`);
    if (!svg) {
      alert("Ingen SVG att exportera.");
      return;
    }
    const { jsPDF, svg2pdf } = getLibs();
    if (!jsPDF || !svg2pdf) {
      alert("PDF-export misslyckades: jsPDF/svg2pdf kunde inte hittas.");
      return;
    }

    const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
    const vb = svg.getAttribute("viewBox")?.split(/\s+/).map(Number) || [0, 0, 210, 297];
    const [ , , vbW, vbH ] = vb;
    const scaleX = (A4.wMm - 2 * A4.marginMm) / vbW;
    const scaleY = (A4.hMm - 2 * A4.marginMm) / vbH;
    const scale = Math.min(scaleX, scaleY);

    const opts = {
      xOffset: A4.marginMm,
      yOffset: A4.marginMm,
      scale,
      useCSS: true
    };

    await svg2pdf(svg, doc, opts);
    doc.save(filename || "pattern.pdf");
  }

  // ---------------- Core geometry: Oblique-truncated cone ----------------
  // Computes the half development outline for given top/bottom diameters and cut angle.
  // Guarantees: max bottom diameter occurs at "front" (phi=0), cut slopes upward,
  // and minimum slant height Hmin keeps back from collapsing.
  function computeKonaHalf(topD, bottomD, slopeDeg, options = {}) {
    const N = options.samples || 240; // smoothness
    const Hmin = ("Hmin" in options) ? options.Hmin : 30; // mm

    const R_top = topD / 2;
    const R_max = bottomD / 2;
    const alpha = deg2rad(slopeDeg);

    // Solve for semi-vertical angle psi via bisection so constraints hold:
    // f(psi) = (s_top + Hmin)*(cosψ + tanα sinψ) - R_max*(cotψ - tanα) = 0
    function f(psi) {
      const s_top = R_top / Math.sin(psi);
      const left = (s_top + Hmin) * (Math.cos(psi) + Math.tan(alpha) * Math.sin(psi));
      const right = R_max * (1 / Math.tan(psi) - Math.tan(alpha));
      return left - right;
    }

    let lo = 1e-6, hi = (89 * Math.PI) / 180;
    // Expand bracket if needed
    let flo = f(lo), fhi = f(hi);
    if (Number.isNaN(flo) || Number.isNaN(fhi)) {
      throw new Error("Numerical issue while bracketing psi");
    }
    // Basic bisection
    for (let i = 0; i < 120; i++) {
      const mid = 0.5 * (lo + hi);
      const fm = f(mid);
      if (Math.abs(fm) < 1e-10) { lo = hi = mid; break; }
      // Maintain bracket: prefer sign change; otherwise push towards smaller |f|
      const flo2 = f(lo);
      if (flo2 * fm <= 0) {
        hi = mid;
      } else {
        lo = mid;
      }
    }
    const psi = 0.5 * (lo + hi);
    const s_top = R_top / Math.sin(psi);

    // plane constant c
    const c = (s_top + Hmin) * (Math.cos(psi) + Math.tan(alpha) * Math.sin(psi));

    function s_out(phi) {
      const D = Math.cos(psi) - Math.tan(alpha) * Math.sin(psi) * Math.cos(phi);
      return c / D;
    }

    // Unwrap mapping preserving inner circumference: theta = (R_top/s_top) * phi
    const unwrap = R_top / s_top; // equals sin(psi)
    const phiHalf = new Float64Array(N);
    const thetaHalf = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      phiHalf[i] = (Math.PI * i) / (N - 1);
      thetaHalf[i] = unwrap * phiHalf[i];
    }

    // Build Cartesian coordinates for half outline
    const rIn = s_top;
    const inner = new Array(N);
    const outer = new Array(N);
    for (let i = 0; i < N; i++) {
      const th = thetaHalf[i];
      const sOut = s_out(phiHalf[i]);
      inner[i] = [rIn * Math.cos(th), rIn * Math.sin(th)];
      outer[i] = [sOut * Math.cos(th), sOut * Math.sin(th)];
    }

    // Diagnostics for sanity (not used in drawing)
    const backGap = s_out(Math.PI) - s_top;
    const frontR = s_out(0) * Math.sin(psi);

    return { inner, outer, psi, s_top, backGap, frontR, unwrap };
  }

  // ---------------- Rendering (Kona) ----------------
  function renderKona(previewId, topD, bottomD, slopeDeg, opts = {}) {
    const svg = ensurePreview(previewId);
    if (!svg) return;

    const { inner, outer } = computeKonaHalf(topD, bottomD, slopeDeg, opts);

    // Compute bounds and shift into viewBox (mm units)
    const pts = inner.concat(outer);
    const xs = pts.map(p => p[0]);
    const ys = pts.map(p => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const margin = 10; // mm
    const W = (maxX - minX) + 2 * margin;
    const H = (maxY - minY) + 2 * margin;
    const offX = -minX + margin;
    const offY = -minY + margin;

    svg.setAttribute("viewBox", `0 0 ${W.toFixed(3)} ${H.toFixed(3)}`);

    // Styles
    const style = svgEl("style", {}, [
      document.createTextNode(`
        .edge { fill: none; stroke: #000; stroke-width: 0.35; }
        .seam { stroke: #E53935; stroke-width: 0.8; }
        .gen { stroke: #666; stroke-width: 0.3; stroke-dasharray: 2 2; }
        .label { font: 3.5px sans-serif; fill: #000; }
      `)
    ]);
    svg.appendChild(style);

    function moveTo(p) { return `M ${ (p[0]+offX).toFixed(3) } ${ (p[1]+offY).toFixed(3) }`; }
    function lineTo(p) { return `L ${ (p[0]+offX).toFixed(3) } ${ (p[1]+offY).toFixed(3) }`; }

    // Build outline path: inner (start->end), connect to outer end, outer (end->start), close
    const dParts = [];
    dParts.push(moveTo(inner[0]));
    for (let i = 1; i < inner.length; i++) dParts.push(lineTo(inner[i]));
    dParts.push(lineTo(outer[outer.length - 1]));
    for (let i = outer.length - 2; i >= 0; i--) dParts.push(lineTo(outer[i]));
    dParts.push("Z");
    const outline = svgEl("path", { d: dParts.join(" "), class: "edge" });
    svg.appendChild(outline);

    // Generators (12 divisions on half)
    const Ngen = 12;
    for (let i = 0; i <= Ngen; i++) {
      const idx = Math.round((i / Ngen) * (inner.length - 1));
      const pIn = inner[idx], pOut = outer[idx];
      const gen = svgEl("line", {
        x1: (pIn[0]+offX).toFixed(3), y1: (pIn[1]+offY).toFixed(3),
        x2: (pOut[0]+offX).toFixed(3), y2: (pOut[1]+offY).toFixed(3),
        class: "gen"
      });
      svg.appendChild(gen);
      const mx = (pIn[0]+pOut[0])/2 + offX;
      const my = (pIn[1]+pOut[1])/2 + offY;
      const txt = svgEl("text", { x: mx.toFixed(3), y: (my-1.2).toFixed(3), class: "label" });
      txt.textContent = String(i+1);
      svg.appendChild(txt);
    }

    // Seam edges A/A' and B/B'
    const A1 = inner[0], A2 = outer[0];
    const B1 = inner[inner.length - 1], B2 = outer[outer.length - 1];
    const seamA = svgEl("line", {
      x1: (A1[0]+offX).toFixed(3), y1: (A1[1]+offY).toFixed(3),
      x2: (A2[0]+offX).toFixed(3), y2: (A2[1]+offY).toFixed(3),
      class: "seam"
    });
    const seamB = svgEl("line", {
      x1: (B1[0]+offX).toFixed(3), y1: (B1[1]+offY).toFixed(3),
      x2: (B2[0]+offX).toFixed(3), y2: (B2[1]+offY).toFixed(3),
      class: "seam"
    });
    svg.appendChild(seamA);
    svg.appendChild(seamB);

    const tA = svgEl("text", { x: (A1[0]+offX).toFixed(3), y: (A1[1]+offY-2).toFixed(3), class: "label" }); tA.textContent = "A";
    const tAp= svgEl("text", { x: (A2[0]+offX).toFixed(3), y: (A2[1]+offY+4).toFixed(3), class: "label" }); tAp.textContent = "A'";
    const tB = svgEl("text", { x: (B1[0]+offX).toFixed(3), y: (B1[1]+offY-2).toFixed(3), class: "label" }); tB.textContent = "B";
    const tBp= svgEl("text", { x: (B2[0]+offX).toFixed(3), y: (B2[1]+offY+4).toFixed(3), class: "label" }); tBp.textContent = "B'";
    svg.appendChild(tA); svg.appendChild(tAp); svg.appendChild(tB); svg.appendChild(tBp);

    // Return bounds for printing/rotation features
    return { widthMm: W, heightMm: H };
  }

  // ---------------- Stos (pipe) — keep placeholder safe ----------------
  // We keep user's existing "Stos" logic minimal here to avoid crashing if elements exist.
  function renderStos(previewId) {
    const svg = ensurePreview(previewId);
    if (!svg) return;
    const style = svgEl("style", {}, [ document.createTextNode(`.hint{font:5px sans-serif; fill:#777}`) ]);
    svg.appendChild(style);
    const t = svgEl("text", { x: 10, y: 15, class: "hint"});
    t.textContent = "Stos-mönster: ej implementerat i denna build.";
    svg.appendChild(t);
  }

  // ---------------- Wire-up ----------------
  function safeParse(id, fallback) {
    const el = $(id);
    if (!el) return fallback;
    const v = parseFloat(el.value);
    return Number.isFinite(v) ? v : fallback;
  }

  function setupKona() {
    const btn = $("konaCalcBtn");
    const topEl = $("konaTop");
    const botEl = $("konaBottom");
    const angEl = $("konaTaklut");
    const autoRotate = $("konaAutoRotate");

    function run() {
      const topD = clamp(safeParse("konaTop", 110), 1, 5000);
      const bottomD = clamp(safeParse("konaBottom", 130), topD + 0.01, 5000);
      const slopeDeg = clamp(safeParse("konaTaklut", 45), 0.1, 89.9);
      const box = renderKona("konaPreview", topD, bottomD, slopeDeg, { Hmin: 30, samples: 240 });

      // Optional auto-rotate to fit A4 height-wise (rotate 90° if wider than tall)
      if (autoRotate && autoRotate.checked) {
        const preview = $("konaPreview");
        if (preview) {
          const rotateNeeded = box.widthMm > box.heightMm;
          preview.style.transform = rotateNeeded ? "rotate(90deg)" : "none";
          preview.style.transformOrigin = "center center";
        }
      }
    }

    if (btn) btn.addEventListener("click", run);
    // live update on inputs if fields exist
    [topEl, botEl, angEl].forEach(el => el && el.addEventListener("input", run));

    // Export buttons (if present)
    const btnSvg = $("konaExportSvg");
    const btnPdf = $("konaExportPdf");
    if (btnSvg) btnSvg.addEventListener("click", () => exportSVG("konaPreview", "kona_half_pattern.svg"));
    if (btnPdf) btnPdf.addEventListener("click", () => exportPDF("konaPreview", "kona_half_pattern.pdf"));

    // Initial render if all inputs available
    if (topEl && botEl && angEl) run();
  }

  function setupStos() {
    const btn = $("stosCalcBtn");
    if (btn) btn.addEventListener("click", () => renderStos("stosPreview"));
  }

  // Initialize after DOM ready
  document.addEventListener("DOMContentLoaded", function () {
    try {
      setupKona();
      setupStos();
    } catch (e) {
      console.error("Init error:", e);
    }
  });
})();
