import { MODULE_ID } from "./config.mjs";
import { initSettings } from "./settings.mjs";
import { registerPurchaseCard } from "./chat/purchase-card.mjs";
import { Shop } from "./data/shop-data.mjs";

Hooks.once("init", () => {
  initSettings();
  registerPurchaseCard();
  foundry.applications.handlebars.loadTemplates([
    "modules/simple-shop-craft-5e/templates/partials/currency-parts.hbs",
    "modules/simple-shop-craft-5e/templates/partials/currency-inputs.hbs",
    "modules/simple-shop-craft-5e/templates/partials/item-table.hbs",
    "modules/simple-shop-craft-5e/templates/shop-manager/shop-row.hbs",
    "modules/simple-shop-craft-5e/templates/shop-editor/buy-row.hbs",
    "modules/simple-shop-craft-5e/templates/shop-editor/sell-row.hbs",
    "modules/simple-shop-craft-5e/templates/shop-editor/players-dialog-row.hbs"
  ]);

  CONFIG.queries[`${MODULE_ID}.spotlight`] = async ({ shopId }) => {
    if ( !shopId ) return;
    const { default: ShopEditor } = await import("./applications/shop-editor.mjs");
    new ShopEditor({ shopId }).render({ force: true });
  };

  Hooks.on("renderItemDirectory", async (app, html) => {
    const { default: ShopManager } = await import("./applications/shop-manager.mjs");
    ShopManager.injectSidebarButton(html);
  });
});

Hooks.once("i18nInit", () => {
  foundry.helpers.Localization.localizeDataModel(Shop);
});
