import { MODULE_ID, SETTING_KEYS } from "./config.mjs";
import { Shop } from "./data/shop-data.mjs";

const { ArrayField, EmbeddedDataField } = foundry.data.fields;

/**
 * Settings definitions for Simple Shop & Craft 5e.
 * These entries are registered under {@link MODULE_ID} by {@link registerSettings}.
 */
const SETTINGS = [
  {
    config: false,
    key: SETTING_KEYS.SHOPS,
    scope: "world",
    type: new ArrayField(new EmbeddedDataField(Shop)),
    onChange: refreshShopApps
  }
];

/* -------------------------------------------- */

/**
 * Register all module settings.
 *
 * @returns {void}
 */
export function registerSettings() {
  for ( const { key, ...data } of SETTINGS ) {
    game.settings.register(MODULE_ID, key, data);
  }
}

/* -------------------------------------------- */

/**
 * Register the sidebar button that opens the Shop Manager from the Item Directory. Loads
 * {@link ShopManager} lazily so it isn't pulled in until the button is actually rendered.
 * @returns {void}
 */
export function registerSidebarButton() {
  Hooks.on("renderItemDirectory", async (app, html) => {
    const { default: ShopManager } = await import("./applications/shop-manager.mjs");
    ShopManager.injectSidebarButton(html);
  });
}

/* -------------------------------------------- */

/**
 * Register the GM query used to open a shop on every connected client. Loads {@link ShopSheet}
 * lazily so it isn't pulled in until a spotlight is actually received.
 * @returns {void}
 */
export function registerSpotlightQuery() {
  CONFIG.queries[`${MODULE_ID}.spotlight`] = async ({ shopId }) => {
    if ( !shopId ) return;
    const { default: ShopSheet } = await import("./applications/shop-sheet.mjs");
    new ShopSheet({ shopId }).render({ force: true });
  };
}

/* -------------------------------------------- */

/**
 * Preload Handlebars partials shared across the module's applications.
 * @returns {Promise<Function[]>}
 */
export function registerTemplates() {
  return foundry.applications.handlebars.loadTemplates([
    "modules/simple-shop-craft-5e/templates/partials/currency-parts.hbs",
    "modules/simple-shop-craft-5e/templates/partials/currency-inputs.hbs",
    "modules/simple-shop-craft-5e/templates/partials/item-table.hbs",
    "modules/simple-shop-craft-5e/templates/shop-manager/shop-row.hbs",
    "modules/simple-shop-craft-5e/templates/shop-sheet/buy-row.hbs",
    "modules/simple-shop-craft-5e/templates/shop-sheet/sell-row.hbs",
    "modules/simple-shop-craft-5e/templates/shop-sheet/players-dialog-row.hbs"
  ]);
}

/* -------------------------------------------- */

/**
 * Re-render any open shop management applications after settings change elsewhere.
 * @returns {Promise<void>}
 */
async function refreshShopApps() {
  const { default: ShopManager } = await import("./applications/shop-manager.mjs");
  const { default: ShopSheet } = await import("./applications/shop-sheet.mjs");
  foundry.applications.instances.forEach(app => {
    if ( app instanceof ShopManager ) app.render();
    if ( ( app instanceof ShopSheet ) ) {
      if ( app.shop ) app.render();
      else app.close();
    }
  });
}
