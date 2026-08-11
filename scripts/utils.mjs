/**
 * Build a CompendiumBrowser filter excluding entries whose field matches one of the given values.
 * @param {string} keyPath    Field path to check.
 * @param {*[]} values        Values to exclude.
 * @returns {FilterDescription}
 */
export function excludeFilter(keyPath, values) {
  return { o: "NOT", v: { k: keyPath, o: "in", v: values } };
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
 * List subtype options across the given item types — the same category taxonomy dnd5e exposes per type
 * (`CONFIG.Item.dataModels[type].itemCategories`), merged and deduplicated, excluding the creature-only
 * "natural" subtype.
 * @param {string[]} types
 * @returns {{ value: string, label: string }[]}
 */
export function subtypeOptions(types) {
  const seen = new Map();
  for ( const type of types ) {
    const categories = CONFIG.Item.dataModels[type]?.itemCategories ?? {};
    for ( const [value, config] of Object.entries(categories) ) {
      if ( (value === "natural") || seen.has(value) ) continue;
      const label = (foundry.utils.getType(config) === "string") ? config : config.label;
      seen.set(value, { value, label: _loc(label) });
    }
  }
  return Array.from(seen.values());
}
