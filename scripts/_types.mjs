/**
 * @typedef ShopPlayerDiscountData
 * @property {string} actor                    UUID of the actor this override applies to.
 * @property {number|null} buyModifier         Percent discount (negative) or markup (positive) override, replacing
 *                                             the shop's buyModifier. `null` = no override.
 * @property {number|null} sellModifier        Percent discount (negative) or markup (positive) override, replacing
 *                                             the shop's sellModifier. `null` = no override.
 * @property {boolean} hagglingLocked          Whether this actor is locked out from Haggling for this shop after a
 *                                             failed Influence check.
 * @property {number|null} hagglingTimestamp   World time (`game.time.worldTime`) when the lockout was set, or
 *                                             `null` if never locked.
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
 * @property {object|null} generated     Recipe for a generated magic item, `null` for normal entries.
 * @property {string} generated.baseItemUuid      UUID of the base item the enchantment is applied to.
 * @property {string} generated.enchantItemUuid   UUID of the item granting the enchantment.
 * @property {string} generated.effectId          Id of the specific enchantment effect applied.
 * @property {object|null} spellScroll   Recipe for a generated spell scroll, `null` for normal entries.
 * @property {string} spellScroll.spellUuid       UUID of the spell the scroll casts.
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
 * @property {boolean} settlementCap.appliesToSell     Whether the cap also blocks selling items to this shop
 *                                                    above the cap, not just buying them. Default `true`.
 * @property {object} goldPool
 * @property {Record<string, number>} goldPool.max      Maximum gold pool, per denomination.
 * @property {Record<string, number>} goldPool.current  Current gold pool, per denomination.
 * @property {boolean} goldPool.unlimited                Whether this shop's buy-back funds are unlimited.
 * @property {Set<number>} restockWeekdays   Weekday indices (`dayOfWeek`) this shop restocks on automatically.
 *                                           Empty = disabled.
 * @property {Set<number>} closedWeekdays    Weekday indices (`dayOfWeek`) this shop is closed on. Empty = never.
 * @property {Set<string>} closedFestivals   Festival names (from the active calendar's festival day, if any) this
 *                                           shop is closed on. Empty = never.
 * @property {string} statusOverride         `""` (automatic) | `"open"` | `"closed"` — forces the shop's open
 *                                           status, bypassing hours/weekdays/festivals entirely.
 * @property {number|null} openHour          Hour (0-23) this shop opens each day, or `null` for no restriction.
 * @property {number|null} closeHour         Hour (0-23) this shop closes each day, or `null` for no restriction.
 * @property {number} openMinute             Minute (0-59) this shop opens each day.
 * @property {number} closeMinute            Minute (0-59) this shop closes each day.
 * @property {string} [description]          Optional shop description.
 * @property {ShopItemEntryData[]} items     Items available in this shop.
 */

/* -------------------------------------------- */

/**
 * @typedef RecipeMaterialData
 * @property {string} [identifier]  Stable `system.identifier` of the referenced material item.
 * @property {string} [uuid]        Direct UUID reference, used when no `system.identifier` match exists.
 */

/* -------------------------------------------- */

/**
 * @typedef RecipeData
 * @property {string} _id                        Unique id of this recipe.
 * @property {string} name                       Display name of this recipe.
 * @property {string} img                        Recipe image path.
 * @property {object} targetItem
 * @property {string} [targetItem.identifier]    Stable `system.identifier` of the item this recipe produces.
 * @property {string} [targetItem.uuid]          Direct UUID reference, used when no `system.identifier` match exists.
 * @property {RecipeMaterialData[]} materials    Fixed materials required by this recipe.
 * @property {boolean} allowFreeformMaterials    Whether players may substitute any sufficiently valuable item.
 * @property {Set<string>} unlockedFor           Actor UUIDs allowed to start this craft.
 * @property {boolean} openToAll                 Whether any actor may start this craft, ignoring `unlockedFor`.
 * @property {Record<string, number>} materialPrice  Required value of the selected materials, per denomination.
 * @property {Set<string>} toolProficiencies     Required tool proficiency keys (`CONFIG.DND5E.tools`).
 * @property {Set<string>} skillProficiencies    Alternative skill proficiency keys (`CONFIG.DND5E.skills`) — any one
 *                                               satisfies the requirement without needing an owned tool.
 * @property {boolean} allowWorkshopOverride     Whether players may claim workshop access instead of owning the tool.
 * @property {object} durationOverride
 * @property {number|null} durationOverride.value  Manual override amount. `null` uses the rules-based value.
 * @property {string} durationOverride.units       Unit for the override (`minute`, `hour`, or `day`).
 */
