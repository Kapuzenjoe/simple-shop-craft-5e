import { excludeFilter, isShopPackSource, itemRarity, itemRef, itemRefKey } from "../utils.mjs";

const { DocumentUUIDField, FilePathField, StringField } = foundry.data.fields;

/**
 * @import { EnchantedItemBlueprintData } from "../_types.mjs";
 */

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
 * A data model that represents a shop entry's enchant-generation blueprint — a base item combined with an
 * enchantment profile from a separate enchant item, synthesized fresh into a non-persisted Item on resolve.
 * @extends {foundry.abstract.DataModel<EnchantedItemBlueprintData>}
 * @mixes EnchantedItemBlueprintData
 */
export class EnchantedItemBlueprint extends foundry.abstract.DataModel {

  /* -------------------------------------------- */
  /*  Model Configuration                         */
  /* -------------------------------------------- */

  /** @override */
  static defineSchema() {
    return {
      baseItemUuid: new DocumentUUIDField({ type: "Item", blank: true }),
      enchantItemUuid: new DocumentUUIDField({ type: "Item", blank: true }),
      effectId: new StringField({ blank: true }),
      spellUuid: new DocumentUUIDField({ type: "Item", blank: true }),
      img: new FilePathField({ categories: ["IMAGE"], blank: true }),
      identifier: new StringField({ blank: true })
    };
  }

  /* -------------------------------------------- */
  /*  Methods                                     */
  /* -------------------------------------------- */

  /**
   * Resolve this blueprint into a synthesized, non-persisted Item.
   * @returns {Promise<Item5e|null>}
   */
  async resolve() {
    const baseItem = await fromUuid(this.baseItemUuid);
    const enchantItem = await fromUuid(this.enchantItemUuid);
    const effect = enchantItem?.effects.get(this.effectId);
    const spell = this.spellUuid ? await fromUuid(this.spellUuid) : null;
    if ( !baseItem || !effect || (this.spellUuid && !spell) ) return null;
    const item = EnchantedItemBlueprint.#synthesize(baseItem, enchantItem, effect, spell);
    if ( this.img ) item.updateSource({ img: this.img });
    if ( this.identifier ) item.updateSource({ "system.identifier": this.identifier });
    return item;
  }

  /* -------------------------------------------- */

  /**
   * Can this item's type/subtype be an enchant-item template, per the DMG/SRD catalog's own pattern?
   * @param {Item5e} item
   * @returns {boolean}
   */
  static canBeTemplate(item) {
    if ( item.type === "weapon" ) return true;
    if ( item.type === "equipment" ) {
      const subtype = item.system.type?.value;
      return (subtype in CONFIG.DND5E.armorTypes) || ["ring", "rod", "wand"].includes(subtype);
    }
    if ( item.type === "consumable" ) return ["ammo", "scroll"].includes(item.system.type?.value);
    return false;
  }

  /* -------------------------------------------- */

  /**
   * List all enchantment profiles offered by an item's `enchant` Activities — every effect profile across
   * every such Activity that isn't itself a rider, excluding profiles with rider items.
   * @param {Item5e} item
   * @returns {{ activity: EnchantActivity, effect: ActiveEffect5e }[]}
   */
  static getEnchantmentProfiles(item) {
    const enchantActivities = item.system.activities?.getByType("enchant") ?? [];
    return enchantActivities.filter(activity => !activity.isRider).flatMap(activity => (activity.effects ?? [])
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
  static resolveProfileRarity(item, effect) {
    const rarityChange = effect.system.changes?.find(
      change => (change.key === "system.rarity") || (change.key === "system.rarities")
    );
    return rarityChange?.value || itemRarity(item);
  }

  /* -------------------------------------------- */

  /**
   * List the UUIDs of the base items eligible for the given enchant Activity, searched across all active compendium
   * sources; an item present in several packs counts once. Activity restrictions are frequently left unset by
   * the source data, so an explicit @UUID list from the enchant item's description header is preferred when
   * present, then a category filter parsed from the same header, then the Activity's own restrictions as a
   * last resort.
   * @param {EnchantActivity} activity
   * @param {Set<string>|null} [wantedSubtypes]  Restrict to these `system.type.value` subtypes, when given.
   * @returns {Promise<string[]>}
   */
  static async listEnchantableBaseItems(activity, wantedSubtypes=null) {
    const candidates = await EnchantedItemBlueprint.resolveBaseItemCandidates(activity);

    if ( "explicit" in candidates ) {
      return candidates.explicit
        .filter(item => !wantedSubtypes || wantedSubtypes.has(item.system.type?.value))
        .map(item => item.uuid);
    }

    const { types, categoryFilters, filters } = candidates;
    const itemType = activity.restrictions.type || activity.item.type;
    const rules = game.dnd5e.settings.rulesVersion === "modern" ? "2024" : "2014";
    const results = await game.dnd5e.applications.CompendiumBrowser.fetch(Item, {
      types, indexFields: new Set(["system.source", "system.identifier"]),
      filters: wantedSubtypes ? [...filters, { k: "system.type.value", o: "in", v: wantedSubtypes }] : filters
    });

    const fromShopPack = results
      .filter(index => [rules, null, undefined].includes(index.system?.source?.rules))
      .filter(index => isShopPackSource(index.uuid));
    const registry = BASE_ITEM_REGISTRIES[itemType];
    const baseItemUuids = (registry && ((itemType !== "equipment") || categoryFilters.length))
      ? new Set(Object.values(registry())) : null;
    const eligible = baseItemUuids ? fromShopPack.filter(index => baseItemUuids.has(index.uuid)) : fromShopPack;
    return Array.from(new Map(eligible.map(index => [itemRefKey(itemRef(index)), index.uuid])).values());
  }

  /* -------------------------------------------- */

  /**
   * Pick a random base item the given enchant Activity can enchant.
   * @param {EnchantActivity} activity
   * @param {string[]} uuids  UUIDs of the candidate base items.
   * @returns {Promise<Item5e|null>}
   */
  static async pickEnchantableBaseItem(activity, uuids) {
    const pool = [...uuids];
    while ( pool.length ) {
      const [uuid] = pool.splice(Math.floor(Math.random() * pool.length), 1);
      const candidate = await fromUuid(uuid);
      if ( activity.canEnchant(candidate) === true ) return candidate;
    }
    return null;
  }

  /* -------------------------------------------- */

  /**
   * Resolve an enchant activity's own base-item restriction from its description header — either a fixed
   * list of explicitly named base items, or a type/category filter set for a `CompendiumBrowser` search.
   * @param {EnchantActivity} activity
   * @returns {Promise<{ explicit: Item5e[], label: string }
   *   |{ types: Set<string>, categoryFilters: object[], filters: object[], label: string }>}
   */
  static async resolveBaseItemCandidates(activity) {
    const restrictionUuids = EnchantedItemBlueprint.#parseRestrictionUuids(activity.item);
    if ( restrictionUuids.length ) {
      const items = (await Promise.all(restrictionUuids.map(uuid => fromUuid(uuid)))).filter(item => item);
      return { explicit: items, label: EnchantedItemBlueprint.#describeExplicit(items) };
    }
    const itemType = activity.restrictions.type || activity.item.type;
    const categoryFilters = EnchantedItemBlueprint.#parseRestrictionCategory(activity.item);
    const filters = [excludeFilter("system.type.value", ["natural"]), ...categoryFilters];
    if ( !activity.restrictions.allowMagical ) {
      filters.push({ o: "NOT", v: { k: "system.properties", o: "has", v: "mgc" } });
    }
    return {
      types: new Set([itemType]), categoryFilters, filters,
      label: EnchantedItemBlueprint.#describeRestriction(itemType, categoryFilters)
    };
  }

  /* -------------------------------------------- */

  /**
   * Resolve the `system.identifier` an enchanted item's synthesis produces for a given base item, enchant
   * item, effect profile, and bound spell.
   * @param {Item5e} baseItem
   * @param {Item5e} enchantItem
   * @param {ActiveEffect5e} effect
   * @param {Item5e|null} [spell]  Spell bound into the item, if any.
   * @returns {string}
   */
  static resolveIdentifier(baseItem, enchantItem, effect, spell=null) {
    const bonusChange = effect.system.changes?.find(change => change.key === "system.magicalBonus");
    const identifier = bonusChange
      ? `${baseItem.system.identifier}-${bonusChange.value}`
      : `${enchantItem.system.identifier}-${baseItem.system.identifier}`;
    return spell ? `${identifier}-${spell.identifier}` : identifier;
  }

  /* -------------------------------------------- */
  /*  Helpers                                     */
  /* -------------------------------------------- */

  /**
   * Build a non-persisted Item combining a base item with a cloned enchantment effect.
   * @param {Item5e} baseItem
   * @param {Item5e} enchantItem
   * @param {ActiveEffect5e} effect
   * @param {Item5e|null} spell  Spell bound into the item, if any.
   * @returns {Item5e}
   */
  static #synthesize(baseItem, enchantItem, effect, spell) {
    const itemData = baseItem.toObject();
    delete itemData._id;
    itemData.system.quantity = 1;
    if ( spell ) itemData.name = `${itemData.name} (${spell.name})`;
    const effectData = effect.clone({ origin: effect.parent.uuid, disabled: false }).toObject();
    effectData._id = foundry.utils.randomID();
    itemData.effects = [...(itemData.effects ?? []), effectData];

    const profile = EnchantedItemBlueprint.#findProfile(enchantItem, effect.id)?.profile;
    for ( const activityId of profile?.riders.activity ?? [] ) {
      const riderActivity = enchantItem.system.activities.get(activityId);
      const activityData = riderActivity?.toObject();
      if ( !activityData ) continue;
      activityData._id = foundry.utils.randomID();
      if ( spell ) activityData.spell.uuid = spell.uuid;
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
    const enchantRarity = itemRarity(enchantItem);
    if ( !changeKeys.has("system.rarity") && !changeKeys.has("system.rarities") && enchantRarity ) {
      if ( baseItem.system.schema.has("rarities") ) itemData.system.rarities = [enchantRarity];
      else itemData.system.rarity = enchantRarity;
    }

    itemData.system.identifier = EnchantedItemBlueprint.resolveIdentifier(baseItem, enchantItem, effect, spell);

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
  static #findProfile(item, profileId) {
    const enchantActivities = item.system.activities?.getByType("enchant") ?? [];
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
  static #parseRestrictionCategory(item) {
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
   * Describe an explicit base-item restriction as a disjunction of item names.
   * @param {Item5e[]} items
   * @returns {string}
   */
  static #describeExplicit(items) {
    return game.i18n.getListFormatter({ type: "disjunction" }).format(items.map(item => item.name));
  }

  /* -------------------------------------------- */

  /**
   * Describe a type/category base-item restriction, e.g. "Weapon (Simple Weapon or Martial Weapon)".
   * @see dnd5e — EnchantActivity#canEnchant()
   * @param {string} itemType
   * @param {FilterDescription[]} categoryFilters
   * @returns {string}
   */
  static #describeRestriction(itemType, categoryFilters) {
    const typeLabel = _loc(CONFIG.Item.typeLabels[itemType]);
    const registry = CONFIG.Item.dataModels[itemType]?.itemCategories ?? {};
    const categories = categoryFilters
      .filter(f => (f.k === "system.type.value") && (f.o === "in"))
      .flatMap(f => f.v)
      .map(key => {
        const config = registry[key];
        return (foundry.utils.getType(config) === "string") ? config : (config?.label ?? key);
      });
    if ( !categories.length ) return typeLabel;
    return `${typeLabel} (${game.i18n.getListFormatter({ type: "disjunction" }).format(categories)})`;
  }

  /* -------------------------------------------- */

  /**
   * Extract explicit base-item UUID references from an enchant item's description header — the DMG's own
   * "Weapon (Battleaxe, Greataxe, ...), Rarity" stat block line.
   * @param {Item5e} item
   * @returns {string[]}
   */
  static #parseRestrictionUuids(item) {
    const header = item.system.description?.value?.match(/<p><em>(.*?)<\/em><\/p>/)?.[1] ?? "";
    return [...header.matchAll(/@UUID\[([^\]]+)\]/g)].map(([, uuid]) => uuid);
  }
}
