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
 * Weekday indices crossed by a Calendaria `calendaria.dayChange` hook event, or `null` for a full week
 * or more, or `undefined` if the event doesn't represent an actual forward day change.
 * @param {{ previous: object, current: object }} data
 * @returns {number[]|null|undefined}
 */
export function calendariaWeekdaysPassed(data) {
  const dayCount = data.current.dayOfMonth - data.previous.dayOfMonth;
  if ( dayCount <= 0 ) return undefined;
  const weekLength = game.time.calendar.daysInWeek;
  const monthOrYearChanged = (data.current.month !== data.previous.month) || (data.current.year !== data.previous.year);
  return (monthOrYearChanged || (dayCount >= weekLength))
    ? null
    : Array.from({ length: dayCount }, (_, i) => (calendariaDayOfWeek(data.current) - i + weekLength) % weekLength);
}

/* -------------------------------------------- */

/**
 * Whether the Calendaria module is active.
 * @returns {boolean}
 */
export function isCalendariaActive() {
  return !!game.modules.get("calendaria")?.active;
}
