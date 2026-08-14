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
  SHOPS: "shops",
  RECIPES: "recipes"
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

/**
 * Hours of progress granted per use of the "Progress Craft" activity (one downtime workday), per DMG
 * 2024 crafting rules.
 * @type {number}
 */
export const HOURS_PER_USE = 8;

/**
 * Default gp price per rarity, per DMG 2024 "Magic Item Values by Rarity".
 * @type {Record<string, { durable: number, consumable: number }>}
 */
export const RARITY_DEFAULT_PRICES = {
  common: { durable: 100, consumable: 50 },
  uncommon: { durable: 400, consumable: 200 },
  rare: { durable: 4000, consumable: 2000 },
  veryRare: { durable: 40000, consumable: 20000 },
  legendary: { durable: 200000, consumable: 100000 }
};

/**
 * Spell levels matching each rarity tier's spell scroll price/rarity, per DMG 2024 "Spell Scroll Costs".
 * @type {Record<string, number[]>}
 */
export const SPELL_SCROLL_LEVELS = {
  common: [0, 1], uncommon: [2, 3], rare: [4, 5], veryRare: [6, 7, 8], legendary: [9]
};
