/* ============================================================
   Colliers Denver Design Studio v5 — App Logic
   ============================================================ */

// ── State ────────────────────────────────────────────────────
const S = {
  docType: 'om', propType: 'industrial', step: 1,
  files: {}, photos: [], projects: JSON.parse(localStorage.getItem('cds_projects')||'[]'),
  brokers: JSON.parse(localStorage.getItem('cds_brokers')||'[]'),
  selectedBrokers: [], tenantRows: 0,
  page: { w: 11, h: 8.5, orientation: 'landscape' },
  design: {
    colors: { primary:'#001a4d', secondary:'#0057b8', accent:'#c8a96e', text:'#1a2332', bg:'#ffffff', rule:'#0057b8' },
    fonts: { heading:'', body:'', number:'' },
    layout: 'classic', analysis: null, mode: 'inspiration',
  },
  narrative: '', extractedFin: null,
  map: { instance: null, token: '', subjectLng: null, subjectLat: null, pins: [], comps: [], radiusSource: null },
   templateLibrary: [], selectedLibraryTemplate: null,
};

// ── Helpers ──────────────────────────────────────────────────
const $  = id => document.getElementById(id);
const fmtNum = n => { const x=parseFloat(n); return isNaN(x)?String(n||''):x.toLocaleString('en-US',{maximumFractionDigits:0}); };
const fmtDollar = n => { const x=parseFloat(n); return (!x||isNaN(x))?null:'$'+x.toLocaleString('en-US',{maximumFractionDigits:0}); };
const spin = () => `<span class="status-spinner"></span>`;
const toast = msg => { const t=document.createElement('div'); t.className='toast'; t.textContent=msg; document.body.appendChild(t); setTimeout(()=>t.remove(),3500); };
const hex2rgba = (hex,a) => { try { const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16); return `rgba(${r},${g},${b},${a})`; } catch(e){return hex;} };

async function readText(file) { return new Promise((res,rej)=>{ const r=new FileReader(); r.onload=e=>res(e.target.result); r.onerror=rej; r.readAsText(file); }); }
async function readDataUrl(file) { return new Promise((res,rej)=>{ const r=new FileReader(); r.onload=e=>res(e.target.result); r.onerror=rej; r.readAsDataURL(file); }); }

async function callClaude(body) {
  const r = await fetch('/api/claude',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const d = await r.json();
  if(!r.ok) throw new Error(d?.error?.message||d?.error||`HTTP ${r.status}`);
  return d;
}

// ── Navigation ───────────────────────────────────────────────
function navigate(page) {
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  const t=$('page-'+page); if(t) t.classList.add('active');
  const n=document.querySelector(`[data-page="${page}"]`); if(n) n.classList.add('active');
  if(page==='dashboard') refreshDashboard();
  if(page==='settings') loadSettings();
  if(page==='brokers') renderBrokerGrid();
  if(page==='template-studio') { tsLoadLibrary(); }
  if(page==='map-generator') initMap();
  window.scrollTo(0,0);
}
document.querySelectorAll('.nav-item:not(.coming-soon)').forEach(item=>{
  item.addEventListener('click',e=>{e.preventDefault();navigate(item.dataset.page);});
});

// ── Steps ────────────────────────────────────────────────────
function goStep(n) {
  document.querySelectorAll('.step-panel').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.step').forEach(s=>{
    const sn=parseInt(s.dataset.step); s.classList.remove('active','completed');
    if(sn===n) s.classList.add('active'); if(sn<n) s.classList.add('completed');
  });
  const panel=$('step-panel-'+n); if(panel) panel.classList.add('active');
  S.step=n; if(n===6) buildReview(); window.scrollTo(0,0);
}

// ── Doc / prop type ──────────────────────────────────────────
function selectDocType(t){ S.docType=t; document.querySelectorAll('.doc-type-card').forEach(c=>c.classList.toggle('active',c.dataset.type===t)); }
function selectPropType(t){ S.propType=t; document.querySelectorAll('.prop-type-btn').forEach(b=>b.classList.toggle('active',b.dataset.ptype===t)); }

// ── Template mode ────────────────────────────────────────────

// ── Page settings ────────────────────────────────────────────
function setOrientation(o) {
  S.page.orientation=o;
  $('btn-landscape').classList.toggle('active',o==='landscape');
  $('btn-portrait').classList.toggle('active',o==='portrait');
  const {w,h}=S.page;
  if(o==='landscape'&&h>w){S.page.w=h;S.page.h=w;}
  if(o==='portrait'&&w>h){S.page.w=h;S.page.h=w;}
  updatePagePreview();
}
function applyPagePreset(val) {
  const cr=$('custom-size-row'); if(val==='custom'){cr.style.display='flex';return;} cr.style.display='none';
  const p=val.split('x').map(Number); S.page.w=p[0]; S.page.h=p[1];
  S.page.orientation=p[0]>=p[1]?'landscape':'portrait';
  $('btn-landscape').classList.toggle('active',S.page.orientation==='landscape');
  $('btn-portrait').classList.toggle('active',S.page.orientation==='portrait');
  updatePagePreview();
}
function updateCustomSize() {
  S.page.w=parseFloat($('custom-width').value)||11; S.page.h=parseFloat($('custom-height').value)||8.5;
  S.page.orientation=S.page.w>=S.page.h?'landscape':'portrait'; updatePagePreview();
}
function updatePagePreview() {
  const r=$('page-preview-rect'),l=$('page-preview-label'); if(!r||!l) return;
  r.style.width=Math.round(S.page.w*38)+'px'; r.style.height=Math.round(S.page.h*38)+'px';
  l.textContent=`${S.page.w}" × ${S.page.h}" ${S.page.orientation}`;
}

// ── Color palette ────────────────────────────────────────────
function syncColorInput(key) {
  const pk=$('color-'+key+'-picker'),tx=$('color-'+key),pv=$('color-preview-'+key);
  if(pk&&tx) tx.value=pk.value; if(pv&&pk) pv.style.background=pk.value;
  if(pk) S.design.colors[key]=pk.value;
}
function syncColorPicker(key) {
  const tx=$('color-'+key),pk=$('color-'+key+'-picker'),pv=$('color-preview-'+key),val=tx?.value;
  if(val&&/^#[0-9a-fA-F]{6}$/.test(val)){if(pk)pk.value=val;if(pv)pv.style.background=val;S.design.colors[key]=val;}
}
function setColor(key,val) {
  if(!val||!/^#[0-9a-fA-F]{6}$/.test(val)) return;
  S.design.colors[key]=val;
  const pk=$('color-'+key+'-picker'),tx=$('color-'+key),pv=$('color-preview-'+key);
  if(pk)pk.value=val; if(tx)tx.value=val; if(pv)pv.style.background=val;
}
function applyPalettePreset(name) {
  const P={colliers:{primary:'#001a4d',secondary:'#0057b8',accent:'#a8d4f5',text:'#0a1628',bg:'#ffffff',rule:'#0057b8'},dark:{primary:'#0f0f0f',secondary:'#c8a96e',accent:'#e8d4a8',text:'#f0ece0',bg:'#1a1a1a',rule:'#c8a96e'},earth:{primary:'#3b2a1a',secondary:'#7a4f2e',accent:'#c8a96e',text:'#2a1e10',bg:'#fdf8f0',rule:'#c8a96e'},slate:{primary:'#1e2d3d',secondary:'#4a7fa5',accent:'#8fb8d4',text:'#1e2d3d',bg:'#f5f8fb',rule:'#4a7fa5'},forest:{primary:'#1a3a2a',secondary:'#2d6e4e',accent:'#7ab894',text:'#1a3a2a',bg:'#f5faf7',rule:'#2d6e4e'},clear:{primary:'#001a4d',secondary:'#0057b8',accent:'#c8a96e',text:'#1a2332',bg:'#ffffff',rule:'#0057b8'}};
  const p=P[name]; if(!p) return; Object.entries(p).forEach(([k,v])=>setColor(k,v));
}

// Pre-built named design templates — full design system in one click
function applyPresetTemplate(name) {
  // Clear any previous preset selection
  document.querySelectorAll('.preset-tmpl').forEach(el=>el.classList.remove('active'));
  const el=document.querySelector(`[data-preset="${name}"]`);
  if(el) el.classList.add('active');

  // Clear any previously loaded template analysis so preset takes full effect
  S.design.analysis=null;
  S.design.cssOverrides=null;

  const presets = {
    'colliers-classic': {
      colors:{primary:'#001a4d',secondary:'#0057b8',accent:'#c8a96e',text:'#0a1628',bg:'#ffffff',rule:'#0057b8'},
      fonts:{heading:'Playfair Display',body:'Inter',number:'Playfair Display'},
      layout:'classic',
      analysis:{
        accentElements:{usesFullBleedPhotos:true,usesSidebarPanels:true,usesLargeStatCards:true,usesPullQuotes:true,usesDecorativeBars:true,cornerRadiusPx:4,photoStyle:'full-bleed',headerStyle:'dark-overlay',sectionDividerStyle:'colored-rule',statCardStyle:'dark-filled'},
        coverPage:{photoTreatment:'full-bleed-dark-overlay',photoOpacity:0.55,accentBarThicknessPx:5},
        typography:{bodyFontSizePt:10.5,headingFontSizePt:22,headingWeight:'500',useAllCapsEyebrows:true,lineHeightBody:1.7},
        designLanguage:{density:'balanced',formality:'professional',photoEmphasis:'balanced',typographyContrast:'high'},
        cssVariables:{pagePaddingTopIn:0.45,pagePaddingRightIn:0.5,pagePaddingBottomIn:0.45,pagePaddingLeftIn:0.5,lineHeightBody:1.7,tableRowHeightPt:20},
        aesthetic:'Classic professional CRE branding with navy, gold accents, and sidebar layout',
      },
    },
    'dark-luxury': {
      colors:{primary:'#0f0f0f',secondary:'#c8a96e',accent:'#e8d4a8',text:'#f0ece0',bg:'#1a1a1a',rule:'#c8a96e'},
      fonts:{heading:'Cormorant Garamond',body:'Lato',number:'Cormorant Garamond'},
      layout:'editorial',
      analysis:{
        accentElements:{usesFullBleedPhotos:true,usesSidebarPanels:false,usesLargeStatCards:true,usesPullQuotes:true,usesDecorativeBars:true,cornerRadiusPx:0,photoStyle:'full-bleed',headerStyle:'dark-overlay',sectionDividerStyle:'colored-rule',statCardStyle:'accent-filled'},
        coverPage:{photoTreatment:'full-bleed-dark-overlay',photoOpacity:0.45,accentBarThicknessPx:4},
        typography:{bodyFontSizePt:11,headingFontSizePt:26,headingWeight:'400',useAllCapsEyebrows:true,lineHeightBody:1.8},
        designLanguage:{density:'airy',formality:'luxury',photoEmphasis:'dominant',typographyContrast:'high'},
        cssVariables:{pagePaddingTopIn:0.5,pagePaddingRightIn:0.55,pagePaddingBottomIn:0.5,pagePaddingLeftIn:0.55,lineHeightBody:1.8,tableRowHeightPt:22},
        aesthetic:'Luxury dark editorial with gold accents and dramatic photography',
      },
    },
    'clean-modern': {
      colors:{primary:'#0057b8',secondary:'#0057b8',accent:'#4a90d9',text:'#1a2332',bg:'#ffffff',rule:'#0057b8'},
      fonts:{heading:'Montserrat',body:'Source Sans 3',number:'Montserrat'},
      layout:'magazine',
      analysis:{
        accentElements:{usesFullBleedPhotos:false,usesSidebarPanels:false,usesLargeStatCards:true,usesPullQuotes:false,usesDecorativeBars:false,cornerRadiusPx:6,photoStyle:'bordered',headerStyle:'colored-band',sectionDividerStyle:'thin-rule',statCardStyle:'light-outlined'},
        coverPage:{photoTreatment:'split-left-photo',photoOpacity:0.8,accentBarThicknessPx:0},
        typography:{bodyFontSizePt:10,headingFontSizePt:20,headingWeight:'600',useAllCapsEyebrows:true,lineHeightBody:1.65},
        designLanguage:{density:'balanced',formality:'modern',photoEmphasis:'balanced',typographyContrast:'medium'},
        cssVariables:{pagePaddingTopIn:0.4,pagePaddingRightIn:0.45,pagePaddingBottomIn:0.4,pagePaddingLeftIn:0.45,lineHeightBody:1.65,tableRowHeightPt:20},
        aesthetic:'Clean modern two-column layout with blue accent rules',
      },
    },
    'earth-tones': {
      colors:{primary:'#3b2a1a',secondary:'#7a4f2e',accent:'#c8a96e',text:'#2a1e10',bg:'#fdf8f0',rule:'#c8a96e'},
      fonts:{heading:'Merriweather',body:'Lato',number:'Playfair Display'},
      layout:'classic',
      analysis:{
        accentElements:{usesFullBleedPhotos:true,usesSidebarPanels:true,usesLargeStatCards:true,usesPullQuotes:true,usesDecorativeBars:true,cornerRadiusPx:3,photoStyle:'bordered',headerStyle:'dark-overlay',sectionDividerStyle:'colored-rule',statCardStyle:'dark-filled'},
        coverPage:{photoTreatment:'full-bleed-dark-overlay',photoOpacity:0.5,accentBarThicknessPx:6},
        typography:{bodyFontSizePt:10.5,headingFontSizePt:22,headingWeight:'700',useAllCapsEyebrows:true,lineHeightBody:1.75},
        designLanguage:{density:'balanced',formality:'professional',photoEmphasis:'balanced',typographyContrast:'high'},
        cssVariables:{pagePaddingTopIn:0.45,pagePaddingRightIn:0.5,pagePaddingBottomIn:0.45,pagePaddingLeftIn:0.5,lineHeightBody:1.75,tableRowHeightPt:21},
        aesthetic:'Warm earth tones with brown and gold — classic CRE with organic warmth',
      },
    },
    'slate-steel': {
      colors:{primary:'#1e2d3d',secondary:'#4a7fa5',accent:'#8fb8d4',text:'#1e2d3d',bg:'#f5f8fb',rule:'#4a7fa5'},
      fonts:{heading:'Raleway',body:'Open Sans',number:'Oswald'},
      layout:'classic',
      analysis:{
        accentElements:{usesFullBleedPhotos:true,usesSidebarPanels:true,usesLargeStatCards:true,usesPullQuotes:true,usesDecorativeBars:true,cornerRadiusPx:4,photoStyle:'full-bleed',headerStyle:'dark-overlay',sectionDividerStyle:'colored-band',statCardStyle:'dark-filled'},
        coverPage:{photoTreatment:'split-right-photo',photoOpacity:0.6,accentBarThicknessPx:5},
        typography:{bodyFontSizePt:10.5,headingFontSizePt:22,headingWeight:'600',useAllCapsEyebrows:true,lineHeightBody:1.7},
        designLanguage:{density:'balanced',formality:'professional',photoEmphasis:'balanced',typographyContrast:'medium'},
        cssVariables:{pagePaddingTopIn:0.42,pagePaddingRightIn:0.48,pagePaddingBottomIn:0.42,pagePaddingLeftIn:0.48,lineHeightBody:1.7,tableRowHeightPt:20},
        aesthetic:'Cool slate and steel blue — corporate and authoritative with split cover',
      },
    },
    'minimal-white': {
      colors:{primary:'#1a2332',secondary:'#1a2332',accent:'#0057b8',text:'#1a2332',bg:'#ffffff',rule:'#1a2332'},
      fonts:{heading:'Inter',body:'Inter',number:'Inter'},
      layout:'minimal',
      analysis:{
        accentElements:{usesFullBleedPhotos:false,usesSidebarPanels:false,usesLargeStatCards:false,usesPullQuotes:false,usesDecorativeBars:false,cornerRadiusPx:0,photoStyle:'inset',headerStyle:'top-band',sectionDividerStyle:'thin-rule',statCardStyle:'transparent-bordered'},
        coverPage:{photoTreatment:'top-band',photoOpacity:0.7,accentBarThicknessPx:0},
        typography:{bodyFontSizePt:10.5,headingFontSizePt:20,headingWeight:'400',useAllCapsEyebrows:false,lineHeightBody:1.8},
        designLanguage:{density:'airy',formality:'minimal',photoEmphasis:'subtle',typographyContrast:'low'},
        cssVariables:{pagePaddingTopIn:0.5,pagePaddingRightIn:0.6,pagePaddingBottomIn:0.5,pagePaddingLeftIn:0.6,lineHeightBody:1.8,tableRowHeightPt:22},
        aesthetic:'Minimal white with generous whitespace and thin typographic rules',
      },
    },
  };

  const p=presets[name]; if(!p) return;

  // Apply colors
  Object.entries(p.colors).forEach(([k,v])=>setColor(k,v));

  // Apply fonts
  S.design.fonts=p.fonts;
  const hEl=$('font-heading'), bEl=$('font-body'), nEl=$('font-number');
  if(hEl) hEl.value=p.fonts.heading||'';
  if(bEl) bEl.value=p.fonts.body||'';
  if(nEl) nEl.value=p.fonts.number||'';
  [p.fonts.heading,p.fonts.body,p.fonts.number].filter(Boolean).forEach(loadFont);

  // Apply layout
  selectLayout(p.layout);

  // Store analysis so renderer picks up all the design flags
  S.design.analysis=p.analysis;

  updateFontPreview();
  toast(`Applied "${p.analysis.aesthetic.split('—')[0].trim()}" template`);
}

// ── Fonts ─────────────────────────────────────────────────────
const GF=['Playfair Display','Merriweather','Lora','Cormorant Garamond','Montserrat','Raleway','Oswald','Bebas Neue','Inter','DM Sans','Source Sans 3','Lato','Open Sans','Nunito','Rajdhani','Barlow'];
const loadedFonts=new Set();
function loadFont(name) {
  if(!name||name==='Georgia'||loadedFonts.has(name)) return;
  loadedFonts.add(name);
  const l=document.createElement('link'); l.rel='stylesheet';
  l.href=`https://fonts.googleapis.com/css2?family=${name.replace(/ /g,'+')}:wght@300;400;500;600;700&display=swap`;
  document.head.appendChild(l);
}
function updateFontPreview() {
  const h=$('font-heading').value, b=$('font-body').value, n=$('font-number').value;
  S.design.fonts={heading:h,body:b,number:n};
  [h,b,n].filter(Boolean).forEach(loadFont);
  const fph=$('fp-heading'),fpb=$('fp-body'),fps=$('fp-stats');
  if(fph) fph.style.fontFamily=h?`'${h}',serif`:"'Playfair Display',serif";
  if(fpb) fpb.style.fontFamily=b?`'${b}',sans-serif`:'Inter,sans-serif';
  if(fps) fps.style.fontFamily=(n||h)?`'${n||h}',serif`:"'Playfair Display',serif";
}
function selectLayout(l) {
  S.design.layout=l; document.querySelectorAll('.layout-card').forEach(c=>c.classList.toggle('active',c.dataset.layout===l));
}

// ── File uploads ─────────────────────────────────────────────
function triggerUpload(key) { $('file-'+key)?.click(); }
function handleFileSelect(key,input) {
  const files=Array.from(input.files); if(!files.length) return;
  S.files[key]=[...(S.files[key]||[]),...files];
  const zone=input.closest('.iupload'); if(zone) zone.classList.add('has-files');
  if(key==='photos'){loadPhotos(files);return;}
  const listEl=$('files-'+key);
  if(listEl) files.forEach(f=>{const t=document.createElement('div');t.className='ifile-tag';t.innerHTML=`<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> ${f.name}`;listEl.appendChild(t);});
  const btnMap={'property-doc':'btn-extract-property','financials':'btn-extract-financials','narrative':'btn-extract-narrative','template':'btn-analyze-template'};
  const btn=$(btnMap[key]); if(btn) btn.style.display='inline-flex';
}
function loadPhotos(files) {
  const grid=$('photo-preview-grid');
  files.forEach(f=>{ if(!f.type.startsWith('image/')) return;
    const r=new FileReader(); r.onload=e=>{S.photos.push(e.target.result);if(grid){const img=document.createElement('img');img.className='photo-thumb';img.src=e.target.result;grid.appendChild(img);}};r.readAsDataURL(f);
  });
}

// ── Template analysis (server) ───────────────────────────────


    // Map layout structure → our layout selector
    if(a.pageLayouts?.length){
      const coverLayout=a.pageLayouts.find(l=>l.pageType==='cover')||a.pageLayouts[0];
      const ls=coverLayout.layoutStructure||'';
      const lm={
        'sidebar-right':'classic','sidebar-left':'classic',
        'single-column':'editorial','two-column':'magazine',
        'magazine-grid':'magazine','full-bleed-photo':'editorial',
        'top-band':'minimal','split-left-photo':'classic','split-right-photo':'classic',
      };
      selectLayout(lm[ls]||'classic');
    }

    updateFontPreview();

    const pagesMsg = `${d.pagesAnalyzed} page${d.pagesAnalyzed !== 1 ? 's' : ''} analyzed`;
    const methodMsg = d.usedNativePdf ? ' (native PDF mode)' : '';
    const cssMsg = d.cssOverrides ? ` · ${Object.keys(d.cssOverrides).length} CSS variables extracted` : '';
    st.textContent = `✓ ${pagesMsg}${methodMsg}${cssMsg} — ${a.aesthetic || 'Design settings updated'}`;
    st.className = 'extract-status ok';

    // Show CSS override summary if copy mode
    if(mode==='copy'&&d.cssOverrides){
      const keys=Object.keys(d.cssOverrides).length;
      toast(`Template replicated — ${keys} CSS variables extracted`);
    } else {
      toast('Template analyzed — design settings updated');
    }

    // Auto-advance to design step so user can review
    goStep(5);

  } catch(e){
    st.textContent='✗ '+(e.message||'Analysis failed');
    st.className='extract-status err';
  }
}

// ── Property extraction ──────────────────────────────────────
async function extractProperty(type='property') {
  const keyMap={property:'property-doc',narrative:'narrative'};
  const st=$('status-'+type)||$('status-narrative'); if(st) st.innerHTML=spin()+'Extracting...';
  const files=S.files[keyMap[type]]||[]; if(!files.length){if(st)st.textContent='No file uploaded.';return;}
  let text=''; try{text=await readText(files[0]);}catch(e){text=`[${files[0].name}]`;}
  if(type==='narrative'){
    try{
      const d=await callClaude({model:'claude-sonnet-4-6',max_tokens:1500,messages:[{role:'user',content:`Summarize this document in 3-4 paragraphs as CRE marketing context:\n${text.slice(0,6000)}`}]});
      S.narrative=d.content?.[0]?.text||''; if(st){st.textContent='✓ Narrative saved as context';st.className='extract-status ok';}
    }catch(e){if(st){st.textContent='✗ '+e.message;st.className='extract-status err';}}
    return;
  }
  const prompt=`Extract property info. Return ONLY valid JSON:\n{"propName":"","propAddress":"","propCity":"","propState":"","propZip":"","propCounty":"","propYear":"","propSF":"","propAcres":"","propBuildings":"","propUnits":"","propZoning":"","propParking":"","propClearHeight":"","propDesc":"","propHighlights":"","brokerName":"","brokerTitle":"","brokerPhone":"","brokerEmail":"","brokerLicense":""}\nDocument:\n${text.slice(0,6000)}`;
  try{
    const d=await callClaude({model:'claude-sonnet-4-6',max_tokens:2000,messages:[{role:'user',content:prompt}]});
    const p=JSON.parse((d.content?.[0]?.text||'{}').replace(/```json|```/g,'').trim());
    const m={'prop-name':p.propName,'prop-address':p.propAddress,'prop-city':p.propCity,'prop-state':p.propState,'prop-zip':p.propZip,'prop-county':p.propCounty,'prop-year':p.propYear,'prop-sf':p.propSF,'prop-acres':p.propAcres,'prop-buildings':p.propBuildings,'prop-units':p.propUnits,'prop-zoning':p.propZoning,'prop-parking':p.propParking,'prop-clearheight':p.propClearHeight,'prop-desc':p.propDesc,'prop-highlights':p.propHighlights,'broker-name':p.brokerName,'broker-title':p.brokerTitle,'broker-phone':p.brokerPhone,'broker-email':p.brokerEmail,'broker-license':p.brokerLicense};
    Object.entries(m).forEach(([id,val])=>{const el=$(id);if(el&&val)el.value=val;});
    if(st){st.textContent='✓ Fields populated';st.className='extract-status ok';}
  }catch(e){if(st){st.textContent='✗ '+e.message;st.className='extract-status err';}}
}

// ── Financial extraction ─────────────────────────────────────
async function extractFinancials() {
  const st=$('status-financials'); st.innerHTML=spin()+'Parsing file...';
  const files=S.files['financials']||[]; if(!files.length){st.textContent='No file uploaded.';return;}
  const file=files[0];
  if(file.name.match(/\.(xlsx|xls)$/i)){
    const fd=new FormData(); fd.append('file',file);
    try{
      const r=await fetch('/api/parse-xlsx',{method:'POST',body:fd});
      const d=await r.json(); if(!r.ok) throw new Error(d.error||'Parse failed');
      applyFinancials(d.data);
      st.textContent='✓ Financials extracted from spreadsheet'; st.className='extract-status ok';
    }catch(e){st.textContent='✗ '+e.message;st.className='extract-status err';}
    return;
  }
  // CSV or PDF — read as text
  let text=''; try{text=await readText(file);}catch(e){text=`[${file.name}]`;}
  const prompt=`Extract ALL financial data. Return ONLY valid JSON:\n{"finPrice":"","finPpsf":"","finGpr":"","finVacancy":"","finEgi":"","finOpex":"","finNoi":"","finCaprate":"","finOccupancy":"","finWalt":"","finDebtService":"","finDscr":"","finCashOnCash":"","keyHighlights":["","",""],"rentRoll":[{"tenant":"","suite":"","sf":"","leaseStart":"","leaseEnd":"","annualRent":"","rentPsf":"","leaseType":""}],"expenseBreakdown":[{"item":"","amount":""}],"recentCapex":"","additionalNotes":""}\nDocument:\n${text.slice(0,8000)}`;
  try{
    const d=await callClaude({model:'claude-sonnet-4-6',max_tokens:3000,messages:[{role:'user',content:prompt}]});
    const p=JSON.parse((d.content?.[0]?.text||'{}').replace(/```json|```/g,'').trim());
    applyFinancials(p); st.textContent='✓ Financials extracted'; st.className='extract-status ok';
  }catch(e){st.textContent='✗ '+e.message;st.className='extract-status err';}
}
function applyFinancials(p) {
  S.extractedFin=p;
  const m={'fin-price':p.finPrice,'fin-ppsf':p.finPpsf,'fin-gpr':p.finGpr,'fin-vacancy':p.finVacancy,'fin-egi':p.finEgi,'fin-opex':p.finOpex,'fin-noi':p.finNoi,'fin-caprate':p.finCaprate,'fin-occupancy':p.finOccupancy,'fin-walt':p.finWalt,'fin-debt':p.finDebtService,'fin-dscr':p.finDscr};
  Object.entries(m).forEach(([id,val])=>{const el=$(id);if(el&&val)el.value=val;});
  if(p.rentRoll?.length){
    const tb=$('rent-roll-body'); if(tb){tb.innerHTML='';
      p.rentRoll.forEach(r=>{S.tenantRows++;const tr=document.createElement('tr');tr.id='tr-'+S.tenantRows;tr.innerHTML=tenantRowHTML(S.tenantRows,r);tb.appendChild(tr);});
    }
  }
  calcFinancials();
}

// ── Financials calc ──────────────────────────────────────────
function calcFinancials() {
  const price=parseFloat($('fin-price')?.value)||0, sf=parseFloat($('prop-sf')?.value)||0;
  const gpr=parseFloat($('fin-gpr')?.value)||0, vac=parseFloat($('fin-vacancy')?.value)||0;
  const opex=parseFloat($('fin-opex')?.value)||0;
  const egi=gpr*(1-vac/100), noi=egi-opex;
  const cap=price>0&&noi>0?(noi/price)*100:0, ppsf=sf>0&&price>0?price/sf:0, grm=gpr>0&&price>0?price/gpr:0;
  const trySet=(id,v)=>{const el=$(id);if(el&&!el.value&&v>0)el.value=Number.isInteger(v)?v:v.toFixed(2);};
  trySet('fin-egi',egi);trySet('fin-noi',noi);trySet('fin-caprate',cap);trySet('fin-ppsf',ppsf);
  const set=(id,v)=>{const el=$(id);if(el)el.textContent=v;};
  set('calc-ppsf',ppsf>0?'$'+ppsf.toFixed(2):'—');
  set('calc-noi',noi>0?'$'+fmtNum(Math.round(noi)):'—');
  set('calc-caprate',cap>0?cap.toFixed(2)+'%':'—');
  set('calc-grm',grm>0?grm.toFixed(2)+'x':'—');
}

// ── Rent roll ────────────────────────────────────────────────
function tenantRowHTML(id,r={}){
  return `<td><input type="text" value="${r.tenant||''}" placeholder="Tenant"/></td><td><input type="text" value="${r.suite||''}" placeholder="101" style="width:55px;"/></td><td><input type="number" value="${r.sf||''}" placeholder="5000" oninput="calcRentSF(${id})"/></td><td><input type="date" value="${r.leaseStart||''}"/></td><td><input type="date" value="${r.leaseEnd||''}"/></td><td><input type="number" value="${r.annualRent||''}" placeholder="60000" oninput="calcRentSF(${id})"/></td><td><span id="rpsf-${id}" style="font-size:12px;color:var(--text-muted);">—</span></td><td><button class="btn-del-row" onclick="delRow(${id})">×</button></td>`;
}
function addTenantRow(){
  const tb=$('rent-roll-body'); const er=tb.querySelector('.empty-row'); if(er) er.remove();
  const id=++S.tenantRows; const tr=document.createElement('tr'); tr.id='tr-'+id; tr.innerHTML=tenantRowHTML(id); tb.appendChild(tr);
}
function calcRentSF(id){
  const row=$('tr-'+id); if(!row) return;
  const inp=row.querySelectorAll('input[type="number"]');
  const sf=parseFloat(inp[0]?.value)||0, rent=parseFloat(inp[1]?.value)||0;
  const el=$('rpsf-'+id); if(el) el.textContent=sf>0&&rent>0?'$'+(rent/sf).toFixed(2):'—';
}
function delRow(id){
  const row=$('tr-'+id); if(row) row.remove();
  const tb=$('rent-roll-body');
  if(!tb.querySelector('tr:not(.empty-row)')) tb.innerHTML='<tr class="empty-row"><td colspan="8" style="text-align:center;color:#6b7fa3;padding:20px;">No tenants yet.</td></tr>';
}
function getRentRoll(){
  return Array.from(document.querySelectorAll('#rent-roll-body tr:not(.empty-row)')).map(row=>{
    const i=row.querySelectorAll('input');
    return {tenant:i[0]?.value||'',suite:i[1]?.value||'',sf:i[2]?.value||'',leaseStart:i[3]?.value||'',leaseEnd:i[4]?.value||'',annualRent:i[5]?.value||''};
  });
}

// ── Review ───────────────────────────────────────────────────
function buildReview(){
  const g=id=>$(id)?.value||'—';
  const sections=[
    {title:'Document',items:[['Type',S.docType==='om'?'Offering Memorandum':'Broker Opinion of Value'],['Property Type',S.propType],['Page Size',`${S.page.w}" × ${S.page.h}"`]]},
    {title:'Property',items:[['Name',g('prop-name')],['Address',`${g('prop-address')}, ${g('prop-city')}, ${g('prop-state')}`],['SF',g('prop-sf')!=='—'?fmtNum(g('prop-sf'))+' SF':'—'],['Year',g('prop-year')]]},
    {title:'Financials',items:[['Price',g('fin-price')!=='—'?'$'+fmtNum(g('fin-price')):'—'],['NOI',g('fin-noi')!=='—'?'$'+fmtNum(g('fin-noi')):'—'],['Cap Rate',g('fin-caprate')!=='—'?g('fin-caprate')+'%':'—'],['Occupancy',g('fin-occupancy')!=='—'?g('fin-occupancy')+'%':'—']]},
    {title:'Design',items:[
      ['Layout',S.design.layout],
      ['Template',S.design.analysis?(S.design.cssOverrides?`✓ Copy mode (${Object.keys(S.design.cssOverrides).length} CSS vars)`:'✓ Analyzed'):'—'],
      ['Preset',document.querySelector('.preset-tmpl.active')?.dataset.preset||'—'],
      ['Primary',S.design.colors.primary],
      ['Heading Font',S.design.fonts.heading||'AI choice'],
    ]},
    {title:'Files',items:[['Photos',S.photos.length+' photo(s)'],['Financial',((S.files['financials']||[]).length)+' file(s)'],['Template',((S.files['template']||[]).length)+' file(s)']]},
  ];
  $('review-summary').innerHTML=sections.map(s=>`<div class="review-section"><div class="review-section-title">${s.title}</div>${s.items.map(([l,v])=>`<div class="review-item"><span class="review-item-label">${l}</span><span class="review-item-value">${v}</span></div>`).join('')}</div>`).join('');

  // Broker selector
  const bs=$('broker-selector');
  if(bs){
    if(!S.brokers.length){bs.innerHTML='<div style="font-size:12px;color:var(--text-muted);">No brokers saved. <a href="#" onclick="navigate(\'brokers\');return false;" style="color:var(--colliers-mid);">Add brokers</a> first.</div>';}
    else{bs.innerHTML=S.brokers.map(b=>`<div class="broker-selector-item${S.selectedBrokers.includes(b.id)?' selected':''}" onclick="toggleBroker('${b.id}')"><div class="broker-sel-avatar">${b.photo?`<img src="${b.photo}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`:(b.name||'?')[0]}</div><span class="broker-sel-name">${b.name}</span></div>`).join('');}
  }
}
function toggleBroker(id){
  if(S.selectedBrokers.includes(id)) S.selectedBrokers=S.selectedBrokers.filter(x=>x!==id);
  else S.selectedBrokers.push(id);
  document.querySelectorAll('.broker-selector-item').forEach(el=>{
    const elId=el.getAttribute('onclick')?.match(/'([^']+)'/)?.[1];
    if(elId) el.classList.toggle('selected',S.selectedBrokers.includes(elId));
  });
}

// ── Save draft ───────────────────────────────────────────────
function saveDraft(){
  const g=id=>$(id)?.value||'';
  const d={id:Date.now(),docType:S.docType,propType:S.propType,name:g('prop-name')||'Untitled',address:`${g('prop-address')}, ${g('prop-city')}, ${g('prop-state')}`,price:g('fin-price'),noi:g('fin-noi'),capRate:g('fin-caprate'),sf:g('prop-sf'),createdAt:new Date().toLocaleDateString(),status:'draft'};
  S.projects=[d,...S.projects.filter(p=>p.name!==d.name)];
  localStorage.setItem('cds_projects',JSON.stringify(S.projects)); toast('Draft saved');
}

// ── Generate document ────────────────────────────────────────
async function generateDocument(){
  const g = id => $(id)?.value || '';
  const settings = JSON.parse(localStorage.getItem('cds_settings') || '{}');
  const disclaimer = settings.disclaimer || 'The information contained herein has been obtained from sources believed to be reliable. Colliers International makes no guarantee, warranty, or representation about it.';
  const firm = settings.firm || 'Colliers International';
  const city = settings.city || 'Denver, Colorado';
  const docLabel = S.docType === 'om' ? 'Offering Memorandum' : 'Broker Opinion of Value';

  const prop = {
    propName: g('prop-name'), propAddress: g('prop-address'), propCity: g('prop-city'),
    propState: g('prop-state'), propZip: g('prop-zip'), propCounty: g('prop-county'),
    propYear: g('prop-year'), propSf: g('prop-sf'), propAcres: g('prop-acres'),
    propBuildings: g('prop-buildings'), propUnits: g('prop-units'), propZoning: g('prop-zoning'),
    propParking: g('prop-parking'), propClearHeight: g('prop-clearheight'),
    propDesc: g('prop-desc'), propHighlights: g('prop-highlights'), propType: S.propType,
  };
  const fin = {
    price: g('fin-price'), ppsf: g('fin-ppsf'), gpr: g('fin-gpr'),
    vacancy: g('fin-vacancy'), egi: g('fin-egi'), opex: g('fin-opex'),
    noi: g('fin-noi'), capRate: g('fin-caprate'), occupancy: g('fin-occupancy'),
    walt: g('fin-walt'), debtService: g('fin-debt'), dscr: g('fin-dscr'),
    ...(S.extractedFin || {}),
  };
  const broker = { name: g('broker-name'), title: g('broker-title'), phone: g('broker-phone'), email: g('broker-email'), license: g('broker-license') };
  const rentRoll = getRentRoll();
  const sections = Array.from(document.querySelectorAll('.sections-checklist input:checked')).map(i => i.dataset.section);
  const selBrokers = S.brokers.filter(b => S.selectedBrokers.includes(b.id));

  const st = $('generate-status');
  st.style.display = 'block';

  // ── Path A: Use a library template ───────────────────────────
  if (S.selectedLibraryTemplate) {
    const t = S.selectedLibraryTemplate;
    st.innerHTML = spin() + `Using template "${t.name}" — generating AI content...`;

    try {
      const r = await fetch('/api/templates/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId: t.id,
          prop, fin, broker, rentRoll, sections,
          firm, city, docType: docLabel,
          disclaimer,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Generation failed');

      st.innerHTML = spin() + 'Building document pages...';
      await new Promise(res => setTimeout(res, 200));

      // Render pages from populated HTML
      navigate('preview');
      $('preview-title').textContent = `${prop.propName || 'Document'} — ${docLabel}`;
      $('preview-subtitle').textContent = `${prop.propAddress}, ${prop.propCity}, ${prop.propState}`;

      const container = $('document-preview-container');
      container.innerHTML = d.pages
        .filter(p => p.html)
        .map(p => `<iframe srcdoc="${p.html.replace(/"/g, '&quot;')}" style="width:${S.page.w}in;height:${S.page.h}in;border:none;display:block;box-shadow:0 4px 24px rgba(0,0,0,0.12);border-radius:3px;background:#fff;" scrolling="no"></iframe>`)
        .join('');

      injectPrintCSS();
      st.style.display = 'none';

      // Save project record
      const proj = { id: Date.now(), docType: S.docType, propType: S.propType, name: prop.propName || 'Untitled', address: `${prop.propAddress}, ${prop.propCity}, ${prop.propState}`, price: fin.price, noi: fin.noi, capRate: fin.capRate, sf: prop.propSf, createdAt: new Date().toLocaleDateString(), status: 'complete', templateUsed: t.name };
      S.projects = [proj, ...S.projects];
      localStorage.setItem('cds_projects', JSON.stringify(S.projects));
      toast(`Document ready — built from "${t.name}" template`);

    } catch (e) {
      st.innerHTML = `<span style="color:#f5a623;">✗ ${e.message}</span>`;
    }
    return;
  }

  // ── Path B: Preset / manual design (existing buildDocument) ──
  st.innerHTML = spin() + 'Generating AI content...';

  let ai = {};
  let fonts = { heading: S.design.fonts.heading || 'Playfair Display', body: S.design.fonts.body || 'Inter', number: S.design.fonts.number || S.design.fonts.heading || 'Playfair Display' };
  const ta = S.design.analysis;

  try {
    if (!S.design.fonts.heading || !S.design.fonts.body) {
      const ctx = ta ? `Template style: ${ta.aesthetic}. Formality: ${ta.designLanguage?.formality}.` : `Primary color: ${S.design.colors.primary}. Layout: ${S.design.layout}.`;
      const fd = await callClaude({ model: 'claude-sonnet-4-6', max_tokens: 150, messages: [{ role: 'user', content: `Pick Google Fonts for a ${docLabel}. ${ctx} Return ONLY JSON: {"heading":"","body":"","number":""} Choose from: ${GF.join(', ')}` }] });
      try { const fp = JSON.parse((fd.content?.[0]?.text || '{}').replace(/```json|```/g, '').trim()); if (fp.heading) fonts.heading = S.design.fonts.heading || fp.heading; if (fp.body) fonts.body = S.design.fonts.body || fp.body; if (fp.number) fonts.number = S.design.fonts.number || fp.number; } catch (e) {}
    }
    st.innerHTML = spin() + 'Writing narratives...';
    const narrativePrompt = `You are a senior CRE broker at ${firm} writing a ${docLabel} for a ${S.propType} property.
PROPERTY: ${prop.propName}, ${prop.propAddress}, ${prop.propCity}, ${prop.propState} ${prop.propZip}
${prop.propSf ? fmtNum(prop.propSf) + ' SF' : ''} Built ${prop.propYear || 'N/A'}, Zoning: ${prop.propZoning || 'N/A'}
Description: ${prop.propDesc || 'N/A'}
Highlights: ${prop.propHighlights || 'N/A'}
FINANCIALS: Price $${fmtNum(fin.price) || 'N/A'}, NOI $${fmtNum(fin.noi) || 'N/A'}, Cap ${fin.capRate || 'N/A'}%, Occupancy ${fin.occupancy || 'N/A'}%
RENT ROLL: ${rentRoll.length ? JSON.stringify(rentRoll) : 'Not provided'}
Return ONLY valid JSON:
{"executiveSummary":"2-3 paragraphs","propertyDescription":"2-3 paragraphs","locationOverview":"2 paragraphs","investmentHighlights":["highlight 1","highlight 2","highlight 3","highlight 4","highlight 5"],"tenantSummary":"1-2 paragraphs","valuationNarrative":"2 paragraphs","pullQuotes":["stat 1","stat 2","stat 3"],"marketContext":"2 sentences"}`;
    const nd = await callClaude({ model: 'claude-sonnet-4-6', max_tokens: 5000, messages: [{ role: 'user', content: narrativePrompt }] });
    try { ai = JSON.parse((nd.content?.[0]?.text || '{}').replace(/```json|```/g, '').trim()); } catch (e) { ai = {}; }
  } catch (e) {
    st.innerHTML = `<span style="color:#f5a623;">⚠ AI unavailable (${e.message}) — building from entered data.</span>`;
    await new Promise(r => setTimeout(r, 2000));
  }

  [fonts.heading, fonts.body, fonts.number].filter(Boolean).forEach(loadFont);
  await new Promise(r => setTimeout(r, 800));
  st.innerHTML = spin() + 'Building document pages...';
  await new Promise(r => setTimeout(r, 100));

  const html = buildDocument(prop, fin, broker, rentRoll, ai, sections, disclaimer, docLabel, firm, city, fonts, selBrokers);
  navigate('preview');
  $('preview-title').textContent = `${prop.propName || 'Document'} — ${docLabel}`;
  $('preview-subtitle').textContent = `${prop.propAddress}, ${prop.propCity}, ${prop.propState} ${prop.propZip}`;
  $('document-preview-container').innerHTML = html;
  injectPrintCSS();
  st.style.display = 'none';

  const proj = { id: Date.now(), docType: S.docType, propType: S.propType, name: prop.propName || 'Untitled', address: `${prop.propAddress}, ${prop.propCity}, ${prop.propState}`, price: fin.price, noi: fin.noi, capRate: fin.capRate, sf: prop.propSf, createdAt: new Date().toLocaleDateString(), status: 'complete' };
  S.projects = [proj, ...S.projects];
  localStorage.setItem('cds_projects', JSON.stringify(S.projects));
  toast('Document ready — Print / Save as PDF to export');
}

function injectPrintCSS(){
  const ex = $('print-css'); if (ex) ex.remove();
  const s = document.createElement('style'); s.id = 'print-css';
  // Handles both .doc-page divs (preset path) and iframes (template path)
  s.textContent = `@media print{
    @page{size:${S.page.w}in ${S.page.h}in;margin:0;}
    .doc-page{width:${S.page.w}in!important;height:${S.page.h}in!important;min-height:${S.page.h}in!important;}
    #document-preview-container iframe{width:${S.page.w}in!important;height:${S.page.h}in!important;page-break-after:always;}
  }`;
  document.head.appendChild(s);
}



// ══════════════════════════════════════════════════════════════
// SESSION 2 — Rich multi-layout document renderer
// Every section has its own layout logic derived from template
// analysis. 8 cover styles, 6 interior layouts, dynamic photo
// placement, financial emphasis, pull quotes, accent elements.
// ══════════════════════════════════════════════════════════════

function buildDocument(prop,fin,broker,rentRoll,ai,sections,disclaimer,docLabel,firm,city,F,selBrokers){
  const {w,h}=S.page;
  const C=S.design.colors;
  const ta=S.design.analysis;
  const isLandscape=w>=h;
  const fullAddr=`${prop.address}, ${prop.city}, ${prop.state} ${prop.zip}`;

  // Typography scale
  const bfs   = parseFloat(ta?.typography?.bodyFontSizePt  || 10.5);
  const hfs   = parseFloat(ta?.typography?.headingFontSizePt || 22);
  const hWt   = ta?.typography?.headingWeight || '500';
  const allCap= ta?.typography?.useAllCapsEyebrows !== false;

  // Design flags from template analysis (fall back to sensible defaults)
  const useSidebar    = ta?.accentElements?.usesSidebarPanels  !== false && S.design.layout==='classic';
  const usePullQuotes = ta?.accentElements?.usesPullQuotes      !== false;
  const useColorBands = ta?.accentElements?.usesColoredBands    !== false;
  const useDecorBars  = ta?.accentElements?.usesDecorativeBars  !== false;
  const cornerR       = parseInt(ta?.accentElements?.cornerRadiusPx)   || 4;
  const accentBarH    = parseInt(ta?.coverPage?.accentBarThicknessPx)  || 5;
  const photoStyle    = ta?.accentElements?.photoStyle       || 'full-bleed';
  const headerStyle   = ta?.coverPage?.photoTreatment        || ta?.accentElements?.headerStyle || 'full-bleed-dark-overlay';
  const photoOpacity  = parseFloat(ta?.coverPage?.photoOpacity)        || 0.55;
  const photoEmphasis = ta?.designLanguage?.photoEmphasis    || 'balanced';
  const formality     = ta?.designLanguage?.formality        || 'professional';
  const density       = ta?.designLanguage?.density          || 'balanced';
  const divStyle      = ta?.accentElements?.sectionDividerStyle || 'colored-rule';
  const statStyle     = ta?.accentElements?.statCardStyle    || 'dark-filled';
  const sidebarW      = isLandscape ? '2.05in' : '1.7in';

  // Per-section page layout from template (falls back to first layout)
  const getLayout = type => {
    if(!ta?.pageLayouts?.length) return null;
    return ta.pageLayouts.find(l=>l.pageType===type) || ta.pageLayouts[0];
  };

  // Padding: honour template cssVariables or cssOverrides if present
  const co  = S.design.cssOverrides || {};  // CSS overrides from copy-mode vision pass
  const pp  = ta?.cssVariables || {};

  // In copy mode, cssOverrides values take priority over everything else
  const ov  = (cssVar, fallback) => co[cssVar] || fallback;

  const padH    = `${ov('--doc-pad-top', pp.pagePaddingTopIn||0.42)}in ${ov('--doc-pad-right', pp.pagePaddingRightIn||0.5)}in ${ov('--doc-pad-bottom', pp.pagePaddingBottomIn||0.42)}in ${ov('--doc-pad-left', pp.pagePaddingLeftIn||0.5)}in`;
  const padTight= `0.22in ${ov('--doc-pad-right', pp.pagePaddingRightIn||0.5)}in 0.22in ${ov('--doc-pad-left', pp.pagePaddingLeftIn||0.5)}in`;

  // Override colours from cssOverrides if in copy mode
  if(Object.keys(co).length>0){
    if(co['--doc-primary'])   C.primary   = co['--doc-primary'];
    if(co['--doc-secondary']) C.secondary = co['--doc-secondary'];
    if(co['--doc-accent'])    C.accent    = co['--doc-accent'];
    if(co['--doc-text'])      C.text      = co['--doc-text'];
    if(co['--doc-bg'])        C.bg        = co['--doc-bg'];
    if(co['--doc-rule'])      C.rule      = co['--doc-rule'];
  }

  // ── Google Fonts import ──────────────────────────────────────
  // cssOverrides may specify exact font stacks — extract family name for loading
  const ovHeadingFont = co['--doc-heading-font']?.match(/'([^']+)'/)?.[1] || '';
  const ovBodyFont    = co['--doc-body-font']?.match(/'([^']+)'/)?.[1]    || '';
  const ovNumberFont  = co['--doc-number-font']?.match(/'([^']+)'/)?.[1]  || '';
  const resolvedH = ovHeadingFont || F.heading;
  const resolvedB = ovBodyFont    || F.body;
  const resolvedN = ovNumberFont  || F.number || F.heading;
  const fontFamilies=[...new Set([resolvedH,resolvedB,resolvedN].filter(f=>f&&f!=='Georgia'))];
  const gfUrl=fontFamilies.map(f=>`family=${f.replace(/ /g,'+')}:wght@300;400;500;600;700`).join('&');

  // Update F with resolved fonts so page builder uses them
  F = { heading: resolvedH||F.heading, body: resolvedB||F.body, number: resolvedN||F.number||F.heading };

  // Override typography from cssOverrides
  const ovBfs  = co['--doc-body-size']    ? parseFloat(co['--doc-body-size'])    : bfs;
  const ovHfs  = co['--doc-heading-size'] ? parseFloat(co['--doc-heading-size']) : hfs;
  const ovHWt  = co['--doc-heading-wt']  || hWt;
  const ovCorR = co['--doc-corner-r']    ? parseInt(co['--doc-corner-r'])        : cornerR;
  const ovAbH  = co['--doc-accent-bar-h']? parseInt(co['--doc-accent-bar-h'])   : accentBarH;
  const ovSbW  = co['--doc-sidebar-w']   || sidebarW;
  const ovScBg = co['--doc-stat-bg']     || (statStyle==='accent-filled'?C.accent:statStyle==='light-outlined'?'transparent':C.primary);
  const ovScTx = co['--doc-stat-text']   || (statStyle==='accent-filled'?C.primary:statStyle==='light-outlined'?C.primary:'#ffffff');
  const ovScAc = co['--doc-stat-accent'] || (statStyle==='light-outlined'?C.secondary:C.accent);
  const ovFtH  = co['--doc-footer-h']    ? co['--doc-footer-h']                 : '26px';
  const ovLnH  = co['--doc-line-height'] ? parseFloat(co['--doc-line-height'])  : (pp.lineHeightBody||1.7);

  const scBdr  = statStyle==='light-outlined' ? `border:1.5px solid ${C.secondary};` : '';

  // ── Helpers ──────────────────────────────────────────────────
  const H=(hex,a)=>hex2rgba(hex,a);

  // ── Shared CSS ───────────────────────────────────────────────
  const css=`
@import url('https://fonts.googleapis.com/css2?${gfUrl}&display=swap');
*{box-sizing:border-box;margin:0;padding:0;}
.doc-page{width:${w}in;height:${h}in;min-height:${h}in;overflow:hidden;background:${C.bg};position:relative;
  font-family:'${F.body}',Inter,sans-serif;color:${C.text};font-size:${ovBfs}pt;line-height:${ovLnH};}
.pg-footer{position:absolute;bottom:0;left:0;right:0;height:${ovFtH};background:${C.primary};
  display:flex;align-items:center;justify-content:space-between;padding:0 ${pp.pagePaddingRightIn||0.5}in;}
.pg-firm{font-size:7pt;color:${C.accent};letter-spacing:0.5px;font-family:'${F.body}',sans-serif;}
.pg-broker{font-size:7pt;color:rgba(255,255,255,0.5);font-family:'${F.body}',sans-serif;}
.eyebrow{font-size:7pt;letter-spacing:2px;${allCap?'text-transform:uppercase;':''}color:${C.secondary};
  font-family:'${F.heading}',serif;font-weight:600;margin-bottom:5px;}
.sec-title{font-family:'${F.heading}',serif;font-size:${Math.round(ovHfs*0.72)}pt;font-weight:${ovHWt};
  color:${C.primary};margin-bottom:12px;line-height:1.2;}
.body-text{font-size:${ovBfs}pt;line-height:${ovLnH};color:${C.text};}
.stat-num{font-family:'${F.number||F.heading}',serif;}
.pull-quote{border-left:4px solid ${C.accent};padding:9px 13px;margin:12px 0;
  background:${H(C.primary,0.04)};border-radius:0 ${ovCorR}px ${ovCorR}px 0;}
.pull-quote-text{font-family:'${F.heading}',serif;font-size:${ovBfs*1.1}pt;color:${C.primary};font-style:italic;line-height:1.4;}
.sc{background:${ovScBg};${scBdr}border-radius:${ovCorR}px;padding:${isLandscape?'12px 10px':'8px 8px'};text-align:center;}
.sc-lbl{font-size:6.5pt;letter-spacing:1.5px;text-transform:uppercase;color:${ovScAc};margin-bottom:3px;font-family:'${F.body}',sans-serif;}
.sc-val{font-size:${isLandscape?'17':'13'}pt;color:${ovScTx};font-weight:600;font-family:'${F.number||F.heading}',serif;}
.hl{font-weight:600;color:${C.secondary};font-family:'${F.number||F.heading}',serif;}
.accent-strip{height:${ovAbH}px;background:${C.accent};position:absolute;bottom:${ovFtH};left:0;right:0;}
.two-col{display:grid;grid-template-columns:1fr 1fr;gap:${isLandscape?'0.22in':'0.18in'};}
.sidebar-col{width:${ovSbW};flex-shrink:0;padding-left:0.18in;border-left:1.5px solid ${H(C.rule,0.18)};overflow:hidden;}
.callout-box{padding:10px 12px;border-radius:${ovCorR}px;border-left:4px solid ${C.secondary};
  background:${H(C.secondary,0.07)};margin:10px 0;}
.fin-row-hi{background:${C.primary};}
.fin-row-hi td{color:#fff!important;font-weight:600;}
.fin-row-hi .fin-val{color:${C.accent}!important;font-family:'${F.number||F.heading}',serif;font-size:${ovBfs+1.5}pt;}
.color-band-accent{background:${C.accent};padding:10px 14px;border-radius:${ovCorR}px;margin-bottom:12px;}
`;

  const photos=[...S.photos]; let pi=0;
  const nextPhoto=()=>photos[pi++]||null;

  const footer=()=>`<div class="pg-footer">
    <span class="pg-firm">${firm} · ${city} · ${docLabel}</span>
    ${broker.name?`<span class="pg-broker">${broker.name}${broker.title?' · '+broker.title:''}${broker.phone?' · '+broker.phone:''}</span>`:''}
  </div>`;

  // Photo image with style from template
  const pImg=(src,ht,radius=true)=>src
    ?`<img src="${src}" style="width:100%;height:${ht};object-fit:cover;display:block;${radius?`border-radius:${ovCorR}px;`:''}"
        ${photoStyle==='bordered'?`style="border:2px solid ${C.accent};"`:''}/>`
    :'';

  // Stat card grid
  const statCards=(cards,maxCols=4)=>{
    if(!cards.length) return '';
    const cols=Math.min(cards.length,isLandscape?maxCols:Math.min(maxCols,3));
    return `<div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:8px;margin-bottom:14px;">
      ${cards.map(([l,v])=>`<div class="sc"><div class="sc-lbl">${l}</div><div class="sc-val stat-num">${v}</div></div>`).join('')}
    </div>`;
  };

  // Section divider — style derived from template
  const divider=()=>{
    if(divStyle==='colored-band') return `<div style="height:3px;background:${C.rule};margin-bottom:12px;border-radius:1px;"></div>`;
    if(divStyle==='decorative-dots') return `<div style="display:flex;gap:4px;margin-bottom:12px;">${[...Array(5)].map((_,i)=>`<div style="width:${i===2?8:5}px;height:${i===2?8:5}px;border-radius:50%;background:${i===2?C.accent:C.rule};opacity:${i===2?1:0.4};"></div>`).join('')}</div>`;
    if(divStyle==='whitespace') return `<div style="margin-bottom:12px;"></div>`;
    return `<div style="height:2px;background:${C.rule};margin-bottom:12px;border-radius:1px;"></div>`;
  };

  // Pull quote
  const pq=(text)=>usePullQuotes&&text
    ?`<div class="pull-quote"><div class="pull-quote-text">"${text}"</div></div>`:'' ;

  // Section header — adapts to divStyle
  const secHdr=(title,eyebrow)=>{
    const eye=`<div class="eyebrow">${eyebrow||docLabel}</div>`;
    const decBar=useDecorBars?`<div style="height:3px;background:${C.accent};width:36px;margin-bottom:10px;border-radius:2px;"></div>`:'';
    if(divStyle==='colored-band') {
      return `${decBar}${eye}<div style="border-bottom:2.5px solid ${C.rule};margin-bottom:12px;padding-bottom:8px;"><div class="sec-title" style="margin-bottom:0;">${title}</div></div>`;
    }
    return `${decBar}${eye}${divider()}<div class="sec-title">${title}</div>`;
  };

  // Sidebar box — coloured panel for key metrics
  const sideBox=(label,value,sub='')=>
    `<div style="background:${C.primary};border-radius:${ovCorR}px;padding:10px 12px;margin-bottom:8px;text-align:center;">
      <div style="font-size:6.5pt;letter-spacing:1.5px;text-transform:uppercase;color:${C.accent};margin-bottom:3px;font-family:'${F.body}',sans-serif;">${label}</div>
      <div style="font-size:${isLandscape?'16':'13'}pt;color:#fff;font-weight:600;font-family:'${F.number||F.heading}',serif;">${value}</div>
      ${sub?`<div style="font-size:7.5pt;color:rgba(255,255,255,0.6);margin-top:2px;">${sub}</div>`:''}
    </div>`;

  // Inset photo (float)
  const insetPh=(src,width,float)=>src
    ?`<div style="float:${float};width:${width};margin:${float==='right'?'0 0 10px 14px':'0 14px 10px 0'};border-radius:${ovCorR}px;overflow:hidden;">${pImg(src,'auto',false)}</div>`
    :'';

  // Standard page wrap — full, sidebar, editorial, magazine, minimal
  const pageWrap=(main,side,layoutOverride)=>{
    const lo=layoutOverride||S.design.layout;
    // Magazine: top colour band + two-col
    if(lo==='magazine'){
      return `<div class="doc-page">
        <div style="background:${C.primary};height:6px;"></div>
        <div style="height:calc(100% - 32px);padding:${padTight};overflow:hidden;">
          <div class="two-col">${main}</div>
        </div>${footer()}</div>`;
    }
    // Minimal: generous whitespace, thin rule only
    if(lo==='minimal'){
      return `<div class="doc-page">
        <div style="height:calc(100% - 26px);padding:${padH};overflow:hidden;">${main}</div>
        ${footer()}
      </div>`;
    }
    // Classic: wide content + narrow sidebar
    if(lo==='classic'&&useSidebar&&side){
      return `<div class="doc-page">
        <div style="height:calc(100% - 26px);display:flex;overflow:hidden;">
          <div style="flex:1;padding:${padH};overflow:hidden;">${main}</div>
          <div class="sidebar-col" style="padding:${padH} 0 ${padH} 0.18in;">${side}</div>
        </div>${footer()}</div>`;
    }
    // Editorial: dark top band
    if(lo==='editorial'){
      return `<div class="doc-page">
        <div style="background:${C.primary};padding:${padTight};padding-bottom:0.14in;">
          <div style="font-size:7pt;letter-spacing:2px;text-transform:uppercase;color:${C.accent};margin-bottom:4px;font-family:'${F.heading}',serif;">${docLabel}</div>
        </div>
        <div style="height:calc(100% - 26px - 0.55in);padding:${padTight};overflow:hidden;">${main}</div>
        ${footer()}
      </div>`;
    }
    // Default single-column
    return `<div class="doc-page">
      <div style="height:calc(100% - 26px);padding:${padH};overflow:hidden;">${main}</div>
      ${footer()}
    </div>`;
  };

  // Photo page — dynamic composition based on count
  const photoPage=(photoArr)=>{
    if(!photoArr.length) return '';
    let grid='';
    const cr=`border-radius:${ovCorR}px;overflow:hidden;`;
    if(photoArr.length===1){
      grid=`<div style="height:${isLandscape?'5.1in':'6.7in'};${cr}">${pImg(photoArr[0],'100%',false)}</div>`;
    } else if(photoArr.length===2){
      grid=`<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;height:${isLandscape?'5.1in':'6.5in'};">
        ${photoArr.map(p=>`<div style="${cr}">${pImg(p,'100%',false)}</div>`).join('')}</div>`;
    } else if(photoArr.length===3){
      grid=`<div style="display:grid;grid-template-columns:1.6fr 1fr;grid-template-rows:1fr 1fr;gap:10px;height:${isLandscape?'5.1in':'6.3in'};">
        <div style="grid-row:1/3;${cr}">${pImg(photoArr[0],'100%',false)}</div>
        <div style="${cr}">${pImg(photoArr[1],'100%',false)}</div>
        <div style="${cr}">${pImg(photoArr[2],'100%',false)}</div>
      </div>`;
    } else if(photoArr.length===4){
      grid=`<div style="display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;gap:10px;height:${isLandscape?'5.1in':'6.3in'};">
        ${photoArr.map(p=>`<div style="${cr}">${pImg(p,'100%',false)}</div>`).join('')}</div>`;
    } else {
      const pr=isLandscape?3:2;
      grid=`<div style="display:grid;grid-template-columns:repeat(${pr},1fr);gap:10px;">
        ${photoArr.map(p=>`<div style="height:${isLandscape?'2.3in':'2.6in'};${cr}">${pImg(p,'100%',false)}</div>`).join('')}</div>`;
    }
    return `<div class="doc-page">
      <div style="height:calc(100% - 26px);padding:${padH};overflow:hidden;">
        ${secHdr('Property Photos',docLabel)}${grid}
      </div>${footer()}
    </div>`;
  };

  // Canvas location map (no tile server needed)
  const mapCanvasScript=(canvasId,addrLabel)=>`<script>
(function(){setTimeout(function(){
  var c=document.getElementById('${canvasId}');if(!c)return;
  var ctx=c.getContext('2d'),W=c.width,H=c.height;
  ctx.fillStyle='#e8e4dc';ctx.fillRect(0,0,W,H);
  // road grid
  [[0,H*.45,W,H*.45],[0,H*.65,W,H*.65],[W*.3,0,W*.3,H],[W*.65,0,W*.65,H],[W*.5,0,W*.5,H*.4]].forEach(function(r){
    ctx.beginPath();ctx.moveTo(r[0],r[1]);ctx.lineTo(r[2],r[3]);
    ctx.strokeStyle='#d8ceb4';ctx.lineWidth=6;ctx.stroke();});
  // blocks
  [[W*.31,H*.1,W*.49,H*.43],[W*.66,H*.1,W*.9,H*.43],[W*.31,H*.66,W*.64,H*.9]].forEach(function(b){
    ctx.fillStyle='#ccc4b0';ctx.fillRect(b[0],b[1],b[2]-b[0],b[3]-b[1]);});
  // green space
  ctx.fillStyle='#c4d9aa';ctx.fillRect(W*.01,H*.1,W*.28,H*.33);
  // radius ring
  var sx=W*.48,sy=H*.52,rad=Math.min(W,H)*.3;
  ctx.beginPath();ctx.arc(sx,sy,rad,0,Math.PI*2);
  ctx.strokeStyle='${C.accent}';ctx.lineWidth=1.5;ctx.setLineDash([5,4]);ctx.stroke();ctx.setLineDash([]);
  ctx.beginPath();ctx.arc(sx,sy,rad,0,Math.PI*2);ctx.fillStyle='${H(C.accent,0.06)}';ctx.fill();
  // subject pin
  ctx.beginPath();ctx.arc(sx,sy,9,0,Math.PI*2);ctx.fillStyle='${C.primary}';ctx.fill();
  ctx.strokeStyle='${C.accent}';ctx.lineWidth=3;ctx.stroke();
  // POIs
  [[-55,-20,'#1D9E75'],[45,25,'#D85A30'],[-30,45,'#7F77DD'],[60,-35,'#1D9E75'],[-65,15,'#D85A30'],[50,-55,'#7F77DD']].forEach(function(p){
    ctx.beginPath();ctx.arc(sx+p[0],sy+p[1],5,0,Math.PI*2);ctx.fillStyle=p[2];ctx.fill();
    ctx.strokeStyle='#fff';ctx.lineWidth=1.5;ctx.stroke();});
  // label
  ctx.font='bold 9px Arial';ctx.fillStyle='${C.primary}';ctx.textAlign='center';
  ctx.fillText('${(addrLabel||'Subject Property').slice(0,24)}',sx,sy-14);
  ctx.font='7px Arial';ctx.fillStyle='rgba(0,0,0,0.45)';ctx.fillText('1-mile radius',sx,sy+rad+12);
},350);})();
<\/script>`;

  // ═══════════════════════════════════════════════════════════
  // PAGE ASSEMBLY
  // ═══════════════════════════════════════════════════════════
  let pages=`<style>${css}</style>`;

  // ── COVER ──────────────────────────────────────────────────
  if(sections.includes('cover')){
    const hp=nextPhoto();
    const coverStats=[
      fin.price    &&['Asking Price','$'+fmtNum(fin.price)],
      prop.sf      &&['Building SF', fmtNum(prop.sf)+' SF'],
      fin.capRate  &&['Cap Rate',    fin.capRate+'%'],
      fin.noi      &&['NOI',         '$'+fmtNum(fin.noi)],
      fin.occupancy&&['Occupancy',   fin.occupancy+'%'],
    ].filter(Boolean);

    // Determine cover layout from template or default
    const isSplit = headerStyle.includes('split') || headerStyle==='split-left-photo' || headerStyle==='split-right-photo';
    const isTopBand= headerStyle==='top-band';
    const imgSide = headerStyle==='split-right-photo'?'right':'left';
    const txtSide = imgSide==='left'?'right':'left';

    if(isSplit&&hp){
      pages+=`<div class="doc-page" style="background:${C.primary};">
        <div style="position:absolute;${imgSide}:0;top:0;width:52%;height:100%;overflow:hidden;">
          ${pImg(hp,'100%',false)}
          <div style="position:absolute;inset:0;background:linear-gradient(to ${txtSide},transparent 35%,${C.primary} 85%);"></div>
        </div>
        <div style="position:absolute;${txtSide}:0;top:0;width:52%;height:100%;padding:${padH};display:flex;flex-direction:column;justify-content:center;">
          <div style="font-size:7.5pt;letter-spacing:2.5px;text-transform:uppercase;color:${C.accent};font-family:'${F.heading}',serif;font-weight:600;margin-bottom:14px;">${firm} · ${docLabel}</div>
          <div style="height:${ovAbH}px;background:${C.accent};width:40px;margin-bottom:16px;border-radius:2px;"></div>
          <div style="font-family:'${F.heading}',serif;font-size:${isLandscape?'26':'21'}pt;font-weight:${hWt};color:#fff;line-height:1.1;margin-bottom:10px;">${prop.name}</div>
          <div style="font-size:${isLandscape?'11':'9'}pt;color:rgba(255,255,255,0.65);margin-bottom:18px;">${fullAddr}</div>
          ${coverStats.map(([l,v])=>`<div style="margin-bottom:10px;">
            <div style="font-size:6.5pt;letter-spacing:1.5px;text-transform:uppercase;color:${H(C.accent,0.8)};margin-bottom:2px;font-family:'${F.body}',sans-serif;">${l}</div>
            <div style="font-size:${isLandscape?'17':'14'}pt;color:#fff;font-weight:600;font-family:'${F.number||F.heading}',serif;">${v}</div>
          </div>`).join('')}
          ${broker.name?`<div style="margin-top:auto;padding-top:14px;border-top:1px solid ${H(C.accent,0.3)};">
            <div style="font-size:10pt;color:#fff;font-weight:500;font-family:'${F.body}',sans-serif;">${broker.name}</div>
            ${broker.title?`<div style="font-size:8pt;color:${C.accent};">${broker.title}</div>`:''}
          </div>`:''}
        </div>
        ${footer()}
      </div>`;
    } else if(isTopBand){
      pages+=`<div class="doc-page" style="background:${C.bg};">
        <div style="background:${C.primary};height:${isLandscape?'2.8in':'3.2in'};position:relative;overflow:hidden;">
          ${hp?`<img src="${hp}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:${photoOpacity};" /><div style="position:absolute;inset:0;background:linear-gradient(${C.primary}60,${C.primary}e0);"></div>`:''}
          <div style="position:relative;z-index:2;padding:${padH};height:100%;display:flex;flex-direction:column;justify-content:flex-end;">
            <div style="font-size:7.5pt;letter-spacing:2.5px;text-transform:uppercase;color:${C.accent};font-family:'${F.heading}',serif;font-weight:600;margin-bottom:10px;">${firm} · ${docLabel}</div>
            <div style="font-family:'${F.heading}',serif;font-size:${isLandscape?'30':'24'}pt;font-weight:${hWt};color:#fff;line-height:1.1;margin-bottom:6px;">${prop.name}</div>
            <div style="font-size:11pt;color:rgba(255,255,255,0.65);">${fullAddr}</div>
          </div>
        </div>
        <div style="padding:${padH};">
          <div style="display:flex;gap:${isLandscape?'0.35in':'0.2in'};flex-wrap:wrap;margin-bottom:16px;">
            ${coverStats.map(([l,v])=>`<div><div style="font-size:6.5pt;letter-spacing:1.5px;text-transform:uppercase;color:${C.secondary};margin-bottom:3px;font-family:'${F.body}',sans-serif;">${l}</div><div style="font-size:${isLandscape?'20':'16'}pt;color:${C.primary};font-weight:600;font-family:'${F.number||F.heading}',serif;">${v}</div></div>`).join('')}
          </div>
          ${broker.name?`<div style="font-size:10pt;color:${C.primary};font-weight:500;">${broker.name}${broker.title?' · '+broker.title:''}${broker.phone?' · '+broker.phone:''}</div>`:''}
        </div>
        ${footer()}
      </div>`;
    } else {
      // Default: full-bleed dark overlay
      pages+=`<div class="doc-page" style="background:${C.primary};">
        ${hp?`<div style="position:absolute;inset:0;">
          <img src="${hp}" style="width:100%;height:100%;object-fit:cover;display:block;opacity:${photoOpacity};" />
          <div style="position:absolute;inset:0;background:linear-gradient(160deg,${H(C.primary,0.15)} 0%,${H(C.primary,0.6)} 40%,${H(C.primary,0.97)} 100%);"></div>
        </div>`:''}
        <div style="position:relative;z-index:2;height:100%;display:flex;flex-direction:column;padding:${padH};padding-bottom:0;">
          <div style="margin-bottom:auto;">
            <div style="font-size:7.5pt;letter-spacing:3px;text-transform:uppercase;color:${C.accent};font-family:'${F.heading}',serif;font-weight:600;margin-bottom:${isLandscape?'0.22in':'0.16in'};">${firm.toUpperCase()} &nbsp;·&nbsp; ${docLabel.toUpperCase()}</div>
            <div style="height:${ovAbH}px;background:${C.accent};width:${isLandscape?'60px':'46px'};margin-bottom:${isLandscape?'16px':'12px'};border-radius:2px;"></div>
            <div style="font-family:'${F.heading}',serif;font-size:${isLandscape?'38':'28'}pt;font-weight:${hWt};color:#fff;line-height:1.05;margin-bottom:8px;max-width:${isLandscape?'6.5in':'4.5in'};letter-spacing:${formality==='luxury'?'-0.5px':'0'};">${prop.name}</div>
            <div style="font-size:${isLandscape?'13':'11'}pt;color:rgba(255,255,255,0.65);margin-bottom:6px;">${fullAddr}</div>
            ${prop.sf||prop.yearBuilt?`<div style="font-size:9pt;color:rgba(255,255,255,0.42);">${prop.sf?fmtNum(prop.sf)+' SF':''}${prop.sf&&prop.yearBuilt?' · ':''}${prop.yearBuilt?'Built '+prop.yearBuilt:''}${prop.zoning?' · '+prop.zoning:''}</div>`:'' }
          </div>
          <div style="border-top:1.5px solid ${H(C.accent,0.45)};padding-top:${isLandscape?'0.15in':'0.12in'};padding-bottom:${isLandscape?'0.3in':'0.25in'};display:flex;gap:${isLandscape?'0.32in':'0.2in'};flex-wrap:wrap;align-items:flex-end;">
            ${coverStats.map(([l,v])=>`<div style="flex-shrink:0;"><div style="font-size:6.5pt;letter-spacing:1.5px;text-transform:uppercase;color:${H(C.accent,0.75)};margin-bottom:3px;font-family:'${F.body}',sans-serif;">${l}</div><div style="font-family:'${F.number||F.heading}',serif;font-size:${isLandscape?'21':'16'}pt;color:#fff;font-weight:600;line-height:1;">${v}</div></div>`).join('')}
            ${broker.name?`<div style="margin-left:auto;text-align:right;align-self:flex-end;">
              <div style="font-size:10pt;color:#fff;font-weight:500;font-family:'${F.body}',sans-serif;">${broker.name}</div>
              ${broker.title?`<div style="font-size:8pt;color:${C.accent};">${broker.title}</div>`:''}
              ${broker.phone?`<div style="font-size:8pt;color:rgba(255,255,255,0.5);">${broker.phone}</div>`:''}
            </div>`:''}
          </div>
          <div class="accent-strip"></div>
        </div>
        ${footer()}
      </div>`;
    }
  }

  // ── HIGHLIGHTS + EXECUTIVE SUMMARY ─────────────────────────
  if(sections.includes('highlights')){
    const lo=getLayout('highlights');
    const ph=nextPhoto();
    const hiList=ai.investmentHighlights?.length?ai.investmentHighlights:(prop.highlights?prop.highlights.split('\n').filter(Boolean):[]);
    const finHi=ai.financialHighlights||[];

    const bulletList=(items,accent=false)=>items.map(h=>
      `<div style="display:flex;align-items:flex-start;gap:9px;padding:${density==='dense'?'5px':'7px'} 0;border-bottom:1px solid ${H(C.rule,0.1)};">
        <div style="width:${accent?8:6}px;height:${accent?8:6}px;border-radius:50%;background:${accent?C.accent:C.secondary};margin-top:4px;flex-shrink:0;"></div>
        <span class="body-text${accent?' hl':''}"> ${h}</span>
      </div>`).join('');

    const sideContent=ph?`
      <div style="border-radius:${ovCorR}px;overflow:hidden;margin-bottom:10px;">${pImg(ph,isLandscape?'1.65in':'2in',false)}</div>
      ${fin.price?sideBox('Offered At','$'+fmtNum(fin.price),fin.capRate?fin.capRate+'% Cap Rate':''):''}
      ${fin.noi?sideBox('NOI','$'+fmtNum(fin.noi),fin.occupancy?fin.occupancy+'% Occupied':''):''}
      ${fin.walt?sideBox('WALT',fin.walt+' Years','Weighted Avg Lease Term'):''}
    `:'';

    const mainContent=`
      ${secHdr('Investment Highlights',docLabel)}
      ${finHi.length?`<div style="margin-bottom:12px;">${bulletList(finHi,true)}</div>`:''}
      ${bulletList(hiList)}
      ${pq(ai.pullQuotes?.[0])}
      ${ai.executiveSummary?`<div style="margin-top:12px;"><div class="eyebrow">Executive Summary</div>${divider()}<div class="body-text">${ai.executiveSummary.slice(0,density==='dense'?700:550)}</div></div>`:''}
    `;
    pages+=pageWrap(mainContent,sideContent,lo?.hasSidebar?'classic':undefined);
  }

  // ── PROPERTY DETAILS ────────────────────────────────────────
  if(sections.includes('property')){
    const lo=getLayout('property');
    const ph=nextPhoto();
    const rows=[['Property Name',prop.name],['Address',fullAddr],['County',prop.county],['Property Type',S.propType],['Year Built',prop.yearBuilt],['Building SF',prop.sf?fmtNum(prop.sf)+' SF':''],['Lot Size',prop.acres?prop.acres+' Acres':''],['Buildings',prop.buildings],['Suites / Units',prop.units],['Zoning',prop.zoning],['Clear Height',prop.clearHeight?prop.clearHeight+' ft':''],['Parking',prop.parking?prop.parking+' spaces':'']].filter(([,v])=>v);

    // Photo position from template or prop
    const phPos = lo?.photoPosition||'inset-right';
    const inset = ph&&phPos.includes('inset') ? insetPh(ph,isLandscape?'42%':'38%',phPos.includes('left')?'left':'right') : '';
    const topPh = ph&&phPos==='top' ? `<div style="height:${isLandscape?'1.8in':'2.2in'};margin-bottom:14px;border-radius:${ovCorR}px;overflow:hidden;">${pImg(ph,'100%',false)}</div>` : '';

    const table=`<table style="width:100%;border-collapse:collapse;font-size:${bfs-1}pt;clear:both;">
      ${rows.map((r,i)=>`<tr style="background:${i%2===0?H(C.primary,0.04):'transparent'};">
        <td style="padding:${density==='dense'?'6':'8'}px 10px;font-weight:600;color:${C.primary};width:36%;border-bottom:1px solid ${H(C.rule,0.12)};">${r[0]}</td>
        <td style="padding:${density==='dense'?'6':'8'}px 10px;border-bottom:1px solid ${H(C.rule,0.12)};">${r[1]}</td>
      </tr>`).join('')}
    </table>`;

    const sideContent=ph&&!phPos.includes('inset')&&!['top'].includes(phPos)?`
      <div style="border-radius:${ovCorR}px;overflow:hidden;margin-bottom:10px;">${pImg(ph,isLandscape?'1.8in':'2.2in',false)}</div>
      ${ai.propertyDescription?`<div class="body-text" style="font-size:${bfs-1}pt;">${ai.propertyDescription.slice(0,280)}</div>`:''}
    `:'';

    const main=`
      ${secHdr('Property Details',docLabel)}
      ${topPh}
      ${ph&&phPos.includes('inset')?inset:''}
      ${ai.propertyDescription&&!phPos.includes('right')?`<div class="body-text" style="margin-bottom:14px;">${ai.propertyDescription.slice(0,density==='dense'?500:380)}</div>`:''}
      ${table}
      ${pq(ai.pullQuotes?.[1])}
    `;
    pages+=pageWrap(main,sideContent,lo?.hasSidebar?'classic':undefined);
  }

  // ── PHOTOS ──────────────────────────────────────────────────
  if(sections.includes('photos')&&photos.length>0){
    const batch=[]; let p;
    while((p=nextPhoto())&&batch.length<6) batch.push(p);
    if(!batch.length&&photos[0]) batch.push(photos[0]);
    pages+=photoPage(batch);

    // If more photos remain, add a second photo page
    const batch2=[]; let p2;
    while((p2=nextPhoto())&&batch2.length<6) batch2.push(p2);
    if(batch2.length) pages+=photoPage(batch2);
  }

  // ── LOCATION + MAP ──────────────────────────────────────────
  if(sections.includes('location')){
    const lo=getLayout('location');
    const locPh=nextPhoto();
    const locText=ai.locationOverview||`${prop.city}, ${prop.state} offers strong fundamentals for commercial real estate investment. The subject property benefits from its strategic location within the ${prop.city} submarket, providing excellent access to major thoroughfares and a deep regional tenant base.`;
    const mktCtx=ai.marketContext||'';

    // Use real Mapbox snapshot if saved from Map Generator, else canvas fallback
    const hasRealMap = !!S.mapSnapshot;
    const mapHtml = hasRealMap
      ? `<img src="${S.mapSnapshot}" style="width:100%;border-radius:${ovCorR}px;display:block;margin-top:10px;" />`
      : `<canvas id="loc-map" width="${isLandscape?320:280}" height="190" style="border-radius:${ovCorR}px;display:block;width:100%;margin-top:10px;"></canvas>${mapCanvasScript('loc-map',prop.address)}`;
    const mapCaption = hasRealMap
      ? `<div style="margin-top:5px;font-size:7pt;color:${H(C.text,0.6)};font-style:italic;">Property location · ${parseFloat(document.getElementById('map-radius')?.value||1)} mile radius shown</div>`
      : `<div style="margin-top:5px;font-size:7pt;color:${H(C.text,0.6)};font-style:italic;">Approximate location map</div>`;

    // Build comp summary if comps exist
    const compSummary = MAP.comps.length
      ? `<div style="margin-top:10px;"><div style="font-size:7pt;text-transform:uppercase;letter-spacing:1px;color:${C.secondary};margin-bottom:6px;font-weight:600;">Comparable Properties</div>
          ${MAP.comps.slice(0,4).map(c=>`<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid ${H(C.rule,0.1)};font-size:8pt;">
            <span style="font-weight:500;color:${C.primary};">${c.name}</span>
            <span style="color:${C.secondary};">${[c.price,c.capRate].filter(Boolean).join(' · ')}</span>
          </div>`).join('')}
        </div>`
      : '';

    const sideContent=useSidebar?`
      ${mapHtml}
      ${mapCaption}
      ${locPh?`<div style="margin-top:10px;border-radius:${ovCorR}px;overflow:hidden;">${pImg(locPh,'1.3in',false)}</div>`:''}
      <div style="margin-top:10px;background:${H(C.secondary,0.08)};border-left:3px solid ${C.secondary};padding:8px 10px;border-radius:0 ${ovCorR}px ${ovCorR}px 0;">
        <div style="font-size:7pt;text-transform:uppercase;letter-spacing:1px;color:${C.secondary};margin-bottom:3px;font-family:'${F.body}',sans-serif;">Location</div>
        <div style="font-size:8.5pt;color:${C.text};line-height:1.5;">${fullAddr}${prop.county?'<br>'+prop.county:''}</div>
      </div>
      ${compSummary}
    `:'';

    const main=`
      ${secHdr('Location & Market Overview',docLabel)}
      ${locPh&&!useSidebar?`<div style="height:${isLandscape?'1.7in':'2in'};margin-bottom:13px;border-radius:${ovCorR}px;overflow:hidden;">${pImg(locPh,'100%',false)}</div>`:''}
      <div class="body-text">${locText}</div>
      ${mktCtx?`<div class="callout-box"><div class="body-text" style="font-style:italic;">${mktCtx}</div></div>`:''}
      ${!useSidebar?`${mapHtml}${mapCaption}${compSummary}`:''}
    `;
    pages+=pageWrap(main,sideContent,lo?.hasSidebar?'classic':undefined);
  }

  // ── FINANCIAL SUMMARY ────────────────────────────────────────
  if(sections.includes('financials')){
    const lo=getLayout('financials');
    const ef=S.extractedFin||{};
    const cards=[
      fin.price    &&['Asking Price','$'+fmtNum(fin.price)],
      fin.ppsf     &&['Price / SF',  '$'+fin.ppsf],
      fin.noi      &&['NOI',         '$'+fmtNum(fin.noi)],
      fin.capRate  &&['Cap Rate',    fin.capRate+'%'],
      fin.occupancy&&['Occupancy',   fin.occupancy+'%'],
      fin.walt     &&['WALT',        fin.walt+' Yrs'],
      (ef.finDscr||fin.dscr)&&['DSCR',ef.finDscr||fin.dscr||'—'],
      ef.finCashOnCash&&['Cash-on-Cash',ef.finCashOnCash],
    ].filter(Boolean);

    const expBD=(ef.expenseBreakdown||[]).filter(e=>e.item&&e.amount);
    const rowH=`${pp.tableRowHeightPt||20}pt`;

    const incomeTable=`<table style="width:100%;border-collapse:collapse;font-size:${bfs-0.5}pt;">
      <thead><tr style="background:${C.primary};">
        <th style="padding:7px 10px;color:#fff;text-align:left;font-weight:500;font-size:7.5pt;font-family:'${F.body}',sans-serif;">Income Statement</th>
        <th style="padding:7px 10px;color:#fff;text-align:right;font-weight:500;font-size:7.5pt;font-family:'${F.body}',sans-serif;">Annual</th>
      </tr></thead>
      <tbody>
        ${fin.gpr?`<tr><td style="padding:7px 10px;border-bottom:1px solid ${H(C.rule,0.13)};">Gross Potential Rent</td><td style="padding:7px 10px;text-align:right;border-bottom:1px solid ${H(C.rule,0.13)};">$${fmtNum(fin.gpr)}</td></tr>`:''}
        ${fin.vacancy?`<tr style="background:${H(C.primary,0.03)};"><td style="padding:7px 10px;border-bottom:1px solid ${H(C.rule,0.13)};">Less: Vacancy (${fin.vacancy}%)</td><td style="padding:7px 10px;text-align:right;border-bottom:1px solid ${H(C.rule,0.13)};color:#cc3333;">($${fmtNum(Math.round(parseFloat(fin.gpr||0)*parseFloat(fin.vacancy||0)/100))})</td></tr>`:''}
        ${fin.egi?`<tr><td style="padding:7px 10px;border-bottom:1px solid ${H(C.rule,0.13)};">Effective Gross Income</td><td style="padding:7px 10px;text-align:right;border-bottom:1px solid ${H(C.rule,0.13)};">$${fmtNum(fin.egi)}</td></tr>`:''}
        ${fin.opex?`<tr style="background:${H(C.primary,0.03)};"><td style="padding:7px 10px;border-bottom:1px solid ${H(C.rule,0.13)};">Less: Operating Expenses</td><td style="padding:7px 10px;text-align:right;border-bottom:1px solid ${H(C.rule,0.13)};color:#cc3333;">($${fmtNum(fin.opex)})</td></tr>`:''}
        ${expBD.map(e=>`<tr><td style="padding:4px 10px 4px 22px;border-bottom:1px solid ${H(C.rule,0.08)};font-size:${bfs-1.5}pt;opacity:0.8;">— ${e.item}</td><td style="padding:4px 10px;text-align:right;border-bottom:1px solid ${H(C.rule,0.08)};font-size:${bfs-1.5}pt;">$${fmtNum(e.amount)}</td></tr>`).join('')}
        ${fin.noi?`<tr class="fin-row-hi"><td style="padding:8px 10px;">Net Operating Income</td><td class="fin-val" style="padding:8px 10px;text-align:right;">$${fmtNum(fin.noi)}</td></tr>`:''}
        ${fin.debtService?`<tr><td style="padding:7px 10px;border-bottom:1px solid ${H(C.rule,0.13)};">Annual Debt Service</td><td style="padding:7px 10px;text-align:right;border-bottom:1px solid ${H(C.rule,0.13)};">$${fmtNum(fin.debtService)}</td></tr>`:''}
        ${ef.recentCapex?`<tr style="background:${H(C.accent,0.1)};"><td style="padding:7px 10px;font-weight:500;">Recent CapEx</td><td style="padding:7px 10px;text-align:right;font-weight:500;">${ef.recentCapex}</td></tr>`:''}
        ${ef.additionalNotes?`<tr><td colspan="2" style="padding:7px 10px;font-size:${bfs-1.5}pt;font-style:italic;opacity:0.7;">${ef.additionalNotes}</td></tr>`:''}
      </tbody>
    </table>`;

    const main=`
      ${secHdr('Financial Summary',docLabel)}
      ${statCards(cards.slice(0,isLandscape?4:3))}
      ${cards.length>(isLandscape?4:3)?statCards(cards.slice(isLandscape?4:3)):''}
      ${pq(ai.pullQuotes?.[2])}
      ${incomeTable}
    `;
    pages+=pageWrap(main,'',lo?.hasSidebar?'classic':undefined);
  }

  // ── RENT ROLL ─────────────────────────────────────────────
  if(sections.includes('rentroll')&&rentRoll.length>0){
    const main=`
      ${secHdr('Rent Roll',docLabel)}
      <table style="width:100%;border-collapse:collapse;font-size:${bfs-1}pt;">
        <thead><tr style="background:${C.primary};">
          ${['Tenant','Suite','SF','Lease Start','Lease End','Annual Rent','$/SF'].map(h=>`<th style="padding:7px 9px;color:#fff;text-align:left;font-weight:500;font-size:7pt;font-family:'${F.body}',sans-serif;">${h}</th>`).join('')}
        </tr></thead>
        <tbody>
          ${rentRoll.map((r,i)=>{
            const rpsf=r.sf&&r.annualRent?'$'+(parseFloat(r.annualRent)/parseFloat(r.sf)).toFixed(2):'—';
            const anchor=parseFloat(r.annualRent)>parseFloat(fin.gpr||0)*0.28;
            return `<tr style="background:${i%2===0?H(C.primary,0.04):'transparent'};${anchor?`border-left:3px solid ${C.accent};`:''}" >
              <td style="padding:7px 9px;border-bottom:1px solid ${H(C.rule,0.1)};font-weight:${anchor?'600':'400'};color:${anchor?C.primary:C.text};">${r.tenant}</td>
              <td style="padding:7px 9px;border-bottom:1px solid ${H(C.rule,0.1)};">${r.suite||'—'}</td>
              <td style="padding:7px 9px;border-bottom:1px solid ${H(C.rule,0.1)};">${r.sf?fmtNum(r.sf):'—'}</td>
              <td style="padding:7px 9px;border-bottom:1px solid ${H(C.rule,0.1)};">${r.leaseStart||'—'}</td>
              <td style="padding:7px 9px;border-bottom:1px solid ${H(C.rule,0.1)};">${r.leaseEnd||'—'}</td>
              <td style="padding:7px 9px;border-bottom:1px solid ${H(C.rule,0.1)};font-family:'${F.number||F.heading}',serif;font-weight:${anchor?'600':'400'};">${r.annualRent?'$'+fmtNum(r.annualRent):'—'}</td>
              <td style="padding:7px 9px;border-bottom:1px solid ${H(C.rule,0.1)};font-family:'${F.number||F.heading}',serif;">${rpsf}</td>
            </tr>`;
          }).join('')}
          ${rentRoll.length>1?`<tr style="background:${C.primary};">
            <td colspan="2" style="padding:7px 9px;color:#fff;font-weight:600;">Totals</td>
            <td style="padding:7px 9px;color:#fff;">${fmtNum(rentRoll.reduce((s,r)=>s+parseFloat(r.sf||0),0))} SF</td>
            <td colspan="2"></td>
            <td style="padding:7px 9px;color:${C.accent};font-family:'${F.number||F.heading}',serif;font-weight:600;">${fin.gpr?'$'+fmtNum(fin.gpr)+'/yr':''}</td>
            <td style="padding:7px 9px;color:#fff;">${fin.ppsf?'$'+fin.ppsf:''}</td>
          </tr>`:''}
        </tbody>
      </table>
      ${ai.tenantSummary?`<div class="callout-box" style="margin-top:10px;"><div class="body-text" style="font-size:${bfs-1}pt;">${ai.tenantSummary.slice(0,280)}</div></div>`:''}
    `;
    pages+=pageWrap(main,'');
  }

  // ── TENANT SUMMARY (standalone, no rent roll) ─────────────
  if(sections.includes('tenants')&&!sections.includes('rentroll')){
    const t=ai.tenantSummary||`The property is ${fin.occupancy?fin.occupancy+'% occupied':'currently occupied'}${fin.walt?' with a weighted average lease term of '+fin.walt+' years':''}.`;
    pages+=pageWrap(`${secHdr('Tenant Summary',docLabel)}<div class="body-text">${t}</div>`,'');
  }

  // ── VALUATION ────────────────────────────────────────────
  if(sections.includes('valuation')){
    const vText=ai.valuationNarrative||`${S.docType==='om'?'The Seller is offering the property':'Based on our analysis, the estimated value is'} ${fin.price?'$'+fmtNum(fin.price):'to be determined'}${fin.capRate?', representing a '+fin.capRate+'% capitalization rate':''}${fin.noi?' on an NOI of $'+fmtNum(fin.noi):''}. ${ai.marketContext||''}`;
    const valPh=nextPhoto();
    const valBox=(fin.price||fin.capRate)?`
      <div style="background:${C.primary};border-radius:${ovCorR}px;padding:${isLandscape?'16px 20px':'12px 16px'};margin-top:14px;display:flex;justify-content:space-around;align-items:center;flex-wrap:wrap;gap:12px;">
        ${fin.price?`<div style="text-align:center;"><div style="font-size:7pt;letter-spacing:1.5px;text-transform:uppercase;color:${C.accent};margin-bottom:3px;font-family:'${F.body}',sans-serif;">Offered At</div><div style="font-size:${isLandscape?'26':'20'}pt;color:#fff;font-weight:600;font-family:'${F.number||F.heading}',serif;">${fmtDollar(fin.price)||''}</div></div>`:''}
        ${fin.ppsf?`<div style="text-align:center;"><div style="font-size:7pt;letter-spacing:1.5px;text-transform:uppercase;color:${C.accent};margin-bottom:3px;font-family:'${F.body}',sans-serif;">Price / SF</div><div style="font-size:${isLandscape?'20':'16'}pt;color:#fff;font-weight:600;font-family:'${F.number||F.heading}',serif;">$${fin.ppsf}</div></div>`:''}
        ${fin.capRate?`<div style="text-align:center;"><div style="font-size:7pt;letter-spacing:1.5px;text-transform:uppercase;color:${C.accent};margin-bottom:3px;font-family:'${F.body}',sans-serif;">Cap Rate</div><div style="font-size:${isLandscape?'20':'16'}pt;color:#fff;font-weight:600;font-family:'${F.number||F.heading}',serif;">${fin.capRate}%</div></div>`:''}
        ${fin.noi?`<div style="text-align:center;"><div style="font-size:7pt;letter-spacing:1.5px;text-transform:uppercase;color:${C.accent};margin-bottom:3px;font-family:'${F.body}',sans-serif;">NOI</div><div style="font-size:${isLandscape?'20':'16'}pt;color:#fff;font-weight:600;font-family:'${F.number||F.heading}',serif;">${fmtDollar(fin.noi)||''}</div></div>`:''}
      </div>`:'' ;

    const main=`
      ${secHdr('Valuation & Pricing',docLabel)}
      ${valPh?`<div style="height:${isLandscape?'1.5in':'1.8in'};margin-bottom:12px;border-radius:${ovCorR}px;overflow:hidden;">${pImg(valPh,'100%',false)}</div>`:''}
      <div class="body-text">${vText}</div>
      ${valBox}
    `;
    pages+=pageWrap(main,'');
  }

  // ── TEAM PAGE ────────────────────────────────────────────
  if(sections.includes('team')&&selBrokers.length>0){
    const cols=Math.min(selBrokers.length,isLandscape?3:2);
    const teamCards=selBrokers.map(b=>`
      <div style="background:${H(C.primary,0.04)};border:1px solid ${H(C.rule,0.18)};border-radius:${ovCorR}px;padding:16px;display:flex;flex-direction:column;align-items:center;text-align:center;">
        ${b.photo
          ?`<img src="${b.photo}" style="width:72px;height:72px;border-radius:50%;object-fit:cover;border:3px solid ${C.accent};margin-bottom:10px;" />`
          :`<div style="width:72px;height:72px;border-radius:50%;background:${C.primary};border:3px solid ${C.accent};margin:0 auto 10px;display:flex;align-items:center;justify-content:center;font-family:'${F.heading}',serif;font-size:26px;font-weight:600;color:#fff;">${(b.name||'?')[0]}</div>`}
        <div style="font-family:'${F.heading}',serif;font-size:13pt;font-weight:500;color:${C.primary};margin-bottom:3px;">${b.name}</div>
        <div style="font-size:9pt;color:${C.secondary};margin-bottom:7px;">${b.title||''}</div>
        ${b.spec?`<div style="font-size:8pt;color:${H(C.text,0.7)};margin-bottom:7px;">${b.spec}</div>`:''}
        <div style="font-size:8.5pt;color:${C.text};line-height:1.7;">${[b.phone,b.email,b.license].filter(Boolean).join('<br>')}</div>
        ${b.bio?`<div style="font-size:8pt;color:${H(C.text,0.65)};line-height:1.6;margin-top:8px;border-top:1px solid ${H(C.rule,0.15)};padding-top:8px;">${b.bio.slice(0,200)}</div>`:''}
      </div>`).join('');

    pages+=pageWrap(`
      ${secHdr('Our Team',docLabel)}
      <div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:${isLandscape?'0.22in':'0.18in'};">${teamCards}</div>
    `,'');
  }

  // ── DISCLAIMER ──────────────────────────────────────────
  if(sections.includes('disclaimer')){
    pages+=pageWrap(`
      ${secHdr('Disclaimer & Confidentiality',docLabel)}
      <div style="font-size:8.5pt;color:${C.text};opacity:0.65;line-height:1.8;">${disclaimer}</div>
      ${broker.name?`<div style="margin-top:18px;padding:12px 14px;background:${H(C.primary,0.05)};border-radius:${ovCorR}px;border-top:3px solid ${C.accent};">
        <div style="font-weight:600;color:${C.primary};font-size:10pt;font-family:'${F.body}',sans-serif;">${broker.name}</div>
        ${broker.title?`<div style="color:${C.secondary};font-size:9pt;">${broker.title}</div>`:''}
        <div style="margin-top:5px;font-size:8.5pt;color:${C.text};">${[broker.phone,broker.email,broker.license].filter(Boolean).join(' · ')}</div>
        <div style="margin-top:3px;font-size:8.5pt;color:${H(C.text,0.6)};">${firm} · ${city}</div>
      </div>`:''}
    `,'');
  }

  return pages;
}



// ══════════════════════════════════════════════════════════════
// SESSION 4 — Map Generator (Mapbox GL JS)
// Full implementation: geocoding, radius circles, amenity search
// via Mapbox Places API, comp pinning, custom styled markers,
// pin management, and canvas export.
// ══════════════════════════════════════════════════════════════

const MAP = {
  instance:      null,
  token:         '',
  center:        [-104.9903, 39.7392], // Denver default
  zoom:          13,
  subjectLng:    null,
  subjectLat:    null,
  subjectMarker: null,
  radiusLayerId: 'radius-layer',
  pins:          [],   // {id, name, address, lng, lat, color, type, marker}
  comps:         [],   // {id, name, address, price, sf, ppsf, capRate, type, color, lng, lat, marker}
  nextId:        1,
};

// Marker colours by type
const PIN_COLORS = {
  subject:  '#001a4d',
  amenity:  '#1D9E75',
  comp_sale:'#D85A30',
  comp_lease:'#7F77DD',
  comp_active:'#F5A623',
  custom:   '#0057b8',
};

// ── Map initialisation ───────────────────────────────────────
async function initMap() {
  const container = document.getElementById('mapbox-container');
  if (!container) return;
  if (MAP.instance) { MAP.instance.resize(); return; }

  // Load token from server if not already loaded
  if (!MAP.token) {
    try {
      const r = await fetch('/api/config');
      const d = await r.json();
      MAP.token = d.mapboxToken || '';
    } catch (e) {}
  }

  const overlay = document.getElementById('map-overlay-msg');

  if (!MAP.token) {
    if (overlay) overlay.innerHTML = `
      <div style="font-size:13px;color:#cc3333;font-weight:500;">Mapbox token not configured</div>
      <div style="font-size:11px;color:var(--text-muted);margin-top:6px;">Add <code>MAPBOX_TOKEN</code> to your Render environment variables, then redeploy.</div>`;
    return;
  }

  if (overlay) overlay.style.display = 'none';

  mapboxgl.accessToken = MAP.token;

  MAP.instance = new mapboxgl.Map({
    container: 'mapbox-container',
    style: 'mapbox://styles/mapbox/streets-v12',
    center: MAP.center,
    zoom: MAP.zoom,
    attributionControl: false,
  });

  MAP.instance.addControl(new mapboxgl.NavigationControl({ showCompass: true }), 'top-right');
  MAP.instance.addControl(new mapboxgl.ScaleControl({ unit: 'imperial' }), 'bottom-left');
  MAP.instance.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-right');

  MAP.instance.on('load', () => {
    // Add radius source/layer (empty until subject is set)
    MAP.instance.addSource('radius', { type: 'geojson', data: emptyGeoJson() });
    MAP.instance.addLayer({ id: 'radius-fill', type: 'fill', source: 'radius', paint: { 'fill-color': '#0057b8', 'fill-opacity': 0.06 } });
    MAP.instance.addLayer({ id: 'radius-line', type: 'line', source: 'radius', paint: { 'line-color': '#c8a96e', 'line-width': 2, 'line-dasharray': [5, 3] } });
  });
}

function emptyGeoJson() {
  return { type: 'FeatureCollection', features: [] };
}

// ── Subject property geocoding ───────────────────────────────
async function geocodeAddress() {
  const addr = document.getElementById('map-address')?.value?.trim();
  if (!addr) return toast('Enter an address first');
  if (!MAP.token) return toast('Mapbox token not configured');
  if (!MAP.instance) { await initMap(); if (!MAP.instance) return; }

  try {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(addr)}.json?access_token=${MAP.token}&limit=1&country=us`;
    const r = await fetch(url);
    const d = await r.json();
    if (!d.features?.length) return toast('Address not found — try a more specific address');

    const [lng, lat] = d.features[0].center;
    const placeName = d.features[0].place_name;
    MAP.subjectLng = lng;
    MAP.subjectLat = lat;

    MAP.instance.flyTo({ center: [lng, lat], zoom: 14, speed: 1.2 });

    // Remove old subject marker
    if (MAP.subjectMarker) MAP.subjectMarker.remove();

    // Create styled subject marker
    const el = document.createElement('div');
    el.style.cssText = `width:20px;height:20px;border-radius:50%;background:${PIN_COLORS.subject};border:3px solid #c8a96e;box-shadow:0 2px 8px rgba(0,0,0,0.35);cursor:pointer;`;
    MAP.subjectMarker = new mapboxgl.Marker({ element: el, anchor: 'center' })
      .setLngLat([lng, lat])
      .setPopup(new mapboxgl.Popup({ offset: 25, maxWidth: '260px' }).setHTML(
        `<div style="font-family:Inter,sans-serif;"><div style="font-weight:600;color:#0a1628;margin-bottom:3px;">Subject Property</div><div style="font-size:11px;color:#4a5a7a;">${placeName}</div></div>`
      ))
      .addTo(MAP.instance);

    updateRadiusCircle();
    renderPinsList();
    toast('Location set — radius circle drawn');
  } catch (e) {
    toast('Geocoding failed: ' + e.message);
  }
}

// ── Radius circle ────────────────────────────────────────────
function updateRadius() { updateRadiusCircle(); }

function updateRadiusCircle() {
  if (!MAP.instance || !MAP.subjectLng || !MAP.subjectLat) return;
  if (!MAP.instance.getSource('radius')) return;

  const radiusMi = parseFloat(document.getElementById('map-radius')?.value) || 1;
  const radiusKm = radiusMi * 1.60934;
  const center = [MAP.subjectLng, MAP.subjectLat];
  const points = 80;

  const coords = Array.from({ length: points + 1 }, (_, i) => {
    const angle = (i / points) * 2 * Math.PI;
    const dx = (radiusKm / 111.32) / Math.cos(MAP.subjectLat * Math.PI / 180) * Math.cos(angle);
    const dy = (radiusKm / 110.574) * Math.sin(angle);
    return [center[0] + dx, center[1] + dy];
  });

  MAP.instance.getSource('radius').setData({
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: [coords] },
  });

  // Update radius label
  const label = document.getElementById('map-radius');
  if (label) label.title = `${radiusMi} mile radius`;
}

// ── Map style ────────────────────────────────────────────────
function changeMapStyle(styleId) {
  if (!MAP.instance) return;
  MAP.instance.setStyle(`mapbox://styles/${styleId}`);
  // Re-add radius source after style load
  MAP.instance.once('style.load', () => {
    MAP.instance.addSource('radius', { type: 'geojson', data: emptyGeoJson() });
    MAP.instance.addLayer({ id: 'radius-fill', type: 'fill', source: 'radius', paint: { 'fill-color': '#0057b8', 'fill-opacity': 0.06 } });
    MAP.instance.addLayer({ id: 'radius-line', type: 'line', source: 'radius', paint: { 'line-color': '#c8a96e', 'line-width': 2, 'line-dasharray': [5, 3] } });
    if (MAP.subjectLng) updateRadiusCircle();
  });
}

// ── Amenity search (Mapbox Places API) ──────────────────────
async function searchNearby() {
  const query = document.getElementById('amenity-input')?.value?.trim();
  if (!query) return;
  if (!MAP.subjectLng) return toast('Set a subject property location first');
  if (!MAP.instance) return;

  const resultsEl = document.getElementById('amenity-results');
  if (resultsEl) resultsEl.innerHTML = `<div style="font-size:12px;color:var(--text-muted);padding:8px 0;">${spinHTML()}Searching nearby...</div>`;

  const radiusMi = parseFloat(document.getElementById('map-radius')?.value || 1);
  const radiusM  = Math.round(radiusMi * 1609);
  let results = [];

  // ── Try Mapbox Places first ──────────────────────────────────
  if (MAP.token) {
    try {
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${MAP.token}&proximity=${MAP.subjectLng},${MAP.subjectLat}&bbox=${bboxFromCenter(MAP.subjectLng,MAP.subjectLat,radiusM)}&limit=10&types=poi,address`;
      const r = await fetch(url);
      const d = await r.json();
      if (d.features?.length) {
        results = d.features.map(f => ({
          name: f.text || f.place_name.split(',')[0],
          address: f.place_name,
          lng: f.center[0],
          lat: f.center[1],
          dist: distanceMi(MAP.subjectLat, MAP.subjectLng, f.center[1], f.center[0]),
        }));
      }
    } catch (e) { /* fall through to Google */ }
  }

  // ── Fall back to Google Places via server proxy ───────────────
  if (results.length < 3) {
    try {
      const r = await fetch('/api/places-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, lat: MAP.subjectLat, lng: MAP.subjectLng, radius: radiusM }),
      });
      const d = await r.json();
      if (d.ok && d.results?.length) {
        // Merge with mapbox results, deduplicate by name proximity
        const googleResults = d.results
          .filter(g => g.lat && g.lng)
          .map(g => ({
            name: g.name,
            address: g.address,
            lng: g.lng,
            lat: g.lat,
            dist: distanceMi(MAP.subjectLat, MAP.subjectLng, g.lat, g.lng),
            rating: g.rating,
          }));
        // Only add Google results not already in Mapbox results
        googleResults.forEach(g => {
          if (!results.some(m => m.name.toLowerCase()===g.name.toLowerCase())) {
            results.push(g);
          }
        });
      }
    } catch (e) { /* Google not configured — that's ok */ }
  }

  // ── Sort by distance ─────────────────────────────────────────
  results.sort((a, b) => (a.dist||0) - (b.dist||0));

  if (!results.length) {
    if (resultsEl) resultsEl.innerHTML = '<div style="font-size:12px;color:var(--text-muted);padding:8px 0;">No results found. Try a different search term.</div>';
    return;
  }

  if (resultsEl) {
    resultsEl.innerHTML = results.slice(0, 10).map(f => {
      const safeName = (f.name||'').replace(/'/g,"\\'").replace(/"/g,'&quot;');
      const safeAddr = (f.address||'').replace(/'/g,"\\'").replace(/"/g,'&quot;');
      const distStr  = f.dist != null ? `${f.dist.toFixed(2)} mi` : '';
      const rating   = f.rating ? ` · ★${f.rating}` : '';
      return `<div class="amenity-result-item">
        <div style="flex:1;">
          <div class="amenity-name">${f.name}</div>
          <div class="amenity-addr">${(f.address||'').slice(0,55)}${(f.address||'').length>55?'...':''} ${distStr?'· '+distStr:''}${rating}</div>
        </div>
        <button class="amenity-add-btn" onclick="addAmenityPin('${safeName}','${safeAddr}',${f.lng},${f.lat})">+ Pin</button>
      </div>`;
    }).join('');
  }
}

function quickSearch(type) {
  const el = document.getElementById('amenity-input');
  if (el) el.value = type;
  searchNearby();
}

// Compute bounding box string for Mapbox API
function bboxFromCenter(lng, lat, radiusM) {
  const latDeg = radiusM / 111320;
  const lngDeg = radiusM / (111320 * Math.cos(lat * Math.PI / 180));
  return `${lng-lngDeg},${lat-latDeg},${lng+lngDeg},${lat+latDeg}`;
}

// Haversine distance in miles
function distanceMi(lat1, lng1, lat2, lng2) {
  const R = 3958.8;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// ── Add amenity pin ──────────────────────────────────────────
function addAmenityPin(name, address, lng, lat) {
  if (!MAP.instance) return;
  const color = PIN_COLORS.amenity;
  const el = document.createElement('div');
  el.style.cssText = `width:13px;height:13px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.3);cursor:pointer;`;
  const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
    .setLngLat([lng, lat])
    .setPopup(new mapboxgl.Popup({ offset: 18, maxWidth: '240px' }).setHTML(
      `<div style="font-family:Inter,sans-serif;"><div style="font-weight:600;font-size:12px;color:#0a1628;">${name}</div><div style="font-size:10px;color:#4a5a7a;margin-top:2px;">${address}</div><div style="font-size:10px;color:#7a8aaa;margin-top:2px;">${distanceMi(MAP.subjectLat,MAP.subjectLng,lat,lng).toFixed(2)} mi from subject</div></div>`
    ))
    .addTo(MAP.instance);

  const id = MAP.nextId++;
  MAP.pins.push({ id, name, address, lng, lat, color, type: 'amenity', marker });
  renderPinsList();
  toast(`Pinned: ${name}`);
}

// ── Comp management ──────────────────────────────────────────
function toggleCompForm() {
  const f = document.getElementById('comp-form');
  if (f) f.style.display = f.style.display === 'none' ? 'block' : 'none';
}

async function addComp() {
  const name    = document.getElementById('comp-name')?.value?.trim() || 'Comp';
  const addr    = document.getElementById('comp-address')?.value?.trim();
  const price   = document.getElementById('comp-price')?.value?.trim();
  const sf      = document.getElementById('comp-sf')?.value?.trim();
  const ppsf    = document.getElementById('comp-ppsf')?.value?.trim();
  const capRate = document.getElementById('comp-caprate')?.value?.trim();
  const type    = document.getElementById('comp-type')?.value || 'sale';

  if (!addr) return toast('Enter a property address');
  if (!MAP.token) return toast('Mapbox token not configured');
  if (!MAP.instance) return;

  try {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(addr)}.json?access_token=${MAP.token}&limit=1&country=us`;
    const r = await fetch(url);
    const d = await r.json();
    if (!d.features?.length) return toast('Address not found');

    const [lng, lat] = d.features[0].center;
    const color = PIN_COLORS[`comp_${type}`] || PIN_COLORS.comp_sale;

    // Comp marker — square shape to distinguish from amenity circles
    const el = document.createElement('div');
    el.style.cssText = `width:14px;height:14px;background:${color};border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.3);cursor:pointer;border-radius:2px;`;
    const popupHtml = `<div style="font-family:Inter,sans-serif;">
      <div style="font-weight:600;font-size:12px;color:#0a1628;">${name}</div>
      <div style="font-size:10px;color:#4a5a7a;margin-top:2px;">${addr}</div>
      <div style="margin-top:6px;display:grid;grid-template-columns:1fr 1fr;gap:4px;">
        ${price?`<div><div style="font-size:9px;color:#7a8aaa;text-transform:uppercase;letter-spacing:0.5px;">Price</div><div style="font-size:11px;font-weight:600;">${price}</div></div>`:''}
        ${sf?`<div><div style="font-size:9px;color:#7a8aaa;text-transform:uppercase;letter-spacing:0.5px;">SF</div><div style="font-size:11px;font-weight:600;">${sf}</div></div>`:''}
        ${ppsf?`<div><div style="font-size:9px;color:#7a8aaa;text-transform:uppercase;letter-spacing:0.5px;">$/SF</div><div style="font-size:11px;font-weight:600;">${ppsf}</div></div>`:''}
        ${capRate?`<div><div style="font-size:9px;color:#7a8aaa;text-transform:uppercase;letter-spacing:0.5px;">Cap Rate</div><div style="font-size:11px;font-weight:600;">${capRate}</div></div>`:''}
      </div>
      <div style="font-size:9px;color:#7a8aaa;margin-top:4px;text-transform:capitalize;">${type.replace('_',' ')} · ${MAP.subjectLat?distanceMi(MAP.subjectLat,MAP.subjectLng,lat,lng).toFixed(2)+' mi':''}</div>
    </div>`;

    const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
      .setLngLat([lng, lat])
      .setPopup(new mapboxgl.Popup({ offset: 18, maxWidth: '280px' }).setHTML(popupHtml))
      .addTo(MAP.instance);

    const id = MAP.nextId++;
    const comp = { id, name, address: addr, price, sf, ppsf, capRate, type, color, lng, lat, marker };
    MAP.comps.push(comp);
    MAP.pins.push({ id: MAP.nextId++, name, address: addr, lng, lat, color, type: 'comp', marker: null });

    renderCompList();
    renderPinsList();
    toggleCompForm();

    // Clear form
    ['comp-name','comp-address','comp-price','comp-sf','comp-ppsf','comp-caprate'].forEach(id=>{
      const el = document.getElementById(id); if(el) el.value='';
    });
    toast(`Comp added: ${name}`);
  } catch (e) { toast('Error: ' + e.message); }
}

function removeComp(id) {
  const comp = MAP.comps.find(c=>c.id===id);
  if (comp?.marker) comp.marker.remove();
  MAP.comps = MAP.comps.filter(c=>c.id!==id);
  renderCompList();
  renderPinsList();
}

function renderCompList() {
  const el = document.getElementById('comp-list');
  if (!el) return;
  if (!MAP.comps.length) { el.innerHTML = ''; return; }
  el.innerHTML = MAP.comps.map(c=>`
    <div class="comp-item">
      <div class="comp-dot" style="background:${c.color};"></div>
      <div class="comp-info">
        <div class="comp-name-text">${c.name}</div>
        <div class="comp-detail">${[c.price, c.sf?c.sf+' SF':'', c.ppsf, c.capRate].filter(Boolean).join(' · ')}</div>
      </div>
      <button class="comp-remove" onclick="removeComp(${c.id})">×</button>
    </div>`).join('');
}

// ── Pin list ─────────────────────────────────────────────────
function removePin(id) {
  const pin = MAP.pins.find(p=>p.id===id);
  if (pin?.marker) pin.marker.remove();
  MAP.pins = MAP.pins.filter(p=>p.id!==id);
  renderPinsList();
}

function renderPinsList() {
  const el = document.getElementById('pins-list');
  if (!el) return;
  const nonSubject = MAP.pins.filter(p=>p.type!=='comp'); // comps shown in comp list
  if (!MAP.subjectLng && !nonSubject.length) {
    el.innerHTML = '<div style="font-size:12px;color:var(--text-muted);">No pins yet.</div>';
    return;
  }
  let html = '';
  if (MAP.subjectLng) {
    html += `<div class="pin-item"><div class="pin-dot" style="background:${PIN_COLORS.subject};border:2px solid #c8a96e;"></div><span class="pin-label" style="font-weight:500;">Subject Property</span></div>`;
  }
  html += nonSubject.map(p=>`
    <div class="pin-item">
      <div class="pin-dot" style="background:${p.color};"></div>
      <span class="pin-label">${p.name}</span>
      <button class="pin-remove" onclick="removePin(${p.id})">×</button>
    </div>`).join('');
  el.innerHTML = html || '<div style="font-size:12px;color:var(--text-muted);">No amenity pins yet.</div>';
}

// ── Map export ───────────────────────────────────────────────
async function exportMapImage() {
  if (!MAP.instance) return toast('Load a map first');

  // Give the map a moment to fully render before capturing
  await new Promise(r => setTimeout(r, 500));

  try {
    const canvas = MAP.instance.getCanvas();
    const dataUrl = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `property-map-${Date.now()}.png`;
    a.click();
    toast('Map exported as PNG');
  } catch (e) {
    toast('Export failed: ' + e.message);
  }
}

// ── Legend helper ────────────────────────────────────────────
function spinHTML() {
  return '<span style="display:inline-block;width:11px;height:11px;border:2px solid rgba(0,87,184,0.2);border-top-color:#0057b8;border-radius:50%;animation:spin 0.8s linear infinite;margin-right:5px;vertical-align:middle;"></span>';
}

// ── Save map snapshot to document ────────────────────────────
async function saveMapToDocument() {
  if (!MAP.instance) return toast('Load a map first');
  await new Promise(r => setTimeout(r, 400));
  try {
    const canvas = MAP.instance.getCanvas();
    const dataUrl = canvas.toDataURL('image/png');
    S.mapSnapshot = dataUrl;
    toast('Map saved — it will appear in the Location section of your document');
  } catch (e) {
    toast('Could not capture map: ' + e.message);
  }
}


function clearAllPins() {
  MAP.pins.forEach(p => { if(p.marker) p.marker.remove(); });
  MAP.comps.forEach(c => { if(c.marker) c.marker.remove(); });
  MAP.pins = [];
  MAP.comps = [];
  if (MAP.subjectMarker) { MAP.subjectMarker.remove(); MAP.subjectMarker = null; }
  MAP.subjectLng = null; MAP.subjectLat = null;
  if (MAP.instance?.getSource('radius')) {
    MAP.instance.getSource('radius').setData(emptyGeoJson());
  }
  renderPinsList(); renderCompList();
  toast('All pins cleared');
}

// ══════════════════════════════════════════════════════════════
// TEMPLATE STUDIO
// ══════════════════════════════════════════════════════════════

const TS = {
  templates: [],       // full library from server
  filtered: [],        // after search/filter
  activeId: null,      // currently open in reviewer
  activePage: 0,       // page index (0-based)
  filter: 'all',
  search: '',
  diffOn: false,
  importFile: null,
};

// ── Fetch library from server ────────────────────────────────
async function tsLoadLibrary() {
  try {
    const r = await fetch('/api/templates');
    const d = await r.json();
    TS.templates = d.templates || [];
    tsRenderLibrary();
    tsBuildPickerGrid();   // also refresh the OM builder picker
  } catch (e) { console.error('Template library load failed:', e); }
}

// ── Library grid ─────────────────────────────────────────────
function filterTemplates(val) { TS.search = val; tsRenderLibrary(); }

function setTsFilter(f) {
  TS.filter = f;
  ['all','approved','review','rejected'].forEach(k => {
    const el = $('tsf-' + k); if (el) el.classList.toggle('active', k === f);
  });
  tsRenderLibrary();
}

function tsRenderLibrary() {
  const grid = $('ts-library-grid'); if (!grid) return;
  let items = TS.templates;
  if (TS.filter !== 'all') items = items.filter(t => t.status === TS.filter);
  if (TS.search) items = items.filter(t => t.name.toLowerCase().includes(TS.search.toLowerCase()));
  TS.filtered = items;

  if (!items.length) {
    grid.innerHTML = `<div class="empty-state"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg><p>No templates${TS.filter !== 'all' ? ' with status "'+TS.filter+'"' : ''}.</p></div>`;
    return;
  }

  grid.innerHTML = items.map(t => `
    <div class="ts-card ${TS.activeId === t.id ? 'active' : ''}" onclick="tsOpenTemplate('${t.id}')">
      <div class="ts-card-thumb">
        ${t.thumbnail ? `<img src="${t.thumbnail}" style="width:100%;height:100%;object-fit:cover;display:block;" />` : '<div style="width:100%;height:100%;background:var(--surface-2);display:flex;align-items:center;justify-content:center;color:var(--text-muted);font-size:11px;">No preview</div>'}
        <div class="ts-card-status ${t.status}">${t.status === 'review' ? 'IN REVIEW' : t.status.toUpperCase()}</div>
      </div>
      <div class="ts-card-body">
        <div class="ts-card-name">${t.name}</div>
        <div class="ts-card-meta">${t.pages?.length || 0}pp · ${new Date(t.createdAt).toLocaleDateString()}</div>
        <div class="ts-card-tags">${(t.tags || []).map(tag => `<span class="ts-tag">${tag}</span>`).join('')}</div>
      </div>
    </div>
  `).join('');
}

// ── Open template in reviewer ─────────────────────────────────
function tsOpenTemplate(id) {
  TS.activeId = id;
  TS.activePage = 0;
  tsRenderLibrary();   // re-render to highlight active card
  const t = TS.templates.find(x => x.id === id); if (!t) return;
  $('ts-reviewer-empty').style.display = 'none';
  $('ts-reviewer-body').style.display = 'flex';
  $('ts-rev-name').textContent = t.name;
  $('ts-rev-meta').textContent = `${t.pages?.length || 0} pages · Imported ${new Date(t.createdAt).toLocaleDateString()}${t.description ? ' · ' + t.description.slice(0,60) : ''}`;
  const pill = $('ts-rev-status-pill');
  pill.textContent = t.status === 'review' ? 'Pending Review' : t.status.charAt(0).toUpperCase() + t.status.slice(1);
  pill.className = 'ts-status-pill ' + t.status;
  tsRenderRevPage();
  tsRenderAnalysis(t);
  tsRenderComments(t);
}

// ── Reviewer: page render ─────────────────────────────────────
function tsRenderRevPage() {
  const t = TS.templates.find(x => x.id === TS.activeId); if (!t) return;
  const pg = t.pages?.[TS.activePage];
  const total = t.pages?.length || 1;

  $('ts-page-indicator').textContent = `Page ${TS.activePage + 1} of ${total}`;

  // Original — show extracted thumbnail
  const origImg = $('ts-orig-img');
  const origViewer = $('ts-orig-viewer');
  if (pg?.thumbnail) {
    origImg.src = pg.thumbnail;
    origImg.style.display = 'block';
    origViewer.innerHTML = `<img src="${pg.thumbnail}" style="width:100%;height:100%;object-fit:contain;display:block;" />`;
  } else {
    origViewer.innerHTML = `<div style="width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;color:var(--text-muted);font-size:12px;padding:12px;text-align:center;"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg><span>Page thumbnail unavailable — PDF was analyzed natively without page rendering.</span></div>`;
  }

  // Replica — render CSS variables into an iframe
  const frame = $('ts-replica-frame');
  const css = t.cssOverrides || {};
  const analysis = t.analysis || {};
  const layout = pg?.layout || analysis.pageLayouts?.[TS.activePage] || {};

  const colors = analysis.colors || {};
  const typo   = analysis.typography || {};
  const primary = css['--doc-primary']   || colors.primary   || '#001a4d';
  const accent  = css['--doc-accent']    || colors.accent     || '#c8a96e';
  const bg      = css['--doc-bg']        || colors.bg         || '#ffffff';
  const text    = css['--doc-text']      || colors.text       || '#1a2332';
  const hFont   = css['--doc-heading-font']?.replace(/'/g,'') || typo.suggestedHeading || 'Playfair Display';
  const bFont   = css['--doc-body-font']?.replace(/'/g,'')   || typo.suggestedBody   || 'Inter';
  const hSize   = css['--doc-heading-size'] || (typo.headingFontSizePt ? typo.headingFontSizePt + 'pt' : '22pt');
  const bSize   = css['--doc-body-size']   || (typo.bodyFontSizePt    ? typo.bodyFontSizePt + 'pt'    : '10.5pt');

  const gfUrl = `https://fonts.googleapis.com/css2?family=${hFont.replace(/ /g,'+')}:wght@400;600&family=${bFont.replace(/ /g,'+')}:wght@400;500&display=swap`;

  const coverHtml = `<!DOCTYPE html><html><head>
    <link href="${gfUrl}" rel="stylesheet"/>
    <style>
      *{box-sizing:border-box;margin:0;padding:0;}
      body{width:11in;height:8.5in;background:${primary};overflow:hidden;font-family:'${bFont}',sans-serif;}
      .cover{width:100%;height:100%;position:relative;display:flex;flex-direction:column;justify-content:flex-end;padding:0.5in;}
      .cover-title{font-family:'${hFont}',serif;font-size:${hSize};color:#fff;font-weight:600;line-height:1.1;margin-bottom:8px;}
      .cover-sub{font-size:${bSize};color:rgba(255,255,255,0.6);margin-bottom:20px;}
      .cover-bar{height:5px;background:${accent};width:50px;margin-bottom:20px;border-radius:2px;}
      .cover-label{font-size:8pt;letter-spacing:2px;text-transform:uppercase;color:${accent};margin-bottom:10px;}
      .stats{display:flex;gap:0.3in;flex-wrap:wrap;border-top:1px solid rgba(255,255,255,0.2);padding-top:18px;margin-top:auto;}
      .stat .lbl{font-size:7pt;letter-spacing:1.5px;text-transform:uppercase;color:rgba(255,255,255,0.5);margin-bottom:4px;}
      .stat .val{font-family:'${hFont}',serif;font-size:20pt;color:#fff;font-weight:600;}
    </style>
  </head><body>
    <div class="cover">
      <div class="cover-label">${analysis.designLanguage?.formality || 'Professional'} · Offering Memorandum</div>
      <div class="cover-bar"></div>
      <div class="cover-title">Property Name</div>
      <div class="cover-sub">123 Main Street, City, State 00000</div>
      <div class="stats">
        <div class="stat"><div class="lbl">Asking Price</div><div class="val">$X,XXX,XXX</div></div>
        <div class="stat"><div class="lbl">Cap Rate</div><div class="val">X.XX%</div></div>
        <div class="stat"><div class="lbl">Building SF</div><div class="val">XX,XXX</div></div>
      </div>
    </div>
  </body></html>`;

  const interiorHtml = `<!DOCTYPE html><html><head>
    <link href="${gfUrl}" rel="stylesheet"/>
    <style>
      *{box-sizing:border-box;margin:0;padding:0;}
      body{width:11in;height:8.5in;background:${bg};overflow:hidden;font-family:'${bFont}',sans-serif;color:${text};font-size:${bSize};}
      .page{width:100%;height:100%;display:flex;flex-direction:column;padding:0.45in 0.5in 0;}
      .eyebrow{font-size:7pt;letter-spacing:2px;text-transform:uppercase;color:${primary};margin-bottom:5px;}
      .sec-title{font-family:'${hFont}',serif;font-size:${hSize};color:${primary};margin-bottom:12px;font-weight:600;}
      .rule{height:2px;background:${accent};margin-bottom:14px;width:100%;}
      .body-text{line-height:1.7;margin-bottom:10px;opacity:0.85;}
      .stat-row{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px;}
      .stat-box{background:${primary};border-radius:4px;padding:10px;text-align:center;}
      .stat-lbl{font-size:6.5pt;letter-spacing:1.5px;text-transform:uppercase;color:${accent};margin-bottom:3px;}
      .stat-val{font-family:'${hFont}',serif;font-size:16pt;color:#fff;font-weight:600;}
      .footer{position:absolute;bottom:0;left:0;right:0;height:26px;background:${primary};display:flex;align-items:center;padding:0 0.5in;}
      .footer-text{font-size:7pt;color:${accent};letter-spacing:0.5px;}
    </style>
  </head><body>
    <div class="page">
      <div class="eyebrow">Offering Memorandum</div>
      <div class="rule"></div>
      <div class="sec-title">${layout.pageType ? layout.pageType.charAt(0).toUpperCase() + layout.pageType.slice(1) + ' Details' : 'Section Title'}</div>
      <div class="stat-row">
        <div class="stat-box"><div class="stat-lbl">Metric</div><div class="stat-val">Value</div></div>
        <div class="stat-box"><div class="stat-lbl">Metric</div><div class="stat-val">Value</div></div>
        <div class="stat-box"><div class="stat-lbl">Metric</div><div class="stat-val">Value</div></div>
        <div class="stat-box"><div class="stat-lbl">Metric</div><div class="stat-val">Value</div></div>
      </div>
      <div class="body-text">This section contains property details, financial summary, market analysis, and investment thesis. The typography, colors, spacing, and layout structure are all derived from the original uploaded template.</div>
      <div class="body-text">Additional supporting content and data appears here, maintaining the visual style and formatting rules extracted from the source document.</div>
    </div>
    <div class="footer"><span class="footer-text">Colliers International · Property Name · Offering Memorandum</span></div>
  </body></html>`;

  // Show the actual generated HTML in the iframe
  const frame = $('ts-replica-frame');
  const pg = t.pages?.[TS.activePage];
  if (pg?.html) {
    const doc = frame.contentDocument || frame.contentWindow.document;
    doc.open();
    doc.write(pg.html);
    doc.close();
  } else {
    const doc = frame.contentDocument || frame.contentWindow.document;
    doc.open();
    doc.write(`<html><body style="display:flex;align-items:center;justify-content:center;height:100%;font-family:Inter,sans-serif;color:#888;font-size:13px;margin:0;background:#f4f6fb;">
      <div style="text-align:center;"><div style="font-size:24px;margin-bottom:8px;">⏳</div><div>HTML not yet generated for this page.</div></div>
    </body></html>`);
    doc.close();
  }
}

function tsChangePage(dir) {
  const t = TS.templates.find(x => x.id === TS.activeId); if (!t) return;
  const total = t.pages?.length || 1;
  TS.activePage = Math.max(0, Math.min(total - 1, TS.activePage + dir));
  tsRenderRevPage();
}

function tsToggleDiff() {
  TS.diffOn = !TS.diffOn;
  $('ts-diff-overlay').style.display = TS.diffOn ? 'block' : 'none';
}

// ── Reviewer: analysis panel ──────────────────────────────────
function tsRenderAnalysis(t) {
  const grid = $('ts-analysis-grid'); if (!grid) return;
  const a = t.analysis || {};
  const cssCnt = Object.keys(t.cssOverrides || {}).length;
  const pagesCnt = t.pages?.length || 0;
  const rows = [
    ['Pages analyzed', pagesCnt || '—'],
    ['CSS variables', cssCnt ? `${cssCnt} extracted` : '—'],
    ['Layout', a.pageLayouts?.[0]?.layoutStructure || '—'],
    ['Typography', a.typography?.suggestedHeading ? `${a.typography.suggestedHeading} / ${a.typography.suggestedBody}` : '—'],
    ['Primary color', a.colors?.primary || t.cssOverrides?.['--doc-primary'] || '—'],
    ['Accent color', a.colors?.accent || t.cssOverrides?.['--doc-accent'] || '—'],
    ['Formality', a.designLanguage?.formality || '—'],
    ['Density', a.designLanguage?.density || '—'],
  ];
  grid.innerHTML = rows.map(([k,v]) => `
    <div class="ts-analysis-row">
      <span class="ts-analysis-key">${k}</span>
      <span class="ts-analysis-val">${v}</span>
    </div>
  `).join('');
}

// ── Reviewer: comments ────────────────────────────────────────
function tsRenderComments(t) {
  const list = $('ts-comment-list'); if (!list) return;
  const comments = t?.comments || [];
  if (!comments.length) { list.innerHTML = '<div style="font-size:11px;color:var(--text-muted);">No notes yet.</div>'; return; }
  list.innerHTML = comments.map(c => `
    <div class="ts-comment">
      <div class="ts-comment-meta"><span style="color:var(--colliers-mid);font-weight:500;">${c.author}</span> <span>${new Date(c.createdAt).toLocaleDateString()}</span></div>
      <div class="ts-comment-text">${c.type === 'flag' ? '⚑ ' : ''}${c.text}</div>
    </div>
  `).join('');
}

async function tsAddComment(type) {
  const input = $('ts-comment-input'); if (!input?.value.trim()) return;
  const t = TS.templates.find(x => x.id === TS.activeId); if (!t) return;
  try {
    const r = await fetch(`/api/templates/${TS.activeId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ author: 'You', text: input.value.trim(), type, page: TS.activePage + 1 }),
    });
    const d = await r.json();
    if (d.ok) { t.comments.push(d.comment); tsRenderComments(t); input.value = ''; }
  } catch (e) { toast('Could not save comment'); }
}

// ── Approve / Reject ──────────────────────────────────────────
async function tsApproveTemplate() {
  await tsSetStatus('approved');
  toast('Template approved — now available in the builder');
  tsBuildPickerGrid();
}

async function tsRejectTemplate() {
  await tsSetStatus('rejected');
  toast('Template rejected');
}

async function tsSetStatus(status) {
  const t = TS.templates.find(x => x.id === TS.activeId); if (!t) return;
  try {
    const r = await fetch(`/api/templates/${TS.activeId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    const d = await r.json();
    if (d.ok) {
      t.status = status;
      const pill = $('ts-rev-status-pill');
      pill.textContent = status.charAt(0).toUpperCase() + status.slice(1);
      pill.className = 'ts-status-pill ' + status;
      tsRenderLibrary();
    }
  } catch (e) { toast('Could not update status'); }
}

function tsCopyCss() {
  const t = TS.templates.find(x => x.id === TS.activeId); if (!t) return;
  const css = Object.entries(t.cssOverrides || {}).map(([k,v]) => `  ${k}: ${v};`).join('\n');
  navigator.clipboard.writeText(`:root {\n${css}\n}`).then(() => toast('CSS variables copied to clipboard'));
}

// ── Import modal ──────────────────────────────────────────────
function showImportModal() {
  const modal = $('import-modal');
  modal.style.display = 'flex';
  $('import-name').value = '';
  $('import-tags').value = '';
  $('import-file-label').textContent = 'Click to select a PDF template';
  $('import-status').textContent = '';
  $('btn-run-import').disabled = true;
  $('btn-run-import').style.opacity = '0.5';
  TS.importFile = null;
}

function hideImportModal() {
  $('import-modal').style.display = 'none';
  TS.importFile = null;
}

function handleImportFile(input) {
  const file = input.files[0]; if (!file) return;
  TS.importFile = file;
  $('import-file-label').textContent = `${file.name} (${(file.size/1024/1024).toFixed(1)} MB)`;
  $('btn-run-import').disabled = false;
  $('btn-run-import').style.opacity = '1';
  if (!$('import-name').value) {
    $('import-name').value = file.name.replace(/\.pdf$/i, '').replace(/[-_]/g, ' ');
  }
}

async function runImport() {
  if (!TS.importFile) return;
  const name = $('import-name').value.trim() || TS.importFile.name.replace(/\.pdf$/i,'');
  const tags = $('import-tags').value.split(',').map(t=>t.trim()).filter(Boolean);
  const st = $('import-status');
  const btn = $('btn-run-import');

  btn.disabled = true; btn.textContent = 'Analyzing...';
  st.innerHTML = spin() + 'Uploading PDF to server...';

  const fd = new FormData();
  fd.append('file', TS.importFile);
  fd.append('name', name);
  fd.append('tags', JSON.stringify(tags));

  try {
    st.innerHTML = spin() + 'Claude Vision is analyzing every page — this takes 30–60 seconds...';
    const r = await fetch('/api/templates/analyze', { method: 'POST', body: fd });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'Analysis failed');

    TS.templates.unshift(d.template);
    tsRenderLibrary();
    tsBuildPickerGrid();
    hideImportModal();
    tsOpenTemplate(d.template.id);
    const methodNote = d.method === 'native-pdf' ? ' (native PDF mode — thumbnails unavailable)' : '';
toast(`"${name}" imported — ${d.pagesAnalyzed} pages analyzed${methodNote}. Ready for review.`);
  } catch (e) {
    st.textContent = '✗ ' + (e.message || 'Import failed');
    st.className = 'extract-status err';
  } finally {
    btn.disabled = false; btn.textContent = 'Analyze & Import';
  }
}

// ── OM/BOV builder picker ─────────────────────────────────────
// Renders the "From Library" grid in Step 1 of the OM builder
function tsBuildPickerGrid() {
  const grid = $('ts-picker-grid'); if (!grid) return;
  const approved = TS.templates.filter(t => t.status === 'approved');
  if (!approved.length) {
    grid.innerHTML = `<div style="font-size:12px;color:var(--text-muted);padding:8px 0;">No approved templates yet — <a href="#" onclick="navigate('template-studio');return false;" style="color:var(--colliers-mid);">open Template Studio</a> to import one.</div>`;
    return;
  }
  grid.innerHTML = approved.map(t => `
    <div class="ts-picker-card ${S.selectedLibraryTemplate?.id === t.id ? 'active' : ''}" onclick="selectLibraryTemplate('${t.id}')">
      <div class="ts-picker-thumb">
        ${t.thumbnail ? `<img src="${t.thumbnail}" style="width:100%;height:100%;object-fit:cover;display:block;" />` : '<div style="width:100%;height:100%;background:var(--surface-2);"></div>'}
      </div>
      <div class="ts-picker-name">${t.name}</div>
    </div>
  `).join('') + `<div class="ts-picker-card ${!S.selectedLibraryTemplate ? 'active' : ''}" onclick="selectLibraryTemplate(null)"><div class="ts-picker-thumb" style="display:flex;align-items:center;justify-content:center;background:var(--surface-2);"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="5" y1="12" x2="19" y2="12"/></svg></div><div class="ts-picker-name" style="color:var(--text-muted);">None / Manual</div></div>`;
}

function selectLibraryTemplate(id) {
  if (!id) {
    S.selectedLibraryTemplate = null;
    S.design.analysis = null;
    S.design.cssOverrides = null;
    tsBuildPickerGrid();
    toast('Manual design mode — use settings below');
    return;
  }
  const t = TS.templates.find(x => x.id === id); if (!t) return;
  S.selectedLibraryTemplate = t;
  S.design.analysis = t.analysis;
  S.design.cssOverrides = t.cssOverrides;

  // Apply colors to the design step pickers
  const a = t.analysis;
  if (a?.colors) Object.entries(a.colors).forEach(([k,v]) => setColor(k,v));

  // Apply fonts
  if (a?.typography) {
    const hF = GF.find(f => f.toLowerCase().includes((a.typography.suggestedHeading||'').toLowerCase().split(' ')[0]));
    const bF = GF.find(f => f.toLowerCase().includes((a.typography.suggestedBody||'').toLowerCase().split(' ')[0]));
    if (hF) { $('font-heading').value = hF; }
    if (bF) { $('font-body').value = bF; }
    updateFontPreview();
  }

  tsBuildPickerGrid();
  toast(`Template "${t.name}" applied to document`);
}

// ── BROKER PROFILES ──────────────────────────────────────────
let brokerPhotoData='';

function showBrokerForm(id=''){
  $('broker-form-card').style.display='block';
  $('broker-form-title').textContent=id?'Edit Broker Profile':'Add Broker Profile';
  $('broker-edit-id').value=id;
  brokerPhotoData='';
  $('bf-photo-preview').innerHTML='';
  if(id){
    const b=S.brokers.find(x=>x.id===id); if(!b) return;
    [$('bf-name'),$('bf-title'),$('bf-phone'),$('bf-email'),$('bf-license'),$('bf-spec'),$('bf-bio')].forEach((el,i)=>{ if(el) el.value=[b.name,b.title,b.phone,b.email,b.license,b.spec,b.bio][i]||''; });
    if(b.photo){brokerPhotoData=b.photo;$('bf-photo-preview').innerHTML=`<img src="${b.photo}" style="width:80px;height:80px;border-radius:50%;object-fit:cover;border:2px solid var(--border);" />`;}
  } else {
    [$('bf-name'),$('bf-title'),$('bf-phone'),$('bf-email'),$('bf-license'),$('bf-spec'),$('bf-bio')].forEach(el=>{if(el)el.value='';});
  }
  window.scrollTo(0,0);
}

function cancelBrokerForm(){
  $('broker-form-card').style.display='none';
  brokerPhotoData='';
}

async function handleBrokerPhoto(input){
  const file=input.files[0]; if(!file) return;
  const formData=new FormData(); formData.append('photo',file);
  try{
    const r=await fetch('/api/upload-photo',{method:'POST',body:formData});
    const d=await r.json(); if(!r.ok) throw new Error(d.error);
    brokerPhotoData=d.dataUrl;
    $('bf-photo-preview').innerHTML=`<img src="${d.dataUrl}" style="width:80px;height:80px;border-radius:50%;object-fit:cover;border:2px solid var(--border);" />`;
  }catch(e){
    // Fallback: read locally
    const reader=new FileReader(); reader.onload=e2=>{brokerPhotoData=e2.target.result;$('bf-photo-preview').innerHTML=`<img src="${e2.target.result}" style="width:80px;height:80px;border-radius:50%;object-fit:cover;border:2px solid var(--border);" />`;};
    reader.readAsDataURL(file);
  }
}

function saveBroker(){
  const id=$('broker-edit-id').value||Date.now().toString();
  const broker={id,name:$('bf-name')?.value||'',title:$('bf-title')?.value||'',phone:$('bf-phone')?.value||'',email:$('bf-email')?.value||'',license:$('bf-license')?.value||'',spec:$('bf-spec')?.value||'',bio:$('bf-bio')?.value||'',photo:brokerPhotoData};
  S.brokers=[...S.brokers.filter(b=>b.id!==id),broker];
  localStorage.setItem('cds_brokers',JSON.stringify(S.brokers));
  $('broker-form-card').style.display='none'; brokerPhotoData='';
  renderBrokerGrid(); toast('Broker profile saved');
}

function deleteBroker(id){
  S.brokers=S.brokers.filter(b=>b.id!==id);
  localStorage.setItem('cds_brokers',JSON.stringify(S.brokers));
  renderBrokerGrid(); toast('Broker removed');
}

function renderBrokerGrid(){
  const grid=$('broker-grid'); if(!grid) return;
  if(!S.brokers.length){
    grid.innerHTML='<div class="empty-state"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg><p>No broker profiles yet.</p><button class="btn-primary" onclick="showBrokerForm()">Add First Broker</button></div>';
    return;
  }
  grid.innerHTML=S.brokers.map(b=>`<div class="broker-card">
<div class="broker-card-header">${b.photo?`<img src="${b.photo}" class="broker-avatar" />`:`<div class="broker-avatar-placeholder">${(b.name||'?')[0]}</div>`}<div><div class="broker-card-name">${b.name}</div><div class="broker-card-title">${b.title||''}</div>${b.spec?`<div class="broker-card-spec">${b.spec}</div>`:''}</div></div>
<div class="broker-card-details">${[b.phone,b.email,b.license].filter(Boolean).join('<br>')}</div>
${b.bio?`<div style="font-size:11px;color:var(--text-muted);line-height:1.6;margin-top:8px;">${b.bio.slice(0,120)}${b.bio.length>120?'...':''}</div>`:''}
<div class="broker-card-actions"><button class="btn-secondary" style="font-size:11px;padding:6px 12px;" onclick="showBrokerForm('${b.id}')">Edit</button><button class="btn-secondary" style="font-size:11px;padding:6px 12px;color:#cc3333;" onclick="deleteBroker('${b.id}')">Delete</button></div>
</div>`).join('');
}

// ── Settings ─────────────────────────────────────────────────
function loadSettings(){
  const s=JSON.parse(localStorage.getItem('cds_settings')||'{}');
  if(s.firm) $('settings-firm').value=s.firm;
  if(s.city) $('settings-city').value=s.city;
  if(s.phone) $('settings-phone').value=s.phone;
  if(s.disclaimer) $('settings-disclaimer').value=s.disclaimer;
}
function saveSettings(){
  const s={firm:$('settings-firm')?.value,city:$('settings-city')?.value,phone:$('settings-phone')?.value,disclaimer:$('settings-disclaimer')?.value};
  localStorage.setItem('cds_settings',JSON.stringify(s)); toast('Settings saved');
}

async function testConnection(){
  const btn=$('btn-api-test'); const result=$('api-test-result');
  btn.disabled=true; btn.textContent='Testing...'; result.innerHTML='';
  try{
    const r=await fetch('/api/ping'); const t=await r.text();
    let d; try{d=JSON.parse(t);}catch(e){result.innerHTML=`<span style="color:#cc3333;">✗ Server returned HTML instead of JSON — app may not be deployed correctly.</span>`;btn.disabled=false;btn.textContent='Test Connection';return;}
    if(!d.ok){result.innerHTML=`<span style="color:#cc3333;">✗ Server error: ${JSON.stringify(d)}</span>`;}
    else if(!d.hasAnthropicKey){result.innerHTML=`<span style="color:#cc3333;">✗ Server running but ANTHROPIC_API_KEY not set. Add it in Render/Railway environment variables.</span>`;}
    else if(!d.hasMapboxToken){result.innerHTML=`<span style="color:#b8720a;">⚠ Server running, API key ✓, but MAPBOX_TOKEN not set — map features won't work.</span>`;}
    else{result.innerHTML='<span style="color:#1a7a4a;">✓ All systems working — server, API key, and Mapbox all confirmed.</span>';}
  }catch(e){result.innerHTML=`<span style="color:#cc3333;">✗ Cannot reach server: ${e.message}</span>`;}
  btn.disabled=false; btn.textContent='Test Connection';
}

// ── Dashboard ────────────────────────────────────────────────
function refreshDashboard(){
  const projects=JSON.parse(localStorage.getItem('cds_projects')||'[]'); S.projects=projects;
  $('stat-docs').textContent=projects.filter(p=>p.status==='complete').length;
  $('stat-props').textContent=projects.length;
  const mo=new Date().toLocaleDateString('en-US',{month:'numeric',year:'numeric'});
  $('stat-month').textContent=projects.filter(p=>{try{return new Date(p.createdAt).toLocaleDateString('en-US',{month:'numeric',year:'numeric'})===mo;}catch(e){return false;}}).length;
  const el=$('recent-projects-list'); if(!el) return;
  if(!projects.length){el.innerHTML='<div class="empty-state"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg><p>No projects yet.</p><button class="btn-primary" onclick="navigate(\'om-builder\')">Create Document</button></div>';return;}
  el.innerHTML=`<table class="projects-table"><thead><tr><th>Property</th><th>Type</th><th>Price</th><th>Cap Rate</th><th>SF</th><th>Date</th><th>Status</th></tr></thead><tbody>${projects.map(p=>`<tr><td><div style="font-weight:500;">${p.name}</div><div style="font-size:11px;color:var(--text-muted);">${p.address}</div></td><td><span class="doc-type-badge ${p.docType}">${p.docType==='om'?'OM':'BOV'}</span></td><td>${p.price?'$'+fmtNum(p.price):'—'}</td><td>${p.capRate?p.capRate+'%':'—'}</td><td>${p.sf?fmtNum(p.sf)+' SF':'—'}</td><td>${p.createdAt}</td><td><span style="font-size:11px;color:${p.status==='complete'?'#1a7a4a':'#b8720a'};font-weight:500;">${p.status}</span></td></tr>`).join('')}</tbody></table>`;
}

// ── Init ─────────────────────────────────────────────────────
(async function init(){
  updatePagePreview();
  refreshDashboard();
  renderBrokerGrid();
  try{ const r=await fetch('/api/config'); const d=await r.json(); S.map.token=d.mapboxToken||''; }catch(e){}
  await tsLoadLibrary();   // load template library on startup
})();
