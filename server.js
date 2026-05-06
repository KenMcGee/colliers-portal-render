import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

// ── middleware ──────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// ── helpers ─────────────────────────────────────────────────
const fetch = (...a) => import('node-fetch').then(({ default: f }) => f(...a));
const b64 = buf => buf.toString('base64');

async function claude(body) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY not set');
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify(body),
  });
  return r.json().then(d => { if (!r.ok) throw new Error(d?.error?.message || JSON.stringify(d)); return d; });
}

// ── ping ────────────────────────────────────────────────────
app.get('/api/ping', (_, res) => res.json({
  ok: true,
  hasAnthropicKey: !!process.env.ANTHROPIC_API_KEY,
  hasMapboxToken: !!process.env.MAPBOX_TOKEN,
  timestamp: new Date().toISOString(),
}));

// ── public config (non-secret keys for browser) ─────────────
app.get('/api/config', (_, res) => res.json({
  mapboxToken: process.env.MAPBOX_TOKEN || '',
}));

// ── Claude proxy ────────────────────────────────────────────
app.post('/api/claude', async (req, res) => {
  try { res.json(await claude(req.body)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ── XLSX / CSV parser ───────────────────────────────────────
app.post('/api/parse-xlsx', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  try {
    const { read, utils } = await import('xlsx');
    const wb = read(req.file.buffer, { type: 'buffer' });
    const sheets = {};
    wb.SheetNames.forEach(n => { sheets[n] = utils.sheet_to_csv(wb.Sheets[n]); });
    const text = Object.entries(sheets).map(([n, c]) => `=== ${n} ===\n${c}`).join('\n\n').slice(0, 12000);

    const d = await claude({
      model: 'claude-sonnet-4-6', max_tokens: 3000,
      messages: [{ role: 'user', content: `Extract all financial data from this spreadsheet. Return ONLY valid JSON, no markdown:
{
  "finPrice":"","finPpsf":"","finGpr":"","finVacancy":"","finEgi":"","finOpex":"","finNoi":"",
  "finCaprate":"","finOccupancy":"","finWalt":"","finDebtService":"","finDscr":"",
  "finCashOnCash":"","finIrr":"","finEquityMultiple":"",
  "keyHighlights":["","",""],
  "rentRoll":[{"tenant":"","suite":"","sf":"","leaseStart":"","leaseEnd":"","annualRent":"","rentPsf":"","leaseType":""}],
  "expenseBreakdown":[{"item":"","amount":""}],
  "recentCapex":"","assumableDebt":"","additionalNotes":""
}

Spreadsheet:\n${text}` }],
    });
    const raw = d.content?.[0]?.text || '{}';
    res.json({ ok: true, data: JSON.parse(raw.replace(/```json|```/g, '').trim()) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});




// ── photo upload (broker headshots) ─────────────────────────
app.post('/api/upload-photo', upload.single('photo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const dataUrl = `data:${req.file.mimetype};base64,${b64(req.file.buffer)}`;
  res.json({ ok: true, dataUrl });
});

// ── Google Places proxy (keeps API key server-side) ──────────
// ── Google Places proxy (server-side keeps key hidden) ────────
app.post('/api/places-search', async (req, res) => {
  const key = process.env.GOOGLE_MAPS_KEY;
  const { query, lat, lng, radius = 1609, type } = req.body;
  if (!key) return res.status(400).json({ error: 'GOOGLE_MAPS_KEY not configured', fallback: true });
  try {
    // Use Nearby Search when we have coordinates, Text Search otherwise
    let url;
    if (lat && lng && type) {
      url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radius}&keyword=${encodeURIComponent(query||type)}&key=${key}`;
    } else if (lat && lng) {
      url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&location=${lat},${lng}&radius=${radius}&key=${key}`;
    } else {
      url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&key=${key}`;
    }
    const r = await fetch(url);
    const d = await r.json();
    // Normalize to consistent format
    const results = (d.results || []).map(p => ({
      name: p.name,
      address: p.formatted_address || p.vicinity,
      lat: p.geometry?.location?.lat,
      lng: p.geometry?.location?.lng,
      rating: p.rating,
      types: p.types,
    }));
    res.json({ ok: true, results });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Mapbox geocoding proxy (keeps token server-side optionally) ─
app.post('/api/geocode', async (req, res) => {
  const token = process.env.MAPBOX_TOKEN;
  const { address } = req.body;
  if (!token) return res.status(400).json({ error: 'MAPBOX_TOKEN not configured' });
  if (!address) return res.status(400).json({ error: 'address required' });
  try {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json?access_token=${token}&limit=1&country=us`;
    const r = await fetch(url);
    const d = await r.json();
    if (!d.features?.length) return res.status(404).json({ error: 'Not found' });
    const [lng, lat] = d.features[0].center;
    res.json({ ok: true, lng, lat, placeName: d.features[0].place_name });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Template Library ─────────────────────────────────────────
// In-memory store — swap for a DB (SQLite, Postgres) when ready.
// Each entry shape:
// { id, name, description, tags, status, pages, cssOverrides,
//   analysis, thumbnail, createdAt, updatedAt, comments[] }
let templateLibrary = [];

// List all templates (optionally filter by status)
app.get('/api/templates', (_, res) => {
  res.json({ ok: true, templates: templateLibrary });
});

// Get single template
app.get('/api/templates/:id', (req, res) => {
  const t = templateLibrary.find(t => t.id === req.params.id);
  if (!t) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true, template: t });
});

// Save / update a template
app.post('/api/templates', express.json(), (req, res) => {
  const { id, name, description, tags, status, pages,
          cssOverrides, analysis, thumbnail } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });

  const now = new Date().toISOString();

  if (id) {
    // Update existing
    const idx = templateLibrary.findIndex(t => t.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Not found' });
    templateLibrary[idx] = {
      ...templateLibrary[idx],
      name, description, tags, status, pages,
      cssOverrides, analysis, thumbnail,
      updatedAt: now,
    };
    return res.json({ ok: true, template: templateLibrary[idx] });
  }

  // Create new
  const template = {
    id: `tpl_${Date.now()}`,
    name, description: description || '',
    tags: tags || [],
    status: status || 'review',
    pages: pages || [],
    cssOverrides: cssOverrides || {},
    analysis: analysis || null,
    thumbnail: thumbnail || null,
    comments: [],
    createdAt: now,
    updatedAt: now,
  };
  templateLibrary.unshift(template);
  res.json({ ok: true, template });
});

// Update status only (approve / reject / review)
app.patch('/api/templates/:id/status', express.json(), (req, res) => {
  const t = templateLibrary.find(t => t.id === req.params.id);
  if (!t) return res.status(404).json({ error: 'Not found' });
  t.status = req.body.status || t.status;
  t.updatedAt = new Date().toISOString();
  res.json({ ok: true, template: t });
});

// Add a comment
app.post('/api/templates/:id/comments', express.json(), (req, res) => {
  const t = templateLibrary.find(t => t.id === req.params.id);
  if (!t) return res.status(404).json({ error: 'Not found' });
  const comment = {
    id: `c_${Date.now()}`,
    author: req.body.author || 'Team',
    text: req.body.text,
    type: req.body.type || 'note',   // 'note' | 'flag'
    page: req.body.page || null,
    createdAt: new Date().toISOString(),
  };
  t.comments.push(comment);
  t.updatedAt = new Date().toISOString();
  res.json({ ok: true, comment });
});

// Delete a template
app.delete('/api/templates/:id', (req, res) => {
  const before = templateLibrary.length;
  templateLibrary = templateLibrary.filter(t => t.id !== req.params.id);
  if (templateLibrary.length === before) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

// ── Template analyze — Option A: Claude generates HTML per page ──
// Pass 1: Extract page images (pdf2pic) or use native PDF
// Pass 2: For each page, Claude generates complete HTML/CSS with placeholders
// Pass 3: Claude identifies all data fields and returns a field map
app.post('/api/templates/analyze', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });

  const name = req.body.name || req.file.originalname.replace(/\.pdf$/i, '');
  const tags = req.body.tags ? JSON.parse(req.body.tags) : [];

  // ── Attempt pdf2pic → page images ──────────────────────────
  let pageImages = [];
  let usedNativePdf = false;

  try {
    const { fromBuffer } = await import('pdf2pic').catch(() => ({ fromBuffer: null }));
    if (fromBuffer) {
      const convert = fromBuffer(req.file.buffer, {
        density: 150, format: 'jpeg', width: 1650, height: 1275,
        preserveAspectRatio: true, savePath: '/tmp', saveFilename: 'tpl',
      });
      for (let i = 1; i <= 12; i++) {
        try {
          const result = await convert(i, { responseType: 'buffer' });
          if (result?.buffer) pageImages.push({ page: i, base64: b64(result.buffer), mediaType: 'image/jpeg' });
        } catch { break; }
      }
    }
  } catch (e) { console.log('pdf2pic unavailable:', e.message); }

  if (pageImages.length === 0) {
    if (req.file.buffer.length > 20 * 1024 * 1024) {
      return res.status(400).json({ error: 'PDF too large for native analysis (max 20MB). Please compress and try again.' });
    }
    usedNativePdf = true;
  }

  // ── Pass 1: Global style extraction ────────────────────────
  // Get colors, fonts, and design language once for the whole document
  let globalStyle = {};
  try {
    let styleContent = [];
    if (!usedNativePdf) {
      styleContent.push({ type: 'text', text: `Analyze these ${pageImages.length} pages of a CRE document template.` });
      // Send first 3 pages for style analysis — enough to capture the design system
      pageImages.slice(0, 3).forEach(pg => {
        styleContent.push({ type: 'text', text: `\n--- Page ${pg.page} ---` });
        styleContent.push({ type: 'image', source: { type: 'base64', media_type: pg.mediaType, data: pg.base64 } });
      });
    } else {
      styleContent.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64(req.file.buffer) } });
    }
    styleContent.push({ type: 'text', text: `Extract the complete design system from this template. Sample exact hex colors from the document.
Return ONLY valid JSON, no markdown:
{
  "colors": {
    "primary": "#001a4d",
    "secondary": "#0057b8",
    "accent": "#c8a96e",
    "text": "#1a2332",
    "bg": "#ffffff",
    "headerBg": "#001a4d",
    "footerBg": "#001a4d",
    "statCardBg": "#001a4d",
    "statCardText": "#ffffff",
    "rule": "#0057b8"
  },
  "fonts": {
    "heading": "Playfair Display",
    "body": "Inter",
    "number": "Playfair Display",
    "headingWeight": "500",
    "bodyWeight": "400",
    "headingSizePt": 22,
    "bodySizePt": 10.5,
    "numberSizePt": 18,
    "lineHeight": 1.7,
    "useAllCaps": true
  },
  "spacing": {
    "pagePaddingIn": "0.45in 0.5in",
    "sectionGapPt": 16,
    "footerHeightPx": 28,
    "accentBarHeightPx": 5,
    "cornerRadiusPx": 4
  },
  "pageSize": {
    "widthIn": 11,
    "heightIn": 8.5,
    "orientation": "landscape"
  },
  "aesthetic": "One sentence describing the visual personality"
}` });

    const sd = await claude({ model: 'claude-sonnet-4-6', max_tokens: 2000, messages: [{ role: 'user', content: styleContent }] });
    globalStyle = JSON.parse((sd.content?.[0]?.text || '{}').replace(/```json|```/g, '').trim());
  } catch (e) {
    console.log('Style extraction failed:', e.message);
    globalStyle = {};
  }

  const C = globalStyle.colors || {};
  const F = globalStyle.fonts || {};
  const SP = globalStyle.spacing || {};
  const PS = globalStyle.pageSize || { widthIn: 11, heightIn: 8.5 };

  // Google Fonts URL for use in generated pages
  const fontFamilies = [...new Set([F.heading, F.body, F.number].filter(f => f && f !== 'Georgia'))];
  const gfUrl = fontFamilies.map(f => `family=${(f||'').replace(/ /g, '+')}:wght@300;400;500;600;700`).join('&');

  // ── Pass 2: Generate HTML per page ─────────────────────────
  // For each page, send the image + style system and ask Claude
  // to produce a complete, self-contained HTML/CSS reproduction
  // with {{PLACEHOLDER}} tags for all data fields.
  const PLACEHOLDER_GUIDE = `
Replace every piece of content-specific text with a placeholder tag using this exact format: {{FIELD_NAME}}
Use these standard field names where they apply:
  {{PROP_NAME}}        — property name / title
  {{PROP_ADDRESS}}     — street address
  {{PROP_CITY_STATE}}  — city, state zip
  {{PROP_SF}}          — building square footage
  {{PROP_YEAR}}        — year built
  {{PROP_TYPE}}        — property type
  {{PROP_ZONING}}      — zoning
  {{PROP_ACRES}}       — lot size in acres
  {{PROP_PARKING}}     — parking spaces
  {{PROP_CLEARHEIGHT}} — clear height
  {{ASKING_PRICE}}     — asking price
  {{PRICE_PSF}}        — price per square foot
  {{CAP_RATE}}         — cap rate percentage
  {{NOI}}              — net operating income
  {{OCCUPANCY}}        — occupancy percentage
  {{WALT}}             — weighted average lease term
  {{GPR}}              — gross potential rent
  {{EGI}}              — effective gross income
  {{OPEX}}             — operating expenses
  {{EXEC_SUMMARY}}     — executive summary paragraph(s)
  {{PROP_DESCRIPTION}} — property description paragraph(s)
  {{LOCATION_OVERVIEW}}— location/market overview paragraph(s)
  {{HIGHLIGHTS_LIST}}  — investment highlights bullet list
  {{RENT_ROLL_TABLE}}  — rent roll table
  {{BROKER_NAME}}      — broker full name
  {{BROKER_TITLE}}     — broker title
  {{BROKER_PHONE}}     — broker phone
  {{BROKER_EMAIL}}     — broker email
  {{BROKER_LICENSE}}   — broker license number
  {{FIRM_NAME}}        — firm/company name
  {{DOC_TYPE}}         — document type (e.g. Offering Memorandum)
  {{PAGE_NUMBER}}      — page number
  {{DISCLAIMER}}       — legal disclaimer text
For any other content-specific text not covered above, invent a descriptive placeholder e.g. {{MARKET_STAT_1}}, {{TENANT_1_NAME}}, etc.
Keep all purely decorative text (e.g. "CONFIDENTIAL", section divider text, column headers) as literal text — only replace actual property/financial data.`;

  const PAGE_HTML_PROMPT = (pageNum, total) => `You are reproducing page ${pageNum} of ${total} from a CRE document template as pixel-accurate HTML/CSS.

DESIGN SYSTEM (apply exactly):
- Page size: ${PS.widthIn}in × ${PS.heightIn}in
- Primary color: ${C.primary || '#001a4d'}
- Secondary color: ${C.secondary || '#0057b8'}  
- Accent color: ${C.accent || '#c8a96e'}
- Text color: ${C.text || '#1a2332'}
- Background: ${C.bg || '#ffffff'}
- Header background: ${C.headerBg || C.primary || '#001a4d'}
- Footer background: ${C.footerBg || C.primary || '#001a4d'}
- Stat card background: ${C.statCardBg || C.primary || '#001a4d'}
- Stat card text: ${C.statCardText || '#ffffff'}
- Rule/divider color: ${C.rule || C.secondary || '#0057b8'}
- Heading font: ${F.heading || 'Playfair Display'}, weight ${F.headingWeight || '500'}, size ${F.headingSizePt || 22}pt
- Body font: ${F.body || 'Inter'}, weight ${F.bodyWeight || '400'}, size ${F.bodySizePt || 10.5}pt
- Number font: ${F.number || F.heading || 'Playfair Display'}, size ${F.numberSizePt || 18}pt
- Line height: ${F.lineHeight || 1.7}
- All-caps eyebrows: ${F.useAllCaps !== false ? 'yes' : 'no'}
- Page padding: ${SP.pagePaddingIn || '0.45in 0.5in'}
- Footer height: ${SP.footerHeightPx || 28}px
- Accent bar height: ${SP.accentBarHeightPx || 5}px
- Corner radius: ${SP.cornerRadiusPx || 4}px

FONT IMPORT: Use this Google Fonts URL in your <style> block:
@import url('https://fonts.googleapis.com/css2?${gfUrl}&display=swap');

${PLACEHOLDER_GUIDE}

REQUIREMENTS:
1. Reproduce the EXACT layout of this page — same number of columns, same photo placement, same sidebar if present, same grid proportions
2. The outer container must be exactly ${PS.widthIn}in wide and ${PS.heightIn}in tall with overflow:hidden
3. Use CSS flexbox or grid to replicate the layout — no tables for layout
4. Every photo/image area should be a div with background: ${C.primary || '#001a4d'}20; and a centered label showing what photo goes there (e.g. "PROPERTY PHOTO", "AERIAL PHOTO")
5. All data fields replaced with {{PLACEHOLDER}} tags as specified above
6. Include a realistic amount of placeholder content so the layout proportions are visible
7. The HTML must be completely self-contained — no external dependencies except the Google Fonts import

Return ONLY the complete HTML document starting with <!DOCTYPE html> — no explanation, no markdown fences.`;

  let generatedPages = [];

  if (!usedNativePdf && pageImages.length > 0) {
    // Generate HTML for each page individually
    for (let i = 0; i < pageImages.length; i++) {
      const pg = pageImages[i];
      try {
        const d = await claude({
          model: 'claude-sonnet-4-6',
          max_tokens: 4000,
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: `Here is page ${pg.page} of the template:` },
              { type: 'image', source: { type: 'base64', media_type: pg.mediaType, data: pg.base64 } },
              { type: 'text', text: PAGE_HTML_PROMPT(pg.page, pageImages.length) },
            ],
          }],
        });
        const html = (d.content?.[0]?.text || '').trim();
        generatedPages.push({
          page: pg.page,
          html: html.startsWith('<!DOCTYPE') ? html : `<!DOCTYPE html><html><body>${html}</body></html>`,
          thumbnail: `data:image/jpeg;base64,${pg.base64}`,
          layout: null,
        });
      } catch (e) {
        console.log(`Page ${pg.page} HTML generation failed:`, e.message);
        generatedPages.push({ page: pg.page, html: null, thumbnail: `data:image/jpeg;base64,${pg.base64}`, layout: null });
      }
    }
  } else {
    // Native PDF — generate all pages in one call, Claude infers page breaks
    try {
      const d = await claude({
        model: 'claude-sonnet-4-6',
        max_tokens: 8000,
        messages: [{
          role: 'user',
          content: [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64(req.file.buffer) } },
            { type: 'text', text: `This is a CRE document template. Reproduce each page as a separate complete HTML document.

${PAGE_HTML_PROMPT('each', 'all')}

Since I cannot show you individual page images, infer each page's layout from the PDF content.

Return a JSON array where each element has:
- "page": page number (1-based)  
- "pageType": "cover" | "highlights" | "property" | "financial" | "location" | "rentroll" | "team" | "disclaimer" | "other"
- "html": the complete HTML document string for that page

Return ONLY valid JSON, no markdown fences.` },
          ],
        }],
      });
      const raw = (d.content?.[0]?.text || '[]').replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(raw);
      generatedPages = parsed.map(p => ({ page: p.page, html: p.html, thumbnail: null, layout: { pageType: p.pageType } }));
    } catch (e) {
      return res.status(500).json({ error: 'HTML generation failed: ' + e.message });
    }
  }

  // ── Pass 3: Field map ───────────────────────────────────────
  // Scan all generated HTML for placeholder tags and build a map
  // of which fields appear on which pages — used by the population
  // function to know what to substitute
  const allHtml = generatedPages.map(p => p.html || '').join('\n');
  const placeholderRegex = /\{\{([A-Z_0-9]+)\}\}/g;
  const fieldMap = {};
  let match;
  while ((match = placeholderRegex.exec(allHtml)) !== null) {
    const field = match[1];
    if (!fieldMap[field]) fieldMap[field] = [];
    const pageIdx = generatedPages.findIndex(p => (p.html || '').includes(`{{${field}}}`));
    if (pageIdx !== -1 && !fieldMap[field].includes(pageIdx + 1)) {
      fieldMap[field].push(pageIdx + 1);
    }
  }

  // ── Save to library ─────────────────────────────────────────
  const now = new Date().toISOString();
  const template = {
    id: `tpl_${Date.now()}`,
    name,
    description: globalStyle.aesthetic || '',
    tags,
    status: 'review',
    pages: generatedPages,
    globalStyle,
    fieldMap,
    thumbnail: generatedPages[0]?.thumbnail || null,
    comments: [],
    createdAt: now,
    updatedAt: now,
    analyzedVia: usedNativePdf ? 'native-pdf' : 'page-images',
  };
  templateLibrary.unshift(template);

  res.json({
    ok: true,
    template,
    pagesAnalyzed: generatedPages.length,
    fieldsFound: Object.keys(fieldMap).length,
    method: usedNativePdf ? 'native-pdf' : 'page-images',
  });
});

// ── Template render — populate placeholders with real data ────
// Called at document generation time. Takes a template ID and
// a data object, returns fully populated HTML pages ready for print.
app.post('/api/templates/render', async (req, res) => {
  const { templateId, data } = req.body;
  if (!templateId) return res.status(400).json({ error: 'templateId required' });

  const template = templateLibrary.find(t => t.id === templateId);
  if (!template) return res.status(404).json({ error: 'Template not found' });
  if (template.status !== 'approved') return res.status(400).json({ error: 'Template must be approved before use' });

  // Build the substitution map from the data payload
  const sub = {
    PROP_NAME:        data.propName        || '',
    PROP_ADDRESS:     data.propAddress     || '',
    PROP_CITY_STATE:  data.propCityState   || '',
    PROP_SF:          data.propSf          || '',
    PROP_YEAR:        data.propYear        || '',
    PROP_TYPE:        data.propType        || '',
    PROP_ZONING:      data.propZoning      || '',
    PROP_ACRES:       data.propAcres       || '',
    PROP_PARKING:     data.propParking     || '',
    PROP_CLEARHEIGHT: data.propClearHeight || '',
    ASKING_PRICE:     data.askingPrice     || '',
    PRICE_PSF:        data.pricePsf        || '',
    CAP_RATE:         data.capRate         || '',
    NOI:              data.noi             || '',
    OCCUPANCY:        data.occupancy       || '',
    WALT:             data.walt            || '',
    GPR:              data.gpr             || '',
    EGI:              data.egi             || '',
    OPEX:             data.opex            || '',
    EXEC_SUMMARY:     data.execSummary     || '',
    PROP_DESCRIPTION: data.propDescription || '',
    LOCATION_OVERVIEW:data.locationOverview|| '',
    HIGHLIGHTS_LIST:  data.highlightsList  || '',
    RENT_ROLL_TABLE:  data.rentRollTable   || '',
    BROKER_NAME:      data.brokerName      || '',
    BROKER_TITLE:     data.brokerTitle     || '',
    BROKER_PHONE:     data.brokerPhone     || '',
    BROKER_EMAIL:     data.brokerEmail     || '',
    BROKER_LICENSE:   data.brokerLicense   || '',
    FIRM_NAME:        data.firmName        || 'Colliers International',
    DOC_TYPE:         data.docType         || 'Offering Memorandum',
    DISCLAIMER:       data.disclaimer      || '',
    ...data.extra,   // any custom placeholders from the template
  };

  // Substitute placeholders in each page's HTML
  const populatedPages = template.pages
    .filter(p => data.sections ? data.sections.includes(p.layout?.pageType || 'other') : true)
    .map((p, i) => {
      if (!p.html) return { page: p.page, html: null };
      let html = p.html;
      // Page number is dynamic
      sub.PAGE_NUMBER = String(i + 1);
      Object.entries(sub).forEach(([key, val]) => {
        html = html.replaceAll(`{{${key}}}`, val);
      });
      // Strip any remaining unfilled placeholders so they don't show as {{FIELD}}
      html = html.replace(/\{\{[A-Z_0-9]+\}\}/g, '');
      return { page: p.page, html };
    });

  res.json({ ok: true, pages: populatedPages });
});

    const cd = await claude({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      messages: [{ role: 'user', content: cssContent }],
    });
    const craw = cd.content?.[0]?.text || '{}';
    cssOverrides = JSON.parse(craw.replace(/```json|```/g, '').trim());
  } catch (e) {
    console.log('CSS extraction pass failed (non-fatal):', e.message);
    // cssOverrides stays {} — analysis colors will be used as fallback
  }

  // ── Build page records ──────────────────────────────────────
  // Path A: we have real thumbnails per page
  // Path B: create placeholder page records from pageLayouts in analysis
  let pages = [];
  if (!usedNativePdf && pageImages.length > 0) {
    pages = pageImages.map((pg, i) => ({
      page: pg.page,
      thumbnail: `data:image/jpeg;base64,${pg.base64}`,
      layout: analysis.pageLayouts?.[i] || null,
    }));
  } else {
    // Derive page count and types from the analysis
    const layouts = analysis.pageLayouts || [];
    const inferredCount = layouts.length || 1;
    pages = Array.from({ length: inferredCount }, (_, i) => ({
      page: i + 1,
      thumbnail: null,   // no image available from native PDF path
      layout: layouts[i] || null,
    }));
  }

  // ── Use first page thumbnail if available ───────────────────
  const thumbnail = pages[0]?.thumbnail || null;

  // ── Save to library ─────────────────────────────────────────
  const now = new Date().toISOString();
  const template = {
    id: `tpl_${Date.now()}`,
    name,
    description: analysis.aesthetic || '',
    tags,
    status: 'review',
    pages,
    cssOverrides,
    analysis,
    thumbnail,
    comments: [],
    createdAt: now,
    updatedAt: now,
    analyzedVia: usedNativePdf ? 'native-pdf' : 'page-images',
  };
  templateLibrary.unshift(template);

  res.json({
    ok: true,
    template,
    pagesAnalyzed: pages.length,
    method: usedNativePdf ? 'native-pdf' : 'page-images',
    cssVariablesExtracted: Object.keys(cssOverrides).length,
  });
});

// ── Template generate — AI narrative + render in one call ────
app.post('/api/templates/generate', async (req, res) => {
  const { templateId, prop, fin, broker, rentRoll, sections, firm, city, docType } = req.body;
  if (!templateId) return res.status(400).json({ error: 'templateId required' });

  const template = templateLibrary.find(t => t.id === templateId);
  if (!template) return res.status(404).json({ error: 'Template not found' });

  const fmtN = n => { const x = parseFloat(n); return isNaN(x) ? (n||'') : x.toLocaleString('en-US', { maximumFractionDigits: 0 }); };
  const fmtD = n => { const x = parseFloat(n); return (!x || isNaN(x)) ? '' : '$' + fmtN(x); };

  // Generate AI narratives
  let ai = {};
  try {
    const narrativePrompt = `You are a senior CRE broker at ${firm} writing a ${docType} for a ${prop.propType || 'commercial'} property.
PROPERTY: ${prop.propName}, ${prop.propAddress}, ${prop.propCity}, ${prop.propState} ${prop.propZip}
${prop.propSf ? fmtN(prop.propSf) + ' SF' : ''} Built ${prop.propYear || 'N/A'}, Zoning: ${prop.propZoning || 'N/A'}
Description: ${prop.propDesc || 'N/A'}
Highlights: ${prop.propHighlights || 'N/A'}
FINANCIALS: Price ${fmtD(fin.price) || 'N/A'}, NOI ${fmtD(fin.noi) || 'N/A'}, Cap ${fin.capRate || 'N/A'}%, Occupancy ${fin.occupancy || 'N/A'}%, WALT ${fin.walt || 'N/A'} yrs
RENT ROLL: ${rentRoll?.length ? JSON.stringify(rentRoll) : 'Not provided'}
Return ONLY valid JSON:
{
  "execSummary": "2-3 paragraphs leading with strongest financial fact",
  "propDescription": "2-3 paragraphs with specific physical details",
  "locationOverview": "2 paragraphs on the ${prop.propCity} market",
  "highlightsList": "<ul>${['highlight 1','highlight 2','highlight 3'].map(h=>`<li>${h}</li>`).join('')}</ul>",
  "tenantSummary": "1-2 paragraphs on tenancy"
}`;
    const nd = await claude({ model: 'claude-sonnet-4-6', max_tokens: 4000, messages: [{ role: 'user', content: narrativePrompt }] });
    ai = JSON.parse((nd.content?.[0]?.text || '{}').replace(/```json|```/g, '').trim());
  } catch (e) { console.log('Narrative generation failed:', e.message); }

  // Build rent roll HTML table
  const rentRollHtml = rentRoll?.length ? `<table style="width:100%;border-collapse:collapse;font-size:9pt;">
    <thead><tr style="background:${template.globalStyle?.colors?.primary||'#001a4d'};color:#fff;">
      <th style="padding:6px 8px;text-align:left;">Tenant</th><th style="padding:6px 8px;text-align:left;">Suite</th>
      <th style="padding:6px 8px;text-align:right;">SF</th><th style="padding:6px 8px;text-align:left;">Lease Start</th>
      <th style="padding:6px 8px;text-align:left;">Lease End</th><th style="padding:6px 8px;text-align:right;">Annual Rent</th>
      <th style="padding:6px 8px;text-align:right;">$/SF</th>
    </tr></thead><tbody>
    ${rentRoll.map((r,i) => {
      const rpsf = r.sf && r.annualRent ? '$' + (parseFloat(r.annualRent)/parseFloat(r.sf)).toFixed(2) : '—';
      return `<tr style="background:${i%2===0?'rgba(0,0,0,0.03)':'transparent'}">
        <td style="padding:5px 8px;border-bottom:1px solid #eee;">${r.tenant||'—'}</td>
        <td style="padding:5px 8px;border-bottom:1px solid #eee;">${r.suite||'—'}</td>
        <td style="padding:5px 8px;text-align:right;border-bottom:1px solid #eee;">${r.sf?fmtN(r.sf):'—'}</td>
        <td style="padding:5px 8px;border-bottom:1px solid #eee;">${r.leaseStart||'—'}</td>
        <td style="padding:5px 8px;border-bottom:1px solid #eee;">${r.leaseEnd||'—'}</td>
        <td style="padding:5px 8px;text-align:right;border-bottom:1px solid #eee;">${r.annualRent?fmtD(r.annualRent):'—'}</td>
        <td style="padding:5px 8px;text-align:right;border-bottom:1px solid #eee;">${rpsf}</td>
      </tr>`;
    }).join('')}
    </tbody></table>` : '';

  // Assemble data payload for render
  const data = {
    propName:        prop.propName        || '',
    propAddress:     prop.propAddress     || '',
    propCityState:   `${prop.propCity||''}, ${prop.propState||''} ${prop.propZip||''}`.trim(),
    propSf:          prop.propSf ? fmtN(prop.propSf) + ' SF' : '',
    propYear:        prop.propYear        || '',
    propType:        prop.propType        || '',
    propZoning:      prop.propZoning      || '',
    propAcres:       prop.propAcres ? prop.propAcres + ' acres' : '',
    propParking:     prop.propParking ? prop.propParking + ' spaces' : '',
    propClearHeight: prop.propClearHeight ? prop.propClearHeight + ' ft' : '',
    askingPrice:     fmtD(fin.price)      || '',
    pricePsf:        fin.ppsf ? '$' + fin.ppsf + '/SF' : '',
    capRate:         fin.capRate ? fin.capRate + '%' : '',
    noi:             fmtD(fin.noi)        || '',
    occupancy:       fin.occupancy ? fin.occupancy + '%' : '',
    walt:            fin.walt ? fin.walt + ' years' : '',
    gpr:             fmtD(fin.gpr)        || '',
    egi:             fmtD(fin.egi)        || '',
    opex:            fmtD(fin.opex)       || '',
    execSummary:     ai.execSummary       || '',
    propDescription: ai.propDescription   || prop.propDesc || '',
    locationOverview:ai.locationOverview  || '',
    highlightsList:  ai.highlightsList    || '',
    rentRollTable:   rentRollHtml,
    brokerName:      broker.name          || '',
    brokerTitle:     broker.title         || '',
    brokerPhone:     broker.phone         || '',
    brokerEmail:     broker.email         || '',
    brokerLicense:   broker.license       || '',
    firmName:        firm                 || 'Colliers International',
    docType:         docType              || 'Offering Memorandum',
    disclaimer:      req.body.disclaimer  || '',
    sections,
  };

  // Populate the template
  const template2 = templateLibrary.find(t => t.id === templateId);
  const populatedPages = template2.pages.map((p, i) => {
    if (!p.html) return { page: p.page, html: null };
    let html = p.html;
    data.PAGE_NUMBER = String(i + 1);
    Object.entries(data).forEach(([key, val]) => {
      if (typeof val === 'string') html = html.replaceAll(`{{${key.toUpperCase()}}}`, val);
    });
    html = html.replace(/\{\{[A-Z_0-9]+\}\}/g, '');
    return { page: p.page, html };
  });

  res.json({ ok: true, pages: populatedPages, aiGenerated: Object.keys(ai) });
});

// ── SPA fallback ────────────────────────────────────────────
app.get('*', (_, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log(`Colliers Design Studio running on port ${PORT}`));
