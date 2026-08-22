import { getShops, updateShop } from "../data/shop-store.mjs";
import { calendariaDayOfWeek, isCalendariaActive } from "../integrations/calendaria.mjs";
import { secondsPerDay } from "../utils.mjs";

import { resolveRestockUpdates } from "./restock.mjs";

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
 * @param {number[]|null} weekdaysPassed  Weekday indices crossed since the last check, or `null` for a
 *   full week or more.
 * @returns {Promise<void>}
 */
async function handleDayChange(worldTime, weekdaysPassed) {
  if ( !game.user.isActiveGM ) return;

  const perDay = secondsPerDay();
  for ( const shop of getShops() ) {
    const updateData = {};

    const restockDue = weekdaysPassed === null
      ? (shop.restockWeekdays.size > 0)
      : weekdaysPassed.some(d => shop.restockWeekdays.has(d));
    if ( restockDue ) Object.assign(updateData, resolveRestockUpdates(shop));

    let hagglingChanged = false;
    const playerDiscounts = shop.playerDiscounts.map(pd => {
      if ( !pd.hagglingLocked || (Math.floor((worldTime - pd.hagglingTimestamp) / perDay) < 1) ) return pd.toObject();
      hagglingChanged = true;
      return { ...pd.toObject(), hagglingLocked: false, hagglingTimestamp: null };
    });
    if ( hagglingChanged ) updateData.playerDiscounts = playerDiscounts;

    if ( Object.keys(updateData).length ) await updateShop(shop._id, updateData);
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
  const dayCount = data.current.dayOfMonth - data.previous.dayOfMonth;
  if ( dayCount <= 0 ) return;
  const weekLength = game.time.calendar.daysInWeek;
  const monthOrYearChanged = (data.current.month !== data.previous.month) || (data.current.year !== data.previous.year);
  const weekdaysPassed = (monthOrYearChanged || (dayCount >= weekLength))
    ? null
    : Array.from({ length: dayCount }, (_, i) => (calendariaDayOfWeek(data.current) - i + weekLength) % weekLength);
  await handleDayChange(worldTime, weekdaysPassed);
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
  const midnights = options.dnd5e?.deltas?.midnights;
  if ( !(midnights > 0) ) return;
  if ( !isDnd5eAutoRecoveryEnabled() ) return;
  const weekLength = game.time.calendar.days.values.length;
  const dayOfWeek = game.time.calendar.timeToComponents(worldTime).dayOfWeek;
  const weekdaysPassed = (midnights >= weekLength)
    ? null
    : Array.from({ length: midnights }, (_, i) => (dayOfWeek - i + weekLength) % weekLength);
  await handleDayChange(worldTime, weekdaysPassed);
}
