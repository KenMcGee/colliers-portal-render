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


// ── template analysis — Session 3: multi-pass vision ─────────
// Pass 1: convert PDF pages to images at high resolution
// Pass 2: send all images to Claude Vision with structured prompt
// Pass 3 (copy mode only): second Vision call to generate CSS vars
app.post('/api/analyze-template', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const mode = req.body.mode || 'inspiration';
  const isPdf = req.file.mimetype === 'application/pdf' || req.file.originalname.endsWith('.pdf');

  let pageImages = [];   // { page, base64, mediaType }
  let usedDirectPdf = false;

  // ── Pass 1: PDF → images ──────────────────────────────────
  if (isPdf) {
    try {
      const { fromBuffer } = await import('pdf2pic').catch(() => ({ fromBuffer: null }));
      if (fromBuffer) {
        // Higher resolution than Session 1 — 150dpi, wider for landscape OMs
        const convert = fromBuffer(req.file.buffer, {
          density: 150,
          format: 'jpeg',
          width: 1650,
          height: 1275,
          preserveAspectRatio: true,
          savePath: '/tmp',
          saveFilename: 'pg',
        });

        // Try up to 8 pages — cover + first 7 section pages
        for (let i = 1; i <= 8; i++) {
          try {
            const result = await convert(i, { responseType: 'buffer' });
            if (result?.buffer) {
              pageImages.push({ page: i, base64: b64(result.buffer), mediaType: 'image/jpeg' });
            }
          } catch {
            // Hit end of document
            break;
          }
        }
      }
    } catch (convErr) {
      console.log('pdf2pic unavailable:', convErr.message);
    }
  }

  // ── Build Claude Vision content ───────────────────────────
  let content = [];

  if (pageImages.length > 0) {
    content.push({
      type: 'text',
      text: `I'm sending you ${pageImages.length} rendered pages from a CRE document template. Analyze each page carefully.`,
    });
    // Send all page images, labelled
    pageImages.forEach(pg => {
      content.push({ type: 'text', text: `\n--- Page ${pg.page} ---` });
      content.push({ type: 'image', source: { type: 'base64', media_type: pg.mediaType, data: pg.base64 } });
    });
  } else if (isPdf && req.file.buffer.length < 20 * 1024 * 1024) {
    // Fall back to native PDF reading if under 20MB
    content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64(req.file.buffer) } });
    usedDirectPdf = true;
  } else {
    return res.status(400).json({
      error: 'Could not process file. Please upload a PDF under 20MB, or install pdf2pic on the server for larger files.',
    });
  }

  content.push({ type: 'text', text: buildStylePrompt(mode, pageImages.length > 0) });

  // ── Pass 2: Vision analysis ───────────────────────────────
  let analysis;
  try {
    const d = await claude({
      model: 'claude-sonnet-4-6',
      max_tokens: 5000,
      messages: [{ role: 'user', content }],
    });
    const raw = d.content?.[0]?.text || '{}';
    analysis = JSON.parse(raw.replace(/```json|```/g, '').trim());
  } catch (e) {
    return res.status(500).json({ error: 'Vision analysis failed: ' + e.message });
  }

  // ── Pass 3 (copy mode): generate CSS custom properties ────
  // A second targeted Vision call asks Claude to output the exact
  // CSS needed to reproduce colours, spacing, and typography.
  // This gets injected into the document renderer as overrides.
  let cssOverrides = null;
  if (mode === 'copy' && pageImages.length > 0) {
    try {
      const cssContent = [
        { type: 'text', text: '--- Page 1 (Cover) ---' },
        { type: 'image', source: { type: 'base64', media_type: pageImages[0].mediaType, data: pageImages[0].base64 } },
        pageImages[1] && { type: 'image', source: { type: 'base64', media_type: pageImages[1].mediaType, data: pageImages[1].base64 } },
        {
          type: 'text',
          text: `Based on these pages, generate CSS custom properties that exactly replicate the visual design.
Return ONLY a valid JSON object mapping CSS variable names to values — no other text:
{
  "--doc-primary":      "#001a4d",
  "--doc-secondary":    "#0057b8",
  "--doc-accent":       "#c8a96e",
  "--doc-text":         "#1a2332",
  "--doc-bg":           "#ffffff",
  "--doc-rule":         "#0057b8",
  "--doc-header-bg":    "#001a4d",
  "--doc-footer-bg":    "#001a4d",
  "--doc-footer-h":     "28px",
  "--doc-heading-font": "'Playfair Display', serif",
  "--doc-body-font":    "'Inter', sans-serif",
  "--doc-number-font":  "'Playfair Display', serif",
  "--doc-heading-size": "22pt",
  "--doc-body-size":    "10.5pt",
  "--doc-heading-wt":   "500",
  "--doc-line-height":  "1.7",
  "--doc-corner-r":     "4px",
  "--doc-pad-top":      "0.45in",
  "--doc-pad-right":    "0.5in",
  "--doc-pad-bottom":   "0.45in",
  "--doc-pad-left":     "0.5in",
  "--doc-accent-bar-h": "5px",
  "--doc-sidebar-w":    "2.1in",
  "--doc-stat-bg":      "#001a4d",
  "--doc-stat-text":    "#ffffff",
  "--doc-stat-accent":  "#c8a96e"
}`,
        },
      ].filter(Boolean);

      const cd = await claude({
        model: 'claude-sonnet-4-6',
        max_tokens: 1500,
        messages: [{ role: 'user', content: cssContent }],
      });
      const craw = cd.content?.[0]?.text || '{}';
      cssOverrides = JSON.parse(craw.replace(/```json|```/g, '').trim());
    } catch (e) {
      console.log('CSS override pass failed (non-fatal):', e.message);
    }
  }

  return res.json({
    ok: true,
    analysis,
    cssOverrides,
    mode,
    pagesAnalyzed: pageImages.length,
    usedDirectPdf,
  });
});



function buildStylePrompt(mode, hasImages) {
  const depth = mode === 'copy'
    ? `EXACT REPLICATION MODE: Measure this template precisely so it can be reproduced exactly. Extract specific proportions, exact hex colors sampled from the image, exact font sizes in points, exact padding amounts. Be precise — "dark blue" is unacceptable, give hex codes.`
    : `STYLE INSPIRATION MODE: Capture design language, mood, color relationships, and compositional principles. Describe the spirit and feel accurately.`;

  return `${depth}

${hasImages
  ? 'Carefully analyze each rendered page image. For each page, identify its type and extract its layout structure.'
  : 'Analyze this document carefully.'}

Return ONLY valid JSON — no markdown, no text before or after the JSON:
{
  "mode": "${mode}",
  "pageLayouts": [
    {
      "pageType": "cover",
      "layoutStructure": "full-bleed-photo|split-left-photo|split-right-photo|sidebar-right|two-column|single-column|top-band",
      "photoPosition": "full-bleed|left|right|top|inset-right|inset-left|none",
      "hasColoredHeader": true,
      "hasSidebar": false,
      "sidebarWidthPercent": 28,
      "description": "Specific layout description"
    }
  ],
  "colors": {
    "primary": "#001a4d",
    "secondary": "#0057b8",
    "accent": "#c8a96e",
    "text": "#1a2332",
    "bg": "#ffffff",
    "rule": "#0057b8",
    "headerBg": "#001a4d",
    "footerBg": "#001a4d",
    "statCardBg": "#001a4d",
    "statCardText": "#ffffff",
    "highlightBg": "#f5f0e0"
  },
  "typography": {
    "suggestedHeading": "Playfair Display",
    "suggestedBody": "Inter",
    "suggestedNumber": "Playfair Display",
    "headingWeight": "500",
    "bodyFontSizePt": 10.5,
    "headingFontSizePt": 22,
    "lineHeightBody": 1.7,
    "useAllCapsEyebrows": true,
    "useAllCapsHeadings": false
  },
  "accentElements": {
    "usesFullBleedPhotos": true,
    "usesSplitLayout": false,
    "usesColoredBands": true,
    "usesSidebarPanels": true,
    "usesLargeStatCards": true,
    "usesPullQuotes": true,
    "usesDecorativeBars": true,
    "cornerRadiusPx": 4,
    "photoStyle": "full-bleed|inset|bordered|rounded",
    "headerStyle": "dark-overlay|colored-band|split|minimal|top-band",
    "sectionDividerStyle": "colored-rule|thin-rule|colored-band|whitespace|decorative-dots",
    "statCardStyle": "dark-filled|light-outlined|accent-filled|transparent-bordered"
  },
  "coverPage": {
    "photoTreatment": "full-bleed-dark-overlay|split-left-photo|split-right-photo|top-band|inset",
    "photoOpacity": 0.55,
    "titleFontSizePt": 36,
    "titlePosition": "bottom-left|bottom-right|center|top-left",
    "statsPosition": "bottom-strip|right-column|none",
    "accentBarPosition": "bottom|top|none",
    "accentBarThicknessPx": 5
  },
  "designLanguage": {
    "density": "dense|balanced|airy",
    "formality": "luxury|professional|modern|minimal",
    "photoEmphasis": "dominant|balanced|subtle",
    "typographyContrast": "high|medium|low",
    "overallMood": "one sentence"
  },
  "cssVariables": {
    "pagePaddingTopIn": 0.45,
    "pagePaddingRightIn": 0.5,
    "pagePaddingBottomIn": 0.45,
    "pagePaddingLeftIn": 0.5,
    "lineHeightBody": 1.7,
    "tableRowHeightPt": 20
  },
  "aesthetic": "One sentence describing the visual personality of this document"
}`;
}


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

// ── Template analyze: robust multi-path PDF analysis ─────────
// Strategy:
//   Path A (preferred): pdf2pic converts pages → images → Claude Vision
//   Path B (fallback):  Send PDF natively to Claude — works without system deps
// Both paths produce the same analysis JSON and CSS overrides.
// Page thumbnails are only available on Path A.
app.post('/api/templates/analyze', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });

  const name = req.body.name || req.file.originalname.replace(/\.pdf$/i, '');
  const tags = req.body.tags ? JSON.parse(req.body.tags) : [];

  // ── Attempt Path A: pdf2pic → page images ──────────────────
  let pageImages = [];   // [{ page, base64, mediaType }]
  let usedNativePdf = false;

  try {
    const { fromBuffer } = await import('pdf2pic').catch(() => ({ fromBuffer: null }));
    if (fromBuffer) {
      const convert = fromBuffer(req.file.buffer, {
        density: 150, format: 'jpeg',
        width: 1650, height: 1275,
        preserveAspectRatio: true,
        savePath: '/tmp', saveFilename: 'tpl',
      });
      for (let i = 1; i <= 10; i++) {
        try {
          const result = await convert(i, { responseType: 'buffer' });
          if (result?.buffer) {
            pageImages.push({ page: i, base64: b64(result.buffer), mediaType: 'image/jpeg' });
          }
        } catch { break; }
      }
    }
  } catch (e) {
    console.log('pdf2pic unavailable, falling back to native PDF:', e.message);
  }

  // ── Path B: native PDF (no page images, but Claude reads full doc) ─
  if (pageImages.length === 0) {
    if (req.file.buffer.length > 20 * 1024 * 1024) {
      return res.status(400).json({ error: 'PDF too large for native analysis (max 20MB). Please compress the PDF and try again.' });
    }
    usedNativePdf = true;
  }

  // ── Build vision content ────────────────────────────────────
  let content = [];

  if (!usedNativePdf) {
    // Path A: send each page image
    content.push({ type: 'text', text: `I'm sending you ${pageImages.length} rendered pages from a CRE document template. Analyze each page carefully.` });
    pageImages.forEach(pg => {
      content.push({ type: 'text', text: `\n--- Page ${pg.page} ---` });
      content.push({ type: 'image', source: { type: 'base64', media_type: pg.mediaType, data: pg.base64 } });
    });
  } else {
    // Path B: send the raw PDF
    content.push({
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: b64(req.file.buffer) },
    });
    content.push({ type: 'text', text: 'Analyze this CRE document template carefully. Examine every page — cover, interior sections, financial tables, and footer.' });
  }

  content.push({ type: 'text', text: buildStylePrompt('copy', !usedNativePdf) });

  // ── Pass 1: Full style analysis ─────────────────────────────
  let analysis;
  try {
    const d = await claude({
      model: 'claude-sonnet-4-6',
      max_tokens: 5000,
      messages: [{ role: 'user', content }],
    });
    const raw = d.content?.[0]?.text || '{}';
    analysis = JSON.parse(raw.replace(/```json|```/g, '').trim());
  } catch (e) {
    return res.status(500).json({ error: 'Vision analysis failed: ' + e.message });
  }

  // ── Pass 2: CSS variable extraction ────────────────────────
  // Run this pass whether we used images or native PDF
  let cssOverrides = {};
  try {
    let cssContent = [];

    if (!usedNativePdf && pageImages.length > 0) {
      // Use first two page images for precise color sampling
      cssContent.push({ type: 'text', text: 'Here are the first pages of the template:' });
      cssContent.push({ type: 'image', source: { type: 'base64', media_type: pageImages[0].mediaType, data: pageImages[0].base64 } });
      if (pageImages[1]) {
        cssContent.push({ type: 'image', source: { type: 'base64', media_type: pageImages[1].mediaType, data: pageImages[1].base64 } });
      }
    } else {
      // Native PDF — re-send for CSS extraction
      cssContent.push({
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: b64(req.file.buffer) },
      });
    }

    cssContent.push({
      type: 'text',
      text: `Based on this template, generate CSS custom properties that exactly replicate its visual design.
Sample colors directly from the document — do not guess or use generic values.
Return ONLY a valid JSON object, no markdown, no explanation:
{
  "--doc-primary": "#001a4d",
  "--doc-secondary": "#0057b8",
  "--doc-accent": "#c8a96e",
  "--doc-text": "#1a2332",
  "--doc-bg": "#ffffff",
  "--doc-rule": "#0057b8",
  "--doc-header-bg": "#001a4d",
  "--doc-footer-bg": "#001a4d",
  "--doc-footer-h": "28px",
  "--doc-heading-font": "'Playfair Display', serif",
  "--doc-body-font": "'Inter', sans-serif",
  "--doc-number-font": "'Playfair Display', serif",
  "--doc-heading-size": "22pt",
  "--doc-body-size": "10.5pt",
  "--doc-heading-wt": "500",
  "--doc-line-height": "1.7",
  "--doc-corner-r": "4px",
  "--doc-pad-top": "0.45in",
  "--doc-pad-right": "0.5in",
  "--doc-pad-bottom": "0.45in",
  "--doc-pad-left": "0.5in",
  "--doc-accent-bar-h": "5px",
  "--doc-sidebar-w": "2.1in",
  "--doc-stat-bg": "#001a4d",
  "--doc-stat-text": "#ffffff",
  "--doc-stat-accent": "#c8a96e"
}`,
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

// ── SPA fallback ────────────────────────────────────────────
app.get('*', (_, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log(`Colliers Design Studio running on port ${PORT}`));
