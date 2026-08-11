import { MODULE_ID } from "../config.mjs";
import { excludeFilter } from "../utils.mjs";

import { findEnchantableBaseItem, getEnchantmentProfiles, resolveProfileRarity } from "./enchantment.mjs";
import { entryKey } from "./item-resolver.mjs";

/**
 * Spell levels matching each rarity tier's spell scroll price/rarity.
 * @type {Record<string, number[]>}
 */
const SPELL_SCROLL_LEVELS = {
  common: [0, 1], uncommon: [2, 3], rare: [4, 5], veryRare: [6, 7, 8], legendary: [9]
};

/**
 * Roll a random shop item entry matching the given filters — a plain item reference, a generated
 * enchanted item recipe, or (when "scroll" is among the wanted subtypes) a spell scroll recipe.
 * @param {object} options
 * @param {string[]} options.types             Item types to search, already resolved to a non-empty list.
 * @param {Set<string>|null} options.rarities   Wanted rarities ("" for mundane), or `null` for any.
 * @param {string[]|null} options.subtypes      Wanted `system.type.value` subtypes, or `null` for any.
 * @param {Set<string>} options.existingKeys    Entry keys already present in the shop, to skip duplicates.
 * @returns {Promise<{ entry: ShopItemEntryData, label: string }|null>}
 */
export async function rollShopItem({ types, rarities, subtypes, existingKeys }) {
  if ( subtypes?.includes("scroll") ) return rollSpellScroll(rarities, existingKeys);

  const rules = game.dnd5e.settings.rulesVersion === "modern" ? "2024" : "2014";
  const filters = [
    { k: "system.source.rules", o: "in", v: [rules, null, undefined] },
    excludeFilter("system.type.value", ["natural"]),
    excludeFilter("system.rarity", ["artifact"]),
    excludeFilter("system.identifier", ["spell-scroll"])
  ];
  const results = await game.dnd5e.applications.CompendiumBrowser.fetch(Item, {
    types: new Set(types), filters
  });

  const pool = [...results];
  while ( pool.length ) {
    const [candidate] = pool.splice(Math.floor(Math.random() * pool.length), 1);
    const candidateItem = await fromUuid(candidate.uuid);
    const hasEnchant = candidateItem.system.activities?.some(a => a.type === "enchant");

    if ( !hasEnchant || candidateItem.system.type?.baseItem ) {
      if ( rarities && !rarities.has(candidateItem.system.rarity || "") ) continue;
      if ( subtypes && !subtypes.includes(candidateItem.system.type?.value) ) continue;
      const entry = candidateItem.system.identifier
        ? { identifier: candidateItem.system.identifier } : { uuid: candidateItem.uuid };
      if ( existingKeys.has(entryKey(entry)) ) {
        console.log(`${MODULE_ID} | Skipping duplicate: ${candidateItem.name}`);
        continue;
      }
      return { entry: { ...entry, stock: { max: null, current: null } }, label: candidateItem.name };
    }

    const matching = getEnchantmentProfiles(candidateItem).filter(profile => {
      const rarity = resolveProfileRarity(candidateItem, profile.effect);
      return (rarity !== "artifact") && (!rarities || rarities.has(rarity));
    });
    if ( !matching.length ) continue;
    const chosen = matching[Math.floor(Math.random() * matching.length)];
    const baseItem = await findEnchantableBaseItem(chosen.activity, subtypes);
    if ( !baseItem ) continue;

    const generated = {
      baseItemUuid: baseItem.uuid, enchantItemUuid: candidateItem.uuid, effectId: chosen.effect.id
    };
    if ( existingKeys.has(entryKey({ generated })) ) {
      console.log(`${MODULE_ID} | Skipping duplicate: ${candidateItem.name} (${baseItem.name})`);
      continue;
    }
    return {
      entry: { generated, stock: { max: null, current: null } },
      label: `${baseItem.name} (${candidateItem.name})`
    };
  }
  return null;
}

/* -------------------------------------------- */

/**
 * Roll a random spell scroll matching the given rarity selection, synthesized via
 * Item5e#createScrollFromCompendiumSpell.
 * @param {Set<string>|null} wantedRarities
 * @param {Set<string>} existingKeys
 * @returns {Promise<{ entry: ShopItemEntryData, label: string }|null>}
 */
async function rollSpellScroll(wantedRarities, existingKeys) {
  const allowedLevels = wantedRarities?.size
    ? Object.entries(SPELL_SCROLL_LEVELS).filter(([r]) => wantedRarities.has(r)).flatMap(([, levels]) => levels)
    : Object.values(SPELL_SCROLL_LEVELS).flat();
  if ( !allowedLevels.length ) return null;

  const rules = game.dnd5e.settings.rulesVersion === "modern" ? "2024" : "2014";
  const results = await game.dnd5e.applications.CompendiumBrowser.fetch(Item, {
    types: new Set(["spell"]),
    filters: [
      { k: "system.source.rules", o: "in", v: [rules, null, undefined] },
      { k: "system.level", o: "in", v: allowedLevels }
    ]
  });

  const pool = [...results];
  while ( pool.length ) {
    const [candidate] = pool.splice(Math.floor(Math.random() * pool.length), 1);
    const entry = { spellScroll: { spellUuid: candidate.uuid }, stock: { max: null, current: null } };
    if ( existingKeys.has(entryKey(entry)) ) {
      console.log(`${MODULE_ID} | Skipping duplicate: ${candidate.name}`);
      continue;
    }
    return { entry, label: candidate.name };
  }
  return null;
}
