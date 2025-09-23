
(function () {
  "use strict";

  // ---------------- Utils ----------------
  const $ = (id) => document.getElementById(id);
  const A4 = { wMm: 210, hMm: 297, marginMm: 5 };

  function resolveJsPDF() {
    return (window.jspdf && window.jspdf.jsPDF) || window.jsPDF || null;
  }
  function resolveSvg2pdf() {
    const cands = [
      window.svg2pdf,
      window?.svg2pdf?.svg2pdf,
      window.SVG2PDF,
      window?.SVG2PDF?.svg2pdf,
    ];
    for (const f of cands) if (typeof f === "function") return f;
    return null;
  }

  function parseMm(val) {
    if (val == null) return NaN;
    if (typeof val === "number") return val;
    const s = String(val).trim();
    return parseFloat(s.replace("mm",""));
  }

  // -------- Tiled PDF export at 1:1 mm with margins --------
  async function exportPDF(previewId, filenameBase) {
    const jsPDF = resolveJsPDF();
    const svg2pdf = resolveSvg2pdf();
    if (!jsPDF || !svg2pdf) {
      alert("PDF-export misslyckades: jsPDF/svg2pdf inte laddad.");
      return;
    }
    const svg = document.querySelector(`#${previewId} svg`);
    if (!svg) { alert("Ingen SVG att exportera."); return; }

    // Physical size in mm from <svg width/height="...mm">
    const svgW = parseMm(svg.getAttribute("width"));
    const svgH = parseMm(svg.getAttribute("height"));
    if (!isFinite(svgW) || !isFinite(svgH)) { alert("SVG saknar mm-storlek."); return; }

    // Account for source viewBox offset
    let vbX = 0, vbY = 0;
    const vb = svg.viewBox && svg.viewBox.baseVal ? svg.viewBox.baseVal : null;
    if (vb) { vbX = vb.x || 0; vbY = vb.y || 0; }

    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const margin = A4.marginMm;
    const pageW = A4.wMm - 2 * margin;
    const pageH = A4.hMm - 2 * margin;
    const cols = Math.max(1, Math.ceil(svgW / pageW));
    const rows = Math.max(1, Math.ceil(svgH / pageH));

    const ns = "http://www.w3.org/2000/svg";
    function buildTile(xMm, yMm, wMm, hMm) {
      const tile = document.createElementNS(ns, "svg");
      tile.setAttribute("xmlns", ns);
      tile.setAttribute("width", wMm + "mm");
      tile.setAttribute("height", hMm + "mm");
      tile.setAttribute("viewBox", `0 0 ${wMm} ${hMm}`);

      const defs = document.createElementNS(ns, "defs");
      const clip = document.createElementNS(ns, "clipPath");
      const id = `clip_${Math.random().toString(36).slice(2)}`;
      clip.setAttribute("id", id);
      const rect = document.createElementNS(ns, "rect");
      rect.setAttribute("x", "0");
      rect.setAttribute("y", "0");
      rect.setAttribute("width", String(wMm));
      rect.setAttribute("height", String(hMm));
      clip.appendChild(rect);
      defs.appendChild(clip);
      tile.appendChild(defs);

      const g = document.createElementNS(ns, "g");
      g.setAttribute("clip-path", `url(#${id})`);
      g.setAttribute("transform", `translate(${-xMm - vbX},${-yMm - vbY})`);
      // Clone only children (avoid nested <svg>)
      for (let n = svg.firstChild; n; n = n.nextSibling) {
        if (n.nodeType === 1) g.appendChild(n.cloneNode(true));
      }
      tile.appendChild(g);
      return tile;
    }

    
  let first = true;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!first) doc.addPage();
      first = false;
      const xMm = c * pageW;
      const yMm = r * pageH;
      const wMm = Math.min(pageW, svgW - xMm);
      const hMm = Math.min(pageH, svgH - yMm);
      const tileSvg = buildTile(xMm, yMm, wMm, hMm);
      await svg2pdf(tileSvg, doc, {
        x: margin,
        y: margin,
        width: wMm,
        height: hMm,
        useCSS: true
      });
    }
  }
  doc.save((filenameBase || "pattern") + ".pdf");
}

  }
})();
  // ---------------- Stos logic (half development, boxed tightly) ----------------
  function computeStos(d, h, slope, steps = 180) {
    const r = d / 2;
    const T = Math.tan((slope * Math.PI) / 180);
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const th = (Math.PI * i) / steps; // 0..π
      const arc = r * th;               // arc length (X, mm)
      const y = r * Math.cos(th);
      const z = h + T * y;              // height (mm)
      pts.push([arc, z]);
    }
    return pts;
  }

  function renderStos(d, h, slope) {
    const pts = computeStos(d, h, slope);
    const w = Math.PI * d / 2;
    const zVals = pts.map((p) => p[1]);
    const minZ = Math.min(...zVals);
    const maxZ = Math.max(...zVals);
    const boxH = maxZ - minZ;

    const svg = [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${w.toFixed(1)}mm" height="${boxH.toFixed(1)}mm" viewBox="0 0 ${w.toFixed(2)} ${boxH.toFixed(2)}" font-size="6">`
    ];
    const pathD = pts.map((p) => {
      const x = p[0];
      const y = (p[1] - minZ);
      return `${x.toFixed(2)},${(boxH - y).toFixed(2)}`;
    }).join(" L ");
    svg.push(`<path d="M ${pathD}" fill="none" stroke="black"/>`);
    svg.push(`<rect x="0" y="0" width="${w.toFixed(2)}" height="${boxH.toFixed(2)}" fill="none" stroke="black" stroke-dasharray="4"/>`);
    svg.push(`<text x="${(w/2).toFixed(2)}" y="10" text-anchor="middle" fill="blue">${w.toFixed(1)} mm</text>`);
    svg.push(`<text x="${(w-3).toFixed(2)}" y="${(boxH/2).toFixed(2)}" text-anchor="middle" dominant-baseline="middle" fill="blue" transform="rotate(-90 ${(w-3).toFixed(2)} ${(boxH/2).toFixed(2)})">${boxH.toFixed(1)} mm</text>`);
    svg.push("</svg>");
    return svg.join("");
  }

  // Hook Stos UI
  (function hookStos(){
    const form = $("stosForm");
    if (!form) return;
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const d = parseFloat($("stosDiameter").value);
      const h = parseFloat($("stosHeight").value);
      const slope = parseFloat($("stosSlope").value);
      const svg = renderStos(d, h, slope);
      $("stosPreview").innerHTML = svg;
      $("stosResult").style.display = "block";
      $("stosMeta").textContent = `Diameter: ${d} mm, Höjd: ${h} mm, Taklutning: ${slope}°`;
    });
    const svgBtn = $("stosSvg");
    const pdfBtn = $("stosPdf");
    const printBtn = $("stosPrint");
    if (svgBtn) svgBtn.onclick = () => {
      const svg = document.querySelector("#stosPreview svg");
      if (!svg) return;
      const ser = new XMLSerializer().serializeToString(svg);
      const blob = new Blob([ser], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "stos.svg"; a.click();
      URL.revokeObjectURL(url);
    };
    if (pdfBtn) pdfBtn.onclick = () => exportPDF("stosPreview", "stos");
    if (printBtn) printBtn.onclick = () => window.print();
  })();

  // ---------------- Tab switching ----------------
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

  // Kona handled in kona.module.js
})();
