import { MODULE_ID, SETTING_KEYS } from "./config.mjs";
import { Recipe } from "./data/recipe-data.mjs";
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
    onChange: refreshShopApplications
  },
  {
    config: false,
    key: SETTING_KEYS.RECIPES,
    scope: "world",
    type: new ArrayField(new EmbeddedDataField(Recipe)),
    onChange: refreshShopApplications
  }
];

/* -------------------------------------------- */

/**
 * Register all module settings and the GM-relay queries used to write them from a non-GM client.
 */
export function registerSettings() {
  for ( const { key, ...data } of SETTINGS ) {
    game.settings.register(MODULE_ID, key, data);
  }

  CONFIG.queries[`${MODULE_ID}.updateShop`] = async ({ shopId, updateData }) => {
    if ( !game.user.isGM ) return;
    await Shop.update(shopId, updateData);
  };

  CONFIG.queries[`${MODULE_ID}.spotlight`] = async ({ shopId }) => {
    if ( !shopId ) return;
    const { default: ShopSheet } = await import("./applications/shops/shop-sheet.mjs");
    new ShopSheet({ shopId }).render({ force: true });
  };
}

/* -------------------------------------------- */

/**
 * Re-render any open shop management applications after settings change elsewhere.
 * @returns {Promise<void>}
 */
async function refreshShopApplications() {
  const { default: ShopManager } = await import("./applications/shop-manager.mjs");
  const { default: ShopSheet } = await import("./applications/shops/shop-sheet.mjs");
  foundry.applications.instances.forEach(app => {
    if ( app instanceof ShopManager ) app.render();
    if ( app instanceof ShopSheet ) {
      if ( app.shop ) app.render();
      else app.close();
    }
  });
}
