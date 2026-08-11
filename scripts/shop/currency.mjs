/**
 * Default gp price per rarity.
 * @type {Record<string, { durable: number, consumable: number }>}
 */
const RARITY_DEFAULT_PRICES = {
  common: { durable: 100, consumable: 50 },
  uncommon: { durable: 400, consumable: 200 },
  rare: { durable: 4000, consumable: 2000 },
  veryRare: { durable: 40000, consumable: 20000 },
  legendary: { durable: 200000, consumable: 100000 }
};

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
 * @returns {{ denomination: string, value: number|null, name: string, label: string, icon: string }[]}
 */
export function currencyRows(amounts={}, namePrefix="") {
  return goldPoolCurrencies().map(denomination => ({
    denomination, value: amounts[denomination] ?? null, name: `${namePrefix}${denomination}`,
    label: CONFIG.DND5E.currencies[denomination].label, icon: CONFIG.DND5E.currencies[denomination].icon
  }));
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
 * Resolve a default gp price for an item with no price of its own, based on its rarity. Ammunition is
 * priced per single piece, a tenth of the consumable default, per the DMG 2024 guidance that ten pieces
 * equal one potion of the same rarity in value.
 * @param {Item5e} item
 * @returns {{ value: number, denomination: string }|null}  Null if the item has no resolvable rarity.
 */
export function resolveDefaultPrice(item) {
  const row = RARITY_DEFAULT_PRICES[item.system.rarity];
  if ( !row ) return null;
  const isAmmo = item.system.type?.value === "ammo";
  const value = isAmmo ? (row.consumable / 10) : (item.type === "consumable" ? row.consumable : row.durable);
  return { value, denomination: "gp" };
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
 * Convert a value in a given denomination to a whole number of copper pieces, rounded down.
 * @param {number} value
 * @param {string} [denomination="gp"]
 * @returns {number}
 */
export function toCopper(value, denomination="gp") {
  const cpPerUnit = CONFIG.DND5E.currencies.cp.conversion / (CONFIG.DND5E.currencies[denomination]?.conversion ?? 1);
  return Math.floor(game.dnd5e.utils.roundCurrency?.(value * cpPerUnit, "cp") ?? (value * cpPerUnit));
}
