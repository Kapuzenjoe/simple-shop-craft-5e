import { entryKey as resolveEntryKey, resolveIdentifierIndex } from "../item-resolver.mjs";

import { synthesizeEnchantedItem } from "./enchantment.mjs";

/**
 * Stable key identifying a shop item entry — a composite of the generated recipe for generated entries,
 * the spell UUID for spell scroll entries, otherwise the generic identifier/uuid key.
 * @param {ShopItemEntryData} entry
 * @returns {string}
 */
export function entryKey(entry) {
  if ( entry.generated ) return [entry.generated.baseItemUuid, entry.generated.enchantItemUuid, entry.generated.effectId].join("|");
  if ( entry.spellScroll ) return entry.spellScroll.spellUuid;
  return resolveEntryKey(entry);
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
 * Resolve a spell scroll shop entry's recipe into a synthesized, non-persisted Item.
 * @param {{ spellUuid: string }} spellScroll
 * @returns {Promise<Item5e|null>}
 */
async function resolveSpellScrollItem({ spellUuid }) {
  return Item.implementation.createScrollFromCompendiumSpell(spellUuid, { dialog: false }) ?? null;
}
