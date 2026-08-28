import { CraftMessageData } from "./data/craft-message.mjs";
import { InProgressCraft } from "./data/in-progress-craft.mjs";
import { PurchaseMessageData } from "./data/purchase-message.mjs";
import { registerRecipeLocalization } from "./data/recipe-data.mjs";
import { Shop, registerShopLocalization } from "./data/shop-data.mjs";
import { isCalendariaActive } from "./integrations/calendaria.mjs";
import { registerSettings } from "./settings.mjs";
import { preloadHandlebarsTemplates } from "./utils.mjs";

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
  preloadHandlebarsTemplates();
});

Hooks.once("i18nInit", () => {
  registerRecipeLocalization();
  registerShopLocalization();
});
