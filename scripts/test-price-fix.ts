import 'dotenv/config';
import { extractProduct } from '../src/extract.js';

// URLs that previously failed or had weak price extraction via LLM
const TEST_URLS = [
  { name: 'Allbirds', url: 'https://www.allbirds.com/products/mens-tree-runners' },
  { name: 'Brooklinen', url: 'https://www.brooklinen.com/products/luxe-core-sheet-set' },
  { name: 'Target', url: 'https://www.target.com/p/stanley-quencher-h2-0-flowstate-tumbler-40oz/-/A-87710786' },
  { name: 'Apple', url: 'https://www.apple.com/shop/buy-iphone/iphone-16-pro' },
  { name: 'Google Store', url: 'https://store.google.com/us/product/pixel_9_pro' },
  { name: 'Amazon', url: 'https://www.amazon.com/dp/B0CM5JV268' },
];

async function main() {
  console.log('=== Price Fix Validation ===\n');
  let priceFound = 0;
  let total = 0;
  
  for (const { name, url } of TEST_URLS) {
    try {
      const result = await extractProduct(url, { timeout: 20000 });
      total++;
      const hasPrice = result.price?.amount != null;
      if (hasPrice) priceFound++;
      console.log(`${hasPrice ? '✓' : '✗'} ${name}: ${hasPrice ? `$${result.price!.amount} ${result.price!.currency}` : 'NO PRICE'} (${result.extraction_method}, confidence: ${result.confidence.overall})`);
    } catch (err: any) {
      console.log(`✗ ${name}: ERROR — ${err.message?.slice(0, 60)}`);
    }
  }
  console.log(`\nPrice extraction: ${priceFound}/${total} (${Math.round(priceFound/total*100)}%)`);
}

main();
