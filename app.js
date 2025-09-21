(function () {
  "use strict";

  const mmToPt = (mm) => (mm * 72) / 25.4;
  const A4 = { wMm: 210, hMm: 297, marginMm: 5 };
  const $ = (id) => document.getElementById(id);

function getLibs() {
  const jsPDF = window.jspdf?.jsPDF || window.jsPDF;

  let svg2pdf = window.svg2pdf || window.SVG2PDF;

  // Handle different bundle shapes
  if (svg2pdf && typeof svg2pdf !== "function") {
    if (typeof svg2pdf.default === "function") {
      svg2pdf = svg2pdf.default;
    } else if (typeof svg2pdf.svg2pdf === "function") {
      svg2pdf = svg2pdf.svg2pdf;   // ✅ your current bundle
    } else {
      console.warn("svg2pdf global is not a function:", svg2pdf);
      svg2pdf = null;
    }
  }

  console.log("DEBUG libs (final):", { jsPDF, svg2pdf });

  if (!jsPDF || !svg2pdf) {
    alert("PDF-export misslyckades: jsPDF/svg2pdf inte hittad.");
    throw new Error("Libraries not found");
  }
  return { jsPDF, svg2pdf };
}



  function exportSVG(previewId, filename) {
    const svg = document.querySelector(`#${previewId} svg`);
    if (!svg) { alert("Ingen SVG att exportera."); return; }
    const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename.endsWith(".svg") ? filename : filename + ".svg";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function exportMultiPagePDF(previewId, filenameBase) {
    const { jsPDF, svg2pdf } = getLibs();
    const svg = document.querySelector(`#${previewId} svg`);
    if (!svg) { alert("Ingen SVG att exportera."); return; }

    const widthMm = parseFloat(svg.getAttribute("width").replace("mm", ""));
    const heightMm = parseFloat(svg.getAttribute("height").replace("mm", ""));

    const pageW = A4.wMm - 2 * A4.marginMm;
    const pageH = A4.hMm - 2 * A4.marginMm;
    const cols = Math.ceil(widthMm / pageW);
    const rows = Math.ceil(heightMm / pageH);

    const pdf = new jsPDF({ unit: "pt", format: "a4", orientation: pageW >= pageH ? "landscape" : "portrait" });
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
        const body = originalBody.cloneNode(true); // ✅ clone to avoid HierarchyRequestError
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

  function printSVG(previewId) {
    const svg = document.querySelector(`#${previewId} svg`);
    if (!svg) { alert("Ingen SVG att skriva ut."); return; }
    const win = window.open("", "_blank");
    win.document.write(`<!doctype html><title>Skriv ut</title><style>html,body{margin:0;padding:0} svg{width:210mm;height:auto}</style>`);
    win.document.body.appendChild(svg.cloneNode(true));
    win.document.close(); win.focus(); win.print();
  }

  function hookExport(previewId, svgBtnId, pdfBtnId, printBtnId, baseName) {
    $(svgBtnId).onclick = () => exportSVG(previewId, baseName + ".svg");
    $(pdfBtnId).onclick = () => exportMultiPagePDF(previewId, baseName);
    $(printBtnId).onclick = () => printSVG(previewId);
  }

  // --- STOS ---
  $("stosForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const D = parseFloat($("stosDiameter").value);
    const Hmin = parseFloat($("stosHeight").value);
    const slopeDeg = parseFloat($("stosSlope").value);
    if (isNaN(D) || isNaN(Hmin) || isNaN(slopeDeg)) return;
    const R = D/2, alpha = slopeDeg*Math.PI/180;
    const L = Math.PI*D/2, A = R*Math.tan(alpha), Hs = 2*A;
    const N=400, pts=[];
    for(let i=0;i<=N;i++){ const t=Math.PI*i/N; const x=L*t/Math.PI; const y=A*(1+Math.cos(t)); pts.push([x,y]); }
    const poly=pts.map(([x,y])=>`${x.toFixed(2)},${(Hs-y).toFixed(2)}`).join(' ');
    let svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${L}mm" height="${Hs}mm" viewBox="0 0 ${L} ${Hs}" shape-rendering="geometricPrecision">`;
    svg+=`<rect x="0" y="0" width="${L}" height="${Hs}" fill="none" stroke="black" stroke-width="0.4"/>`;
    svg+=`<polyline points="${poly}" fill="none" stroke="black" stroke-width="0.4"/>`;
    svg+=`<text x="${L/2}" y="5" font-size="5" text-anchor="middle">${L.toFixed(1)} mm</text>`;
    svg+=`<text x="5" y="${Hs/2}" font-size="5" text-anchor="middle" transform="rotate(-90 5,${Hs/2})">${Hs.toFixed(1)} mm</text>`;
    svg+=`</svg>`;
    $("stosPreview").innerHTML=svg;
    $("stosMeta").textContent=`Bredd (omkrets/2) = ${L.toFixed(1)} mm · Skärningshöjd = ${Hs.toFixed(1)} mm · H(min) = ${Hmin.toFixed(1)} mm`;
    $("stosResult").style.display='block';
    hookExport("stosPreview","stosSvg","stosPdf","stosPrint","stos_halvmonster");
  });

  // --- KONA ---
  let currentRot=0;
  $("konaForm").addEventListener("submit", e=>{
    e.preventDefault();
    const topD=parseFloat($("konaTop").value), botD=parseFloat($("konaBottom").value), slopeDeg=parseFloat($("konaSlope").value);
    if(isNaN(topD)||isNaN(botD)||isNaN(slopeDeg)) return;
    const best=findBestRotation(topD,botD,slopeDeg);
    currentRot=best; $("konaRotSlider").value=currentRot; $("konaRotInput").value=currentRot;
    renderKona(topD,botD,slopeDeg,currentRot);
  });
  $("konaRotSlider").addEventListener("input", e=>{currentRot=parseInt(e.target.value);$("konaRotInput").value=currentRot;rerenderIfInputs();});
  $("konaRotInput").addEventListener("input", e=>{currentRot=parseInt(e.target.value);$("konaRotSlider").value=currentRot;rerenderIfInputs();});
  function rerenderIfInputs(){const t=parseFloat($("konaTop").value),b=parseFloat($("konaBottom").value),s=parseFloat($("konaSlope").value);if(!isNaN(t)&&!isNaN(b)&&!isNaN(s)) renderKona(t,b,s,currentRot);}
  function findBestRotation(topD,botD,slopeDeg){let bestAngle=0,bestScore=-Infinity;for(let ang=0;ang<180;ang+=5){const box=computeKonaBBox(topD,botD,slopeDeg,ang);const m=10;const fitP=Math.min((210-2*m)/box.w,(297-2*m)/box.h);const fitL=Math.min((297-2*m)/box.w,(210-2*m)/box.h);const score=Math.max(fitP,fitL);if(score>bestScore){bestScore=score;bestAngle=ang;}}return bestAngle;}
  function computeKonaBBox(topD,botD,slopeDeg,rot){const pts=generateKonaPoints(topD,botD,slopeDeg,rot);let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;pts.inner.concat(pts.outer).concat(pts.gens.flat()).forEach(([x,y])=>{if(x<minX)minX=x;if(y<minY)minY=y;if(x>maxX)maxX=x;if(y>maxY)maxY=y;});return {w:maxX-minX,h:maxY-minY};}
  function generateKonaPoints(topD,botD,slopeDeg,rotDeg){const Hmin=30,N=12;const R1=botD/2,R2=topD/2,dR=R1-R2;const alpha=slopeDeg*Math.PI/180,tan_a=Math.tan(alpha);function r_of_y(y){return R2+(dR/Hmin)*y;}const beta=tan_a*(dR/Hmin);const y0=Hmin*(1+beta)+tan_a*R2;function y_bottom(c){return (y0+tan_a*R2*c)/(1-beta*c);}const phi=Array.from({length:N},(_,i)=>2*Math.PI*i/N);const cphi=phi.map(p=>Math.cos(p));const y_btm=cphi.map(c=>y_bottom(c));const r_btm=y_btm.map(y=>r_of_y(y));const slant_diff=Math.sqrt(dR*dR+Hmin*Hmin);const k=slant_diff/dR;const S_top=k*R2,S_btm=r_btm.map(r=>k*r);const theta_total=2*Math.PI*(R1/(k*R1));const dtheta=theta_total/N;const thetas=Array.from({length:N},(_,i)=>i*dtheta);const sel=[0,1,2,3,4,5,6];const inner=sel.map(i=>[S_top*Math.cos(thetas[i]),S_top*Math.sin(thetas[i])]);const outer=sel.map(i=>[S_btm[i]*Math.cos(thetas[i]),S_btm[i]*Math.sin(thetas[i])]);const ang=rotDeg*Math.PI/180;const rot=([x,y])=>[x*Math.cos(ang)-y*Math.sin(ang),x*Math.sin(ang)+y*Math.cos(ang)];const innerR=inner.map(rot),outerR=outer.map(rot);const gens=innerR.map((p,i)=>[p,outerR[i]]);return {inner:innerR,outer:outerR,gens,sel};}
  function renderKona(topD,botD,slopeDeg,rot){const pts=generateKonaPoints(topD,botD,slopeDeg,rot);const gens=pts.gens;let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;pts.inner.concat(pts.outer).concat(gens.flat()).forEach(([x,y])=>{if(x<minX)minX=x;if(y<minY)minY=y;if(x>maxX)maxX=x;if(y>maxY)maxY=y;});const m=10;minX-=m;minY-=m;maxX+=m;maxY+=m;const width=maxX-minX,height=maxY-minY;const pl=arr=>arr.map(([x,y])=>`${(x-minX).toFixed(2)},${(y-minY).toFixed(2)}`).join(' ');let svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}mm" height="${height}mm" viewBox="0 0 ${width} ${height}" shape-rendering="geometricPrecision">`;svg+=`<polyline points="${pl(pts.inner)}" fill="none" stroke="black" stroke-width="0.4"/>`;svg+=`<polyline points="${pl(pts.outer)}" fill="none" stroke="black" stroke-width="0.4"/>`;gens.forEach(seg=>{svg+=`<line x1="${(seg[0][0]-minX).toFixed(2)}" y1="${(seg[0][1]-minY).toFixed(2)}" x2="${(seg[1][0]-minX).toFixed(2)}" y2="${(seg[1][1]-minY).toFixed(2)}" stroke="black" stroke-width="0.3"/>`;});svg+=`</svg>`;$("konaPreview").innerHTML=svg;$("konaMeta").textContent=`Rotation: ${rot}° (auto/manuell)`;$("konaResult").style.display='block';hookExport("konaPreview","konaSvg","konaPdf","konaPrint","kona_halvmonster");}
})();
