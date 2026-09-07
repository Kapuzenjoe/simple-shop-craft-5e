import { DEFAULT_STOCK_BY_TYPE, defaultStockKey, SETTING_KEYS } from "../../config.mjs";

import BaseSettingsConfig from "./base-config.mjs";

/**
 * Global default values applied when creating a new shop.
 */
export default class DefaultsConfig extends BaseSettingsConfig {

  /** @override */
  static DEFAULT_OPTIONS = {
    window: {
      icon: "fa-solid fa-sliders",
      title: "SIMPLE_SHOP_CRAFT_5E.Settings.Defaults.Name"
    }
  };

  /* -------------------------------------------- */

  /** @override */
  static FIELDSETS = [
    {
      legend: "SIMPLE_SHOP_CRAFT_5E.Settings.Defaults.Groups.ShopDefaults",
      keys: [
        SETTING_KEYS.DEFAULT_BUY_MODIFIER, SETTING_KEYS.DEFAULT_SELL_MODIFIER, SETTING_KEYS.DEFAULT_GOLD_POOL,
        SETTING_KEYS.DEFAULT_STOCK_MAGIC_RULE, ...Object.keys(DEFAULT_STOCK_BY_TYPE).map(type => defaultStockKey(type))
      ]
    }
  ];
}
