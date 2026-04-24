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
function setTemplateMode(mode) {
  S.design.mode=mode;
  $('mode-btn-inspiration').classList.toggle('active',mode==='inspiration');
  $('mode-btn-copy').classList.toggle('active',mode==='copy');
  const d=$('mode-description');
  if(d) d.innerHTML = mode==='copy'
    ? '<strong>Exact Replication:</strong> Server converts each PDF page to images; Claude Vision measures precise layout proportions, colors, and typography.'
    : '<strong>Style Inspiration:</strong> Captures design language, mood, and palette for similar-feeling output with creative variation.';
}

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
async function analyzeTemplate() {
  const files=S.files['template']||[]; if(!files.length){toast('Upload a template file first');return;}
  const st=$('status-template'); st.innerHTML=spin()+'Uploading to server for analysis...';
  const fd=new FormData(); fd.append('file',files[0]); fd.append('mode',S.design.mode);
  try {
    const r=await fetch('/api/analyze-template',{method:'POST',body:fd});
    const d=await r.json(); if(!r.ok) throw new Error(d.error||'Analysis failed');
    const a=d.analysis; S.design.analysis=a;
    if(a.colors) Object.entries(a.colors).forEach(([k,v])=>setColor(k,v));
    if(a.typography){
      const hF=GF.find(f=>f.toLowerCase().includes((a.typography.suggestedHeading||'').toLowerCase().split(' ')[0]));
      const bF=GF.find(f=>f.toLowerCase().includes((a.typography.suggestedBody||'').toLowerCase().split(' ')[0]));
      if(hF){$('font-heading').value=hF;} if(bF){$('font-body').value=bF;}
    }
    if(a.pageLayouts?.[0]){
      const ls=a.pageLayouts[0].layoutStructure||'';
      const lm={'sidebar-right':'classic','sidebar-left':'classic','single-column':'editorial','two-column':'magazine','magazine-grid':'magazine','full-bleed-photo':'editorial'};
      selectLayout(lm[ls]||'classic');
    }
    updateFontPreview();
    st.textContent=`✓ ${d.pagesAnalyzed>0?d.pagesAnalyzed+' pages analyzed':'Analysis complete'} — ${a.aesthetic||'Design settings updated'}`;
    st.className='extract-status ok'; toast('Template analyzed — design settings updated');
  } catch(e){ st.textContent='✗ '+(e.message||'Analysis failed'); st.className='extract-status err'; }
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
    {title:'Design',items:[['Layout',S.design.layout],['Template',S.design.analysis?'✓ Analyzed':'—'],['Primary',S.design.colors.primary]]},
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
  const g=id=>$(id)?.value||'';
  const settings=JSON.parse(localStorage.getItem('cds_settings')||'{}');
  const disclaimer=settings.disclaimer||'The information contained herein has been obtained from sources believed to be reliable. Colliers International makes no guarantee, warranty, or representation about it.';
  const firm=settings.firm||'Colliers International'; const city=settings.city||'Denver, Colorado';
  const docLabel=S.docType==='om'?'Offering Memorandum':'Broker Opinion of Value';

  const prop={name:g('prop-name')||'Subject Property',address:g('prop-address'),city:g('prop-city'),state:g('prop-state'),zip:g('prop-zip'),county:g('prop-county'),yearBuilt:g('prop-year'),sf:g('prop-sf'),acres:g('prop-acres'),buildings:g('prop-buildings'),units:g('prop-units'),zoning:g('prop-zoning'),parking:g('prop-parking'),clearHeight:g('prop-clearheight'),desc:g('prop-desc'),highlights:g('prop-highlights')};
  const fin={price:g('fin-price'),ppsf:g('fin-ppsf'),gpr:g('fin-gpr'),vacancy:g('fin-vacancy'),egi:g('fin-egi'),opex:g('fin-opex'),noi:g('fin-noi'),capRate:g('fin-caprate'),occupancy:g('fin-occupancy'),walt:g('fin-walt'),debtService:g('fin-debt'),dscr:g('fin-dscr'),...(S.extractedFin||{})};
  const broker={name:g('broker-name'),title:g('broker-title'),phone:g('broker-phone'),email:g('broker-email'),license:g('broker-license')};
  const rentRoll=getRentRoll();
  const sections=Array.from(document.querySelectorAll('.sections-checklist input:checked')).map(i=>i.dataset.section);
  const selBrokers=S.brokers.filter(b=>S.selectedBrokers.includes(b.id));

  const st=$('generate-status'); st.style.display='block'; st.innerHTML=spin()+'Generating AI content...';

  let ai={};
  let fonts={heading:S.design.fonts.heading||'Playfair Display',body:S.design.fonts.body||'Inter',number:S.design.fonts.number||S.design.fonts.heading||'Playfair Display'};
  const ta=S.design.analysis;

  try{
    if(!S.design.fonts.heading||!S.design.fonts.body){
      const ctx=ta?`Template style: ${ta.aesthetic}. Formality: ${ta.designLanguage?.formality}. Primary color: ${S.design.colors.primary}.`:`Primary color: ${S.design.colors.primary}. Layout: ${S.design.layout}.`;
      const fd=await callClaude({model:'claude-sonnet-4-6',max_tokens:150,messages:[{role:'user',content:`Pick Google Fonts for a ${docLabel} (${S.propType} property). ${ctx} Return ONLY JSON: {"heading":"","body":"","number":""} Choose from: ${GF.join(', ')}`}]});
      try{const fp=JSON.parse((fd.content?.[0]?.text||'{}').replace(/```json|```/g,'').trim());if(fp.heading)fonts.heading=S.design.fonts.heading||fp.heading;if(fp.body)fonts.body=S.design.fonts.body||fp.body;if(fp.number)fonts.number=S.design.fonts.number||fp.number;}catch(e){}
    }
    st.innerHTML=spin()+'Writing narratives...';
    const narrativePrompt=`You are a senior CRE broker at ${firm} writing a ${docLabel} for a ${S.propType} property.
${S.narrative?'Existing narrative:\n'+S.narrative+'\n\n':''}
${ta?'Design context from template: '+ta.aesthetic+'. Formality: '+ta.designLanguage?.formality+'.':''}
PROPERTY: ${prop.name}, ${prop.address}, ${prop.city}, ${prop.state} ${prop.zip}
${prop.sf?fmtNum(prop.sf)+' SF, ':''} Built ${prop.yearBuilt||'N/A'}, Zoning: ${prop.zoning||'N/A'}, Clear Height: ${prop.clearHeight||'N/A'} ft
Description: ${prop.desc||'N/A'}
Highlights: ${prop.highlights||'N/A'}
FINANCIALS: Price $${fmtNum(fin.price)||'N/A'}, NOI $${fmtNum(fin.noi)||'N/A'}, Cap ${fin.capRate||'N/A'}%, Occupancy ${fin.occupancy||'N/A'}%, WALT ${fin.walt||'N/A'} yrs
GPR: $${fmtNum(fin.gpr)||'N/A'}, Vacancy: ${fin.vacancy||'N/A'}%, OpEx: $${fmtNum(fin.opex)||'N/A'}
${fin.debtService?'Debt Service: $'+fmtNum(fin.debtService):''}${fin.dscr?' DSCR: '+fin.dscr:''}
${S.extractedFin?.recentCapex?'Recent CapEx: '+S.extractedFin.recentCapex:''}
${S.extractedFin?.additionalNotes?'Notes: '+S.extractedFin.additionalNotes:''}
RENT ROLL: ${rentRoll.length?JSON.stringify(rentRoll):'Not provided'}
Return ONLY valid JSON:
{"executiveSummary":"2-3 paragraphs leading with strongest financial fact","propertyDescription":"2-3 paragraphs with specific physical details","locationOverview":"2 paragraphs specific to ${prop.city} ${prop.state} market","investmentHighlights":["specific highlight with numbers","highlight 2","highlight 3","highlight 4","highlight 5"],"tenantSummary":"1-2 paragraphs on tenancy","valuationNarrative":"2 paragraphs with pricing rationale","financialHighlights":["key metric as bold fact","metric 2","metric 3"],"pullQuotes":["most compelling stat as short phrase","second fact","third fact"],"marketContext":"2 sentences on why ${prop.city} market supports this pricing"}`;
    const nd=await callClaude({model:'claude-sonnet-4-6',max_tokens:5000,messages:[{role:'user',content:narrativePrompt}]});
    try{ai=JSON.parse((nd.content?.[0]?.text||'{}').replace(/```json|```/g,'').trim());}catch(e){ai={};}
  }catch(e){st.innerHTML=`<span style="color:#f5a623;">⚠ AI unavailable (${e.message}) — building from entered data.</span>`;await new Promise(r=>setTimeout(r,2000));}

  [fonts.heading,fonts.body,fonts.number].filter(Boolean).forEach(loadFont);
  await new Promise(r=>setTimeout(r,800));
  st.innerHTML=spin()+'Building document pages...';
  await new Promise(r=>setTimeout(r,100));

  const html=buildDocument(prop,fin,broker,rentRoll,ai,sections,disclaimer,docLabel,firm,city,fonts,selBrokers);
  navigate('preview');
  $('preview-title').textContent=`${prop.name} — ${docLabel}`;
  $('preview-subtitle').textContent=`${prop.address}, ${prop.city}, ${prop.state} ${prop.zip}`;
  $('document-preview-container').innerHTML=html;
  injectPrintCSS();
  st.style.display='none';

  const proj={id:Date.now(),docType:S.docType,propType:S.propType,name:prop.name,address:`${prop.address}, ${prop.city}, ${prop.state}`,price:fin.price,noi:fin.noi,capRate:fin.capRate,sf:prop.sf,createdAt:new Date().toLocaleDateString(),status:'complete'};
  S.projects=[proj,...S.projects]; localStorage.setItem('cds_projects',JSON.stringify(S.projects));
  toast('Document ready — Print / Save as PDF to export');
}

function injectPrintCSS(){
  const ex=$('print-css'); if(ex) ex.remove();
  const s=document.createElement('style'); s.id='print-css';
  s.textContent=`@media print{@page{size:${S.page.w}in ${S.page.h}in;margin:0;}.doc-page{width:${S.page.w}in!important;height:${S.page.h}in!important;min-height:${S.page.h}in!important;}}`;
  document.head.appendChild(s);
}

// ── Document builder ─────────────────────────────────────────
function buildDocument(prop,fin,broker,rentRoll,ai,sections,disclaimer,docLabel,firm,city,F,selBrokers){
  const {w,h}=S.page; const C=S.design.colors; const ta=S.design.analysis; const isLandscape=w>=h;
  const fullAddr=`${prop.address}, ${prop.city}, ${prop.state} ${prop.zip}`;
  const pad=isLandscape?{h:'0.45in',v:'0.5in'}:{h:'0.4in',v:'0.4in'};
  const bfs=parseFloat(ta?.typography?.bodyFontSizePt||10.5);
  const hfs=parseFloat(ta?.typography?.headingFontSizePt||22);

  // Derive from template analysis or defaults
  const useFullBleed=ta?.accentElements?.usesFullBleedPhotos!==false;
  const useSidebar=ta?.accentElements?.usesSidebarPanels!==false&&S.design.layout==='classic';
  const usePullQuotes=ta?.accentElements?.usesPullQuotes!==false;
  const useColorBands=ta?.accentElements?.usesColoredBands!==false;
  const useDecorBars=ta?.accentElements?.usesDecorativeBars!==false;
  const photoStyle=ta?.accentElements?.photoStyle||'full-bleed';
  const headerStyle=ta?.coverPage?.photoTreatment||ta?.accentElements?.headerStyle||'full-bleed-dark-overlay';
  const photoOpacity=ta?.coverPage?.photoOpacity||0.55;
  const photoEmphasis=ta?.designLanguage?.photoEmphasis||'balanced';
  const cornerR=ta?.accentElements?.cornerRadiusPx||4;
  const accentBarThick=ta?.coverPage?.accentBarThicknessPx||5;
  const titlePos=ta?.coverPage?.titlePosition||'bottom-left';
  const statsPos=ta?.coverPage?.statsPosition||'bottom-strip';
  const formality=ta?.designLanguage?.formality||'professional';

  // Google Fonts import
  const fontFamilies=[...new Set([F.heading,F.body,F.number].filter(f=>f&&f!=='Georgia'))];
  const gfUrl=fontFamilies.map(f=>`family=${f.replace(/ /g,'+')}:wght@300;400;500;600;700`).join('&');

  const css=`
@import url('https://fonts.googleapis.com/css2?${gfUrl}&display=swap');
*{box-sizing:border-box;margin:0;padding:0;}
.doc-page{width:${w}in;height:${h}in;min-height:${h}in;overflow:hidden;background:${C.bg};position:relative;font-family:'${F.body}',Inter,sans-serif;color:${C.text};font-size:${bfs}pt;line-height:1.65;}
.pg-footer{position:absolute;bottom:0;left:0;right:0;height:26px;background:${C.primary};display:flex;align-items:center;justify-content:space-between;padding:0 ${pad.h};}
.pg-firm{font-size:7pt;color:${C.accent};letter-spacing:0.5px;}
.pg-broker{font-size:7pt;color:rgba(255,255,255,0.55);}
.eyebrow{font-size:7pt;letter-spacing:2px;text-transform:uppercase;color:${C.secondary};font-family:'${F.heading}',serif;font-weight:600;margin-bottom:5px;}
.sec-rule{height:2px;background:${C.rule};margin-bottom:12px;}
.sec-title{font-family:'${F.heading}',serif;font-size:${Math.round(hfs*0.75)}pt;font-weight:${ta?.typography?.headingWeight||'500'};color:${C.primary};margin-bottom:12px;line-height:1.2;}
.body-text{font-size:${bfs}pt;line-height:1.75;color:${C.text};}
.stat-num{font-family:'${F.number||F.heading}',serif;}
.pull-quote{border-left:4px solid ${C.accent};padding:10px 14px;margin:14px 0;background:${hex2rgba(C.primary,0.04)};border-radius:0 ${cornerR}px ${cornerR}px 0;}
.pull-quote-text{font-family:'${F.heading}',serif;font-size:${bfs*1.1}pt;color:${C.primary};font-style:italic;line-height:1.4;}
.stat-card{background:${C.primary};border-radius:${cornerR}px;padding:${isLandscape?'13px 11px':'9px 9px'};text-align:center;}
.stat-card-lbl{font-size:7pt;letter-spacing:1.5px;text-transform:uppercase;color:${C.accent};margin-bottom:4px;}
.stat-card-val{font-size:${isLandscape?'18':'14'}pt;color:#fff;font-weight:600;font-family:'${F.number||F.heading}',serif;}
.hl-text{font-weight:600;color:${C.secondary};font-family:'${F.number||F.heading}',serif;}
.accent-strip{height:${accentBarThick}px;background:${C.accent};position:absolute;bottom:26px;left:0;right:0;}
`;

  const photos=[...S.photos]; let pi=0;
  const nextPhoto=()=>photos[pi++]||null;

  const footer=()=>`<div class="pg-footer"><span class="pg-firm">${firm} · ${city} · ${docLabel}</span>${broker.name?`<span class="pg-broker">${broker.name}${broker.title?' · '+broker.title:''}${broker.phone?' · '+broker.phone:''}</span>`:''}</div>`;
  const photoImg=(src,h_,fit='cover')=>src?`<img src="${src}" style="width:100%;height:${h_};object-fit:${fit};display:block;${photoStyle==='bordered'?`border-radius:${cornerR}px;border:2px solid ${C.accent};`:`border-radius:${cornerR}px;`}" />`:'';
  const statCards=cards=>{
    const cols=Math.min(cards.length,isLandscape?4:3);
    return `<div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:8px;margin-bottom:14px;">${cards.map(([l,v])=>`<div class="stat-card"><div class="stat-card-lbl">${l}</div><div class="stat-card-val stat-num">${v}</div></div>`).join('')}</div>`;
  };
  const pullQuote=text=>(usePullQuotes&&text)?`<div class="pull-quote"><div class="pull-quote-text">"${text}"</div></div>`:'';
  const decorBar=()=>useDecorBars?`<div style="height:3px;background:${C.accent};width:40px;margin-bottom:12px;border-radius:2px;"></div>`:'';
  const secHeader=(title,eyebrow)=>`${decorBar()}<div class="eyebrow">${eyebrow||docLabel}</div><div class="sec-rule"></div><div class="sec-title">${title}</div>`;
  const insetPhoto=(src,width,float)=>src?`<div style="float:${float};width:${width};margin:${float==='right'?'0 0 10px 14px':'0 14px 10px 0'};border-radius:${cornerR}px;overflow:hidden;">${photoImg(src,'auto')}</div>`:'';
  const pageWrap=(main,side)=>{
    const sideW=isLandscape?'2.0in':'1.65in';
    if(useSidebar&&side){
      return `<div class="doc-page"><div style="height:calc(100% - 26px);display:flex;overflow:hidden;"><div style="flex:1;padding:${pad.h};overflow:hidden;">${main}</div><div style="width:${sideW};flex-shrink:0;padding:${pad.h} ${isLandscape?'0.35in':'0.3in'} ${pad.h} 0;border-left:1.5px solid ${hex2rgba(C.rule,0.15)};overflow:hidden;">${side}</div></div>${footer()}</div>`;
    }
    return `<div class="doc-page"><div style="height:calc(100% - 26px);padding:${pad.h};overflow:hidden;">${main}</div>${footer()}</div>`;
  };

  let pages=`<style>${css}</style>`;

  // ── COVER ──
  if(sections.includes('cover')){
    const hp=nextPhoto();
    const coverStats=[fin.price&&['Asking Price','$'+fmtNum(fin.price)],prop.sf&&['Building SF',fmtNum(prop.sf)+' SF'],fin.capRate&&['Cap Rate',fin.capRate+'%'],fin.noi&&['NOI','$'+fmtNum(fin.noi)],fin.occupancy&&['Occupancy',fin.occupancy+'%']].filter(Boolean);

    if(headerStyle==='split-left-photo'||headerStyle==='split-right-photo'){
      const imgSide=headerStyle==='split-left-photo'?'left':'right';
      const txtSide=imgSide==='left'?'right':'left';
      pages+=`<div class="doc-page" style="background:${C.primary};">
        <div style="position:absolute;${imgSide}:0;top:0;width:52%;height:100%;overflow:hidden;">${hp?`<img src="${hp}" style="width:100%;height:100%;object-fit:cover;display:block;" /><div style="position:absolute;inset:0;background:linear-gradient(to ${txtSide},transparent 40%,${C.primary});"></div>`:''}</div>
        <div style="position:absolute;${txtSide}:0;top:0;width:52%;height:100%;padding:${pad.h};display:flex;flex-direction:column;justify-content:center;">
          <div style="font-size:7pt;letter-spacing:2.5px;text-transform:uppercase;color:${C.accent};font-family:'${F.heading}',serif;font-weight:600;margin-bottom:14px;">${firm} · ${docLabel}</div>
          <div style="height:3px;background:${C.accent};width:40px;margin-bottom:16px;"></div>
          <div style="font-family:'${F.heading}',serif;font-size:${isLandscape?'26':'20'}pt;font-weight:${formality==='luxury'?'400':'500'};color:#fff;line-height:1.1;margin-bottom:10px;">${prop.name}</div>
          <div style="font-size:${isLandscape?'11':'9'}pt;color:rgba(255,255,255,0.65);margin-bottom:18px;">${fullAddr}</div>
          ${coverStats.map(([l,v])=>`<div style="margin-bottom:10px;"><div style="font-size:6.5pt;letter-spacing:1.5px;text-transform:uppercase;color:${C.accent};opacity:0.8;margin-bottom:3px;">${l}</div><div style="font-size:${isLandscape?'18':'15'}pt;color:#fff;font-weight:600;font-family:'${F.number||F.heading}',serif;">${v}</div></div>`).join('')}
          ${broker.name?`<div style="margin-top:auto;padding-top:14px;border-top:1px solid ${hex2rgba(C.accent,0.3)};"><div style="font-size:10pt;color:#fff;font-weight:500;">${broker.name}</div>${broker.title?`<div style="font-size:8pt;color:${C.accent};">${broker.title}</div>`:''}</div>`:''}
        </div>
        ${footer()}
      </div>`;
    } else {
      // Full bleed dark overlay (default)
      pages+=`<div class="doc-page" style="background:${C.primary};">
        ${hp?`<div style="position:absolute;inset:0;"><img src="${hp}" style="width:100%;height:100%;object-fit:cover;display:block;opacity:${photoOpacity};" /><div style="position:absolute;inset:0;background:linear-gradient(160deg,${hex2rgba(C.primary,0.2)} 0%,${hex2rgba(C.primary,0.65)} 45%,${hex2rgba(C.primary,0.96)} 100%);"></div></div>`:''}
        <div style="position:relative;z-index:2;height:100%;display:flex;flex-direction:column;padding:${pad.h};padding-bottom:0;">
          <div style="margin-bottom:auto;">
            <div style="font-size:7.5pt;letter-spacing:3px;text-transform:uppercase;color:${C.accent};font-family:'${F.heading}',serif;font-weight:600;margin-bottom:${isLandscape?'0.22in':'0.16in'};">${firm.toUpperCase()} · ${docLabel.toUpperCase()}</div>
            <div style="height:${accentBarThick}px;background:${C.accent};width:${isLandscape?'60px':'45px'};margin-bottom:${isLandscape?'16px':'12px'};border-radius:2px;"></div>
            <div style="font-family:'${F.heading}',serif;font-size:${isLandscape?'38':'28'}pt;font-weight:${formality==='luxury'?'400':'500'};color:#fff;line-height:1.05;margin-bottom:8px;max-width:${isLandscape?'6.5in':'4.5in'};letter-spacing:${formality==='luxury'?'-0.5px':'0'};">${prop.name}</div>
            <div style="font-size:${isLandscape?'13':'11'}pt;color:rgba(255,255,255,0.65);margin-bottom:6px;">${fullAddr}</div>
            ${prop.sf||prop.yearBuilt?`<div style="font-size:9pt;color:rgba(255,255,255,0.45);">${prop.sf?fmtNum(prop.sf)+' SF':''}${prop.sf&&prop.yearBuilt?' · ':''}${prop.yearBuilt?'Built '+prop.yearBuilt:''}${prop.zoning?' · '+prop.zoning:''}</div>`:''}
          </div>
          <div style="border-top:1.5px solid ${hex2rgba(C.accent,0.45)};padding-top:${isLandscape?'0.16in':'0.12in'};padding-bottom:${isLandscape?'0.3in':'0.25in'};display:flex;gap:${isLandscape?'0.32in':'0.2in'};flex-wrap:wrap;align-items:flex-end;">
            ${coverStats.map(([l,v])=>`<div style="flex-shrink:0;"><div style="font-size:6.5pt;letter-spacing:1.5px;text-transform:uppercase;color:${hex2rgba(C.accent,0.8)};margin-bottom:3px;">${l}</div><div style="font-family:'${F.number||F.heading}',serif;font-size:${isLandscape?'21':'16'}pt;color:#fff;font-weight:600;line-height:1;">${v}</div></div>`).join('')}
            ${broker.name?`<div style="margin-left:auto;text-align:right;align-self:flex-end;"><div style="font-size:10pt;color:#fff;font-weight:500;">${broker.name}</div>${broker.title?`<div style="font-size:8pt;color:${C.accent};">${broker.title}</div>`:''}${broker.phone?`<div style="font-size:8pt;color:rgba(255,255,255,0.5);">${broker.phone}</div>`:''}</div>`:''}
          </div>
          <div class="accent-strip"></div>
        </div>
        ${footer()}
      </div>`;
    }
  }

  // ── HIGHLIGHTS ──
  if(sections.includes('highlights')){
    const hiList=ai.investmentHighlights?.length?ai.investmentHighlights:(prop.highlights?prop.highlights.split('\n').filter(Boolean):[]);
    const finHi=ai.financialHighlights||[]; const ph=nextPhoto();
    const sideContent=ph?`${photoImg(ph,isLandscape?'1.7in':'2in')}<div style="margin-top:10px;padding:10px;background:${C.primary};border-radius:${cornerR}px;text-align:center;">${fin.price?`<div style="font-size:7pt;letter-spacing:1px;text-transform:uppercase;color:${C.accent};margin-bottom:3px;">Offered At</div><div style="font-size:16pt;color:#fff;font-weight:600;font-family:'${F.number||F.heading}',serif;">${fmtDollar(fin.price)||''}</div>${fin.capRate?`<div style="font-size:8pt;color:rgba(255,255,255,0.6);margin-top:2px;">${fin.capRate}% Cap Rate</div>`:''}`:''}${fin.noi?`<div style="margin-top:6px;font-size:7pt;letter-spacing:1px;text-transform:uppercase;color:${C.accent};">NOI</div><div style="font-size:13pt;color:#fff;font-weight:600;font-family:'${F.number||F.heading}',serif;">${fmtDollar(fin.noi)||''}</div>`:''}</div>`:'';
    const main=`${secHeader('Investment Highlights',docLabel)}${finHi.length?`<div style="margin-bottom:12px;">${finHi.map(h=>`<div style="display:flex;align-items:flex-start;gap:8px;padding:5px 0;border-bottom:1px solid ${hex2rgba(C.rule,0.12)};"><div style="width:8px;height:8px;border-radius:50%;background:${C.accent};margin-top:3px;flex-shrink:0;"></div><span class="body-text hl-text">${h}</span></div>`).join('')}</div>`:''}${hiList.map(h=>`<div style="display:flex;align-items:flex-start;gap:8px;padding:6px 0;border-bottom:1px solid ${hex2rgba(C.rule,0.1)};"><div style="width:6px;height:6px;border-radius:50%;background:${C.secondary};margin-top:4px;flex-shrink:0;"></div><span class="body-text">${h}</span></div>`).join('')}${pullQuote(ai.pullQuotes?.[0])}${ai.executiveSummary?`<div style="margin-top:12px;"><div class="eyebrow">Executive Summary</div><div class="body-text">${ai.executiveSummary.slice(0,600)}</div></div>`:''}`;
    pages+=pageWrap(main,sideContent);
  }

  // ── PROPERTY DETAILS ──
  if(sections.includes('property')){
    const rows=[['Property Name',prop.name],['Address',fullAddr],['County',prop.county],['Type',S.propType],['Year Built',prop.yearBuilt],['Building SF',prop.sf?fmtNum(prop.sf)+' SF':''],['Lot Size',prop.acres?prop.acres+' Acres':''],['Buildings',prop.buildings],['Suites/Units',prop.units],['Zoning',prop.zoning],['Clear Height',prop.clearHeight?prop.clearHeight+' ft':''],['Parking',prop.parking?prop.parking+' spaces':'']].filter(([,v])=>v);
    const ph2=nextPhoto();
    const main=`${secHeader('Property Details',docLabel)}${ph2&&photoEmphasis!=='subtle'?insetPhoto(ph2,isLandscape?'42%':'38%','right'):''}${ai.propertyDescription?`<div class="body-text" style="margin-bottom:14px;">${ai.propertyDescription.slice(0,500)}</div>`:''}
<table style="width:100%;border-collapse:collapse;font-size:${bfs-1}pt;clear:both;">${rows.map((r,i)=>`<tr style="background:${i%2===0?hex2rgba(C.primary,0.04):'transparent'};"><td style="padding:7px 10px;font-weight:600;color:${C.primary};width:35%;border-bottom:1px solid ${hex2rgba(C.rule,0.14)};">${r[0]}</td><td style="padding:7px 10px;border-bottom:1px solid ${hex2rgba(C.rule,0.14)};">${r[1]}</td></tr>`).join('')}</table>${pullQuote(ai.pullQuotes?.[1])}`;
    pages+=pageWrap(main,'');
  }

  // ── PHOTOS ──
  if(sections.includes('photos')&&photos.length>0){
    const pagePhotos=[]; let ph3; while((ph3=nextPhoto())&&pagePhotos.length<6) pagePhotos.push(ph3);
    if(!pagePhotos.length&&photos[0]) pagePhotos.push(photos[0]);
    let grid='';
    if(pagePhotos.length===1) grid=`<div style="height:${isLandscape?'5.2in':'6.8in'};border-radius:${cornerR}px;overflow:hidden;">${photoImg(pagePhotos[0],'100%')}</div>`;
    else if(pagePhotos.length===2) grid=`<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;height:${isLandscape?'5.2in':'6.8in'};">${pagePhotos.map(p=>`<div style="overflow:hidden;border-radius:${cornerR}px;">${photoImg(p,'100%')}</div>`).join('')}</div>`;
    else if(pagePhotos.length===3) grid=`<div style="display:grid;grid-template-columns:1.5fr 1fr;grid-template-rows:1fr 1fr;gap:10px;height:${isLandscape?'5.2in':'6.5in'};"><div style="grid-row:1/3;overflow:hidden;border-radius:${cornerR}px;">${photoImg(pagePhotos[0],'100%')}</div><div style="overflow:hidden;border-radius:${cornerR}px;">${photoImg(pagePhotos[1],'100%')}</div><div style="overflow:hidden;border-radius:${cornerR}px;">${photoImg(pagePhotos[2],'100%')}</div></div>`;
    else{ const pr=isLandscape?3:2; grid=`<div style="display:grid;grid-template-columns:repeat(${pr},1fr);gap:10px;">${pagePhotos.map(p=>`<div style="height:${isLandscape?'2.4in':'2.8in'};overflow:hidden;border-radius:${cornerR}px;">${photoImg(p,'100%')}</div>`).join('')}</div>`; }
    pages+=`<div class="doc-page"><div style="height:calc(100%-26px);padding:${pad.h};overflow:hidden;">${secHeader('Property Photos',docLabel)}${grid}</div>${footer()}</div>`;
  }

  // ── LOCATION ──
  if(sections.includes('location')){
    const locText=ai.locationOverview||`${prop.city}, ${prop.state} offers strong fundamentals for commercial real estate investment. The subject property benefits from its strategic location within the ${prop.city} submarket.`;
    const mkt=ai.marketContext||'';
    const locPh=nextPhoto();
    const sideContent=useSidebar?`<canvas id="loc-map-canvas" width="260" height="180" style="border-radius:${cornerR}px;display:block;width:100%;"></canvas><div style="margin-top:6px;font-size:7pt;color:${C.text};opacity:0.6;font-style:italic;">Location map</div>${locPh?`<div style="margin-top:8px;border-radius:${cornerR}px;overflow:hidden;">${photoImg(locPh,'1.3in')}</div>`:''}`:'' ;
    const mapCanvas=!useSidebar?`<canvas id="loc-map-canvas" width="500" height="180" style="border-radius:${cornerR}px;display:block;width:100%;margin-top:12px;"></canvas>`:'';
    const main=`${secHeader('Location & Market Overview',docLabel)}${ai.locationOverview?`<div class="body-text">${locText}</div>`:`<div class="body-text">${locText}</div>`}${mkt?`<div style="margin-top:10px;padding:10px 12px;background:${hex2rgba(C.accent,0.12)};border-radius:${cornerR}px;border-left:3px solid ${C.accent};"><div class="body-text" style="font-style:italic;">${mkt}</div></div>`:''}${mapCanvas}`;
    pages+=pageWrap(main,sideContent);
    pages+=`<script>(function(){setTimeout(function(){const c=document.getElementById('loc-map-canvas');if(!c)return;const ctx=c.getContext('2d'),W=c.width,H=c.height;ctx.fillStyle='#e8e4dc';ctx.fillRect(0,0,W,H);[[0,H*.45,W,H*.45],[0,H*.65,W,H*.65],[W*.3,0,W*.3,H],[W*.65,0,W*.65,H]].forEach(([x1,y1,x2,y2])=>{ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.strokeStyle='#d8ceb4';ctx.lineWidth=6;ctx.stroke();});const sx=W*.48,sy=H*.52;ctx.beginPath();ctx.arc(sx,sy,Math.min(W,H)*.28,0,Math.PI*2);ctx.strokeStyle='${C.accent}';ctx.lineWidth=1.5;ctx.setLineDash([5,4]);ctx.stroke();ctx.setLineDash([]);ctx.beginPath();ctx.arc(sx,sy,9,0,Math.PI*2);ctx.fillStyle='${C.primary}';ctx.fill();ctx.strokeStyle='${C.accent}';ctx.lineWidth=3;ctx.stroke();[[sx-55,sy-20,'#1D9E75'],[sx+45,sy+25,'#D85A30'],[sx-30,sy+45,'#7F77DD'],[sx+60,sy-35,'#1D9E75'],[sx-70,sy+15,'#D85A30']].forEach(([px,py,col])=>{ctx.beginPath();ctx.arc(px,py,5,0,Math.PI*2);ctx.fillStyle=col;ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=1.5;ctx.stroke();});ctx.font='bold 9px Arial';ctx.fillStyle='${C.primary}';ctx.textAlign='center';ctx.fillText('${(prop.address||'Subject').slice(0,22)}',sx,sy-14);},300);})();<\/script>`;
  }

  // ── FINANCIALS ──
  if(sections.includes('financials')){
    const ef=S.extractedFin||{};
    const cards=[fin.price&&['Asking Price','$'+fmtNum(fin.price)],fin.ppsf&&['Price / SF','$'+fin.ppsf],fin.noi&&['NOI','$'+fmtNum(fin.noi)],fin.capRate&&['Cap Rate',fin.capRate+'%'],fin.occupancy&&['Occupancy',fin.occupancy+'%'],fin.walt&&['WALT',fin.walt+' Yrs'],(ef.finDscr||fin.dscr)&&['DSCR',ef.finDscr||fin.dscr||'—'],ef.finCashOnCash&&['Cash-on-Cash',ef.finCashOnCash]].filter(Boolean);
    const expBD=(ef.expenseBreakdown||[]).filter(e=>e.item&&e.amount);
    const main=`${secHeader('Financial Summary',docLabel)}${statCards(cards.slice(0,isLandscape?4:3))}${cards.length>(isLandscape?4:3)?statCards(cards.slice(isLandscape?4:3)):''}${pullQuote(ai.pullQuotes?.[2])}
<table style="width:100%;border-collapse:collapse;font-size:${bfs-0.5}pt;margin-top:10px;">
<thead><tr style="background:${C.primary};"><th style="padding:8px 10px;color:#fff;text-align:left;font-weight:500;font-size:7.5pt;">Income Statement</th><th style="padding:8px 10px;color:#fff;text-align:right;font-weight:500;font-size:7.5pt;">Annual</th></tr></thead>
<tbody>
${fin.gpr?`<tr><td style="padding:7px 10px;border-bottom:1px solid ${hex2rgba(C.rule,0.14)};">Gross Potential Rent</td><td style="padding:7px 10px;text-align:right;border-bottom:1px solid ${hex2rgba(C.rule,0.14)};">$${fmtNum(fin.gpr)}</td></tr>`:''}
${fin.vacancy?`<tr style="background:${hex2rgba(C.primary,0.03)};"><td style="padding:7px 10px;border-bottom:1px solid ${hex2rgba(C.rule,0.14)};">Less: Vacancy (${fin.vacancy}%)</td><td style="padding:7px 10px;text-align:right;border-bottom:1px solid ${hex2rgba(C.rule,0.14)};color:#cc3333;">($${fmtNum(Math.round(parseFloat(fin.gpr||0)*parseFloat(fin.vacancy||0)/100))})</td></tr>`:''}
${fin.egi?`<tr><td style="padding:7px 10px;border-bottom:1px solid ${hex2rgba(C.rule,0.14)};">Effective Gross Income</td><td style="padding:7px 10px;text-align:right;border-bottom:1px solid ${hex2rgba(C.rule,0.14)};">$${fmtNum(fin.egi)}</td></tr>`:''}
${fin.opex?`<tr style="background:${hex2rgba(C.primary,0.03)};"><td style="padding:7px 10px;border-bottom:1px solid ${hex2rgba(C.rule,0.14)};">Less: Operating Expenses</td><td style="padding:7px 10px;text-align:right;border-bottom:1px solid ${hex2rgba(C.rule,0.14)};color:#cc3333;">($${fmtNum(fin.opex)})</td></tr>`:''}
${expBD.map(e=>`<tr><td style="padding:4px 10px 4px 20px;border-bottom:1px solid ${hex2rgba(C.rule,0.08)};font-size:8pt;color:${C.text};opacity:0.8;">— ${e.item}</td><td style="padding:4px 10px;text-align:right;border-bottom:1px solid ${hex2rgba(C.rule,0.08)};font-size:8pt;">$${fmtNum(e.amount)}</td></tr>`).join('')}
${fin.noi?`<tr style="background:${C.primary};"><td style="padding:9px 10px;color:#fff;font-weight:600;">Net Operating Income</td><td style="padding:9px 10px;text-align:right;color:${C.accent};font-weight:600;font-family:'${F.number||F.heading}',serif;font-size:${bfs+1.5}pt;">$${fmtNum(fin.noi)}</td></tr>`:''}
${fin.debtService?`<tr><td style="padding:7px 10px;border-bottom:1px solid ${hex2rgba(C.rule,0.14)};">Annual Debt Service</td><td style="padding:7px 10px;text-align:right;border-bottom:1px solid ${hex2rgba(C.rule,0.14)};">$${fmtNum(fin.debtService)}</td></tr>`:''}
${ef.recentCapex?`<tr style="background:${hex2rgba(C.accent,0.1)};"><td style="padding:7px 10px;border-bottom:1px solid ${hex2rgba(C.rule,0.14)};font-weight:500;">Recent CapEx</td><td style="padding:7px 10px;text-align:right;border-bottom:1px solid ${hex2rgba(C.rule,0.14)};font-weight:500;">${ef.recentCapex}</td></tr>`:''}
${ef.additionalNotes?`<tr><td colspan="2" style="padding:7px 10px;font-size:8pt;font-style:italic;color:${C.text};opacity:0.7;">${ef.additionalNotes}</td></tr>`:''}
</tbody></table>`;
    pages+=pageWrap(main,'');
  }

  // ── RENT ROLL ──
  if(sections.includes('rentroll')&&rentRoll.length>0){
    const main=`${secHeader('Rent Roll',docLabel)}
<table style="width:100%;border-collapse:collapse;font-size:${bfs-1}pt;">
<thead><tr style="background:${C.primary};">${['Tenant','Suite','SF','Lease Start','Lease End','Annual Rent','$/SF'].map(h=>`<th style="padding:7px 9px;color:#fff;text-align:left;font-weight:500;font-size:7pt;">${h}</th>`).join('')}</tr></thead>
<tbody>${rentRoll.map((r,i)=>{
  const rpsf=r.sf&&r.annualRent?'$'+(parseFloat(r.annualRent)/parseFloat(r.sf)).toFixed(2):'—';
  const isBig=parseFloat(r.annualRent)>parseFloat(fin.gpr||0)*0.3;
  return `<tr style="background:${i%2===0?hex2rgba(C.primary,0.04):'transparent'}${isBig?';border-left:3px solid '+C.accent:''};">
<td style="padding:7px 9px;border-bottom:1px solid ${hex2rgba(C.rule,0.12)};font-weight:${isBig?'600':'400'};color:${C.primary};">${r.tenant}</td>
<td style="padding:7px 9px;border-bottom:1px solid ${hex2rgba(C.rule,0.12)};">${r.suite||'—'}</td>
<td style="padding:7px 9px;border-bottom:1px solid ${hex2rgba(C.rule,0.12)};">${r.sf?fmtNum(r.sf):'—'}</td>
<td style="padding:7px 9px;border-bottom:1px solid ${hex2rgba(C.rule,0.12)};">${r.leaseStart||'—'}</td>
<td style="padding:7px 9px;border-bottom:1px solid ${hex2rgba(C.rule,0.12)};">${r.leaseEnd||'—'}</td>
<td style="padding:7px 9px;border-bottom:1px solid ${hex2rgba(C.rule,0.12)};font-family:'${F.number||F.heading}',serif;font-weight:${isBig?'600':'400'};">${r.annualRent?'$'+fmtNum(r.annualRent):'—'}</td>
<td style="padding:7px 9px;border-bottom:1px solid ${hex2rgba(C.rule,0.12)};font-family:'${F.number||F.heading}',serif;">${rpsf}</td></tr>`;
}).join('')}
${rentRoll.length>1?`<tr style="background:${C.primary};"><td colspan="2" style="padding:7px 9px;color:#fff;font-weight:600;">Total</td><td style="padding:7px 9px;color:#fff;">${fmtNum(rentRoll.reduce((s,r)=>s+parseFloat(r.sf||0),0))} SF</td><td colspan="2"></td><td style="padding:7px 9px;color:${C.accent};font-family:'${F.number||F.heading}',serif;font-weight:600;">${fin.gpr?'$'+fmtNum(fin.gpr)+'/yr':''}</td><td style="padding:7px 9px;color:#fff;">${fin.ppsf?'$'+fin.ppsf:''}</td></tr>`:''}
</tbody></table>${ai.tenantSummary?`<div style="margin-top:10px;padding:9px 12px;background:${hex2rgba(C.secondary,0.07)};border-radius:${cornerR}px;border-left:3px solid ${C.secondary};"><div class="body-text" style="font-size:${bfs-1}pt;">${ai.tenantSummary.slice(0,280)}</div></div>`:''}`;
    pages+=pageWrap(main,'');
  }

  // ── TENANT SUMMARY ──
  if(sections.includes('tenants')&&!sections.includes('rentroll')){
    const t=ai.tenantSummary||`The property is ${fin.occupancy?fin.occupancy+'% occupied':'occupied'}${fin.walt?' with a WALT of '+fin.walt+' years':''}.`;
    pages+=pageWrap(`${secHeader('Tenant Summary',docLabel)}<div class="body-text">${t}</div>`,'');
  }

  // ── VALUATION ──
  if(sections.includes('valuation')){
    const vText=ai.valuationNarrative||`${S.docType==='om'?'The Seller is offering the property':'Based on our analysis, we estimate the value'} at ${fin.price?'$'+fmtNum(fin.price):'a price to be determined'}${fin.capRate?', representing a '+fin.capRate+'% capitalization rate':''}${fin.noi?' on an NOI of $'+fmtNum(fin.noi):''}. ${ai.marketContext||''}`;
    const valPh=nextPhoto();
    const valBox=(fin.price||fin.capRate)?`<div style="background:${C.primary};border-radius:${cornerR}px;padding:${isLandscape?'16px 20px':'12px 16px'};margin-top:14px;display:flex;justify-content:space-around;align-items:center;flex-wrap:wrap;gap:12px;">${fin.price?`<div style="text-align:center;"><div style="font-size:7pt;letter-spacing:1.5px;text-transform:uppercase;color:${C.accent};margin-bottom:3px;">Offered At</div><div style="font-size:${isLandscape?'26':'20'}pt;color:#fff;font-weight:600;font-family:'${F.number||F.heading}',serif;">${fmtDollar(fin.price)||''}</div></div>`:''} ${fin.ppsf?`<div style="text-align:center;"><div style="font-size:7pt;letter-spacing:1.5px;text-transform:uppercase;color:${C.accent};margin-bottom:3px;">Price / SF</div><div style="font-size:${isLandscape?'20':'16'}pt;color:#fff;font-weight:600;font-family:'${F.number||F.heading}',serif;">$${fin.ppsf}</div></div>`:''} ${fin.capRate?`<div style="text-align:center;"><div style="font-size:7pt;letter-spacing:1.5px;text-transform:uppercase;color:${C.accent};margin-bottom:3px;">Cap Rate</div><div style="font-size:${isLandscape?'20':'16'}pt;color:#fff;font-weight:600;font-family:'${F.number||F.heading}',serif;">${fin.capRate}%</div></div>`:''} ${fin.noi?`<div style="text-align:center;"><div style="font-size:7pt;letter-spacing:1.5px;text-transform:uppercase;color:${C.accent};margin-bottom:3px;">NOI</div><div style="font-size:${isLandscape?'20':'16'}pt;color:#fff;font-weight:600;font-family:'${F.number||F.heading}',serif;">${fmtDollar(fin.noi)||''}</div></div>`:''}</div>`:'';
    const main=`${secHeader('Valuation & Pricing',docLabel)}${valPh?`<div style="height:${isLandscape?'1.5in':'1.8in'};margin-bottom:12px;border-radius:${cornerR}px;overflow:hidden;">${photoImg(valPh,'100%')}</div>`:''}<div class="body-text">${vText}</div>${valBox}`;
    pages+=pageWrap(main,'');
  }

  // ── TEAM ──
  if(sections.includes('team')&&selBrokers.length>0){
    const cols=Math.min(selBrokers.length,isLandscape?3:2);
    const cardW=isLandscape?`${(100/cols).toFixed(1)}%`:'47%';
    const teamCards=selBrokers.map(b=>`<div style="background:${hex2rgba(C.primary,0.04)};border:1px solid ${hex2rgba(C.rule,0.2)};border-radius:${cornerR}px;padding:16px;text-align:center;width:${cardW};flex-shrink:0;">
${b.photo?`<img src="${b.photo}" style="width:70px;height:70px;border-radius:50%;object-fit:cover;border:3px solid ${C.accent};margin-bottom:10px;" />`:`<div style="width:70px;height:70px;border-radius:50%;background:${C.primary};border:3px solid ${C.accent};margin:0 auto 10px;display:flex;align-items:center;justify-content:center;font-family:'${F.heading}',serif;font-size:24px;font-weight:600;color:#fff;">${(b.name||'?')[0]}</div>`}
<div style="font-family:'${F.heading}',serif;font-size:14pt;font-weight:500;color:${C.primary};margin-bottom:3px;">${b.name}</div>
<div style="font-size:9pt;color:${C.secondary};margin-bottom:8px;">${b.title||''}</div>
${b.spec?`<div style="font-size:8pt;color:${C.text};opacity:0.7;margin-bottom:8px;">${b.spec}</div>`:''}
<div style="font-size:8.5pt;color:${C.text};line-height:1.7;">${[b.phone,b.email,b.license].filter(Boolean).join('<br>')}</div>
${b.bio?`<div style="font-size:8pt;color:${C.text};opacity:0.75;line-height:1.6;margin-top:8px;border-top:1px solid ${hex2rgba(C.rule,0.15)};padding-top:8px;">${b.bio.slice(0,200)}</div>`:''}
</div>`).join('');
    pages+=pageWrap(`${secHeader('Our Team',docLabel)}<div style="display:flex;flex-wrap:wrap;gap:14px;justify-content:center;">${teamCards}</div>`,'');
  }

  // ── DISCLAIMER ──
  if(sections.includes('disclaimer')){
    pages+=pageWrap(`${secHeader('Disclaimer & Confidentiality',docLabel)}<div style="font-size:8.5pt;color:${C.text};opacity:0.65;line-height:1.8;">${disclaimer}</div>${broker.name?`<div style="margin-top:16px;padding:12px 14px;background:${hex2rgba(C.primary,0.05)};border-radius:${cornerR}px;border-top:3px solid ${C.accent};"><div style="font-weight:600;color:${C.primary};font-size:10pt;">${broker.name}</div>${broker.title?`<div style="color:${C.secondary};font-size:9pt;">${broker.title}</div>`:''}<div style="margin-top:5px;font-size:8.5pt;color:${C.text};">${[broker.phone,broker.email,broker.license].filter(Boolean).join(' · ')}</div><div style="margin-top:3px;font-size:8.5pt;color:${C.text};opacity:0.7;">${firm} · ${city}</div></div>`:''}`, '');
  }

  return pages;
}

// ── MAP GENERATOR ────────────────────────────────────────────
async function initMap(){
  const container=$('mapbox-container'); if(!container) return;
  if(S.map.instance) return; // already initialized
  if(!S.map.token){
    try{ const r=await fetch('/api/config'); const d=await r.json(); S.map.token=d.mapboxToken||''; }catch(e){}
  }
  if(!S.map.token){
    $('map-overlay-msg').innerHTML='<div style="font-size:13px;color:#cc3333;">Mapbox token not configured.<br><span style="font-size:11px;color:var(--text-muted);">Add MAPBOX_TOKEN to Railway environment variables.</span></div>';
    return;
  }
  mapboxgl.accessToken=S.map.token;
  S.map.instance=new mapboxgl.Map({container:'mapbox-container',style:'mapbox://styles/mapbox/streets-v12',center:S.map.center,zoom:S.map.zoom});
  S.map.instance.addControl(new mapboxgl.NavigationControl(),'top-right');
  S.map.instance.on('load',()=>{ $('map-overlay-msg').style.display='none'; addRadiusCircle(); });
}

function addRadiusCircle(){
  const map=S.map.instance; if(!map||!S.map.subjectLng) return;
  const radiusMi=parseFloat($('map-radius')?.value||1);
  const radiusKm=radiusMi*1.60934;
  const circleId='radius-circle';
  if(map.getSource(circleId)){map.removeLayer(circleId+'-fill');map.removeLayer(circleId+'-line');map.removeSource(circleId);}
  const center=[S.map.subjectLng,S.map.subjectLat];
  const points=64;
  const coords=Array.from({length:points+1},(_, i)=>{
    const angle=(i/points)*2*Math.PI;
    const dx=radiusKm*Math.cos(angle)/(111.32*Math.cos(S.map.subjectLat*Math.PI/180));
    const dy=radiusKm*Math.sin(angle)/110.574;
    return [center[0]+dx,center[1]+dy];
  });
  map.addSource(circleId,{type:'geojson',data:{type:'Feature',geometry:{type:'Polygon',coordinates:[coords]}}});
  map.addLayer({id:circleId+'-fill',type:'fill',source:circleId,paint:{'fill-color':S.design.colors.secondary,'fill-opacity':0.08}});
  map.addLayer({id:circleId+'-line',type:'line',source:circleId,paint:{'line-color':S.design.colors.accent,'line-width':2,'line-dasharray':[5,3]}});
}

function updateRadius(){ if(S.map.subjectLng) addRadiusCircle(); }

function changeMapStyle(style){
  if(S.map.instance) S.map.instance.setStyle('mapbox://styles/'+style);
}

async function geocodeAddress(){
  const addr=$('map-address')?.value; if(!addr||!S.map.token) return;
  try{
    const url=`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(addr)}.json?access_token=${S.map.token}&limit=1`;
    const r=await fetch(url); const d=await r.json();
    if(!d.features?.length){toast('Address not found');return;}
    const [lng,lat]=d.features[0].center;
    S.map.subjectLng=lng; S.map.subjectLat=lat;
    S.map.instance.flyTo({center:[lng,lat],zoom:14});
    // Remove old subject marker
    if(S.map.subjectMarker) S.map.subjectMarker.remove();
    const el=document.createElement('div');
    el.style.cssText=`width:18px;height:18px;border-radius:50%;background:${S.design.colors.primary};border:3px solid ${S.design.colors.accent};box-shadow:0 2px 6px rgba(0,0,0,0.3);`;
    S.map.subjectMarker=new mapboxgl.Marker({element:el}).setLngLat([lng,lat]).setPopup(new mapboxgl.Popup({offset:25}).setHTML(`<div class="map-popup-title">Subject Property</div><div class="map-popup-detail">${addr}</div>`)).addTo(S.map.instance);
    addRadiusCircle(); addPin({name:'Subject Property',address:addr,lng,lat,color:S.design.colors.primary,type:'subject'});
    $('map-overlay-msg').style.display='none';
  }catch(e){toast('Geocoding failed: '+e.message);}
}

async function searchNearby(){
  const query=$('amenity-input')?.value; if(!query) return;
  if(!S.map.subjectLng){toast('Set a subject property location first');return;}
  if(!S.map.token){toast('Mapbox token not configured');return;}
  const resultsEl=$('amenity-results'); resultsEl.innerHTML=`<div style="font-size:12px;color:var(--text-muted);padding:8px;">Searching...</div>`;
  try{
    // Use Mapbox Geocoding API for POI search near the subject
    const url=`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${S.map.token}&proximity=${S.map.subjectLng},${S.map.subjectLat}&limit=8&types=poi`;
    const r=await fetch(url); const d=await r.json();
    if(!d.features?.length){resultsEl.innerHTML='<div style="font-size:12px;color:var(--text-muted);padding:8px;">No results found.</div>';return;}
    resultsEl.innerHTML=d.features.map((f,i)=>{
      const [lng,lat]=f.center; const name=f.text; const addr=f.place_name;
      return `<div class="amenity-result-item"><div style="flex:1;"><div class="amenity-name">${name}</div><div class="amenity-addr">${addr.slice(0,50)}</div></div><button class="amenity-add-btn" onclick="addAmenityPin(${JSON.stringify({name,address:addr,lng,lat}).replace(/"/g,'&quot;')})">+ Pin</button></div>`;
    }).join('');
  }catch(e){resultsEl.innerHTML=`<div style="font-size:12px;color:#cc3333;padding:8px;">${e.message}</div>`;}
}

function quickSearch(type){ const el=$('amenity-input'); if(el) el.value=type; searchNearby(); }

function addAmenityPin({name,address,lng,lat}){
  const color='#1D9E75';
  const el=document.createElement('div');
  el.style.cssText=`width:12px;height:12px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.3);`;
  new mapboxgl.Marker({element:el}).setLngLat([lng,lat]).setPopup(new mapboxgl.Popup({offset:20}).setHTML(`<div class="map-popup-title">${name}</div><div class="map-popup-detail">${address}</div>`)).addTo(S.map.instance);
  addPin({name,address,lng,lat,color,type:'amenity'});
  toast(`Pinned: ${name}`);
}

function addPin(pin){
  S.map.pins.push({...pin,id:Date.now()});
  renderPinsList();
}

function renderPinsList(){
  const el=$('pins-list'); if(!el) return;
  const pins=S.map.pins.filter(p=>p.type!=='subject');
  if(!pins.length){el.innerHTML='<div style="font-size:12px;color:var(--text-muted);">No pins yet.</div>';return;}
  el.innerHTML=pins.map(p=>`<div class="pin-item"><div class="pin-dot" style="background:${p.color||'#666'};"></div><span class="pin-label">${p.name}</span><button class="pin-remove" onclick="removePin(${p.id})">×</button></div>`).join('');
}

function removePin(id){ S.map.pins=S.map.pins.filter(p=>p.id!==id); renderPinsList(); toast('Pin removed'); }

function toggleCompForm(){ const f=$('comp-form'); f.style.display=f.style.display==='none'?'block':'none'; }

async function addComp(){
  const name=$('comp-name')?.value||'Comp'; const addr=$('comp-address')?.value;
  if(!addr){toast('Enter an address');return;}
  if(!S.map.token){toast('Mapbox token required');return;}
  try{
    const url=`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(addr)}.json?access_token=${S.map.token}&limit=1`;
    const r=await fetch(url); const d=await r.json();
    if(!d.features?.length){toast('Address not found');return;}
    const [lng,lat]=d.features[0].center;
    const type=$('comp-type')?.value||'sale';
    const color=type==='sale'?'#D85A30':type==='lease'?'#7F77DD':'#F5A623';
    const price=$('comp-price')?.value; const sf=$('comp-sf')?.value; const ppsf=$('comp-ppsf')?.value; const capRate=$('comp-caprate')?.value;
    const popup=`<div class="map-popup-title">${name}</div><div class="map-popup-detail">${addr}<br>${[price,sf?sf+' SF':'',ppsf,capRate].filter(Boolean).join(' · ')}</div>`;
    const el=document.createElement('div');
    el.style.cssText=`width:14px;height:14px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.3);`;
    new mapboxgl.Marker({element:el}).setLngLat([lng,lat]).setPopup(new mapboxgl.Popup({offset:20}).setHTML(popup)).addTo(S.map.instance);
    const comp={id:Date.now(),name,address:addr,price,sf,ppsf,capRate,type,color,lng,lat};
    S.map.comps.push(comp); renderCompList(); addPin({name,address:addr,lng,lat,color,type:'comp'});
    toggleCompForm(); [$('comp-name'),$('comp-address'),$('comp-price'),$('comp-sf'),$('comp-ppsf'),$('comp-caprate')].forEach(el=>{if(el)el.value='';});
    toast(`Comp added: ${name}`);
  }catch(e){toast('Error: '+e.message);}
}

function renderCompList(){
  const el=$('comp-list'); if(!el) return;
  if(!S.map.comps.length){el.innerHTML='';return;}
  el.innerHTML=S.map.comps.map(c=>`<div class="comp-item"><div class="comp-dot" style="background:${c.color};"></div><div class="comp-info"><div class="comp-name-text">${c.name}</div><div class="comp-detail">${[c.price,c.sf?c.sf+' SF':'',c.ppsf,c.capRate].filter(Boolean).join(' · ')}</div></div><button class="comp-remove" onclick="removeComp(${c.id})">×</button></div>`).join('');
}

function removeComp(id){ S.map.comps=S.map.comps.filter(c=>c.id!==id); renderCompList(); toast('Comp removed'); }

async function exportMapImage(){
  if(!S.map.instance){toast('Load a map first');return;}
  const canvas=S.map.instance.getCanvas();
  const url=canvas.toDataURL('image/png');
  const a=document.createElement('a'); a.href=url; a.download='property-map.png'; a.click();
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
})();
