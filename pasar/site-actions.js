// Pasar's operations as website_* tools (agent-manifest.json "actions.module").
// The rules live in js/pasar.js; this file only wraps them.
import { App } from "./js/app.js";

class SiteActions {
  static registerActions(actions) {
    actions.register({
      name: "get_pasar_state",
      description: "Read today's Jakarta date and time, the shops in the directory (id, name, category, delivery districts, page link, whether their agent is reachable), the visitor's district only if they allowed sharing it, and the current shopping plan with per-shop subtotals, price checks against each shop's published manifest and order links.",
      effect: "read",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      execute: async () => {
        await App.ready;
        return App.page.readState();
      },
    });

    actions.register({
      name: "set_plan",
      description: "Replace the shopping plan shown on the page with these items from shop answers. Each line needs the shop id from the directory, the exact item id and unit price the shop gave, the item name, quantity and unit. Pasar checks each price against the shop's published manifest and returns warnings for any difference. Does not order anything; the visitor orders on each shop's page.",
      effect: "write",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["event", "lines"],
        properties: {
          event: {
            type: "object",
            additionalProperties: false,
            properties: {
              title: { type: "string", maxLength: 80, description: "Short name, such as 'Arisan lunch'." },
              people: { type: "integer", minimum: 1, maximum: 5000 },
              date: { type: "string", format: "date", description: "YYYY-MM-DD, Jakarta time." },
              time: { type: "string", minLength: 5, maxLength: 5, description: "HH:MM, 24-hour, Jakarta time." },
            },
          },
          lines: {
            type: "array",
            maxItems: 30,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["shopId", "itemId", "itemName", "qty", "unitPrice"],
              properties: {
                shopId: { type: "string", description: "Shop id from website_get_pasar_state." },
                itemId: { type: "string", description: "Item id exactly as the shop gave it." },
                itemName: { type: "string", maxLength: 80 },
                qty: { type: "integer", minimum: 1, maximum: 10000 },
                unitPrice: { type: "integer", minimum: 0, description: "Price per unit in rupiah, as the shop gave it." },
                unit: { type: "string", maxLength: 20 },
              },
            },
          },
        },
      },
      execute: async (args) => {
        await App.ready;
        return App.page.setPlan(args);
      },
    });

    actions.register({
      name: "clear_plan",
      description: "Empty the shopping plan on the page. Only when the visitor asks.",
      effect: "write",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      execute: () => App.page.clearPlan(),
    });
  }
}

export const registerActions = SiteActions.registerActions;
