(function () {
  "use strict";

  // ---------------- Utils ----------------
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
    const svg = document.querySelector(`#${previewId} svg`);
    if (!svg) return;
    const serializer = new XMLSerializer();
    const text = serializer.serializeToString(svg);
    downloadText(filename || "pattern.svg", text);
  }

  async function exportPDF(previewId, filenameBase) {
    const { jsPDF, svg2pdf } = getLibs();
    if (!jsPDF || !svg2pdf) {
      alert("PDF-export misslyckades: jsPDF/svg2pdf inte laddad.");
      return;
    }
    const svg = document.querySelector(`#${previewId} svg`);
    if (!svg) {
      alert("Ingen SVG att exportera.");
      return;
    }
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    await svg2pdf(svg, doc, { x: 0, y: 0 });
    doc.save((filenameBase || "pattern") + ".pdf");
  }

  function hookExport(previewId, svgBtnId, pdfBtnId, printBtnId) {
    const svgBtn = $(svgBtnId);
    const pdfBtn = $(pdfBtnId);
    const printBtn = $(printBtnId);
    if (svgBtn) svgBtn.onclick = () => exportSVG(previewId, "pattern.svg");
    if (pdfBtn) pdfBtn.onclick = () => exportPDF(previewId, "pattern");
    if (printBtn) printBtn.onclick = () => window.print();
  }

  // ---------------- Stos logic (half development, boxed tightly) ----------------
  function computeStos(d, h, slope, steps = 180) {
    const r = d / 2;
    const T = Math.tan((slope * Math.PI) / 180);
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const th = (Math.PI * i) / steps; // 0..π
      const arc = r * th;
      const y = r * Math.cos(th);
      const z = h + T * y;
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

  // Kona handled separately
})();
