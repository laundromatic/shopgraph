/**
 * Vercel serverless function wrapper for the Express MCP server.
 * Routes all traffic through this single function.
 *
 * Vercel compiles api/*.ts separately, so we import from src/ directly.
 * Vercel's Node.js runtime handles TypeScript compilation for api/ files.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import express from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer } from '../src/server.js';
import { EnrichmentCache } from '../src/cache.js';
import { PaymentManager } from '../src/payments.js';

const app = express();
app.use(express.json());

const cache = new EnrichmentCache();

function getPayments() {
  return new PaymentManager(
    process.env.STRIPE_SECRET_KEY || process.env.STRIPE_TEST_SECRET_KEY
  );
}

// ---------------------------------------------------------------------------
// HTML Pages
// ---------------------------------------------------------------------------

const pageShell = (title: string, body: string, meta?: string) => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Google+Sans+Flex:opsz,wght@6..144,1..1000&display=swap" rel="stylesheet"><link href="https://fonts.googleapis.com/css2?family=Google+Sans+Code&display=swap" rel="stylesheet"><meta name="viewport" content="width=device-width, initial-scale=1">
${meta || ''}
<title>${title}</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{background:#ffffff;color:#202124;font-family:'Google Sans Flex','Google Sans','Segoe UI',system-ui,-apple-system,sans-serif;line-height:1.7;-webkit-font-smoothing:antialiased}
a{color:#1a73e8;text-decoration:none}
a:hover{text-decoration:underline}
code,pre{font-family:'Google Sans Code','Google Sans Mono','SF Mono',monospace}
code{background:#f1f3f4;padding:2px 8px;border-radius:4px;font-size:.85em;color:#202124}
pre{background:#1e1e2e;color:#cdd6f4;padding:20px 24px;border-radius:12px;overflow-x:auto;font-size:.85em;line-height:1.6;border:1px solid #dadce0}
.container{max-width:1200px;margin:0 auto;padding:0 24px}
h1{font-size:3.2em;font-weight:700;letter-spacing:-.03em;color:#202124;line-height:1.1}
h2{font-size:1.6em;font-weight:600;color:#202124;margin-bottom:16px}
h3{font-size:1.1em;font-weight:600;color:#202124;margin-bottom:8px}
p{color:#5f6368;margin-bottom:12px;font-size:1.05em}
li{color:#5f6368;margin-bottom:6px}
ul,ol{padding-left:24px}

/* Navigation */
.nav{padding:16px 0;border-bottom:1px solid #dadce0}
.nav-inner{display:flex;align-items:center;justify-content:space-between;max-width:1200px;margin:0 auto;padding:0 24px}
.nav-logo{font-size:1.2em;font-weight:600;color:#202124;display:flex;align-items:center;gap:8px}
.nav-logo span{color:#5f6368;font-weight:400;font-size:.85em}
.nav-links{display:flex;gap:24px;align-items:center}
.nav-links a{color:#5f6368;font-size:.9em;font-weight:500}
.nav-links a:hover{color:#202124;text-decoration:none}

/* Hero */
.hero{position:relative;padding:100px 0 80px;overflow:hidden;text-align:center}
.hero-blob{position:absolute;width:600px;height:600px;border-radius:50%;filter:blur(120px);opacity:.35;pointer-events:none}
.hero-blob-1{background:radial-gradient(circle,#4285f4,transparent 70%);top:-200px;right:-100px}
.hero-blob-2{background:radial-gradient(circle,#34a853,transparent 70%);bottom:-200px;left:-100px}
.hero-blob-3{background:radial-gradient(circle,#fbbc04,transparent 70%);top:50%;left:50%;transform:translate(-50%,-50%)}
.hero h1{font-size:3.6em;margin-bottom:16px;position:relative}
.hero-sub{font-size:1.25em;color:#5f6368;max-width:640px;margin:0 auto 36px;line-height:1.6;position:relative}
.hero-buttons{display:flex;gap:12px;justify-content:center;position:relative;flex-wrap:wrap}
.btn{display:inline-flex;align-items:center;gap:8px;padding:12px 28px;border-radius:8px;font-size:.95em;font-weight:500;transition:all .2s}
.btn-primary{background:#1a73e8;color:#fff;box-shadow:0 1px 3px rgba(26,115,232,.3)}
.btn-primary:hover{background:#1765cc;text-decoration:none;box-shadow:0 2px 8px rgba(26,115,232,.35)}
.btn-outline{background:#fff;color:#1a73e8;border:1px solid #dadce0}
.btn-outline:hover{background:#f8f9fa;border-color:#1a73e8;text-decoration:none}

/* Sections */
.section{padding:72px 0}
.section-alt{background:#f8f9fa}
.section-header{text-align:center;margin-bottom:48px}
.section-header p{max-width:640px;margin:0 auto;font-size:1.1em}

/* Transformation visual */
.transform-visual{display:grid;grid-template-columns:1fr auto 1fr;gap:24px;align-items:center;margin:40px 0}
.transform-card{background:#fff;border:1px solid #dadce0;border-radius:12px;padding:24px;box-shadow:0 1px 4px rgba(60,64,67,.15)}
.transform-card h3{margin-bottom:12px}
.transform-card pre{font-size:.8em;margin:0}
.transform-arrow{font-size:2em;color:#1a73e8;font-weight:700;text-align:center}
.transform-label{font-size:.75em;color:#5f6368;text-align:center;display:block;margin-top:4px}
@media(max-width:768px){
  .transform-visual{grid-template-columns:1fr;gap:16px}
  .transform-arrow{transform:rotate(90deg)}
}

/* Position cards */
.position-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:24px}
.position-card{background:#fff;border:1px solid #dadce0;border-radius:12px;padding:20px;text-align:center}
.position-card .emoji{font-size:1.6em;margin-bottom:8px}
.position-card strong{display:block;color:#202124;margin-bottom:4px}
.position-card span{font-size:.85em;color:#5f6368}
@media(max-width:768px){.position-grid{grid-template-columns:1fr}}

/* Tool cards */
.tools-grid{display:grid;grid-template-columns:1fr 1fr;gap:24px}
.tool-card{background:#fff;border:1px solid #dadce0;border-radius:12px;padding:28px;box-shadow:0 1px 4px rgba(60,64,67,.15);position:relative;overflow:hidden}
.tool-card::before{content:'';position:absolute;top:0;left:0;right:0;height:3px}
.tool-card:first-child::before{background:linear-gradient(90deg,#4285f4,#34a853)}
.tool-card:last-child::before{background:linear-gradient(90deg,#fbbc04,#ea4335)}
.tool-name{font-size:1.05em;font-weight:600;font-family:'Google Sans Code','Google Sans Mono','SF Mono',monospace;color:#202124;margin-bottom:8px}
.tool-desc{color:#5f6368;font-size:.95em;margin-bottom:16px}
.tool-price{font-size:2em;font-weight:700;color:#1a73e8}
.tool-price-unit{font-size:.4em;color:#5f6368;font-weight:400;vertical-align:middle}
.tool-badge{display:inline-block;background:#e8f0fe;color:#1a73e8;padding:4px 12px;border-radius:20px;font-size:.8em;font-weight:500;margin-top:12px}
@media(max-width:768px){.tools-grid{grid-template-columns:1fr}}

/* Steps */
.steps-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:32px;margin-top:32px}
.step{text-align:center}
.step-number{width:48px;height:48px;background:#e8f0fe;color:#1a73e8;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:1.2em;font-weight:700;margin-bottom:16px}
.step h3{margin-bottom:8px}
.step p{font-size:.95em}
.step-connector{display:none}
@media(max-width:768px){.steps-grid{grid-template-columns:1fr}}

/* Data fields */
.data-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:24px}
.data-field{background:#fff;border:1px solid #dadce0;border-radius:8px;padding:14px 18px;display:flex;align-items:center;gap:10px}
.data-field .icon{font-size:1.1em}
.data-field .label{font-weight:500;color:#202124;font-size:.9em}
.data-field .meta{font-size:.75em;color:#5f6368;display:block}
@media(max-width:768px){.data-grid{grid-template-columns:1fr}}

/* Integration */
.integration-block{background:#fff;border:1px solid #dadce0;border-radius:12px;padding:32px;box-shadow:0 1px 4px rgba(60,64,67,.15);max-width:720px;margin:0 auto}
.integration-block pre{margin:20px 0 0}

/* Cache note */
.cache-note{display:flex;align-items:flex-start;gap:12px;background:#e8f0fe;border-radius:12px;padding:20px 24px;margin-top:24px;max-width:720px;margin-left:auto;margin-right:auto}
.cache-note .icon{font-size:1.3em;flex-shrink:0}
.cache-note p{margin:0;font-size:.95em;color:#202124}

/* Footer */
.footer-section{border-top:1px solid #dadce0;padding:32px 0 32px;margin-top:0}
.footer-inner{max-width:1200px;margin:0 auto;padding:0 24px;display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:32px}
.footer-brand{max-width:300px}
.footer-brand strong{color:#202124;font-size:1.05em;display:block;margin-bottom:8px}
.footer-brand p{font-size:.85em;color:#5f6368;margin:0}
.footer-links{display:flex;gap:48px}
.footer-col h4{font-size:.85em;font-weight:600;color:#202124;margin-bottom:12px;text-transform:uppercase;letter-spacing:.05em}
.footer-col a{display:block;color:#5f6368;font-size:.9em;margin-bottom:8px}
.footer-col a:hover{color:#1a73e8}
.footer-bottom{text-align:center;color:#5f6368;font-size:.8em;margin-top:32px;padding-top:24px;border-top:1px solid #dadce0}
@media(max-width:768px){
  .footer-inner{flex-direction:column;align-items:center;text-align:center}
  .footer-links{flex-direction:column;gap:24px}
}

/* Gradient accent line */
.gradient-line{height:3px;background:linear-gradient(90deg,#4285f4,#34a853,#fbbc04,#ea4335);border-radius:2px;margin:40px auto;max-width:200px}

/* Back link for subpages */
.back-link{display:inline-flex;align-items:center;gap:6px;color:#5f6368;font-size:.9em;margin-bottom:24px}
.back-link:hover{color:#1a73e8;text-decoration:none}

/* Legal pages */
.legal-content{max-width:720px;margin:0 auto;padding:48px 24px 64px}
.legal-content h1{font-size:2.2em;margin-bottom:8px}
.legal-content h2{font-size:1.2em;margin-top:36px;margin-bottom:12px}
.legal-content p,.legal-content li{font-size:.95em}
.legal-date{color:#5f6368;font-size:.9em;margin-bottom:32px}
</style>
</head>
<body>
${body}
</body>
</html>`;

// Shared nav
const nav = `<nav class="nav">
  <div class="nav-inner">
    <a href="/" class="nav-logo">ShopGraph</a>
    <div class="nav-links">
      <a href="https://github.com/laundromatic/shopgraph">GitHub</a>
      <a href="/tos">Terms</a>
      <a href="/privacy">Privacy</a>
      <a href="/health">Status</a>
    </div>
  </div>
</nav>`;

// Shared footer
const footer = `<footer class="footer-section">
  <div class="footer-inner">
    <div class="footer-brand">
      <strong>ShopGraph</strong>
      <p>Structured product data for AI agents. Built by Krishna Brown.</p>
    </div>
    <div class="footer-links">
      <div class="footer-col">
        <h4>Product</h4>
        <a href="https://github.com/laundromatic/shopgraph">GitHub</a>
        <a href="/mcp">MCP Endpoint</a>
        <a href="/health">Health Check</a>
      </div>
      <div class="footer-col">
        <h4>Legal</h4>
        <a href="/tos">Terms of Service</a>
        <a href="/privacy">Privacy Policy</a>
      </div>
      <div class="footer-col">
        <h4>Contact</h4>
        <a href="mailto:hi@kb.computer">hi@kb.computer</a>
      </div>
    </div>
  </div>
  <div class="footer-bottom">
    Krishna Brown &middot; Los Angeles, CA &middot; Apache 2.0
  </div>
</footer>`;

// ---- Landing Page ----
const landingHTML = pageShell('ShopGraph — Structured Product Data for AI Agents', `
${nav}

<!-- Hero -->
<section class="hero">
  <div class="hero-blob hero-blob-1"></div>
  <div class="hero-blob hero-blob-2"></div>
  <div class="hero-blob hero-blob-3"></div>
  <div class="container">
    <h1>ShopGraph</h1>
    <p class="hero-sub">Structured product data for AI agents. Product data where platform APIs don't reach.</p>
    <div class="hero-buttons">
      <a class="btn btn-outline" href="https://github.com/laundromatic/shopgraph">View on GitHub</a>
      <a class="btn btn-primary" href="/mcp">MCP Endpoint</a>
    </div>
  </div>
</section>

<!-- What It Does -->
<section class="section">
  <div class="container">
    <div class="section-header">
      <h2>What It Does</h2>
      <p>AI shopping agents need structured product data. ShopGraph extracts it from any page on the web.</p>
    </div>

    <div class="transform-visual">
      <div class="transform-card">
        <h3>Raw HTML</h3>
        <pre>&lt;div class="product"&gt;
  &lt;span&gt;Sony WH-1000XM5&lt;/span&gt;
  &lt;span class="price"&gt;$348&lt;/span&gt;
  ...hundreds more lines...
&lt;/div&gt;</pre>
      </div>
      <div class="transform-arrow">
        &rarr;
        <span class="transform-label">ShopGraph</span>
      </div>
      <div class="transform-card">
        <h3>Structured JSON</h3>
        <pre>{
  "name": "Sony WH-1000XM5",
  "brand": "Sony",
  "price": 348.00,
  "currency": "USD",
  "availability": "InStock",
  "confidence": { "overall": 0.95 }
}</pre>
      </div>
    </div>

    <div class="position-grid">
      <div class="position-card">
        <div class="emoji">🟢</div>
        <strong>Shopify Catalog</strong>
        <span>Covers Shopify merchants</span>
      </div>
      <div class="position-card">
        <div class="emoji">🔵</div>
        <strong>Google UCP</strong>
        <span>Covers Google-indexed merchants</span>
      </div>
      <div class="position-card">
        <div class="emoji">🌐</div>
        <strong>ShopGraph</strong>
        <span>Covers the open web</span>
      </div>
    </div>
  </div>
</section>

<!-- Tools -->
<section class="section section-alt">
  <div class="container">
    <div class="section-header">
      <h2>Tools</h2>
      <p>Two extraction modes, priced by complexity.</p>
    </div>

    <div class="tools-grid">
      <div class="tool-card">
        <div class="tool-name">enrich_product</div>
        <p class="tool-desc">Full extraction with LLM fallback. Schema.org first, Gemini when markup is missing. All attributes, confidence scores, and images.</p>
        <div class="tool-price">$0.02 <span class="tool-price-unit">/ call</span></div>
        <div class="tool-badge">Full extraction</div>
      </div>
      <div class="tool-card">
        <div class="tool-name">enrich_basic</div>
        <p class="tool-desc">Schema.org and meta-tag extraction only. Fast, no LLM. Best for pages with good structured markup.</p>
        <div class="tool-price">$0.01 <span class="tool-price-unit">/ call</span></div>
        <div class="tool-badge">Markup only</div>
      </div>
    </div>

    <div class="cache-note">
      <div class="icon">&#x2728;</div>
      <p><strong>Cached results (within 24 hours) are free.</strong> Failed extractions are not charged.</p>
    </div>
  </div>
</section>

<!-- How It Works -->
<section class="section">
  <div class="container">
    <div class="section-header">
      <h2>How It Works</h2>
    </div>

    <div class="steps-grid">
      <div class="step">
        <div class="step-number">1</div>
        <h3>Send a URL</h3>
        <p>Your agent sends any product URL to ShopGraph via MCP.</p>
      </div>
      <div class="step">
        <div class="step-number">2</div>
        <h3>Extract Data</h3>
        <p>Schema.org parsing first. If markup is missing, Gemini LLM extracts from raw page content.</p>
      </div>
      <div class="step">
        <div class="step-number">3</div>
        <h3>Get Structured JSON</h3>
        <p>Clean data with confidence scores. Cached for 24 hours for free repeat access.</p>
      </div>
    </div>
  </div>
</section>

<!-- Extracted Data -->

<!-- Tested & Verified -->
<section class="section">
  <div class="container">
    <div class="section-header">
      <h2>Tested Across 95 Real Product Pages</h2>
      <p>Validated against Shopify stores, big retailers, DTC brands, fashion, electronics, and specialty retailers.</p>
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:24px;justify-content:center;margin:32px 0">
      <div style="text-align:center;padding:24px 32px;background:#f8f9fa;border-radius:12px;min-width:140px">
        <div style="font-size:2.2em;font-weight:700;color:#1a73e8">89%</div>
        <div style="font-size:0.85em;color:#5f6368;margin-top:4px">Success Rate</div>
      </div>
      <div style="text-align:center;padding:24px 32px;background:#f8f9fa;border-radius:12px;min-width:140px">
        <div style="font-size:2.2em;font-weight:700;color:#34a853">100%</div>
        <div style="font-size:0.85em;color:#5f6368;margin-top:4px">Accuracy (Verified)</div>
      </div>
      <div style="text-align:center;padding:24px 32px;background:#f8f9fa;border-radius:12px;min-width:140px">
        <div style="font-size:2.2em;font-weight:700;color:#202124">0.81</div>
        <div style="font-size:0.85em;color:#5f6368;margin-top:4px">Avg Confidence</div>
      </div>
      <div style="text-align:center;padding:24px 32px;background:#f8f9fa;border-radius:12px;min-width:140px">
        <div style="font-size:2.2em;font-weight:700;color:#ea4335">64</div>
        <div style="font-size:0.85em;color:#5f6368;margin-top:4px">Automated Tests</div>
      </div>
    </div>
    <p style="text-align:center;color:#5f6368;font-size:0.9em;max-width:600px;margin:0 auto">Schema.org path: 0.95 confidence, near-instant. LLM fallback: 0.7+ confidence, 7-18s. Sites with aggressive bot protection may return limited results.</p>
  </div>
</section>
<section class="section section-alt">
  <div class="container">
    <div class="section-header">
      <h2>Extracted Data</h2>
      <p>Every field includes a confidence score so your agent knows how much to trust it.</p>
    </div>

    <div class="data-grid">
      <div class="data-field"><span class="icon">🏷️</span><div><span class="label">name</span><span class="meta">Product title</span></div></div>
      <div class="data-field"><span class="icon">🏢</span><div><span class="label">brand</span><span class="meta">Manufacturer</span></div></div>
      <div class="data-field"><span class="icon">💰</span><div><span class="label">price</span><span class="meta">Current price + currency</span></div></div>
      <div class="data-field"><span class="icon">📦</span><div><span class="label">availability</span><span class="meta">InStock / OutOfStock</span></div></div>
      <div class="data-field"><span class="icon">📂</span><div><span class="label">categories</span><span class="meta">Product taxonomy</span></div></div>
      <div class="data-field"><span class="icon">🖼️</span><div><span class="label">images</span><span class="meta">Product image URLs</span></div></div>
      <div class="data-field"><span class="icon">🎨</span><div><span class="label">colors</span><span class="meta">Available colors</span></div></div>
      <div class="data-field"><span class="icon">🧵</span><div><span class="label">materials</span><span class="meta">Fabric, metal, etc.</span></div></div>
      <div class="data-field"><span class="icon">📐</span><div><span class="label">dimensions</span><span class="meta">Size / measurements</span></div></div>
    </div>
  </div>
</section>

<!-- Integration -->

<!-- Works With -->
<section class="section" style="background:#f8f9fa">
  <div class="container">
    <div class="section-header">
      <h2>Works With</h2>
      <p>Any MCP-compatible client can connect to ShopGraph.</p>
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:12px;justify-content:center;max-width:800px;margin:0 auto">
      <span style="display:inline-flex;align-items:center;gap:8px;padding:10px 20px;background:#fff;border:1px solid #dadce0;border-radius:40px;font-size:0.95em;font-weight:500;color:#202124">✦ Claude</span>
      <span style="display:inline-flex;align-items:center;gap:8px;padding:10px 20px;background:#fff;border:1px solid #dadce0;border-radius:40px;font-size:0.95em;font-weight:500;color:#202124">✦ Claude Code</span>
      <span style="display:inline-flex;align-items:center;gap:8px;padding:10px 20px;background:#fff;border:1px solid #dadce0;border-radius:40px;font-size:0.95em;font-weight:500;color:#202124">⚡ Cursor</span>
      <span style="display:inline-flex;align-items:center;gap:8px;padding:10px 20px;background:#fff;border:1px solid #dadce0;border-radius:40px;font-size:0.95em;font-weight:500;color:#202124">🌊 Windsurf</span>
      <span style="display:inline-flex;align-items:center;gap:8px;padding:10px 20px;background:#fff;border:1px solid #dadce0;border-radius:40px;font-size:0.95em;font-weight:500;color:#202124">◆ OpenAI</span>
      <span style="display:inline-flex;align-items:center;gap:8px;padding:10px 20px;background:#fff;border:1px solid #dadce0;border-radius:40px;font-size:0.95em;font-weight:500;color:#202124">⚙ CrewAI</span>
      <span style="display:inline-flex;align-items:center;gap:8px;padding:10px 20px;background:#fff;border:1px solid #dadce0;border-radius:40px;font-size:0.95em;font-weight:500;color:#202124">⚡ LangGraph</span>
      <span style="display:inline-flex;align-items:center;gap:8px;padding:10px 20px;background:#fff;border:1px solid #dadce0;border-radius:40px;font-size:0.95em;font-weight:500;color:#202124">🔄 AutoGen</span>
      <span style="display:inline-flex;align-items:center;gap:8px;padding:10px 20px;background:#fff;border:1px solid #dadce0;border-radius:40px;font-size:0.95em;font-weight:500;color:#202124">🐍 Any MCP Client</span>
    </div>
  </div>
</section>
<section class="section">
  <div class="container">
    <div class="section-header">
      <h2>Integration</h2>
      <p>Connect any MCP-compatible client. Pay per call via Stripe Machine Payments Protocol.</p>
    </div>

    <div class="integration-block">
      <p style="margin-bottom:4px;font-weight:500;color:#202124">Connect your MCP client:</p>
      <pre>{
  "mcpServers": {
    "shopgraph": {
      "type": "url",
      "url": "https://shopgraph.dev/mcp"
    }
  }
}</pre>
    </div>

    <div class="cache-note" style="margin-top:32px">
      <div class="icon">💳</div>
      <p>No API keys needed for discovery. Payment handled via <strong>Stripe MPP</strong> — your agent pays per call using a Stripe-issued token. No subscriptions, no minimums.</p>
    </div>
  </div>
</section>

<div class="gradient-line" style="display:none"></div>

${footer}
`, `<meta name="description" content="Structured product data extraction for AI agents. Product data where platform APIs don't reach. MCP server with Schema.org and LLM extraction.">`);

// ---- Terms of Service ----
const tosHTML = pageShell('Terms of Service — ShopGraph', `
${nav}

<div class="legal-content">
  <a href="/" class="back-link">&larr; Back to ShopGraph</a>
  <h1>Terms of Service</h1>
  <p class="legal-date">Effective: March 2026</p>

  <h2>1. Service Description</h2>
  <p>ShopGraph provides structured product data extraction via the Model Context Protocol (MCP). The service accepts product URLs and returns structured data including product name, brand, price, availability, categories, images, and confidence scores.</p>
  <p>ShopGraph is operated by <strong>Krishna Brown</strong>, a California limited liability company based in Los Angeles, CA.</p>

  <h2>2. Payment Terms</h2>
  <p>ShopGraph charges per successful API call:</p>
  <ul>
    <li><code>enrich_product</code> — $0.02 USD per call</li>
    <li><code>enrich_basic</code> — $0.01 USD per call</li>
  </ul>
  <p>Payment is processed via <strong>Stripe Machine Payments Protocol (MPP)</strong>. No charge is made for cached results (within 24 hours of the original call) or for calls that fail to extract data.</p>
  <p>If you believe you were charged in error, contact <a href="mailto:hi@kb.computer">hi@kb.computer</a> for a refund.</p>

  <h2>3. Accuracy &amp; Data Quality</h2>
  <p>ShopGraph provides product data on a <strong>best-effort basis</strong>. Extraction accuracy depends on the structure and quality of the source page. Every response includes confidence scores so you can assess data reliability. ShopGraph does not guarantee the accuracy, completeness, or timeliness of extracted data.</p>

  <h2>4. Rate Limits</h2>
  <p>API calls are limited to <strong>100 requests per minute</strong> per client. Exceeding this limit may result in temporary throttling. If you need higher limits, contact <a href="mailto:hi@kb.computer">hi@kb.computer</a>.</p>

  <h2>5. Acceptable Use</h2>
  <p>You agree not to:</p>
  <ul>
    <li>Use ShopGraph for systematic large-scale scraping intended to build a competing product data service</li>
    <li>Abuse the service in a way that degrades performance for other users</li>
    <li>Misrepresent ShopGraph data as your own proprietary dataset</li>
    <li>Use the service for any unlawful purpose</li>
  </ul>

  <h2>6. Limitation of Liability</h2>
  <p>ShopGraph is provided "as is" without warranty of any kind, express or implied. Krishna Brown shall not be liable for any indirect, incidental, special, consequential, or punitive damages, or any loss of profits or data, arising from your use of the service. Total liability shall not exceed the amount you paid to ShopGraph in the 30 days preceding the claim.</p>

  <h2>7. Changes to Terms</h2>
  <p>We may update these terms from time to time. Continued use of ShopGraph after changes constitutes acceptance of the updated terms. Material changes will be noted on this page with an updated effective date.</p>

  <h2>8. Contact</h2>
  <p>Krishna Brown<br>Los Angeles, CA<br><a href="mailto:hi@kb.computer">hi@kb.computer</a></p>

  <div class="gradient-line" style="display:none"></div>
</div>

${footer}
`);

// ---- Privacy Policy ----
const privacyHTML = pageShell('Privacy Policy — ShopGraph', `
${nav}

<div class="legal-content">
  <a href="/" class="back-link">&larr; Back to ShopGraph</a>
  <h1>Privacy Policy</h1>
  <p class="legal-date">Effective: March 2026</p>

  <h2>What We Collect</h2>
  <p>When you use ShopGraph, we receive the <strong>product URLs</strong> you submit for enrichment. That is the extent of data we collect from your usage of the API.</p>

  <h2>How We Use It</h2>
  <p>Submitted URLs are used solely to perform the requested product data extraction. URLs and their extraction results are <strong>cached for 24 hours</strong> to serve repeat requests for free, then deleted.</p>

  <h2>What We Don't Do</h2>
  <ul>
    <li>We do not sell or share submitted URLs or extracted data with third parties</li>
    <li>We do not use submitted URLs for advertising or profiling</li>
    <li>We do not set cookies or use tracking pixels on the API</li>
    <li>We do not run analytics on API usage beyond standard server logs</li>
  </ul>

  <h2>Payment Data</h2>
  <p>All payment processing is handled by <a href="https://stripe.com/privacy">Stripe</a>. ShopGraph never receives, stores, or processes payment card information. Stripe's privacy policy and PCI compliance govern payment data handling.</p>

  <h2>Server Logs</h2>
  <p>ShopGraph is hosted on <a href="https://vercel.com/legal/privacy-policy">Vercel</a>, which may collect standard server logs (IP addresses, request timestamps, response codes). These logs are subject to Vercel's privacy policy and are not used by ShopGraph for any purpose beyond infrastructure monitoring.</p>

  <h2>Data Retention</h2>
  <ul>
    <li><strong>Extraction cache:</strong> 24 hours, then deleted</li>
    <li><strong>Server logs:</strong> Managed by Vercel per their retention policy</li>
    <li><strong>Payment records:</strong> Managed by Stripe per their retention policy</li>
  </ul>

  <h2>Contact</h2>
  <p>Questions about this policy? Contact us at <a href="mailto:hi@kb.computer">hi@kb.computer</a>.</p>
  <p>Krishna Brown<br>Los Angeles, CA</p>

  <div class="gradient-line" style="display:none"></div>
</div>

${footer}
`);

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

// Health check
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'shopgraph',
    version: '1.0.0',
    runtime: 'vercel-serverless',
    tools: ['enrich_product', 'enrich_basic'],
  });
});

// Landing page
app.get('/', (_req, res) => {
  res.type('html').send(landingHTML);
});

// Terms of Service
app.get('/tos', (_req, res) => {
  res.type('html').send(tosHTML);
});

// Privacy Policy
app.get('/privacy', (_req, res) => {
  res.type('html').send(privacyHTML);
});

// MCP endpoint
app.post('/mcp', async (req, res) => {
  try {
    const payments = getPayments();
    const server = createServer(cache, payments);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    res.on('close', () => {
      transport.close();
      server.close();
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error('MCP request error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

app.get('/mcp', (_req, res) => {
  res.writeHead(405).end(JSON.stringify({
    jsonrpc: '2.0',
    error: { code: -32000, message: 'Method not allowed. Use POST.' },
    id: null,
  }));
});

app.delete('/mcp', (_req, res) => {
  res.writeHead(405).end(JSON.stringify({
    jsonrpc: '2.0',
    error: { code: -32000, message: 'Method not allowed.' },
    id: null,
  }));
});

export default app;
