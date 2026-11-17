// Pasar page: renders the directory, the private profile and the shopping plan.
import { Pasar, rupiah } from "./pasar.js";

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
    else if (value !== undefined && value !== null) node.setAttribute(key, value);
  }
  for (const child of children) if (child !== null && child !== undefined) node.append(child);
  return node;
}

const DISTRICTS = ["Kebayoran Baru", "Kebayoran Lama", "Cilandak", "Pesanggrahan", "Mampang Prapatan", "Setiabudi", "Pancoran", "Tebet", "Jagakarsa", "Pasar Minggu"];

export class App {
  static page = new Pasar({
    storage: typeof window !== "undefined" ? safeStorage() : null,
    fetcher: typeof fetch !== "undefined" ? fetch.bind(globalThis) : null,
  });

  static ready = null;

  static async start() {
    const pasar = App.page;
    pasar.onChange(App.render);
    App.renderProfile();
    document.querySelector("#clear-plan").addEventListener("click", () => pasar.clearPlan());
    const res = await fetch("./directory.json");
    pasar.setDirectory(await res.json());
    await pasar.checkShops();
  }

  static render() {
    App.renderDirectory();
    App.renderPlan();
  }

  static renderProfile() {
    const select = document.querySelector("#profile-district");
    select.append(el("option", { value: "" }, "Choose…"));
    for (const d of DISTRICTS) select.append(el("option", { value: d }, d));
    const share = document.querySelector("#profile-share");
    select.value = App.page.profile.district;
    share.checked = App.page.profile.shareDistrict;
    const update = () => App.page.setProfile({ district: select.value, shareDistrict: share.checked });
    select.addEventListener("change", update);
    share.addEventListener("change", update);
  }

  static renderDirectory() {
    const pasar = App.page;
    const list = document.querySelector("#directory");
    list.textContent = "";
    for (const shop of pasar.shops) {
      const st = pasar.status.get(shop.id) || { state: "checking" };
      const label = { checking: "Checking…", online: "Agent online", partial: "Agent incomplete", offline: "Agent unreachable" }[st.state] || st.state;
      const checks = st.checks ? el("ul", { class: "checks" }, ...st.checks.map(([text, ok]) => el("li", { class: ok ? "ok" : "bad" }, `${ok ? "✓" : "✗"} ${text}`))) : null;
      const items = st.manifest && st.manifest.umkm ? el("p", { class: "items" }, st.manifest.umkm.items.map((i) => i.name).join(" · ")) : null;
      list.append(el("article", { class: "shop-card" },
        el("div", { class: "shop-head" },
          el("h3", {}, el("a", { href: shop.page }, shop.name)),
          el("span", { class: `badge ${st.state}` }, label),
        ),
        el("p", { class: "meta" }, `${shop.category} · ${shop.districts.join(", ")}`),
        items,
        el("details", {}, el("summary", {}, "Spec checks"), el("p", { class: "small" }, "Network: ", el("code", {}, shop.network)), checks || el("p", { class: "small" }, st.error || "…")),
      ));
    }
  }

  static renderPlan() {
    const view = App.page.planView();
    const box = document.querySelector("#plan-body");
    box.textContent = "";
    const ev = view.event || {};
    const evText = [ev.title, ev.people ? `${ev.people} people` : "", ev.date ? `${ev.date}${ev.time ? " " + ev.time : ""}` : ""].filter(Boolean).join(" · ");
    document.querySelector("#plan-event").textContent = evText || "No plan yet. Ask the concierge below, for example: snacks and lunch for 30 people tomorrow at 12:00.";
    document.querySelector("#clear-plan").hidden = view.shops.length === 0;
    for (const group of view.shops) {
      const rows = group.lines.map((l) => el("tr", {},
        el("td", {}, l.itemName, l.minOk ? null : el("span", { class: "warn small" }, ` (min. ${l.minQty})`)),
        el("td", { class: "num" }, String(l.qty)),
        el("td", { class: "num" }, rupiah(l.unitPrice), " ", el("span", { class: `price-check ${l.check}`, title: { matches: "Matches the shop's published price", differs: `The shop publishes ${l.publishedPrice !== null ? rupiah(l.publishedPrice) : "?"}`, unchecked: "Not checked against the shop's manifest" }[l.check] }, { matches: "✓", differs: "≠", unchecked: "?" }[l.check])),
        el("td", { class: "num" }, rupiah(l.subtotal)),
      ));
      box.append(el("section", { class: "plan-shop" },
        el("h3", {}, group.shopName),
        el("table", {},
          el("thead", {}, el("tr", {}, el("th", {}, "Item"), el("th", { class: "num" }, "Qty"), el("th", { class: "num" }, "Price"), el("th", { class: "num" }, "Subtotal"))),
          el("tbody", {}, ...rows),
          el("tfoot", {}, el("tr", {}, el("td", { colspan: "3" }, "Subtotal"), el("td", { class: "num" }, rupiah(group.subtotal)))),
        ),
        group.orderLink ? el("a", { class: "order-btn", href: group.orderLink, target: "_blank", rel: "noopener" }, `Order at ${group.shopName} →`) : null,
      ));
    }
    document.querySelector("#plan-total").textContent = view.shops.length ? `Estimated items total ${rupiah(view.itemsTotal)}` : "";
  }
}

if (typeof window !== "undefined" && typeof document !== "undefined" && document.querySelector("#plan-body")) {
  App.ready = App.start();
}
