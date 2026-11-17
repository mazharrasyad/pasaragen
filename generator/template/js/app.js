// The shop page: renders the catalog, cart and order form, and exports the one Shop
// object that the page, site-actions.js and site.js share.
import { SHOP } from "./shop-data.js";
import { Shop, rupiah, jakartaParts } from "./shop.js";

function safeStorage() {
  try {
    const s = window.localStorage;
    s.getItem("x");
    return s;
  } catch {
    return null;
  }
}

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "class") node.className = value;
    else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value);
  }
  for (const child of children) node.append(child);
  return node;
}

export class App {
  static page = new Shop(SHOP, { storage: typeof window !== "undefined" ? safeStorage() : null });

  static start() {
    const shop = App.page;
    App.renderCatalog();
    shop.onChange(App.renderCart);
    const prefill = shop.applyDeepLink(window.location.search);
    App.prefillForm(prefill);
    App.renderCart();
    document.querySelector("#order-form").addEventListener("submit", App.submitOrder);
    document.querySelector("#lookup-form").addEventListener("submit", App.submitLookup);
    document.querySelector("#fulfilment").addEventListener("change", App.renderCart);
    document.querySelector("#order-date").addEventListener("change", App.renderCart);
    document.querySelector("#order-time").addEventListener("change", App.renderCart);
  }

  static prefillForm(prefill) {
    const today = jakartaParts(new Date());
    const dateInput = document.querySelector("#order-date");
    dateInput.min = today.date;
    if (prefill.date) dateInput.value = prefill.date;
    if (prefill.time) document.querySelector("#order-time").value = prefill.time;
    if (prefill.fulfilment && SHOP.fulfilment[prefill.fulfilment]) document.querySelector("#fulfilment").value = prefill.fulfilment;
    if (new URLSearchParams(window.location.search).get("cart")) {
      document.querySelector("#from-plan").hidden = false;
    }
  }

  static renderCatalog() {
    const grid = document.querySelector("#catalog");
    grid.textContent = "";
    for (const item of SHOP.items) {
      const qty = el("input", { type: "number", min: "0", step: "1", value: String(item.minQty), "aria-label": `Quantity of ${item.name}` });
      const add = el("button", { type: "button", onclick: () => App.page.setQty(item.id, Number(qty.value)) }, "Put in cart");
      const tags = el("p", { class: "tags" });
      for (const tag of item.tags) tags.append(el("span", { class: "tag" }, tag));
      grid.append(el("article", { class: "item", id: `item-${item.id}` },
        el("h3", {}, item.name),
        el("p", { class: "desc" }, item.description),
        tags,
        el("p", { class: "price" }, `${rupiah(item.price)} `, el("small", {}, `/ ${item.unit}`)),
        el("p", { class: "rules" }, `Min. ${item.minQty} ${item.unit} · order ${item.leadHours} h ahead`),
        el("div", { class: "add" }, qty, add),
      ));
    }
  }

  static formValues() {
    const form = document.querySelector("#order-form");
    const data = new FormData(form);
    return {
      date: data.get("date"),
      time: data.get("time"),
      fulfilment: data.get("fulfilment"),
      name: data.get("name"),
      phone: data.get("phone"),
      district: data.get("district"),
      address: data.get("address"),
      notes: data.get("notes"),
      cartVersion: App.page.cartVersion,
    };
  }

  static renderCart() {
    const shop = App.page;
    const lines = shop.cartLines();
    const list = document.querySelector("#cart-lines");
    list.textContent = "";
    if (!lines.length) list.append(el("li", { class: "empty" }, "Your cart is empty."));
    for (const line of lines) {
      const qty = el("input", { type: "number", min: "0", step: "1", value: String(line.qty), "aria-label": `Quantity of ${line.name} in cart` });
      qty.addEventListener("change", () => shop.setQty(line.itemId, Number(qty.value)));
      list.append(el("li", {},
        el("span", { class: "line-name" }, line.name),
        qty,
        el("span", { class: "line-sub" }, rupiah(line.subtotal)),
      ));
    }
    const values = App.formValues();
    const totals = shop.totals(lines, values.fulfilment);
    document.querySelector("#cart-items-total").textContent = rupiah(totals.itemsTotal);
    document.querySelector("#cart-delivery").textContent = values.fulfilment === "delivery" ? rupiah(totals.deliveryFee) : "—";
    document.querySelector("#cart-total").textContent = rupiah(totals.total);
    document.querySelector("#delivery-fields").hidden = values.fulfilment !== "delivery";
    const status = document.querySelector("#quote-status");
    if (lines.length && values.date && values.time) {
      const quote = shop.quote({ lines, date: values.date, time: values.time, fulfilment: values.fulfilment });
      status.textContent = quote.ok ? "✓ This order fits the shop's hours and notice times." : quote.reason;
      status.className = quote.ok ? "ok" : "warn";
    } else {
      status.textContent = "";
    }
  }

  static submitOrder(event) {
    event.preventDefault();
    const result = App.page.placeOrder(App.formValues());
    const box = document.querySelector("#order-result");
    box.hidden = false;
    if (!result.ok) {
      box.className = "result warn";
      box.textContent = result.reason;
      return;
    }
    box.className = "result ok";
    box.textContent = `Order ${result.order.code} received (demo). Total ${result.order.total}, ${result.order.fulfilment} on ${result.order.date} at ${result.order.time}. ${SHOP.payment}`;
    event.target.reset();
    App.renderCart();
  }

  static submitLookup(event) {
    event.preventDefault();
    const data = new FormData(event.target);
    const result = App.page.lookUpOrder(data.get("code"), data.get("phone"));
    const box = document.querySelector("#lookup-result");
    box.hidden = false;
    box.textContent = result.ok
      ? `${result.order.code}: ${result.order.status}, ${result.order.fulfilment} on ${result.order.date} ${result.order.time}, total ${result.order.total}.`
      : result.reason;
  }
}

if (typeof window !== "undefined" && typeof document !== "undefined" && document.querySelector("#catalog")) {
  App.start();
}
