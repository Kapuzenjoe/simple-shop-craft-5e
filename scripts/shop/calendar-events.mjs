import { getShops, updateShop } from "../data/shop-store.mjs";
import { calendariaDayOfWeek, isCalendariaActive } from "../integrations/calendaria.mjs";
import { secondsPerDay } from "../utils.mjs";

import { resolveRestockPatch } from "./restock.mjs";

/**
 * Whether dnd5e's own Calendar Configuration is set to automatic recovery.
 * @returns {boolean}
 */
export function isDnd5eAutoRecoveryEnabled() {
  if ( !game.settings.settings.has("dnd5e.calendarConfig") ) return false;
  const { enabled, dailyRecovery } = game.settings.get("dnd5e", "calendarConfig");
  const manualRecovery = (dailyRecovery === "manual") || (!dailyRecovery && !enabled);
  return !!enabled && !manualRecovery;
}

/* -------------------------------------------- */

/**
 * Register the calendar-driven restock and haggling-unlock automation.
 */
export function registerCalendarEvents() {
  if ( isCalendariaActive() ) Hooks.on("calendaria.dayChange", onCalendariaDayChange);
  else Hooks.on("updateWorldTime", onUpdateWorldTime);
}

/* -------------------------------------------- */

/**
 * Restock due shops and clear expired haggling locks.
 * @param {number} worldTime
 * @param {number} dayOfWeek
 * @param {boolean} fullWeekPassed  Whether at least a week (or a month/year change) passed in this jump — if
 *   so, every shop with any restock weekday set is restocked, since the exact day crossed can't be pinpointed.
 * @returns {Promise<void>}
 */
async function handleDayChange(worldTime, dayOfWeek, fullWeekPassed) {
  if ( !game.user.isActiveGM ) return;

  const perDay = secondsPerDay();
  for ( const shop of getShops() ) {
    const patch = {};

    const restockDue = fullWeekPassed ? (shop.restockWeekdays.size > 0) : shop.restockWeekdays.has(dayOfWeek);
    if ( restockDue ) Object.assign(patch, resolveRestockPatch(shop));

    let hagglingChanged = false;
    const playerDiscounts = shop.playerDiscounts.map(pd => {
      if ( !pd.hagglingLocked || (Math.floor((worldTime - pd.hagglingTimestamp) / perDay) < 1) ) return pd.toObject();
      hagglingChanged = true;
      return { ...pd.toObject(), hagglingLocked: false, hagglingTimestamp: null };
    });
    if ( hagglingChanged ) patch.playerDiscounts = playerDiscounts;

    if ( Object.keys(patch).length ) await updateShop(shop._id, patch);
  }
}

/* -------------------------------------------- */

/**
 * Handle Calendaria's day-change hook — fires once per `updateWorldTime` call, even for multi-day jumps.
 * @param {{ previous: object, current: object }} data
 * @returns {Promise<void>}
 */
async function onCalendariaDayChange(data) {
  const worldTime = game.time.worldTime;
  const fullWeekPassed = (data.current.month !== data.previous.month) || (data.current.year !== data.previous.year)
    || ((data.current.dayOfMonth - data.previous.dayOfMonth) > 7);
  await handleDayChange(worldTime, calendariaDayOfWeek(worldTime), fullWeekPassed);
}

/* -------------------------------------------- */

/**
 * Handle dnd5e's `updateWorldTime` hook, filtered to actual day changes.
 * @param {number} worldTime
 * @param {number} dt
 * @param {object} options
 * @returns {Promise<void>}
 */
async function onUpdateWorldTime(worldTime, dt, options) {
  if ( dt <= 0 ) return;
  if ( !(options.dnd5e?.deltas?.midnights > 0) ) return;
  if ( !isDnd5eAutoRecoveryEnabled() ) return;
  await handleDayChange(
    worldTime, game.time.calendar.timeToComponents(worldTime).dayOfWeek, options.dnd5e.deltas.midnights > 7
  );
}
