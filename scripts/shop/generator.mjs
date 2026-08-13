import { MODULE_ID } from "../config.mjs";
import { excludeFilter } from "../utils.mjs";

import { findEnchantableBaseItem, getEnchantmentProfiles, resolveProfileRarity } from "./enchantment.mjs";
import { entryKey } from "./entry-resolver.mjs";

/**
 * Spell levels matching each rarity tier's spell scroll price/rarity.
 * @type {Record<string, number[]>}
 */
const SPELL_SCROLL_LEVELS = {
  common: [0, 1], uncommon: [2, 3], rare: [4, 5], veryRare: [6, 7, 8], legendary: [9]
};

/**
 * @typedef {{ kind: "item"|"spell", index: object }} GeneratorCandidate
 */

/**
 * Fetch the combined candidate pool for a generator submission — one item index per selected type
 * (restricted to that type's own chosen subtypes, if any), plus a spell index when a spell-scroll
 * filter is set. Fetched once per submission and reused across every draw in a batch.
 * @param {object} options
 * @param {Map<string, Set<string>|null>} options.typeConfigs  Selected types mapped to their own chosen
 *   subtypes (`system.type.value`), or `null` for no restriction.
 * @param {Set<string>|null} options.rarities  Wanted rarities ("" for mundane), narrows spell levels too.
 * @param {{ schools: Set<string>|null, ritualOnly: boolean, classes: Set<string>|null, levels: Set<number>|null }|null} options.spellFilter
 * @returns {Promise<GeneratorCandidate[]>}
 */
export async function buildCandidatePool({ typeConfigs, rarities, spellFilter }) {
  const rules = game.dnd5e.settings.rulesVersion === "modern" ? "2024" : "2014";
  const pool = [];

  for ( const [type, subtypes] of typeConfigs ) {
    const filters = [
      { k: "system.source.rules", o: "in", v: [rules, null, undefined] },
      excludeFilter("system.type.value", ["natural"]),
      excludeFilter("system.rarity", ["artifact"]),
      excludeFilter("system.identifier", ["spell-scroll"])
    ];
    if ( subtypes ) filters.push({ k: "system.type.value", o: "in", v: Array.from(subtypes) });
    const results = await game.dnd5e.applications.CompendiumBrowser.fetch(Item, {
      types: new Set([type]), filters
    });
    pool.push(...results.map(index => ({ kind: "item", index })));
  }

  if ( spellFilter ) {
    let allowedLevels = rarities
      ? Object.entries(SPELL_SCROLL_LEVELS).filter(([r]) => rarities.has(r)).flatMap(([, levels]) => levels)
      : Object.values(SPELL_SCROLL_LEVELS).flat();
    if ( spellFilter.levels ) allowedLevels = allowedLevels.filter(l => spellFilter.levels.has(l));
    if ( allowedLevels.length ) {
      const filters = [
        { k: "system.source.rules", o: "in", v: [rules, null, undefined] },
        { k: "system.level", o: "in", v: allowedLevels }
      ];
      if ( spellFilter.schools ) filters.push({ k: "system.school", o: "in", v: Array.from(spellFilter.schools) });
      if ( spellFilter.ritualOnly ) filters.push({ k: "system.properties", o: "has", v: "ritual" });
      if ( spellFilter.classes ) {
        const identifiers = new Set();
        for ( const value of spellFilter.classes ) {
          const list = game.dnd5e.registry.spellLists.forType(value);
          if ( list ) for ( const id of list.identifiers ) identifiers.add(id);
        }
        filters.push({ k: "system.identifier", o: "in", v: Array.from(identifiers) });
      }
      const results = await game.dnd5e.applications.CompendiumBrowser.fetch(Item, {
        types: new Set(["spell"]), filters
      });
      pool.push(...results.map(index => ({ kind: "spell", index })));
    }
  }

  return pool;
}

/* -------------------------------------------- */

/**
 * Draw one random shop item entry from a pre-built candidate pool — a plain item reference, a generated
 * enchanted item recipe, or a spell scroll recipe.
 * @param {GeneratorCandidate[]} candidatePool
 * @param {Map<string, Set<string>|null>} typeConfigs  Needed to restrict enchant base-item selection to
 *   the same subtype restriction as the enchant item's own restriction type.
 * @param {object} options
 * @param {Set<string>|null} options.rarities
 * @param {"any"|"magic"|"mundane"} options.magic
 * @param {Set<string>} options.existingKeys
 * @returns {Promise<{ entry: ShopItemEntryData, label: string }|null>}
 */
async function drawFromPool(candidatePool, typeConfigs, { rarities, magic, existingKeys }) {
  const pool = [...candidatePool];
  while ( pool.length ) {
    const [candidate] = pool.splice(Math.floor(Math.random() * pool.length), 1);

    if ( candidate.kind === "spell" ) {
      const entry = { spellScroll: { spellUuid: candidate.index.uuid }, stock: { max: null, current: null } };
      if ( existingKeys.has(entryKey(entry)) ) continue;
      return { entry, label: candidate.index.name };
    }

    const candidateItem = await fromUuid(candidate.index.uuid);
    if ( rarities && !rarities.has(candidateItem.system.rarity || "") ) continue;
    const isMagic = candidateItem.system.properties?.has("mgc") ?? false;
    if ( (magic === "magic") && !isMagic ) continue;
    if ( (magic === "mundane") && isMagic ) continue;
    const hasEnchant = candidateItem.system.activities?.some(a => a.type === "enchant");

    if ( !hasEnchant || candidateItem.system.type?.baseItem ) {
      const entry = candidateItem.system.identifier
        ? { identifier: candidateItem.system.identifier } : { uuid: candidateItem.uuid };
      if ( existingKeys.has(entryKey(entry)) ) continue;
      return { entry: { ...entry, stock: { max: null, current: null } }, label: candidateItem.name };
    }

    const matching = getEnchantmentProfiles(candidateItem).filter(profile => {
      const rarity = resolveProfileRarity(candidateItem, profile.effect);
      return (rarity !== "artifact") && (!rarities || rarities.has(rarity));
    });
    if ( !matching.length ) continue;
    const chosen = matching[Math.floor(Math.random() * matching.length)];
    const baseType = chosen.activity.restrictions.type || chosen.activity.item.type;
    const baseItem = await findEnchantableBaseItem(chosen.activity, typeConfigs.get(baseType) ?? null);
    if ( !baseItem ) continue;

    const generated = {
      baseItemUuid: baseItem.uuid, enchantItemUuid: candidateItem.uuid, effectId: chosen.effect.id
    };
    if ( existingKeys.has(entryKey({ generated })) ) continue;
    return {
      entry: { generated, stock: { max: null, current: null } },
      label: `${baseItem.name} (${candidateItem.name})`
    };
  }
  return null;
}

/* -------------------------------------------- */

/**
 * Roll a batch of random shop item entries from the generator's current filter selection. The candidate
 * pool is fetched once and reused across every draw; stops early if the pool runs out.
 * @param {object} options
 * @param {Map<string, Set<string>|null>} options.typeConfigs
 * @param {Set<string>|null} options.rarities
 * @param {"any"|"magic"|"mundane"} options.magic
 * @param {{ schools: Set<string>|null, ritualOnly: boolean }|null} options.spellFilter
 * @param {number} options.count
 * @param {Set<string>} options.existingKeys  Entry keys already present in the shop, to skip duplicates.
 * @returns {Promise<{ entry: ShopItemEntryData, label: string }[]>}
 */
export async function rollShopItems({ typeConfigs, rarities, magic, spellFilter, count, existingKeys }) {
  const candidatePool = await buildCandidatePool({ typeConfigs, rarities, spellFilter });
  const keys = new Set(existingKeys);
  const rolled = [];
  for ( let i = 0; i < count; i++ ) {
    const result = await drawFromPool(candidatePool, typeConfigs, { rarities, magic, existingKeys: keys });
    if ( !result ) break;
    keys.add(entryKey(result.entry));
    console.log(`${MODULE_ID} | Generated: ${result.label}`);
    rolled.push(result);
  }
  return rolled;
}
