(function () {
  "use strict";

  // ---------------- Utils ----------------
  const $ = (id) => document.getElementById(id);
  const mmToPt = (mm) => (mm * 72.0) / 25.4;
  const A4 = { wMm: 210, hMm: 297, marginMm: 5 };

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

  async function exportMultiPagePDF(previewId, filenameBase) {
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
    const pdf = new jsPDF({ unit: "pt", format: "a4" });
    const pageWpt = pdf.internal.pageSize.getWidth();
    const pageHpt = pdf.internal.pageSize.getHeight();
    const marginPt = mmToPt(A4.marginMm);
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
          x: marginPt,
          y: marginPt,
          width: pageWpt - 2 * marginPt,
          height: pageHpt - 2 * marginPt,
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
  hookExport("stosPreview", "stosSvg", "stosPdf", "stosPrint");

  // ---------------- Kona logic is now fully in kona.module.js ----------------
  // app.js no longer carries any of the old or new Kona code.
  // Kona UI events and rendering are wired in kona.module.js

})();
