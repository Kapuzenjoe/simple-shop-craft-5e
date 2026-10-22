/**
 * Custom inventory section of an item as set in Tidy 5e Sheets.
 * @param {Item5e} item
 * @returns {string}  The trimmed section name, or an empty string if the item has none.
 */
export function getTidySection(item) {
  const section = item.getFlag("tidy5e-sheet", "section");
  return (typeof section === "string") ? section.trim() : "";
}

/* -------------------------------------------- */

/**
 * Whether the Tidy 5e Sheets module is active.
 * @returns {boolean}
 */
export function isTidyActive() {
  return !!game.modules.get("tidy5e-sheet")?.active;
}
