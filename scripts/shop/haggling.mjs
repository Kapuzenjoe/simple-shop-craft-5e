/**
 * @import { ShopPlayerDiscount } from "../data/shop-data.mjs";
 */

/**
 * Whether an actor is currently locked out from Haggling for this shop after a failed Influence check.
 * @param {ShopPlayerDiscount[]} playerDiscounts
 * @param {string} [actorUuid]
 * @returns {boolean}
 */
export function isHagglingLocked(playerDiscounts, actorUuid) {
  return !!(actorUuid && playerDiscounts.find(pd => pd.actor === actorUuid)?.hagglingLocked);
}
