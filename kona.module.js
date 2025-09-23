(function(){
  "use strict";
  if (window.KONA_WIRED) return; // avoid double-binding if app.js already wired
  window.KONA_WIRED = true;

  const $ = (id) => document.getElementById(id);
  const A4 = { wMm: 210, hMm: 297, marginMm: 5 };

  function getLibs() {
    const { jsPDF } = window.jspdf || {};
    let s = null;
    if (typeof window.svg2pdf === "function") s = window.svg2pdf;
    else if (window.svg2pdf && typeof window.svg2pdf.svg2pdf === "function") s = window.svg2pdf.svg2pdf;
    else if (typeof window.SVG2PDF === "function") s = window.SVG2PDF;
    return { jsPDF, svg2pdf: s };
  }

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
    const zAt = (th) => { const c = Math.cos(th); return (T * R1 * (1 - c)) / (1 - T * k * c); };
    const pts3D = thetas.map((th) => { const z = zAt(th); const r = R1 - k * z; return { z, r, x: r * Math.cos(th), y: r * Math.sin(th) }; });
    const Rb = pts3D.map((p) => (zApex - p.z) * sF);
    const chords = [];
    for (let i=0;i<segments;i++){ const p=pts3D[i], q=pts3D[i+1]; chords.push(Math.hypot(p.x-q.x,p.y-q.y,p.z-q.z)); }
    const betas=[0];
    for (let i=0;i<segments;i++){ const a=Rb[i], b=Rb[i+1], c=chords[i]; const cosPhi = Math.max(-1, Math.min(1, (a*a+b*b-c*c)/(2*a*b))); betas.push(betas[i]+Math.acos(cosPhi)); }
    const ang=(rotDeg*Math.PI)/180, rot=([x,y])=>[x*Math.cos(ang)-y*Math.sin(ang), x*Math.sin(ang)+y*Math.cos(ang)];
    const outer = betas.map((b,i)=>rot([Rb[i]*Math.cos(b), Rb[i]*Math.sin(b)]));
    const inner = betas.map((b)=>rot([Rin*Math.cos(b), Rin*Math.sin(b)]));
    return { inner, outer };
  }

  function computeBBox(inner, outer){
    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    for(const [x,y] of inner.concat(outer)){ if(x<minX)minX=x; if(y<minY)minY=y; if(x>maxX)maxX=x; if(y>maxY)maxY=y; }
    return {minX,minY,maxX,maxY,w:maxX-minX,h:maxY-minY};
  }

  function findBestRotation(topD, botD, angleDeg){
    let best=0,bestScore=-Infinity;
    for(let rot=0;rot<180;rot+=5){
      const {inner,outer}=computeKonaTriangulation(topD,botD,angleDeg,6,30,rot);
      const {w,h}=computeBBox(inner,outer);
      const pageW=A4.wMm-2*A4.marginMm, pageH=A4.hMm-2*A4.marginMm;
      const fitP=Math.min(pageW/w,pageH/h), fitL=Math.min(pageH/w,pageW/h);
      const score=Math.max(fitP,fitL);
      if(score>bestScore){bestScore=score;best=rot;}
    }
    return best;
  }

  function renderKona(topD, botD, angleDeg){
    const rot=findBestRotation(topD,botD,angleDeg);
    const {inner,outer}=computeKonaTriangulation(topD,botD,angleDeg,6,30,rot);
    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    for(const [x,y] of inner.concat(outer)){ if(x<minX)minX=x; if(y<minY)minY=y; if(x>maxX)maxX=x; if(y>maxY)maxY=y; }
    const pad=10, dx=-minX+pad, dy=-minY+pad, w=(maxX-minX)+2*pad, h=(maxY-minY)+2*pad;
    const fmt=(x,y)=>`${(x+dx).toFixed(2)},${(y+dy).toFixed(2)}`;
    const polyOuter=outer.map(([x,y])=>fmt(x,y)).join(" ");
    const polyInner=inner.map(([x,y])=>fmt(x,y)).join(" ");
    let svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${w.toFixed(2)}mm" height="${h.toFixed(2)}mm" viewBox="0 0 ${w.toFixed(2)} ${h.toFixed(2)}" shape-rendering="geometricPrecision" font-size="4">`;
    svg+=`<polyline points="${polyOuter}" fill="none" stroke="black" stroke-width="0.35"/>`;
    svg+=`<polyline points="${polyInner}" fill="none" stroke="black" stroke-width="0.35"/>`;
    // generators
    for(let i=0;i<inner.length;i++){
      const xi=inner[i][0]+dx, yi=inner[i][1]+dy;
      const xo=outer[i][0]+dx, yo=outer[i][1]+dy;
      svg+=`<line x1="${xi.toFixed(2)}" y1="${yi.toFixed(2)}" x2="${xo.toFixed(2)}" y2="${yo.toFixed(2)}" stroke="black" stroke-width="0.35"/>`;
    }
    // labels inside wedges
    function mid(ax,ay,bx,by){return[(ax+bx)/2,(ay+by)/2]}
    function interp(ax,ay,bx,by,t){return[ax+(bx-ax)*t, ay+(by-ay)*t]}
    for(let i=0;i<inner.length-1;i++){
      const xi1=inner[i][0]+dx, yi1=inner[i][1]+dy, xi2=inner[i+1][0]+dx, yi2=inner[i+1][1]+dy;
      const xo1=outer[i][0]+dx, yo1=outer[i][1]+dy, xo2=outer[i+1][0]+dx, yo2=outer[i+1][1]+dy;
      const li=Math.hypot(xi2-xi1, yi2-yi1), lo=Math.hypot(xo2-xo1, yo2-yo1);
      const [mix,miy]=mid(xi1,yi1,xi2,yi2), [mox,moy]=mid(xo1,yo1,xo2,yo2);
      const [pinx,piny]=interp(mix,miy,mox,moy,0.35), [poutx,pouty]=interp(mix,miy,mox,moy,0.65);
      svg+=`<text x="${pinx.toFixed(2)}" y="${piny.toFixed(2)}" fill="blue" text-anchor="middle" dominant-baseline="middle">${li.toFixed(1)}</text>`;
      svg+=`<text x="${poutx.toFixed(2)}" y="${pouty.toFixed(2)}" fill="red" text-anchor="middle" dominant-baseline="middle">${lo.toFixed(1)}</text>`;
    }
    svg+=`</svg>`;
    const prev=$("konaPreview"); if(prev) prev.innerHTML=svg;
    const meta=$("konaMeta"); if(meta) meta.textContent=`Kona (auto rotation ${rot}°): ToppØ=${topD} mm, BottenØ=${botD} mm, Vinkel=${angleDeg}°`;
    const res=$("konaResult"); if(res) res.style.display="block";
  }

  function exportKonaPDF(){
    const { jsPDF, svg2pdf } = getLibs();
    const svg = document.querySelector("#konaPreview svg");
    if (!jsPDF || !svg2pdf || !svg) return alert("PDF-export saknar jsPDF/svg2pdf.");
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const margin = A4.marginMm;
    return svg2pdf(svg, doc, { x: margin, y: margin, width: A4.wMm - 2*margin, height: A4.hMm - 2*margin, useCSS: true })
      .then(()=>doc.save("kona.pdf"));
  }

  function wire(){
    const form=$("konaForm");
    if(!form) return;
    form.addEventListener("submit",(e)=>{
      e.preventDefault();
      const topD=parseFloat($("konaTop").value);
      const botD=parseFloat($("konaBottom").value);
      const slope=parseFloat($("konaSlope").value);
      if(isNaN(topD)||isNaN(botD)||isNaN(slope)) return;
      renderKona(topD,botD,slope);
    });
    const btnPdf=$("konaPdf"); if(btnPdf) btnPdf.addEventListener("click", exportKonaPDF);
    const btnSvg=$("konaSvg"); if(btnSvg) btnSvg.addEventListener("click", ()=>{
      const svg = document.querySelector("#konaPreview svg"); if(!svg) return;
      const blob=new Blob([svg.outerHTML],{type:"image/svg+xml"});
      const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download="kona.svg"; a.click(); URL.revokeObjectURL(url);
    });
  }

  document.addEventListener("DOMContentLoaded", wire);
})();
