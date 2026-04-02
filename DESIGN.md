# Design System: ShopGraph

## 1. Visual Theme & Atmosphere
Warm, branded, physical. A pink-toned vintage laundromat photograph serves as the full-page background — connecting to the "Laundromatic" brand identity. The design layers content cards, organic MD3 shapes, and frosted glass overlays on top of the photo. The mood is confident, distinctive, and portfolio-grade — not sterile developer documentation. The checkered floor pattern in the photo provides natural visual rhythm in the lower sections.

## 2. Color Palette & Roles

### Primary
- **Brown** `#74362d` — Primary brand color. CTAs, hero card, Extract button, radio active state, headings on dark surfaces
- **Brown hover** — Slightly darker for interactive states

### Surface & Overlays
- **White** `#ffffff` — Playground card, input fields
- **White 75%** `rgba(255,255,255,0.75)` — Frosted glass overlay on lower sections
- **Pink** `#f7cccd` — Code text on dark shape backgrounds (npm SDK, MCP Client)
- **Pink accent** — Integration pill background (soft pink, semi-transparent)

### Text
- **Black** `#000000` — Body text on white/frosted surfaces
- **White** `#ffffff` — Text on brown surfaces, nav links on photo background
- **Brown** `#74362d` — Accented text (radio labels, section keywords)

### Shapes
- **Dark brown shapes** — MD3 blobs behind npm SDK and MCP Client (opaque, dark brown matching the washing machines)
- **Pink pill** — Integration center shape (soft pink/salmon)
- **Blue bubble** — "Works with" circle (teal-blue, stands out against warm palette)

### Stats
- **Black** `#000000` — Stat numbers (bold/black weight)
- **Black** — Stat labels and descriptions

## 3. Typography Rules

### Font Families
- **Primary**: `'Google Sans Flex'` — All UI text, headings, body (variable font, weights 400-900)
- **Script**: `'Meow Script'` — "Try it" headline only. Playful accent.
- **Mono**: `'Google Sans Code'` — Code blocks, API endpoints, technical references

### Font Loading
```html
<link href="https://fonts.googleapis.com/css2?family=Google+Sans+Flex:opsz,wght@6..144,1..1000&family=Meow+Script&family=Google+Sans+Code&display=swap" rel="stylesheet">
```

### Hierarchy

| Role | Font | Size | Weight | Color | Notes |
|------|------|------|--------|-------|-------|
| Nav logo | Sans Flex | 16px | 900 (Black) | White | All caps "SHOPGRAPH" |
| Nav links | Sans Flex | 16px | 900 (Black) | White | All caps |
| Hero tagline "SHOPGRAPH" | Sans Flex | 24px | 900 (Black) | White | On brown card |
| Hero subtitle | Sans Flex | 28px | 500 (Medium) | White | Line-height 42px, on brown card |
| "Try it" | Meow Script | 86px | 400 | `#74362d` | Script accent on playground card |
| Playground body | Sans Flex | 20px | 500 | Black | |
| Radio labels | Sans Flex | 16px | 500 | `#74362d` | |
| Input text | Sans Flex | 16px | 400 | Black | |
| Button text | Sans Flex | 16px | 500 | White | On brown button |
| Section heading | Sans Flex | 48px | 400 | Black | "Where does SHOPGRAPH..." with SHOPGRAPH in 900 weight |
| Entry point titles | Sans Flex | ~18px | 700 (Bold) | Black | "From a URL: POST /api/enrich" |
| Entry point body | Sans Flex | ~16px | 500 | Black | |
| Integration title | Sans Flex | 20px | 700 | `#f7cccd` | On dark shape |
| Code text | Google Sans Code | 14px | 500 | `#f7cccd` | On dark shape backgrounds |
| Stats headline | Sans Flex | 48px | 400+900 | Black | "Tested **3,628** Product Pages" |
| Stats numbers | Sans Flex | 48px | 900 (Black) | Black | 97%, 22 |
| Stats labels | Sans Flex | 24px | 400 | Black | |
| Footer text | Sans Flex | 16px | 400-500 | Black | |

## 4. Component Stylings

### Hero Brown Card (left)
- Background: `#74362d` with 75% opacity
- Border radius: 40px
- Padding: 56px top, 44px left, 36px right, 53px bottom
- Width: ~390px, Height: ~309px

### Playground Card (center-right)
- Background: white with 75% opacity
- Border radius: 40px
- Padding: generous internal spacing
- Contains: "Try it" script heading, description, radio buttons, URL input + Extract button

### Extract Button
- Background: `#74362d`
- Text: white, 16px, medium weight
- Border radius: 16px (MD3 rounded)
- Padding: 16px 24px

### Input Field
- Background: white
- Border: 1px solid white (subtle on white card)
- Border radius: 24px (pill-shaped, MD3)
- Padding: ~16px
- Full width minus button

### Radio Buttons
- MD3 style radio buttons
- Active color: `#74362d`
- Labels: `#74362d`, 16px, medium

### MD3 Shape Blobs (Integration section)
- Organic blob shapes from Material Design 3 shape library
- Left and right: dark brown background, contain white/pink text
- Center: pink/salmon background, contains dark text
- All shapes are SVG files positioned absolutely

### "Works With" Bubble
- Blue/teal circular shape
- White text, small (centered)
- Positioned top-right of hero area

### Frosted Overlay (Lower sections)
- `background: rgba(255,255,255,0.75)`
- Covers from "Where does SHOPGRAPH fit" section through footer
- Content sits on top of the frosted glass

### Dotted Separator
- Decorative dashed/dotted border line
- Green and brown dots alternating
- Full width, between "Where it fits" and Stats sections

## 5. Layout Principles

### Page Structure (top to bottom)
1. **Nav**: Fixed, transparent over photo. Logo left, links right.
2. **Hero zone** (over photo): Brown card (left) + Playground card (right) + Works With bubble (top right)
3. **Integration zone** (over photo): Three MD3 shapes — npm SDK (left), Integration pill (center), MCP Client (right)
4. **Frosted overlay begins**
5. **"Where does SHOPGRAPH fit"**: 3-column entry points with detailed descriptions
6. **Dotted separator**
7. **Stats**: Headline + two stat columns
8. **Footer**: Simplified, two-column

### Spacing
- Full bleed background image (1792x1917, positioned top: -568px)
- Content container: centered, max-width ~1200-1400px
- Section vertical gaps: generous (the photo provides visual breathing room)

### Responsive
- Hero cards stack vertically on mobile
- Integration shapes stack vertically
- 3-column entry points become single column
- Stats stack vertically

## 6. Depth & Elevation
- No traditional shadows
- Depth created through opacity layers: photo → semi-transparent cards → content
- Frosted glass effect via `rgba(255,255,255,0.75)` over photo background

## 7. Do's and Don'ts

### Do
- Use `#74362d` brown as the primary interactive color
- Use Meow Script ONLY for the "Try it" heading
- Use organic MD3 shapes for the integration section
- Let the laundromat photo breathe — don't cover it with too many elements
- Use frosted white overlay for text-heavy sections (readability)
- Use all-caps for "SHOPGRAPH" wherever it appears as a brand name

### Don't
- Don't use the old blue (`#1a73e8`) anywhere
- Don't use rectangular cards with borders in the hero/integration area (use organic shapes)
- Don't add drop shadows — depth comes from photo layering
- Don't use Google Sans Code for body text (only for API endpoints and code)
- Don't use Meow Script for anything other than "Try it"
- Don't cover the washing machines in the hero area

## 8. Agent Prompt Guide

### Quick Color Reference
- Brown: `#74362d`
- White overlay: `rgba(255,255,255,0.75)`
- Pink text on dark: `#f7cccd`
- Body text: `#000000`
- Nav text: `#ffffff`

### Key Implementation Notes
- Background image: `/bg-laundromat.jpg` (1792x1917), positioned `top: -568px`
- Fonts: Google Sans Flex (variable), Meow Script, Google Sans Code
- MD3 shapes: SVG files in `/public/` (shape-left.svg, shape-center.svg, shape-right.svg, shape-bubble.svg)
- Frosted overlay starts at ~y=904 in the design (after integration section)
- All interactive elements use `#74362d` brown
