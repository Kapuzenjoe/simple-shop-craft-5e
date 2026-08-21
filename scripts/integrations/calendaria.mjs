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
 * Weekday options for Calendaria's calendar, in weekday-index order.
 * @returns {{ value: number, label: string }[]}
 */
export function calendariaWeekdayOptions() {
  return game.time.calendar.weekdaysArray.map((day, value) => ({ value, label: _loc(day.name) }));
}

/* -------------------------------------------- */

/**
 * Whether the Calendaria module is active.
 * @returns {boolean}
 */
export function isCalendariaActive() {
  return !!game.modules.get("calendaria")?.active;
}
