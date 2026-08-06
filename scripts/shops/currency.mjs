/**
 * Break a monetary value down into whole-unit denominations, from the given denomination downward.
 * Anything smaller than 1 copper piece is rounded up to the nearest whole copper.
 * @param {number} value          Value expressed in `denomination` units.
 * @param {string} denomination   Starting denomination.
 * @param {boolean} [negative]    Negate the most significant part, so it renders as e.g. "-10gp 5sp"
 *                                (a single leading sign) instead of a separately styled symbol.
 * @param {string[]} [exclude]    Denominations to skip entirely (e.g. electrum).
 * @returns {Array<{denomination: string, value: number}>}
 */
export function breakdownPrice(value, denomination, negative=false, exclude=[]) {
  const currencies = CONFIG.DND5E.currencies;
  const ladder = Object.keys(currencies).filter(d => !exclude.includes(d));
  const cpPerUnit = denom => currencies.cp.conversion / currencies[denom].conversion;
  let remainingCP = Math.ceil(value * cpPerUnit(denomination));
  const parts = [];
  for ( const denom of ladder.slice(ladder.indexOf(denomination)) ) {
    const amount = Math.floor(remainingCP / cpPerUnit(denom));
    if ( amount > 0 ) parts.push({ denomination: denom, value: amount });
    remainingCP -= amount * cpPerUnit(denom);
  }
  if ( !parts.length ) parts.push({ denomination, value: 0 });
  if ( negative ) parts[0].value *= -1;
  return parts;
}

/* -------------------------------------------- */

/**
 * Denominations currently available for shop pricing, in system-configured order.
 * @param {object} [options]
 * @param {boolean} [options.abbreviated]  Use short symbols (e.g. "gp") instead of full names (e.g. "Gold").
 * @returns {Array<{value: string, label: string}>}
 */
export function getCurrencyOptions({ abbreviated=false }={}) {
  return Object.entries(CONFIG.DND5E.currencies).map(([value, cfg]) => ({
    value, label: abbreviated ? cfg.abbreviation : cfg.label
  }));
}

/* -------------------------------------------- */

/**
 * Denominations used for a shop's gold pool. Platinum and electrum are excluded for simplicity —
 * most tables don't use them for shop bookkeeping.
 * @returns {string[]}
 */
export function goldPoolCurrencies() {
  return Object.keys(CONFIG.DND5E.currencies).filter(d => !["pp", "ep"].includes(d));
}

/* -------------------------------------------- */

/**
 * Round a GP amount to the nearest whole copper piece
 * @param {number} valueGP
 * @returns {number}
 */
export function roundToCopper(valueGP) {
  const cpPerGP = CONFIG.DND5E.currencies.cp.conversion / CONFIG.DND5E.currencies.gp.conversion;
  return game.dnd5e.utils.roundCurrency(valueGP * cpPerGP, "cp") / cpPerGP;
}

/* -------------------------------------------- */

/**
 * Resolve a shop's effective gold pool for buy-back transactions, summed to GP.
 * @param {{current: Record<string, number>, unlimited: boolean}} goldPool
 * @returns {number|null}  GP amount available, or `null` if unlimited (no cap enforced).
 */
export function effectiveGoldPool(goldPool) {
  if ( goldPool.unlimited ) return null;
  return Object.entries(goldPool.current ?? {}).reduce((sum, [denom, value]) => {
    if ( !value ) return sum;
    return sum + value / (CONFIG.DND5E.currencies[denom]?.conversion ?? 1);
  }, 0);
}

/* -------------------------------------------- */

/**
 * Build currency-input row data for every shop-usable currency, given a source amount object.
 * @param {Record<string, number>} [amounts]
 * @param {string} [namePrefix]
 * @returns {Array<{denomination: string, value: number|null, name: string, label: string, icon: string}>}
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
 * @param {{current: Record<string, number>, unlimited: boolean}} goldPool
 * @param {object} [options]
 * @param {string} [options.namePrefix]
 * @returns {Array<{denomination: string, value: number|null, name: string, label: string, icon: string}>|null}
 *   `null` if unlimited.
 */
export function displayGoldPool(goldPool, { namePrefix="" }={}) {
  if ( goldPool.unlimited ) return null;
  return currencyRows(goldPool.current, namePrefix);
}
