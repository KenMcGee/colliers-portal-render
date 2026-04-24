# Colliers Denver Design Studio v5
## Deploying to Render

---

### Why Render instead of Railway
Render has a permanent free tier for web services, no credit card required,
and handles Node.js Express servers with file uploads natively.
The 50MB upload limit in server.js works without any extra configuration.

---

### One-time setup (15 minutes)

**Step 1 — Push to GitHub**
Make sure your repository contains these files at the root:
  server.js
  package.json
  public/
    index.html
    styles.css
    app.js

**Step 2 — Create a Render account**
Go to https://render.com and sign up with your GitHub account.

**Step 3 — Create a new Web Service**
1. Click "New +" → "Web Service"
2. Connect your GitHub repository
3. Configure the service:
   - Name: colliers-design-studio (or anything you like)
   - Region: US West (Oregon) or closest to you
   - Branch: main
   - Runtime: Node
   - Build Command: npm install
   - Start Command: node server.js
   - Instance Type: Free

**Step 4 — Set environment variables**
In your Render service → "Environment" tab, add:

  Key: ANTHROPIC_API_KEY
  Value: sk-ant-api03-... (your Anthropic API key)

  Key: MAPBOX_TOKEN
  Value: pk.eyJ1... (your Mapbox public token — get at mapbox.com)

  Key: GOOGLE_MAPS_KEY (optional — for Google Places amenity search)
  Value: your Google Maps API key

**Step 5 — Deploy**
Click "Create Web Service". Render will:
1. Clone your repo
2. Run npm install
3. Start node server.js
4. Give you a URL like: https://colliers-design-studio.onrender.com

First deploy takes 3-5 minutes. Subsequent deploys are automatic
whenever you push to GitHub.

---

### Getting API keys

**Anthropic (Claude AI)**
1. Go to https://console.anthropic.com
2. Sign in → API Keys → Create Key
3. Copy the sk-ant-api03-... value

**Mapbox**
1. Go to https://mapbox.com and create a free account
2. Go to Account → Access Tokens
3. Copy the Default Public Token (starts with pk.eyJ1...)
Free tier: 50,000 map loads/month — more than enough

**Google Maps (optional)**
1. Go to https://console.cloud.google.com
2. Enable "Places API" and "Maps JavaScript API"
3. Create an API key under Credentials
Currently used for server-side Places search fallback only.

---

### Render vs Railway differences
- Render free tier: services spin down after 15 min of inactivity
  (first request after idle takes ~30 seconds to wake up)
- Railway free tier: $5/month credit, no spin-down
- Both support the same server.js without any code changes
- The railway.json file is only used by Railway — Render ignores it

---

### After deploying

1. Visit your Render URL
2. Go to Settings → click "Test Connection"
3. You should see: "✓ All systems working"
4. If Mapbox token is missing, maps won't load but everything else works

---

### Updating the app

Push any changes to GitHub → Render auto-redeploys within 60 seconds.
You can also trigger a manual deploy from the Render dashboard.

---

### Troubleshooting

"Cannot reach server" in the connection test:
→ Service may still be starting up. Wait 60 seconds and try again.

"ANTHROPIC_API_KEY not set":
→ Go to Render → your service → Environment → add the key → Save
→ Render will auto-redeploy after saving environment variables.

"Mapbox token not configured":
→ Add MAPBOX_TOKEN to Render environment variables.
→ Get a free token at https://mapbox.com

PDF template analysis fails on large files:
→ Render free tier has 512MB RAM. Files over ~20MB may cause memory
   issues during PDF-to-image conversion. Upgrade to Starter ($7/mo)
   for 1GB RAM if needed.

File uploads failing:
→ Render's free tier has no persistent disk. Files are handled
   in-memory (multer memoryStorage) which is correct for this app.
   Do NOT add disk storage — it's not needed.
