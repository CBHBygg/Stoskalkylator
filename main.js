// ===== Tab Switching =====
document.addEventListener("DOMContentLoaded", () => {
  const tabs = document.querySelectorAll("nav .tab");
  const contents = document.querySelectorAll(".tab-content");

  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      tabs.forEach(t => t.classList.remove("active"));
      contents.forEach(c => c.classList.remove("active"));
      tab.classList.add("active");
      document.getElementById(tab.dataset.tab).classList.add("active");
    });
  });

  document.getElementById("genStos").addEventListener("click", () => {
    const d = parseFloat(document.getElementById("stosDiameter").value);
    const a = parseFloat(document.getElementById("stosAngle").value);
    document.getElementById("stosSvgContainer").innerHTML = generateStosSVG(d, a);
  });

  document.getElementById("genKona").addEventListener("click", () => {
    const topD = parseFloat(document.getElementById("konaTop").value);
    const botD = parseFloat(document.getElementById("konaBottom").value);
    const ang = parseFloat(document.getElementById("konaAngle").value);
    document.getElementById("konaSvgContainer").innerHTML = generateKonaSVG(topD, botD, ang);
  });

  document.getElementById("exportStos").addEventListener("click", () => {
  const d = document.getElementById("stosDiameter").value;
  const a = document.getElementById("stosAngle").value;
  const filename = `Stos - D${d} A${a}.pdf`;
  exportToPDF("stosSvgContainer", filename);
});

document.getElementById("exportKona").addEventListener("click", () => {
  const td = document.getElementById("konaTop").value;
  const bd = document.getElementById("konaBottom").value;
  const a = document.getElementById("konaAngle").value;
  const filename = `Kona - Td${td} Bd${bd} A${a}.pdf`;
  exportToPDF("konaSvgContainer", filename);
});

});

// ===== Utilities =====
function degToRad(d) { return d * Math.PI / 180; }

// ===== STOS (Half Pattern, Fixed Bounds) =====
function generateStosSVG(diameter, angleDeg) {
  const R = diameter / 2;
  const angle = degToRad(angleDeg);

  // Vertical difference between lowest and highest cut point
  const rise = R * Math.tan(angle);

  // Curve offset for drawing
  const baseHeight = rise + 30;

  // Bounding box height includes: bottom margin (rise) + curve span (rise) + top extension (30)
  const rectHeight = 2 * rise + 30;
  const rectWidth = Math.PI * R; // half circumference

  // Points for curve (half pattern, 6 divisions)
  const N = 6;
  let pts = [];
  for (let i = 0; i <= N; i++) {
    const phi = Math.PI * i / N;
    const x = (rectWidth / N) * i;
    const y = baseHeight - rise * Math.cos(phi); // lifted curve
    pts.push([x, y]);
  }

  // Build curve path
  const path = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(" ");

  // ViewBox
  const svgWidth = rectWidth + 40;
  const svgHeight = rectHeight + 40;

  return `
<svg xmlns="http://www.w3.org/2000/svg"
     viewBox="-20 -20 ${svgWidth} ${svgHeight}"
     width="100%" height="100%" preserveAspectRatio="xMidYMid meet">

  <!-- Bounding box -->
  <rect x="0" y="0" width="${rectWidth.toFixed(2)}" height="${rectHeight.toFixed(2)}"
        fill="none" stroke="#000" stroke-dasharray="4 2" stroke-width="0.4"/>

  <!-- Curve -->
  <path d="${path}" stroke="red" fill="none" stroke-width="0.6"/>

  <!-- Generators -->
  ${pts.map(p => `<line x1="${p[0].toFixed(2)}" y1="${p[1].toFixed(2)}" x2="${p[0].toFixed(2)}" y2="${rectHeight.toFixed(2)}"
        stroke="#888" stroke-width="0.3" stroke-dasharray="2 2"/>`).join("")}

  <!-- Labels -->
  <text x="${rectWidth/2}" y="${rectHeight + 15}" font-size="6" text-anchor="middle">
    ${rectWidth.toFixed(1)} mm
  </text>
  <text x="${rectWidth + 5}" y="${rectHeight/2}" font-size="6" text-anchor="start" dominant-baseline="middle"
        transform="rotate(90, ${rectWidth + 5}, ${rectHeight/2})">
    ${rectHeight.toFixed(1)} mm
  </text>
  <text x="${rectWidth/2}" y="-5" font-size="6" text-anchor="middle">
    Stos — D ${diameter} mm, A ${angleDeg}°
  </text>
</svg>`;
}



// ===== KONA (placeholder for now) =====
function generateKonaSVG(topD, botD, angleDeg) {
  const N = 6;
  const Rt = topD / 2;
  const Rb = botD / 2;
  const T  = Math.tan(degToRad(angleDeg));
  const dR = Rb - Rt;

  const a = 30 * T;
  const b = T * (2 * Rb - dR) + 30;
  const c = -dR;
  const disc = b*b - 4*a*c;
  if (disc < 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 40">
      <text x="100" y="25" text-anchor="middle" font-size="10" fill="red">Invalid inputs</text>
    </svg>`;
  }
  const k = (-b + Math.sqrt(disc)) / (2*a);

  const zApex = Rb / k;
  const zMax  = (2 * T * Rb) / (1 + T * k);
  const zTop  = zMax + 30;

  const zAt = (theta) => (T * Rb * (1 - Math.cos(theta))) / (1 - T * k * Math.cos(theta));

  const pts3D = [];
  const sOuter = [];
  for (let i = 0; i <= N; i++) {
    const th = Math.PI * i / N;
    const z  = zAt(th);
    const r  = Rb - k * z;
    const x  = r * Math.cos(th);
    const y  = r * Math.sin(th);
    const s  = Math.sqrt(r*r + (zApex - z)*(zApex - z));
    pts3D.push({x, y, z});
    sOuter.push(s);
  }

  const sInner = Math.sqrt(Rt*Rt + (zApex - zTop)*(zApex - zTop));

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const betas = [0];
  for (let i = 1; i <= N; i++) {
    const aS = sOuter[i-1];
    const bS = sOuter[i];
    const dx = pts3D[i].x - pts3D[i-1].x;
    const dy = pts3D[i].y - pts3D[i-1].y;
    const dz = pts3D[i].z - pts3D[i-1].z;
    const cEdge = Math.hypot(dx, dy, dz);
    const cosG = clamp((aS*aS + bS*bS - cEdge*cEdge) / (2*aS*bS), -1, 1);
    const gamma = Math.acos(cosG);
    betas.push(betas[i-1] + gamma);
  }

  // rotate so pattern is centered horizontally
  const totalAngle = betas[N];
  const rotateOffset = -totalAngle/2;

  const inner2D = betas.map(beta => {
    const ang = beta + rotateOffset;
    return { x: sInner * Math.cos(ang), y: sInner * Math.sin(ang) };
  });
  const outer2D = betas.map((beta, i) => {
    const ang = beta + rotateOffset;
    return { x: sOuter[i] * Math.cos(ang), y: sOuter[i] * Math.sin(ang) };
  });

  const pathFrom = (pts) => `M ${pts.map(p => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" L ")}`;

  const allPts = inner2D.concat(outer2D);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of allPts) { if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x; if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y; }
const pad = 10;
const descOffset = 20; // space for description text
const vbX = (minX - pad).toFixed(2);
const vbY = (minY - pad).toFixed(2);
const vbW = (maxX - minX + 2*pad).toFixed(2);
const vbH = (maxY - minY + pad + descOffset).toFixed(2);

  // Arc length labels
// Arc length labels (true distances in flat pattern)
const labels = [];
for (let i = 0; i < N; i++) {
  // true inner segment length
  const dx1 = inner2D[i+1].x - inner2D[i].x;
  const dy1 = inner2D[i+1].y - inner2D[i].y;
  const innerLen = Math.hypot(dx1, dy1).toFixed(1);

  // true outer segment length
  const dx2 = outer2D[i+1].x - outer2D[i].x;
  const dy2 = outer2D[i+1].y - outer2D[i].y;
  const outerLen = Math.hypot(dx2, dy2).toFixed(1);

  // place label halfway between arcs at mid-angle
  const midX = (inner2D[i].x + inner2D[i+1].x + outer2D[i].x + outer2D[i+1].x) / 4;
  const midY = (inner2D[i].y + inner2D[i+1].y + outer2D[i].y + outer2D[i+1].y) / 4;

  labels.push(
    `<text x="${midX.toFixed(2)}" y="${midY.toFixed(2)}" font-size="5" text-anchor="middle">${innerLen}/${outerLen}</text>`
  );
}



  // Description placed *below* shape
  const descX = (minX+maxX)/2;
  const descY = maxY + 15;

  return `
<svg xmlns="http://www.w3.org/2000/svg"
     viewBox="${vbX} ${vbY} ${vbW} ${vbH}"
     preserveAspectRatio="xMidYMid meet"
     style="max-width:100%; max-height:100%; display:block; margin:auto;">
  <path d="${pathFrom(inner2D)}" fill="none" stroke="#c00" stroke-width="0.6"/>
  <path d="${pathFrom(outer2D)}" fill="none" stroke="#06c" stroke-width="0.6"/>
  <g stroke="#999" stroke-width="0.3" stroke-dasharray="3 2">
    ${inner2D.map((p, i) => `<line x1="${p.x.toFixed(2)}" y1="${p.y.toFixed(2)}" x2="${outer2D[i].x.toFixed(2)}" y2="${outer2D[i].y.toFixed(2)}"/>`).join("\n    ")}
  </g>
  ${labels.join("\n")}
     <text x="${((minX + maxX) / 2).toFixed(2)}"
        y="${(maxY + 12).toFixed(2)}"
        font-size="6"
        text-anchor="middle">
    KONA — Top Ø ${topD} mm • Bottom Ø ${botD} mm • Angle ${angleDeg}°
  </text>
</svg>`;
}




// ===== Export to PDF =====
async function exportToPDF(containerId, filename) {
  const { jsPDF } = window.jspdf;
  const svgElement = document.querySelector(`#${containerId} svg`);
  if (!svgElement) {
    alert("No pattern generated yet!");
    return;
  }

  // Extract dimensions from SVG viewBox
  const viewBox = svgElement.getAttribute("viewBox").split(" ").map(parseFloat);
  const svgWidth = viewBox[2];
  const svgHeight = viewBox[3];

  // A4 dimensions in mm
  const a4w = 210;
  const a4h = 297;
  const margin = 10; // mm white space

  // Choose orientation that minimizes pages
  let orientation = "p"; // portrait
  let pageWidth = a4w - 2 * margin;
  let pageHeight = a4h - 2 * margin;
  if (svgWidth > svgHeight) {
    orientation = "l";
    pageWidth = a4h - 2 * margin;
    pageHeight = a4w - 2 * margin;
  }

  const pdf = new jsPDF(orientation, "mm", "a4");

  const cols = Math.ceil(svgWidth / pageWidth);
  const rows = Math.ceil(svgHeight / pageHeight);

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (!(row === 0 && col === 0)) pdf.addPage();

      const offsetX = margin - col * pageWidth;
      const offsetY = margin - row * pageHeight;

      await pdf.svg(svgElement, {
        x: offsetX,
        y: offsetY,
        width: svgWidth,
        height: svgHeight
      });
    }
  }

  pdf.save(filename);
}





