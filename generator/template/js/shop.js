// Business rules for one small shop. The page, the assistant's website_* tools and the
// Node tests all call these functions, so there is one set of rules.
//
// Times are Jakarta time (UTC+7, no daylight saving). Orders are a demo: they are kept
// in this browser only and nothing is paid or delivered.

const TZ_OFFSET_MINUTES = 7 * 60;
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function rupiah(amount) {
  return "Rp" + Math.round(amount).toLocaleString("id-ID");
}

/** Jakarta wall-clock parts for an instant. */
export function jakartaParts(date) {
  const shifted = new Date(date.getTime() + TZ_OFFSET_MINUTES * 60000);
  const iso = shifted.toISOString();
  return {
    date: iso.slice(0, 10),
    time: iso.slice(11, 16),
    weekday: shifted.getUTCDay(),
  };
}

/** The instant of a Jakarta date (YYYY-MM-DD) and time (HH:MM), or null when invalid. */
export function jakartaInstant(date, time) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || "")) || !/^\d{2}:\d{2}$/.test(String(time || ""))) {
    return null;
  }
  const instant = new Date(`${date}T${time}:00+07:00`);
  return Number.isNaN(instant.getTime()) ? null : instant;
}

function minutes(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export class Shop {
  /**
   * :param data: The shop catalog (shop-data.js).
   * :param options: {storage, now, random} for tests. storage is a Storage-like object.
   */
  constructor(data, options = {}) {
    this.data = data;
    this.storage = options.storage || null;
    this.now = options.now || (() => new Date());
    this.random = options.random || Math.random;
    this.cart = new Map();
    this.cartVersion = 0;
    this.listeners = new Set();
    this.lastOrder = null;
  }

  onChange(listener) {
    this.listeners.add(listener);
  }

  emit() {
    for (const listener of this.listeners) listener(this);
  }

  item(id) {
    return this.data.items.find((item) => item.id === id) || null;
  }

  // ---- reading -------------------------------------------------------------

  hoursText() {
    const days = this.data.hours.days.map((d) => DAY_NAMES[d]).join(", ");
    return `${days}, ${this.data.hours.open}–${this.data.hours.close} (Jakarta time)`;
  }

  cartLines() {
    const lines = [];
    for (const [id, qty] of this.cart) {
      const item = this.item(id);
      if (!item) continue;
      lines.push({
        itemId: id,
        name: item.name,
        qty,
        unit: item.unit,
        unitPrice: item.price,
        subtotal: item.price * qty,
      });
    }
    return lines;
  }

  totals(lines, fulfilment) {
    const itemsTotal = lines.reduce((sum, line) => sum + line.subtotal, 0);
    let deliveryFee = 0;
    if (fulfilment === "delivery" && this.data.deliveryFee > 0) {
      deliveryFee = this.data.freeDeliveryFrom > 0 && itemsTotal >= this.data.freeDeliveryFrom ? 0 : this.data.deliveryFee;
    }
    return { itemsTotal, deliveryFee, total: itemsTotal + deliveryFee };
  }

  readState() {
    const now = jakartaParts(this.now());
    const lines = this.cartLines();
    return {
      shop: {
        name: this.data.name,
        category: this.data.category,
        about: this.data.about,
        city: this.data.city,
        districts: this.data.districts.slice(),
        hours: this.hoursText(),
        fulfilment: Object.keys(this.data.fulfilment).filter((k) => this.data.fulfilment[k]),
        deliveryFee: this.data.deliveryFee,
        freeDeliveryFrom: this.data.freeDeliveryFrom,
        payment: this.data.payment,
        policies: this.data.policies.slice(),
        notOffered: this.data.cannot.slice(),
        demoNote: "This is a demo shop. Orders stay in this browser; nothing is paid, cooked or delivered.",
      },
      items: this.data.items.map((item) => ({ ...item, priceText: rupiah(item.price) })),
      now: { date: now.date, time: now.time, weekday: DAY_NAMES[now.weekday], timezone: "Asia/Jakarta (UTC+7)" },
      cart: {
        version: this.cartVersion,
        lines,
        itemsTotal: this.totals(lines, "pickup").itemsTotal,
      },
      lastOrder: this.lastOrder,
    };
  }

  // ---- checks --------------------------------------------------------------

  /**
   * Check lines against the catalog, and a date and time against hours and lead times.
   * Returns {ok:false, reason} or {ok:true, lines, ...totals}.
   */
  quote({ lines, date, time, fulfilment }) {
    if (!Array.isArray(lines) || lines.length === 0) {
      return { ok: false, reason: "The order has no items." };
    }
    const priced = [];
    const seen = new Set();
    for (const line of lines) {
      const item = this.item(line.itemId);
      if (!item) return { ok: false, reason: `There is no item "${line.itemId}" on the menu.` };
      if (seen.has(item.id)) return { ok: false, reason: `${item.name} is listed twice.` };
      seen.add(item.id);
      const qty = Number(line.qty);
      if (!Number.isInteger(qty) || qty < 1) return { ok: false, reason: `The quantity for ${item.name} must be a whole number.` };
      if (qty < item.minQty) return { ok: false, reason: `${item.name} has a minimum order of ${item.minQty} ${item.unit}.` };
      priced.push({ itemId: item.id, name: item.name, qty, unit: item.unit, unitPrice: item.price, subtotal: item.price * qty, leadHours: item.leadHours });
    }
    if (!this.data.fulfilment[fulfilment]) {
      const offered = Object.keys(this.data.fulfilment).filter((k) => this.data.fulfilment[k]).join(" or ");
      return { ok: false, reason: `${this.data.name} offers ${offered} only.` };
    }
    const when = jakartaInstant(date, time);
    if (!when) return { ok: false, reason: "Give the date as YYYY-MM-DD and the time as HH:MM." };
    const parts = jakartaParts(when);
    if (!this.data.hours.days.includes(parts.weekday)) {
      return { ok: false, reason: `${this.data.name} is closed on ${DAY_NAMES[parts.weekday]}. Open: ${this.hoursText()}.` };
    }
    if (minutes(time) < minutes(this.data.hours.open) || minutes(time) > minutes(this.data.hours.close)) {
      return { ok: false, reason: `${time} is outside opening hours. Open: ${this.hoursText()}.` };
    }
    const lead = Math.max(...priced.map((line) => line.leadHours));
    const hoursAhead = (when.getTime() - this.now().getTime()) / 3600000;
    if (hoursAhead < lead) {
      const earliest = jakartaParts(new Date(this.now().getTime() + lead * 3600000));
      return { ok: false, reason: `This order needs ${lead} hours' notice. The earliest time is ${earliest.date} ${earliest.time}, if the shop is open then.` };
    }
    const totals = this.totals(priced, fulfilment);
    return {
      ok: true,
      date,
      time,
      fulfilment,
      lines: priced,
      ...totals,
      totalText: rupiah(totals.total),
      payment: this.data.payment,
    };
  }

  checkOrder(args) {
    if (args.cartVersion !== this.cartVersion) {
      return { ok: false, reason: "The cart changed since it was read. Read the page again." };
    }
    const lines = this.cartLines();
    const quote = this.quote({ lines, date: args.date, time: args.time, fulfilment: args.fulfilment });
    if (!quote.ok) return quote;
    if (args.expectedTotal !== undefined && args.expectedTotal !== quote.total) {
      return { ok: false, reason: `The total is now ${rupiah(quote.total)}, not ${rupiah(args.expectedTotal)}. Check it with the visitor.` };
    }
    const name = String(args.name || "").trim();
    const phone = String(args.phone || "").trim();
    const district = String(args.district || "").trim();
    const address = String(args.address || "").trim();
    if (!name) return { ok: false, reason: "A name for the order is needed.", field: "name" };
    if (!/^[0-9+\-\s]{8,20}$/.test(phone)) return { ok: false, reason: "A phone number (8–20 digits) is needed.", field: "phone" };
    if (args.fulfilment === "delivery") {
      if (!this.data.districts.includes(district)) {
        return { ok: false, reason: `${this.data.name} delivers to ${this.data.districts.join(", ")} only.`, field: "district" };
      }
      if (address.length < 8) return { ok: false, reason: "A delivery address is needed.", field: "address" };
    }
    return {
      ok: true,
      quote,
      customer: { name, phone, district: args.fulfilment === "delivery" ? district : "", address: args.fulfilment === "delivery" ? address : "", notes: String(args.notes || "").trim() },
    };
  }

  // ---- changing state ------------------------------------------------------

  /** Replace the cart. Reversible: the visitor can edit it on the page. */
  setCart(lines) {
    const next = new Map();
    for (const line of lines || []) {
      const item = this.item(line.itemId);
      if (!item) return { ok: false, reason: `There is no item "${line.itemId}" on the menu.` };
      const qty = Number(line.qty);
      if (!Number.isInteger(qty) || qty < 0 || qty > 10000) return { ok: false, reason: `The quantity for ${item.name} must be a whole number.` };
      if (qty > 0) next.set(item.id, qty);
    }
    this.cart = next;
    this.cartVersion += 1;
    this.emit();
    const lines2 = this.cartLines();
    return { ok: true, cartVersion: this.cartVersion, lines: lines2, itemsTotal: this.totals(lines2, "pickup").itemsTotal };
  }

  setQty(itemId, qty) {
    const lines = this.cartLines().filter((line) => line.itemId !== itemId).map(({ itemId: id, qty: q }) => ({ itemId: id, qty: q }));
    if (qty > 0) lines.push({ itemId, qty });
    return this.setCart(lines);
  }

  orderCode() {
    const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let i = 0; i < 5; i += 1) code += letters[Math.floor(this.random() * letters.length)];
    const prefix = this.data.name.split(/\s+/).map((w) => w[0]).join("").toUpperCase().slice(0, 3);
    return `${prefix}-${code}`;
  }

  placeOrder(args) {
    const check = this.checkOrder(args);
    if (!check.ok) return check;
    const order = {
      code: this.orderCode(),
      status: "received (demo)",
      placedAt: jakartaParts(this.now()),
      ...check.quote,
      customer: check.customer,
    };
    const orders = this.readOrders();
    orders.push(order);
    this.writeOrders(orders);
    this.lastOrder = { code: order.code, total: order.totalText, date: order.date, time: order.time, fulfilment: order.fulfilment };
    this.cart = new Map();
    this.cartVersion += 1;
    this.emit();
    return { ok: true, order: { code: order.code, status: order.status, date: order.date, time: order.time, fulfilment: order.fulfilment, lines: order.lines, total: order.totalText, payment: order.payment } };
  }

  lookUpOrder(code, phone) {
    const order = this.readOrders().find((o) => o.code === String(code || "").trim().toUpperCase());
    if (!order || order.customer.phone.replace(/\D/g, "") !== String(phone || "").replace(/\D/g, "")) {
      return { ok: false, reason: "No order in this browser matches that code and phone number." };
    }
    return { ok: true, order: { code: order.code, status: order.status, date: order.date, time: order.time, fulfilment: order.fulfilment, lines: order.lines, total: order.totalText } };
  }

  // ---- storage ---------------------------------------------------------------

  storageKey() {
    return `pasaragen.orders.${this.data.id}`;
  }

  readOrders() {
    try {
      const raw = this.storage && this.storage.getItem(this.storageKey());
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  writeOrders(orders) {
    try {
      this.storage && this.storage.setItem(this.storageKey(), JSON.stringify(orders));
    } catch {
      /* private mode: the order still shows on the page */
    }
  }

  /** Apply ?cart=id:qty,id:qty from a deep link (Pasar plans link here). */
  applyDeepLink(search) {
    const params = new URLSearchParams(search || "");
    const cart = params.get("cart");
    const result = { date: params.get("date") || "", time: params.get("time") || "", fulfilment: params.get("fulfilment") || "" };
    if (!cart) return result;
    const lines = [];
    for (const part of cart.split(",")) {
      const [itemId, qty] = part.split(":");
      if (this.item(itemId) && Number.isInteger(Number(qty))) lines.push({ itemId, qty: Number(qty) });
    }
    if (lines.length) this.setCart(lines);
    return result;
  }
}
