# Framework PR Messaging Guide

## API Response Shape Reference

All code examples in this document use the real ShopGraph API response shape. See `docs/api-response-reference.json` for a complete snapshot.

**Key field paths:**

| Data | Path |
|------|------|
| Product name | `data.product.product_name` |
| Brand | `data.product.brand` |
| Price amount | `data.product.price.amount` |
| Price currency | `data.product.price.currency` |
| Availability | `data.product.availability` |
| Categories | `data.product.categories` |
| Image URLs | `data.product.image_urls` |
| Primary image | `data.product.primary_image_url` |
| Overall confidence | `data.product.confidence.overall` |
| Per-field confidence | `data.product.confidence.per_field.<field>` |
| ShopGraph field confidence | `data.product._shopgraph.field_confidence.<field>` |
| Field freshness | `data.product._shopgraph.field_freshness.<field>` |
| Extraction method | `data.product._shopgraph.extraction_method` |
| Data source (live/cache) | `data.product._shopgraph.data_source` |
| Cached flag | `data.cached` |
| Credit mode | `data.credit_mode` |

**Confidence baselines (from `src/types.ts`):**

| Extraction method | Base | product_name | brand | description | price | availability |
|-------------------|------|-------------|-------|-------------|-------|-------------|
| schema_org | 0.93 | 0.98 | 0.93 | 0.88 | 0.93 | 0.83 |
| llm | 0.70 | 0.75 | 0.70 | 0.65 | 0.70 | 0.60 |
| llm_boosted | 0.85 | 0.90 | 0.85 | 0.80 | 0.85 | 0.75 |

---

## Branding

- **1-Liner:** Authenticated product data extraction.
- **Elevator pitch:** The open web is moving behind CDN security gates. ShopGraph handles the identity handshakes and returns UCP-compliant product data with transparent confidence scores, so your pipelines stay connected.

### Banned terms

deterministic, guaranteed, scraping, bypass, circumvent, unblock, fighting, toll roads (commerce), identity broker, OV identity, trust score, "the first" (unqualified)

---

## PR #1: Vercel AI SDK Cookbook

**Title:** `Add authenticated commerce extraction example with per-field confidence scoring (ShopGraph)`

### What

A drop-in example showing how to enrich a product URL into structured commerce data with per-field confidence scores, using ShopGraph's authenticated extraction API. Returns price, availability, brand, and 10+ fields with individual confidence values so agents can decide which data to trust.

### Why

AI agents that interact with commerce data need structured product information, but modern retail sites serve content behind CDN security layers that block unauthenticated requests. This example shows how to get reliable, confidence-scored product data through ShopGraph's identity handshake rather than brittle HTML parsing.

### The pattern

```typescript
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";

// 1. Extract product data with confidence scores
const response = await fetch("https://shopgraph.dev/api/enrich", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.SHOPGRAPH_API_KEY}`,
  },
  body: JSON.stringify({
    url: "https://www.grainger.com/product/DAYTON-1-2-HP-Jet-Pump-5UXK1",
  }),
});

const data = await response.json();

// Response shape:
// {
//   product: {
//     product_name: "DAYTON 1/2 HP Jet Pump, Model 5UXK1",
//     price: { amount: 284.00, currency: "USD" },
//     availability: "in_stock",
//     confidence: { overall: 0.93, per_field: { price: 0.93, ... } },
//     _shopgraph: {
//       field_confidence: { price: 0.93, availability: 0.83, ... },
//       field_freshness: { price: { volatility_class: "real_time", decayed: false }, ... }
//     }
//   },
//   cached: false,
//   credit_mode: "standard"
// }

// 2. Use confidence scores to decide what to trust
const priceConfidence =
  data.product._shopgraph.field_confidence.price;
const price = data.product.price?.amount;

if (priceConfidence >= 0.8 && price !== null) {
  console.log(`Verified price: $${price} (confidence: ${priceConfidence})`);
} else {
  console.log(`Price needs review (confidence: ${priceConfidence})`);
}
```

### Full example

```typescript
// examples/shopgraph-extraction.ts
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";

interface ShopGraphResponse {
  product: {
    url: string;
    extracted_at: string;
    extraction_method: "schema_org" | "llm" | "hybrid";
    product_name: string | null;
    brand: string | null;
    description: string | null;
    price: { amount: number; currency: string; sale_price?: number } | null;
    availability: "in_stock" | "out_of_stock" | "preorder" | "unknown";
    categories: string[];
    image_urls: string[];
    primary_image_url: string | null;
    color: string[];
    material: string[];
    dimensions: Record<string, string> | null;
    confidence: {
      overall: number;
      per_field: Record<string, number>;
    };
    _shopgraph: {
      source_url: string;
      extraction_timestamp: string;
      response_timestamp: string;
      extraction_method: string;
      data_source: "live" | "cache";
      field_confidence: Record<string, number>;
      field_freshness: Record<
        string,
        { volatility_class: string; age_seconds: number; decayed: boolean }
      >;
      confidence_method: string;
    };
  };
  cached: boolean;
  credit_mode: string;
}

async function extractProduct(url: string): Promise<ShopGraphResponse> {
  const response = await fetch("https://shopgraph.dev/api/enrich", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.SHOPGRAPH_API_KEY}`,
    },
    body: JSON.stringify({ url }),
  });

  if (!response.ok) {
    throw new Error(`ShopGraph API error: ${response.status}`);
  }

  return response.json();
}

async function main() {
  const data = await extractProduct(
    "https://www.grainger.com/product/DAYTON-1-2-HP-Jet-Pump-5UXK1"
  );

  const product = data.product;
  const meta = product._shopgraph;

  // Build a confidence-aware product summary
  const fields = ["product_name", "brand", "price", "availability"] as const;
  const verified: string[] = [];
  const needsReview: string[] = [];

  for (const field of fields) {
    const confidence = meta.field_confidence[field] ?? 0;
    if (confidence >= 0.8) {
      verified.push(field);
    } else {
      needsReview.push(field);
    }
  }

  // Check freshness for volatile fields
  const priceFreshness = meta.field_freshness?.price;
  const priceDecayed = priceFreshness?.decayed ?? false;

  const context = `
Product: ${product.product_name}
Brand: ${product.brand}
Price: ${product.price?.amount ? `$${product.price.amount} ${product.price.currency}` : "unavailable"}
Availability: ${product.availability}
Extraction method: ${meta.extraction_method}
Data source: ${meta.data_source}
Overall confidence: ${product.confidence.overall}
Verified fields: ${verified.join(", ")}
Fields needing review: ${needsReview.length > 0 ? needsReview.join(", ") : "none"}
Price decayed: ${priceDecayed}
  `.trim();

  // Feed the structured data to an LLM for further reasoning
  const { text } = await generateText({
    model: openai("gpt-4o"),
    prompt: `You are a procurement assistant. Based on this product data, provide a purchase recommendation:\n\n${context}`,
  });

  console.log(text);
}

main();
```

### Setup

```bash
npm install ai @ai-sdk/openai
export SHOPGRAPH_API_KEY="sg_live_..."
export OPENAI_API_KEY="sk-..."
```

---

## PR #2: LangChain Cookbook

**Title:** `Add authenticated product data extraction cookbook for procurement agents (ShopGraph)`

### What

A notebook-style cookbook showing how to build a procurement agent that extracts structured product data from any retail URL with per-field confidence scores. Uses ShopGraph's authenticated extraction to handle CDN-gated sites, with confidence-aware routing to separate verified data from fields that need human review.

### Why

Procurement agents need reliable product data from supplier websites, but CDN security layers increasingly block automated access. This cookbook shows how to get structured data with transparent confidence scores, so agents can programmatically decide which fields to trust and which to escalate for review.

### Code cells

```python
# Cell 1: Setup
import requests
import json

SHOPGRAPH_API_KEY = "sg_live_..."  # Set your API key
SHOPGRAPH_URL = "https://shopgraph.dev/api/enrich"
```

```python
# Cell 2: Extract product data
def extract_product(url: str) -> dict:
    """Extract structured product data with confidence scores."""
    response = requests.post(
        SHOPGRAPH_URL,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {SHOPGRAPH_API_KEY}",
        },
        json={"url": url},
    )
    response.raise_for_status()
    return response.json()


data = extract_product(
    "https://www.grainger.com/product/DAYTON-1-2-HP-Jet-Pump-5UXK1"
)

# Response structure:
# data["product"]["product_name"]  -> "DAYTON 1/2 HP Jet Pump, Model 5UXK1"
# data["product"]["price"]["amount"]  -> 284.00
# data["product"]["price"]["currency"]  -> "USD"
# data["product"]["availability"]  -> "in_stock"
# data["product"]["confidence"]["overall"]  -> 0.93
# data["product"]["confidence"]["per_field"]["price"]  -> 0.93
# data["product"]["_shopgraph"]["field_confidence"]["price"]  -> 0.93
# data["product"]["_shopgraph"]["field_freshness"]["price"]["decayed"]  -> False
# data["cached"]  -> False
# data["credit_mode"]  -> "standard"

print(f"Product: {data['product']['product_name']}")
print(f"Price: ${data['product']['price']['amount']} {data['product']['price']['currency']}")
print(f"Overall confidence: {data['product']['confidence']['overall']}")
```

```python
# Cell 3: Confidence-aware routing
def extract_with_confidence_routing(
    url: str, confidence_threshold: float = 0.8
) -> dict:
    """
    Extract product data and route fields into verified/review/missing buckets
    based on per-field confidence scores.
    """
    data = extract_product(url)
    product = data["product"]
    meta = product["_shopgraph"]

    verified = {}
    needs_review = {}
    missing = {}

    field_map = {
        "product_name": product.get("product_name"),
        "brand": product.get("brand"),
        "description": product.get("description"),
        "price": product.get("price", {}).get("amount") if product.get("price") else None,
        "currency": product.get("price", {}).get("currency") if product.get("price") else None,
        "availability": product.get("availability"),
        "categories": product.get("categories"),
        "primary_image_url": product.get("primary_image_url"),
        "material": product.get("material"),
    }

    for field_name, value in field_map.items():
        if value is None or value == [] or value == "unknown":
            missing[field_name] = {"value": value, "reason": "not_available"}
            continue

        # Look up confidence from _shopgraph.field_confidence
        confidence = meta["field_confidence"].get(field_name, 0)

        entry = {"value": value, "confidence": confidence}

        # Check freshness for real-time fields
        freshness = meta.get("field_freshness", {}).get(field_name)
        if freshness and freshness.get("decayed"):
            entry["decayed"] = True
            needs_review[field_name] = entry
        elif confidence >= confidence_threshold:
            verified[field_name] = entry
        else:
            needs_review[field_name] = entry

    return {
        "url": product["url"],
        "extraction_method": meta["extraction_method"],
        "data_source": meta["data_source"],
        "overall_confidence": product["confidence"]["overall"],
        "verified": verified,
        "needs_review": needs_review,
        "missing": missing,
    }


result = extract_with_confidence_routing(
    "https://www.grainger.com/product/DAYTON-1-2-HP-Jet-Pump-5UXK1",
    confidence_threshold=0.85,
)

print("Verified fields:")
for field, info in result["verified"].items():
    print(f"  {field}: {info['value']} (confidence: {info['confidence']})")

print("\nNeeds review:")
for field, info in result["needs_review"].items():
    print(f"  {field}: {info['value']} (confidence: {info['confidence']})")

print("\nMissing:")
for field, info in result["missing"].items():
    print(f"  {field}: {info['reason']}")
```

```python
# Cell 4: Use with LangChain agent
from langchain.tools import tool
from langchain_openai import ChatOpenAI
from langchain.agents import AgentExecutor, create_openai_functions_agent
from langchain.prompts import ChatPromptTemplate


@tool
def enrich_product(url: str) -> str:
    """Extract structured product data with confidence scores from a product URL."""
    result = extract_with_confidence_routing(url, confidence_threshold=0.8)
    return json.dumps(result, indent=2)


llm = ChatOpenAI(model="gpt-4o")
prompt = ChatPromptTemplate.from_messages(
    [
        (
            "system",
            "You are a procurement assistant. Use the enrich_product tool to "
            "extract product data. Only trust verified fields for purchase decisions. "
            "Flag fields in needs_review for human approval.",
        ),
        ("human", "{input}"),
        ("placeholder", "{agent_scratchpad}"),
    ]
)

agent = create_openai_functions_agent(llm, [enrich_product], prompt)
executor = AgentExecutor(agent=agent, tools=[enrich_product], verbose=True)

result = executor.invoke(
    {"input": "Get product details for https://www.grainger.com/product/DAYTON-1-2-HP-Jet-Pump-5UXK1"}
)
print(result["output"])
```

---

## PR #3: CrewAI Examples

**Title:** `Add authenticated product data extraction tool for commerce agents (ShopGraph)`

### What

A complete, self-contained ShopGraph tool for CrewAI agents that extracts structured product data from any retail URL with per-field confidence scores. Ships as a single Python file (not a published package) so teams can drop it into any CrewAI project.

### Why

CrewAI agents performing commerce research (competitor analysis, price monitoring, catalog enrichment) need structured product data from retail sites. CDN security layers block most automated requests. This tool handles authenticated extraction and returns confidence-scored data, so agents can programmatically decide which fields to trust.

### shopgraph_tool.py

```python
"""
ShopGraph extraction tool for CrewAI agents.

Extracts structured product data with per-field confidence scores from any
retail URL using ShopGraph's authenticated extraction API.

Usage:
    from shopgraph_tool import ShopGraphTool

    tool = ShopGraphTool(confidence_threshold=0.8)
    # Add to your CrewAI agent's tools list
"""

import os
import json
from typing import Optional

import requests
from crewai.tools import BaseTool
from pydantic import Field


class ShopGraphTool(BaseTool):
    name: str = "shopgraph_extract"
    description: str = (
        "Extract structured product data (name, price, brand, availability, "
        "and more) with per-field confidence scores from a product URL. "
        "Returns verified fields, fields needing review, and missing fields."
    )
    confidence_threshold: float = Field(
        default=0.8,
        description="Minimum confidence score to consider a field verified.",
    )
    api_key: Optional[str] = Field(default=None, exclude=True)

    def __init__(self, confidence_threshold: float = 0.8, api_key: Optional[str] = None, **kwargs):
        super().__init__(
            confidence_threshold=confidence_threshold,
            api_key=api_key or os.environ.get("SHOPGRAPH_API_KEY"),
            **kwargs,
        )
        if not self.api_key:
            raise ValueError(
                "SHOPGRAPH_API_KEY must be set as an environment variable "
                "or passed to ShopGraphTool(api_key=...)"
            )

    def _run(self, url: str) -> str:
        """Extract product data from a URL and return confidence-routed results."""
        # Call the ShopGraph API
        response = requests.post(
            "https://shopgraph.dev/api/enrich",
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self.api_key}",
            },
            json={"url": url},
            timeout=30,
        )
        response.raise_for_status()
        data = response.json()

        product = data["product"]
        meta = product["_shopgraph"]

        # Route fields into confidence buckets
        verified = {}
        needs_review = {}
        missing = {}

        fields_to_extract = {
            "product_name": product.get("product_name"),
            "brand": product.get("brand"),
            "description": product.get("description"),
            "price_amount": (
                product["price"]["amount"] if product.get("price") else None
            ),
            "price_currency": (
                product["price"]["currency"] if product.get("price") else None
            ),
            "availability": product.get("availability"),
            "categories": product.get("categories"),
            "primary_image_url": product.get("primary_image_url"),
            "color": product.get("color"),
            "material": product.get("material"),
            "dimensions": product.get("dimensions"),
        }

        # Map composite field names back to confidence keys
        confidence_key_map = {
            "price_amount": "price",
            "price_currency": "price",
        }

        for field_name, value in fields_to_extract.items():
            if value is None or value == [] or value == "unknown":
                missing[field_name] = "not_available"
                continue

            conf_key = confidence_key_map.get(field_name, field_name)
            confidence = meta["field_confidence"].get(conf_key, 0)

            # Check if the field has decayed freshness
            freshness = meta.get("field_freshness", {}).get(conf_key)
            decayed = freshness.get("decayed", False) if freshness else False

            entry = {
                "value": value,
                "confidence": round(confidence, 2),
            }

            if decayed:
                entry["decayed"] = True
                needs_review[field_name] = entry
            elif confidence >= self.confidence_threshold:
                verified[field_name] = entry
            else:
                needs_review[field_name] = entry

        result = {
            "url": product["url"],
            "extraction_method": meta["extraction_method"],
            "data_source": meta["data_source"],
            "overall_confidence": product["confidence"]["overall"],
            "cached": data["cached"],
            "credit_mode": data["credit_mode"],
            "verified": verified,
            "needs_review": needs_review,
            "missing": missing,
        }

        return json.dumps(result, indent=2)
```

### Usage with CrewAI

```python
from crewai import Agent, Task, Crew
from shopgraph_tool import ShopGraphTool

tool = ShopGraphTool(confidence_threshold=0.85)

researcher = Agent(
    role="Product Researcher",
    goal="Extract and verify product data from supplier URLs",
    backstory="You are a procurement specialist who verifies product data quality.",
    tools=[tool],
)

task = Task(
    description="Extract product details from https://www.grainger.com/product/DAYTON-1-2-HP-Jet-Pump-5UXK1 and summarize the verified fields.",
    agent=researcher,
    expected_output="A structured summary of the product with confidence scores.",
)

crew = Crew(agents=[researcher], tasks=[task], verbose=True)
result = crew.kickoff()
print(result)
```

---

## Messaging Rules

### DO use

- "Authenticated product data extraction"
- "Handles the identity handshakes"
- "CDN security gates"
- "Per-field confidence scores"
- "Transparent confidence metadata"
- "UCP-compliant product data"
- "Confidence-aware routing"
- "Extraction method" (schema_org, llm, hybrid)

### DON'T use

- ~~deterministic~~ -- nothing in extraction is deterministic
- ~~guaranteed~~ -- confidence scores exist because guarantees don't
- ~~scraping~~ -- we do authenticated extraction, not scraping
- ~~bypass~~ -- we authenticate, not bypass
- ~~circumvent~~ -- same as bypass
- ~~unblock~~ -- implies something is blocked; we authenticate
- ~~fighting~~ -- adversarial framing is wrong
- ~~toll roads~~ (in commerce context) -- CDN gates are security, not rent-seeking
- ~~identity broker~~ -- too financial-services coded
- ~~OV identity~~ -- internal implementation detail
- ~~trust score~~ -- we use "confidence score"
- ~~"the first"~~ (unqualified) -- unverifiable claim

### Commit message templates

```
feat(cookbook): add ShopGraph extraction example for [framework]

- Authenticated product data extraction with per-field confidence
- Confidence-aware routing: verified / needs-review / missing
- Works with CDN-gated retail sites via identity handshake
```

```
docs(cookbook): add ShopGraph integration guide for [framework]

- Structured product data from any retail URL
- Per-field confidence scores (0-1) with decay metadata
- Drop-in example with [framework]-native patterns
```

### Voice check

Before submitting any PR or public-facing text, verify:

1. Does it say "authenticated extraction" (not scraping/bypassing)?
2. Does it mention "confidence scores" (not trust scores/guarantees)?
3. Does it frame CDN gates as security infrastructure (not obstacles)?
4. Is the tone collaborative (not adversarial)?
5. Are all code examples using the real response shape from `docs/api-response-reference.json`?
