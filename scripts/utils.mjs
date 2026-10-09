import { ANY_VALUE, BUNDLE_SIZES, EXCLUDED_PACKS, MODULE_ID, RARITY_DEFAULT_PRICES, SETTING_KEYS } from "./config.mjs";
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
 * the target item's own bundle size. The duration is at least one minute.
 * @param {Recipe} recipe
 * @param {{ days: number, gold: number }|null} craftCost
 * @param {Item5e} [targetItem]
 * @returns {number}
 */
export function resolveTotalHours(recipe, craftCost, targetItem) {
  const hoursPerUnit = { minute: 1 / 60, hour: 1, day: maxHoursPerWorkday() };
  if ( recipe.durationOverride.value != null ) {
    return Math.max(hoursPerUnit.minute, recipe.durationOverride.value * hoursPerUnit[recipe.durationOverride.units]);
  }
  const scale = recipe.targetQuantity / resolveBundleSize(targetItem);
  return Math.max(hoursPerUnit.minute, (craftCost?.days ?? 0) * scale * maxHoursPerWorkday());
}

/* -------------------------------------------- */

/**
 * Resolve an item's crafting cost — `CONFIG.DND5E.crafting.exceptions`/`.scrolls` for Potion of Healing
 * and Spell Scrolls, a copper-precise mundane-item calculation for non-magical items, otherwise
 * `item.system.getCraftCost()`.
 * @param {Item5e} item
 * @returns {Promise<{ days: number, gold: number }>}
 */
async function effectiveCraftCost(item) {
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

/**
 * Resolve a recipe's crafting cost: `CONFIG.DND5E.crafting.scrolls[level]` for a spell-scroll recipe,
 * otherwise `effectiveCraftCost()` on the resolved target item.
 * @param {Recipe} recipe
 * @param {Item5e|null} targetItem  The recipe's resolved target item, if any.
 * @returns {Promise<{ days: number, gold: number }|null>}
 */
export async function recipeCraftCost(recipe, targetItem) {
  if ( recipe.spellScroll ) return CONFIG.DND5E.crafting.scrolls[recipe.spellScroll.level] ?? null;
  if ( !targetItem?.uuid ) return null;
  try {
    const fullItem = await fromUuid(targetItem.uuid);
    return fullItem?.system?.getCraftCost ? effectiveCraftCost(fullItem) : null;
  } catch ( err ) {
    console.warn(`${MODULE_ID} | Failed to resolve craft cost for ${targetItem.uuid}:`, err);
    return null;
  }
}

/* -------------------------------------------- */

/**
 * Synthesize a non-persisted scroll Item for a spell, with a unique per-level, per-spell `system.identifier`
 * in place of the generic template's shared one.
 * @param {Item5e} spell
 * @param {{ dc: number, bonus: number }} [values]  Save DC and attack bonus for the created scroll. Omit to
 *   fall back to `Item5e.createScrollFromSpell()`'s own default.
 * @returns {Promise<Item5e|null>}
 */
export async function createSpellScroll(spell, values) {
  const config = { dialog: false };
  if ( values ) config.values = values;
  const scroll = await Item.implementation.createScrollFromSpell(spell, {}, config);
  if ( !scroll ) return null;
  const level = scroll.system.activities?.find(a => a.type === "cast")?.spell?.level ?? 0;
  scroll.updateSource({ "system.identifier": `spell-scroll-${level}-${spell.identifier}` });
  return scroll;
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
function getCurrencyOptions({ abbreviated=false }={}) {
  return Object.entries(CONFIG.DND5E.currencies).map(([value, cfg]) => ({
    value, label: abbreviated ? cfg.abbreviation : cfg.label
  }));
}

/* -------------------------------------------- */

/**
 * Build a single-line Value + Currency split-group fieldlist entry.
 * @param {object} options
 * @param {string} options.label
 * @param {string} [options.hint]
 * @param {SchemaField} options.field
 * @param {string} options.valueName
 * @param {number|null} [options.value]
 * @param {string|number} [options.placeholder="0"]
 * @param {string} options.denominationName
 * @param {string} [options.denomination]
 * @returns {object}
 */
export function currencyValueField({
  label, hint, field, valueName, value, placeholder="0", denominationName, denomination
}) {
  return {
    group: { label, hint },
    fields: [
      { field: field.fields.value, name: valueName, value, placeholder, label },
      {
        field: field.fields.denomination, name: denominationName, value: denomination,
        label: _loc("DND5E.Currency"), options: getCurrencyOptions({ abbreviated: true })
      }
    ]
  };
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
 * Convert a value in a given denomination to a whole number of copper pieces, rounded down after removing
 * floating-point error.
 * Uses the system's `roundCurrency` if it is available.
 * @see dnd5e — roundCurrency()
 * @param {number} value
 * @param {string} [denomination="gp"]
 * @returns {number}
 */
export function toCopper(value, denomination="gp") {
  const cpPerUnit = CONFIG.DND5E.currencies.cp.conversion / (CONFIG.DND5E.currencies[denomination]?.conversion ?? 1);
  const copper = Number((value * cpPerUnit).toFixed(6));
  return Math.floor(game.dnd5e.utils.roundCurrency?.(copper, "cp") ?? copper);
}

/* -------------------------------------------- */
/*  Documents                                   */
/* -------------------------------------------- */

/**
 * Return whether dnd5e's daily recovery is currently being handled manually rather than by the calendar.
 * @returns {boolean}
 */
function isManualRecoveryActive() {
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
  const totalMinutes = Math.round(totalHours * 60);
  const dayCount = days ? Math.floor(totalMinutes / (hoursPerWorkday * 60)) : 0;
  const remainder = totalMinutes - (dayCount * hoursPerWorkday * 60);
  const hours = Math.floor(remainder / 60);
  const minutes = remainder % 60;
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
 * @param {object} [options]
 * @param {(type: string) => string|null} [options.labelFor]  Override for a specific type's label, checked
 *   before the generic `TYPES.Item.<type>Pl` fallback. Return `null`/`undefined` to use the fallback.
 * @returns {{ type: string, label: string, items: object[] }[]}
 */
export function finalizeGroups(groups, { labelFor }={}) {
  return Array.from(groups, ([type, items]) => ({
    type,
    label: labelFor?.(type)
      ?? ((type === "unknown") ? _loc("SIMPLE_SHOP_CRAFT_5E.Unknown") : _loc(`TYPES.Item.${type}Pl`)),
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
    "modules/simple-shop-craft-5e/templates/shared/currency-parts.hbs",
    "modules/simple-shop-craft-5e/templates/shared/currency-inputs.hbs",
    "modules/simple-shop-craft-5e/templates/shared/fieldlist.hbs",
    "modules/simple-shop-craft-5e/templates/shared/item-table.hbs",
    "modules/simple-shop-craft-5e/templates/shared/rich-tooltip.hbs",
    "modules/simple-shop-craft-5e/templates/shared/material-row.hbs",
    "modules/simple-shop-craft-5e/templates/shared/type-filter.hbs",
    "modules/simple-shop-craft-5e/templates/shop-manager/recipe-row.hbs",
    "modules/simple-shop-craft-5e/templates/shop-manager/shop-row.hbs",
    "modules/simple-shop-craft-5e/templates/shops/shop-sheet/buy-row.hbs",
    "modules/simple-shop-craft-5e/templates/shops/shop-sheet/sell-row.hbs",
    "modules/simple-shop-craft-5e/templates/shops/shop-config/players-config/row.hbs"
  ]);
}

/* -------------------------------------------- */
/*  Items                                       */
/* -------------------------------------------- */

/**
 * Whether an item is dnd5e's generic Spell Scroll item — picking it activates spell-scroll handling.
 * @param {Item5e} item
 * @returns {boolean}
 */
export function isSpellScrollItem(item) {
  return (item.system.identifier === "spell-scroll") || /spell scroll/i.test(item.name ?? "");
}

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
 * Get the identifier used to match an entry against owned items.
 * An identifier stored on the entry takes precedence over the identifier of its item.
 * The default identifier of an item is ignored.
 * @param {{ identifier?: string }} entry  The entry to match.
 * @param {Item5e|object|null} item        The item the entry resolves to.
 * @returns {string}
 */
export function matchIdentifier(entry, item) {
  if ( entry.identifier ) return entry.identifier;
  return (item && !isDefaultIdentifier(item)) ? item.system.identifier : "";
}

/* -------------------------------------------- */

/**
 * Find the owned item that an item stacks onto.
 * Items stack by identifier and type, except containers and items that still have the default identifier.
 * @param {Actor5e} actor
 * @param {Item5e|object|null} item  The item being added.
 * @returns {Item5e|null}
 */
export function findStack(actor, item) {
  if ( !item || (item.type === "container") || isDefaultIdentifier(item) ) return null;
  return actor.identifiedItems.get(item.system.identifier, { type: item.type })?.first() ?? null;
}

/* -------------------------------------------- */

/**
 * Stable key identifying the item of an entry — its matching identifier, otherwise its `uuid`, or a composite
 * of the type/subtype criteria for criteria-based entries.
 * @param {{ identifier?: string, uuid?: string, criteria?: object }} entry  The entry to identify.
 * @param {Item5e|object|null} [item]                                         The item the entry resolves to.
 * @returns {string}
 */
export function itemRefKey(entry, item) {
  if ( entry.criteria?.type ) {
    return `criteria:${entry.criteria.type}:${entry.criteria.subtype || ""}`;
  }
  return matchIdentifier(entry, item) || entry.uuid;
}

/* -------------------------------------------- */

/**
 * Create a reference to an item from its UUID.
 * @param {Item5e|object} item  An item or compendium index entry.
 * @returns {{ uuid: string }}
 */
export function itemRef(item) {
  return { uuid: item.uuid };
}

/* -------------------------------------------- */

/**
 * Get the warning for an entry whose identifier can't be relied on.
 * @param {object} resolved
 * @param {object} resolved.entry      The entry that was resolved.
 * @param {Item5e|null} resolved.item  The item the entry resolved to.
 * @param {object} labels
 * @param {string} labels.missing      Localization key used if the entry has no distinct identifier.
 * @param {string} labels.shared       Localization key used if the entry shares the identifier of its original.
 * @returns {string|null}
 */
export function identifierWarning({ entry, item }, { missing, shared }) {
  if ( !item ) return null;
  const identifier = matchIdentifier(entry, item);
  if ( !identifier ) return _loc(missing);
  const { duplicateSource } = item._stats ?? {};
  const source = duplicateSource ? fromUuidSync(duplicateSource, { strict: false }) : null;
  return (source?.system?.identifier === identifier) ? _loc(shared, { name: source.name }) : null;
}

/* -------------------------------------------- */

/**
 * Open an item's sheet, locking it read-only if the item isn't a persisted document in its own collection
 * (e.g. a synthesized/unlinked item that would otherwise crash if edited).
 * @param {Item5e} item
 */
export function openItemSheet(item) {
  const sheet = item.sheet;
  if ( !sheet ) return;
  if ( !item.collection?.has(item.id) ) {
    Object.defineProperty(sheet, "isEditable", { get: () => false, configurable: true });
  }
  sheet.render(true);
}

/* -------------------------------------------- */

/**
 * Prompt the user to confirm deleting a shop.
 * @returns {Promise<boolean>}
 */
export async function confirmDeleteShop() {
  return foundry.applications.api.DialogV2.confirm({
    window: { title: "SIMPLE_SHOP_CRAFT_5E.ShopManager.Shops.Delete" },
    content: `<p>${_loc("SIMPLE_SHOP_CRAFT_5E.ShopManager.Shops.DeleteConfirm")}</p>`
  });
}

/* -------------------------------------------- */

/**
 * Prompt for JSON files to import and return them.
 * @see Core — ClientDocument#importFromJSONDialog()
 * @param {object} options
 * @param {string} options.title              Localization key of the dialog title.
 * @param {string} options.hint               Localization key of the hint text.
 * @param {boolean} [options.multiple=false]  Whether several files can be selected.
 * @returns {Promise<File[]|null>}            The selected files, or `null` if the dialog was cancelled.
 */
export async function promptImportFiles({ title, hint, multiple=false }) {
  return foundry.applications.api.DialogV2.prompt({
    window: { title },
    content: `<form autocomplete="off">
      <p class="hint">${_loc(hint)}</p>
      <div class="form-group">
        <label for="data">${_loc("DOCUMENT.ImportSource")}</label>
        <div class="form-fields">
          <input type="file" name="data" accept=".json"${multiple ? " multiple" : ""}>
        </div>
      </div>
    </form>`,
    ok: {
      action: "import", label: "DOCUMENT.ImportData", icon: "fa-solid fa-file-import",
      callback: (event, button) => {
        const files = Array.from(button.form.elements.data.files);
        if ( files.length ) return files;
        ui.notifications.error("DOCUMENT.ImportDataError", { localize: true });
        return null;
      }
    },
    buttons: [{ action: "no", label: "COMMON.Cancel", icon: "fa-solid fa-xmark", callback: () => null }]
  });
}

/* -------------------------------------------- */

/**
 * Broadcast a shop to every connected client, opening it in their Shop Editor.
 * @param {string} shopId
 * @returns {Promise<void>}
 */
export async function spotlightShop(shopId) {
  const targets = game.users.filter(u => u.active && (u.id !== game.user.id));
  if ( !targets.length ) {
    ui.notifications.warn("SIMPLE_SHOP_CRAFT_5E.ShopEditor.SpotlightNoTargets", { localize: true });
    return;
  }
  await User.queryMany(targets, `${MODULE_ID}.spotlight`, { shopId });
  ui.notifications.info("SIMPLE_SHOP_CRAFT_5E.ShopEditor.SpotlightSuccess", { localize: true });
}

/* -------------------------------------------- */

/**
 * Determine how many units the price of an item covers.
 * @param {Item5e|object|null} item  Item to check.
 * @returns {number}                 The size of the bundle, or 1 if the item is not a mundane bundle.
 */
export function resolveBundleSize(item) {
  const identifier = item?.system.identifier;
  return Object.hasOwn(BUNDLE_SIZES, identifier) ? BUNDLE_SIZES[identifier] : 1;
}

/* -------------------------------------------- */

/**
 * Bulk version of `fromUuid` that performs only a single fetch per compendium.
 * Documents already cached by their compendium are not fetched again. Uses the system's version for the remaining
 * ones if it is available. Documents outside a compendium are not retrieved.
 * @see dnd5e — bulkFromUuid()
 * @param {string[]} uuids                    UUIDs of documents to retrieve.
 * @returns {Promise<Map<string, Document>>}  Documents mapped to the provided UUID.
 */
export async function bulkFromUuid(uuids) {
  const requests = uuids.map(uuid => ({ source: uuid, ...foundry.utils.parseUuid(uuid) }))
    .filter(({ collection, embedded }) => {
      return (collection instanceof foundry.documents.collections.CompendiumCollection) && !embedded.length;
    });
  const documents = new Map();
  const missing = [];
  for ( const request of requests ) {
    const cached = request.collection.get(request.id);
    if ( cached instanceof foundry.abstract.Document ) documents.set(request.source, cached);
    else missing.push(request);
  }
  if ( !missing.length ) return documents;

  let fetched;
  if ( game.dnd5e.utils.bulkFromUuid ) {
    fetched = await game.dnd5e.utils.bulkFromUuid(missing.map(({ source }) => source));
  } else {
    const fetches = Array.from(Map.groupBy(missing, ({ collection }) => collection), ([collection, group]) => {
      return collection.getDocuments({ _id__in: group.map(({ id }) => id) });
    });
    const sources = new Map(missing.map(({ source, uuid }) => [uuid, source]));
    fetched = new Map((await Promise.all(fetches)).flat().map(document => [sources.get(document.uuid), document]));
  }
  for ( const [source, document] of fetched ) documents.set(source, document);
  return documents;
}

/* -------------------------------------------- */

/**
 * Resolve a batch of identifier/uuid-based entries to their referenced items.
 * Entries with a `uuid` are resolved by it, the others by a batched `identifier` lookup. The passed entries of the
 * latter are given the `uuid` of their item, without changing their source data.
 * @param {{ identifier?: string, uuid?: string }[]} entries
 * @returns {Promise<{ entry: object, item: object|null }[]>}
 */
export async function resolveEntries(entries) {
  const unresolved = entries.filter(({ uuid, identifier }) => !uuid && identifier);
  const uuids = await resolveIdentifiers(new Set(unresolved.map(({ identifier }) => identifier)));
  for ( const entry of unresolved ) {
    if ( uuids.has(entry.identifier) ) Object.assign(entry, { uuid: uuids.get(entry.identifier), identifier: "" });
  }
  const fetched = await bulkFromUuid(entries.map(({ uuid }) => uuid).filter(_ => _));
  return Promise.all(entries.map(async entry => {
    if ( !entry.uuid ) return { entry, item: null };
    if ( fetched.has(entry.uuid) ) return { entry, item: fetched.get(entry.uuid) };
    try {
      return { entry, item: await fromUuid(entry.uuid) };
    } catch ( err ) {
      console.warn(`${MODULE_ID} | Failed to resolve ${entry.uuid}:`, err);
      return { entry, item: null };
    }
  }));
}

/* -------------------------------------------- */

/**
 * Resolve a batch of `system.identifier`s to the UUID of an item. Items of the current rules version are
 * preferred, and compendium items over items of the world's Items directory.
 * @param {Set<string>} identifiers
 * @returns {Promise<Map<string, string>>}  UUID of the matching item per identifier, when found.
 */
async function resolveIdentifiers(identifiers) {
  const uuids = new Map();
  if ( !identifiers.size ) return uuids;
  const rules = (game.dnd5e.settings.rulesVersion === "modern") ? "2024" : "2014";
  const index = await game.dnd5e.applications.CompendiumBrowser.fetch(Item, {
    filters: [{ k: "system.identifier", o: "in", v: identifiers }],
    indexFields: new Set(["system.source"]),
    sort: false
  });
  const rank = ({ system }) => ((system.source?.rules ?? rules) === rules) ? 0 : 1;
  const candidates = [...index, ...game.items].filter(item => {
    return identifiers.has(item.system.identifier) && !item.system.container
      && CONFIG.Item.dataModels[item.type]?.inventorySection;
  });
  for ( const item of candidates.sort((a, b) => rank(a) - rank(b)) ) {
    if ( !uuids.has(item.system.identifier) ) uuids.set(item.system.identifier, item.uuid);
  }
  return uuids;
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
 * Resolve the price of a single unit of an item: its own price divided by its bundle size, otherwise the
 * rarity-based fallback, which is already priced per piece.
 * @param {Item5e} item                    The item being priced.
 * @param {object} [options]
 * @param {boolean} [options.fallback=true]  Fall back to the rarity-based price if the item has no price.
 * @returns {{ value: number, denomination: string }|null}  Price per unit, or `null` if the item has none.
 */
export function resolveUnitPrice(item, { fallback=true }={}) {
  const { value, denomination } = item?.system.price ?? {};
  if ( value ) return { value: value / resolveBundleSize(item), denomination };
  const price = fallback ? resolveItemPrice(item) : null;
  return price?.value ? price : null;
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
function resolveRarityPrice(rarity, { isAmmo=false, isConsumable=false }={}) {
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

/**
 * List the item types that appear in an inventory as select options.
 * @returns {{ value: string, label: string }[]}
 */
export function itemTypeOptions() {
  return Object.keys(CONFIG.Item.dataModels)
    .filter(type => CONFIG.Item.dataModels[type]?.inventorySection)
    .map(type => ({ value: type, label: _loc(`TYPES.Item.${type}Pl`) }));
}

/* -------------------------------------------- */

/**
 * Build the fields to filter by item type and subtype: a multi-select of item types and, for each selected type,
 * one of its subtypes, ordered like an inventory.
 * @param {Record<string, Set<string>>} types  Selected subtypes by selected item type, empty to allow any subtype.
 * @returns {{ typeFields: object[], typeFieldsets: { type: string, label: string, fields: object[] }[] }}
 */
export function typeFilterFields(types) {
  const order = type => CONFIG.Item.dataModels[type]?.inventorySection?.order ?? Infinity;
  return {
    typeFields: [{
      field: new foundry.data.fields.SetField(new foundry.data.fields.StringField()), name: "types",
      label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.GenerateItemType"), value: Object.keys(types),
      options: itemTypeOptions()
    }],
    typeFieldsets: Object.keys(types).toSorted((a, b) => order(a) - order(b)).map(type => ({
      type, label: _loc(`TYPES.Item.${type}Pl`),
      fields: [{
        field: new foundry.data.fields.SetField(new foundry.data.fields.StringField()), name: `subtypes.${type}`,
        label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.GenerateItemSubtype"),
        value: types[type].size ? Array.from(types[type]) : [ANY_VALUE],
        options: [
          { value: ANY_VALUE, label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.GenerateItemAny") },
          ...subtypeOptions([type])
        ]
      }]
    }))
  };
}

/* -------------------------------------------- */

/**
 * Read the item types and subtypes submitted from the fields of `typeFilterFields`.
 * @param {object} data                Expanded form data.
 * @param {string} [group="subtypes"]  Name of the submitted object that holds the values by item type.
 * @returns {Record<string, string[]>}  Submitted values by selected item type, without the "Any" value.
 */
export function parseTypeFilter(data, group="subtypes") {
  return Object.fromEntries((data.types ?? []).map(type => [
    type, (data[group]?.[type] ?? []).filter(value => value !== ANY_VALUE)
  ]));
}

/* -------------------------------------------- */

/**
 * Check an item's type and subtype against a filter of item types with their subtypes.
 * @param {Record<string, Set<string>>} types  Subtypes by item type, empty to allow any subtype.
 * @param {string} type                        Item type to check.
 * @param {string} [subtype]                   Item subtype to check.
 * @returns {boolean}
 */
export function matchesTypeFilter(types, type, subtype) {
  const subtypes = types[type];
  return !!subtypes && (!subtypes.size || subtypes.has(subtype));
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
function applyItemFilters(rgx, typeFilter, content) {
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
function loadingTooltip(uuid) {
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

/**
 * Wire a synthesized tooltip onto an element, rendered from the same layout as dnd5e's own item tooltips.
 * @param {HTMLElement} el
 * @param {object} data
 * @param {string} data.name
 * @param {string} data.img
 * @param {string} data.subtitle
 * @param {{ value: number, denomination: string }|null} [data.price]
 * @param {string} [data.description]
 * @param {string[]} [data.properties]
 * @returns {Promise<void>}
 */
export async function applyRichTooltip(el, data) {
  el.dataset.tooltipHtml = await foundry.applications.handlebars.renderTemplate(
    "modules/simple-shop-craft-5e/templates/shared/rich-tooltip.hbs", data
  );
  el.dataset.tooltipClass = "dnd5e2 dnd5e-tooltip item-tooltip document-tooltip";
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
