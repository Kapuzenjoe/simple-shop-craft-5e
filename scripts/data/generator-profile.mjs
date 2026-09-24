import { ENSPELLED_ITEMS, SPELL_SCROLL_LEVELS } from "../config.mjs";
import {
  excludeFilter, isShopPackSource, itemRarity, itemRef, itemRefKey, resolveItemPrice, toCopper
} from "../utils.mjs";
import { EnchantedItemBlueprint } from "./enchanted-item-blueprint.mjs";
import { newEntryStock, ShopItemEntry } from "./shop-data.mjs";

const { BooleanField, NumberField, SchemaField, SetField, StringField, TypedObjectField } = foundry.data.fields;

/**
 * @import {
 *   GeneratorCandidate, GeneratorPool, GeneratorPoolSummary, GeneratorProfileData, ShopItemEntryData
 * } from "../_types.mjs";
 */

/**
 * A data model that represents the settings of an item generator roll.
 * @extends {foundry.abstract.DataModel<GeneratorProfileData>}
 * @mixes GeneratorProfileData
 */
export default class GeneratorProfile extends foundry.abstract.DataModel {

  /** @override */
  static defineSchema() {
    return {
      types: new TypedObjectField(new SetField(new StringField())),
      baseItems: new TypedObjectField(new SetField(new StringField())),
      rarities: new SetField(new StringField()),
      magic: new StringField({ choices: ["any", "magic", "mundane"], initial: "any" }),
      weighting: new StringField({ choices: ["combination", "variant", "template"], initial: "combination" }),
      includeScrolls: new BooleanField({ initial: true }),
      includeEnspelled: new BooleanField({ initial: true }),
      spellFilter: new SchemaField({
        schools: new SetField(new StringField()),
        classes: new SetField(new StringField()),
        levels: new SetField(new NumberField({ integer: true, min: 0 })),
        ritualOnly: new BooleanField()
      }),
      count: new NumberField({ integer: true, min: 1, max: 10, initial: 1 })
    };
  }

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * Does the pool include spell scrolls? Requires the Consumable type, with Scroll among its subtypes, and no
   * restriction to mundane items. Brings in the spell filter.
   * @type {boolean}
   */
  get includesScrolls() {
    const subtypes = this.getSubtypes("consumable");
    return this.includeScrolls && (this.magic !== "mundane") && ("consumable" in this.types)
      && (subtypes?.has("scroll") ?? true);
  }

  /* -------------------------------------------- */
  /*  Methods                                     */
  /* -------------------------------------------- */

  /**
   * Get the subtypes selected for an item type.
   * @param {string} type
   * @returns {Set<string>|null}  The selected subtypes, or `null` if any subtype is allowed.
   */
  getSubtypes(type) {
    const subtypes = this.types[type];
    return subtypes?.size ? subtypes : null;
  }

  /* -------------------------------------------- */

  /**
   * Get the base items selected for an item type.
   * @param {string} type
   * @returns {Set<string>|null}  The selected base items, or `null` if any base item is allowed.
   */
  getBaseItems(type) {
    const baseItems = this.baseItems[type];
    return baseItems?.size ? baseItems : null;
  }

  /* -------------------------------------------- */

  /**
   * Get the base items that can be selected for an item type, limited to its selected subtypes. Base items that are
   * already selected stay in the list.
   * @see dnd5e — ItemSheet5e#_getBaseItemOptions()
   * @param {string} type
   * @returns {Promise<FormSelectOption[]>}  Empty for item types without selectable base items.
   */
  async getBaseItemOptions(type) {
    const baseIds = {
      weapon: CONFIG.DND5E.weaponIds,
      equipment: { ...CONFIG.DND5E.armorIds, ...CONFIG.DND5E.shieldIds }
    }[type];
    if ( !baseIds ) return [];

    const subtypes = this.getSubtypes(type);
    const selected = this.getBaseItems(type);
    const options = [];
    for ( const [value, id] of Object.entries(baseIds) ) {
      const baseItem = await game.dnd5e.documents.Trait.getBaseItem(id);
      if ( !baseItem || (subtypes && !subtypes.has(baseItem.system.type.value) && !selected?.has(value)) ) continue;
      options.push({ value, label: baseItem.name });
    }
    return options.sort((lhs, rhs) => lhs.label.localeCompare(rhs.label, game.i18n.lang));
  }

  /* -------------------------------------------- */

  /**
   * Roll a batch of random shop item entries from these settings. The candidate pool is built once and reused
   * across every draw; stops early if the pool runs out. An enchant item is skipped once it has been drawn in the
   * batch, as long as the remaining pool still yields items.
   * @param {object} options
   * @param {Set<string>} options.existingKeys  Entry keys already present in the shop, to skip duplicates.
   * @param {{ value: number|null, denomination: string }} [options.settlementCap]  Leave out plain items and
   *   enchant profiles whose resolved price exceeds this. Spell scrolls are capped by the price of their level's
   *   Spell Scroll template item. Ignored if a pool is given.
   * @param {{ byType: Record<string, number|null>, magicRule: string }} options.stockDefaults  The shop's
   *   default stock configuration, applied to non-magic-exempt mundane candidates.
   * @param {GeneratorPool|null} [options.pool]  The pool of these settings, if it has already been built.
   * @param {number} [options.count]  How many entries to roll. Defaults to the count of these settings.
   * @returns {Promise<{ entry: ShopItemEntryData, template?: string }[]>}
   */
  async roll({ existingKeys, settlementCap, stockDefaults, pool, count=this.count }) {
    const { candidates: candidatePool } = pool ?? await this.buildPool({ settlementCap, existingKeys });
    const keys = new Set(existingKeys);
    const options = { existingKeys: keys, stockDefaults };
    const usedTemplates = new Set();
    const rolled = [];
    for ( let i = 0; i < count; i++ ) {
      const unused = candidatePool.filter(candidate => !usedTemplates.has(candidate.item?.uuid));
      const result = await this.#drawFromPool(unused, options) ?? await this.#drawFromPool(candidatePool, options);
      if ( !result ) break;
      keys.add(ShopItemEntry.key(result.entry));
      if ( result.template ) usedTemplates.add(result.template);
      rolled.push(result);
    }
    return rolled;
  }

  /* -------------------------------------------- */

  /**
   * Build the pool of candidates to draw from, along with the number of entries it holds per rarity.
   * @see dnd5e — bulkFromUuid()
   * @param {object} [options]
   * @param {{ value: number|null, denomination: string }} [options.settlementCap]  Leave out entries priced above
   *   this.
   * @param {Set<string>} [options.existingKeys]  Entry keys already present in the shop, counted apart from the
   *   entries of the pool.
   * @returns {Promise<GeneratorPool>}
   */
  async buildPool({ settlementCap, existingKeys=new Set() }={}) {
    const { magic, rarities } = this;
    const capCP = settlementCap?.value != null ? toCopper(settlementCap.value, settlementCap.denomination) : null;
    const rules = game.dnd5e.settings.rulesVersion === "modern" ? "2024" : "2014";
    const summary = { included: {}, capped: {}, owned: {} };
    const pool = [];
    const found = [];
    const baseItemCache = new Map();
    const excluded = ["spell-scroll", ...(this.includeEnspelled ? [] : Object.keys(ENSPELLED_ITEMS))];

    for ( const type of Object.keys(this.types) ) {
      const filters = [
        { o: "NOT", v: { o: "OR", v: [
          { k: "system.rarity", o: "in", v: ["artifact"] },
          { k: "system.rarities", o: "hasany", v: ["artifact"] }
        ] } },
        excludeFilter("system.type.value", ["natural"]),
        excludeFilter("system.identifier", excluded)
      ];
      const results = await game.dnd5e.applications.CompendiumBrowser.fetch(Item, {
        types: new Set([type]), filters, indexFields: new Set([
          "system.source", "system.identifier", "system.properties", "system.price.value", "system.price.denomination",
          "system.rarity", "system.rarities", "system.type.value", "system.type.baseItem"
        ])
      });
      for ( const index of results ) {
        const { system } = index;
        if ( ![rules, null, undefined].includes(system.source?.rules) || !isShopPackSource(index.uuid) ) continue;
        const isMagic = system.properties?.includes("mgc") ?? false;
        if ( ((magic === "magic") && !isMagic) || ((magic === "mundane") && isMagic) ) continue;
        found.push(index);
      }
    }

    const candidates = Array.from(new Map(found.map(index => [itemRefKey(itemRef(index)), index])).values());
    const uuids = candidates
      .filter(index => (index.system.identifier in ENSPELLED_ITEMS)
        || (EnchantedItemBlueprint.canBeTemplate(index) && !index.system.type?.baseItem))
      .map(index => index.uuid);
    const documents = game.dnd5e.utils.bulkFromUuid
      ? await game.dnd5e.utils.bulkFromUuid(uuids)
      : new Map(await Promise.all(uuids.map(async uuid => [uuid, await fromUuid(uuid)])));

    for ( const index of candidates ) {
      const { system } = index;
      const document = documents.get(index.uuid);
      if ( document && ((system.identifier in ENSPELLED_ITEMS)
        || document.system.activities?.some(a => a.type === "enchant")) ) {
        const template = await this.#buildTemplate(document, capCP, summary, existingKeys, baseItemCache);
        if ( template ) pool.push(template);
        continue;
      }
      const isMagic = system.properties?.includes("mgc") ?? false;
      const rarity = itemRarity(index);
      if ( !system.price?.value && !(isMagic && rarity) ) continue;
      if ( rarities.size && !rarities.has(rarity) ) continue;
      const wantedSubtypes = this.getSubtypes(index.type);
      if ( wantedSubtypes && !wantedSubtypes.has(system.type?.value) ) continue;
      const wantedBaseItems = this.getBaseItems(index.type);
      if ( wantedBaseItems && !wantedBaseItems.has(system.type?.baseItem) ) continue;
      if ( capCP != null ) {
        const price = resolveItemPrice(index);
        if ( price && (toCopper(price.value, price.denomination) > capCP) ) {
          GeneratorProfile.#tally(summary.capped, rarity, 1);
          continue;
        }
      }
      const owned = existingKeys.has(ShopItemEntry.key(itemRef(index)));
      GeneratorProfile.#tally(owned ? summary.owned : summary.included, rarity, 1);
      pool.push({ kind: "item", index, weight: 1 });
    }

    if ( this.includesScrolls ) {
      const { spellFilter } = this;
      let allowedLevels = rarities.size
        ? Object.entries(SPELL_SCROLL_LEVELS).filter(([r]) => rarities.has(r)).flatMap(([, levels]) => levels)
        : Object.values(SPELL_SCROLL_LEVELS).flat();
      if ( spellFilter.levels.size ) allowedLevels = allowedLevels.filter(l => spellFilter.levels.has(l));
      const unaffordable = new Set();
      if ( capCP != null ) {
        for ( const level of allowedLevels ) {
          const scrollUuid = CONFIG.DND5E.spellScrollIds[level];
          const scroll = scrollUuid ? await fromUuid(scrollUuid) : null;
          const price = scroll ? resolveItemPrice(scroll) : null;
          if ( price && (toCopper(price.value, price.denomination) > capCP) ) unaffordable.add(level);
        }
      }
      if ( allowedLevels.length ) {
        const filters = [
          { k: "system.level", o: "in", v: allowedLevels }
        ];
        if ( spellFilter.schools.size ) filters.push({ k: "system.school", o: "in", v: spellFilter.schools });
        if ( spellFilter.ritualOnly ) filters.push({ k: "system.properties", o: "has", v: "ritual" });
        if ( spellFilter.classes.size ) {
          const identifiers = new Set();
          for ( const value of spellFilter.classes ) {
            const list = game.dnd5e.registry.spellLists.forType(value);
            if ( list ) for ( const id of list.identifiers ) identifiers.add(id);
          }
          filters.push({ k: "system.identifier", o: "in", v: Array.from(identifiers) });
        }
        for ( const index of await GeneratorProfile.#fetchSpells(filters) ) {
          const { level } = index.system;
          const rarity = Object.keys(SPELL_SCROLL_LEVELS).find(key => SPELL_SCROLL_LEVELS[key].includes(level));
          if ( unaffordable.has(level) ) {
            GeneratorProfile.#tally(summary.capped, rarity, 1);
            continue;
          }
          const owned = existingKeys.has(ShopItemEntry.key({ spellScroll: { spellUuid: index.uuid } }));
          GeneratorProfile.#tally(owned ? summary.owned : summary.included, rarity, 1);
          pool.push({ kind: "spell", index, weight: 1 });
        }
      }
    }

    return { candidates: pool, summary };
  }

  /* -------------------------------------------- */

  /**
   * Build the candidate for an enchant item from the profiles that pass the rarity and settlement cap filters.
   * @param {Item5e} item  The enchant item.
   * @param {number|null} capCP  Settlement cap in copper pieces, or `null` if unset.
   * @param {GeneratorPoolSummary} summary  The pool summary to add the entries of the profiles to.
   * @param {Set<string>} existingKeys  Entry keys already present in the shop.
   * @param {Map<string, string[]>} baseItemCache  Eligible base-item UUIDs already resolved this run, keyed by
   *   restriction.
   * @returns {Promise<GeneratorCandidate|null>}  `null` if no profile remains.
   */
  async #buildTemplate(item, capCP, summary, existingKeys, baseItemCache) {
    const { rarities, weighting } = this;
    const open = [];
    for ( const [level, profile] of EnchantedItemBlueprint.getEnchantmentProfiles(item).entries() ) {
      const rarity = EnchantedItemBlueprint.resolveProfileRarity(item, profile.effect);
      if ( (rarity === "artifact") || (rarities.size && !rarities.has(rarity)) ) continue;
      const { activity } = profile;
      const baseType = activity.restrictions.type || item.type;
      const { allowMagical, categories, properties } = activity.restrictions;
      const header = EnchantedItemBlueprint.getRestrictionHeader(item);
      const key = [baseType, allowMagical, Array.from(categories), Array.from(properties), header].join("|");
      if ( !baseItemCache.has(key) ) {
        baseItemCache.set(key, await EnchantedItemBlueprint.listEnchantableBaseItems(
          activity, this.getSubtypes(baseType), this.getBaseItems(baseType)
        ));
      }
      const baseItems = baseItemCache.get(key);
      if ( !baseItems.length ) continue;
      open.push({ ...profile, level, rarity, baseItems, weight: (weighting === "combination") ? baseItems.length : 1 });
    }

    const profiles = [];
    for ( const profile of open ) {
      const units = (weighting === "template") ? profile.weight / open.length : profile.weight;
      const price = (capCP != null) ? resolveItemPrice(item, { rarity: profile.rarity }) : null;
      if ( price && (toCopper(price.value, price.denomination) > capCP) ) {
        GeneratorProfile.#tally(summary.capped, profile.rarity, units);
        continue;
      }
      const taken = profile.baseItems.filter(uuid => GeneratorProfile.#isTaken(existingKeys, item, profile, uuid));
      const allTaken = taken.length === profile.baseItems.length;
      const owned = (weighting === "combination") ? taken.length : (allTaken ? units : 0);
      GeneratorProfile.#tally(summary.owned, profile.rarity, owned);
      GeneratorProfile.#tally(summary.included, profile.rarity, units - owned);
      profiles.push(profile);
    }
    if ( !profiles.length ) return null;
    const weight = (weighting === "template") ? 1 : profiles.reduce((total, profile) => total + profile.weight, 0);
    return { kind: "template", item, profiles, weight };
  }

  /* -------------------------------------------- */

  /**
   * Fetch the spell index entries matching the given filters that belong to the active rules version.
   * @param {FilterDescription[]} filters
   * @returns {Promise<object[]>}
   */
  static async #fetchSpells(filters) {
    const rules = game.dnd5e.settings.rulesVersion === "modern" ? "2024" : "2014";
    const results = await game.dnd5e.applications.CompendiumBrowser.fetch(Item, {
      types: new Set(["spell"]), filters, indexFields: new Set(["system.source", "system.identifier"])
    });
    const spells = results.filter(index => [rules, null, undefined].includes(index.system?.source?.rules));
    return Array.from(new Map(spells.map(index => [itemRefKey(itemRef(index)), index])).values());
  }

  /* -------------------------------------------- */

  /**
   * Is a combination of an enchant item's profile and a base item already among the given entry keys?
   * @param {Set<string>} existingKeys
   * @param {Item5e} item  The enchant item.
   * @param {GeneratorTemplateProfile} profile
   * @param {string} baseItemUuid
   * @returns {boolean}
   */
  static #isTaken(existingKeys, item, profile, baseItemUuid) {
    return existingKeys.has(ShopItemEntry.key({
      generated: { baseItemUuid, enchantItemUuid: item.uuid, effectId: profile.effect.id }
    }));
  }

  /* -------------------------------------------- */

  /**
   * Add entries to the count of a rarity.
   * @param {Record<string, number>} counts
   * @param {string} rarity
   * @param {number} units
   */
  static #tally(counts, rarity, units) {
    counts[rarity] = (counts[rarity] ?? 0) + units;
  }

  /* -------------------------------------------- */

  /**
   * Pick a random index into `entries`, more likely the higher that entry's weight.
   * @param {{ weight: number }[]} entries
   * @returns {number}
   */
  static #pickWeighted(entries) {
    let roll = Math.random() * entries.reduce((total, entry) => total + entry.weight, 0);
    const index = entries.findIndex(entry => (roll -= entry.weight) < 0);
    return index === -1 ? entries.length - 1 : index;
  }

  /* -------------------------------------------- */

  /**
   * Draw one random shop item entry from a pre-built candidate pool — a plain item reference, an enchanted
   * item blueprint, or a spell scroll blueprint.
   * @param {GeneratorCandidate[]} candidatePool
   * @param {object} options
   * @param {Set<string>} options.existingKeys
   * @param {{ byType: Record<string, number|null>, magicRule: string }} options.stockDefaults  The shop's
   *   default stock configuration, applied to non-magic-exempt mundane candidates.
   * @returns {Promise<{ entry: ShopItemEntryData, template?: string }|null>}  The UUID of the
   *   enchant item is returned as `template`.
   */
  async #drawFromPool(candidatePool, { existingKeys, stockDefaults }) {
    const pool = [...candidatePool];
    while ( pool.length ) {
      const [candidate] = pool.splice(GeneratorProfile.#pickWeighted(pool), 1);

      if ( candidate.kind === "spell" ) {
        const entry = {
          spellScroll: { spellUuid: candidate.index.uuid }, stock: { max: null, current: 1 }, restockMode: "exclude"
        };
        if ( existingKeys.has(ShopItemEntry.key(entry)) ) continue;
        return { entry };
      }

      if ( candidate.kind === "item" ) {
        const entry = itemRef(candidate.index);
        if ( existingKeys.has(ShopItemEntry.key(entry)) ) continue;
        const candidateItem = await fromUuid(candidate.index.uuid);
        return { entry: { ...entry, ...newEntryStock(candidateItem, stockDefaults) } };
      }

      const { item, profiles } = candidate;
      const open = profiles
        .map(profile => {
          const free = profile.baseItems.filter(uuid => !GeneratorProfile.#isTaken(existingKeys, item, profile, uuid));
          return { ...profile, baseItems: free };
        })
        .filter(profile => profile.baseItems.length);
      if ( !open.length ) continue;
      const chosen = open[GeneratorProfile.#pickWeighted(open)];
      const baseItem = await EnchantedItemBlueprint.pickEnchantableBaseItem(chosen.activity, chosen.baseItems);
      if ( !baseItem ) continue;
      const generated = { baseItemUuid: baseItem.uuid, enchantItemUuid: item.uuid, effectId: chosen.effect.id };
      if ( item.system.identifier in ENSPELLED_ITEMS ) {
        const filters = [{ k: "system.level", v: chosen.level }];
        const schools = ENSPELLED_ITEMS[item.system.identifier];
        if ( schools ) filters.push({ k: "system.school", o: "in", v: schools });
        const spells = await GeneratorProfile.#fetchSpells(filters);
        if ( !spells.length ) continue;
        generated.spellUuid = spells[Math.floor(Math.random() * spells.length)].uuid;
      }
      if ( existingKeys.has(ShopItemEntry.key({ generated })) ) continue;
      return {
        entry: { generated, stock: { max: null, current: 1 }, restockMode: "exclude" }, template: item.uuid
      };
    }
    return null;
  }
}
