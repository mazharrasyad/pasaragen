# PasarAgen: an open agentic web for small shops

**One ask, many small shops.** PasarAgen lets any small business (UMKM) publish its own
open agentic website from a simple catalog file. **Pasar**, a buyer concierge, asks those
shops' *own* agents and compares their answers. It then hands the visitor order links
that open each shop's page with the cart already filled. There is no platform in the
middle, no commission and no lock-in. Every site follows the
[Worldwide Agentic Web MVP spec](https://github.com/cognizant-ai-labs/agentic-web).

Built by HackRasaz for the [Open Agentic Web Challenge](https://cognizant-agenticweb.devpost.com/).

## What is in this repository

| Part | What it does |
| --- | --- |
| `generator/agentify-umkm.mjs` | **Agentify UMKM.** Turns one catalog JSON file into a complete open agentic website. Output: shop page with cart and orders, agent network, manifest, bridge and browser runtime. |
| `catalogs/` | Three fictional demo shops: Dapur Bu Sri (catering), Kue Mbak Ani (snacks), Kurir Kampung (local delivery). |
| `pasar/` | The buyer site. The concierge network calls each shop's network as a partner, after the visitor agrees on a consent card. It writes a shopping plan and checks every price against the shop's published manifest. |
| `scripts/` | `build-all.mjs` builds every site for an environment. `serve-all.mjs` serves them locally on separate origins. |
| `vendor/agentify-website/` | The agentic-web reference skill: browser runtime, build checks and templates (Apache 2.0). It is unchanged apart from LF line endings. |
| `tests/` | Node tests for the shop rules, the plan's price checks and the privacy toggle. They also check that the generated networks publish the catalog's prices. |

## How it works

1. **Every shop owns its agent.** The generator compiles the catalog into the site's
   `website_*` tools (read the shop, quote, set cart, place order with a confirmation
   dialog, look up an order). It also compiles a published price list into the
   network's peer rules. The page and the agent therefore share one set of facts, and
   another site's agent can still answer with real prices.
2. **The visitor asks Pasar once.** The concierge reads the directory. It asks only the
   shops that fit, with a request under 140 characters, and a consent card shows each
   request before anything is fetched.
3. **Shops answer in the visitor's browser.** The shop's network runs on Pasar's page,
   on the visitor's own model and key. The shop never sees the key, the chat or any
   personal details.
4. **Prices are verified.** Pasar compares every line of the plan with `umkm.items` in
   the shop's own `agent-manifest.json`. A wrong number shows `≠` and returns a warning
   to the agent.
5. **The visitor orders at the shop.** "Order at …" opens
   `shop/?cart=id:qty&date=…&time=…`. The URL carries no name, phone or address. The
   shop's own assistant can finish the order, and the shop's dialog asks the visitor to
   confirm.

The visitor's district stays private to Pasar. The concierge can read it, and tell shops,
only when the visitor ticks *Let the concierge tell shops my district*.

## Run it locally

Requires Node.js 22 or newer.

```bash
node scripts/build-all.mjs
node scripts/serve-all.mjs
```

Open http://127.0.0.1:8100/ (Pasar). The shops are on http://localhost:8101, 8102 and
8103. Open **⚙ AI model settings**, select **Google AI Studio** (free tier) or **Groq**, paste your
own key and select **Save and start**. The key stays in your browser. Tested with
`models/gemini-3.5-flash`.

```bash
node --test "tests/*.test.mjs"
```

## Agentify your own shop

1. Copy `catalogs/kue_mbak_ani.json` and fill in your items, hours, delivery districts
   and policies.
2. Run the generator:

   ```bash
   node generator/agentify-umkm.mjs catalogs/my_shop.json --out sites/my_shop --page-url https://my-shop.example/
   ```

3. Upload `sites/my_shop` to any static host that sends CORS headers on the public files
   (see `vendor/agentify-website/references/bundle_and_hosting.md`).
4. Add the shop to Pasar's directory with a pull request.

## Runtime fixes for Gemini

The vendored runtime has two small fixes in `runtime/llm.js`, covered by
`tests/llm-stream.test.mjs`, so that Gemini 3 works through Google's OpenAI-compatible
endpoint. It keeps each tool call's `thought_signature`, and it no longer merges parallel tool
calls that share a stream index. The Google AI Studio preset in `runtime/ui.js` now uses
`models/gemini-3.5-flash`.

## Limits

- The demo shops are fictional. Orders stay in the browser, and nothing is paid, cooked
  or delivered.
- A partner network gets none of a shop's `website_*` tools. A caller therefore sees the
  published price list, not live stock. The shop confirms the final total on its own
  page.
- The runtime allows at most 4 partner calls per visitor message, 1 per shop.

## License

Apache 2.0. The runtime and tooling in `vendor/` come from
[cognizant-ai-labs/agentic-web](https://github.com/cognizant-ai-labs/agentic-web) (Apache 2.0).

## Live demo

- Pasar: https://pasar.187-124-138-96.sslip.io/
- Dapur Bu Sri: https://dapur-bu-sri.187-124-138-96.sslip.io/
- Kue Mbak Ani: https://kue-mbak-ani.187-124-138-96.sslip.io/
- Kurir Kampung: https://kurir-kampung.187-124-138-96.sslip.io/

Each site has its own origin, so every shop call goes through the runtime's consent card.
`deploy/nginx.conf` holds the headers: CORS on the public agent files, the sandbox
worker's CSP and the `.mjs` type. Deploy with `node scripts/build-all.mjs prod` and copy
`sites/<id>` to `/var/www/pasaragen/<id>`.
