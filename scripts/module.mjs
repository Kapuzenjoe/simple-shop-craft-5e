import { registerPurchaseCard } from "./chat/purchase-card.mjs";
import { registerLocalization } from "./data/shop-data.mjs";
import { registerSettings, registerSidebarButton, registerSpotlightQuery, registerTemplates } from "./settings.mjs";

Hooks.once("init", () => {
  registerSettings();
  registerPurchaseCard();
  registerTemplates();
  registerSidebarButton();
  registerSpotlightQuery();
});

Hooks.once("i18nInit", () => {
  registerLocalization();
});
