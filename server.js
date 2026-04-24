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

// ── template analysis (PDF → images → Claude Vision) ────────
app.post('/api/analyze-template', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const mode = req.body.mode || 'inspiration';
  const isPdf = req.file.mimetype === 'application/pdf' || req.file.originalname.endsWith('.pdf');

  let content = [];

  if (isPdf) {
    try {
      // Convert PDF pages to images using sharp + pdf2pic if available
      const { fromBuffer } = await import('pdf2pic').catch(() => ({ fromBuffer: null }));
      if (fromBuffer) {
        const convert = fromBuffer(req.file.buffer, { density: 120, format: 'jpeg', width: 1400, height: 1050, preserveAspectRatio: true, savePath: '/tmp', saveFilename: 'pg' });
        for (let i = 1; i <= 4; i++) {
          try {
            const r = await convert(i, { responseType: 'buffer' });
            if (r?.buffer) content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64(r.buffer) } });
          } catch { break; }
        }
      }
    } catch { /* fall through to direct PDF */ }

    if (content.length === 0) {
      // Send PDF directly — Claude can read PDFs natively
      content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64(req.file.buffer) } });
    }
  }

  content.push({ type: 'text', text: buildStylePrompt(mode, content.length > 0 && content[0].type === 'image') });

  try {
    const d = await claude({ model: 'claude-sonnet-4-6', max_tokens: 4000, messages: [{ role: 'user', content }] });
    const raw = d.content?.[0]?.text || '{}';
    const analysis = JSON.parse(raw.replace(/```json|```/g, '').trim());
    res.json({ ok: true, analysis, mode, pagesAnalyzed: content.filter(c => c.type === 'image').length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

function buildStylePrompt(mode, hasImages) {
  const depth = mode === 'copy'
    ? 'EXACT REPLICATION: Measure precise proportions, colors, font sizes. Goal: reproduce this layout exactly.'
    : 'STYLE INSPIRATION: Capture design language, mood, palette. Goal: create similar-feeling documents.';
  return `${depth}
${hasImages ? 'Analyze these rendered page images.' : 'Analyze this document.'}
Return ONLY valid JSON — no markdown, no other text:
{
  "mode":"${mode}",
  "pageLayouts":[{"pageType":"cover|highlights|property|financials|location|team","layoutStructure":"full-bleed-photo|split-left-photo|split-right-photo|sidebar-right|two-column|single-column","headerHeightPercent":0,"photoAreaPercent":0,"photoPosition":"full-bleed|left|right|top|inset-right|none","hasColoredHeader":true,"hasSidebar":false,"sidebarWidthPercent":25,"description":""}],
  "colors":{"primary":"#001a4d","secondary":"#0057b8","accent":"#c8a96e","text":"#1a2332","bg":"#ffffff","rule":"#0057b8","headerBg":"#001a4d","footerBg":"#001a4d","statCardBg":"#001a4d"},
  "typography":{"suggestedHeading":"Playfair Display","suggestedBody":"Inter","suggestedNumber":"Playfair Display","headingWeight":"500","bodyFontSizePt":10,"headingFontSizePt":22,"useAllCapsEyebrows":true},
  "accentElements":{"usesFullBleedPhotos":true,"usesSplitLayout":false,"usesColoredBands":true,"usesSidebarPanels":true,"usesLargeStatCards":true,"usesPullQuotes":true,"usesDecorativeBars":true,"cornerRadiusPx":4,"photoStyle":"full-bleed","headerStyle":"dark-overlay","sectionDividerStyle":"colored-rule","statCardStyle":"dark-filled"},
  "coverPage":{"photoTreatment":"full-bleed-dark-overlay","photoOpacity":0.55,"titleFontSizePt":36,"titlePosition":"bottom-left","statsPosition":"bottom-strip","accentBarPosition":"bottom","accentBarThicknessPx":5},
  "designLanguage":{"density":"balanced","formality":"professional","photoEmphasis":"balanced","typographyContrast":"high","overallMood":""},
  "cssVariables":{"pagePaddingTopIn":0.45,"pagePaddingRightIn":0.5,"pagePaddingBottomIn":0.45,"pagePaddingLeftIn":0.5},
  "aesthetic":""
}`;
}

// ── photo upload (broker headshots) ─────────────────────────
app.post('/api/upload-photo', upload.single('photo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const dataUrl = `data:${req.file.mimetype};base64,${b64(req.file.buffer)}`;
  res.json({ ok: true, dataUrl });
});

// ── Google Places proxy (keeps API key server-side) ──────────
app.post('/api/places-search', async (req, res) => {
  const key = process.env.GOOGLE_MAPS_KEY;
  const { query, location, radius = 1609 } = req.body;
  if (!key) return res.status(400).json({ error: 'GOOGLE_MAPS_KEY not configured' });
  try {
    const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&location=${location}&radius=${radius}&key=${key}`;
    const r = await fetch(url);
    const d = await r.json();
    res.json(d);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── SPA fallback ────────────────────────────────────────────
app.get('*', (_, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log(`Colliers Design Studio running on port ${PORT}`));
