import { MODULE_ID } from "../config.mjs";

import { synthesizeEnchantedItem } from "./enchantment.mjs";

/**
 * Package types, in priority order, searched when resolving a shop item's identifier.
 * @type {string[]}
 */
const PACKAGE_TYPE_ORDER = ["module", "system", "world"];

/**
 * Stable key identifying a shop item entry — a composite of the generated recipe for generated entries,
 * the spell UUID for spell scroll entries, `uuid` when present (drag&drop-added entries aren't guaranteed a
 * unique `identifier`), otherwise `identifier`.
 * @param {ShopItemEntryData} entry
 * @returns {string}
 */
export function entryKey(entry) {
  if ( entry.generated ) return [entry.generated.baseItemUuid, entry.generated.enchantItemUuid, entry.generated.effectId].join("|");
  if ( entry.spellScroll ) return entry.spellScroll.spellUuid;
  return entry.uuid || entry.identifier;
}

/* -------------------------------------------- */

/**
 * Resolve a batch of shop item entries (by `identifier` or `uuid`) to their referenced items.
 * Tries `uuid` first, falling back to a batched `identifier` lookup for the rest. Generated and spell
 * scroll entries are synthesized fresh from their recipe instead.
 * @param {ShopItemEntryData[]} entries
 * @returns {Promise<{ entry: ShopItemEntryData, item: object|null }[]>}
 */
export async function resolveShopItems(entries) {
  const identifiers = new Set(entries
    .filter(e => !e.uuid && !e.generated && !e.spellScroll && e.identifier).map(e => e.identifier));
  const byIdentifier = await resolveIdentifierIndex(identifiers);

  return Promise.all(entries.map(async entry => {
    if ( entry.generated ) return { entry, item: await resolveGeneratedItem(entry.generated) };
    if ( entry.spellScroll ) return { entry, item: await resolveSpellScrollItem(entry.spellScroll) };
    const byUuid = entry.uuid ? await fromUuid(entry.uuid) : null;
    const item = byUuid ?? (entry.identifier ? byIdentifier.get(entry.identifier) ?? null : null);
    return { entry, item };
  }));
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

/**
 * Resolve a generated shop entry's recipe into a synthesized, non-persisted Item.
 * @param {{ baseItemUuid: string, enchantItemUuid: string, effectId: string }} generated
 * @returns {Promise<Item5e|null>}
 */
async function resolveGeneratedItem({ baseItemUuid, enchantItemUuid, effectId }) {
  const baseItem = await fromUuid(baseItemUuid);
  const enchantItem = await fromUuid(enchantItemUuid);
  const effect = enchantItem?.effects.get(effectId);
  if ( !baseItem || !effect ) return null;
  return synthesizeEnchantedItem(baseItem, enchantItem, effect);
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
 * Resolve a spell scroll shop entry's recipe into a synthesized, non-persisted Item.
 * @param {{ spellUuid: string }} spellScroll
 * @returns {Promise<Item5e|null>}
 */
async function resolveSpellScrollItem({ spellUuid }) {
  return Item.implementation.createScrollFromCompendiumSpell(spellUuid, { dialog: false }) ?? null;
}
