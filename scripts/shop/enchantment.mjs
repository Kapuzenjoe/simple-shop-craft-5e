import { excludeFilter, isShopPackSource } from "../utils.mjs";

/**
 * `CONFIG.DND5E` base-item registries per item type, restricting enchant base-item search to real
 * catalog items instead of anything merely tagged with a matching `system.type.value`.
 * @type {Record<string, () => Record<string, string>>}
 */
const BASE_ITEM_REGISTRIES = {
  weapon: () => CONFIG.DND5E.weaponIds,
  consumable: () => CONFIG.DND5E.ammoIds,
  equipment: () => ({ ...CONFIG.DND5E.armorIds, ...CONFIG.DND5E.shieldIds })
};

/**
 * Find a random base item eligible for the given enchant Activity, searched across all active compendium
 * sources. Activity restrictions are frequently left unset by the source data, so an explicit @UUID list
 * from the enchant item's description header is preferred when present, then a category filter parsed
 * from the same header, then the Activity's own restrictions as a last resort.
 * @param {EnchantActivity} activity
 * @param {Set<string>|null} [wantedSubtypes]  Restrict to these `system.type.value` subtypes, when given.
 * @returns {Promise<Item5e|null>}
 */
export async function findEnchantableBaseItem(activity, wantedSubtypes=null) {
  const restrictionUuids = parseRestrictionUuids(activity.item);
  if ( restrictionUuids.length ) {
    const pool = [...restrictionUuids];
    while ( pool.length ) {
      const [uuid] = pool.splice(Math.floor(Math.random() * pool.length), 1);
      const candidate = await fromUuid(uuid);
      if ( !candidate ) continue;
      if ( wantedSubtypes && !wantedSubtypes.has(candidate.system.type?.value) ) continue;
      if ( activity.canEnchant(candidate) === true ) return candidate;
    }
    return null;
  }

  const itemType = activity.restrictions.type || activity.item.type;
  const types = new Set([itemType]);
  const rules = game.dnd5e.settings.rulesVersion === "modern" ? "2024" : "2014";
  const categoryFilters = parseRestrictionCategory(activity.item);
  const results = await game.dnd5e.applications.CompendiumBrowser.fetch(Item, {
    types, filters: [
      { k: "system.source.rules", o: "in", v: [rules, null, undefined] },
      excludeFilter("system.type.value", ["natural"]),
      ...categoryFilters,
      ...(wantedSubtypes ? [{ k: "system.type.value", o: "in", v: wantedSubtypes }] : [])
    ]
  });

  const fromShopPack = results.filter(index => isShopPackSource(index.uuid));
  const registry = BASE_ITEM_REGISTRIES[itemType];
  const baseItemUuids = (registry && ((itemType !== "equipment") || categoryFilters.length))
    ? new Set(Object.values(registry())) : null;
  const pool = baseItemUuids ? fromShopPack.filter(index => baseItemUuids.has(index.uuid)) : fromShopPack;
  while ( pool.length ) {
    const [candidate] = pool.splice(Math.floor(Math.random() * pool.length), 1);
    const fullCandidate = await fromUuid(candidate.uuid);
    if ( activity.canEnchant(fullCandidate) === true ) return fullCandidate;
  }
  return null;
}

/* -------------------------------------------- */

/**
 * List all enchantment profiles offered by an item's `enchant` Activities — every effect profile across
 * every such Activity, excluding profiles with rider items.
 * @param {Item5e} item
 * @returns {{ activity: EnchantActivity, effect: ActiveEffect5e }[]}
 */
export function getEnchantmentProfiles(item) {
  const enchantActivities = item.system.activities?.filter(a => a.type === "enchant") ?? [];
  return enchantActivities.flatMap(activity => (activity.effects ?? [])
    .filter(profile => !profile.riders?.item?.length)
    .map(profile => ({ activity, effect: item.effects.get(profile._id) }))
    .filter(profile => profile.effect));
}

/* -------------------------------------------- */

/**
 * Resolve a profile's effective rarity — from its own enchantment change when present, otherwise the
 * enchant item's own rarity.
 * @param {Item5e} item
 * @param {ActiveEffect5e} effect
 * @returns {string}
 */
export function resolveProfileRarity(item, effect) {
  const rarityChange = effect.system.changes?.find(change => change.key === "system.rarity");
  return rarityChange?.value ?? item.system.rarity ?? "";
}

/* -------------------------------------------- */

/**
 * Build a non-persisted Item combining a base item with a cloned enchantment effect.
 * @param {Item5e} baseItem
 * @param {Item5e} enchantItem
 * @param {ActiveEffect5e} effect
 * @returns {Item5e}
 */
export function synthesizeEnchantedItem(baseItem, enchantItem, effect) {
  const itemData = baseItem.toObject();
  delete itemData._id;
  itemData.system.quantity = 1;
  const effectData = effect.clone({ origin: effect.parent.uuid, disabled: false }).toObject();
  effectData._id = foundry.utils.randomID();
  itemData.effects = [...(itemData.effects ?? []), effectData];

  const profile = findEnchantmentProfile(enchantItem, effect.id)?.profile;
  for ( const activityId of profile?.riders.activity ?? [] ) {
    const riderActivity = enchantItem.system.activities.get(activityId);
    const activityData = riderActivity?.toObject();
    if ( !activityData ) continue;
    activityData._id = foundry.utils.randomID();
    itemData.system.activities[activityData._id] = activityData;
    for ( const riderProfile of riderActivity.effects ?? [] ) {
      if ( itemData.effects.some(e => e._id === riderProfile._id) ) continue;
      const riderEffectData = enchantItem.effects.get(riderProfile._id)?.toObject();
      if ( riderEffectData ) itemData.effects.push(riderEffectData);
    }
  }
  for ( const riderEffectId of profile?.riders.effect ?? [] ) {
    const riderEffectData = enchantItem.effects.get(riderEffectId)?.toObject();
    if ( riderEffectData ) itemData.effects.push({ ...riderEffectData, _id: foundry.utils.randomID() });
  }

  const changeKeys = new Set(effect.system.changes?.map(change => change.key));
  if ( !changeKeys.has("system.price.value") ) {
    itemData.system.price = (enchantItem.system.price?.value > 0)
      ? { ...enchantItem.system.price }
      : { ...itemData.system.price, value: 0 };
  }
  if ( !changeKeys.has("system.rarity") && enchantItem.system.rarity ) {
    itemData.system.rarity = enchantItem.system.rarity;
  }

  const bonusChange = effect.system.changes?.find(change => change.key === "system.magicalBonus");
  itemData.system.identifier = bonusChange
    ? `${itemData.system.identifier}-${bonusChange.value}`
    : `${enchantItem.system.identifier}-${itemData.system.identifier}`;

  return new Item.implementation(itemData);
}

/* -------------------------------------------- */

/**
 * Find the enchant Activity and effect profile matching a given profile ID, searched across every
 * `enchant` Activity on the item.
 * @param {Item5e} item
 * @param {string} profileId
 * @returns {{ activity: EnchantActivity, profile: object }|null}
 */
function findEnchantmentProfile(item, profileId) {
  const enchantActivities = item.system.activities?.filter(a => a.type === "enchant") ?? [];
  for ( const activity of enchantActivities ) {
    const profile = activity.effects?.find(p => p._id === profileId);
    if ( profile ) return { activity, profile };
  }
  return null;
}

/* -------------------------------------------- */

/**
 * Map known restriction-header phrases to CompendiumBrowser filters narrowing eligible base items, for
 * enchant items whose description gives only a broad category rather than a specific @UUID list.
 * @param {Item5e} item
 * @returns {FilterDescription[]}
 */
function parseRestrictionCategory(item) {
  const header = item.system.description?.value?.match(/<p><em>(.*?)<\/em><\/p>/)?.[1]?.toLowerCase() ?? "";
  const filters = [];
  if ( (item.type === "weapon") && header.includes("melee weapon") ) {
    filters.push({ k: "system.type.value", o: "in", v: ["simpleM", "martialM"] });
  } else if ( item.type === "equipment" ) {
    const categories = ["light", "medium", "heavy"].filter(category => header.includes(category));
    if ( categories.length ) filters.push({ k: "system.type.value", o: "in", v: categories });
    if ( header.includes("except hide") ) filters.push(excludeFilter("system.type.baseItem", ["hide"]));
  } else if ( (item.type === "consumable") && header.includes("ammunition") ) {
    filters.push({ k: "system.type.value", o: "in", v: ["ammo"] });
  }
  return filters;
}

/* -------------------------------------------- */

/**
 * Extract explicit base-item UUID references from an enchant item's description header — the DMG's own
 * "Weapon (Battleaxe, Greataxe, ...), Rarity" stat block line.
 * @param {Item5e} item
 * @returns {string[]}
 */
function parseRestrictionUuids(item) {
  const header = item.system.description?.value?.match(/<p><em>(.*?)<\/em><\/p>/)?.[1] ?? "";
  return [...header.matchAll(/@UUID\[([^\]]+)\]/g)].map(([, uuid]) => uuid);
}
