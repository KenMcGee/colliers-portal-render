/* ============================================================
   Colliers Denver Design Studio v4 — App Logic
   Dynamic multi-layout HTML-to-PDF output engine
   ============================================================ */

// ============ STATE ============
const state = {
  docType: 'om',
  propType: 'industrial',
  currentStep: 1,
  uploadedFiles: {},
  photoDataURLs: [],
  projects: JSON.parse(localStorage.getItem('colliers_projects') || '[]'),
  tenantRows: 0,
  pageSettings: { widthIn: 11, heightIn: 8.5, orientation: 'landscape' },
  design: {
    colors: { primary: '#001a4d', secondary: '#0057b8', accent: '#c8a96e', text: '#1a2332', bg: '#ffffff', rule: '#0057b8' },
    fonts: { heading: '', body: '', number: '' },
    layout: 'classic',
    templateAnalysis: null, // full AI analysis of uploaded template
  },
  narrativeContext: '',
  extractedFinancials: null, // store parsed financials from uploaded file
};

// ============ NAVIGATION ============
function navigate(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const t = document.getElementById('page-' + page);
  if (t) t.classList.add('active');
  const n = document.querySelector(`[data-page="${page}"]`);
  if (n) n.classList.add('active');
  if (page === 'dashboard') refreshDashboard();
  if (page === 'settings') loadSettings();
  window.scrollTo(0, 0);
}
document.querySelectorAll('.nav-item:not(.coming-soon)').forEach(item => {
  item.addEventListener('click', e => { e.preventDefault(); navigate(item.dataset.page); });
});

// ============ STEPS ============
function goStep(n) {
  document.querySelectorAll('.step-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.step').forEach(s => {
    const sn = parseInt(s.dataset.step);
    s.classList.remove('active', 'completed');
    if (sn === n) s.classList.add('active');
    if (sn < n) s.classList.add('completed');
  });
  const panel = document.getElementById('step-panel-' + n);
  if (panel) panel.classList.add('active');
  state.currentStep = n;
  if (n === 6) buildReviewSummary();
  window.scrollTo(0, 0);
}

// ============ DOC / PROP TYPE ============
function selectDocType(t) { state.docType = t; document.querySelectorAll('.doc-type-card').forEach(c => c.classList.toggle('active', c.dataset.type === t)); }
function selectPropType(t) { state.propType = t; document.querySelectorAll('.prop-type-btn').forEach(b => b.classList.toggle('active', b.dataset.ptype === t)); }

// ============ PAGE SETTINGS ============
function setOrientation(o) {
  state.pageSettings.orientation = o;
  document.getElementById('btn-landscape').classList.toggle('active', o === 'landscape');
  document.getElementById('btn-portrait').classList.toggle('active', o === 'portrait');
  const { widthIn, heightIn } = state.pageSettings;
  if (o === 'landscape' && heightIn > widthIn) { state.pageSettings.widthIn = heightIn; state.pageSettings.heightIn = widthIn; }
  if (o === 'portrait' && widthIn > heightIn) { state.pageSettings.widthIn = heightIn; state.pageSettings.heightIn = widthIn; }
  updatePagePreview();
}
function applyPagePreset(val) {
  const cr = document.getElementById('custom-size-row');
  if (val === 'custom') { cr.style.display = 'flex'; return; }
  cr.style.display = 'none';
  const p = val.split('x').map(Number);
  state.pageSettings.widthIn = p[0]; state.pageSettings.heightIn = p[1];
  state.pageSettings.orientation = p[0] >= p[1] ? 'landscape' : 'portrait';
  document.getElementById('btn-landscape').classList.toggle('active', state.pageSettings.orientation === 'landscape');
  document.getElementById('btn-portrait').classList.toggle('active', state.pageSettings.orientation === 'portrait');
  updatePagePreview();
}
function updateCustomSize() {
  const w = parseFloat(document.getElementById('custom-width').value) || 11;
  const h = parseFloat(document.getElementById('custom-height').value) || 8.5;
  state.pageSettings.widthIn = w; state.pageSettings.heightIn = h;
  state.pageSettings.orientation = w >= h ? 'landscape' : 'portrait';
  updatePagePreview();
}
function updatePagePreview() {
  const { widthIn, heightIn } = state.pageSettings;
  const r = document.getElementById('page-preview-rect');
  const l = document.getElementById('page-preview-label');
  if (!r || !l) return;
  r.style.width = Math.round(widthIn * 38) + 'px';
  r.style.height = Math.round(heightIn * 38) + 'px';
  l.textContent = `${widthIn}" × ${heightIn}" ${state.pageSettings.orientation}`;
}

// ============ COLOR PALETTE ============
function syncColorInput(key) {
  const picker = document.getElementById('color-' + key + '-picker');
  const text = document.getElementById('color-' + key);
  const preview = document.getElementById('color-preview-' + key);
  if (picker && text) text.value = picker.value;
  if (preview && picker) preview.style.background = picker.value;
  state.design.colors[key] = picker?.value || state.design.colors[key];
}
function syncColorPicker(key) {
  const text = document.getElementById('color-' + key);
  const picker = document.getElementById('color-' + key + '-picker');
  const preview = document.getElementById('color-preview-' + key);
  const val = text?.value;
  if (val && /^#[0-9a-fA-F]{6}$/.test(val)) {
    if (picker) picker.value = val;
    if (preview) preview.style.background = val;
    state.design.colors[key] = val;
  }
}
function setColor(key, val) {
  state.design.colors[key] = val;
  const picker = document.getElementById('color-' + key + '-picker');
  const text = document.getElementById('color-' + key);
  const preview = document.getElementById('color-preview-' + key);
  if (picker) picker.value = val;
  if (text) text.value = val;
  if (preview) preview.style.background = val;
}
function applyPalettePreset(name) {
  const presets = {
    colliers: { primary: '#001a4d', secondary: '#0057b8', accent: '#a8d4f5', text: '#0a1628', bg: '#ffffff', rule: '#0057b8' },
    dark:     { primary: '#0f0f0f', secondary: '#c8a96e', accent: '#e8d4a8', text: '#f0ece0', bg: '#1a1a1a', rule: '#c8a96e' },
    earth:    { primary: '#3b2a1a', secondary: '#7a4f2e', accent: '#c8a96e', text: '#2a1e10', bg: '#fdf8f0', rule: '#c8a96e' },
    slate:    { primary: '#1e2d3d', secondary: '#4a7fa5', accent: '#8fb8d4', text: '#1e2d3d', bg: '#f5f8fb', rule: '#4a7fa5' },
    forest:   { primary: '#1a3a2a', secondary: '#2d6e4e', accent: '#7ab894', text: '#1a3a2a', bg: '#f5faf7', rule: '#2d6e4e' },
    clear:    { primary: '#001a4d', secondary: '#0057b8', accent: '#c8a96e', text: '#1a2332', bg: '#ffffff', rule: '#0057b8' },
  };
  const p = presets[name];
  if (!p) return;
  Object.entries(p).forEach(([k, v]) => setColor(k, v));
}

// ============ FONTS ============
const GOOGLE_FONTS = ['Playfair Display', 'Merriweather', 'Lora', 'Cormorant Garamond', 'Montserrat', 'Raleway', 'Oswald', 'Bebas Neue', 'Inter', 'DM Sans', 'Source Sans 3', 'Lato', 'Open Sans', 'Nunito', 'Rajdhani', 'Barlow'];
const loadedFonts = new Set();
function loadGoogleFont(fontName) {
  if (!fontName || fontName === 'Georgia' || loadedFonts.has(fontName)) return;
  loadedFonts.add(fontName);
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${fontName.replace(/ /g, '+')}:wght@300;400;500;600;700&display=swap`;
  document.head.appendChild(link);
}
function updateFontPreview() {
  const heading = document.getElementById('font-heading').value;
  const body = document.getElementById('font-body').value;
  const number = document.getElementById('font-number').value;
  state.design.fonts = { heading, body, number };
  if (heading) loadGoogleFont(heading);
  if (body) loadGoogleFont(body);
  if (number) loadGoogleFont(number);
  const fph = document.getElementById('fp-heading');
  const fpb = document.getElementById('fp-body');
  const fps = document.getElementById('fp-stats');
  if (fph) fph.style.fontFamily = heading ? `'${heading}', serif` : "'Playfair Display', serif";
  if (fpb) fpb.style.fontFamily = body ? `'${body}', sans-serif` : 'Inter, sans-serif';
  if (fps) fps.style.fontFamily = (number || heading) ? `'${number || heading}', serif` : "'Playfair Display', serif";
}

// ============ LAYOUT ============
function selectLayout(l) {
  state.design.layout = l;
  document.querySelectorAll('.layout-card').forEach(c => c.classList.toggle('active', c.dataset.layout === l));
}

// ============ SHARED API CALL ============
async function callClaude(body) {
  const res = await fetch('/api/claude', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    const msg = data?.error?.message || data?.error || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

// ============ TEMPLATE STYLE EXTRACTION ============
async function extractTemplateStyle() {
  const files = state.uploadedFiles['template'] || [];
  if (!files.length) { showToast('Upload a template file first'); return; }
  const statusEl = document.getElementById('extract-status-template');
  statusEl.innerHTML = '<span class="status-spinner" style="display:inline-block;width:11px;height:11px;border:2px solid rgba(0,87,184,0.2);border-top-color:#0057b8;border-radius:50%;animation:spin 0.8s linear infinite;margin-right:5px;vertical-align:middle;"></span>Reading file...';

  const file = files[0];
  const fileSizeMB = (file.size / 1024 / 1024).toFixed(1);
  const SAFE_BASE64_LIMIT = 3 * 1024 * 1024;
  let messages;

  if (file.size <= SAFE_BASE64_LIMIT && (file.type === 'application/pdf' || file.name.endsWith('.pdf'))) {
    try {
      const base64 = await fileToBase64(file);
      messages = [{ role: 'user', content: [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
        { type: 'text', text: buildStylePrompt() }
      ]}];
    } catch (e) { statusEl.textContent = '✗ Could not read file'; return; }
  } else {
    let textContent = '';
    try { textContent = (await readFileAsText(file)).slice(0, 4000); } catch (e) { textContent = `[File: ${file.name}, ${fileSizeMB}MB]`; }
    messages = [{ role: 'user', content: `${buildStylePrompt()}\n\nTemplate file: ${file.name} (${fileSizeMB}MB)\nExtracted content:\n${textContent}` }];
  }

  statusEl.innerHTML = statusEl.innerHTML.replace('Reading file...', 'Analyzing design with AI...');

  try {
    const data = await callClaude({ model: 'claude-sonnet-4-6', max_tokens: 2000, messages });
    const text = data.content?.[0]?.text || '';
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
    state.design.templateAnalysis = parsed;

    if (parsed.colors) Object.entries(parsed.colors).forEach(([k, v]) => { if (/^#[0-9a-fA-F]{6}$/.test(v)) setColor(k, v); });

    const fontMap = { heading: parsed.fonts?.suggestedHeading, body: parsed.fonts?.suggestedBody };
    if (fontMap.heading) {
      const match = GOOGLE_FONTS.find(f => f.toLowerCase().includes(fontMap.heading.toLowerCase().split(' ')[0]));
      if (match) { document.getElementById('font-heading').value = match; }
    }
    if (fontMap.body) {
      const match = GOOGLE_FONTS.find(f => f.toLowerCase().includes(fontMap.body.toLowerCase().split(' ')[0]));
      if (match) { document.getElementById('font-body').value = match; }
    }
    if (parsed.layout) selectLayout(parsed.layout);
    updateFontPreview();

    statusEl.textContent = `✓ Style extracted — ${parsed.aesthetic || 'Design settings applied'}`;
    statusEl.className = 'extract-status ok';
    showToast('Template style applied');
  } catch (e) {
    statusEl.textContent = '✗ ' + (e.message || 'Unknown error');
    statusEl.className = 'extract-status err';
  }
}

function buildStylePrompt() {
  return `Analyze this document's visual design in detail and return ONLY a JSON object. Be specific and extract as much design language as possible.

Return ONLY this JSON, no other text:
{
  "colors": {
    "primary": "#hexcode — dominant dark background/header color",
    "secondary": "#hexcode — button/link/accent color",
    "accent": "#hexcode — gold/highlight/callout color",
    "text": "#hexcode — body text color",
    "bg": "#hexcode — page background color",
    "rule": "#hexcode — divider/rule color"
  },
  "fonts": {
    "headingStyle": "serif|sans|display",
    "bodyStyle": "serif|sans",
    "suggestedHeading": "closest Google Font name",
    "suggestedBody": "closest Google Font name"
  },
  "layout": "classic|editorial|magazine|minimal",
  "accentElements": {
    "usesFullBleedPhotos": true,
    "usesColoredBands": true,
    "usesSidebarPanels": true,
    "usesLargeStatCards": true,
    "usesPullQuotes": true,
    "usesDecorativeBars": true,
    "usesCornerAccents": false,
    "photoStyle": "full-bleed|inset|bordered|circular",
    "headerStyle": "dark-overlay|colored-band|minimal|split",
    "sectionDividerStyle": "rule|colored-band|whitespace|decorative"
  },
  "designLanguage": {
    "density": "dense|balanced|airy",
    "formality": "luxury|professional|modern|minimal",
    "photoEmphasis": "dominant|balanced|subtle",
    "typographyContrast": "high|medium|low"
  },
  "aesthetic": "one sentence description of the overall design style"
}`;
}

// ============ FILE UPLOADS ============
function triggerStepUpload(key) { document.getElementById('step-file-' + key)?.click(); }

function handleStepUpload(key, input) {
  const files = Array.from(input.files);
  if (!files.length) return;
  state.uploadedFiles[key] = [...(state.uploadedFiles[key] || []), ...files];
  const zone = input.closest('.iupload');
  if (zone) zone.classList.add('has-files');
  if (key === 'photos') { handlePhotoUploads(files); return; }
  const listEl = document.getElementById('step-files-' + key);
  if (listEl) files.forEach(f => { const t = document.createElement('div'); t.className = 'ifile-tag'; t.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> ${f.name}`; listEl.appendChild(t); });
  const btnMap = { 'property-doc': 'btn-extract-property', 'financials': 'btn-extract-financials', 'narrative': 'btn-extract-narrative', 'template': 'btn-extract-template' };
  const btn = document.getElementById(btnMap[key]);
  if (btn) btn.style.display = 'inline-flex';
}

function handlePhotoUploads(files) {
  const grid = document.getElementById('photo-preview-grid');
  files.forEach(f => {
    if (!f.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = e => {
      state.photoDataURLs.push(e.target.result);
      if (grid) { const img = document.createElement('img'); img.className = 'photo-thumb'; img.src = e.target.result; grid.appendChild(img); }
    };
    reader.readAsDataURL(f);
  });
}

async function fileToBase64(file) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = e => res(e.target.result.split(',')[1]); r.onerror = rej; r.readAsDataURL(file); });
}
async function readFileAsText(file) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = e => res(e.target.result); r.onerror = rej; r.readAsText(file); });
}

// ============ AI EXTRACTION ============
async function extractFromUpload(type) {
  const statusEl = document.getElementById('extract-status-' + type);
  if (statusEl) statusEl.innerHTML = '<span class="status-spinner" style="display:inline-block;width:11px;height:11px;border:2px solid rgba(0,87,184,0.2);border-top-color:#0057b8;border-radius:50%;animation:spin 0.8s linear infinite;margin-right:5px;vertical-align:middle;"></span>Extracting...';
  const keyMap = { property: 'property-doc', financials: 'financials', narrative: 'narrative' };
  const files = state.uploadedFiles[keyMap[type]] || [];
  if (!files.length) { if (statusEl) { statusEl.textContent = 'No file uploaded.'; statusEl.className = 'extract-status'; } return; }
  let fileContent = '';
  try { fileContent = await readFileAsText(files[0]); } catch (e) { fileContent = `[File: ${files[0].name}]`; }

  let prompt = '';
  if (type === 'property') {
    prompt = `Extract property info from this document. Return ONLY JSON:
{"propName":"","propAddress":"","propCity":"","propState":"","propZip":"","propCounty":"","propYear":"","propSF":"","propAcres":"","propBuildings":"","propUnits":"","propZoning":"","propParking":"","propClearHeight":"","propDesc":"","propHighlights":"","brokerName":"","brokerTitle":"","brokerPhone":"","brokerEmail":"","brokerLicense":""}
Document: ${fileContent.slice(0, 6000)}`;
  } else if (type === 'financials') {
    prompt = `Extract ALL financial data from this document. Be thorough — capture every financial metric, rent roll entry, and notable figure. Return ONLY JSON:
{
  "finPrice":"","finPpsf":"","finGpr":"","finVacancy":"","finEgi":"","finOpex":"","finNoi":"","finCaprate":"","finOccupancy":"","finWalt":"",
  "finDebtService":"","finDscr":"","finCashOnCash":"","finIrr":"","finEquityMultiple":"",
  "keyHighlights": ["notable financial fact 1", "notable financial fact 2", "notable financial fact 3"],
  "rentRoll":[{"tenant":"","suite":"","sf":"","leaseStart":"","leaseEnd":"","annualRent":"","rentPsf":"","leaseType":""}],
  "expenseBreakdown":[{"item":"","amount":""}],
  "recentCapex":"",
  "assumableDebt":"",
  "additionalNotes":""
}
Document: ${fileContent.slice(0, 8000)}`;
  } else {
    prompt = `Summarize key marketing points from this document in 3-4 paragraphs for use as CRE narrative context. Document: ${fileContent.slice(0, 6000)}`;
  }

  try {
    const data = await callClaude({ model: 'claude-sonnet-4-6', max_tokens: 2000, messages: [{ role: 'user', content: prompt }] });
    const text = data.content?.[0]?.text || '';
    if (type === 'narrative') { state.narrativeContext = text; if (statusEl) { statusEl.textContent = '✓ Narrative saved as AI context'; statusEl.className = 'extract-status ok'; } return; }
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());

    if (type === 'property') {
      const m = { 'prop-name': parsed.propName, 'prop-address': parsed.propAddress, 'prop-city': parsed.propCity, 'prop-state': parsed.propState, 'prop-zip': parsed.propZip, 'prop-county': parsed.propCounty, 'prop-year': parsed.propYear, 'prop-sf': parsed.propSF, 'prop-acres': parsed.propAcres, 'prop-buildings': parsed.propBuildings, 'prop-units': parsed.propUnits, 'prop-zoning': parsed.propZoning, 'prop-parking': parsed.propParking, 'prop-clearheight': parsed.propClearHeight, 'prop-desc': parsed.propDesc, 'prop-highlights': parsed.propHighlights, 'broker-name': parsed.brokerName, 'broker-title': parsed.brokerTitle, 'broker-phone': parsed.brokerPhone, 'broker-email': parsed.brokerEmail, 'broker-license': parsed.brokerLicense };
      Object.entries(m).forEach(([id, val]) => { const el = document.getElementById(id); if (el && val) el.value = val; });
    }
    if (type === 'financials') {
      state.extractedFinancials = parsed;
      const m = { 'fin-price': parsed.finPrice, 'fin-ppsf': parsed.finPpsf, 'fin-gpr': parsed.finGpr, 'fin-vacancy': parsed.finVacancy, 'fin-egi': parsed.finEgi, 'fin-opex': parsed.finOpex, 'fin-noi': parsed.finNoi, 'fin-caprate': parsed.finCaprate, 'fin-occupancy': parsed.finOccupancy, 'fin-walt': parsed.finWalt };
      Object.entries(m).forEach(([id, val]) => { const el = document.getElementById(id); if (el && val) el.value = val; });
      if (parsed.rentRoll?.length) {
        const tb = document.getElementById('rent-roll-body'); tb.innerHTML = '';
        parsed.rentRoll.forEach(r => { state.tenantRows++; const tr = document.createElement('tr'); tr.id = 'tenant-row-' + state.tenantRows; tr.innerHTML = buildTenantRowHTML(state.tenantRows, r); tb.appendChild(tr); });
      }
      calcFinancials();
    }
    if (statusEl) { statusEl.textContent = type === 'property' ? '✓ Fields populated' : '✓ Financials and rent roll populated'; statusEl.className = 'extract-status ok'; }
  } catch (e) { if (statusEl) { statusEl.textContent = '✗ ' + (e.message || 'Extraction failed'); statusEl.className = 'extract-status err'; } }
}

// ============ FINANCIALS ============
function calcFinancials() {
  const price = parseFloat(document.getElementById('fin-price')?.value) || 0;
  const sf = parseFloat(document.getElementById('prop-sf')?.value) || 0;
  const gpr = parseFloat(document.getElementById('fin-gpr')?.value) || 0;
  const vacancy = parseFloat(document.getElementById('fin-vacancy')?.value) || 0;
  const opex = parseFloat(document.getElementById('fin-opex')?.value) || 0;
  const egi = gpr * (1 - vacancy / 100);
  const noi = egi - opex;
  const capRate = price > 0 && noi > 0 ? (noi / price) * 100 : 0;
  const ppsf = sf > 0 && price > 0 ? price / sf : 0;
  const grm = gpr > 0 && price > 0 ? price / gpr : 0;
  const trySet = (id, val) => { const el = document.getElementById(id); if (el && !el.value && val > 0) el.value = Number.isInteger(val) ? val : val.toFixed(2); };
  trySet('fin-egi', egi); trySet('fin-noi', noi); trySet('fin-caprate', capRate); trySet('fin-ppsf', ppsf);
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('calc-ppsf', ppsf > 0 ? '$' + ppsf.toFixed(2) : '—');
  set('calc-noi', noi > 0 ? '$' + fmtNum(Math.round(noi)) : '—');
  set('calc-caprate', capRate > 0 ? capRate.toFixed(2) + '%' : '—');
  set('calc-grm', grm > 0 ? grm.toFixed(2) + 'x' : '—');
}

// ============ RENT ROLL ============
function buildTenantRowHTML(id, row = {}) {
  return `<td><input type="text" value="${row.tenant||''}" placeholder="Tenant name" /></td><td><input type="text" value="${row.suite||''}" placeholder="101" style="width:60px;" /></td><td><input type="number" value="${row.sf||''}" placeholder="5000" oninput="calcRowRentSF(${id})" /></td><td><input type="date" value="${row.leaseStart||''}" /></td><td><input type="date" value="${row.leaseEnd||''}" /></td><td><input type="number" value="${row.annualRent||''}" placeholder="60000" oninput="calcRowRentSF(${id})" /></td><td><span id="rpsf-${id}" style="color:var(--text-muted);font-size:12px;">—</span></td><td><button class="btn-del-row" onclick="deleteRow(${id})">×</button></td>`;
}
function addTenantRow() {
  const tb = document.getElementById('rent-roll-body');
  const er = tb.querySelector('.empty-row'); if (er) er.remove();
  const id = ++state.tenantRows; const tr = document.createElement('tr'); tr.id = 'tenant-row-' + id; tr.innerHTML = buildTenantRowHTML(id); tb.appendChild(tr);
}
function calcRowRentSF(id) {
  const row = document.getElementById('tenant-row-' + id); if (!row) return;
  const inputs = row.querySelectorAll('input[type="number"]');
  const sf = parseFloat(inputs[0]?.value) || 0, rent = parseFloat(inputs[1]?.value) || 0;
  const el = document.getElementById('rpsf-' + id); if (el) el.textContent = sf > 0 && rent > 0 ? '$' + (rent / sf).toFixed(2) : '—';
}
function deleteRow(id) {
  const row = document.getElementById('tenant-row-' + id); if (row) row.remove();
  const tb = document.getElementById('rent-roll-body');
  if (!tb.querySelector('tr:not(.empty-row)')) tb.innerHTML = '<tr class="empty-row"><td colspan="8" style="text-align:center;color:#6b7fa3;padding:20px;">No tenants added yet.</td></tr>';
}
function getRentRollData() {
  return Array.from(document.querySelectorAll('#rent-roll-body tr:not(.empty-row)')).map(row => {
    const i = row.querySelectorAll('input');
    return { tenant: i[0]?.value||'', suite: i[1]?.value||'', sf: i[2]?.value||'', leaseStart: i[3]?.value||'', leaseEnd: i[4]?.value||'', annualRent: i[5]?.value||'' };
  });
}

// ============ SETTINGS ============
function saveApiKeyFromSettings() {
  showToast('API key is managed via Vercel environment variables.');
}
function loadSettings() {
  const s = JSON.parse(localStorage.getItem('colliers_settings') || '{}');
  if (s.firm) document.getElementById('settings-firm').value = s.firm;
  if (s.city) document.getElementById('settings-city').value = s.city;
  if (s.phone) document.getElementById('settings-phone').value = s.phone;
  if (s.disclaimer) document.getElementById('settings-disclaimer').value = s.disclaimer;
}
function saveSettings() {
  const settings = { firm: document.getElementById('settings-firm')?.value, city: document.getElementById('settings-city')?.value, phone: document.getElementById('settings-phone')?.value, disclaimer: document.getElementById('settings-disclaimer')?.value };
  localStorage.setItem('colliers_settings', JSON.stringify(settings));
  showToast('Settings saved');
}

// ============ API DIAGNOSTIC ============
async function testAPIConnection() {
  const btn = document.getElementById('btn-api-test');
  const result = document.getElementById('api-test-result');
  btn.disabled = true; btn.textContent = 'Testing...'; result.innerHTML = '';
  try {
    const pingRes = await fetch('/api/ping');
    const pingText = await pingRes.text();
    let pingData;
    try { pingData = JSON.parse(pingText); } catch(e) {
      result.innerHTML = `<span style="color:#cc3333;">✗ Function routing broken — /api/ping returned HTML. Check Vercel Framework Preset (set to "Other") and Output Directory (set to ".").</span>`;
      btn.disabled = false; btn.textContent = 'Test API Connection'; return;
    }
    if (!pingData.ok) { result.innerHTML = `<span style="color:#cc3333;">✗ Ping failed: ${JSON.stringify(pingData)}</span>`; btn.disabled = false; btn.textContent = 'Test API Connection'; return; }
    if (!pingData.hasApiKey) { result.innerHTML = `<span style="color:#cc3333;">✗ Function routing works ✓ but ANTHROPIC_API_KEY is not set in Vercel environment variables.</span>`; btn.disabled = false; btn.textContent = 'Test API Connection'; return; }
    result.innerHTML = '<span style="color:#b8720a;">⏳ Routing and key found — testing Claude API...</span>';
    const claudeRes = await fetch('/api/claude', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 20, messages: [{ role: 'user', content: 'Say "ok".' }] }) });
    const claudeData = await claudeRes.json();
    if (claudeRes.status === 401) { result.innerHTML = '<span style="color:#cc3333;">✗ API key invalid or expired.</span>'; }
    else if (!claudeRes.ok) { result.innerHTML = `<span style="color:#cc3333;">✗ Claude error ${claudeRes.status}: ${claudeData?.error?.message || JSON.stringify(claudeData)}</span>`; }
    else if (claudeData?.content?.[0]?.text) { result.innerHTML = '<span style="color:#1a7a4a;">✓ Everything working — function routing, API key, and Claude API all confirmed.</span>'; }
    else { result.innerHTML = `<span style="color:#b8720a;">⚠ Unexpected: ${JSON.stringify(claudeData).slice(0, 200)}</span>`; }
  } catch (e) { result.innerHTML = `<span style="color:#cc3333;">✗ ${e.message}</span>`; }
  btn.disabled = false; btn.textContent = 'Test API Connection';
}

// ============ REVIEW ============
function buildReviewSummary() {
  const g = id => document.getElementById(id)?.value || '—';
  const d = state.design;
  const sections = [
    { title: 'Document', items: [['Type', state.docType === 'om' ? 'Offering Memorandum' : 'Broker Opinion of Value'], ['Property Type', state.propType], ['Page Size', `${state.pageSettings.widthIn}" × ${state.pageSettings.heightIn}"`]] },
    { title: 'Property', items: [['Name', g('prop-name')], ['Address', `${g('prop-address')}, ${g('prop-city')}, ${g('prop-state')}`], ['SF', g('prop-sf') !== '—' ? fmtNum(g('prop-sf')) + ' SF' : '—'], ['Year Built', g('prop-year')]] },
    { title: 'Financials', items: [['Price', g('fin-price') !== '—' ? '$' + fmtNum(g('fin-price')) : '—'], ['NOI', g('fin-noi') !== '—' ? '$' + fmtNum(g('fin-noi')) : '—'], ['Cap Rate', g('fin-caprate') !== '—' ? g('fin-caprate') + '%' : '—'], ['Occupancy', g('fin-occupancy') !== '—' ? g('fin-occupancy') + '%' : '—']] },
    { title: 'Design', items: [['Layout', d.layout], ['Template analyzed', d.templateAnalysis ? '✓ Yes' : 'No'], ['Heading Font', d.fonts.heading || 'AI choice'], ['Primary Color', d.colors.primary]] },
    { title: 'Files', items: [['Property doc', (state.uploadedFiles['property-doc']?.length || 0) + ' file(s)'], ['Financials', (state.uploadedFiles['financials']?.length || 0) + ' file(s)'], ['Photos', state.photoDataURLs.length + ' photo(s)'], ['Template', (state.uploadedFiles['template']?.length || 0) + ' file(s)']] },
  ];
  document.getElementById('review-summary').innerHTML = sections.map(s => `<div class="review-section"><div class="review-section-title">${s.title}</div>${s.items.map(([l,v]) => `<div class="review-item"><span class="review-item-label">${l}</span><span class="review-item-value">${v}</span></div>`).join('')}</div>`).join('');
}

// ============ SAVE DRAFT ============
function saveDraft() {
  const g = id => document.getElementById(id)?.value || '';
  const d = { id: Date.now(), docType: state.docType, propType: state.propType, name: g('prop-name') || 'Untitled', address: `${g('prop-address')}, ${g('prop-city')}, ${g('prop-state')}`, price: g('fin-price'), noi: g('fin-noi'), capRate: g('fin-caprate'), sf: g('prop-sf'), createdAt: new Date().toLocaleDateString(), status: 'draft' };
  state.projects = [d, ...state.projects.filter(p => p.name !== d.name)];
  localStorage.setItem('colliers_projects', JSON.stringify(state.projects));
  showToast('Draft saved');
}

// ============ HELPERS ============
function fmtNum(n) { const num = parseFloat(n); if (isNaN(num)) return String(n||''); return num.toLocaleString('en-US', { maximumFractionDigits: 0 }); }
function fmtDollar(n) { const num = parseFloat(n); if (isNaN(num) || !num) return null; return '$' + num.toLocaleString('en-US', { maximumFractionDigits: 0 }); }
function showToast(msg) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 3500); }

// ============ DASHBOARD ============
function refreshDashboard() {
  const projects = JSON.parse(localStorage.getItem('colliers_projects') || '[]');
  state.projects = projects;
  document.getElementById('stat-docs').textContent = projects.filter(p => p.status === 'complete').length;
  document.getElementById('stat-props').textContent = projects.length;
  const thisMonth = new Date().toLocaleDateString('en-US', { month: 'numeric', year: 'numeric' });
  document.getElementById('stat-month').textContent = projects.filter(p => { try { return new Date(p.createdAt).toLocaleDateString('en-US', { month: 'numeric', year: 'numeric' }) === thisMonth; } catch(e) { return false; } }).length;
  const container = document.getElementById('recent-projects-list');
  if (!projects.length) { container.innerHTML = `<div class="empty-state"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg><p>No projects yet.</p><button class="btn-primary" onclick="navigate('om-builder')">Create Document</button></div>`; return; }
  container.innerHTML = `<table class="projects-table"><thead><tr><th>Property</th><th>Type</th><th>Price</th><th>Cap Rate</th><th>SF</th><th>Date</th><th>Status</th></tr></thead><tbody>${projects.map(p => `<tr><td><div style="font-weight:500;">${p.name}</div><div style="font-size:11px;color:var(--text-muted);">${p.address}</div></td><td><span class="doc-type-badge ${p.docType}">${p.docType==='om'?'OM':'BOV'}</span></td><td>${p.price?'$'+fmtNum(p.price):'—'}</td><td>${p.capRate?p.capRate+'%':'—'}</td><td>${p.sf?fmtNum(p.sf)+' SF':'—'}</td><td>${p.createdAt}</td><td><span style="font-size:11px;color:${p.status==='complete'?'#1a7a4a':'#b8720a'};font-weight:500;">${p.status}</span></td></tr>`).join('')}</tbody></table>`;
}

// ============ INIT ============
function init() { updatePagePreview(); refreshDashboard(); }
init();

// ============ GENERATE DOCUMENT ============
async function generateDocument() {
  const g = id => document.getElementById(id)?.value || '';
  const settings = JSON.parse(localStorage.getItem('colliers_settings') || '{}');
  const disclaimer = settings.disclaimer || 'The information contained herein has been obtained from sources believed to be reliable. Colliers International makes no guarantee, warranty, or representation about it.';
  const firmName = settings.firm || 'Colliers International';
  const officeCity = settings.city || 'Denver, Colorado';
  const docTypeLabel = state.docType === 'om' ? 'Offering Memorandum' : 'Broker Opinion of Value';

  const prop = {
    name: g('prop-name') || 'Subject Property', address: g('prop-address'), city: g('prop-city'),
    state: g('prop-state'), zip: g('prop-zip'), county: g('prop-county'), yearBuilt: g('prop-year'),
    sf: g('prop-sf'), acres: g('prop-acres'), buildings: g('prop-buildings'), units: g('prop-units'),
    zoning: g('prop-zoning'), parking: g('prop-parking'), clearHeight: g('prop-clearheight'),
    desc: g('prop-desc'), highlights: g('prop-highlights'),
  };
  const fin = {
    price: g('fin-price'), ppsf: g('fin-ppsf'), gpr: g('fin-gpr'), vacancy: g('fin-vacancy'),
    egi: g('fin-egi'), opex: g('fin-opex'), noi: g('fin-noi'), capRate: g('fin-caprate'),
    occupancy: g('fin-occupancy'), walt: g('fin-walt'),
    ...(state.extractedFinancials || {}),
  };
  const broker = { name: g('broker-name'), title: g('broker-title'), phone: g('broker-phone'), email: g('broker-email'), license: g('broker-license') };
  const rentRoll = getRentRollData();
  const selectedSections = Array.from(document.querySelectorAll('.sections-checklist input:checked')).map(i => i.dataset.section);

  const statusEl = document.getElementById('generate-status');
  statusEl.style.display = 'block';
  statusEl.innerHTML = '<span class="status-spinner"></span> Generating AI content...';

  let ai = {};
  let resolvedFonts = { heading: state.design.fonts.heading || 'Playfair Display', body: state.design.fonts.body || 'Inter', number: state.design.fonts.number || state.design.fonts.heading || 'Playfair Display' };
  const ta = state.design.templateAnalysis;

  try {
    // Pick fonts if not chosen
    if (!state.design.fonts.heading || !state.design.fonts.body) {
      const styleContext = ta ? `The template uses a ${ta.designLanguage?.formality || 'professional'} style with ${ta.designLanguage?.density || 'balanced'} density and ${ta.designLanguage?.typographyContrast || 'medium'} typography contrast. Aesthetic: ${ta.aesthetic || 'professional CRE'}. Layout: ${ta.layout}.` : '';
      const fontPrompt = `You are a CRE design director. Pick professional Google Fonts for a ${docTypeLabel} for a ${state.propType} property. ${styleContext} Primary color is ${state.design.colors.primary}. Return ONLY JSON: {"heading":"font name","body":"font name","number":"font name"} Choose from: Playfair Display, Merriweather, Lora, Cormorant Garamond, Montserrat, Raleway, Oswald, Inter, DM Sans, Source Sans 3, Lato, Bebas Neue, Barlow`;
      try {
        const fd = await callClaude({ model: 'claude-sonnet-4-6', max_tokens: 200, messages: [{ role: 'user', content: fontPrompt }] });
        const fp = JSON.parse((fd.content?.[0]?.text || '{}').replace(/```json|```/g, '').trim());
        if (fp.heading) resolvedFonts.heading = state.design.fonts.heading || fp.heading;
        if (fp.body) resolvedFonts.body = state.design.fonts.body || fp.body;
        if (fp.number) resolvedFonts.number = state.design.fonts.number || fp.number;
      } catch(e) {}
    }

    statusEl.innerHTML = '<span class="status-spinner"></span> Writing narratives and financial analysis...';
    const narrativePrompt = buildNarrativePrompt(prop, fin, broker, rentRoll, docTypeLabel, ta);
    const nd = await callClaude({ model: 'claude-sonnet-4-6', max_tokens: 6000, messages: [{ role: 'user', content: narrativePrompt }] });
    try { ai = JSON.parse((nd.content?.[0]?.text || '{}').replace(/```json|```/g, '').trim()); } catch(e) { ai = {}; }
  } catch (e) {
    statusEl.innerHTML = `<span style="color:#f5a623;">⚠ AI unavailable (${e.message}) — building from entered data.</span>`;
    await new Promise(r => setTimeout(r, 2000));
  }

  [resolvedFonts.heading, resolvedFonts.body, resolvedFonts.number].filter(Boolean).forEach(loadGoogleFont);
  await new Promise(r => setTimeout(r, 900));

  statusEl.innerHTML = '<span class="status-spinner"></span> Building document pages...';
  await new Promise(r => setTimeout(r, 200));

  const html = buildDocumentHTML(prop, fin, broker, rentRoll, ai, selectedSections, disclaimer, docTypeLabel, firmName, officeCity, resolvedFonts, state.design);

  navigate('preview');
  document.getElementById('preview-title').textContent = `${prop.name} — ${docTypeLabel}`;
  document.getElementById('preview-subtitle').textContent = `${prop.address}, ${prop.city}, ${prop.state} ${prop.zip}`;
  document.getElementById('document-preview-container').innerHTML = html;
  injectPrintCSS();
  statusEl.style.display = 'none';

  const project = { id: Date.now(), docType: state.docType, propType: state.propType, name: prop.name, address: `${prop.address}, ${prop.city}, ${prop.state}`, price: fin.price, noi: fin.noi, capRate: fin.capRate, sf: prop.sf, createdAt: new Date().toLocaleDateString(), status: 'complete' };
  state.projects = [project, ...state.projects];
  localStorage.setItem('colliers_projects', JSON.stringify(state.projects));
  showToast('Document ready — Print / Save as PDF to export');
}

function injectPrintCSS() {
  const existing = document.getElementById('print-page-css');
  if (existing) existing.remove();
  const { widthIn, heightIn } = state.pageSettings;
  const style = document.createElement('style');
  style.id = 'print-page-css';
  style.textContent = `@media print { @page { size: ${widthIn}in ${heightIn}in; margin: 0; } .doc-page { width: ${widthIn}in !important; height: ${heightIn}in !important; min-height: ${heightIn}in !important; } }`;
  document.head.appendChild(style);
}

function buildNarrativePrompt(prop, fin, broker, rentRoll, docTypeLabel, ta) {
  const styleCtx = ta ? `\n\nDesign context from template: ${ta.aesthetic}. Formality: ${ta.designLanguage?.formality}. Photo emphasis: ${ta.designLanguage?.photoEmphasis}. Adapt writing tone accordingly.` : '';
  return `You are a senior CRE broker at Colliers International writing a ${docTypeLabel} for a ${state.propType} property.
${state.narrativeContext ? 'Existing narrative context:\n' + state.narrativeContext + '\n\n' : ''}${styleCtx}

PROPERTY: ${prop.name}, ${prop.address}, ${prop.city}, ${prop.state} ${prop.zip}
${prop.sf ? fmtNum(prop.sf) + ' SF' : ''} ${state.propType}, Built ${prop.yearBuilt||'N/A'}, Zoning: ${prop.zoning||'N/A'}, Clear Height: ${prop.clearHeight||'N/A'} ft
Description: ${prop.desc || 'N/A'}
Highlights: ${prop.highlights || 'N/A'}

FINANCIALS: Price $${fmtNum(fin.price)||'N/A'}, NOI $${fmtNum(fin.noi)||'N/A'}, Cap Rate ${fin.capRate||'N/A'}%, Occupancy ${fin.occupancy||'N/A'}%, WALT ${fin.walt||'N/A'} yrs
GPR: $${fmtNum(fin.gpr)||'N/A'}, Vacancy: ${fin.vacancy||'N/A'}%, Op Expenses: $${fmtNum(fin.opex)||'N/A'}
${fin.finDebtService ? 'Debt Service: $' + fmtNum(fin.finDebtService) : ''} ${fin.finDscr ? 'DSCR: ' + fin.finDscr : ''} ${fin.finCashOnCash ? 'Cash-on-Cash: ' + fin.finCashOnCash : ''}
Additional: ${fin.additionalNotes || ''} ${fin.recentCapex ? 'Recent CapEx: ' + fin.recentCapex : ''}
RENT ROLL: ${rentRoll.length ? JSON.stringify(rentRoll) : 'Not provided'}

Write compelling, specific, data-rich copy. Include actual numbers wherever possible. Identify the 3 most financially significant facts as pullQuotes. Return ONLY JSON:
{
  "executiveSummary": "2-3 punchy paragraphs, lead with the strongest financial fact",
  "propertyDescription": "2-3 detailed paragraphs with specific physical details",
  "locationOverview": "2 paragraphs specific to ${prop.city}, ${prop.state} market",
  "investmentHighlights": ["5-6 specific highlights with numbers where possible"],
  "tenantSummary": "1-2 paragraphs specific to the rent roll",
  "valuationNarrative": "2 paragraphs with pricing rationale and cap rate context",
  "financialHighlights": ["3-4 key financial metrics stated as bold facts"],
  "pullQuotes": ["most compelling financial stat as a short punchy phrase", "second compelling fact", "third fact"],
  "marketContext": "2 sentences on why ${prop.city} market supports this pricing"
}`;
}

// ============ DYNAMIC HTML DOCUMENT BUILDER ============
function buildDocumentHTML(prop, fin, broker, rentRoll, ai, sections, disclaimer, docTypeLabel, firmName, officeCity, fonts, design) {
  const { widthIn, heightIn } = state.pageSettings;
  const C = design.colors;
  const F = fonts;
  const ta = design.templateAnalysis;
  const fullAddr = `${prop.address}, ${prop.city}, ${prop.state} ${prop.zip}`;
  const isLandscape = widthIn >= heightIn;
  const photos = state.photoDataURLs;

  // Derive design behaviors from template analysis
  const useFullBleed = ta?.accentElements?.usesFullBleedPhotos !== false;
  const useColorBands = ta?.accentElements?.usesColoredBands !== false;
  const useSidebar = ta?.accentElements?.usesSidebarPanels !== false && design.layout === 'classic';
  const usePullQuotes = ta?.accentElements?.usesPullQuotes !== false;
  const useDecorativeBars = ta?.accentElements?.usesDecorativeBars !== false;
  const photoStyle = ta?.accentElements?.photoStyle || 'full-bleed';
  const headerStyle = ta?.accentElements?.headerStyle || 'dark-overlay';
  const density = ta?.designLanguage?.density || 'balanced';
  const formality = ta?.designLanguage?.formality || 'professional';
  const photoEmphasis = ta?.designLanguage?.photoEmphasis || 'balanced';
  const typographyContrast = ta?.designLanguage?.typographyContrast || 'medium';

  const pad = isLandscape ? { h: '0.45in', v: '0.4in' } : { h: '0.4in', v: '0.35in' };
  const bodyFontSize = density === 'dense' ? '9.5' : density === 'airy' ? '11' : '10.5';
  const headingScale = typographyContrast === 'high' ? 1.4 : typographyContrast === 'low' ? 1.1 : 1.2;

  // Google Fonts import
  const fontFamilies = [...new Set([F.heading, F.body, F.number].filter(f => f && f !== 'Georgia'))];
  const googleFontUrl = fontFamilies.map(f => `family=${f.replace(/ /g, '+')}:wght@300;400;500;600;700`).join('&');

  // Accent color with opacity helper
  const hex2rgba = (hex, alpha) => {
    const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
    return `rgba(${r},${g},${b},${alpha})`;
  };

  // Shared CSS
  const css = `
    @import url('https://fonts.googleapis.com/css2?${googleFontUrl}&display=swap');
    * { box-sizing:border-box; margin:0; padding:0; }
    .doc-page { width:${widthIn}in; height:${heightIn}in; min-height:${heightIn}in; overflow:hidden; background:${C.bg}; position:relative; font-family:'${F.body}',Inter,sans-serif; color:${C.text}; font-size:${bodyFontSize}pt; line-height:1.65; }
    .pg-footer { position:absolute; bottom:0; left:0; right:0; height:26px; background:${C.primary}; display:flex; align-items:center; justify-content:space-between; padding:0 ${pad.h}; }
    .pg-footer-firm { font-size:7pt; color:${C.accent}; letter-spacing:0.5px; }
    .pg-footer-broker { font-size:7pt; color:rgba(255,255,255,0.55); }
    .section-eyebrow { font-size:7pt; letter-spacing:2px; text-transform:uppercase; color:${C.secondary}; font-family:'${F.heading}',serif; font-weight:600; margin-bottom:5px; }
    .section-rule { height:2px; background:${C.rule}; margin-bottom:12px; }
    .section-title { font-family:'${F.heading}',serif; font-size:${Math.round(parseFloat(bodyFontSize)*headingScale)}pt; font-weight:500; color:${C.primary}; margin-bottom:12px; line-height:1.2; }
    .body-text { font-size:${bodyFontSize}pt; line-height:1.75; color:${C.text}; }
    .stat-num { font-family:'${F.number||F.heading}',serif; }
    .highlight-text { background:${hex2rgba(C.accent, 0.25)}; padding:1px 4px; border-radius:2px; font-weight:600; }
    .pull-quote { border-left:4px solid ${C.accent}; padding:10px 14px; margin:14px 0; background:${hex2rgba(C.primary, 0.04)}; border-radius:0 4px 4px 0; }
    .pull-quote-text { font-family:'${F.heading}',serif; font-size:${Math.round(parseFloat(bodyFontSize)*1.15)}pt; color:${C.primary}; font-style:italic; line-height:1.4; }
    .accent-bar { height:4px; background:linear-gradient(90deg,${C.accent},${C.secondary}); margin-bottom:14px; border-radius:2px; }
    .stat-card { background:${C.primary}; border-radius:6px; padding:${isLandscape ? '14px 12px' : '10px 10px'}; text-align:center; }
    .stat-card-label { font-size:7pt; letter-spacing:1.5px; text-transform:uppercase; color:${C.accent}; font-family:'${F.body}',sans-serif; margin-bottom:5px; }
    .stat-card-value { font-size:${isLandscape ? '19' : '15'}pt; color:#fff; font-weight:600; font-family:'${F.number||F.heading}',serif; }
    .photo-caption { font-size:7.5pt; color:${C.text}; opacity:0.6; margin-top:4px; font-style:italic; }
    .fin-highlight { color:${C.secondary}; font-weight:600; font-family:'${F.number||F.heading}',serif; font-size:${Math.round(parseFloat(bodyFontSize)*1.1)}pt; }
  `;

  function footer(pageNum) {
    return `<div class="pg-footer">
      <span class="pg-footer-firm">${firmName} · ${officeCity} · ${docTypeLabel}</span>
      ${broker.name ? `<span class="pg-footer-broker">${broker.name}${broker.title ? ' · ' + broker.title : ''}${broker.phone ? ' · ' + broker.phone : ''}</span>` : ''}
    </div>`;
  }

  function decorativeBar(width='100%') {
    if (!useDecorativeBars) return '';
    return `<div style="height:3px;background:${C.accent};width:${width};margin-bottom:12px;border-radius:2px;"></div>`;
  }

  function pullQuote(text) {
    if (!usePullQuotes || !text) return '';
    return `<div class="pull-quote"><div class="pull-quote-text">"${text}"</div></div>`;
  }

  function photoBlock(src, heightIn_val, style='full-bleed', caption='') {
    if (!src) return '';
    const borderRadius = photoStyle === 'bordered' ? '6px' : photoStyle === 'inset' ? '4px' : '0';
    const border = photoStyle === 'bordered' ? `border:2px solid ${C.accent};` : '';
    return `<div style="height:${heightIn_val};overflow:hidden;border-radius:${borderRadius};${border}position:relative;">
      <img src="${src}" style="width:100%;height:100%;object-fit:cover;display:block;" />
      ${useColorBands ? `<div style="position:absolute;bottom:0;left:0;right:0;height:6px;background:${C.accent};opacity:0.8;"></div>` : ''}
    </div>${caption ? `<div class="photo-caption">${caption}</div>` : ''}`;
  }

  function sectionHeader(title, eyebrow) {
    return `
      ${useDecorativeBars ? decorativeBar() : ''}
      <div class="section-eyebrow">${eyebrow || docTypeLabel}</div>
      <div class="section-title">${title}</div>
    `;
  }

  function colorBand(content, tight=false) {
    if (!useColorBands) return `<div style="padding:${tight?'10px':'14px'} 14px;margin-bottom:10px;">${content}</div>`;
    return `<div style="background:${C.primary};border-radius:6px;padding:${tight?'10px':'14px'} 14px;margin-bottom:10px;">${content}</div>`;
  }

  function statCards(cards) {
    const cols = Math.min(cards.length, isLandscape ? 4 : 3);
    return `<div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:8px;margin-bottom:14px;">
      ${cards.map(([l,v]) => `<div class="stat-card"><div class="stat-card-label">${l}</div><div class="stat-card-value stat-num">${v}</div></div>`).join('')}
    </div>`;
  }

  function inlinePhoto(src, width, float, caption='') {
    if (!src) return '';
    return `<div style="float:${float};width:${width};margin:${float==='right'?'0 0 10px 14px':'0 14px 10px 0'};border-radius:4px;overflow:hidden;">
      <img src="${src}" style="width:100%;height:auto;display:block;object-fit:cover;" />
      ${caption ? `<div class="photo-caption" style="padding:2px 4px;">${caption}</div>` : ''}
    </div>`;
  }

  // Track photo index
  let photoIdx = 0;
  function nextPhoto() { return photos[photoIdx++] || null; }

  let pages = `<style>${css}</style>`;

  // ===== COVER PAGE =====
  if (sections.includes('cover')) {
    const heroPhoto = photos[0];
    photoIdx = 1;
    const coverStats = [
      fin.price && ['Asking Price', '$' + fmtNum(fin.price)],
      prop.sf && ['Building SF', fmtNum(prop.sf) + ' SF'],
      fin.capRate && ['Cap Rate', fin.capRate + '%'],
      fin.noi && ['NOI', '$' + fmtNum(fin.noi)],
      fin.occupancy && ['Occupancy', fin.occupancy + '%'],
    ].filter(Boolean);

    if (headerStyle === 'split' && heroPhoto) {
      // Split layout: photo left, text right
      pages += `<div class="doc-page" style="background:${C.primary};">
        <div style="position:absolute;left:0;top:0;width:55%;height:100%;overflow:hidden;">
          <img src="${heroPhoto}" style="width:100%;height:100%;object-fit:cover;display:block;" />
          <div style="position:absolute;inset:0;background:linear-gradient(to right,transparent 60%,${C.primary});"></div>
        </div>
        <div style="position:absolute;right:0;top:0;width:48%;height:100%;padding:${pad.h};display:flex;flex-direction:column;justify-content:center;">
          <div style="font-size:7pt;letter-spacing:2.5px;text-transform:uppercase;color:${C.accent};font-family:'${F.heading}',serif;font-weight:600;margin-bottom:0.2in;">${firmName} · ${docTypeLabel}</div>
          <div style="height:3px;background:${C.accent};width:40px;margin-bottom:16px;"></div>
          <div style="font-family:'${F.heading}',serif;font-size:${isLandscape?'28':'22'}pt;font-weight:500;color:#fff;line-height:1.1;margin-bottom:10px;">${prop.name}</div>
          <div style="font-size:10pt;color:rgba(255,255,255,0.65);margin-bottom:16px;">${fullAddr}</div>
          <div style="border-top:1px solid ${hex2rgba(C.accent,0.4)};padding-top:14px;">
            ${coverStats.map(([l,v]) => `<div style="margin-bottom:8px;"><div style="font-size:6.5pt;letter-spacing:1.5px;text-transform:uppercase;color:${C.accent};opacity:0.8;">${l}</div><div style="font-size:16pt;color:#fff;font-weight:600;font-family:'${F.number||F.heading}',serif;">${v}</div></div>`).join('')}
          </div>
        </div>
        ${broker.name ? `<div style="position:absolute;bottom:34px;right:${pad.h};text-align:right;"><div style="font-size:9pt;color:#fff;font-weight:500;">${broker.name}</div>${broker.title?`<div style="font-size:8pt;color:${C.accent};">${broker.title}</div>`:''}</div>` : ''}
        ${footer()}
      </div>`;
    } else {
      // Dark overlay layout (default) — full-bleed photo with dramatic overlay
      pages += `<div class="doc-page" style="background:${C.primary};">
        ${heroPhoto ? `
          <div style="position:absolute;inset:0;">
            <img src="${heroPhoto}" style="width:100%;height:100%;object-fit:cover;display:block;opacity:${photoEmphasis==='dominant'?'0.75':photoEmphasis==='subtle'?'0.35':'0.55'};" />
            <div style="position:absolute;inset:0;background:linear-gradient(160deg,${hex2rgba(C.primary,0.3)} 0%,${hex2rgba(C.primary,0.75)} 50%,${hex2rgba(C.primary,0.97)} 100%);"></div>
          </div>
        ` : ''}
        <div style="position:relative;z-index:2;height:100%;display:flex;flex-direction:column;padding:${pad.h};padding-bottom:0;">
          <div style="margin-bottom:auto;">
            <div style="font-size:7.5pt;letter-spacing:3px;text-transform:uppercase;color:${C.accent};font-family:'${F.heading}',serif;font-weight:600;margin-bottom:${isLandscape?'0.25in':'0.18in'};">${firmName.toUpperCase()} &nbsp;·&nbsp; ${docTypeLabel.toUpperCase()}</div>
            <div style="height:4px;background:${C.accent};width:${isLandscape?'60px':'45px'};margin-bottom:${isLandscape?'18px':'13px'};"></div>
            <div style="font-family:'${F.heading}',serif;font-size:${isLandscape?'40':'30'}pt;font-weight:${formality==='luxury'?'400':'500'};color:#fff;line-height:1.05;margin-bottom:10px;max-width:${isLandscape?'6.5in':'4.5in'};letter-spacing:${formality==='luxury'?'-0.5px':'0'};">${prop.name}</div>
            <div style="font-size:${isLandscape?'13':'11'}pt;color:rgba(255,255,255,0.7);margin-bottom:8px;">${fullAddr}</div>
            ${prop.sf || prop.yearBuilt ? `<div style="font-size:9pt;color:rgba(255,255,255,0.5);">${prop.sf ? fmtNum(prop.sf) + ' SF' : ''} ${prop.sf && prop.yearBuilt ? '·' : ''} ${prop.yearBuilt ? 'Built ' + prop.yearBuilt : ''} ${prop.zoning ? '· ' + prop.zoning : ''}</div>` : ''}
          </div>
          <div style="border-top:1.5px solid ${hex2rgba(C.accent,0.5)};padding-top:${isLandscape?'0.18in':'0.14in'};padding-bottom:${isLandscape?'0.3in':'0.25in'};display:flex;gap:${isLandscape?'0.35in':'0.2in'};flex-wrap:wrap;align-items:flex-end;">
            ${coverStats.map(([l,v]) => `<div style="flex-shrink:0;">
              <div style="font-size:6.5pt;letter-spacing:1.5px;text-transform:uppercase;color:${hex2rgba(C.accent,0.8)};font-family:'${F.body}',sans-serif;margin-bottom:4px;">${l}</div>
              <div style="font-family:'${F.number||F.heading}',serif;font-size:${isLandscape?'22':'17'}pt;color:#fff;font-weight:600;line-height:1;">${v}</div>
            </div>`).join('')}
            <div style="margin-left:auto;text-align:right;align-self:flex-end;">
              ${broker.name ? `<div style="font-size:10pt;color:#fff;font-weight:500;">${broker.name}</div>` : ''}
              ${broker.title ? `<div style="font-size:8.5pt;color:${C.accent};">${broker.title}</div>` : ''}
              ${broker.phone ? `<div style="font-size:8pt;color:rgba(255,255,255,0.55);">${broker.phone}</div>` : ''}
            </div>
          </div>
          <div style="position:absolute;bottom:26px;left:0;right:0;height:5px;background:${C.accent};"></div>
        </div>
        ${footer()}
      </div>`;
    }
  }

  // ===== HIGHLIGHTS + EXEC SUMMARY — with photo strip =====
  if (sections.includes('highlights')) {
    const hiList = ai.investmentHighlights?.length ? ai.investmentHighlights : (prop.highlights ? prop.highlights.split('\n').filter(Boolean) : []);
    const finHighlights = ai.financialHighlights || [];
    const pq1 = ai.pullQuotes?.[0];
    const sidePhoto = nextPhoto();

    const mainContent = `
      ${sectionHeader('Investment Highlights', docTypeLabel)}
      ${finHighlights.length ? `<div style="margin-bottom:12px;">${finHighlights.map(h => `<div style="display:flex;align-items:flex-start;gap:8px;padding:5px 0;border-bottom:1px solid ${hex2rgba(C.rule,0.15)};"><div style="width:8px;height:8px;border-radius:50%;background:${C.accent};margin-top:3px;flex-shrink:0;"></div><span class="body-text" style="font-weight:600;color:${C.primary};">${h}</span></div>`).join('')}</div>` : ''}
      ${hiList.map(h => `<div style="display:flex;align-items:flex-start;gap:9px;padding:6px 0;border-bottom:1px solid ${hex2rgba(C.rule,0.12)};"><div style="width:6px;height:6px;border-radius:50%;background:${C.secondary};margin-top:4px;flex-shrink:0;"></div><span class="body-text">${h}</span></div>`).join('')}
      ${pq1 ? pullQuote(pq1) : ''}
      ${ai.executiveSummary ? `<div style="margin-top:12px;"><div style="font-size:7pt;letter-spacing:1.5px;text-transform:uppercase;color:${C.secondary};margin-bottom:6px;">Executive Summary</div><div class="body-text">${ai.executiveSummary.slice(0,600)}</div></div>` : ''}
    `;

    const sideContent = sidePhoto ? `
      ${photoBlock(sidePhoto, isLandscape ? '1.8in' : '2.2in', photoStyle)}
      ${fin.price ? `<div style="margin-top:10px;padding:10px;background:${C.primary};border-radius:5px;text-align:center;"><div style="font-size:7pt;letter-spacing:1px;text-transform:uppercase;color:${C.accent};margin-bottom:3px;">Offered At</div><div style="font-size:17pt;color:#fff;font-weight:600;font-family:'${F.number||F.heading}',serif;">$${fmtNum(fin.price)}</div>${fin.capRate?`<div style="font-size:8pt;color:rgba(255,255,255,0.6);margin-top:2px;">${fin.capRate}% Cap Rate</div>`:''}</div>` : ''}
      ${fin.noi ? `<div style="margin-top:8px;padding:8px 10px;background:${hex2rgba(C.secondary,0.08)};border-left:3px solid ${C.secondary};border-radius:0 4px 4px 0;"><div style="font-size:7pt;color:${C.secondary};text-transform:uppercase;letter-spacing:1px;">NOI</div><div style="font-size:14pt;font-weight:600;color:${C.primary};font-family:'${F.number||F.heading}',serif;">$${fmtNum(fin.noi)}</div></div>` : ''}
    ` : '';

    pages += pageLayout(mainContent, sideContent, useSidebar, C, pad, footer, isLandscape);
  }

  // ===== PROPERTY DETAILS — photo inset + specs table =====
  if (sections.includes('property')) {
    const propRows = [['Property Name',prop.name],['Address',fullAddr],['County',prop.county],['Property Type',state.propType],['Year Built',prop.yearBuilt],['Building Size',prop.sf?fmtNum(prop.sf)+' SF':''],['Lot Size',prop.acres?prop.acres+' Acres':''],['Buildings',prop.buildings],['Suites / Units',prop.units],['Zoning',prop.zoning],['Clear Height',prop.clearHeight?prop.clearHeight+' ft':''],['Parking',prop.parking?prop.parking+' spaces':'']].filter(([,v])=>v);
    const insetPh = nextPhoto();
    const pq2 = ai.pullQuotes?.[1];

    const mainContent = `
      ${sectionHeader('Property Details', docTypeLabel)}
      ${insetPh && photoEmphasis !== 'subtle' ? inlinePhoto(insetPh, isLandscape ? '42%' : '38%', 'right') : ''}
      ${ai.propertyDescription ? `<div class="body-text" style="margin-bottom:14px;">${ai.propertyDescription.slice(0,500)}</div>` : ''}
      <table style="width:100%;border-collapse:collapse;font-size:${parseFloat(bodyFontSize)-1}pt;clear:both;">
        ${propRows.map((r,i) => `<tr style="background:${i%2===0?hex2rgba(C.primary,0.04):'transparent'};">
          <td style="padding:7px 10px;font-weight:600;color:${C.primary};width:35%;border-bottom:1px solid ${hex2rgba(C.rule,0.15)};">${r[0]}</td>
          <td style="padding:7px 10px;color:${C.text};border-bottom:1px solid ${hex2rgba(C.rule,0.15)};">${r[1]}</td>
        </tr>`).join('')}
      </table>
      ${pq2 ? pullQuote(pq2) : ''}
    `;
    pages += pageLayout(mainContent, '', false, C, pad, footer, isLandscape);
  }

  // ===== PHOTOS PAGE — dynamic multi-photo layout =====
  if (sections.includes('photos') && photos.length > 0) {
    // Collect remaining photos for this page
    const pagePhotos = [];
    let ph;
    while ((ph = nextPhoto()) && pagePhotos.length < 6) pagePhotos.push(ph);
    if (photos[0] && pagePhotos.length === 0) pagePhotos.push(photos[0]);

    let photoGrid = '';
    if (pagePhotos.length === 1) {
      photoGrid = `<div style="height:${isLandscape?'5.2in':'6.8in'};border-radius:4px;overflow:hidden;">${photoBlock(pagePhotos[0], '100%', photoStyle)}</div>`;
    } else if (pagePhotos.length === 2) {
      photoGrid = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;height:${isLandscape?'5.2in':'6.8in'};">${pagePhotos.map(p => `<div style="overflow:hidden;border-radius:4px;">${photoBlock(p,'100%',photoStyle)}</div>`).join('')}</div>`;
    } else if (pagePhotos.length === 3) {
      photoGrid = `<div style="display:grid;grid-template-columns:1.5fr 1fr;grid-template-rows:1fr 1fr;gap:10px;height:${isLandscape?'5.2in':'6.5in'};">
        <div style="grid-row:1/3;overflow:hidden;border-radius:4px;">${photoBlock(pagePhotos[0],'100%',photoStyle)}</div>
        <div style="overflow:hidden;border-radius:4px;">${photoBlock(pagePhotos[1],'100%',photoStyle)}</div>
        <div style="overflow:hidden;border-radius:4px;">${photoBlock(pagePhotos[2],'100%',photoStyle)}</div>
      </div>`;
    } else {
      const perRow = isLandscape ? 3 : 2;
      photoGrid = `<div style="display:grid;grid-template-columns:repeat(${perRow},1fr);gap:10px;">
        ${pagePhotos.map(p => `<div style="height:${isLandscape?'2.4in':'2.8in'};overflow:hidden;border-radius:4px;">${photoBlock(p,'100%',photoStyle)}</div>`).join('')}
      </div>`;
    }

    pages += `<div class="doc-page">
      <div style="height:calc(100% - 26px);padding:${pad.h};overflow:hidden;">
        ${sectionHeader('Property Photos', docTypeLabel)}
        ${photoGrid}
      </div>
      ${footer()}
    </div>`;
  }

  // ===== LOCATION + AMENITY MAP =====
  if (sections.includes('location')) {
    const locText = ai.locationOverview || `${prop.city}, ${prop.state} offers strong fundamentals for commercial real estate investment. The subject property benefits from its strategic location within the ${prop.city} submarket.`;
    const mktCtx = ai.marketContext || '';
    const locPhoto = nextPhoto();

    const mapCanvasHTML = `<canvas id="amenityMap" width="280" height="190" style="border-radius:5px;display:block;width:100%;"></canvas>`;

    const sideContent = useSidebar ? `
      ${mapCanvasHTML}
      <div style="margin-top:8px;font-size:7pt;color:${C.text};opacity:0.7;font-style:italic;">Location & access map</div>
      ${locPhoto ? `<div style="margin-top:10px;">${photoBlock(locPhoto, '1.4in', photoStyle)}</div>` : ''}
      <div style="margin-top:10px;background:${hex2rgba(C.secondary,0.08)};border-left:3px solid ${C.secondary};padding:8px 10px;border-radius:0 4px 4px 0;">
        <div style="font-size:7pt;text-transform:uppercase;letter-spacing:1px;color:${C.secondary};margin-bottom:4px;">Location</div>
        <div style="font-size:8.5pt;color:${C.text};line-height:1.5;">${fullAddr}${prop.county?'<br>'+prop.county:''}</div>
      </div>
    ` : mapCanvasHTML;

    const mainContent = `
      ${sectionHeader('Location & Market Overview', docTypeLabel)}
      ${locPhoto && !useSidebar ? `<div style="height:${isLandscape?'1.8in':'2.2in'};margin-bottom:12px;border-radius:4px;overflow:hidden;">${photoBlock(locPhoto,'100%',photoStyle)}</div>` : ''}
      <div class="body-text">${locText}</div>
      ${mktCtx ? `<div style="margin-top:10px;padding:10px 12px;background:${hex2rgba(C.accent,0.12)};border-radius:5px;border-left:3px solid ${C.accent};"><div class="body-text" style="font-style:italic;">${mktCtx}</div></div>` : ''}
      ${!useSidebar ? `<div style="margin-top:14px;">${mapCanvasHTML}</div>` : ''}
    `;

    pages += pageLayout(mainContent, sideContent, useSidebar, C, pad, footer, isLandscape);

    // Draw amenity map on canvas after render
    pages += `<script>
(function() {
  setTimeout(function() {
    const canvas = document.getElementById('amenityMap');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    ctx.fillStyle = '#e8e4dc'; ctx.fillRect(0,0,W,H);
    // Road grid
    const roads = [[0,H*0.45,W,H*0.45],[0,H*0.65,W,H*0.65],[W*0.3,0,W*0.3,H],[W*0.65,0,W*0.65,H]];
    roads.forEach(([x1,y1,x2,y2]) => { ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.strokeStyle='#d8ceb4'; ctx.lineWidth=6; ctx.stroke(); });
    // Subject marker
    const sx=W*0.48, sy=H*0.52;
    ctx.beginPath(); ctx.arc(sx,sy,8,0,Math.PI*2); ctx.fillStyle='${C.primary}'; ctx.fill();
    ctx.strokeStyle='${C.accent}'; ctx.lineWidth=3; ctx.stroke();
    // Radius ring
    ctx.beginPath(); ctx.arc(sx,sy,60,0,Math.PI*2); ctx.strokeStyle='${C.accent}'; ctx.lineWidth=1.5; ctx.setLineDash([5,4]); ctx.stroke(); ctx.setLineDash([]);
    // POI dots
    const pois = [[sx-55,sy-20,'#1D9E75'],[sx+45,sy+25,'#D85A30'],[sx-30,sy+45,'#7F77DD'],[sx+60,sy-35,'#1D9E75'],[sx-70,sy+15,'#D85A30']];
    pois.forEach(([px,py,col]) => { ctx.beginPath(); ctx.arc(px,py,5,0,Math.PI*2); ctx.fillStyle=col; ctx.fill(); ctx.strokeStyle='#fff'; ctx.lineWidth=1.5; ctx.stroke(); });
    // Label
    ctx.font='bold 9px Arial'; ctx.fillStyle='${C.primary}'; ctx.textAlign='center';
    ctx.fillText('${(prop.address||'Subject Property').slice(0,25)}', sx, sy-14);
    ctx.font='7px Arial'; ctx.fillStyle='rgba(0,0,0,0.5)'; ctx.fillText('1-mile radius', sx, sy+78);
  }, 300);
})();
</script>`;
  }

  // ===== FINANCIAL SUMMARY — rich, data-forward layout =====
  if (sections.includes('financials')) {
    const cards = [
      fin.price && ['Asking Price', '$'+fmtNum(fin.price)],
      fin.ppsf && ['Price / SF', '$'+fin.ppsf],
      fin.noi && ['NOI', '$'+fmtNum(fin.noi)],
      fin.capRate && ['Cap Rate', fin.capRate+'%'],
      fin.occupancy && ['Occupancy', fin.occupancy+'%'],
      fin.walt && ['WALT', fin.walt+' Yrs'],
      (fin.finDscr||fin.finDebtService) && ['DSCR', fin.finDscr||'See notes'],
      fin.finCashOnCash && ['Cash-on-Cash', fin.finCashOnCash],
    ].filter(Boolean);

    const expBreakdown = fin.expenseBreakdown?.filter(e=>e.item&&e.amount) || [];
    const pq3 = ai.pullQuotes?.[2];

    const mainContent = `
      ${sectionHeader('Financial Summary', docTypeLabel)}
      ${statCards(cards.slice(0, isLandscape ? 4 : 3))}
      ${cards.length > (isLandscape ? 4 : 3) ? statCards(cards.slice(isLandscape ? 4 : 3)) : ''}
      ${pq3 ? pullQuote(pq3) : ''}
      <table style="width:100%;border-collapse:collapse;font-size:${parseFloat(bodyFontSize)-0.5}pt;margin-top:10px;">
        <thead><tr style="background:${C.primary};"><th style="padding:8px 10px;color:#fff;text-align:left;font-weight:500;font-size:7.5pt;">Income Statement</th><th style="padding:8px 10px;color:#fff;text-align:right;font-weight:500;font-size:7.5pt;">Annual</th></tr></thead>
        <tbody>
          ${fin.gpr?`<tr><td style="padding:7px 10px;border-bottom:1px solid ${hex2rgba(C.rule,0.15)};">Gross Potential Rent</td><td style="padding:7px 10px;text-align:right;border-bottom:1px solid ${hex2rgba(C.rule,0.15)};">$${fmtNum(fin.gpr)}</td></tr>`:''}
          ${fin.vacancy?`<tr style="background:${hex2rgba(C.primary,0.03)};"><td style="padding:7px 10px;border-bottom:1px solid ${hex2rgba(C.rule,0.15)};color:${C.text};">Less: Vacancy (${fin.vacancy}%)</td><td style="padding:7px 10px;text-align:right;border-bottom:1px solid ${hex2rgba(C.rule,0.15)};color:#cc3333;">($${fmtNum(Math.round(parseFloat(fin.gpr||0)*parseFloat(fin.vacancy||0)/100))})</td></tr>`:''}
          ${fin.egi?`<tr><td style="padding:7px 10px;border-bottom:1px solid ${hex2rgba(C.rule,0.15)};">Effective Gross Income</td><td style="padding:7px 10px;text-align:right;border-bottom:1px solid ${hex2rgba(C.rule,0.15)};">$${fmtNum(fin.egi)}</td></tr>`:''}
          ${fin.opex?`<tr style="background:${hex2rgba(C.primary,0.03)};"><td style="padding:7px 10px;border-bottom:1px solid ${hex2rgba(C.rule,0.15)};">Less: Operating Expenses</td><td style="padding:7px 10px;text-align:right;border-bottom:1px solid ${hex2rgba(C.rule,0.15)};color:#cc3333;">($${fmtNum(fin.opex)})</td></tr>`:''}
          ${expBreakdown.map(e=>`<tr><td style="padding:5px 10px 5px 20px;border-bottom:1px solid ${hex2rgba(C.rule,0.1)};font-size:8pt;color:${C.text};opacity:0.8;">— ${e.item}</td><td style="padding:5px 10px;text-align:right;border-bottom:1px solid ${hex2rgba(C.rule,0.1)};font-size:8pt;">$${fmtNum(e.amount)}</td></tr>`).join('')}
          ${fin.noi?`<tr style="background:${C.primary};"><td style="padding:9px 10px;color:#fff;font-weight:600;">Net Operating Income</td><td style="padding:9px 10px;text-align:right;color:${C.accent};font-weight:600;font-family:'${F.number||F.heading}',serif;font-size:12pt;">$${fmtNum(fin.noi)}</td></tr>`:''}
          ${fin.finDebtService?`<tr><td style="padding:7px 10px;border-bottom:1px solid ${hex2rgba(C.rule,0.15)};">Annual Debt Service</td><td style="padding:7px 10px;text-align:right;border-bottom:1px solid ${hex2rgba(C.rule,0.15)};">$${fmtNum(fin.finDebtService)}</td></tr>`:''}
          ${fin.recentCapex?`<tr style="background:${hex2rgba(C.accent,0.08)};"><td style="padding:7px 10px;border-bottom:1px solid ${hex2rgba(C.rule,0.15)};font-weight:500;">Recent CapEx</td><td style="padding:7px 10px;text-align:right;border-bottom:1px solid ${hex2rgba(C.rule,0.15)};font-weight:500;">${fin.recentCapex}</td></tr>`:''}
          ${fin.additionalNotes?`<tr><td colspan="2" style="padding:7px 10px;font-size:8pt;font-style:italic;color:${C.text};opacity:0.75;">${fin.additionalNotes}</td></tr>`:''}
        </tbody>
      </table>
    `;
    pages += pageLayout(mainContent, '', false, C, pad, footer, isLandscape);
  }

  // ===== RENT ROLL =====
  if (sections.includes('rentroll') && rentRoll.length > 0) {
    const rrPhoto = nextPhoto();
    const mainContent = `
      ${sectionHeader('Rent Roll', docTypeLabel)}
      ${rrPhoto && photoEmphasis === 'dominant' ? `<div style="height:${isLandscape?'1.4in':'1.6in'};margin-bottom:12px;border-radius:4px;overflow:hidden;">${photoBlock(rrPhoto,'100%',photoStyle)}</div>` : ''}
      <table style="width:100%;border-collapse:collapse;font-size:${parseFloat(bodyFontSize)-1}pt;">
        <thead><tr style="background:${C.primary};">
          ${['Tenant','Suite','SF','Lease Start','Lease End','Annual Rent','$/SF','Type'].map(h=>`<th style="padding:7px 9px;color:#fff;text-align:left;font-weight:500;font-size:7pt;">${h}</th>`).join('')}
        </tr></thead>
        <tbody>
          ${rentRoll.map((r,i) => {
            const rpsf = r.sf && r.annualRent ? '$'+(parseFloat(r.annualRent)/parseFloat(r.sf)).toFixed(2) : '—';
            const isSignificant = parseFloat(r.annualRent) > parseFloat(fin.gpr||0) * 0.3;
            return `<tr style="background:${i%2===0?hex2rgba(C.primary,0.04):'transparent'}${isSignificant?';border-left:3px solid '+C.accent:''};">
              <td style="padding:7px 9px;border-bottom:1px solid ${hex2rgba(C.rule,0.12)};font-weight:${isSignificant?'600':'400'};color:${C.primary};">${r.tenant}</td>
              <td style="padding:7px 9px;border-bottom:1px solid ${hex2rgba(C.rule,0.12)};">${r.suite||'—'}</td>
              <td style="padding:7px 9px;border-bottom:1px solid ${hex2rgba(C.rule,0.12)};">${r.sf?fmtNum(r.sf):'—'}</td>
              <td style="padding:7px 9px;border-bottom:1px solid ${hex2rgba(C.rule,0.12)};">${r.leaseStart||'—'}</td>
              <td style="padding:7px 9px;border-bottom:1px solid ${hex2rgba(C.rule,0.12)};">${r.leaseEnd||'—'}</td>
              <td style="padding:7px 9px;border-bottom:1px solid ${hex2rgba(C.rule,0.12)};font-family:'${F.number||F.heading}',serif;font-weight:${isSignificant?'600':'400'};">${r.annualRent?'$'+fmtNum(r.annualRent):'—'}</td>
              <td style="padding:7px 9px;border-bottom:1px solid ${hex2rgba(C.rule,0.12)};font-family:'${F.number||F.heading}',serif;">${rpsf}</td>
              <td style="padding:7px 9px;border-bottom:1px solid ${hex2rgba(C.rule,0.12)};font-size:7.5pt;">${r.leaseType||'—'}</td>
            </tr>`;
          }).join('')}
          ${rentRoll.length > 1 && fin.gpr ? `<tr style="background:${C.primary};">
            <td colspan="2" style="padding:7px 9px;color:#fff;font-weight:600;">Total</td>
            <td style="padding:7px 9px;color:#fff;">${fmtNum(rentRoll.reduce((s,r)=>s+parseFloat(r.sf||0),0))} SF</td>
            <td colspan="3" style="padding:7px 9px;color:${C.accent};font-weight:600;font-family:'${F.number||F.heading}',serif;">$${fmtNum(fin.gpr)}/yr</td>
            <td style="padding:7px 9px;color:#fff;">${fin.ppsf?'$'+fin.ppsf:''}</td>
            <td></td>
          </tr>` : ''}
        </tbody>
      </table>
      ${ai.tenantSummary ? `<div style="margin-top:12px;padding:10px 12px;background:${hex2rgba(C.secondary,0.07)};border-radius:5px;border-left:3px solid ${C.secondary};"><div class="body-text" style="font-size:9pt;">${ai.tenantSummary.slice(0,300)}</div></div>` : ''}
    `;
    pages += pageLayout(mainContent, '', false, C, pad, footer, isLandscape);
  }

  // ===== TENANT SUMMARY (standalone) =====
  if (sections.includes('tenants') && !sections.includes('rentroll')) {
    const tenText = ai.tenantSummary || `The property is ${fin.occupancy?fin.occupancy+'% occupied':'occupied'}${fin.walt?' with a weighted average lease term of '+fin.walt+' years':''}.`;
    pages += pageLayout(`${sectionHeader('Tenant Summary',docTypeLabel)}<div class="body-text">${tenText}</div>`, '', false, C, pad, footer, isLandscape);
  }

  // ===== VALUATION =====
  if (sections.includes('valuation')) {
    const valText = ai.valuationNarrative || `${docTypeLabel === 'Offering Memorandum' ? 'The Seller is offering the property' : 'Based on our analysis, the estimated value is'} ${fin.price?'$'+fmtNum(fin.price):'to be determined'}${fin.capRate?', representing a '+fin.capRate+'% capitalization rate':''}${fin.noi?' on an NOI of $'+fmtNum(fin.noi):''}. ${ai.marketContext||''}`;
    const valPhoto = nextPhoto();

    const valBox = (fin.price || fin.capRate) ? `
      <div style="background:${C.primary};border-radius:8px;padding:${isLandscape?'18px 22px':'14px 16px'};margin-top:14px;display:flex;justify-content:space-around;align-items:center;flex-wrap:wrap;gap:14px;">
        ${fin.price?`<div style="text-align:center;"><div style="font-size:7pt;letter-spacing:1.5px;text-transform:uppercase;color:${C.accent};margin-bottom:4px;">Offered At</div><div style="font-size:${isLandscape?'28':'22'}pt;color:#fff;font-weight:600;font-family:'${F.number||F.heading}',serif;">$${fmtNum(fin.price)}</div></div>`:''}
        ${fin.ppsf?`<div style="text-align:center;"><div style="font-size:7pt;letter-spacing:1.5px;text-transform:uppercase;color:${C.accent};margin-bottom:4px;">Price / SF</div><div style="font-size:${isLandscape?'22':'17'}pt;color:#fff;font-weight:600;font-family:'${F.number||F.heading}',serif;">$${fin.ppsf}</div></div>`:''}
        ${fin.capRate?`<div style="text-align:center;"><div style="font-size:7pt;letter-spacing:1.5px;text-transform:uppercase;color:${C.accent};margin-bottom:4px;">Cap Rate</div><div style="font-size:${isLandscape?'22':'17'}pt;color:#fff;font-weight:600;font-family:'${F.number||F.heading}',serif;">${fin.capRate}%</div></div>`:''}
        ${fin.noi?`<div style="text-align:center;"><div style="font-size:7pt;letter-spacing:1.5px;text-transform:uppercase;color:${C.accent};margin-bottom:4px;">NOI</div><div style="font-size:${isLandscape?'22':'17'}pt;color:#fff;font-weight:600;font-family:'${F.number||F.heading}',serif;">$${fmtNum(fin.noi)}</div></div>`:''}
      </div>` : '';

    const mainContent = `
      ${sectionHeader('Valuation & Pricing Guidance', docTypeLabel)}
      ${valPhoto ? `<div style="height:${isLandscape?'1.6in':'2in'};margin-bottom:12px;border-radius:4px;overflow:hidden;">${photoBlock(valPhoto,'100%',photoStyle)}</div>` : ''}
      <div class="body-text">${valText}</div>
      ${valBox}
    `;
    pages += pageLayout(mainContent, '', false, C, pad, footer, isLandscape);
  }

  // ===== DISCLAIMER =====
  if (sections.includes('disclaimer')) {
    const mainContent = `
      ${sectionHeader('Disclaimer & Confidentiality', docTypeLabel)}
      <div style="font-size:8.5pt;color:${C.text};opacity:0.65;line-height:1.8;">${disclaimer}</div>
      ${broker.name ? `<div style="margin-top:18px;padding:12px 14px;background:${hex2rgba(C.primary,0.05)};border-radius:6px;border-top:3px solid ${C.accent};">
        <div style="font-weight:600;color:${C.primary};font-size:10pt;">${broker.name}</div>
        ${broker.title?`<div style="color:${C.secondary};font-size:9pt;">${broker.title}</div>`:''}
        <div style="margin-top:6px;font-size:8.5pt;color:${C.text};">${[broker.phone,broker.email,broker.license].filter(Boolean).join(' · ')}</div>
        <div style="margin-top:4px;font-size:8.5pt;color:${C.text};opacity:0.7;">${firmName} · ${officeCity}</div>
      </div>` : ''}
    `;
    pages += pageLayout(mainContent, '', false, C, pad, footer, isLandscape);
  }

  return pages;
}

// ============ PAGE LAYOUT HELPER ============
function pageLayout(mainContent, sideContent, useSidebar, C, pad, footerFn, isLandscape) {
  const hex2rgba = (hex, alpha) => {
    try { const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16); return `rgba(${r},${g},${b},${alpha})`; } catch(e) { return hex; }
  };
  const sideW = isLandscape ? '2.0in' : '1.6in';

  if (useSidebar && sideContent) {
    return `<div class="doc-page">
      <div style="height:calc(100% - 26px);display:flex;gap:0;overflow:hidden;">
        <div style="flex:1;padding:${pad.h};overflow:hidden;">${mainContent}</div>
        <div style="width:${sideW};flex-shrink:0;padding:${pad.h} ${pad.v} ${pad.h} 0;border-left:1.5px solid ${hex2rgba(C.rule,0.15)};overflow:hidden;">${sideContent}</div>
      </div>
      ${footerFn()}
    </div>`;
  }
  return `<div class="doc-page">
    <div style="height:calc(100% - 26px);padding:${pad.h};overflow:hidden;">${mainContent}</div>
    ${footerFn()}
  </div>`;
}
