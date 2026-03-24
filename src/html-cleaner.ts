const MAX_CHARS = 15_000;

/**
 * Tags to remove entirely (including content).
 */
const REMOVE_TAGS = [
  'script', 'style', 'nav', 'footer', 'header', 'noscript', 'svg', 'iframe',
  'link',
];

/**
 * Price and availability hints extracted from HTML meta tags and structured elements
 * before the aggressive cleaning pass.
 */
export interface PriceHints {
  /** Dollar amounts found near price-related keywords */
  prices: string[];
  /** Currency code from meta tags */
  currency: string | null;
  /** Availability signals found in HTML */
  availabilitySignals: string[];
  /** Raw meta tag values for price */
  metaPriceAmount: string | null;
  /** Raw meta tag values for availability */
  metaAvailability: string | null;
}

/**
 * Extract price and availability hints from raw HTML before cleaning.
 * These hints are passed to the LLM as context clues.
 */
export function extractPriceHints(html: string): PriceHints {
  const hints: PriceHints = {
    prices: [],
    currency: null,
    availabilitySignals: [],
    metaPriceAmount: null,
    metaAvailability: null,
  };

  // --- Meta tag extraction ---

  // <meta property="product:price:amount" content="...">
  // <meta property="og:price:amount" content="...">
  const metaPriceAmountRe = /<meta[^>]+(?:property|name)\s*=\s*["'](?:product|og):price:amount["'][^>]+content\s*=\s*["']([^"']+)["'][^>]*>/gi;
  const metaPriceAmountRe2 = /<meta[^>]+content\s*=\s*["']([^"']+)["'][^>]+(?:property|name)\s*=\s*["'](?:product|og):price:amount["'][^>]*>/gi;
  let m = metaPriceAmountRe.exec(html) || metaPriceAmountRe2.exec(html);
  if (m) {
    hints.metaPriceAmount = m[1].trim();
    hints.prices.push(m[1].trim());
  }

  // <meta property="product:price:currency" content="...">
  const metaCurrencyRe = /<meta[^>]+(?:property|name)\s*=\s*["'](?:product|og):price:currency["'][^>]+content\s*=\s*["']([^"']+)["'][^>]*>/gi;
  const metaCurrencyRe2 = /<meta[^>]+content\s*=\s*["']([^"']+)["'][^>]+(?:property|name)\s*=\s*["'](?:product|og):price:currency["'][^>]*>/gi;
  m = metaCurrencyRe.exec(html) || metaCurrencyRe2.exec(html);
  if (m) {
    hints.currency = m[1].trim();
  }

  // <meta property="product:availability" content="...">
  const metaAvailRe = /<meta[^>]+(?:property|name)\s*=\s*["'](?:product:availability|og:availability)["'][^>]+content\s*=\s*["']([^"']+)["'][^>]*>/gi;
  const metaAvailRe2 = /<meta[^>]+content\s*=\s*["']([^"']+)["'][^>]+(?:property|name)\s*=\s*["'](?:product:availability|og:availability)["'][^>]*>/gi;
  m = metaAvailRe.exec(html) || metaAvailRe2.exec(html);
  if (m) {
    hints.metaAvailability = m[1].trim();
    hints.availabilitySignals.push(m[1].trim());
  }

  // itemprop="price" content="..."
  const itempropPriceRe = /<[^>]+itemprop\s*=\s*["']price["'][^>]+content\s*=\s*["']([^"']+)["'][^>]*>/gi;
  const itempropPriceRe2 = /<[^>]+content\s*=\s*["']([^"']+)["'][^>]+itemprop\s*=\s*["']price["'][^>]*>/gi;
  m = itempropPriceRe.exec(html) || itempropPriceRe2.exec(html);
  if (m && !hints.prices.includes(m[1].trim())) {
    hints.prices.push(m[1].trim());
  }

  // --- Price patterns near keywords ---
  // Look for dollar amounts near price-related context
  const pricePatternRe = /(?:price|cost|amount|regular|sale|now|was|our price|your price|buy for)[^$\d]{0,30}(\$[\d,]+\.?\d*)/gi;
  let pm: RegExpExecArray | null;
  while ((pm = pricePatternRe.exec(html)) !== null) {
    const price = pm[1].trim();
    if (!hints.prices.includes(price)) {
      hints.prices.push(price);
    }
  }

  // Also catch $XX.XX patterns at the start (price before keyword)
  const reversePriceRe = /(\$[\d,]+\.?\d*)[^<]{0,30}(?:price|regular|sale|now|was)/gi;
  while ((pm = reversePriceRe.exec(html)) !== null) {
    const price = pm[1].trim();
    if (!hints.prices.includes(price)) {
      hints.prices.push(price);
    }
  }

  // --- Availability signals ---
  const availabilityPatterns = [
    /\b(in\s*stock)\b/gi,
    /\b(out\s*of\s*stock)\b/gi,
    /\b(sold\s*out)\b/gi,
    /\b(add\s*to\s*cart)\b/gi,
    /\b(add\s*to\s*bag)\b/gi,
    /\b(buy\s*now)\b/gi,
    /\b(coming\s*soon)\b/gi,
    /\b(pre[\s-]*order)\b/gi,
    /\b(notify\s*me)\b/gi,
    /\b(currently\s*unavailable)\b/gi,
    /\b(back\s*in\s*stock)\b/gi,
    /\b(limited\s*availability)\b/gi,
  ];

  for (const pattern of availabilityPatterns) {
    const am = pattern.exec(html);
    if (am) {
      const signal = am[1].trim().toLowerCase();
      if (!hints.availabilitySignals.includes(signal)) {
        hints.availabilitySignals.push(signal);
      }
    }
  }

  // Check for class/id names that indicate availability
  const availClassRe = /class\s*=\s*["'][^"']*\b(in-stock|out-of-stock|sold-out|add-to-cart|available|unavailable)\b[^"']*["']/gi;
  while ((pm = availClassRe.exec(html)) !== null) {
    const signal = pm[1].trim().toLowerCase();
    if (!hints.availabilitySignals.includes(signal)) {
      hints.availabilitySignals.push(signal);
    }
  }

  return hints;
}

/**
 * Extract price-related meta tags as text to prepend to cleaned output.
 * This preserves price signals that would otherwise be stripped with <meta> tags.
 */
function extractPriceMetaText(html: string): string {
  const parts: string[] = [];

  // Extract all meta tags with price/product/availability info
  const metaRe = /<meta[^>]+(?:price|product:|og:price|availability)[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = metaRe.exec(html)) !== null) {
    const tag = m[0];
    // Extract property and content
    const propMatch = /(?:property|name)\s*=\s*["']([^"']+)["']/i.exec(tag);
    const contentMatch = /content\s*=\s*["']([^"']+)["']/i.exec(tag);
    if (propMatch && contentMatch) {
      parts.push(`${propMatch[1]}: ${contentMatch[1]}`);
    }
  }

  // Extract elements with itemprop="price" or itemprop="priceCurrency"
  const itempropRe = /<[^>]+itemprop\s*=\s*["'](price|priceCurrency|availability)["'][^>]*(?:content\s*=\s*["']([^"']+)["'])?[^>]*>/gi;
  while ((m = itempropRe.exec(html)) !== null) {
    if (m[2]) {
      parts.push(`itemprop ${m[1]}: ${m[2]}`);
    }
  }

  return parts.length > 0 ? `[Product metadata: ${parts.join(', ')}]\n` : '';
}

/**
 * Preserve elements with price-related class/id names by extracting their text content
 * before the aggressive tag stripping pass.
 */
function extractPriceElements(html: string): string {
  const parts: string[] = [];

  // Match elements whose class or id contains price, cost, or amount keywords
  const priceElRe = /<(?:span|div|p|strong|b|em|ins|del|s|data|td|li)[^>]+(?:class|id)\s*=\s*["'][^"']*\b(?:price|cost|amount|sale-price|regular-price|offer-price|product-price|was-price|now-price)\b[^"']*["'][^>]*>([\s\S]*?)<\/(?:span|div|p|strong|b|em|ins|del|s|data|td|li)>/gi;

  let m: RegExpExecArray | null;
  while ((m = priceElRe.exec(html)) !== null) {
    const inner = m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (inner && inner.length < 200) {
      parts.push(inner);
    }
  }

  return parts.length > 0 ? `[Price elements: ${parts.join(' | ')}]\n` : '';
}

/**
 * Clean HTML for LLM consumption by removing non-content elements.
 * Returns cleaned text, extracted image URLs, and price/availability hints.
 */
export function cleanHtml(html: string): { text: string; imageUrls: string[]; priceHints: PriceHints } {
  const priceHints = extractPriceHints(html);

  // Extract price metadata and elements before aggressive cleaning
  const priceMetaText = extractPriceMetaText(html);
  const priceElementText = extractPriceElements(html);

  let cleaned = html;

  // Remove hidden elements (display:none, visibility:hidden, aria-hidden)
  cleaned = cleaned.replace(
    /<[^>]+(display\s*:\s*none|visibility\s*:\s*hidden|aria-hidden\s*=\s*["']true["'])[^>]*>[\s\S]*?<\/[^>]+>/gi,
    ''
  );

  // Remove unwanted tags and their content
  for (const tag of REMOVE_TAGS) {
    const regex = new RegExp(`<${tag}[^>]*>[\\s\\S]*?<\\/${tag}>`, 'gi');
    cleaned = cleaned.replace(regex, '');
    // Also remove self-closing variants
    const selfClosing = new RegExp(`<${tag}[^>]*\\/?>`, 'gi');
    cleaned = cleaned.replace(selfClosing, '');
  }

  // Remove meta tags that DON'T have price/product info (keep those)
  // Actually, all meta tags are already removed by REMOVE_TAGS. We extracted price meta above.

  // Extract image URLs before stripping tags
  const imageUrls = extractImageUrls(cleaned);

  // Remove HTML comments
  cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, '');

  // Strip remaining HTML tags but keep content
  cleaned = cleaned.replace(/<[^>]+>/g, ' ');

  // Decode common HTML entities
  cleaned = decodeEntities(cleaned);

  // Normalize whitespace
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  // Prepend price metadata and price element text
  const prefix = priceMetaText + priceElementText;
  cleaned = prefix + cleaned;

  // Truncate to max length
  if (cleaned.length > MAX_CHARS) {
    cleaned = cleaned.slice(0, MAX_CHARS);
  }

  return { text: cleaned, imageUrls, priceHints };
}

/**
 * Extract image URLs from img tags in HTML.
 */
export function extractImageUrls(html: string): string[] {
  const urls: string[] = [];
  const imgRegex = /<img[^>]+src\s*=\s*["']([^"']+)["'][^>]*>/gi;

  let match: RegExpExecArray | null;
  while ((match = imgRegex.exec(html)) !== null) {
    const url = match[1].trim();
    if (url && !url.startsWith('data:') && !urls.includes(url)) {
      urls.push(url);
    }
  }

  return urls;
}

/**
 * Decode common HTML entities.
 */
function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}
