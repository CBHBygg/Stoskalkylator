(function () {
  "use strict";

  // ---------------- Utils ----------------
  const $ = (id) => document.getElementById(id);
  const mmToPt = (mm) => (mm * 72.0) / 25.4;
  const A4 = { wMm: 210, hMm: 297, marginMm: 5 };

  function getLibs() {
    const jsPDF = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
    let svg2pdf = window.svg2pdf;
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
    const pdf = new jsPDF({ unit: "pt", format: "a4" });
    const pageWpt = pdf.internal.pageSize.getWidth();
    const pageHpt = pdf.internal.pageSize.getHeight();
    const marginPt = mmToPt(A4.marginMm);
    const cols = Math.ceil(widthMm / pageW);
    const rows = Math.ceil(heightMm / pageH);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (r !== 0 || c !== 0) pdf.addPage();
        const clone = svg.cloneNode(true);
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

  // ---------------- Stos logic (restored + box with labels) ----------------
  function computeStos(d, h, slope, steps = 180) {
    const r = d / 2;
    const T = Math.tan((slope * Math.PI) / 180);
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const th = (Math.PI * i) / steps; // 0..π for half circumference
      const arc = r * th;               // arc length (X axis, flattened)
      const y = r * Math.cos(th);
      const z = h + T * y;              // height offset
      pts.push([arc, z]);
    }
    return pts;
  }

  function renderStos(d, h, slope) {
    const pts = computeStos(d, h, slope);
    const w = Math.PI * d / 2; // half circumference
    const maxH = Math.max(...pts.map((p) => p[1]));

    const svg = [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${maxH}mm" viewBox="0 0 ${w} ${maxH}" font-size="6">`
    ];
    // Cutout path
    svg.push(
      `<path d="M ${pts.map((p) => `${p[0].toFixed(2)},${maxH - p[1].toFixed(2)}`).join(" L ")}" fill="none" stroke="black"/>`
    );
    // Enclosing box
    svg.push(`<rect x="0" y="0" width="${w}" height="${maxH}" fill="none" stroke="black" stroke-dasharray="4"/>`);
    // Labels
    svg.push(`<text x="${w/2}" y="12" text-anchor="middle" fill="blue">${w.toFixed(1)} mm</text>`);
    svg.push(`<text x="${w-2}" y="${maxH/2}" text-anchor="end" dominant-baseline="middle" fill="blue">${maxH.toFixed(1)} mm</text>`);
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

  // ---------------- Kona logic is in kona.module.js ----------------

})();
