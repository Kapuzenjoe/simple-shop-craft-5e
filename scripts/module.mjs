import { registerCraftCard } from "./chat/craft-card.mjs";
import { registerPurchaseCard } from "./chat/purchase-card.mjs";
import { registerCraftProgress } from "./craft/progress.mjs";
import { registerRecipeLocalization } from "./data/recipe-data.mjs";
import { registerShopLocalization } from "./data/shop-data.mjs";
import { registerSettings, registerSidebarButton, registerSpotlightQuery, registerTemplates } from "./settings.mjs";

Hooks.once("init", () => {
  registerSettings();
  registerPurchaseCard();
  registerCraftCard();
  registerCraftProgress();
  registerTemplates();
  registerSidebarButton();
  registerSpotlightQuery();
});

Hooks.once("i18nInit", () => {
  registerRecipeLocalization();
  registerShopLocalization();
});
