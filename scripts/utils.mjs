import { EXCLUDED_PACKS, MODULE_ID, PACKAGE_TYPE_ORDER, RARITY_DEFAULT_PRICES, SETTING_KEYS } from "./config.mjs";
import { isCalendariaActive } from "./integrations/calendaria.mjs";
import { isEmberActive } from "./integrations/ember.mjs";

/**
 * @import Recipe from "./data/recipe-data.mjs";
 */

/* -------------------------------------------- */
/*  Compendium                                  */
/* -------------------------------------------- */

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
 * Whether a compendium item's own pack is eligible as a shop-goods source (see {@link EXCLUDED_PACKS}).
 * @param {string} uuid
 * @returns {boolean}
 */
export function isShopPackSource(uuid) {
  return !EXCLUDED_PACKS.has(foundry.utils.parseUuid(uuid)?.collection?.collection);
}

/* -------------------------------------------- */

/**
 * Group active Item compendium packs by their owning package type.
 * @returns {Map<string, CompendiumCollection[]>}
 */
function getPacksByPackageType() {
  const sources = game.dnd5e.applications.settings.CompendiumBrowserSettingsConfig.collateSources();
  const packsByPackageType = new Map();
  for ( const pack of game.packs ) {
    if ( (pack.documentName !== "Item") || !sources.has(pack.collection) ) continue;
    const packageType = pack.metadata.packageType;
    if ( !packsByPackageType.has(packageType) ) packsByPackageType.set(packageType, []);
    packsByPackageType.get(packageType).push(pack);
  }
  return packsByPackageType;
}

/* -------------------------------------------- */
/*  Crafting                                    */
/* -------------------------------------------- */

/**
 * The configured maximum crafting hours a single "Progress Craft" use may contribute per workday.
 * @returns {number}
 */
export function maxHoursPerWorkday() {
  return game.settings.get(MODULE_ID, SETTING_KEYS.MAX_HOURS_PER_WORKDAY);
}

/* -------------------------------------------- */

/**
 * Resolve a recipe's total crafting duration in hours: its explicit override if set, otherwise the
 * rules-based crafting time for the target item, scaled by the ratio of the recipe's target quantity to
 * the target item's own bundle size.
 * @param {Recipe} recipe
 * @param {{ days: number, gold: number }|null} craftCost
 * @param {Item5e} [targetItem]
 * @returns {number}
 */
export function resolveTotalHours(recipe, craftCost, targetItem) {
  const hoursPerUnit = { minute: 1 / 60, hour: 1, day: maxHoursPerWorkday() };
  if ( recipe.durationOverride.value != null ) {
    return recipe.durationOverride.value * hoursPerUnit[recipe.durationOverride.units];
  }
  const targetBundleSize = (targetItem?.system?.quantity > 1) ? targetItem.system.quantity : 1;
  const scale = recipe.targetQuantity / targetBundleSize;
  return (craftCost?.days ?? 0) * scale * maxHoursPerWorkday();
}

/* -------------------------------------------- */

/**
 * Resolve an item's crafting cost — `CONFIG.DND5E.crafting.exceptions`/`.scrolls` for Potion of Healing
 * and Spell Scrolls, a copper-precise mundane-item calculation for non-magical items, otherwise
 * `item.system.getCraftCost()`.
 * @param {Item5e} item
 * @returns {Promise<{ days: number, gold: number }>}
 */
export async function effectiveCraftCost(item) {
  const { scrolls, exceptions } = CONFIG.DND5E.crafting;
  if ( exceptions[item.system.identifier] ) return exceptions[item.system.identifier];
  if ( item.system.type?.value === "scroll" ) {
    const level = item.system.activities?.find(a => a.type === "cast")?.spell?.level;
    if ( (level != null) && scrolls[level] ) return scrolls[level];
  }
  if ( !item.system.properties?.has("mgc") || !item.system.rarity ) {
    const { mundane } = CONFIG.DND5E.crafting;
    const priceCP = item.system.price?.value
      ? toCopper(item.system.price.value, item.system.price.denomination) : 0;
    const copperPerGP = toCopper(1, "gp");
    return {
      days: Math.ceil((priceCP / copperPerGP) * mundane.days),
      gold: Math.floor(priceCP * mundane.gold) / copperPerGP
    };
  }
  return item.system.getCraftCost();
}

/* -------------------------------------------- */
/*  Currencies                                  */
/* -------------------------------------------- */

/**
 * Break a copper amount down into whole-unit denominations, largest to smallest.
 * @param {number} valueCP
 * @param {object} [options]
 * @param {boolean} [options.negative]  Negate the most significant part, so it renders as e.g. "-10gp 5sp"
 *                                      (a single leading sign) instead of a separately styled symbol.
 * @param {string} [options.capAt]      Highest denomination to break down into. Defaults to the world's
 *                                      default currency, so nothing pricier (e.g. platinum) is shown.
 * @returns {{ denomination: string, value: number }[]}
 */
export function breakdownCopper(valueCP, { negative=false, capAt=CONFIG.DND5E.defaultCurrency }={}) {
  const capConversion = CONFIG.DND5E.currencies[capAt]?.conversion;
  const ladder = Object.entries(CONFIG.DND5E.currencies)
    .filter(([, { conversion }]) => !capConversion || (conversion >= capConversion))
    .sort(([, a], [, b]) => a.conversion - b.conversion);
  let remaining = valueCP;
  const parts = [];
  for ( const [denom, { conversion }] of ladder ) {
    const cpPerUnit = CONFIG.DND5E.currencies.cp.conversion / conversion;
    const amount = Math.floor(remaining / cpPerUnit);
    if ( amount > 0 ) parts.push({ denomination: denom, value: amount });
    remaining -= amount * cpPerUnit;
  }
  if ( !parts.length ) parts.push({ denomination: "gp", value: 0 });
  if ( negative ) parts[0].value *= -1;
  return parts;
}

/* -------------------------------------------- */

/**
 * Build currency-input row data for every shop-usable currency, given a source amount object.
 * @param {Record<string, number>} [amounts]
 * @param {string} [namePrefix]
 * @param {Record<string, number>} [placeholders]
 * @returns {{ denomination: string, value: number|null, name: string, label: string, icon: string }[]}
 */
export function currencyRows(amounts={}, namePrefix="", placeholders={}) {
  return goldPoolCurrencies().map(denomination => ({
    denomination, value: amounts[denomination] ?? null, name: `${namePrefix}${denomination}`,
    label: CONFIG.DND5E.currencies[denomination].label, icon: CONFIG.DND5E.currencies[denomination].icon,
    placeholder: placeholders[denomination]
  }));
}

/* -------------------------------------------- */

/**
 * Deduct currency from an actor via dnd5e's CurrencyManager, catching a shortfall into a checked result.
 * @param {Actor5e} actor
 * @param {number} amountCP
 * @returns {Promise<{ ok: true }|{ ok: false, error: string }>}
 */
export async function deductActorCurrencyChecked(actor, amountCP) {
  try {
    await game.dnd5e.applications.CurrencyManager.deductActorCurrency(actor, amountCP, "cp");
    return { ok: true };
  } catch ( err ) {
    return { ok: false, error: err.message };
  }
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
 * Denominations used for a shop's gold pool, in system-configured order.
 * @returns {string[]}
 */
export function goldPoolCurrencies() {
  return Object.keys(CONFIG.DND5E.currencies);
}

/* -------------------------------------------- */

/**
 * Convert a value in a given denomination to a whole number of copper pieces, rounded down.
 * @param {number} value
 * @param {string} [denomination="gp"]
 * @returns {number}
 */
export function toCopper(value, denomination="gp") {
  const cpPerUnit = CONFIG.DND5E.currencies.cp.conversion / (CONFIG.DND5E.currencies[denomination]?.conversion ?? 1);
  return Math.floor(game.dnd5e.utils.roundCurrency?.(value * cpPerUnit, "cp") ?? (value * cpPerUnit));
}

/* -------------------------------------------- */
/*  Documents                                   */
/* -------------------------------------------- */

/**
 * Return whether dnd5e's daily recovery is currently being handled manually rather than by the calendar.
 * @returns {boolean}
 */
export function isManualRecoveryActive() {
  if ( !game.settings.settings.has("dnd5e.calendarConfig") ) return true;
  const cfg = game.settings.get("dnd5e", "calendarConfig");
  if ( !("dailyRecovery" in cfg) ) return true;
  return !cfg.enabled || cfg.manualRecovery;
}


/* -------------------------------------------- */

/**
 * Whether calendar day-change tracking is currently active.
 * @returns {boolean}
 */
export function isCalendarModeActive() {
  const override = game.settings.get(MODULE_ID, SETTING_KEYS.CALENDAR_MODE);
  if ( override !== "default" ) return override === "on";
  return isCalendariaActive() || isEmberActive() || !isManualRecoveryActive();
}

/* -------------------------------------------- */

/**
 * Whether a forward `updateWorldTime` change should be handled by this client.
 * @param {number} dt
 * @returns {boolean}
 */
export function shouldHandleWorldTimeAdvance(dt) {
  return (dt > 0) && game.user.isActiveGM;
}

/* -------------------------------------------- */

/**
 * Actors selectable as a shop/craft acting character: all "character"-type actors, owned ones only unless
 * GM. Optionally includes the party actor, if the current user may act as it.
 * @param {object} [options]
 * @param {boolean} [options.includeParty]  Also resolve the selectable party actor, if any.
 * @returns {Actor5e[]|{ characters: Actor5e[], party: Actor5e|null }}
 */
export function selectableActors({ includeParty=false }={}) {
  const isGM = game.user.isGM;
  const characters = game.actors.filter(a => (a.type === "character") && (isGM || a.isOwner));
  if ( !includeParty ) return characters;
  const party = game.actors.party;
  const partySelectable = party && (isGM
    || (game.user.character && party.system.playerCharacters.includes(game.user.character) && party.isOwner));
  return { characters, party: partySelectable ? party : null };
}

/* -------------------------------------------- */
/*  Formatters                                  */
/* -------------------------------------------- */

/**
 * Format a duration in hours as a short breakdown, largest unit first (e.g. "1d 8h 20min").
 * @param {number} totalHours
 * @param {object} [options={}]
 * @param {boolean} [options.days=true]  Roll over into whole workdays; false to only show hours/minutes.
 * @returns {string}
 */
export function formatDuration(totalHours, { days=true }={}) {
  const hoursPerWorkday = maxHoursPerWorkday();
  const dayCount = days ? Math.floor(totalHours / hoursPerWorkday) : 0;
  let hours = Math.floor(days ? totalHours % hoursPerWorkday : totalHours);
  let minutes = Math.round((totalHours % 1) * 60);
  if ( minutes === 60 ) {
    minutes = 0;
    hours += 1;
  }
  const parts = [];
  if ( dayCount ) parts.push(`${dayCount}d`);
  if ( hours ) parts.push(`${hours}h`);
  if ( minutes ) parts.push(`${minutes}min`);
  return parts.length ? parts.join(" ") : "0min";
}

/* -------------------------------------------- */
/*  Handlebars Template Helpers                 */
/* -------------------------------------------- */

/**
 * Build `item-table.hbs` context (hasRows/emptyLabel/sections) from finalized type groups.
 * @param {object} options
 * @param {{ label: string, items: object[] }[]} options.groups
 * @param {string} options.emptyLabel
 * @param {object[]} options.columns
 * @param {string} options.rowTemplate
 * @returns {{ hasRows: boolean, emptyLabel: string, sections: object[] }}
 */
export function buildItemTableSections({ groups, emptyLabel, columns, rowTemplate }) {
  const sections = groups.map(group => ({
    type: group.type, label: group.label,
    columns,
    rows: group.items.map(row => ({ ...row, template: rowTemplate }))
  }));
  return { hasRows: sections.some(s => s.rows.length > 0), emptyLabel, sections };
}

/* -------------------------------------------- */

/**
 * Turn a Map of type → rows into the sorted, labeled group array used by both Buy and Sell tables.
 * @param {Map<string, object[]>} groups
 * @returns {{ type: string, label: string, items: object[] }[]}
 */
export function finalizeGroups(groups) {
  return Array.from(groups, ([type, items]) => ({
    type,
    label: (type === "unknown") ? _loc("SIMPLE_SHOP_CRAFT_5E.Unknown") : _loc(`TYPES.Item.${type}Pl`),
    items
  })).sort((a, b) => {
    return (CONFIG.Item.dataModels[a.type]?.inventorySection?.order ?? Infinity)
    - (CONFIG.Item.dataModels[b.type]?.inventorySection?.order ?? Infinity);
  });
}

/* -------------------------------------------- */

/**
 * Define a set of template paths to pre-load. Pre-loaded templates are compiled and cached for fast access when
 * rendering.
 * @returns {Promise}
 */
export async function preloadHandlebarsTemplates() {
  return foundry.applications.handlebars.loadTemplates([
    "modules/simple-shop-craft-5e/templates/partials/currency-parts.hbs",
    "modules/simple-shop-craft-5e/templates/partials/currency-inputs.hbs",
    "modules/simple-shop-craft-5e/templates/partials/item-table.hbs",
    "modules/simple-shop-craft-5e/templates/partials/material-row.hbs",
    "modules/simple-shop-craft-5e/templates/shop-manager/recipe-row.hbs",
    "modules/simple-shop-craft-5e/templates/shop-manager/shop-row.hbs",
    "modules/simple-shop-craft-5e/templates/shops/shop-sheet/buy-row.hbs",
    "modules/simple-shop-craft-5e/templates/shops/shop-sheet/sell-row.hbs",
    "modules/simple-shop-craft-5e/templates/shops/shop-sheet/players-dialog-row.hbs"
  ]);
}

/* -------------------------------------------- */
/*  Items                                       */
/* -------------------------------------------- */

/**
 * Whether an item's identifier is still the unedited default the system assigns at creation — the
 * slugified type label, from an item whose name was never changed away from it.
 * @param {Item5e} item
 * @returns {boolean}
 */
export function isDefaultIdentifier(item) {
  if ( !item?.system?.identifier ) return true;
  const typeLabel = CONFIG.Item.typeLabels[item.type];
  if ( !typeLabel ) return false;
  return item.system.identifier === game.dnd5e.utils.formatIdentifier(_loc(typeLabel));
}

/* -------------------------------------------- */

/**
 * An item's lowest (or only) rarity, from `system.rarities` when present and `system.rarity` otherwise.
 * Works for full documents and raw compendium index entries alike.
 * @param {Item5e|object} item
 * @returns {string}
 */
export function itemRarity(item) {
  return Array.from(item.system?.rarities ?? [])[0] ?? item.system?.rarity ?? "";
}

/* -------------------------------------------- */

/**
 * Stable key identifying an identifier/uuid/criteria-based entry — `uuid` when present, otherwise `identifier`,
 * otherwise a composite of the type/subtype criteria.
 * @param {{ identifier?: string, uuid?: string, criteria?: object }} entry
 * @returns {string}
 */
export function itemRefKey(entry) {
  if ( entry.criteria?.type ) {
    return `criteria:${entry.criteria.type}:${entry.criteria.subtype || ""}`;
  }
  return entry.uuid || entry.identifier;
}

/* -------------------------------------------- */

/**
 * Whether an item's own price is unset, meaning a rarity-based fallback price is being shown for it
 * instead.
 * @param {Item5e|null} item
 * @returns {boolean}
 */
export function needsDefaultPrice(item) {
  return !!item && !item.system.price?.value;
}

/* -------------------------------------------- */

/**
 * Open an item's sheet, locking it read-only if the item isn't a persisted document in its own collection
 * (e.g. a synthesized/unlinked item that would otherwise crash if edited).
 * @param {Item5e} item
 */
export function openItemSheet(item) {
  const sheet = item.sheet;
  if ( !item.collection?.has(item.id) ) Object.defineProperty(sheet, "isEditable", { get: () => false });
  sheet.render(true);
}

/* -------------------------------------------- */

/**
 * Resolve the canonical bundle size (stack quantity, e.g. 20 for a stack of arrows) for a batch of owned
 * items, via their `system.identifier` matched against the catalog. Items without a resolvable identifier,
 * or whose catalog match isn't itself a multi-unit stack, resolve to 1.
 * @param {Item5e[]} items
 * @returns {Promise<Map<string, number>>}  Bundle size per item id.
 */
export async function resolveBundleSizes(items) {
  const identifiers = new Set(items.map(i => i.system.identifier).filter(Boolean));
  const byIdentifier = await resolveIdentifierIndex(identifiers);
  return new Map(items.map(i => {
    const catalogEntry = byIdentifier.get(i.system.identifier);
    return [i.id, (catalogEntry?.system?.quantity > 1) ? catalogEntry.system.quantity : 1];
  }));
}

/* -------------------------------------------- */

/**
 * Resolve a batch of identifier/uuid-based entries to their referenced items.
 * Tries `uuid` first, falling back to a batched `identifier` lookup for the rest.
 * @param {{ identifier?: string, uuid?: string }[]} entries
 * @returns {Promise<{ entry: object, item: object|null }[]>}
 */
export async function resolveEntries(entries) {
  const identifiers = new Set(entries.filter(e => !e.uuid && e.identifier).map(e => e.identifier));
  const byIdentifier = await resolveIdentifierIndex(identifiers);

  return Promise.all(entries.map(async entry => {
    let byUuid = null;
    if ( entry.uuid ) {
      try {
        byUuid = await fromUuid(entry.uuid);
      } catch ( err ) {
        console.warn(`${MODULE_ID} | Failed to resolve ${entry.uuid}:`, err);
      }
    }
    const item = byUuid ?? (entry.identifier ? byIdentifier.get(entry.identifier) ?? null : null);
    return { entry, item };
  }));
}

/* -------------------------------------------- */

/**
 * Resolve a batch of `system.identifier`s against all currently active compendium sources, falling back to
 * the world's Items directory. Tries `module` sources first, then `system`, then `world` compendiums, then
 * the world's Items directory.
 * @param {Set<string>} identifiers
 * @returns {Promise<Map<string, object>>}  Matching index entry per identifier, when found.
 */
export async function resolveIdentifierIndex(identifiers) {
  const byIdentifier = new Map();
  if ( !identifiers.size ) return byIdentifier;

  const rules = game.dnd5e.settings.rulesVersion === "modern" ? "2024" : "2014";
  const packsByPackageType = getPacksByPackageType();
  const remaining = new Set(identifiers);

  const considerEntry = entry => {
    const identifier = entry.system?.identifier;
    if ( !identifier || !remaining.has(identifier) ) return;
    if ( entry.system?.container ) return;
    if ( !CONFIG.Item.dataModels[entry.type]?.inventorySection ) return;

    const existing = byIdentifier.get(identifier);
    if ( !existing ) {
      byIdentifier.set(identifier, entry);
      return;
    }
    const entryMatches = (entry.system?.source?.rules ?? rules) === rules;
    const existingMatches = (existing.system?.source?.rules ?? rules) === rules;
    if ( entryMatches && !existingMatches ) byIdentifier.set(identifier, entry);
    else if ( entryMatches === existingMatches ) {
      console.debug(`${MODULE_ID} | Multiple items share identifier "${identifier}":`, existing, entry);
    }
  };

  for ( const packageType of PACKAGE_TYPE_ORDER ) {
    if ( !remaining.size ) break;
    for ( const pack of packsByPackageType.get(packageType) ?? [] ) {
      let index;
      try {
        index = await pack.getIndex({ fields: [
          "system.identifier", "system.source", "system.price.value", "system.price.denomination",
          "system.weight.value", "system.weight.units", "system.quantity", "system.type.value",
          "system.rarity", "system.rarities",
          "system.properties"
        ] });
      } catch ( err ) {
        console.warn(`${MODULE_ID} | Failed to index pack ${pack.metadata.id}:`, err);
        continue;
      }
      for ( const entry of index ) considerEntry(entry);
    }
    for ( const identifier of byIdentifier.keys() ) remaining.delete(identifier);
  }
  if ( remaining.size ) for ( const item of game.items ) considerEntry(item);

  return byIdentifier;
}

/* -------------------------------------------- */

/**
 * Resolve an item's effective price: its own price if set, otherwise the rarity-based fallback.
 * @param {Item5e|object} [item]
 * @param {object} [overrides]
 * @param {string} [overrides.rarity]        Rarity to use instead of `item.system.rarity` — for enchant
 *   profiles, whose effective rarity can differ from the enchant item's own.
 * @param {boolean} [overrides.isAmmo]        Ammo trait to use instead of `item.system.type?.value`.
 * @param {boolean} [overrides.isConsumable]  Consumable trait to use instead of `item.type`.
 * @returns {{ value: number, denomination: string }|null}
 */
export function resolveItemPrice(item, { rarity, isAmmo, isConsumable }={}) {
  if ( !item ) return null;
  return item.system.price?.value
    ? { value: item.system.price.value, denomination: item.system.price.denomination }
    : resolveRarityPrice(rarity ?? itemRarity(item), {
      isAmmo: isAmmo ?? (item.system.type?.value === "ammo"), isConsumable: isConsumable ?? (item.type === "consumable")
    });
}

/* -------------------------------------------- */

/**
 * Resolve the rarity-tier default price for a given rarity. Ammunition is priced per single piece, a
 * tenth of the consumable default, per the DMG 2024 guidance that ten pieces equal one potion of the
 * same rarity in value.
 * @param {string} rarity
 * @param {object} [options]
 * @param {boolean} [options.isAmmo]
 * @param {boolean} [options.isConsumable]
 * @returns {{ value: number, denomination: string }|null}  Null if the rarity has no resolvable tier.
 */
export function resolveRarityPrice(rarity, { isAmmo=false, isConsumable=false }={}) {
  const row = RARITY_DEFAULT_PRICES[rarity];
  if ( !row ) return null;
  const value = isAmmo ? (row.consumable / 10) : (isConsumable ? row.consumable : row.durable);
  return { value, denomination: "gp" };
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

/* -------------------------------------------- */
/*  Rendering                                   */
/* -------------------------------------------- */

/**
 * Show or hide item rows within an `.items-list` by name match and/or selected type, hiding a type section
 * entirely once every row within it is filtered out. Leaves already-suppressed (`[hidden]`) rows untouched.
 * @param {RegExp} rgx
 * @param {string} typeFilter  Selected type, or "" for no filter.
 * @param {HTMLElement} content
 */
export function applyItemFilters(rgx, typeFilter, content) {
  for ( const section of content.querySelectorAll(".items-section") ) {
    const typeMatches = !typeFilter || (section.dataset.type === typeFilter);
    let matched = false;
    for ( const row of section.querySelectorAll(".item:not([hidden])") ) {
      const match = typeMatches && foundry.applications.ux.SearchFilter.testQuery(rgx, row.dataset.name);
      if ( match ) matched = true;
      row.style.display = match ? "" : "none";
    }
    section.style.display = matched ? "" : "none";
  }
}

/* -------------------------------------------- */

/**
 * Reorder each `.item-list` within an `.items-list` by name or by the given sort mode. Runs on every
 * render, so newly added rows are always inserted in sorted order without requiring user interaction.
 * @param {string} sortType
 * @param {HTMLElement} content
 */
export function applyItemSort(sortType, content) {
  for ( const list of content.querySelectorAll(".item-list") ) {
    const rows = Array.from(list.children);
    if ( sortType === "name" ) rows.sort((a, b) => a.dataset.name.localeCompare(b.dataset.name));
    else rows.sort((a, b) => Number(a.dataset[sortType]) - Number(b.dataset[sortType]));
    rows.forEach(row => list.append(row));
  }
}

/* -------------------------------------------- */

/**
 * Attach an items-list part's sort-cycle button (`.sort-control`), type filter (`.item-type-filter`), search
 * filter (`.item-search`), and clear button (`.clear-control`). A control absent from the DOM is skipped.
 * @param {HTMLElement} htmlElement
 * @param {object} options
 * @param {Record<string, { icon: string, label: string }>} options.sortModes
 * @param {string} options.sort                Current sort mode.
 * @param {(sort: string) => void} options.setSort
 * @param {string} [options.typeFilter]        Selected type, for a part that has a type filter.
 * @param {(value: string) => void} [options.setTypeFilter]
 * @param {string} options.search              Current search query.
 * @param {(query: string) => void} options.setSearch
 * @param {() => void} options.onSort          Called after the sort mode changes.
 * @returns {HTMLElement|null}  The `.items-list` element, or `null` if this part has none.
 */
export function applyListControls(htmlElement, {
  sortModes, sort, setSort, typeFilter, setTypeFilter, search, setSearch, onSort
}) {
  const content = htmlElement.querySelector(".items-list");
  if ( !content ) return null;

  const typeSelect = htmlElement.querySelector(".item-type-filter");
  const sortButton = htmlElement.querySelector(".sort-control");
  const clearButton = htmlElement.querySelector(".clear-control");

  if ( typeSelect ) {
    typeSelect.value = typeFilter ?? "";
    typeSelect.closest(".filter-control")?.classList.toggle("active", !!typeSelect.value);
  }
  if ( sortButton ) {
    sortButton.querySelector("i").className = sortModes[sort].icon;
    sortButton.setAttribute("aria-label", _loc(sortModes[sort].label));
    sortButton.addEventListener("click", () => {
      const modes = Object.keys(sortModes);
      setSort(modes[(modes.indexOf(sort) + 1) % modes.length]);
      onSort();
    });
  }

  const searchFilter = new foundry.applications.ux.SearchFilter({
    inputSelector: ".item-search", contentSelector: ".items-list", initial: search,
    callback: (event, query, rgx) => {
      setSearch(query);
      applyItemFilters(rgx, typeSelect?.value ?? "", content);
    }
  });
  searchFilter.bind(htmlElement);

  typeSelect?.addEventListener("change", () => {
    setTypeFilter(typeSelect.value);
    typeSelect.closest(".filter-control").classList.toggle("active", !!typeSelect.value);
    applyItemFilters(searchFilter.rgx, typeSelect.value, content);
  });

  clearButton?.addEventListener("click", () => {
    searchFilter.filter(null, "");
    if ( typeSelect ) {
      typeSelect.value = "";
      typeSelect.dispatchEvent(new Event("change"));
    }
  });

  return content;
}

/* -------------------------------------------- */

/**
 * Wire a `[data-drop-area]` element's dragover/dragenter/dragleave/drop events, toggling its
 * `is-dragover` hover-highlight class while a drag is over it. No-op if `element` is null.
 * @param {HTMLElement|null} element
 * @param {(event: DragEvent) => void} onDrop
 */
export function applyDropArea(element, onDrop) {
  element?.addEventListener("dragover", event => event.preventDefault());
  element?.addEventListener("dragenter", () => element.classList.add("is-dragover"));
  element?.addEventListener("dragleave", event => {
    if ( event.currentTarget.contains(event.relatedTarget) ) return;
    element.classList.remove("is-dragover");
  });
  element?.addEventListener("drop", onDrop);
}

/* -------------------------------------------- */

/**
 * Build the markup for a loading tooltip section, displayed as a spinner while a document's rich
 * tooltip content is fetched.
 * @param {string} uuid  UUID of the document whose rich tooltip should be displayed.
 * @returns {string}
 */
export function loadingTooltip(uuid) {
  if ( game.dnd5e.utils.loadingTooltip ) return game.dnd5e.utils.loadingTooltip({ uuid });
  return `<section class="loading" data-uuid="${uuid}"><i class="fas fa-spinner fa-spin-pulse" inert></i></section>`;
}

/* -------------------------------------------- */

/**
 * Wire an element's loading-tooltip dataset attributes, keyed by its `data-uuid`. No-op if the element
 * has no `data-uuid`.
 * @param {HTMLElement} el
 */
export function applyLoadingTooltip(el) {
  const uuid = el.dataset.uuid;
  if ( !uuid ) return;
  el.dataset.tooltipHtml = loadingTooltip(uuid);
  el.dataset.tooltipClass = game.dnd5e.utils.loadingTooltip
    ? "dnd5e2 dnd5e-tooltip item-tooltip"
    : "dnd5e2 dnd5e-tooltip item-tooltip themed theme-light";
  el.dataset.tooltipDirection ??= "LEFT";
}

/* -------------------------------------------- */
/*  Time                                        */
/* -------------------------------------------- */

/**
 * Seconds in a full day-night cycle on the active calendar.
 * @returns {number}
 */
export function secondsPerDay() {
  const days = game.time.calendar?.days ?? {};
  return (days.hoursPerDay ?? 24) * (days.minutesPerHour ?? 60) * (days.secondsPerMinute ?? 60);
}
