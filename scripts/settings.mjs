import { MODULE_ID, SETTING_KEYS } from "./config.mjs";
import ShopManager from "./applications/shop-manager.mjs";
import ShopEditor from "./applications/shop-editor.mjs";
import { Shop } from "./data/shop-data.mjs";

const { ArrayField, EmbeddedDataField } = foundry.data.fields;

/**
 * Settings definitions for Simple Shop & Craft 5e.
 * These entries are registered under {@link MODULE_ID} by {@link initSettings}.
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
 * Re-render any open shop management applications after settings change elsewhere.
 * @returns {void}
 */
function refreshShopApps() {
  foundry.applications.instances.forEach(app => {
    if ( (app instanceof ShopManager) || (app instanceof ShopEditor) ) app.render();
  });
}

/* -------------------------------------------- */

/**
 * Register all module settings.
 *
 * @returns {void}
 */
export function initSettings() {
  for ( const { key, ...data } of SETTINGS ) {
    game.settings.register(MODULE_ID, key, data);
  }
}
