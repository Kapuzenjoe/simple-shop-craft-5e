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
 * @readonly
 * @enum {number}
 */
export const SETTLEMENT_CAPS = {
  village: 20,
  town: 2000,
  city: 200000
};

/**
 * Default effective gold pool (in GP) used when a shop has neither an explicit gold pool
 * nor "unlimited" enabled.
 * @type {number}
 */
export const GOLD_POOL_DEFAULT = 100;
