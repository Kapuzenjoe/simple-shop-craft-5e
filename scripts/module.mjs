import { CraftMessageData } from "./data/craft-message.mjs";
import { InProgressCraft } from "./data/in-progress-craft.mjs";
import { ProgressSessionMessageData } from "./data/progress-session-message.mjs";
import { PurchaseMessageData } from "./data/purchase-message.mjs";
import { registerRecipeLocalization } from "./data/recipe-data.mjs";
import { Shop, registerShopLocalization } from "./data/shop-data.mjs";
import { registerSettings } from "./settings.mjs";
import { preloadHandlebarsTemplates } from "./utils.mjs";

Hooks.once("init", () => {
  registerSettings();
  Hooks.on("dnd5e.renderChatMessage", PurchaseMessageData.onRender);
  Hooks.on("dnd5e.renderChatMessage", CraftMessageData.onRender);
  Hooks.on("dnd5e.renderChatMessage", ProgressSessionMessageData.onRender);
  Hooks.on("dnd5e.postUseActivity", InProgressCraft.onPostUseActivity);
  Hooks.on("dnd5e.preUseActivity", InProgressCraft.onPreUseActivity);
  Hooks.on("dnd5e.restCompleted", InProgressCraft.onRestCompleted);
  Hooks.on("updateWorldTime", InProgressCraft.onUpdateWorldTime);
  Hooks.on("renderCharacterActorSheet", InProgressCraft.onRenderCharacterActorSheet);
  Hooks.on("updateWorldTime", Shop.onUpdateWorldTime);
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
