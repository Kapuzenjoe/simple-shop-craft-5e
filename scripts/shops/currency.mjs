import { GOLD_POOL_DEFAULT } from "../config.mjs";

/**
 * Break a monetary value down into whole-unit denominations, from the given denomination downward.
 * Anything smaller than 1 copper piece is rounded up to the nearest whole copper.
 * @param {number} value          Value expressed in `denomination` units.
 * @param {string} denomination   Starting denomination.
 * @param {boolean} [negative]    Negate the most significant part, so it renders as e.g. "-10gp 5sp"
 *                                (a single leading sign) instead of a separately styled symbol.
 * @returns {Array<{denomination: string, value: number}>}
 */
export function breakdownPrice(value, denomination, negative=false) {
  const currencies = CONFIG.DND5E.currencies;
  const ladder = ["pp", "gp", "ep", "sp", "cp"].filter(d => d in currencies);
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
 * Round a GP amount up (in magnitude) to the nearest whole copper piece, matching
 * {@link breakdownPrice}'s own rounding so a transaction always charges/awards exactly
 * the amount that was displayed to the player.
 * @param {number} valueGP
 * @returns {number}
 */
export function roundToCopper(valueGP) {
  const cpPerGP = CONFIG.DND5E.currencies.cp.conversion / CONFIG.DND5E.currencies.gp.conversion;
  return Math.sign(valueGP) * Math.ceil(Math.abs(valueGP) * cpPerGP) / cpPerGP;
}

/* -------------------------------------------- */

/**
 * Resolve a shop's effective gold pool for buy-back transactions.
 * @param {{max: number|null, current: number|null, unlimited: boolean}} goldPool
 * @returns {number|null}  GP amount available, or `null` if unlimited (no cap enforced).
 */
export function effectiveGoldPool(goldPool) {
  if ( goldPool.unlimited ) return null;
  return goldPool.current ?? goldPool.max ?? GOLD_POOL_DEFAULT;
}
