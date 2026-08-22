import { registerCraftCard } from "./chat/craft-card.mjs";
import { registerPurchaseCard } from "./chat/purchase-card.mjs";
import { registerCraftProgress } from "./craft/progress.mjs";
import { registerRecipeLocalization } from "./data/recipe-data.mjs";
import { registerShopLocalization } from "./data/shop-data.mjs";
import {
  registerSettings, registerShopUpdateQuery, registerSidebarButton, registerSpotlightQuery, registerTemplates
} from "./settings.mjs";
import { registerCalendarEvents } from "./shop/calendar-events.mjs";

Hooks.once("init", () => {
  registerSettings();
  registerPurchaseCard();
  registerCraftCard();
  registerCraftProgress();
  registerCalendarEvents();
  registerTemplates();
  registerSidebarButton();
  registerSpotlightQuery();
  registerShopUpdateQuery();
});

Hooks.once("i18nInit", () => {
  registerRecipeLocalization();
  registerShopLocalization();
});
