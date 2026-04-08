import { GoogleGenerativeAI } from '@google/generative-ai';
import type { ProductData } from './types.js';
import { LLM_BASE_BASELINE, LLM_LOW_BASELINE, LLM_BOOSTED_BASELINE, getFieldConfidence } from './types.js';
import { cleanHtml, type PriceHints } from './html-cleaner.js';

const EXTRACTION_PROMPT = `You are a product data extraction expert. Given the text content of a product page, extract structured product information.

Return a valid JSON object with these fields:
{
  "product_name": "string or null",
  "brand": "string or null",
  "description": "string or null - brief product description",
  "price_amount": "number or null - the current/active selling price as a number (no currency symbols)",
  "price_currency": "string or null - 3-letter code like USD, EUR, GBP",
  "sale_price": "number or null - sale/discounted price if different from regular price",
  "availability": "in_stock | out_of_stock | preorder | unknown",
  "categories": ["array of category strings"],
  "color": ["array of color strings"],
  "material": ["array of material strings"],
  "dimensions": {"key": "value"} or null
}

PRICE EXTRACTION RULES:
- Look for dollar signs ($), pound signs (£), euro signs (€), or price numbers
- Check near these keywords: "Price", "Regular Price", "Sale Price", "Now", "Was", "Our Price", "Buy for", "Add to Cart"
- Prices often appear in elements with class/id containing "price", "cost", "amount"
- If you see both a regular price and a sale price, put the REGULAR (higher) price in price_amount and the SALE (lower) price in sale_price
- If only one price is visible, put it in price_amount
- Extract the numeric value only (e.g., "$45.00" → 45.00, "$1,299.99" → 1299.99)
- If a price range is shown (e.g., "$20 - $40"), use the lower price as price_amount

AVAILABILITY DETECTION RULES:
- "In Stock", "Available", "Ships in X days", "Ready to ship" → in_stock
- "Add to Cart", "Add to Bag", "Buy Now" buttons → in_stock (implies purchasable)
- "Out of Stock", "Sold Out", "Currently Unavailable" → out_of_stock
- "Notify Me", "Waitlist", "Email when available" → out_of_stock
- "Coming Soon", "Pre-order", "Pre-Order Now" → preorder
- "Limited Availability", "Only X left", "Low Stock" → in_stock
- "Back in Stock" → in_stock
- If none of these signals are found → unknown

OTHER RULES:
- Only extract information explicitly present on the page
- Do not hallucinate or infer data that isn't there
- Return null for fields you cannot determine
- Return empty arrays for list fields you cannot determine
- Return ONLY the JSON object, no markdown or explanation`;

/**
 * Build a price hints section to include in the LLM prompt.
 */
function buildPriceHintsSection(hints: PriceHints): string {
  const parts: string[] = [];

  if (hints.prices.length > 0) {
    parts.push(`DETECTED PRICES on this page: ${hints.prices.join(', ')}. Verify which is the actual product price.`);
  }

  if (hints.currency) {
    parts.push(`Detected currency: ${hints.currency}`);
  }

  if (hints.metaPriceAmount) {
    parts.push(`Meta tag price amount: ${hints.metaPriceAmount}`);
  }

  if (hints.metaAvailability) {
    parts.push(`Meta tag availability: ${hints.metaAvailability}`);
  }

  if (hints.availabilitySignals.length > 0) {
    parts.push(`Availability signals found: ${hints.availabilitySignals.join(', ')}`);
  }

  if (parts.length === 0) return '';

  return `\n\nPRICE & AVAILABILITY HINTS (extracted from page metadata and structured elements):\n${parts.join('\n')}`;
}

/**
 * Extract product data using Gemini LLM as fallback.
 */
export async function extractWithLlm(
  html: string,
  url: string,
  apiKey?: string,
): Promise<Partial<ProductData> | null> {
  const key = apiKey ?? process.env.GOOGLE_API_KEY;
  if (!key) {
    throw new Error('GOOGLE_API_KEY is required for LLM extraction');
  }

  const { text, imageUrls, priceHints } = cleanHtml(html);
  if (!text || text.length < 50) return null;

  const genAI = new GoogleGenerativeAI(key);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const hintsSection = buildPriceHintsSection(priceHints);
  const prompt = `${EXTRACTION_PROMPT}${hintsSection}\n\nPage URL: ${url}\n\nPage content:\n${text}`;

  const result = await model.generateContent(prompt);
  const response = result.response;
  const responseText = response.text();

  // Parse JSON from response (handle markdown code blocks)
  const jsonStr = responseText
    .replace(/^```json?\s*/m, '')
    .replace(/```\s*$/m, '')
    .trim();

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    return null;
  }

  const perField: Record<string, number> = {};
  const hasPriceHints = priceHints.prices.length > 0 || priceHints.metaPriceAmount !== null;
  const hasAvailHints = priceHints.availabilitySignals.length > 0 || priceHints.metaAvailability !== null;

  const setField = (name: string, value: unknown, boosted = false): boolean => {
    if (value !== null && value !== undefined && value !== '') {
      const base = boosted ? LLM_BOOSTED_BASELINE : LLM_BASE_BASELINE;
      perField[name] = getFieldConfidence(base, name);
      return true;
    }
    perField[name] = getFieldConfidence(LLM_LOW_BASELINE, name);
    return false;
  };

  const productName = typeof parsed.product_name === 'string' ? parsed.product_name : null;
  setField('product_name', productName);

  const brand = typeof parsed.brand === 'string' ? parsed.brand : null;
  setField('brand', brand);

  const description = typeof parsed.description === 'string' ? parsed.description : null;
  setField('description', description);

  const priceAmount = typeof parsed.price_amount === 'number' ? parsed.price_amount : null;
  const priceCurrency = typeof parsed.price_currency === 'string' ? parsed.price_currency : null;
  const salePrice = typeof parsed.sale_price === 'number' ? parsed.sale_price : null;
  const price = priceAmount !== null ? { amount: priceAmount, currency: priceCurrency, sale_price: salePrice } : null;
  // Boost confidence if we had price hints that the LLM confirmed
  setField('price', price, hasPriceHints && price !== null);

  const availability = parseAvailability(parsed.availability);
  // Boost confidence if we had availability hints
  setField('availability', availability, hasAvailHints && availability !== 'unknown');

  const categories = Array.isArray(parsed.categories)
    ? parsed.categories.filter((c): c is string => typeof c === 'string')
    : [];

  const color = Array.isArray(parsed.color)
    ? parsed.color.filter((c): c is string => typeof c === 'string')
    : [];

  const material = Array.isArray(parsed.material)
    ? parsed.material.filter((m): m is string => typeof m === 'string')
    : [];

  const dimensions = parsed.dimensions && typeof parsed.dimensions === 'object'
    ? Object.fromEntries(
        Object.entries(parsed.dimensions as Record<string, unknown>)
          .map(([k, v]) => [k, String(v)])
      )
    : null;

  const fieldCount = Object.keys(perField).length;
  const overall = fieldCount > 0
    ? Object.values(perField).reduce((a, b) => a + b, 0) / fieldCount
    : 0;

  return {
    extraction_method: 'llm',
    product_name: productName,
    brand,
    description,
    price,
    availability,
    categories,
    image_urls: imageUrls,
    primary_image_url: imageUrls[0] ?? null,
    color,
    material,
    dimensions,
    schema_org_raw: null,
    confidence: { overall, per_field: perField },
  };
}

// ── LLM-as-Validator ────────────────────────────────────────────────

export interface ValidationResult {
  fields_verified: Record<string, {
    correct: boolean;
    confidence: number;
    correction?: string;
  }>;
  overall_accuracy: number;
  validator_model: string;
  duration_ms: number;
}

const VALIDATION_PROMPT = `You are a product data verification expert. Given an extracted JSON and the original page content, verify each field.

For each field below, determine if the extracted value is correct based on the HTML content.
Return a JSON object with this structure:
{
  "fields": {
    "product_name": { "correct": true/false, "confidence": 0.0-1.0, "correction": "correct value if wrong" },
    "brand": { "correct": true/false, "confidence": 0.0-1.0, "correction": "correct value if wrong" },
    "description": { "correct": true/false, "confidence": 0.0-1.0, "correction": "correct value if wrong" },
    "price_amount": { "correct": true/false, "confidence": 0.0-1.0, "correction": "correct value if wrong" },
    "price_currency": { "correct": true/false, "confidence": 0.0-1.0, "correction": "correct value if wrong" },
    "availability": { "correct": true/false, "confidence": 0.0-1.0, "correction": "correct value if wrong" }
  }
}

Rules:
- Only check fields that have non-null extracted values
- Set correct=true if the value matches what's on the page
- Set confidence to how sure you are of your verification (0.0-1.0)
- Only include correction if correct=false
- Return ONLY the JSON object, no markdown or explanation`;

/**
 * Validate extracted product data against original HTML using LLM-as-validator.
 */
export async function validateExtraction(
  product: ProductData,
  html: string,
  apiKey?: string,
): Promise<ValidationResult> {
  const start = Date.now();
  const key = apiKey ?? process.env.GOOGLE_API_KEY;
  if (!key) {
    throw new Error('GOOGLE_API_KEY is required for LLM validation');
  }

  const { text } = cleanHtml(html);
  const truncated = text.slice(0, 15_000);

  const extractedFields: Record<string, unknown> = {};
  if (product.product_name) extractedFields.product_name = product.product_name;
  if (product.brand) extractedFields.brand = product.brand;
  if (product.description) extractedFields.description = product.description;
  if (product.price?.amount != null) extractedFields.price_amount = product.price.amount;
  if (product.price?.currency) extractedFields.price_currency = product.price.currency;
  if (product.availability !== 'unknown') extractedFields.availability = product.availability;

  const genAI = new GoogleGenerativeAI(key);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const prompt = `${VALIDATION_PROMPT}\n\nExtracted data:\n${JSON.stringify(extractedFields, null, 2)}\n\nPage content:\n${truncated}`;

  const result = await model.generateContent(prompt);
  const responseText = result.response.text();

  const jsonStr = responseText
    .replace(/^```json?\s*/m, '')
    .replace(/```\s*$/m, '')
    .trim();

  let parsed: { fields?: Record<string, { correct?: boolean; confidence?: number; correction?: string }> };
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    // Return a default result on parse failure
    return {
      fields_verified: {},
      overall_accuracy: 0,
      validator_model: 'gemini-2.5-flash',
      duration_ms: Date.now() - start,
    };
  }

  const fieldsVerified: ValidationResult['fields_verified'] = {};
  let correctCount = 0;
  let totalCount = 0;

  if (parsed.fields) {
    for (const [fieldName, fieldResult] of Object.entries(parsed.fields)) {
      const correct = fieldResult.correct === true;
      const confidence = typeof fieldResult.confidence === 'number' ? fieldResult.confidence : 0;
      fieldsVerified[fieldName] = { correct, confidence };
      if (fieldResult.correction && !correct) {
        fieldsVerified[fieldName].correction = String(fieldResult.correction);
      }
      if (correct) correctCount++;
      totalCount++;
    }
  }

  return {
    fields_verified: fieldsVerified,
    overall_accuracy: totalCount > 0 ? correctCount / totalCount : 0,
    validator_model: 'gemini-2.5-flash',
    duration_ms: Date.now() - start,
  };
}

function parseAvailability(value: unknown): ProductData['availability'] {
  if (typeof value !== 'string') return 'unknown';
  const lower = value.toLowerCase();
  if (lower === 'in_stock') return 'in_stock';
  if (lower === 'out_of_stock') return 'out_of_stock';
  if (lower === 'preorder') return 'preorder';
  return 'unknown';
}
