import ShopManager from "./applications/shop-manager.mjs";
import { initSettings } from "./settings.mjs";
import { registerPurchaseCard } from "./chat/purchase-card.mjs";
import { Shop } from "./data/shop-data.mjs";

Hooks.once("init", () => {
  initSettings();
  registerPurchaseCard();
  foundry.applications.handlebars.loadTemplates([
    "modules/simple-shop-craft-5e/templates/partials/currency-parts.hbs"
  ]);
});

Hooks.once("i18nInit", () => {
  foundry.helpers.Localization.localizeDataModel(Shop);
});

Hooks.on("renderItemDirectory", (app, html) => {
  ShopManager.injectSidebarButton(html);
});
