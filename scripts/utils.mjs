import { MODULE_ID } from "./config.mjs";

/**
 * Compendium packs excluded as shop-goods sources — monster/class "feature" packs whose weapon-typed
 * entries are combat abilities (e.g. a monster's claw), not real items.
 * @type {Set<string>}
 */
export const EXCLUDED_PACKS = new Set(["dnd5e.monsterfeatures", "dnd5e.monsterfeatures24", "dnd-monster-manual.features"]);

/**
 * Package types, in priority order, searched when resolving an identifier-based entry.
 * @type {string[]}
 */
const PACKAGE_TYPE_ORDER = ["module", "system", "world"];

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
    label: group.label,
    columns,
    rows: group.items.map(row => ({ ...row, template: rowTemplate }))
  }));
  return { hasRows: sections.some(s => s.rows.length > 0), emptyLabel, sections };
}

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
 * Whether a compendium item's own pack is eligible as a shop-goods source (see {@link EXCLUDED_PACKS}).
 * @param {string} uuid
 * @returns {boolean}
 */
export function isShopPackSource(uuid) {
  return !EXCLUDED_PACKS.has(foundry.utils.parseUuid(uuid)?.collection?.collection);
}

/* -------------------------------------------- */

/**
 * Stable key identifying an identifier/uuid-based entry — `uuid` when present, otherwise `identifier`.
 * @param {{ identifier?: string, uuid?: string }} entry
 * @returns {string}
 */
export function itemRefKey(entry) {
  return entry.uuid || entry.identifier;
}

/* -------------------------------------------- */

/**
 * Build the markup for a loading tooltip section, displayed as a spinner while a document's rich
 * tooltip content is fetched.
 * @param {string} uuid  UUID of the document whose rich tooltip should be displayed.
 * @returns {string}
 */
export function loadingTooltip(uuid) {
  return `<section class="loading" data-uuid="${uuid}"><i class="fas fa-spinner fa-spin-pulse" inert></i></section>`;
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
    const byUuid = entry.uuid ? await fromUuid(entry.uuid) : null;
    const item = byUuid ?? (entry.identifier ? byIdentifier.get(entry.identifier) ?? null : null);
    return { entry, item };
  }));
}

/* -------------------------------------------- */

/**
 * Resolve a batch of `system.identifier`s against all currently active compendium sources.
 * Tries `module` sources first, then `system`, then `world`.
 * @param {Set<string>} identifiers
 * @returns {Promise<Map<string, object>>}  Matching index entry per identifier, when found.
 */
export async function resolveIdentifierIndex(identifiers) {
  const byIdentifier = new Map();
  if ( !identifiers.size ) return byIdentifier;

  const rules = game.dnd5e.settings.rulesVersion === "modern" ? "2024" : "2014";
  const packsByPackageType = getPacksByPackageType();
  const remaining = new Set(identifiers);

  for ( const packageType of PACKAGE_TYPE_ORDER ) {
    if ( !remaining.size ) break;
    for ( const pack of packsByPackageType.get(packageType) ?? [] ) {
      const index = await pack.getIndex({ fields: [
        "system.identifier", "system.source.rules", "system.price.value", "system.price.denomination",
        "system.weight.value", "system.weight.units", "system.quantity", "system.type.value"
      ] });
      for ( const entry of index ) {
        const identifier = entry.system?.identifier;
        if ( !identifier || !remaining.has(identifier) ) continue;
        if ( entry.system?.container ) continue;
        const entryRules = entry.system?.source?.rules;
        if ( entryRules && (entryRules !== rules) ) continue;
        if ( !CONFIG.Item.dataModels[entry.type]?.inventorySection ) continue;
        if ( byIdentifier.has(identifier) ) {
          console.debug(`${MODULE_ID} | Multiple items share identifier "${identifier}":`, byIdentifier.get(identifier), entry);
          continue;
        }
        byIdentifier.set(identifier, entry);
      }
    }
    for ( const identifier of byIdentifier.keys() ) remaining.delete(identifier);
  }
  return byIdentifier;
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
