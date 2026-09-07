/**
 * Weekday index for a world time or resolved time components, on Calendaria's calendar.
 * @param {number|object} timeOrComponents
 * @returns {number}
 */
export function calendariaDayOfWeek(timeOrComponents) {
  return game.time.calendar.getWeekdayForDate(timeOrComponents)?.index;
}

/* -------------------------------------------- */

/**
 * Whether the Calendaria module is active.
 * @returns {boolean}
 */
export function isCalendariaActive() {
  return !!game.modules.get("calendaria")?.active;
}
