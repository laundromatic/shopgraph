import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { cleanHtml, extractImageUrls, extractPriceHints } from '../html-cleaner.js';

const FIXTURES = join(import.meta.dirname, 'fixtures');
const noSchemaHtml = readFileSync(join(FIXTURES, 'no-schema-product.html'), 'utf-8');
const shopifyHtml = readFileSync(join(FIXTURES, 'shopify-product.html'), 'utf-8');

describe('cleanHtml', () => {
  it('removes script tags and content', () => {
    const { text } = cleanHtml('<div>Hello</div><script>alert("x")</script><div>World</div>');
    expect(text).not.toContain('alert');
    expect(text).toContain('Hello');
    expect(text).toContain('World');
  });

  it('removes style tags and content', () => {
    const { text } = cleanHtml('<style>.x { color: red; }</style><p>Content</p>');
    expect(text).not.toContain('color');
    expect(text).toContain('Content');
  });

  it('removes nav, footer, header tags', () => {
    const { text } = cleanHtml('<header>Header</header><main>Main Content</main><footer>Footer</footer>');
    expect(text).not.toContain('Header');
    expect(text).not.toContain('Footer');
    expect(text).toContain('Main Content');
  });

  it('removes noscript and svg tags', () => {
    const { text } = cleanHtml('<noscript>Enable JS</noscript><svg><path/></svg><p>Visible</p>');
    expect(text).not.toContain('Enable JS');
    expect(text).toContain('Visible');
  });

  it('removes HTML comments', () => {
    const { text } = cleanHtml('<!-- comment --><p>Content</p>');
    expect(text).not.toContain('comment');
    expect(text).toContain('Content');
  });

  it('decodes HTML entities', () => {
    const { text } = cleanHtml('<p>&amp; &lt; &gt; &quot; &#39; &nbsp;</p>');
    expect(text).toContain('&');
    expect(text).toContain('<');
    expect(text).toContain('>');
    expect(text).toContain('"');
    expect(text).toContain("'");
  });

  it('normalizes whitespace', () => {
    const { text } = cleanHtml('<p>  Hello   \n\n   World  </p>');
    expect(text).toBe('Hello World');
  });

  it('respects character limit', () => {
    const longContent = '<p>' + 'x'.repeat(20000) + '</p>';
    const { text } = cleanHtml(longContent);
    expect(text.length).toBeLessThanOrEqual(15000);
  });

  it('extracts image URLs during cleaning', () => {
    const { imageUrls } = cleanHtml('<img src="https://example.com/photo.jpg" alt="test"><p>Text</p>');
    expect(imageUrls).toContain('https://example.com/photo.jpg');
  });

  it('cleans real product page (no-schema fixture)', () => {
    const { text, imageUrls } = cleanHtml(noSchemaHtml);
    expect(text).toContain('Handmade Ceramic Vase');
    expect(text).toContain('$45.00');
    expect(text).toContain('Ocean Blue');
    expect(text).not.toContain('analytics.js');
    expect(text).not.toContain('dataLayer');
    expect(imageUrls.length).toBeGreaterThanOrEqual(3);
  });

  it('returns priceHints in result', () => {
    const { priceHints } = cleanHtml('<div class="price">$29.99</div>');
    expect(priceHints).toBeDefined();
    expect(priceHints).toHaveProperty('prices');
    expect(priceHints).toHaveProperty('currency');
    expect(priceHints).toHaveProperty('availabilitySignals');
  });

  it('prepends price metadata from meta tags', () => {
    const html = '<meta property="product:price:amount" content="49.99"><meta property="product:price:currency" content="USD"><p>Product</p>';
    const { text } = cleanHtml(html);
    expect(text).toContain('product:price:amount: 49.99');
    expect(text).toContain('product:price:currency: USD');
  });

  it('prepends price element text from price-classed elements', () => {
    const html = '<span class="product-price">$35.00</span><span class="sale-price">$28.00</span><p>Description</p>';
    const { text } = cleanHtml(html);
    expect(text).toContain('Price elements:');
    expect(text).toContain('$35.00');
    expect(text).toContain('$28.00');
  });
});

describe('extractPriceHints', () => {
  it('extracts price from meta product:price:amount', () => {
    const html = '<meta property="product:price:amount" content="29.99">';
    const hints = extractPriceHints(html);
    expect(hints.metaPriceAmount).toBe('29.99');
    expect(hints.prices).toContain('29.99');
  });

  it('extracts price from meta og:price:amount', () => {
    const html = '<meta property="og:price:amount" content="59.00">';
    const hints = extractPriceHints(html);
    expect(hints.metaPriceAmount).toBe('59.00');
    expect(hints.prices).toContain('59.00');
  });

  it('extracts currency from meta tag', () => {
    const html = '<meta property="product:price:currency" content="EUR">';
    const hints = extractPriceHints(html);
    expect(hints.currency).toBe('EUR');
  });

  it('extracts availability from meta tag', () => {
    const html = '<meta property="product:availability" content="instock">';
    const hints = extractPriceHints(html);
    expect(hints.metaAvailability).toBe('instock');
    expect(hints.availabilitySignals).toContain('instock');
  });

  it('extracts dollar amounts near price keywords', () => {
    const html = '<span>Regular Price: $45.00</span><span>Sale Price: $38.50</span>';
    const hints = extractPriceHints(html);
    expect(hints.prices).toContain('$45.00');
    expect(hints.prices).toContain('$38.50');
  });

  it('detects "Add to Cart" as in_stock signal', () => {
    const html = '<button>Add to Cart</button>';
    const hints = extractPriceHints(html);
    expect(hints.availabilitySignals).toContain('add to cart');
  });

  it('detects "Sold Out" as availability signal', () => {
    const html = '<div class="stock-status">Sold Out</div>';
    const hints = extractPriceHints(html);
    expect(hints.availabilitySignals).toContain('sold out');
  });

  it('detects "In Stock" text', () => {
    const html = '<span class="availability">In Stock</span>';
    const hints = extractPriceHints(html);
    expect(hints.availabilitySignals).toContain('in stock');
  });

  it('detects availability from class names', () => {
    const html = '<div class="product-status out-of-stock">Not Available</div>';
    const hints = extractPriceHints(html);
    expect(hints.availabilitySignals).toContain('out-of-stock');
  });

  it('detects pre-order signal', () => {
    const html = '<button>Pre-Order Now</button>';
    const hints = extractPriceHints(html);
    expect(hints.availabilitySignals).toContain('pre-order');
  });

  it('detects notify me as out of stock signal', () => {
    const html = '<button>Notify Me When Available</button>';
    const hints = extractPriceHints(html);
    expect(hints.availabilitySignals).toContain('notify me');
  });

  it('extracts price from itemprop="price"', () => {
    const html = '<span itemprop="price" content="19.99">$19.99</span>';
    const hints = extractPriceHints(html);
    expect(hints.prices).toContain('19.99');
  });

  it('handles meta tags with content before property (attribute order variation)', () => {
    const html = '<meta content="39.99" property="product:price:amount">';
    const hints = extractPriceHints(html);
    expect(hints.metaPriceAmount).toBe('39.99');
  });

  it('returns empty hints when no price data found', () => {
    const html = '<p>Just a blog post with no prices</p>';
    const hints = extractPriceHints(html);
    expect(hints.prices).toEqual([]);
    expect(hints.currency).toBeNull();
    expect(hints.availabilitySignals).toEqual([]);
    expect(hints.metaPriceAmount).toBeNull();
    expect(hints.metaAvailability).toBeNull();
  });

  it('extracts from no-schema fixture', () => {
    const hints = extractPriceHints(noSchemaHtml);
    // The fixture has "$45.00" in a price class and "Add to Cart" button
    expect(hints.availabilitySignals.length).toBeGreaterThan(0);
  });
});

describe('extractImageUrls', () => {
  it('extracts src from img tags', () => {
    const html = '<img src="https://example.com/a.jpg"><img src="https://example.com/b.png">';
    const urls = extractImageUrls(html);
    expect(urls).toEqual(['https://example.com/a.jpg', 'https://example.com/b.png']);
  });

  it('skips data: URIs', () => {
    const html = '<img src="data:image/gif;base64,R0lGODlhAQABAIAAAA=="><img src="https://example.com/real.jpg">';
    const urls = extractImageUrls(html);
    expect(urls).toEqual(['https://example.com/real.jpg']);
  });

  it('deduplicates URLs', () => {
    const html = '<img src="https://example.com/a.jpg"><img src="https://example.com/a.jpg">';
    const urls = extractImageUrls(html);
    expect(urls).toEqual(['https://example.com/a.jpg']);
  });

  it('handles single and double quotes', () => {
    const html = `<img src='https://example.com/single.jpg'><img src="https://example.com/double.jpg">`;
    const urls = extractImageUrls(html);
    expect(urls).toHaveLength(2);
  });

  it('returns empty array for no images', () => {
    expect(extractImageUrls('<p>No images</p>')).toEqual([]);
  });
});
