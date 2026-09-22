/**
 * @typedef ShopPlayerDiscountData
 * @property {string} actor                    UUID of the actor this override applies to.
 * @property {number|null} buyModifier         Percent discount (negative) or markup (positive) override, replacing
 *                                             the shop's buyModifier. `null` = no override.
 * @property {number|null} sellModifier        Percent discount (negative) or markup (positive) override, replacing
 *                                             the shop's sellModifier. `null` = no override.
 * @property {Record<string, number>} hagglingLocks  Map of Charisma skill id to the world time
 *                                                    (`game.time.worldTime`) its Influence check last failed.
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
 * @property {string} restockMode        `"normal"` | `"unlimited"` | `"exclude"` — how this entry behaves on
 *                                       restock.
 * @property {object} price
 * @property {number|null} price.value        Price override. `null` means use the compendium item's price.
 * @property {string} price.denomination      Currency denomination of the override.
 * @property {number|null} bundleSize    Override for how many individual items the listed price buys
 *                                       (e.g. 20 for a bundle of arrows). `null` = guess from the catalog item.
 * @property {object|null} generated     Recipe for a generated magic item, `null` for normal entries.
 * @property {string} generated.baseItemUuid      UUID of the base item the enchantment is applied to.
 * @property {string} generated.enchantItemUuid   UUID of the item granting the enchantment.
 * @property {string} generated.effectId          Id of the specific enchantment effect applied.
 * @property {string} generated.spellUuid         UUID of the spell bound into an Enspelled item, empty otherwise.
 * @property {object|null} spellScroll   Recipe for a generated spell scroll, `null` for normal entries.
 * @property {string} spellScroll.spellUuid       UUID of the spell the scroll casts.
 * @property {boolean} isService         Whether this entry is a service (Services tab) instead of a normal item.
 * @property {LodgingBlueprintData|null} lodging  Lodging blueprint, `null` for non-lodging entries.
 * @property {HirelingBlueprintData|null} hireling  Hireling blueprint, `null` for non-hireling entries.
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
 * @property {boolean} goldPool.sellDisabled             Whether this shop is purchase-only (doesn't buy from
 *                                                       players at all).
 * @property {object} stockDefaults
 * @property {Record<string, number|null>} stockDefaults.byType  Default max stock per item type, for entries
 *                                                    with no per-item override. `null` per type = unlimited.
 * @property {string} stockDefaults.magicRule         `"all"` | `"none"` | `"gear"` — which magic items skip
 *                                                    the type default above and start unlimited instead.
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
 * @property {RecipeMaterialCriteria|null} [criteria]  Type/subtype/value rule instead of a fixed reference.
 * @property {boolean} required     Whether this slot must have a resolved match to start crafting.
 * @property {number} quantity      Number of matching units required to fully satisfy this slot.
 * @property {object} value               Crafting value per contributed unit: for a fixed reference, an
 *                                         override of the item's own price; for a criteria rule, the
 *                                         qualifying minimum and the value credited per unit.
 * @property {number|null} value.value    The amount. `null` means no override (fixed) or no minimum (criteria).
 * @property {string} value.denomination  Currency denomination for the override.
 */

/* -------------------------------------------- */

/**
 * @typedef RecipeMaterialCriteria
 * @property {string} type             Item type (`CONFIG.Item.dataModels` key).
 * @property {string} [subtype]        Item subtype within `type`, if applicable.
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
 * @property {number} targetQuantity              Units produced per craft (e.g. 20 for a stack of arrows).
 * @property {RecipeMaterialData[]} materials    Fixed materials required by this recipe.
 * @property {boolean} allowFreeformMaterials    Whether players may substitute any sufficiently valuable item.
 * @property {boolean} ignoreCraftValue           Whether this recipe requires only material presence, ignoring
 *                                                the crafting-value threshold entirely.
 * @property {Set<string>} unlockedFor           Actor UUIDs allowed to start this craft.
 * @property {string} unlockMode                 Who else may start this craft, in addition to `unlockedFor`:
 *                                                `"individual"` (only `unlockedFor`), `"all"` (any actor), or
 *                                                `"toolProficiency"` (any actor proficient in `toolProficiencies`).
 * @property {Record<string, number>} materialPrice  Required value of the selected materials, per denomination.
 * @property {Set<string>} toolProficiencies     Required tool proficiency keys (`CONFIG.DND5E.tools`) — any one
 *                                               satisfies the tool requirement.
 * @property {Set<string>} skillProficiencies    Required skill proficiency keys (`CONFIG.DND5E.skills`) — any one
 *                                               satisfies the skill requirement.
 * @property {string} proficiencyMode            How `toolProficiencies` and `skillProficiencies` combine:
 *                                                `"both"` (at least one tool and one skill), `"either"` (at least
 *                                                one tool or skill), or `"all"` (every listed tool and skill).
 * @property {boolean} allowWorkshopOverride     Whether players may claim workshop access instead of owning the tool.
 * @property {object} durationOverride
 * @property {number|null} durationOverride.value  Manual override amount. `null` uses the rules-based value.
 * @property {string} durationOverride.units       Unit for the override (`minute`, `hour`, or `day`).
 * @property {object|null} spellScroll             Spell-scroll mode config, or `null` for a normal recipe.
 * @property {number} spellScroll.level             Spell level this recipe produces a scroll for (0 = cantrip).
 * @property {string} spellScroll.spellSource       Which of the actor's spells are eligible: `"prepared"`,
 *                                                  `"owned"`, or `"compendium"`.
 */

/* -------------------------------------------- */

/**
 * @typedef InProgressCraftData
 * @property {string} recipeId                 Id of the recipe this craft was started from.
 * @property {object} targetItem
 * @property {string} [targetItem.identifier]  Stable `system.identifier` of the item this craft produces.
 * @property {string} [targetItem.uuid]        Direct UUID reference, used when no `system.identifier` match exists.
 * @property {number} targetQuantity           Units to produce when this craft completes.
 * @property {string} spellUuid                Chosen spell UUID for a spell-scroll craft, or blank.
 * @property {{ dc: number, bonus: number }|null} scrollValues  Save DC/attack bonus for the crafted scroll.
 * @property {string} activityId               Id of the "Progress Craft" activity on the tracked item.
 * @property {number} totalHours               Total progress hours needed to finish the craft.
 * @property {number|null} hoursPerUse         Progress hours added per activation. `null` uses the module default.
 * @property {number} progress                 Progress hours accumulated so far.
 * @property {number|null} pendingStart        World time a calendar-mode progress session started, or `null` if
 *                                             none is running.
 * @property {number|null} pendingHours        Hours planned for the current calendar-mode progress session.
 * @property {string} pendingMessageId         Id of the chat message announcing the pending session, so it
 *                                             can be marked resolved once the session ends.
 */

/* -------------------------------------------- */

/**
 * @typedef EnchantedItemBlueprintData
 * @property {string} baseItemUuid      UUID of the base item the enchantment is applied to.
 * @property {string} enchantItemUuid   UUID of the item granting the enchantment.
 * @property {string} effectId          Id of the specific enchantment effect applied.
 * @property {string} spellUuid         UUID of the spell bound into an Enspelled item, empty otherwise.
 * @property {string} img               Icon override, falls back to the base item's own icon.
 * @property {string} identifier        Identifier override, falls back to the resolved enchant identifier.
 */

/* -------------------------------------------- */

/**
 * @typedef SpellScrollBlueprintData
 * @property {string} spellUuid  UUID of the spell the scroll casts.
 * @property {string} img         Icon override, falls back to the generated scroll's own icon.
 * @property {string} identifier  Identifier override, falls back to the resolved scroll identifier.
 */

/* -------------------------------------------- */

/**
 * @typedef LodgingBlueprintData
 * @property {string} tier         Lodging tier key (`LODGING_TIERS`).
 * @property {string} name         Display name override, falls back to the tier's own name.
 * @property {string} description  Description text.
 * @property {string} img          Icon path.
 */

/* -------------------------------------------- */

/**
 * @typedef HirelingBlueprintData
 * @property {string} type          Hireling type key (`HIRELING_TYPES`).
 * @property {string} name          Display name override, falls back to the type's own name.
 * @property {string} description   Description text.
 * @property {string} img           Icon path override; falls back to the linked actor's image, then a
 *                                  generic placeholder.
 * @property {string} actorUuid     Optional UUID of a linked Actor.
 */

/* -------------------------------------------- */

/**
 * @typedef CraftMaterialLine
 * @property {string} itemId    Id of the contributed item.
 * @property {string} name      Display name of the contributed item.
 * @property {string} img       Image path of the contributed item.
 * @property {number} quantity  Quantity contributed from this item.
 */

/* -------------------------------------------- */

/**
 * @typedef CraftMessageCardData
 * @property {string} status                     Status of the pending craft: "pending", "accepted", or "rejected".
 * @property {string} recipeId                   Id of the recipe this craft was started from.
 * @property {object} targetItem
 * @property {string} [targetItem.identifier]     Stable `system.identifier` of the produced item.
 * @property {string} [targetItem.uuid]           Direct UUID reference, used when no `system.identifier` match exists.
 * @property {number} targetQuantity              Units to produce when this craft completes.
 * @property {string} targetName                  Display name of the produced item.
 * @property {string} targetImg                   Image path of the produced item.
 * @property {string} spellUuid                   Chosen spell UUID for a spell-scroll craft, or blank.
 * @property {{ dc: number, bonus: number }|null} scrollValues  Save DC/attack bonus for the crafted scroll.
 * @property {string} actorUuid                   UUID of the crafting actor.
 * @property {string} actorName                   Display name of the crafting actor.
 * @property {string|null} toolKey                Tool proficiency key used, or `null` if none required.
 * @property {CraftMaterialLine[]} materialLines   Materials contributed toward this craft.
 * @property {number} goldCP                      Copper amount filled in from the actor's own currency.
 * @property {number} totalHours                  Total progress hours needed to finish the craft.
 * @property {number|null} hoursPerUse            Progress hours added per activation. `null` uses the module default.
 * @property {object} weight
 * @property {number} weight.value                Weight of the produced item.
 * @property {string} weight.units                Weight unit of the produced item.
 * @property {object} halfPrice
 * @property {number} halfPrice.value             Half the produced item's market price, for refund display.
 * @property {string} halfPrice.denomination      Currency denomination of `halfPrice.value`.
 */

/* -------------------------------------------- */

/**
 * @typedef ProgressSessionMessageCardData
 * @property {boolean} resolved     Whether this session has ended, hiding its "End Progress" action.
 * @property {string} itemUuid      UUID of the in-progress craft item this session belongs to.
 * @property {string} actorUuid     UUID of the crafting actor.
 * @property {string} actorName     Display name of the crafting actor.
 * @property {string} itemName      Display name of the in-progress craft item.
 * @property {string} itemImg       Image path of the in-progress craft item.
 * @property {number} pendingHours  Hours planned for this session.
 */

/* -------------------------------------------- */

/**
 * @typedef CurrencyPart
 * @property {string} denomination  Currency denomination.
 * @property {number} value         Amount in this denomination.
 */

/* -------------------------------------------- */

/**
 * @typedef PurchaseBuyLine
 * @property {string} [_id]                                 Stable id, used when neither identifier nor uuid is set.
 * @property {string} [identifier]                         Stable `system.identifier` of the referenced item.
 * @property {string} [uuid]                                Direct UUID reference, used when no `system.identifier`
 *                                                          match exists.
 * @property {EnchantedItemBlueprintData|null} generated    Enchant-generation blueprint, `null` for normal items.
 * @property {SpellScrollBlueprintData|null} spellScroll    Spell-scroll blueprint, `null` for normal items.
 * @property {boolean} [isService]                          Whether this is a Services-tab entry — money-only,
 *                                                          no item transfer on purchase.
 * @property {string} name                                  Display name of the purchased item.
 * @property {string} img                                   Image path of the purchased item.
 * @property {number} quantity                              Quantity purchased.
 * @property {number} priceCP                                Price per unit, in copper.
 * @property {number} bundleSize                             Units the listed price buys (e.g. 20 for a bundle).
 * @property {CurrencyPart[]} subtotal                       Line subtotal, broken down by denomination.
 */

/* -------------------------------------------- */

/**
 * @typedef PurchaseSellLine
 * @property {string} itemId           Id of the sold item.
 * @property {string} identifier       Stable `system.identifier` of the sold item.
 * @property {string} name             Display name of the sold item.
 * @property {string} img              Image path of the sold item.
 * @property {number} quantity         Quantity sold.
 * @property {number} priceCP          Price per unit, in copper.
 * @property {CurrencyPart[]} subtotal Line subtotal, broken down by denomination.
 */

/* -------------------------------------------- */

/**
 * @typedef PurchaseMessageCardData
 * @property {string} status                Status of the pending transaction: "pending", "accepted", or "rejected".
 * @property {string} shopId                Id of the shop this purchase was made through.
 * @property {string} shopName              Display name of the shop.
 * @property {string} shopImg               Image path of the shop.
 * @property {string} actorUuid             UUID of the purchasing actor.
 * @property {string} actorName             Display name of the purchasing actor.
 * @property {PurchaseBuyLine[]} buyLines   Items being bought from the shop.
 * @property {PurchaseSellLine[]} sellLines Items being sold to the shop.
 * @property {CurrencyPart[]} total         Net transaction total, broken down by denomination.
 * @property {number} netCP                 Net transaction total, in copper (positive = actor pays).
 */

/* -------------------------------------------- */

/**
 * @typedef GeneratorCandidate
 * @property {"item"|"spell"|"template"} kind
 * @property {number} weight  How likely the candidate is drawn, relative to the others.
 * @property {object} [index]  Compendium index entry, for items and spells.
 * @property {Item5e} [item]  The enchant item, for templates.
 * @property {GeneratorTemplateProfile[]} [profiles]  The enchantment profiles that can be drawn, for templates.
 */

/* -------------------------------------------- */

/**
 * @typedef GeneratorTemplateProfile
 * @property {EnchantActivity} activity  The enchant Activity offering the profile.
 * @property {ActiveEffect5e} effect  The profile's enchantment effect.
 * @property {number} level  Position of the profile among all of the item's profiles.
 * @property {string} rarity  Rarity given by the profile's enchantment.
 * @property {string[]} baseItems  UUIDs of the base items the profile can be applied to.
 * @property {number} weight  How likely the profile is drawn, relative to the item's other profiles.
 */

/* -------------------------------------------- */

/**
 * @typedef GeneratorPool
 * @property {GeneratorCandidate[]} candidates  The candidates a draw picks from.
 * @property {GeneratorPoolSummary} summary  The entries of the pool, counted per rarity.
 */

/* -------------------------------------------- */

/**
 * @typedef GeneratorPoolSummary
 * @property {Record<string, number>} included  Entries in the pool per rarity ("" for mundane). Depending on the
 *   weighting, an entry of an enchant item is a base item of a variant, a variant, or the item itself.
 * @property {Record<string, number>} capped  Entries per rarity that exceed the settlement cap.
 * @property {Record<string, number>} owned  Entries per rarity that are already in the shop.
 */

/* -------------------------------------------- */

/**
 * @typedef GeneratorProfileData
 * @property {Record<string, Set<string>>} types  Selected item types, each with its selected subtypes
 *   (`system.type.value`). An empty Set allows any subtype.
 * @property {Record<string, Set<string>>} baseItems  Selected base items (`system.type.baseItem`) per item type.
 *   An empty Set allows any base item.
 * @property {Set<string>} rarities  Selected rarities ("" for mundane). Empty allows any rarity.
 * @property {"any"|"magic"|"mundane"} magic
 * @property {"combination"|"variant"|"template"} weighting  How often an enchant item is drawn: by every
 *   combination of profile and base item, by every profile, or once per item.
 * @property {boolean} includeScrolls  Whether spell scrolls, one per matching spell, are part of the pool.
 *   Requires the Consumable type, with Scroll among its subtypes.
 * @property {boolean} includeEnspelled  Whether Enspelled Weapons, Staffs, and Armor are part of the pool.
 * @property {object} spellFilter  Restrictions on the spells of generated spell scrolls. Empty Sets allow anything.
 * @property {Set<string>} spellFilter.schools
 * @property {Set<string>} spellFilter.classes
 * @property {Set<number>} spellFilter.levels
 * @property {boolean} spellFilter.ritualOnly  Whether to restrict spell scrolls to ritual spells.
 * @property {number} count  Number of items to generate.
 */
