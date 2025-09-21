
/* ---------------- Tabs ---------------- */
document.querySelectorAll('.tab-btn').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
    document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-'+btn.dataset.tab).classList.add('active');
  });
});

/* ---------------- STOS (half pattern, precise box) ---------------- */
document.getElementById('stosForm').addEventListener('submit', e=>{
  e.preventDefault();
  const D = parseFloat(document.getElementById('stosDiameter').value);
  const Hmin = parseFloat(document.getElementById('stosHeight').value);
  const slopeDeg = parseFloat(document.getElementById('stosSlope').value);
  if(isNaN(D)||isNaN(Hmin)||isNaN(slopeDeg)) return;

  const R=D/2, alpha=slopeDeg*Math.PI/180;
  const L = Math.PI*D/2;       // half circumference
  const A = R*Math.tan(alpha); // amplitude
  const Hs = 2*A;              // skärningshöjd

  // Curve remapped to fit exactly within box [0..L] × [0..Hs]
  const N=400, pts=[];
  for(let i=0;i<=N;i++){
    const t=Math.PI*i/N; // 0..π
    const x=L*t/Math.PI;
    const y=A*(1+Math.cos(t)); // 0..2A
    pts.push([x,y]);
  }
  const poly=pts.map(([x,y])=>`${x.toFixed(2)},${(Hs-y).toFixed(2)}`).join(' ');
  let svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${L}mm" height="${Hs}mm" viewBox="0 0 ${L} ${Hs}" shape-rendering="geometricPrecision">`;
  svg+=`<rect x="0" y="0" width="${L}" height="${Hs}" fill="none" stroke="black" stroke-width="0.4"/>`;
  svg+=`<polyline points="${poly}" fill="none" stroke="black" stroke-width="0.4"/>`;
  // inside labels (centered)
  svg+=`<text x="${L/2}" y="5" font-size="5" text-anchor="middle">${L.toFixed(1)} mm</text>`;
  svg+=`<text x="5" y="${Hs/2}" font-size="5" text-anchor="middle" transform="rotate(-90 5,${Hs/2})">${Hs.toFixed(1)} mm</text>`;
  svg+=`</svg>`;

  document.getElementById('stosPreview').innerHTML=svg;
  document.getElementById('stosMeta').textContent=`Bredd (omkrets/2) = ${L.toFixed(1)} mm · Skärningshöjd = ${Hs.toFixed(1)} mm · H(min) = ${Hmin.toFixed(1)} mm`;
  document.getElementById('stosResult').style.display='block';

  hookExport('stosPreview','stosSvg','stosPdf','stosPrint','stos_halvmonster');
});

/* ---------------- KONA (half pattern, auto-rotate + manual) ---------------- */
let currentRot=0;
document.getElementById('konaForm').addEventListener('submit', e=>{
  e.preventDefault();
  const topD=parseFloat(document.getElementById('konaTop').value);
  const botD=parseFloat(document.getElementById('konaBottom').value);
  const slopeDeg=parseFloat(document.getElementById('konaSlope').value);
  if(isNaN(topD)||isNaN(botD)||isNaN(slopeDeg)) return;
  const best=findBestRotation(topD,botD,slopeDeg);
  currentRot=best;
  document.getElementById('konaRotSlider').value=currentRot;
  document.getElementById('konaRotInput').value=currentRot;
  renderKona(topD,botD,slopeDeg,currentRot);
});
document.getElementById('konaRotSlider').addEventListener('input', e=>{
  currentRot=parseInt(e.target.value);
  document.getElementById('konaRotInput').value=currentRot;
  rerenderIfInputs();
});
document.getElementById('konaRotInput').addEventListener('input', e=>{
  currentRot=parseInt(e.target.value);
  document.getElementById('konaRotSlider').value=currentRot;
  rerenderIfInputs();
});
function rerenderIfInputs(){
  const topD=parseFloat(document.getElementById('konaTop').value);
  const botD=parseFloat(document.getElementById('konaBottom').value);
  const slopeDeg=parseFloat(document.getElementById('konaSlope').value);
  if(!isNaN(topD)&&!isNaN(botD)&&!isNaN(slopeDeg)) renderKona(topD,botD,slopeDeg,currentRot);
}
function findBestRotation(topD,botD,slopeDeg){
  let bestAngle=0,bestScore=-Infinity;
  for(let ang=0; ang<180; ang+=5){
    const box=computeKonaBBox(topD,botD,slopeDeg,ang);
    const m=10;
    const fitP=Math.min((210-2*m)/box.w,(297-2*m)/box.h);
    const fitL=Math.min((297-2*m)/box.w,(210-2*m)/box.h);
    const score=Math.max(fitP,fitL);
    if(score>bestScore){bestScore=score;bestAngle=ang;}
  }
  return bestAngle;
}
function computeKonaBBox(topD,botD,slopeDeg,rot){
  const pts=generateKonaPoints(topD,botD,slopeDeg,rot);
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  const all=pts.inner.concat(pts.outer).concat(pts.gens.flat());
  all.forEach(([x,y])=>{ if(x<minX)minX=x; if(y<minY)minY=y; if(x>maxX)maxX=x; if(y>maxY)maxY=y; });
  return {w:maxX-minX,h:maxY-minY};
}
function generateKonaPoints(topD,botD,slopeDeg,rotDeg){
  const Hmin=30,N=12;
  const R1=botD/2,R2=topD/2,dR=R1-R2;
  const alpha=slopeDeg*Math.PI/180,tan_a=Math.tan(alpha);
  function r_of_y(y){return R2+(dR/Hmin)*y;}
  const beta=tan_a*(dR/Hmin);
  const y0=Hmin*(1+beta)+tan_a*R2;
  function y_bottom(c){return (y0+tan_a*R2*c)/(1-beta*c);}
  const phi=Array.from({length:N},(_,i)=>2*Math.PI*i/N);
  const cphi=phi.map(p=>Math.cos(p));
  const y_btm=cphi.map(c=>y_bottom(c));
  const r_btm=y_btm.map(y=>r_of_y(y));
  const slant_diff=Math.sqrt(dR*dR+Hmin*Hmin);
  const k=slant_diff/dR;
  const S_top=k*R2, S_btm=r_btm.map(r=>k*r);
  const theta_total=2*Math.PI*(R1/(k*R1)); // cancels, but keeps spacing
  const dtheta=theta_total/N;
  const thetas=Array.from({length:N},(_,i)=>i*dtheta);
  const sel=[0,1,2,3,4,5,6];
  const inner=sel.map(i=>[S_top*Math.cos(thetas[i]), S_top*Math.sin(thetas[i])]);
  const outer=sel.map(i=>[S_btm[i]*Math.cos(thetas[i]), S_btm[i]*Math.sin(thetas[i])]);
  const ang=rotDeg*Math.PI/180;
  const rot=([x,y])=>[x*Math.cos(ang)-y*Math.sin(ang), x*Math.sin(ang)+y*Math.cos(ang)];
  const innerR=inner.map(rot), outerR=outer.map(rot);
  const gens=innerR.map((p,i)=>[p,outerR[i]]);
  return {inner:innerR, outer:outerR, gens, sel};
}
function renderKona(topD,botD,slopeDeg,rot){
  const pts=generateKonaPoints(topD,botD,slopeDeg,rot);
  const gens=pts.gens;
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  pts.inner.concat(pts.outer).concat(gens.flat()).forEach(([x,y])=>{
    if(x<minX)minX=x; if(y<minY)minY=y; if(x>maxX)maxX=x; if(y>maxY)maxY=y;
  });
  const m=10; minX-=m; minY-=m; maxX+=m; maxY+=m;
  const width=maxX-minX, height=maxY-minY;
  const pl=arr=>arr.map(([x,y])=>`${(x-minX).toFixed(2)},${(y-minY).toFixed(2)}`).join(' ');
  let svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}mm" height="${height}mm" viewBox="0 0 ${width} ${height}" shape-rendering="geometricPrecision">`;
  svg+=`<polyline points="${pl(pts.inner)}" fill="none" stroke="black" stroke-width="0.4"/>`;
  svg+=`<polyline points="${pl(pts.outer)}" fill="none" stroke="black" stroke-width="0.4"/>`;
  gens.forEach(seg=>{
    svg+=`<line x1="${(seg[0][0]-minX).toFixed(2)}" y1="${(seg[0][1]-minY).toFixed(2)}" x2="${(seg[1][0]-minX).toFixed(2)}" y2="${(seg[1][1]-minY).toFixed(2)}" stroke="black" stroke-width="0.3"/>`;
  });
  for(let i=0;i<pts.sel.length-1;i++){
    const a=pts.inner[i], b=pts.outer[i+1];
    svg+=`<line x1="${(a[0]-minX).toFixed(2)}" y1="${(a[1]-minY).toFixed(2)}" x2="${(b[0]-minX).toFixed(2)}" y2="${(b[1]-minY).toFixed(2)}" stroke="black" stroke-dasharray="2,2" stroke-width="0.3"/>`;
  }
  pts.sel.forEach((s,i)=>{
    const [xi,yi]=pts.inner[i], [xo,yo]=pts.outer[i];
    svg+=`<text x="${(xi-minX).toFixed(2)}" y="${(yi-minY-2).toFixed(2)}" font-size="3" text-anchor="middle">${s}</text>`;
    svg+=`<text x="${(xo-minX).toFixed(2)}" y="${(yo-minY+4).toFixed(2)}" font-size="3" text-anchor="middle">${s}</text>`;
  });
  svg+=`</svg>`;
  document.getElementById('konaPreview').innerHTML=svg;
  document.getElementById('konaMeta').textContent=`Rotation: ${rot}° (auto/manuell)`;
  document.getElementById('konaResult').style.display='block';
  hookExport('konaPreview','konaSvg','konaPdf','konaPrint','kona_halvmonster');
}

/* ---------------- Export helpers (offline) ---------------- */
function hookExport(previewId, svgBtnId, pdfBtnId, printBtnId, baseName){
  const svgEl=document.querySelector(`#${previewId} svg`);
  // SVG
  document.getElementById(svgBtnId).onclick=()=>{
    const blob=new Blob([svgEl.outerHTML],{type:'image/svg+xml'});
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
    a.download=baseName+'.svg'; a.click();
  };
  // PDF (normalize svg2pdf across builds)
  document.getElementById(pdfBtnId).onclick=()=>{
  // Robust detection of jsPDF + svg2pdf across UMD/global builds
  function __getJsPDF(){
    if (window.jspdf && window.jspdf.jsPDF) return window.jspdf.jsPDF;
    if (typeof window.jsPDF === 'function') return window.jsPDF;
    return null;
  }
  function __getSvg2pdf(){
    const s = window.svg2pdf;
    if (typeof s === 'function') return s;
    if (s && typeof s.svg2pdf === 'function') return s.svg2pdf;
    if (s && s.default && typeof s.default === 'function') return s.default;
    return null;
  }

  const JsPDFCtor = __getJsPDF();
  const svg2pdfFn = __getSvg2pdf();   // the only definition

  if(!JsPDFCtor || !svg2pdfFn){
    alert('PDF-export misslyckades: kunde inte hitta jsPDF/svg2pdf.');
    return;
  }
  try{
    const doc = new JsPDFCtor({orientation:'landscape', unit:'mm', format:'a4'});
    Promise.resolve(svg2pdfFn(svgEl, doc, {x:10, y:10}))
      .then(()=>{
        doc.save(baseName + '.pdf');
      })
      .catch(err=>{
        console.error(err);
        alert('PDF-export misslyckades under ritning: ' + (err && err.message ? err.message : 'okänt fel'));
      });
  }catch(err){
    console.error(err);
    alert('PDF-export misslyckades: ' + (err && err.message ? err.message : 'okänt fel'));
  }

    
    if(svg2pdfFn && typeof svg2pdfFn !== 'function' && typeof svg2pdfFn.default==='function'){
      svg2pdfFn = svg2pdfFn.default;
    }
    if(!jsPDF || typeof svg2pdfFn!=='function'){
      alert('PDF-export misslyckades: kunde inte hitta jsPDF/svg2pdf.');
      return;
    }
    const doc=new jsPDF({orientation:'landscape',unit:'mm',format:'a4'});
    svg2pdfFn(svgEl,doc,{x:10,y:10}); doc.save(baseName+'.pdf');
  };
  // Print
  document.getElementById(printBtnId).onclick=()=>{
    const w=window.open('');
    w.document.write('<!doctype html><html><head><title>Print</title></head><body>');
    w.document.write(svgEl.outerHTML);
    w.document.write('</body></html>'); w.document.close(); w.focus(); w.print();
  };
}

function exportMultiPagePDF(previewId, baseName){
  // Debug visibility of UMD globals
  console.log("DEBUG: window.jspdf =", window.jspdf,
              "window.jsPDF =", window.jsPDF,
              "window.svg2pdf =", window.svg2pdf,
              "window.SVG2PDF =", window.SVG2PDF);

  // Resolve jsPDF constructor
  const JsPDFCtor =
      (window.jspdf && window.jspdf.jsPDF) ? window.jspdf.jsPDF :
      (typeof window.jsPDF === "function" ? window.jsPDF : null);

  // Resolve svg2pdf function
  const svg2pdfFn =
      (typeof window.svg2pdf === "function") ? window.svg2pdf :
      (typeof window.SVG2PDF === "function" ? window.SVG2PDF :
      (window.svg2pdf && typeof window.svg2pdf.default === "function" ? window.svg2pdf.default : null));

  if(!JsPDFCtor || !svg2pdfFn){
    alert("PDF-export misslyckades: jsPDF/svg2pdf inte hittad.");
    return;
  }

  const svgEl = document.querySelector('#'+previewId+' svg');
  if(!svgEl){ alert('Ingen SVG att exportera.'); return; }

  // Helpers (inline to avoid dependency on other blocks)
  function __mmFromAttr(attr){
    if(!attr) return null;
    const v=String(attr).trim();
    const n=parseFloat(v);
    if(Number.isNaN(n)) return null;
    if(v.endsWith('mm')) return n;
    if(v.endsWith('cm')) return n*10;
    if(v.endsWith('in')) return n*25.4;
    if(v.endsWith('px')) return n*(25.4/96);
    return n;
  }
  function __getSvgSizeMM(svg){
    let w=__mmFromAttr(svg.getAttribute('width'));
    let h=__mmFromAttr(svg.getAttribute('height'));
    if(w==null || h==null){
      const vb = svg.viewBox && svg.viewBox.baseVal ? svg.viewBox.baseVal : null;
      if(vb){
        if(w==null) w = vb.width;
        if(h==null) h = vb.height;
      }
    }
    if((w==null || h==null) && svg.getBBox){
      try{
        const bb=svg.getBBox();
        if(w==null) w=bb.width;
        if(h==null) h=bb.height;
      }catch(e){}
    }
    return {w: w||210, h: h||297};
  }

  const size=__getSvgSizeMM(svgEl);
  const svgW=size.w, svgH=size.h;

  const A4P = {w:210,h:297};
  const A4L = {w:297,h:210};
  function pagesFor(dim){ return Math.ceil(svgW/dim.w) * Math.ceil(svgH/dim.h); }
  const useLandscape = pagesFor(A4L) < pagesFor(A4P);
  const page = useLandscape ? A4L : A4P;

  const doc=new JsPDFCtor({orientation: useLandscape?'landscape':'portrait', unit:'mm', format:'a4'});

  const cols = Math.ceil(svgW/page.w);
  const rows = Math.ceil(svgH/page.h);

  for(let r=0;r<rows;r++){
    for(let c=0;c<cols;c++){
      if(!(r===0 && c===0)) doc.addPage();
      const xOffset = -c*page.w;
      const yOffset = -r*page.h;
      svg2pdfFn(svgEl, doc, {
        xOffset: xOffset,
        yOffset: yOffset,
        scale: 1,
        preserveAspectRatio: false
      });
    }
  }
  doc.save(baseName+'.pdf');
}
