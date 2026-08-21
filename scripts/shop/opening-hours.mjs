import { calendariaDayOfWeek, isCalendariaActive } from "../integrations/calendaria.mjs";

/**
 * @import { Shop } from "../data/shop-data.mjs";
 */

/**
 * Festival options for the active calendar, if it supports festivals. Empty otherwise.
 * @returns {{ value: string, label: string }[]}
 */
export function festivalOptions() {
  const calendar = game.time.calendar;
  const festivals = calendar.festivalsArray ?? calendar.festivals ?? [];
  return festivals.map(f => ({ value: f.name, label: _loc(f.name) }));
}

/* -------------------------------------------- */

/**
 * Whether a shop is currently open. `statusOverride`, if set, decides this outright; otherwise the shop is
 * closed when outside its daily hours, on a closed weekday, or on a closed festival day — open by default
 * when none of these are set.
 * @param {Shop} shop
 * @param {number} [worldTime]
 * @returns {boolean}
 */
export function isShopOpen(shop, worldTime=game.time.worldTime) {
  if ( shop.statusOverride ) return shop.statusOverride === "open";

  const components = game.time.calendar.timeToComponents(worldTime);
  const dayOfWeek = isCalendariaActive() ? calendariaDayOfWeek(worldTime) : components.dayOfWeek;
  if ( shop.closedWeekdays.has(dayOfWeek) ) return false;

  const calendar = game.time.calendar;
  const festivalDay = (typeof calendar.findFestivalDay === "function") ? calendar.findFestivalDay(worldTime) : null;
  if ( festivalDay && shop.closedFestivals.has(festivalDay.name) ) return false;

  if ( (shop.openHour == null) || (shop.closeHour == null) ) return true;
  const minutesNow = (components.hour * 60) + components.minute;
  const openMinutes = (shop.openHour * 60) + shop.openMinute;
  const closeMinutes = (shop.closeHour * 60) + shop.closeMinute;
  return (openMinutes > closeMinutes)
    ? (minutesNow >= openMinutes) || (minutesNow <= closeMinutes)
    : (minutesNow >= openMinutes) && (minutesNow <= closeMinutes);
}

/* -------------------------------------------- */

/**
 * Format a shop's opening hours as a display string.
 * @param {Shop} shop
 * @returns {string}
 */
export function openingHoursDisplay(shop) {
  if ( (shop.openHour == null) || (shop.closeHour == null) ) return _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.OpeningHoursAlways");
  return `${shop.openHour.toString().padStart(2, "0")}:${shop.openMinute.toString().padStart(2, "0")}`
    + `–${shop.closeHour.toString().padStart(2, "0")}:${shop.closeMinute.toString().padStart(2, "0")}`;
}
