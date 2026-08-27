import { RARITY_DEFAULT_PRICES } from "../config.mjs";

/**
 * Break a copper amount down into whole-unit denominations, largest to smallest.
 * @param {number} valueCP
 * @param {object} [options]
 * @param {boolean} [options.negative]  Negate the most significant part, so it renders as e.g. "-10gp 5sp"
 *                                      (a single leading sign) instead of a separately styled symbol.
 * @param {string} [options.capAt]      Highest denomination to break down into. Defaults to the world's
 *                                      default currency, so nothing pricier (e.g. platinum) is shown.
 * @returns {{ denomination: string, value: number }[]}
 */
export function breakdownCopper(valueCP, { negative=false, capAt=CONFIG.DND5E.defaultCurrency }={}) {
  const capConversion = CONFIG.DND5E.currencies[capAt]?.conversion;
  const ladder = Object.entries(CONFIG.DND5E.currencies)
    .filter(([, { conversion }]) => !capConversion || (conversion >= capConversion))
    .sort(([, a], [, b]) => a.conversion - b.conversion);
  let remaining = valueCP;
  const parts = [];
  for ( const [denom, { conversion }] of ladder ) {
    const cpPerUnit = CONFIG.DND5E.currencies.cp.conversion / conversion;
    const amount = Math.floor(remaining / cpPerUnit);
    if ( amount > 0 ) parts.push({ denomination: denom, value: amount });
    remaining -= amount * cpPerUnit;
  }
  if ( !parts.length ) parts.push({ denomination: "gp", value: 0 });
  if ( negative ) parts[0].value *= -1;
  return parts;
}

/* -------------------------------------------- */

/**
 * Build currency-input row data for every shop-usable currency, given a source amount object.
 * @param {Record<string, number>} [amounts]
 * @param {string} [namePrefix]
 * @param {Record<string, number>} [placeholders]
 * @returns {{ denomination: string, value: number|null, name: string, label: string, icon: string }[]}
 */
export function currencyRows(amounts={}, namePrefix="", placeholders={}) {
  return goldPoolCurrencies().map(denomination => ({
    denomination, value: amounts[denomination] ?? null, name: `${namePrefix}${denomination}`,
    label: CONFIG.DND5E.currencies[denomination].label, icon: CONFIG.DND5E.currencies[denomination].icon,
    placeholder: placeholders[denomination]
  }));
}

/* -------------------------------------------- */

/**
 * Resolve an item's crafting cost — `CONFIG.DND5E.crafting.exceptions`/`.scrolls` for Potion of Healing
 * and Spell Scrolls, a copper-precise mundane-item calculation for non-magical items, otherwise
 * `item.system.getCraftCost()`.
 * @param {Item5e} item
 * @returns {Promise<{ days: number, gold: number }>}
 */
export async function effectiveCraftCost(item) {
  const { scrolls, exceptions } = CONFIG.DND5E.crafting;
  if ( exceptions[item.system.identifier] ) return exceptions[item.system.identifier];
  if ( item.system.type?.value === "scroll" ) {
    const level = item.system.activities?.find(a => a.type === "cast")?.spell?.level;
    if ( (level != null) && scrolls[level] ) return scrolls[level];
  }
  if ( !item.system.properties?.has("mgc") || !item.system.rarity ) {
    const { mundane } = CONFIG.DND5E.crafting;
    const priceCP = item.system.price?.value
      ? toCopper(item.system.price.value, item.system.price.denomination) : 0;
    const copperPerGP = toCopper(1, "gp");
    return {
      days: Math.ceil((priceCP / copperPerGP) * mundane.days),
      gold: Math.floor(priceCP * mundane.gold) / copperPerGP
    };
  }
  return item.system.getCraftCost();
}

/* -------------------------------------------- */

/**
 * Resolve a shop's effective gold pool for buy-back transactions, summed to copper.
 * @param {{ current: Record<string, number>, unlimited: boolean }} goldPool
 * @returns {number|null}  Copper amount available, or `null` if unlimited (no cap enforced).
 */
export function effectiveGoldPool(goldPool) {
  if ( goldPool.unlimited ) return null;
  return Object.entries(goldPool.current ?? {}).reduce((sum, [denom, value]) => {
    return value ? sum + toCopper(value, denom) : sum;
  }, 0);
}

/* -------------------------------------------- */

/**
 * Denominations used for a shop's gold pool, in system-configured order.
 * @returns {string[]}
 */
export function goldPoolCurrencies() {
  return Object.keys(CONFIG.DND5E.currencies);
}

/* -------------------------------------------- */

/**
 * Resolve a default gp price for an item with no price of its own, based on its rarity.
 * @param {Item5e} item
 * @returns {{ value: number, denomination: string }|null}  Null if the item has no resolvable rarity.
 */
export function resolveDefaultPrice(item) {
  return resolveRarityPrice(item.system.rarity, {
    isAmmo: item.system.type?.value === "ammo", isConsumable: item.type === "consumable"
  });
}

/* -------------------------------------------- */

/**
 * Build currency-input row data for a shop's current gold pool.
 * @param {{ current: Record<string, number>, unlimited: boolean }} goldPool
 * @param {object} [options]
 * @param {string} [options.namePrefix]
 * @returns {{ denomination: string, value: number|null, name: string, label: string, icon: string }[]|null}
 */
export function resolveGoldPoolRows(goldPool, { namePrefix="" }={}) {
  if ( goldPool.unlimited ) return null;
  return currencyRows(goldPool.current, namePrefix);
}

/* -------------------------------------------- */

/**
 * Resolve an item's effective price: its own price if set, otherwise the rarity-based fallback.
 * @param {Item5e|object} [item]
 * @param {object} [overrides]
 * @param {string} [overrides.rarity]        Rarity to use instead of `item.system.rarity` — for enchant
 *   profiles, whose effective rarity can differ from the enchant item's own.
 * @param {boolean} [overrides.isAmmo]        Ammo trait to use instead of `item.system.type?.value`.
 * @param {boolean} [overrides.isConsumable]  Consumable trait to use instead of `item.type`.
 * @returns {{ value: number, denomination: string }|null}
 */
export function resolveItemPrice(item, { rarity, isAmmo, isConsumable }={}) {
  if ( !item ) return null;
  return item.system.price?.value
    ? { value: item.system.price.value, denomination: item.system.price.denomination }
    : resolveRarityPrice(rarity ?? item.system.rarity, {
      isAmmo: isAmmo ?? (item.system.type?.value === "ammo"), isConsumable: isConsumable ?? (item.type === "consumable")
    });
}

/* -------------------------------------------- */

/**
 * Resolve the rarity-tier default price for a given rarity. Ammunition is priced per single piece, a
 * tenth of the consumable default, per the DMG 2024 guidance that ten pieces equal one potion of the
 * same rarity in value.
 * @param {string} rarity
 * @param {object} [options]
 * @param {boolean} [options.isAmmo]
 * @param {boolean} [options.isConsumable]
 * @returns {{ value: number, denomination: string }|null}  Null if the rarity has no resolvable tier.
 */
export function resolveRarityPrice(rarity, { isAmmo=false, isConsumable=false }={}) {
  const row = RARITY_DEFAULT_PRICES[rarity];
  if ( !row ) return null;
  const value = isAmmo ? (row.consumable / 10) : (isConsumable ? row.consumable : row.durable);
  return { value, denomination: "gp" };
}

/* -------------------------------------------- */

/**
 * Convert a value in a given denomination to a whole number of copper pieces, rounded down.
 * @param {number} value
 * @param {string} [denomination="gp"]
 * @returns {number}
 */
export function toCopper(value, denomination="gp") {
  const cpPerUnit = CONFIG.DND5E.currencies.cp.conversion / (CONFIG.DND5E.currencies[denomination]?.conversion ?? 1);
  return Math.floor(game.dnd5e.utils.roundCurrency?.(value * cpPerUnit, "cp") ?? (value * cpPerUnit));
}
