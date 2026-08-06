import { MODULE_ID } from "../config.mjs";

/**
 * Package types, in priority order, searched when resolving a shop item's identifier.
 * @type {string[]}
 */
const TIER_ORDER = ["module", "system", "world"];

/**
 * Group active Item compendium packs by their owning package type.
 * @returns {Map<string, CompendiumCollection[]>}
 */
function getPacksByTier() {
  const sources = game.dnd5e.applications.settings.CompendiumBrowserSettingsConfig.collateSources();
  const packsByTier = new Map();
  for ( const pack of game.packs ) {
    if ( (pack.documentName !== "Item") || !sources.has(pack.collection) ) continue;
    const tier = pack.metadata.packageType;
    if ( !packsByTier.has(tier) ) packsByTier.set(tier, []);
    packsByTier.get(tier).push(pack);
  }
  return packsByTier;
}

/* -------------------------------------------- */

/**
 * Resolve a batch of `system.identifier`s against all currently active compendium sources.
 * Tries `module` sources first, then `system`, then `world`.
 * @param {Set<string>} identifiers
 * @returns {Promise<Map<string, object>>}  Matching index entry per identifier, when found.
 */
async function resolveIdentifierIndex(identifiers) {
  const byIdentifier = new Map();
  if ( !identifiers.size ) return byIdentifier;

  const rules = game.dnd5e.settings.rulesVersion === "modern" ? "2024" : "2014";
  const packsByTier = getPacksByTier();
  const remaining = new Set(identifiers);

  for ( const tier of TIER_ORDER ) {
    if ( !remaining.size ) break;
    for ( const pack of packsByTier.get(tier) ?? [] ) {
      const index = await pack.getIndex({ fields: [
        "system.identifier", "system.source.rules", "system.price.value", "system.price.denomination",
        "system.weight.value", "system.weight.units", "system.quantity"
      ] });
      for ( const entry of index ) {
        const identifier = entry.system?.identifier;
        if ( !identifier || !remaining.has(identifier) ) continue;
        const entryRules = entry.system?.source?.rules;
        if ( entryRules && (entryRules !== rules) ) continue;
        if ( !CONFIG.Item.dataModels[entry.type]?.inventorySection ) continue;
        if ( byIdentifier.has(identifier) ) {
          console.warn(`${MODULE_ID} | Multiple items share identifier "${identifier}":`, byIdentifier.get(identifier), entry);
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
 * Open the compendium browser in selection mode and resolve the chosen items to identifier/type pairs.
 * @returns {Promise<Array<{identifier: string, type: string}>>}
 */
export async function pickItemIdentifiers() {
  const selection = await game.dnd5e.applications.CompendiumBrowser.select({
    tab: "physical",
    selection: { min: 1 }
  });
  if ( !selection?.size ) return [];

  const items = await Promise.all(Array.from(selection).map(uuid => fromUuid(uuid)));
  return items
    .filter(item => item?.system?.identifier)
    .map(item => ({ identifier: item.system.identifier, type: item.type }));
}

/* -------------------------------------------- */

/**
 * Stable key identifying a shop item entry — `uuid` when present (drag&drop-added entries aren't
 * guaranteed a unique `identifier`), otherwise `identifier`.
 * @param {ShopItemEntryData} entry
 * @returns {string}
 */
export function entryKey(entry) {
  return entry.uuid || entry.identifier;
}

/* -------------------------------------------- */

/**
 * Resolve a batch of shop item entries (by `identifier` or `uuid`) to their referenced items.
 * Tries `uuid` first, falling back to a batched `identifier` lookup for the rest.
 * @param {ShopItemEntryData[]} entries
 * @returns {Promise<Array<{entry: ShopItemEntryData, item: object|null}>>}
 */
export async function resolveShopItems(entries) {
  const identifiers = new Set(entries.filter(e => !e.uuid && e.identifier).map(e => e.identifier));
  const byIdentifier = await resolveIdentifierIndex(identifiers);

  return Promise.all(entries.map(async entry => {
    const byUuid = entry.uuid ? await fromUuid(entry.uuid) : null;
    const item = byUuid ?? (entry.identifier ? byIdentifier.get(entry.identifier) ?? null : null);
    return { entry, item };
  }));
}
