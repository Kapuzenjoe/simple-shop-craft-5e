/**
 * Simple Shop & Craft 5e module id.
 * @type {string}
 */
export const MODULE_ID = "simple-shop-craft-5e";

/**
 * Setting keys used by this module.
 * All settings are registered under {@link MODULE_ID} using these keys.
 *
 * @readonly
 * @enum {string}
 */
export const SETTING_KEYS = {
  SHOPS: "shops"
};

/**
 * Settlement cap guideline values per DMG 2024 "Settlements by Size".
 * @type {Record<string, { label: string, value: number }>}
 */
export const SETTLEMENT_CAPS = {
  village: { label: "SIMPLE_SHOP_CRAFT_5E.ShopEditor.Village", value: 20 },
  town: { label: "SIMPLE_SHOP_CRAFT_5E.ShopEditor.Town", value: 2000 },
  city: { label: "SIMPLE_SHOP_CRAFT_5E.ShopEditor.City", value: 200000 }
};

/**
 * Default effective gold pool (in GP) used when a shop has neither an explicit gold pool
 * nor "unlimited" enabled.
 * @type {number}
 */
export const GOLD_POOL_DEFAULT = 100;
