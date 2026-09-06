import DefaultsConfig from "./applications/settings/defaults-config.mjs";
import HomebrewConfig from "./applications/settings/homebrew-config.mjs";
import {
  DEFAULT_STOCK_BY_TYPE, defaultStockKey, GOLD_POOL_DEFAULT, HOURS_PER_USE, MODULE_ID, SETTING_KEYS, STOCK_MAGIC_RULES
} from "./config.mjs";
import { Recipe } from "./data/recipe-data.mjs";
import { Shop } from "./data/shop-data.mjs";

const { ArrayField, EmbeddedDataField, NumberField, StringField } = foundry.data.fields;

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
  },
  {
    config: false,
    name: "SIMPLE_SHOP_CRAFT_5E.Settings.Defaults.BuyModifier.Name",
    hint: "SIMPLE_SHOP_CRAFT_5E.Settings.Defaults.BuyModifier.Hint",
    key: SETTING_KEYS.DEFAULT_BUY_MODIFIER,
    scope: "world",
    type: new NumberField({ required: true, nullable: false, initial: 0, integer: true, min: -100, max: 200 })
  },
  {
    config: false,
    name: "SIMPLE_SHOP_CRAFT_5E.Settings.Defaults.SellModifier.Name",
    hint: "SIMPLE_SHOP_CRAFT_5E.Settings.Defaults.SellModifier.Hint",
    key: SETTING_KEYS.DEFAULT_SELL_MODIFIER,
    scope: "world",
    type: new NumberField({ required: true, nullable: false, initial: -50, integer: true, min: -100, max: 200 })
  },
  {
    config: false,
    name: "SIMPLE_SHOP_CRAFT_5E.Settings.Defaults.GoldPool.Name",
    hint: "SIMPLE_SHOP_CRAFT_5E.Settings.Defaults.GoldPool.Hint",
    key: SETTING_KEYS.DEFAULT_GOLD_POOL,
    scope: "world",
    type: new NumberField({ required: true, nullable: false, initial: GOLD_POOL_DEFAULT, integer: true, min: 0 })
  },
  {
    config: false,
    name: "SIMPLE_SHOP_CRAFT_5E.Settings.Homebrew.MaxHoursPerWorkday.Name",
    hint: "SIMPLE_SHOP_CRAFT_5E.Settings.Homebrew.MaxHoursPerWorkday.Hint",
    key: SETTING_KEYS.MAX_HOURS_PER_WORKDAY,
    scope: "world",
    type: new NumberField({ required: true, initial: HOURS_PER_USE, integer: true, min: 1 })
  },
  {
    config: false,
    name: "SIMPLE_SHOP_CRAFT_5E.Settings.Defaults.StockMagicRule.Name",
    hint: "SIMPLE_SHOP_CRAFT_5E.Settings.Defaults.StockMagicRule.Hint",
    key: SETTING_KEYS.DEFAULT_STOCK_MAGIC_RULE,
    scope: "world",
    type: new StringField({
      initial: "gear", required: true,
      choices: Object.fromEntries(Object.entries(STOCK_MAGIC_RULES).map(([k, v]) => [k, v.label]))
    })
  },
  ...Object.entries(DEFAULT_STOCK_BY_TYPE).map(([type, initial]) => ({
    config: false,
    name: `TYPES.Item.${type}Pl`,
    key: defaultStockKey(type),
    scope: "world",
    type: new NumberField({ nullable: true, integer: true, min: 0, initial })
  }))
];

/* -------------------------------------------- */

/**
 * Register all module settings and the GM-relay queries used to write them from a non-GM client.
 */
export function registerSettings() {
  for ( const { key, ...data } of SETTINGS ) {
    game.settings.register(MODULE_ID, key, data);
  }

  game.settings.registerMenu(MODULE_ID, "defaultsMenu", {
    hint: "SIMPLE_SHOP_CRAFT_5E.Settings.Defaults.Hint",
    icon: "fa-solid fa-sliders",
    label: "SIMPLE_SHOP_CRAFT_5E.Settings.Defaults.Label",
    name: "SIMPLE_SHOP_CRAFT_5E.Settings.Defaults.Name",
    restricted: true,
    type: DefaultsConfig
  });

  game.settings.registerMenu(MODULE_ID, "homebrewMenu", {
    hint: "SIMPLE_SHOP_CRAFT_5E.Settings.Homebrew.Hint",
    icon: "fa-solid fa-book",
    label: "SIMPLE_SHOP_CRAFT_5E.Settings.Homebrew.Label",
    name: "SIMPLE_SHOP_CRAFT_5E.Settings.Homebrew.Name",
    restricted: true,
    type: HomebrewConfig
  });

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
