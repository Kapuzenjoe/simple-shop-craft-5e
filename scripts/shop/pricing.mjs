import { finalizeGroups } from "../utils.mjs";

import { breakdownCopper, resolveItemPrice, toCopper } from "./currency.mjs";
import { entryKey, resolveShopItems } from "./entry-resolver.mjs";

/**
 * @import { ShopPlayerDiscount } from "../data/shop-data.mjs";
 */

/**
 * Build a property-attribution source entry for an additive percent term, matching dnd5e's own
 * convention of flipping negative "add" values to type "subtract" with an absolute display value.
 * @param {string} label
 * @param {number} value
 * @returns {{ label: string, value: string, type: string }}
 */
export function additiveSource(label, value) {
  return { label, value: `${Math.abs(value)}%`, type: (value < 0) ? "subtract" : "add" };
}

/* -------------------------------------------- */

/**
 * Group resolved item rows by their item type.
 * @param {object} options
 * @param {{ entry: ShopItemEntryData, item: object|null }[]} options.rows
 * @param {{ value: number|null, denomination: string }} options.settlementCap
 * @param {number} options.buyModifier  Shop's default buy-side percent discount/markup, used when an item has
 *   no override.
 * @param {Map<string, number>} options.cart  Selected buy quantities, keyed by {@link entryKey}.
 * @param {Set<string>} options.fixedValueLootTypes
 * @param {number|null} [options.playerBuyModifier]  Acting actor's buy-side override, used when an item has
 *   no override.
 * @param {string} [options.actorName]  Acting actor's name, used to label the player row.
 * @param {(sources: object[], total: string) => Promise<string>} options.renderDiscountTooltip
 * @returns {Promise<{ type: string, label: string, items: object[] }[]>}
 */
export async function groupByType({
  rows, settlementCap, buyModifier, cart, fixedValueLootTypes, playerBuyModifier, actorName, renderDiscountTooltip
}) {
  const targetUnit = game.settings.get("dnd5e", "metricWeightUnits") ? "kg" : "lb";
  const capCP = settlementCap?.value != null ? toCopper(settlementCap.value, settlementCap.denomination) : null;
  const groups = new Map();
  for ( const row of rows ) {
    row.key = entryKey(row.entry);
    const itemPrice = resolveItemPrice(row.item);
    const basePrice = row.entry.price?.value ?? itemPrice?.value ?? 0;
    const denomination = (row.entry.price?.value != null)
      ? row.entry.price.denomination
      : (itemPrice?.denomination ?? CONFIG.DND5E.defaultCurrency);
    const rowIsFixedValue = isFixedValue(row.item, fixedValueLootTypes);
    const { percent: discountPercent, sources } = resolveDiscountSources({
      itemOverride: row.entry.discount, isFixedValue: rowIsFixedValue, shopModifier: buyModifier,
      playerModifier: playerBuyModifier, actorName
    });
    const finalValue = basePrice * (1 + (discountPercent / 100));
    const baseCP = toCopper(basePrice, denomination);
    const priceCP = toCopper(finalValue, denomination);
    row.priceDisplay = breakdownCopper(priceCP);
    row.priceCP = priceCP;
    row.discountPercent = discountPercent;
    row.discountTooltip = await renderDiscountTooltip(sources, `${discountPercent}%`);
    row.cartQuantity = cart.get(row.key) ?? 0;
    const bundleSize = row.entry.bundleSize
      ?? ((row.item?.system?.quantity > 1) ? row.item.system.quantity : 1);
    row.bundleSize = bundleSize > 1 ? bundleSize : null;
    row.weight = resolveWeight(row.item?.system, targetUnit);
    row.stockTracked = row.entry.stock.current !== null;

    const reasons = [];
    if ( !row.item ) reasons.push(_loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.SuppressedNotFound"));
    if ( row.entry.stock.current === 0 ) reasons.push(_loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.SuppressedStock"));
    if ( (capCP != null) && (baseCP > capCP) ) reasons.push(_loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.SuppressedCap"));
    row.suppressed = reasons.length > 0;
    row.suppressReason = reasons.join(", ");
    row.itemImg = row.item?.img ?? "icons/svg/hazard.svg";
    row.itemName = row.item?.name ?? row.entry.identifier ?? row.entry.uuid ?? "?";

    const type = row.item?.type ?? "unknown";
    if ( !groups.has(type) ) groups.set(type, []);
    groups.get(type).push(row);
  }
  return finalizeGroups(groups);
}

/* -------------------------------------------- */

/**
 * Group a selected actor's sellable inventory by item type.
 * @param {object} options
 * @param {Item5e[]|Collection} options.items      The actor's items.
 * @param {number} options.sellModifier            Shop's sell-side percent discount/markup.
 * @param {Map<string, number>} options.sellCart   Selected sell quantities, keyed by item id.
 * @param {Set<string>} options.fixedValueLootTypes
 * @param {number|null} [options.playerSellModifier]  Acting actor's sell-side override, if configured.
 * @param {string} [options.actorName]  Acting actor's name, used to label the player row.
 * @param {(sources: object[], total: string) => Promise<string>} options.renderDiscountTooltip
 * @param {{ value: number|null, denomination: string, appliesToSell: boolean }} [options.settlementCap]
 *   Blocks selling an item for more than this value, if `appliesToSell` is set.
 * @returns {Promise<{ type: string, label: string, items: object[] }[]>}
 */
export async function groupSellItems({
  items, sellModifier, sellCart, fixedValueLootTypes, playerSellModifier, actorName, renderDiscountTooltip,
  settlementCap
}) {
  const targetUnit = game.settings.get("dnd5e", "metricWeightUnits") ? "kg" : "lb";
  const capCP = (settlementCap?.value != null) && settlementCap.appliesToSell
    ? toCopper(settlementCap.value, settlementCap.denomination) : null;
  const sellable = Array.from(items).filter(item => CONFIG.Item.dataModels[item.type]?.inventorySection);
  const resolved = await resolveShopItems(sellable.map(item => ({ identifier: item.system.identifier })));
  const groups = new Map();
  for ( const [index, item] of sellable.entries() ) {
    const catalogItem = resolved[index].item;
    const bundleSize = (catalogItem?.system?.quantity > 1) ? catalogItem.system.quantity : 1;
    const basePrice = (item.system.price?.value ?? 0) / bundleSize;
    const denomination = item.system.price?.denomination ?? CONFIG.DND5E.defaultCurrency;
    const rowIsFixedValue = isFixedValue(item, fixedValueLootTypes);
    const { percent: discountPercent, sources } = resolveDiscountSources({
      itemOverride: null, isFixedValue: rowIsFixedValue, shopModifier: sellModifier,
      playerModifier: playerSellModifier, actorName
    });
    const finalValue = basePrice * (1 + (discountPercent / 100));
    const priceCP = toCopper(finalValue, denomination);
    const suppressed = (capCP != null) && (priceCP > capCP);
    const row = {
      item,
      priceDisplay: breakdownCopper(priceCP),
      discountPercent,
      discountTooltip: await renderDiscountTooltip(sources, `${discountPercent}%`),
      sellQuantity: sellCart.get(item.id) ?? 0,
      owned: item.system.quantity ?? 1,
      priceCP,
      suppressed,
      weight: resolveWeight(item.system, targetUnit)
    };
    if ( !groups.has(item.type) ) groups.set(item.type, []);
    groups.get(item.type).push(row);
  }
  return finalizeGroups(groups);
}

/* -------------------------------------------- */

/**
 * Items of the shop's configured fixed-value loot subtypes (default: Gemstones and Art Objects) have a
 * fixed market value — never subject to any buy/sell discount or markup.
 * @param {Item5e|object} [item]
 * @param {Set<string>} fixedValueLootTypes
 * @returns {boolean}
 */
export function isFixedValue(item, fixedValueLootTypes) {
  return (item?.type === "loot") && fixedValueLootTypes.has(item?.system?.type?.value);
}

/* -------------------------------------------- */

/**
 * Whether an item's own price is unset, meaning the shop's default-rarity fallback price is being shown
 * for it instead.
 * @param {Item5e|null} item
 * @returns {boolean}
 */
export function needsDefaultPrice(item) {
  return !!item && !item.system.price?.value;
}

/* -------------------------------------------- */

/**
 * Resolve a row's effective discount percent and the attribution sources behind it: item override, else
 * fixed-value (0%), else shop default + player modifier. Rendering the sources into a tooltip is left to
 * the caller (a View concern).
 * @param {object} options
 * @param {number|null} options.itemOverride    The item entry's own discount override, if any (buy-side only).
 * @param {boolean} options.isFixedValue        Whether the item is a fixed-value loot subtype (always 0%).
 * @param {number} options.shopModifier         Shop's default percent for this side (buy or sell).
 * @param {number|null} options.playerModifier  Acting actor's additive modifier for this side, if configured.
 * @param {string} [options.actorName]          Acting actor's name, used to label the player row.
 * @returns {{ percent: number, sources: object[] }}
 */
export function resolveDiscountSources({
  itemOverride, isFixedValue: rowIsFixedValue, shopModifier, playerModifier, actorName
}) {
  if ( itemOverride != null ) {
    const sources = [{ label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.ItemOverride"), value: `${itemOverride}%`, type: "override" }];
    return { percent: itemOverride, sources };
  }
  if ( rowIsFixedValue ) {
    const sources = [{ label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.FixedValueItem"), value: "0%", type: "override" }];
    return { percent: 0, sources };
  }
  const sources = [additiveSource(_loc("SIMPLE_SHOP_CRAFT_5E.Shop"), shopModifier)];
  let percent = shopModifier;
  if ( playerModifier ) {
    sources.push(additiveSource(actorName, playerModifier));
    percent += playerModifier;
  }
  return { percent, sources };
}

/* -------------------------------------------- */

/**
 * Resolve the acting actor's discount override for this shop, if one is configured.
 * @param {ShopPlayerDiscount[]} playerDiscounts
 * @param {string} [actorUuid]
 * @returns {{ buy: number|null, sell: number|null }}
 */
export function resolvePlayerOverride(playerDiscounts, actorUuid) {
  const override = actorUuid ? playerDiscounts.find(pd => pd.actor === actorUuid) : null;
  return { buy: override?.buyModifier ?? null, sell: override?.sellModifier ?? null };
}

/* -------------------------------------------- */

/**
 * Convert an item's weight to the world's configured weight unit, if it has one.
 * @param {object} [itemSystem]  The item's system data.
 * @param {string} targetUnit    "kg" or "lb", per the world's `metricWeightUnits` setting.
 * @returns {{ value: number, unit: string }|undefined}
 */
export function resolveWeight(itemSystem, targetUnit) {
  if ( !itemSystem?.weight ) return undefined;
  return {
    value: game.dnd5e.utils.convertWeight(itemSystem.weight.value, itemSystem.weight.units || "lb", targetUnit),
    unit: targetUnit
  };
}

/* -------------------------------------------- */

/**
 * Summarize a flat set of buy/sell rows into a single net total. Buying costs money (negative), selling
 * earns money (positive).
 * @param {{ cartQuantity?: number, priceCP: number }[]} buyRows
 * @param {{ sellQuantity?: number, priceCP: number }[]} sellRows
 * @returns {{ count: number, netCP: number, parts: { denomination: string, value: number }[] }}
 */
export function summarizeNet(buyRows, sellRows) {
  let count = 0;
  let buyTotalCP = 0;
  for ( const row of buyRows ) {
    if ( !row.cartQuantity ) continue;
    count += row.cartQuantity;
    buyTotalCP += row.priceCP * row.cartQuantity;
  }
  let sellTotalCP = 0;
  for ( const row of sellRows ) {
    if ( !row.sellQuantity ) continue;
    count += row.sellQuantity;
    sellTotalCP += row.priceCP * row.sellQuantity;
  }
  const netCP = sellTotalCP - buyTotalCP;
  return { count, netCP, parts: count > 0 ? breakdownCopper(Math.abs(netCP), { negative: netCP < 0 }) : [] };
}
