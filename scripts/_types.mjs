/**
 * @typedef ShopPlayerDiscountData
 * @property {string} actor                    UUID of the actor this override applies to.
 * @property {number|null} buyModifier         Percent discount (negative) or markup (positive) override, replacing
 *                                             the shop's buyModifier. `null` = no override.
 * @property {number|null} sellModifier        Percent discount (negative) or markup (positive) override, replacing
 *                                             the shop's sellModifier. `null` = no override.
 * @property {boolean} hagglingLocked          Whether this actor is locked out from Haggling for this shop after a
 *                                             failed Influence check.
 * @property {number|null} hagglingTimestamp   When the lockout was set, or `null` if never locked. Reserved for a
 *                                             future calendar-based automatic reset.
 */

/* -------------------------------------------- */

/**
 * @typedef ShopItemEntryData
 * @property {string} [identifier]       Stable `system.identifier` of the referenced item.
 * @property {string} [uuid]             Direct UUID reference, used for one-off items with no `system.identifier`
 *                                       match.
 * @property {object} stock
 * @property {number|null} stock.max      Maximum stock, or `null` for unlimited.
 * @property {number|null} stock.current  Current stock, or `null` for unlimited.
 * @property {number|null} discount      Percent discount (negative) or markup (positive). `null` inherits the
 *                                       shop's buyModifier.
 * @property {boolean} noRestock         Whether this entry is excluded from stock resets.
 * @property {object} price
 * @property {number|null} price.value        Price override. `null` means use the compendium item's price.
 * @property {string} price.denomination      Currency denomination of the override.
 * @property {number|null} bundleSize    Override for how many individual items the listed price buys
 *                                       (e.g. 20 for a bundle of arrows). `null` = guess from the catalog item.
 */

/* -------------------------------------------- */

/**
 * @typedef ShopData
 * @property {string} _id                    Unique id of this shop.
 * @property {string} name                   Display name of this shop.
 * @property {string} img                    Shop image path.
 * @property {boolean} active                Whether players can currently see this shop.
 * @property {number} buyModifier            Default percent discount (negative) or markup (positive) when players
 *                                          buy; 0 = no change.
 * @property {number} sellModifier           Default percent discount (negative) or markup (positive) when this
 *                                          shop buys items back; 0 = no change.
 * @property {Set<string>} fixedValueLootTypes  Loot subtypes (e.g. gems, art objects) with a fixed market value,
 *                                          exempt from any buy/sell modifier.
 * @property {ShopPlayerDiscountData[]} playerDiscounts  Per-actor buy/sell modifier overrides.
 * @property {string} [npc]                  UUID of the NPC actor this shop is assigned to.
 * @property {string} [location]             Optional free-text location (e.g. "Baldur's Gate").
 * @property {object} settlementCap
 * @property {number|null} settlementCap.value        Max. price of the most expensive item this shop sells
 *                                                    (DMG 2024 "Settlements by Size"). `null` = no cap.
 * @property {string} settlementCap.denomination      Currency denomination of the cap.
 * @property {object} goldPool
 * @property {Record<string, number>} goldPool.max      Maximum gold pool, per denomination.
 * @property {Record<string, number>} goldPool.current  Current gold pool, per denomination.
 * @property {boolean} goldPool.unlimited                Whether this shop's buy-back funds are unlimited.
 * @property {number|null} lastRestock       World-time of the last stock/gold-pool reset, or `null` if never reset.
 * @property {string} [description]          Optional shop description.
 * @property {ShopItemEntryData[]} items     Items available in this shop.
 */
