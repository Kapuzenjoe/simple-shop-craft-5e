import { CraftMessageData } from "./data/craft-message.mjs";
import { InProgressCraft } from "./data/in-progress-craft.mjs";
import { PurchaseMessageData } from "./data/purchase-message.mjs";
import { registerRecipeLocalization } from "./data/recipe-data.mjs";
import { Shop, registerShopLocalization } from "./data/shop-data.mjs";
import { isCalendariaActive } from "./integrations/calendaria.mjs";
import { registerSettings } from "./settings.mjs";

Hooks.once("init", () => {
  registerSettings();
  Hooks.on("dnd5e.renderChatMessage", PurchaseMessageData.onRender);
  Hooks.on("dnd5e.renderChatMessage", CraftMessageData.onRender);
  Hooks.on("dnd5e.postUseActivity", InProgressCraft.onPostUseActivity);
  Hooks.on("renderCharacterActorSheet", InProgressCraft.onRenderCharacterActorSheet);
  if ( isCalendariaActive() ) Hooks.on("calendaria.dayChange", Shop.onCalendariaDayChange);
  else Hooks.on("updateWorldTime", Shop.onUpdateWorldTime);
  Hooks.on("renderItemDirectory", async (app, html) => {
    const { default: ShopManager } = await import("./applications/shop-manager.mjs");
    ShopManager.injectSidebarButton(html);
  });
  preloadTemplates();
});

Hooks.once("i18nInit", () => {
  registerRecipeLocalization();
  registerShopLocalization();
});

/* -------------------------------------------- */

/**
 * Preload Handlebars partials shared across the module's applications.
 * @returns {Promise<Function[]>}
 */
function preloadTemplates() {
  return foundry.applications.handlebars.loadTemplates([
    "modules/simple-shop-craft-5e/templates/partials/currency-parts.hbs",
    "modules/simple-shop-craft-5e/templates/partials/currency-inputs.hbs",
    "modules/simple-shop-craft-5e/templates/partials/item-table.hbs",
    "modules/simple-shop-craft-5e/templates/partials/material-row.hbs",
    "modules/simple-shop-craft-5e/templates/shop-manager/recipe-row.hbs",
    "modules/simple-shop-craft-5e/templates/shop-manager/shop-row.hbs",
    "modules/simple-shop-craft-5e/templates/shop-sheet/buy-row.hbs",
    "modules/simple-shop-craft-5e/templates/shop-sheet/sell-row.hbs",
    "modules/simple-shop-craft-5e/templates/shop-sheet/players-dialog-row.hbs"
  ]);
}
