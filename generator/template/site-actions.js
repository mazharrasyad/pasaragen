// Registers this shop's operations with the agent runtime (agent-manifest.json
// "actions.module"). Only names in "actions.agentTools" become website_<name> tools.
// Each action wraps a method of App.page (js/shop.js); the rules live there.
import { App } from "./js/app.js";

const ITEM_IDS = App.page.data.items.map((item) => item.id);
const FULFILMENT = Object.keys(App.page.data.fulfilment).filter((k) => App.page.data.fulfilment[k]);

const linesSchema = {
  type: "array",
  minItems: 1,
  maxItems: 20,
  description: "Items with exact ids from website_get_shop_state.",
  items: {
    type: "object",
    additionalProperties: false,
    required: ["itemId", "qty"],
    properties: {
      itemId: { type: "string", enum: ITEM_IDS },
      qty: { type: "integer", minimum: 0, maximum: 10000 },
    },
  },
};

const whenProperties = {
  date: { type: "string", format: "date", description: "Delivery or pickup date the visitor gave, YYYY-MM-DD, Jakarta time." },
  time: { type: "string", minLength: 5, maxLength: 5, description: "Delivery or pickup time the visitor gave, HH:MM 24-hour, Jakarta time." },
  fulfilment: { type: "string", enum: FULFILMENT, description: "delivery or pickup, as the visitor chose." },
};

class SiteActions {
  static registerActions(actions) {
    actions.register({
      name: "get_shop_state",
      description: "Read the shop: menu items (ids, prices, units, minimum quantities, notice hours, tags), opening hours, delivery districts and fee, payment, policies, what the shop does not offer, the current Jakarta date and time, the cart on this page with its version and total, and the last order placed in this tab.",
      effect: "read",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      execute: () => App.page.readState(),
    });

    actions.register({
      name: "quote_order",
      description: "Price items for a date, time and delivery or pickup, and check minimum quantities, opening hours and notice times. Changes nothing. Returns ok false with the shop's reason when a rule is broken.",
      effect: "read",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["lines", "date", "time", "fulfilment"],
        properties: { lines: linesSchema, ...whenProperties },
      },
      execute: (args) => App.page.quote(args),
    });

    actions.register({
      name: "set_cart",
      description: "Replace the cart on this page with these items (qty 0 removes one). The visitor can still change it on the page. Does not order. Returns the new cart and its version.",
      effect: "write",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["lines"],
        properties: { lines: { ...linesSchema, minItems: 0 } },
      },
      execute: (args) => App.page.setCart(args.lines),
    });

    actions.register({
      name: "place_order",
      description: "Place the order for the cart on this page. The browser asks the visitor to confirm first. The shop refuses a stale cartVersion or a changed total. Nothing is paid online. Returns the order code.",
      effect: "irreversible",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["cartVersion", "expectedTotal", "date", "time", "fulfilment", "name", "phone"],
        properties: {
          cartVersion: { type: "integer", minimum: 0, description: "cart.version from website_get_shop_state in this turn." },
          expectedTotal: { type: "integer", minimum: 0, description: "total in rupiah from website_quote_order in this turn." },
          ...whenProperties,
          name: { type: "string", minLength: 1, maxLength: 80, description: "Name the visitor gave." },
          phone: { type: "string", minLength: 8, maxLength: 20, description: "Phone number the visitor gave." },
          district: { type: "string", maxLength: 60, description: "Delivery district the visitor gave. Delivery only." },
          address: { type: "string", maxLength: 300, description: "Delivery address the visitor gave. Delivery only." },
          notes: { type: "string", maxLength: 500, description: "Notes the visitor gave. Optional." },
        },
      },
      execute: (args) => App.page.placeOrder(args),
    });

    actions.register({
      name: "look_up_order",
      description: "Find an order placed in this browser by its code and the phone number on it. Changes nothing.",
      effect: "read",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["code", "phone"],
        properties: {
          code: { type: "string", maxLength: 12, description: "Order code the visitor gave." },
          phone: { type: "string", maxLength: 20, description: "Phone number the visitor gave." },
        },
      },
      execute: (args) => App.page.lookUpOrder(args.code, args.phone),
    });
  }
}

export const registerActions = SiteActions.registerActions;
