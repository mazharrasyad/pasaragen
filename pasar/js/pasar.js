// Pasar's page state: the shop directory, the visitor's private profile and the
// shopping plan. The page, site-actions.js and the tests use these functions.

const TZ_OFFSET_MINUTES = 7 * 60;

export function rupiah(amount) {
  return "Rp" + Math.round(amount).toLocaleString("id-ID");
}

export function jakartaNow(date = new Date()) {
  const shifted = new Date(date.getTime() + TZ_OFFSET_MINUTES * 60000);
  const iso = shifted.toISOString();
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return { date: iso.slice(0, 10), time: iso.slice(11, 16), weekday: days[shifted.getUTCDay()], timezone: "Asia/Jakarta (UTC+7)" };
}

export class Pasar {
  constructor({ storage = null, now = () => new Date(), fetcher = null } = {}) {
    this.storage = storage;
    this.now = now;
    this.fetcher = fetcher;
    this.shops = [];
    this.status = new Map(); // shop id -> {state: "checking"|"online"|"offline", manifest, error}
    this.listeners = new Set();
    this.profile = this.load("profile", { district: "", shareDistrict: false });
    this.plan = this.load("plan", { version: 0, event: {}, lines: [] });
  }

  onChange(listener) {
    this.listeners.add(listener);
  }

  emit() {
    for (const listener of this.listeners) listener(this);
  }

  load(key, fallback) {
    try {
      const raw = this.storage && this.storage.getItem(`pasaragen.pasar.${key}`);
      return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
    } catch {
      return fallback;
    }
  }

  save(key, value) {
    try {
      this.storage && this.storage.setItem(`pasaragen.pasar.${key}`, JSON.stringify(value));
    } catch {
      /* the page still works for this visit */
    }
  }

  setDirectory(directory) {
    this.shops = directory.shops || [];
    this.emit();
  }

  shop(id) {
    return this.shops.find((s) => s.id === id) || null;
  }

  // ---- live check of each shop's published files ----------------------------

  /** Fetch each shop's agent-manifest.json the way any agent site would (CORS). */
  async checkShops() {
    await Promise.all(this.shops.map((s) => this.checkShop(s)));
  }

  async checkShop(shop) {
    this.status.set(shop.id, { state: "checking" });
    this.emit();
    try {
      const base = new URL(shop.network);
      const manifestUrl = new URL("agent-manifest.json", new URL("./", base)).href;
      const res = await this.fetcher(manifestUrl, { mode: "cors" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const manifest = await res.json();
      const name = base.pathname.split("/").filter(Boolean).pop();
      const entry = (manifest.networks || []).find((n) => n.name === name);
      const checks = [
        ["manifest lists the network", Boolean(entry)],
        ["front agent named", Boolean(entry && entry.front_man)],
        ["network file declared", Boolean(entry && entry.hocon)],
        ["peer policy published", Boolean(manifest.peer_policy)],
        ["action bridge for callers", Boolean(manifest.actions && manifest.actions.bridge)],
      ];
      if (entry && entry.hocon) {
        const netRes = await this.fetcher(new URL(entry.hocon, manifestUrl).href, { mode: "cors" });
        checks.push(["network file loads", netRes.ok]);
      }
      const passed = checks.every(([, ok]) => ok);
      this.status.set(shop.id, { state: passed ? "online" : "partial", manifest, checks });
    } catch (error) {
      this.status.set(shop.id, { state: "offline", error: String(error.message || error) });
    }
    this.emit();
  }

  /** The published price for an item, from the shop's own manifest, or null. */
  publishedItem(shopId, itemId) {
    const st = this.status.get(shopId);
    const items = st && st.manifest && st.manifest.umkm && st.manifest.umkm.items;
    return items ? items.find((i) => i.id === itemId) || null : null;
  }

  // ---- profile (private to this page) ----------------------------------------

  setProfile({ district, shareDistrict }) {
    this.profile = { district: String(district || "").trim(), shareDistrict: Boolean(shareDistrict) };
    this.save("profile", this.profile);
    this.emit();
  }

  // ---- plan --------------------------------------------------------------------

  planView() {
    const groups = [];
    for (const line of this.plan.lines) {
      let group = groups.find((g) => g.shopId === line.shopId);
      if (!group) {
        const shop = this.shop(line.shopId);
        group = { shopId: line.shopId, shopName: shop ? shop.name : line.shopId, page: shop ? shop.page : "", lines: [], subtotal: 0 };
        groups.push(group);
      }
      const published = this.publishedItem(line.shopId, line.itemId);
      let check = "unchecked";
      if (published) check = published.price === line.unitPrice ? "matches" : "differs";
      const minOk = published ? line.qty >= published.minQty : true;
      const subtotal = line.qty * line.unitPrice;
      group.lines.push({ ...line, subtotal, check, publishedPrice: published ? published.price : null, minQty: published ? published.minQty : null, minOk });
      group.subtotal += subtotal;
    }
    for (const group of groups) group.orderLink = this.orderLink(group);
    return {
      version: this.plan.version,
      event: this.plan.event,
      shops: groups,
      itemsTotal: groups.reduce((sum, g) => sum + g.subtotal, 0),
      note: "Estimate from each shop's published prices. Delivery fees and the final total are confirmed on each shop's page.",
    };
  }

  orderLink(group) {
    if (!group.page) return "";
    const url = new URL(group.page);
    url.searchParams.set("cart", group.lines.map((l) => `${l.itemId}:${l.qty}`).join(","));
    const ev = this.plan.event || {};
    if (ev.date) url.searchParams.set("date", ev.date);
    if (ev.time) url.searchParams.set("time", ev.time);
    url.searchParams.set("fulfilment", "delivery");
    // Only cart, date and time travel in the link: never a name, phone or address.
    return url.href.replace(/%3A/g, ":").replace(/%2C/g, ",");
  }

  setPlan({ event = {}, lines = [] }) {
    const clean = [];
    for (const line of lines) {
      if (!this.shop(line.shopId)) return { ok: false, reason: `There is no shop "${line.shopId}" in the directory.` };
      if (!/^[a-z][a-z0-9_]{1,40}$/.test(line.itemId || "")) return { ok: false, reason: `"${line.itemId}" is not an item id. Use the id the shop gave.` };
      if (!Number.isInteger(line.qty) || line.qty < 1) return { ok: false, reason: `The quantity of ${line.itemName || line.itemId} must be a whole number above 0.` };
      if (!Number.isInteger(line.unitPrice) || line.unitPrice < 0) return { ok: false, reason: `The unit price of ${line.itemName || line.itemId} must be in whole rupiah.` };
      if (clean.some((c) => c.shopId === line.shopId && c.itemId === line.itemId)) return { ok: false, reason: `${line.itemName || line.itemId} is listed twice.` };
      clean.push({ shopId: line.shopId, itemId: line.itemId, itemName: String(line.itemName || line.itemId).slice(0, 80), qty: line.qty, unitPrice: line.unitPrice, unit: String(line.unit || "").slice(0, 20) });
    }
    const ev = {
      title: String(event.title || "").slice(0, 80),
      people: Number.isInteger(event.people) ? event.people : null,
      date: /^\d{4}-\d{2}-\d{2}$/.test(event.date || "") ? event.date : "",
      time: /^\d{2}:\d{2}$/.test(event.time || "") ? event.time : "",
    };
    this.plan = { version: this.plan.version + 1, event: ev, lines: clean };
    this.save("plan", this.plan);
    this.emit();
    const view = this.planView();
    const differs = view.shops.flatMap((s) => s.lines).filter((l) => l.check === "differs");
    return {
      ok: true,
      plan: view,
      warnings: differs.map((l) => `${l.itemName}: the shop publishes ${rupiah(l.publishedPrice)}, not ${rupiah(l.unitPrice)}.`),
    };
  }

  clearPlan() {
    this.plan = { version: this.plan.version + 1, event: {}, lines: [] };
    this.save("plan", this.plan);
    this.emit();
    return { ok: true };
  }

  readState() {
    return {
      now: jakartaNow(this.now()),
      shops: this.shops.map((s) => ({
        id: s.id,
        name: s.name,
        category: s.category,
        districts: s.districts,
        page: s.page,
        agent: (this.status.get(s.id) || {}).state || "unknown",
      })),
      visitor: {
        district: this.profile.shareDistrict && this.profile.district ? this.profile.district : null,
        note: this.profile.shareDistrict ? "The visitor allows sharing this district with shops." : "The visitor has not allowed sharing a location. Do not ask shops about a specific district; ask the visitor if delivery area matters.",
      },
      plan: this.planView(),
      howOrdersWork: "Pasar never places orders. Each shop's order link opens that shop's page with the cart filled; the visitor adds their details and confirms there.",
    };
  }
}
