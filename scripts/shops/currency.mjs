/**
 * Break a copper amount down into whole-unit denominations, largest to smallest, mirroring how
 * CurrencyManager#convertCurrency distributes value across denominations. Uses whichever denominations
 * the system currently has configured, in system-configured order.
 * @param {number} valueCP
 * @param {object} [options]
 * @param {boolean} [options.negative]  Negate the most significant part, so it renders as e.g. "-10gp 5sp"
 *                                      (a single leading sign) instead of a separately styled symbol.
 * @returns {{ denomination: string, value: number }[]}
 */
export function breakdownCopper(valueCP, { negative=false }={}) {
  const ladder = Object.entries(CONFIG.DND5E.currencies)
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
 * Build currency-input row data for a shop's current gold pool.
 * @param {{ current: Record<string, number>, unlimited: boolean }} goldPool
 * @param {object} [options]
 * @param {string} [options.namePrefix]
 * @returns {{ denomination: string, value: number|null, name: string, label: string, icon: string }[]|null}
 */
export function displayGoldPool(goldPool, { namePrefix="" }={}) {
  if ( goldPool.unlimited ) return null;
  return currencyRows(goldPool.current, namePrefix);
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
 * Denominations currently available for shop pricing, in system-configured order.
 * @param {object} [options]
 * @param {boolean} [options.abbreviated]  Use short symbols (e.g. "gp") instead of full names (e.g. "Gold").
 * @returns {{ value: string, label: string }[]}
 */
export function getCurrencyOptions({ abbreviated=false }={}) {
  return Object.entries(CONFIG.DND5E.currencies).map(([value, cfg]) => ({
    value, label: abbreviated ? cfg.abbreviation : cfg.label
  }));
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
 * Convert a value in a given denomination to a whole number of copper pieces, rounded down.
 * @param {number} value
 * @param {string} [denomination="gp"]
 * @returns {number}
 */
export function toCopper(value, denomination="gp") {
  const cpPerUnit = CONFIG.DND5E.currencies.cp.conversion / (CONFIG.DND5E.currencies[denomination]?.conversion ?? 1);
  return Math.floor(game.dnd5e.utils.roundCurrency?.(value * cpPerUnit, "cp") ?? (value * cpPerUnit));
}
