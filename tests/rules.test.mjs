// Run: node --test "tests/*.test.mjs"   (after node scripts/build-all.mjs)
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Shop } from "../generator/template/js/shop.js";
import { Pasar } from "../pasar/js/pasar.js";

const load = async (id) => JSON.parse(await readFile(new URL(`../catalogs/${id}.json`, import.meta.url), "utf8"));
const memory = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
};
// Tuesday 17 Nov 2026, 09:00 in Jakarta.
const NOW = () => new Date("2026-11-17T09:00:00+07:00");

test("quote enforces minimums, notice time, hours and districts", async () => {
  const shop = new Shop(await load("dapur_bu_sri"), { now: NOW });
  const ok = shop.quote({ lines: [{ itemId: "nasi_box_ayam_bakar", qty: 30 }], date: "2026-11-18", time: "12:00", fulfilment: "delivery" });
  assert.equal(ok.ok, true);
  assert.equal(ok.total, 30 * 32000 + 0); // free delivery from Rp750.000
  assert.match(shop.quote({ lines: [{ itemId: "nasi_box_ayam_bakar", qty: 5 }], date: "2026-11-18", time: "12:00", fulfilment: "delivery" }).reason, /minimum/);
  assert.match(shop.quote({ lines: [{ itemId: "nasi_box_ayam_bakar", qty: 10 }], date: "2026-11-17", time: "18:00", fulfilment: "delivery" }).reason, /notice/);
  assert.match(shop.quote({ lines: [{ itemId: "nasi_box_ayam_bakar", qty: 10 }], date: "2026-11-22", time: "12:00", fulfilment: "delivery" }).reason, /closed on Sunday/);
  assert.match(shop.quote({ lines: [{ itemId: "nasi_box_ayam_bakar", qty: 10 }], date: "2026-11-18", time: "21:00", fulfilment: "delivery" }).reason, /outside opening hours/);
  assert.match(shop.quote({ lines: [{ itemId: "pizza", qty: 10 }], date: "2026-11-18", time: "12:00", fulfilment: "delivery" }).reason, /no item/);
  const small = shop.quote({ lines: [{ itemId: "nasi_box_sayur", qty: 10 }], date: "2026-11-18", time: "12:00", fulfilment: "delivery" });
  assert.equal(small.deliveryFee, 20000);
});

test("placing an order needs the current cart version and a delivery district", async () => {
  const shop = new Shop(await load("dapur_bu_sri"), { now: NOW, storage: memory(), random: () => 0 });
  shop.setCart([{ itemId: "nasi_box_rendang", qty: 12 }]);
  const base = { date: "2026-11-18", time: "11:00", fulfilment: "delivery", name: "Rina", phone: "0812 0000 0000", district: "Cilandak", address: "Jl. Melati 5" };
  assert.match(shop.placeOrder({ ...base, cartVersion: 0 }).reason, /cart changed/);
  assert.match(shop.placeOrder({ ...base, cartVersion: shop.cartVersion, district: "Bekasi" }).reason, /delivers to/);
  assert.match(shop.placeOrder({ ...base, cartVersion: shop.cartVersion, expectedTotal: 1 }).reason, /total is now/);
  const placed = shop.placeOrder({ ...base, cartVersion: shop.cartVersion, expectedTotal: 12 * 42000 + 20000 });
  assert.equal(placed.ok, true);
  assert.equal(shop.cartLines().length, 0);
  assert.equal(shop.lookUpOrder(placed.order.code, "081200000000").ok, true);
  assert.equal(shop.lookUpOrder(placed.order.code, "0899").ok, false);
});

test("deep links fill the cart with known items only", async () => {
  const shop = new Shop(await load("kue_mbak_ani"), { now: NOW });
  const r = shop.applyDeepLink("?cart=snack_box_3:30,bogus:4&date=2026-11-18&time=10:00");
  assert.deepEqual(shop.cartLines().map((l) => [l.itemId, l.qty]), [["snack_box_3", 30]]);
  assert.equal(r.date, "2026-11-18");
});

test("Pasar flags prices that differ from the shop's published manifest", async () => {
  const pasar = new Pasar({ now: NOW, storage: memory() });
  pasar.setDirectory({ shops: [{ id: "kue_mbak_ani", name: "Kue Mbak Ani", category: "Snacks", districts: ["Setiabudi"], page: "https://kue.example/", network: "https://kue.example/kue_mbak_ani" }] });
  pasar.status.set("kue_mbak_ani", { state: "online", manifest: { umkm: { items: [{ id: "snack_box_3", price: 12000, minQty: 20 }] } } });
  const r = pasar.setPlan({ event: { people: 30, date: "2026-11-18", time: "10:00" }, lines: [{ shopId: "kue_mbak_ani", itemId: "snack_box_3", itemName: "Snack Box", qty: 10, unitPrice: 11000 }] });
  assert.equal(r.ok, true);
  assert.equal(r.warnings.length, 1);
  const line = r.plan.shops[0].lines[0];
  assert.equal(line.check, "differs");
  assert.equal(line.minOk, false);
  assert.equal(r.plan.shops[0].orderLink, "https://kue.example/?cart=snack_box_3:10&date=2026-11-18&time=10:00&fulfilment=delivery");
  assert.equal(pasar.setPlan({ lines: [{ shopId: "nope", itemId: "x1", itemName: "x", qty: 1, unitPrice: 1 }] }).ok, false);
});

test("Pasar shares the visitor's district only when allowed", async () => {
  const pasar = new Pasar({ now: NOW, storage: memory() });
  pasar.setProfile({ district: "Cilandak", shareDistrict: false });
  assert.equal(pasar.readState().visitor.district, null);
  pasar.setProfile({ district: "Cilandak", shareDistrict: true });
  assert.equal(pasar.readState().visitor.district, "Cilandak");
});

test("generated networks publish the same prices as the catalog", async () => {
  for (const id of ["dapur_bu_sri", "kue_mbak_ani", "kurir_kampung"]) {
    const catalog = await load(id);
    const net = await readFile(new URL(`../sites/${id}/${id}.network.json`, import.meta.url), "utf8");
    const manifest = JSON.parse(await readFile(new URL(`../sites/${id}/agent-manifest.json`, import.meta.url), "utf8"));
    for (const item of catalog.items) {
      assert.ok(net.includes(`${item.id}: ${item.name}, Rp${item.price.toLocaleString("id-ID")}`), `${id}/${item.id} in network`);
      assert.equal(manifest.umkm.items.find((i) => i.id === item.id).price, item.price);
    }
  }
});
