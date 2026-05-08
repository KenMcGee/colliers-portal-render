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

// ── public config ────────────────────────────────────────────
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

// ── photo upload ─────────────────────────────────────────────
app.post('/api/upload-photo', upload.single('photo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const dataUrl = `data:${req.file.mimetype};base64,${b64(req.file.buffer)}`;
  res.json({ ok: true, dataUrl });
});

// ── Google Places proxy ───────────────────────────────────────
app.post('/api/places-search', async (req, res) => {
  const key = process.env.GOOGLE_MAPS_KEY;
  const { query, lat, lng, radius = 1609, type } = req.body;
  if (!key) return res.status(400).json({ error: 'GOOGLE_MAPS_KEY not configured', fallback: true });
  try {
    let url;
    if (lat && lng && type) {
      url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radius}&keyword=${encodeURIComponent(query || type)}&key=${key}`;
    } else if (lat && lng) {
      url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&location=${lat},${lng}&radius=${radius}&key=${key}`;
    } else {
      url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&key=${key}`;
    }
    const r = await fetch(url);
    const d = await r.json();
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

// ── Mapbox geocoding proxy ────────────────────────────────────
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

// ══════════════════════════════════════════════════════════════
// TEMPLATE LIBRARY
// In-memory store — swap for a DB when ready.
// ══════════════════════════════════════════════════════════════
let templateLibrary = [];

// List all templates
app.get('/api/templates', (_, res) => {
  res.json({ ok: true, templates: templateLibrary });
});

// Get single template
app.get('/api/templates/:id', (req, res) => {
  const t = templateLibrary.find(t => t.id === req.params.id);
  if (!t) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true, template: t });
});

// Update status
app.patch('/api/templates/:id/status', (req, res) => {
  const t = templateLibrary.find(t => t.id === req.params.id);
  if (!t) return res.status(404).json({ error: 'Not found' });
  t.status = req.body.status || t.status;
  t.updatedAt = new Date().toISOString();
  res.json({ ok: true, template: t });
});

// Add comment
app.post('/api/templates/:id/comments', (req, res) => {
  const t = templateLibrary.find(t => t.id === req.params.id);
  if (!t) return res.status(404).json({ error: 'Not found' });
  const comment = {
    id: `c_${Date.now()}`,
    author: req.body.author || 'Team',
    text: req.body.text,
    type: req.body.type || 'note',
    page: req.body.page || null,
    createdAt: new Date().toISOString(),
  };
  t.comments.push(comment);
  t.updatedAt = new Date().toISOString();
  res.json({ ok: true, comment });
});

// Delete template
app.delete('/api/templates/:id', (req, res) => {
  const before = templateLibrary.length;
  templateLibrary = templateLibrary.filter(t => t.id !== req.params.id);
  if (templateLibrary.length === before) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

// ── Template analyze — Option A: Claude generates HTML per page ──
// IMPORTANT: this route must be registered BEFORE /api/templates/:id
// so Express does not match "analyze" as an :id param.
app.post('/api/templates/analyze', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  req.socket.setTimeout(600000); // 10 min timeout for multi-page analysis

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
  } catch (e) { console.log('pdf2pic unavailable, using native PDF:', e.message); }

  if (pageImages.length === 0) {
    if (req.file.buffer.length > 20 * 1024 * 1024) {
      return res.status(400).json({ error: 'PDF too large for native analysis (max 20MB). Please compress and try again.' });
    }
    usedNativePdf = true;
  }

  // ── Pass 1: Global style extraction ────────────────────────
  let globalStyle = {};
  try {
    let styleContent = [];
    if (!usedNativePdf) {
      styleContent.push({ type: 'text', text: `Analyze these ${pageImages.length} pages of a CRE document template.` });
      pageImages.slice(0, 3).forEach(pg => {
        styleContent.push({ type: 'text', text: `\n--- Page ${pg.page} ---` });
        styleContent.push({ type: 'image', source: { type: 'base64', media_type: pg.mediaType, data: pg.base64 } });
      });
    } else {
      styleContent.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64(req.file.buffer) } });
    }
    styleContent.push({
      type: 'text', text: `Extract the complete design system from this CRE document template. Sample exact hex colors directly from the document — do not guess or use generic values.
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
}`,
    });

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

  const fontFamilies = [...new Set([F.heading, F.body, F.number].filter(f => f && f !== 'Georgia'))];
  const gfUrl = fontFamilies.map(f => `family=${(f || '').replace(/ /g, '+')}:wght@300;400;500;600;700`).join('&');

  // ── Pass 2: Generate HTML per page ─────────────────────────
  const PLACEHOLDER_GUIDE = `
Replace every piece of content-specific text with a placeholder tag using this exact format: {{FIELD_NAME}}
Standard field names:
  {{PROP_NAME}} {{PROP_ADDRESS}} {{PROP_CITY_STATE}} {{PROP_SF}} {{PROP_YEAR}}
  {{PROP_TYPE}} {{PROP_ZONING}} {{PROP_ACRES}} {{PROP_PARKING}} {{PROP_CLEARHEIGHT}}
  {{ASKING_PRICE}} {{PRICE_PSF}} {{CAP_RATE}} {{NOI}} {{OCCUPANCY}} {{WALT}}
  {{GPR}} {{EGI}} {{OPEX}} {{EXEC_SUMMARY}} {{PROP_DESCRIPTION}}
  {{LOCATION_OVERVIEW}} {{HIGHLIGHTS_LIST}} {{RENT_ROLL_TABLE}}
  {{BROKER_NAME}} {{BROKER_TITLE}} {{BROKER_PHONE}} {{BROKER_EMAIL}} {{BROKER_LICENSE}}
  {{FIRM_NAME}} {{DOC_TYPE}} {{PAGE_NUMBER}} {{DISCLAIMER}}
For any other data fields, invent descriptive placeholders e.g. {{MARKET_STAT_1}}, {{TENANT_1_NAME}}.
Keep decorative/structural text (column headers, "CONFIDENTIAL", divider labels) as literal text.`;

  const PAGE_HTML_PROMPT = (pageNum, total) => `You are reproducing page ${pageNum} of ${total} from a CRE document template as pixel-accurate HTML/CSS.

DESIGN SYSTEM (apply exactly — these values were sampled from the document):
- Page size: ${PS.widthIn}in x ${PS.heightIn}in
- Primary: ${C.primary || '#001a4d'} | Secondary: ${C.secondary || '#0057b8'} | Accent: ${C.accent || '#c8a96e'}
- Text: ${C.text || '#1a2332'} | Background: ${C.bg || '#ffffff'}
- Header bg: ${C.headerBg || C.primary || '#001a4d'} | Footer bg: ${C.footerBg || C.primary || '#001a4d'}
- Stat card bg: ${C.statCardBg || C.primary || '#001a4d'} | Stat card text: ${C.statCardText || '#ffffff'}
- Rule color: ${C.rule || C.secondary || '#0057b8'}
- Heading: ${F.heading || 'Playfair Display'} ${F.headingWeight || '500'} ${F.headingSizePt || 22}pt
- Body: ${F.body || 'Inter'} ${F.bodyWeight || '400'} ${F.bodySizePt || 10.5}pt
- Numbers: ${F.number || F.heading || 'Playfair Display'} ${F.numberSizePt || 18}pt
- Line height: ${F.lineHeight || 1.7} | All-caps eyebrows: ${F.useAllCaps !== false ? 'yes' : 'no'}
- Page padding: ${SP.pagePaddingIn || '0.45in 0.5in'}
- Footer height: ${SP.footerHeightPx || 28}px | Accent bar: ${SP.accentBarHeightPx || 5}px | Corner radius: ${SP.cornerRadiusPx || 4}px

FONT IMPORT — include this in your style block:
@import url('https://fonts.googleapis.com/css2?${gfUrl}&display=swap');

${PLACEHOLDER_GUIDE}

CRITICAL REQUIREMENTS:
1. Reproduce the EXACT layout of this page — same columns, photo placement, sidebar, grid proportions
2. Outer container must be exactly ${PS.widthIn}in wide and ${PS.heightIn}in tall with overflow:hidden
3. Use CSS flexbox or grid — no tables for layout structure
4. Photo/image areas: use a div with background:${C.primary || '#001a4d'}22 and a centered label (e.g. "PROPERTY PHOTO")
5. Replace all data fields with {{PLACEHOLDER}} tags
6. Include realistic placeholder content so layout proportions are visible
7. HTML must be completely self-contained — no external deps except the Google Fonts import above

Return ONLY the complete HTML document starting with <!DOCTYPE html> — no explanation, no markdown.`;

  let generatedPages = [];

  if (!usedNativePdf && pageImages.length > 0) {
    for (let i = 0; i < pageImages.length; i++) {
      const pg = pageImages[i];
      let html = null;
      let attempts = 0;
      while (attempts < 2 && !html) {
        attempts++;
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
          let raw = (d.content?.[0]?.text || '').trim();
          raw = raw.replace(/^```html?\s*/i, '').replace(/```\s*$/i, '').trim();
          if (!raw.startsWith('<!DOCTYPE') && !raw.startsWith('<html')) {
            raw = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body>${raw}</body></html>`;
          }
          html = raw;
          console.log(`Page ${pg.page} generated OK (${html.length} chars)`);
        } catch (e) {
          console.log(`Page ${pg.page} attempt ${attempts} failed: ${e.message}`);
          if (attempts < 2) await new Promise(r => setTimeout(r, 2000));
        }
      }
      generatedPages.push({
        page: pg.page,
        html: html || null,
        thumbnail: `data:image/jpeg;base64,${pg.base64}`,
        layout: null,
      });
    }
  } else {
    // Native PDF — generate pages one at a time to avoid JSON escaping issues
    // First, ask Claude how many pages the document has and what type each is
    let pageManifest = [];
    try {
      const manifestD = await claude({
        model: 'claude-sonnet-4-6',
        max_tokens: 800,
        messages: [{
          role: 'user',
          content: [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64(req.file.buffer) } },
            {
              type: 'text',
              text: `How many pages does this document have, and what is the purpose of each page?
Return ONLY valid JSON — no markdown:
[
  { "page": 1, "pageType": "cover", "description": "brief description" },
  { "page": 2, "pageType": "highlights", "description": "brief description" }
]
pageType must be one of: cover, highlights, property, financial, location, rentroll, team, disclaimer, other`,
            },
          ],
        }],
      });
      const raw = (manifestD.content?.[0]?.text || '[]').replace(/```json|```/g, '').trim();
      pageManifest = JSON.parse(raw);
    } catch (e) {
      console.log('Page manifest failed, defaulting to 6 pages:', e.message);
      pageManifest = [
        { page: 1, pageType: 'cover' },
        { page: 2, pageType: 'highlights' },
        { page: 3, pageType: 'property' },
        { page: 4, pageType: 'financial' },
        { page: 5, pageType: 'location' },
        { page: 6, pageType: 'disclaimer' },
      ];
    }

    // Cap at 10 pages to avoid runaway costs
    pageManifest = pageManifest.slice(0, 10);

    // Generate HTML for each page individually — no JSON wrapping, pure HTML output
    for (const pg of pageManifest) {
      let html = null;
      let attempts = 0;
      while (attempts < 2 && !html) {
        attempts++;
        try {
          const d = await claude({
            model: 'claude-sonnet-4-6',
            max_tokens: 4000,
            messages: [{
              role: 'user',
              content: [
                { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64(req.file.buffer) } },
                {
                  type: 'text',
                  text: `Focus only on page ${pg.page} of this document (the ${pg.pageType} page).

${PAGE_HTML_PROMPT(pg.page, pageManifest.length)}

Return ONLY the complete HTML document starting with <!DOCTYPE html> — no explanation, no markdown, no JSON wrapper.`,
                },
              ],
            }],
          });
          let raw = (d.content?.[0]?.text || '').trim();
          raw = raw.replace(/^```html?\s*/i, '').replace(/```\s*$/i, '').trim();
          if (!raw.startsWith('<!DOCTYPE') && !raw.startsWith('<html')) {
            raw = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body>${raw}</body></html>`;
          }
          html = raw;
          console.log(`Page ${pg.page} (${pg.pageType}) generated OK (${html.length} chars)`);
        } catch (e) {
          console.log(`Page ${pg.page} attempt ${attempts} failed: ${e.message}`);
          if (attempts < 2) await new Promise(r => setTimeout(r, 2000));
        }
      }
      generatedPages.push({
        page: pg.page,
        html: html || null,
        thumbnail: null,
        layout: { pageType: pg.pageType },
      });
    }

        let html = (d.content?.[0]?.text || '').trim();
        // Strip any accidental markdown fences
        html = html.replace(/^```html?\s*/i, '').replace(/```\s*$/i, '').trim();
        if (!html.startsWith('<!DOCTYPE') && !html.startsWith('<html')) {
          html = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body>${html}</body></html>`;
        }

        generatedPages.push({
          page: pg.page,
          html,
          thumbnail: null,
          layout: { pageType: pg.pageType },
        });
      } catch (e) {
        console.log(`Page ${pg.page} generation failed:`, e.message);
        // Push a placeholder so page numbering stays correct
        generatedPages.push({
          page: pg.page,
          html: `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;color:#999;}</style></head><body><p>Page ${pg.page} could not be generated.</p></body></html>`,
          thumbnail: null,
          layout: { pageType: pg.pageType },
        });
      }
    }
  }

  // ── Pass 3: Build field map ──────────────────────────────────
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

// ── Template render — populate placeholders ───────────────────
app.post('/api/templates/render', (req, res) => {
  const { templateId, data } = req.body;
  if (!templateId) return res.status(400).json({ error: 'templateId required' });

  const template = templateLibrary.find(t => t.id === templateId);
  if (!template) return res.status(404).json({ error: 'Template not found' });
  if (template.status !== 'approved') return res.status(400).json({ error: 'Template must be approved before use' });

  const sub = {
    PROP_NAME: data.propName || '',
    PROP_ADDRESS: data.propAddress || '',
    PROP_CITY_STATE: data.propCityState || '',
    PROP_SF: data.propSf || '',
    PROP_YEAR: data.propYear || '',
    PROP_TYPE: data.propType || '',
    PROP_ZONING: data.propZoning || '',
    PROP_ACRES: data.propAcres || '',
    PROP_PARKING: data.propParking || '',
    PROP_CLEARHEIGHT: data.propClearHeight || '',
    ASKING_PRICE: data.askingPrice || '',
    PRICE_PSF: data.pricePsf || '',
    CAP_RATE: data.capRate || '',
    NOI: data.noi || '',
    OCCUPANCY: data.occupancy || '',
    WALT: data.walt || '',
    GPR: data.gpr || '',
    EGI: data.egi || '',
    OPEX: data.opex || '',
    EXEC_SUMMARY: data.execSummary || '',
    PROP_DESCRIPTION: data.propDescription || '',
    LOCATION_OVERVIEW: data.locationOverview || '',
    HIGHLIGHTS_LIST: data.highlightsList || '',
    RENT_ROLL_TABLE: data.rentRollTable || '',
    BROKER_NAME: data.brokerName || '',
    BROKER_TITLE: data.brokerTitle || '',
    BROKER_PHONE: data.brokerPhone || '',
    BROKER_EMAIL: data.brokerEmail || '',
    BROKER_LICENSE: data.brokerLicense || '',
    FIRM_NAME: data.firmName || 'Colliers International',
    DOC_TYPE: data.docType || 'Offering Memorandum',
    DISCLAIMER: data.disclaimer || '',
    ...(data.extra || {}),
  };

  const populatedPages = template.pages.map((p, i) => {
    if (!p.html) return { page: p.page, html: null };
    let html = p.html;
    sub.PAGE_NUMBER = String(i + 1);
    Object.entries(sub).forEach(([key, val]) => {
      html = html.split(`{{${key}}}`).join(val);
    });
    html = html.replace(/\{\{[A-Z_0-9]+\}\}/g, '');
    return { page: p.page, html };
  });

  res.json({ ok: true, pages: populatedPages });
});

// ── Template generate — AI narrative + render ─────────────────
app.post('/api/templates/generate', async (req, res) => {
  const { templateId, prop, fin, broker, rentRoll, sections, firm, city, docType, disclaimer } = req.body;
  if (!templateId) return res.status(400).json({ error: 'templateId required' });

  const template = templateLibrary.find(t => t.id === templateId);
  if (!template) return res.status(404).json({ error: 'Template not found' });

  const fmtN = n => { const x = parseFloat(n); return isNaN(x) ? (n || '') : x.toLocaleString('en-US', { maximumFractionDigits: 0 }); };
  const fmtD = n => { const x = parseFloat(n); return (!x || isNaN(x)) ? '' : '$' + fmtN(x); };

  // Generate AI narratives
  let ai = {};
  try {
    const narrativePrompt = `You are a senior CRE broker at ${firm || 'Colliers International'} writing a ${docType || 'Offering Memorandum'} for a ${prop.propType || 'commercial'} property.
PROPERTY: ${prop.propName || ''}, ${prop.propAddress || ''}, ${prop.propCity || ''}, ${prop.propState || ''} ${prop.propZip || ''}
${prop.propSf ? fmtN(prop.propSf) + ' SF' : ''} Built ${prop.propYear || 'N/A'}, Zoning: ${prop.propZoning || 'N/A'}
Description: ${prop.propDesc || 'N/A'}
Highlights: ${prop.propHighlights || 'N/A'}
FINANCIALS: Price ${fmtD(fin.price) || 'N/A'}, NOI ${fmtD(fin.noi) || 'N/A'}, Cap ${fin.capRate || 'N/A'}%, Occupancy ${fin.occupancy || 'N/A'}%, WALT ${fin.walt || 'N/A'} yrs
RENT ROLL: ${rentRoll && rentRoll.length ? JSON.stringify(rentRoll) : 'Not provided'}
Return ONLY valid JSON:
{
  "execSummary": "2-3 paragraphs leading with strongest financial fact",
  "propDescription": "2-3 paragraphs with specific physical details",
  "locationOverview": "2 paragraphs on the local market",
  "highlightsList": "<ul><li>Highlight one with numbers</li><li>Highlight two</li><li>Highlight three</li><li>Highlight four</li><li>Highlight five</li></ul>",
  "tenantSummary": "1-2 paragraphs on tenancy"
}`;
    const nd = await claude({ model: 'claude-sonnet-4-6', max_tokens: 4000, messages: [{ role: 'user', content: narrativePrompt }] });
    ai = JSON.parse((nd.content?.[0]?.text || '{}').replace(/```json|```/g, '').trim());
  } catch (e) { console.log('Narrative generation failed:', e.message); }

  // Build rent roll HTML table
  const primaryColor = template.globalStyle?.colors?.primary || '#001a4d';
  const rentRollHtml = rentRoll && rentRoll.length ? `<table style="width:100%;border-collapse:collapse;font-size:9pt;">
    <thead><tr style="background:${primaryColor};color:#fff;">
      <th style="padding:6px 8px;text-align:left;">Tenant</th>
      <th style="padding:6px 8px;text-align:left;">Suite</th>
      <th style="padding:6px 8px;text-align:right;">SF</th>
      <th style="padding:6px 8px;text-align:left;">Lease Start</th>
      <th style="padding:6px 8px;text-align:left;">Lease End</th>
      <th style="padding:6px 8px;text-align:right;">Annual Rent</th>
      <th style="padding:6px 8px;text-align:right;">$/SF</th>
    </tr></thead><tbody>
    ${rentRoll.map((r, i) => {
      const rpsf = r.sf && r.annualRent ? '$' + (parseFloat(r.annualRent) / parseFloat(r.sf)).toFixed(2) : '—';
      return `<tr style="background:${i % 2 === 0 ? 'rgba(0,0,0,0.03)' : 'transparent'}">
        <td style="padding:5px 8px;border-bottom:1px solid #eee;">${r.tenant || '—'}</td>
        <td style="padding:5px 8px;border-bottom:1px solid #eee;">${r.suite || '—'}</td>
        <td style="padding:5px 8px;text-align:right;border-bottom:1px solid #eee;">${r.sf ? fmtN(r.sf) : '—'}</td>
        <td style="padding:5px 8px;border-bottom:1px solid #eee;">${r.leaseStart || '—'}</td>
        <td style="padding:5px 8px;border-bottom:1px solid #eee;">${r.leaseEnd || '—'}</td>
        <td style="padding:5px 8px;text-align:right;border-bottom:1px solid #eee;">${r.annualRent ? fmtD(r.annualRent) : '—'}</td>
        <td style="padding:5px 8px;text-align:right;border-bottom:1px solid #eee;">${rpsf}</td>
      </tr>`;
    }).join('')}
    </tbody></table>` : '';

  // Substitute placeholders
  const sub = {
    PROP_NAME: prop.propName || '',
    PROP_ADDRESS: prop.propAddress || '',
    PROP_CITY_STATE: `${prop.propCity || ''}, ${prop.propState || ''} ${prop.propZip || ''}`.trim(),
    PROP_SF: prop.propSf ? fmtN(prop.propSf) + ' SF' : '',
    PROP_YEAR: prop.propYear || '',
    PROP_TYPE: prop.propType || '',
    PROP_ZONING: prop.propZoning || '',
    PROP_ACRES: prop.propAcres ? prop.propAcres + ' acres' : '',
    PROP_PARKING: prop.propParking ? prop.propParking + ' spaces' : '',
    PROP_CLEARHEIGHT: prop.propClearHeight ? prop.propClearHeight + ' ft' : '',
    ASKING_PRICE: fmtD(fin.price) || '',
    PRICE_PSF: fin.ppsf ? '$' + fin.ppsf + '/SF' : '',
    CAP_RATE: fin.capRate ? fin.capRate + '%' : '',
    NOI: fmtD(fin.noi) || '',
    OCCUPANCY: fin.occupancy ? fin.occupancy + '%' : '',
    WALT: fin.walt ? fin.walt + ' years' : '',
    GPR: fmtD(fin.gpr) || '',
    EGI: fmtD(fin.egi) || '',
    OPEX: fmtD(fin.opex) || '',
    EXEC_SUMMARY: ai.execSummary || '',
    PROP_DESCRIPTION: ai.propDescription || prop.propDesc || '',
    LOCATION_OVERVIEW: ai.locationOverview || '',
    HIGHLIGHTS_LIST: ai.highlightsList || '',
    RENT_ROLL_TABLE: rentRollHtml,
    BROKER_NAME: broker.name || '',
    BROKER_TITLE: broker.title || '',
    BROKER_PHONE: broker.phone || '',
    BROKER_EMAIL: broker.email || '',
    BROKER_LICENSE: broker.license || '',
    FIRM_NAME: firm || 'Colliers International',
    DOC_TYPE: docType || 'Offering Memorandum',
    DISCLAIMER: disclaimer || '',
  };

  const populatedPages = template.pages.map((p, i) => {
    if (!p.html) return { page: p.page, html: null };
    let html = p.html;
    sub.PAGE_NUMBER = String(i + 1);
    Object.entries(sub).forEach(([key, val]) => {
      html = html.split(`{{${key}}}`).join(String(val));
    });
    html = html.replace(/\{\{[A-Z_0-9]+\}\}/g, '');
    return { page: p.page, html };
  });

  res.json({ ok: true, pages: populatedPages, aiGenerated: Object.keys(ai) });
});

// ── SPA fallback ────────────────────────────────────────────
app.get('*', (_, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log(`Colliers Design Studio running on port ${PORT}`));
