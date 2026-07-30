/**
 * @typedef ShopItemEntryData
 * @property {string} [identifier]  Stable `system.identifier` of the referenced item.
 * @property {string} [uuid]        Direct UUID reference, used for one-off items with no `system.identifier` match.
 * @property {number|null} discount  Percent discount (negative) or markup (positive). `null` inherits the shop's buyModifier.
 * @property {{value: number|null, denomination: string}} price  Price override. `value: null` means
 *                                  use the compendium item's price.
 * @property {number|null} stock    Available quantity, or `null` for unlimited.
 */

/* -------------------------------------------- */

/**
 * @typedef ShopData
 * @property {string} _id                 Unique id of this shop.
 * @property {string} name                Display name of this shop.
 * @property {string} img                 Shop image path.
 * @property {boolean} active             Whether players can currently see this shop.
 * @property {number} buyModifier         Default percent discount (negative) or markup (positive) when players buy; 0 = no change.
 * @property {number} sellModifier        Default percent discount (negative) or markup (positive) when this shop buys items back; 0 = no change.
 * @property {string} [npc]               UUID of the NPC actor this shop is assigned to.
 * @property {string} [location]           Optional free-text location (e.g. "Baldur's Gate").
 * @property {{value: number|null, denomination: string}} settlementCap  Max. price of the most expensive
 *                                  item this shop sells (DMG 2024 "Settlements by Size"). `value: null` = no cap.
 * @property {string} [description]        Optional shop description.
 * @property {ShopItemEntryData[]} items  Items available in this shop.
 */
