import ShopManager from "./applications/shop-manager.mjs";
import { initSettings } from "./settings.mjs";
import { registerPurchaseCard } from "./chat/purchase-card.mjs";

Hooks.once("init", () => {
  initSettings();
  registerPurchaseCard();
});

Hooks.on("renderItemDirectory", (app, html) => {
  ShopManager.injectSidebarButton(html);
});
