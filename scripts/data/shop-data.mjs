import { SETTING_KEYS, SPELL_SCROLL_LEVELS } from "../config.mjs";
import { calendariaDayOfWeek, calendariaWeekdaysPassed, isCalendariaActive } from "../integrations/calendaria.mjs";
import {
  breakdownCopper, currencyRows, deductActorCurrencyChecked, excludeFilter, isDnd5eAutoRecoveryEnabled,
  isShopPackSource, itemRefKey, needsDefaultPrice, resolveEntries, resolveItemPrice, secondsPerDay, toCopper
} from "../utils.mjs";

import { EnchantedItemBlueprint } from "./enchanted-item-blueprint.mjs";
import { SettingCollectionMixin } from "./setting-collection.mjs";
import { SpellScrollBlueprint } from "./spell-scroll-blueprint.mjs";

const {
  ArrayField, BooleanField, DocumentIdField, DocumentUUIDField, EmbeddedDataField, FilePathField, HTMLField,
  NumberField, ObjectField, SchemaField, SetField, StringField
} = foundry.data.fields;

/**
 * @import { ShopPlayerDiscountData, ShopItemEntryData, ShopData, GeneratorCandidate, SpellFilter } from "../_types.mjs";
 */

/**
 * A data model that represents a single item entry within a shop.
 * Most entries use `identifier`. `uuid` is used instead for one-off items with no `system.identifier` match.
 * @extends {foundry.abstract.DataModel<ShopItemEntryData>}
 * @mixes ShopItemEntryData
 */
export class ShopItemEntry extends foundry.abstract.DataModel {

  /** @override */
  static defineSchema() {
    return {
      identifier: new StringField({ blank: true }),
      uuid: new DocumentUUIDField({ type: "Item", blank: true }),
      stock: new SchemaField({
        max: new NumberField({ initial: null, nullable: true, integer: true, min: 0 }),
        current: new NumberField({ initial: null, nullable: true, integer: true, min: 0 })
      }),
      discount: new NumberField({ initial: null, nullable: true, integer: true, min: -100, max: 1000 }),
      noRestock: new BooleanField({ initial: false }),
      price: new SchemaField({
        value: new NumberField({ initial: null, nullable: true, min: 0 }),
        denomination: new StringField({ initial: () => CONFIG.DND5E.defaultCurrency })
      }),
      bundleSize: new NumberField({ initial: null, nullable: true, integer: true, min: 1 }),
      generated: new EmbeddedDataField(EnchantedItemBlueprint, { nullable: true, initial: null }),
      spellScroll: new EmbeddedDataField(SpellScrollBlueprint, { nullable: true, initial: null })
    };
  }

  /* -------------------------------------------- */

  /**
   * Stable key identifying a shop item entry — a composite of the generation blueprint for generated
   * entries, the spell UUID for spell scroll entries, otherwise the generic identifier/uuid key.
   * @param {ShopItemEntryData} entry
   * @returns {string}
   */
  static key(entry) {
    if ( entry.generated ) {
      return [entry.generated.baseItemUuid, entry.generated.enchantItemUuid, entry.generated.effectId].join("|");
    }
    if ( entry.spellScroll ) return entry.spellScroll.spellUuid;
    return itemRefKey(entry);
  }

  /* -------------------------------------------- */

  /**
   * Resolve a batch of shop item entries (by `identifier` or `uuid`) to their referenced items.
   * Generated and spell scroll entries are synthesized fresh from their blueprint instead.
   * @param {ShopItemEntryData[]} entries
   * @returns {Promise<{ entry: ShopItemEntryData, item: object|null }[]>}
   */
  static async resolveMany(entries) {
    const plain = entries.filter(e => !e.generated && !e.spellScroll);
    const plainResolved = await resolveEntries(plain);
    const byEntry = new Map(plainResolved.map(r => [r.entry, r]));

    return Promise.all(entries.map(async entry => {
      if ( entry.generated ) return { entry, item: await new EnchantedItemBlueprint(entry.generated).resolve() };
      if ( entry.spellScroll ) return { entry, item: await new SpellScrollBlueprint(entry.spellScroll).resolve() };
      return byEntry.get(entry);
    }));
  }

  /* -------------------------------------------- */

  /**
   * Roll a batch of random shop item entries from the generator's current filter selection. The candidate
   * pool is fetched once and reused across every draw; stops early if the pool runs out.
   * @param {object} options
   * @param {Map<string, Set<string>|null>} options.typeConfigs  Selected types mapped to their own chosen
   *   subtypes (`system.type.value`), or `null` for no restriction.
   * @param {Set<string>|null} options.rarities  Wanted rarities ("" for mundane), narrows spell levels too.
   * @param {"any"|"magic"|"mundane"} options.magic
   * @param {SpellFilter|null} options.spellFilter
   * @param {number} options.count
   * @param {Set<string>} options.existingKeys  Entry keys already present in the shop, to skip duplicates.
   * @param {{ value: number|null, denomination: string }} [options.settlementCap]  Skip plain-item candidates
   *   or enchant-generated items whose resolved price exceeds this. Spell scrolls are unaffected.
   * @returns {Promise<{ entry: ShopItemEntryData, label: string }[]>}
   */
  static async rollMany({ typeConfigs, rarities, magic, spellFilter, count, existingKeys, settlementCap }) {
    const candidatePool = await ShopItemEntry.#buildCandidatePool({ typeConfigs, rarities, spellFilter });
    const capCP = settlementCap?.value != null ? toCopper(settlementCap.value, settlementCap.denomination) : null;
    const keys = new Set(existingKeys);
    const rolled = [];
    for ( let i = 0; i < count; i++ ) {
      const result = await ShopItemEntry.#drawFromPool(
        candidatePool, typeConfigs, { rarities, magic, existingKeys: keys, capCP }
      );
      if ( !result ) break;
      keys.add(ShopItemEntry.key(result.entry));
      rolled.push(result);
    }
    return rolled;
  }

  /* -------------------------------------------- */

  /**
   * Fetch the combined candidate pool for a generator submission — one item index per selected type,
   * plus a spell index when a spell-scroll filter is set. Subtype narrowing happens in
   * {@link ShopItemEntry.#drawFromPool}. Fetched once per submission and reused across every draw in a batch.
   * @param {object} options
   * @param {Map<string, Set<string>|null>} options.typeConfigs
   * @param {Set<string>|null} options.rarities
   * @param {SpellFilter|null} options.spellFilter
   * @returns {Promise<GeneratorCandidate[]>}
   */
  static async #buildCandidatePool({ typeConfigs, rarities, spellFilter }) {
    const rules = game.dnd5e.settings.rulesVersion === "modern" ? "2024" : "2014";
    const pool = [];

    for ( const type of typeConfigs.keys() ) {
      const filters = [
        { k: "system.source.rules", o: "in", v: [rules, null, undefined] },
        excludeFilter("system.type.value", ["natural"]),
        excludeFilter("system.rarity", ["artifact"]),
        excludeFilter("system.identifier", ["spell-scroll", "enspelled-staff", "enspelled-weapon", "enspelled-armor"])
      ];
      const results = await game.dnd5e.applications.CompendiumBrowser.fetch(Item, {
        types: new Set([type]), filters
      });
      const fromShopPack = results.filter(index => isShopPackSource(index.uuid));
      pool.push(...fromShopPack.map(index => ({ kind: "item", index })));
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
   * Draw one random shop item entry from a pre-built candidate pool — a plain item reference, an enchanted
   * item blueprint, or a spell scroll blueprint.
   * @param {GeneratorCandidate[]} candidatePool
   * @param {Map<string, Set<string>|null>} typeConfigs  Subtype restriction per type, applied both to
   *   plain items directly and, for enchant results, via {@link EnchantedItemBlueprint.findEnchantableBaseItem}.
   * @param {object} options
   * @param {Set<string>|null} options.rarities
   * @param {"any"|"magic"|"mundane"} options.magic
   * @param {Set<string>} options.existingKeys
   * @param {number|null} options.capCP  Settlement cap in copper pieces, or `null` if unset.
   * @returns {Promise<{ entry: ShopItemEntryData, label: string }|null>}
   */
  static async #drawFromPool(candidatePool, typeConfigs, { rarities, magic, existingKeys, capCP }) {
    const pool = [...candidatePool];
    while ( pool.length ) {
      const [candidate] = pool.splice(Math.floor(Math.random() * pool.length), 1);

      if ( candidate.kind === "spell" ) {
        const entry = { spellScroll: { spellUuid: candidate.index.uuid }, stock: { max: null, current: null } };
        if ( existingKeys.has(ShopItemEntry.key(entry)) ) continue;
        return { entry, label: candidate.index.name };
      }

      const candidateItem = await fromUuid(candidate.index.uuid);
      const isMagic = candidateItem.system.properties?.has("mgc") ?? false;
      if ( (magic === "magic") && !isMagic ) continue;
      if ( (magic === "mundane") && isMagic ) continue;
      const hasEnchant = candidateItem.system.activities?.some(a => a.type === "enchant");
      if ( !hasEnchant && !candidateItem.system.price?.value && !(isMagic && candidateItem.system.rarity) ) continue;

      if ( !hasEnchant || candidateItem.system.type?.baseItem ) {
        if ( rarities && !rarities.has(candidateItem.system.rarity || "") ) continue;
        const wantedSubtypes = typeConfigs.get(candidateItem.type);
        if ( wantedSubtypes && !wantedSubtypes.has(candidateItem.system.type?.value) ) continue;
        if ( capCP != null ) {
          const price = resolveItemPrice(candidateItem);
          if ( price && (toCopper(price.value, price.denomination) > capCP) ) continue;
        }
        const entry = candidateItem.system.identifier
          ? { identifier: candidateItem.system.identifier } : { uuid: candidateItem.uuid };
        if ( existingKeys.has(ShopItemEntry.key(entry)) ) continue;
        return { entry: { ...entry, stock: { max: null, current: null } }, label: candidateItem.name };
      }

      const matching = EnchantedItemBlueprint.getEnchantmentProfiles(candidateItem).filter(profile => {
        const rarity = EnchantedItemBlueprint.resolveProfileRarity(candidateItem, profile.effect);
        return (rarity !== "artifact") && (!rarities || rarities.has(rarity));
      });
      if ( !matching.length ) continue;
      const chosen = matching[Math.floor(Math.random() * matching.length)];
      const baseType = chosen.activity.restrictions.type || chosen.activity.item.type;
      const baseItem = await EnchantedItemBlueprint.findEnchantableBaseItem(
        chosen.activity, typeConfigs.get(baseType) ?? null
      );
      if ( !baseItem ) continue;
      if ( capCP != null ) {
        const price = resolveItemPrice(candidateItem, {
          rarity: EnchantedItemBlueprint.resolveProfileRarity(candidateItem, chosen.effect),
          isAmmo: baseItem.system.type?.value === "ammo", isConsumable: baseItem.type === "consumable"
        });
        if ( price && (toCopper(price.value, price.denomination) > capCP) ) continue;
      }

      const generated = {
        baseItemUuid: baseItem.uuid, enchantItemUuid: candidateItem.uuid, effectId: chosen.effect.id
      };
      if ( existingKeys.has(ShopItemEntry.key({ generated })) ) continue;
      return {
        entry: { generated, stock: { max: null, current: null } },
        label: `${baseItem.name} (${candidateItem.name})`
      };
    }
    return null;
  }
}

/**
 * A data model that represents a per-actor discount override for a shop.
 * @extends {foundry.abstract.DataModel<ShopPlayerDiscountData>}
 * @mixes ShopPlayerDiscountData
 */
export class ShopPlayerDiscount extends foundry.abstract.DataModel {

  /** @override */
  static defineSchema() {
    return {
      actor: new DocumentUUIDField({ type: "Actor" }),
      buyModifier: new NumberField({ initial: null, nullable: true, integer: true, min: -100, max: 1000 }),
      sellModifier: new NumberField({ initial: null, nullable: true, integer: true, min: -100, max: 1000 }),
      hagglingLocked: new BooleanField({ initial: false }),
      hagglingTimestamp: new NumberField({ initial: null, nullable: true, integer: true })
    };
  }
}

/* -------------------------------------------- */

/**
 * A data model that represents a shop.
 * @extends {foundry.abstract.DataModel<ShopData>}
 * @mixes ShopData
 */
export class Shop extends SettingCollectionMixin(foundry.abstract.DataModel, SETTING_KEYS.SHOPS) {

  /**
   * Default icon used for shops without a custom image.
   * @type {string}
   */
  static DEFAULT_ICON = "icons/svg/chest.svg";

  /* -------------------------------------------- */

  /** @override */
  static LOCALIZATION_PREFIXES = ["SIMPLE_SHOP_CRAFT_5E.SHOP"];

  /* -------------------------------------------- */

  /** @override */
  static defineSchema() {
    return {
      _id: new DocumentIdField({ initial: () => foundry.utils.randomID() }),
      name: new StringField({ required: true, blank: false }),
      img: new FilePathField({ categories: ["IMAGE"], initial: () => Shop.DEFAULT_ICON }),
      active: new BooleanField({ initial: false }),
      buyModifier: new NumberField({ required: true, initial: 0, integer: true, min: -100, max: 1000 }),
      sellModifier: new NumberField({ required: true, initial: -50, integer: true, min: -100, max: 1000 }),
      fixedValueLootTypes: new SetField(new StringField(), { initial: ["gem", "art"] }),
      playerDiscounts: new ArrayField(new EmbeddedDataField(ShopPlayerDiscount)),
      npc: new DocumentUUIDField({ type: "Actor", blank: true }),
      location: new StringField({ blank: true }),
      openHour: new NumberField({ initial: null, nullable: true, integer: true, min: 0, max: 23 }),
      openMinute: new NumberField({ required: true, initial: 0, integer: true, min: 0, max: 59 }),
      closeHour: new NumberField({ initial: null, nullable: true, integer: true, min: 0, max: 23 }),
      closeMinute: new NumberField({ required: true, initial: 0, integer: true, min: 0, max: 59 }),
      settlementCap: new SchemaField({
        value: new NumberField({ initial: null, nullable: true, min: 0 }),
        denomination: new StringField({ initial: () => CONFIG.DND5E.defaultCurrency }),
        appliesToSell: new BooleanField({ initial: true })
      }),
      goldPool: new SchemaField({
        max: new ObjectField({ initial: {} }),
        current: new ObjectField({ initial: {} }),
        unlimited: new BooleanField({ initial: false })
      }),
      restockWeekdays: new SetField(new NumberField({ integer: true, min: 0 })),
      closedWeekdays: new SetField(new NumberField({ integer: true, min: 0 })),
      closedFestivals: new SetField(new StringField()),
      statusOverride: new StringField({ initial: "", blank: true, choices: ["", "open", "closed"] }),
      description: new HTMLField(),
      items: new ArrayField(new EmbeddedDataField(ShopItemEntry))
    };
  }

  /* -------------------------------------------- */

  /**
   * Resolve this shop's effective gold pool for buy-back transactions, summed to copper.
   * @returns {number|null}  Copper amount available, or `null` if unlimited (no cap enforced).
   */
  effectiveGoldPool() {
    if ( this.goldPool.unlimited ) return null;
    return Object.entries(this.goldPool.current ?? {}).reduce((sum, [denom, value]) => {
      return value ? sum + toCopper(value, denom) : sum;
    }, 0);
  }

  /* -------------------------------------------- */

  /**
   * Whether an actor is currently locked out from Haggling for this shop after a failed Influence check.
   * @param {string} [actorUuid]
   * @returns {boolean}
   */
  isHagglingLocked(actorUuid) {
    return !!(actorUuid && this.playerDiscounts.find(pd => pd.actor === actorUuid)?.hagglingLocked);
  }

  /* -------------------------------------------- */

  /**
   * Whether this shop is currently open. `statusOverride`, if set, decides this outright; otherwise the
   * shop is closed when outside its daily hours, on a closed weekday, or on a closed festival day — open
   * by default when none of these are set.
   * @param {number} [worldTime]
   * @returns {boolean}
   */
  isOpen(worldTime=game.time.worldTime) {
    if ( this.statusOverride ) return this.statusOverride === "open";

    const components = game.time.calendar.timeToComponents(worldTime);
    const dayOfWeek = isCalendariaActive() ? calendariaDayOfWeek(worldTime) : components.dayOfWeek;
    if ( this.closedWeekdays.has(dayOfWeek) ) return false;

    const calendar = game.time.calendar;
    const festivalDay = (typeof calendar.findFestivalDay === "function") ? calendar.findFestivalDay(worldTime) : null;
    if ( festivalDay && this.closedFestivals.has(festivalDay.name) ) return false;

    if ( (this.openHour == null) || (this.closeHour == null) ) return true;
    const minutesNow = (components.hour * 60) + components.minute;
    const openMinutes = (this.openHour * 60) + this.openMinute;
    const closeMinutes = (this.closeHour * 60) + this.closeMinute;
    return (openMinutes > closeMinutes)
      ? (minutesNow >= openMinutes) || (minutesNow <= closeMinutes)
      : (minutesNow >= openMinutes) && (minutesNow <= closeMinutes);
  }

  /* -------------------------------------------- */

  /**
   * Format this shop's opening hours as a display string.
   * @returns {string}
   */
  openingHoursDisplay() {
    if ( (this.openHour == null) || (this.closeHour == null) ) {
      return _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.OpeningHoursAlways");
    }
    return `${this.openHour.toString().padStart(2, "0")}:${this.openMinute.toString().padStart(2, "0")}`
      + `–${this.closeHour.toString().padStart(2, "0")}:${this.closeMinute.toString().padStart(2, "0")}`;
  }

  /* -------------------------------------------- */

  /**
   * Build currency-input row data for this shop's current gold pool.
   * @param {object} [options]
   * @param {string} [options.namePrefix]
   * @returns {{ denomination: string, value: number|null, name: string, label: string, icon: string }[]|null}
   */
  resolveGoldPoolRows({ namePrefix="" }={}) {
    if ( this.goldPool.unlimited ) return null;
    return currencyRows(this.goldPool.current, namePrefix);
  }

  /* -------------------------------------------- */

  /**
   * Resolve the acting actor's discount override for this shop, if one is configured.
   * @param {string} [actorUuid]
   * @returns {{ buy: number|null, sell: number|null }}
   */
  resolvePlayerOverride(actorUuid) {
    const override = actorUuid ? this.playerDiscounts.find(pd => pd.actor === actorUuid) : null;
    return { buy: override?.buyModifier ?? null, sell: override?.sellModifier ?? null };
  }

  /* -------------------------------------------- */

  /**
   * Resolve this shop's restock updates: full stock (except `noRestock` items) and gold pool.
   * @returns {{ items: object[], goldPool: object }}
   */
  restockUpdates() {
    const items = this.items.map(entry => {
      const obj = entry.toObject();
      if ( !obj.noRestock ) obj.stock = { ...obj.stock, current: obj.stock.max };
      return obj;
    });
    const goldPool = { ...this.goldPool };
    if ( !goldPool.unlimited ) goldPool.current = { ...goldPool.max };
    return { items, goldPool };
  }

  /* -------------------------------------------- */

  /**
   * Validate and apply an accepted purchase: deduct/credit currency, transfer items both ways, adjust
   * stock. All changes are persisted to the actor and the shop's own data.
   * @param {object} purchase  Purchase flag data.
   * @returns {Promise<{ ok: true }|{ ok: false, error: string }>}
   */
  static async applyPurchase(purchase) {
    const actor = fromUuidSync(purchase.actorUuid);
    if ( !actor ) return { ok: false, error: "SIMPLE_SHOP_CRAFT_5E.PurchaseCard.MissingActor" };

    const shops = Shop.getAll();
    const shop = shops.find(s => s._id === purchase.shopId);
    if ( !shop ) return { ok: false, error: "SIMPLE_SHOP_CRAFT_5E.PurchaseCard.MissingShop" };

    for ( const line of purchase.buyLines ) {
      const entry = shop.items.find(i => ShopItemEntry.key(i) === ShopItemEntry.key(line));
      if ( (entry?.stock.current !== null) && (entry?.stock.current < line.quantity) ) {
        return { ok: false, error: "SIMPLE_SHOP_CRAFT_5E.PurchaseCard.InsufficientStock" };
      }
    }

    for ( const line of purchase.sellLines ) {
      const owned = actor.items.get(line.itemId);
      if ( !owned || (owned.system.quantity < line.quantity) ) {
        return { ok: false, error: "SIMPLE_SHOP_CRAFT_5E.PurchaseCard.InsufficientSellQuantity" };
      }
    }

    const effectiveGoldCurrent = shop.effectiveGoldPool();
    if ( (effectiveGoldCurrent !== null) && (purchase.netCP > 0) && (effectiveGoldCurrent < purchase.netCP) ) {
      return { ok: false, error: "SIMPLE_SHOP_CRAFT_5E.PurchaseCard.InsufficientShopGold" };
    }

    const resolved = await ShopItemEntry.resolveMany(
      purchase.buyLines.map(line => ({
        identifier: line.identifier, uuid: line.uuid, generated: line.generated, spellScroll: line.spellScroll
      }))
    );
    const itemsToCreate = [];
    const itemUpdates = [];
    for ( const [index, line] of purchase.buyLines.entries() ) {
      const indexEntry = resolved[index].item;
      const totalQuantity = line.quantity * line.bundleSize;

      const existing = line.identifier
        ? actor.items.find(i => i.system.identifier === line.identifier)
        : (line.generated && indexEntry?.system.identifier
          ? actor.items.find(i => i.system.identifier === indexEntry.system.identifier)
          : null);
      if ( existing && (existing.type !== "container") ) {
        itemUpdates.push({ _id: existing.id, "system.quantity": existing.system.quantity + totalQuantity });
        continue;
      }

      const fullItem = (line.generated || line.spellScroll)
        ? indexEntry
        : (indexEntry?.uuid ? await fromUuid(indexEntry.uuid) : null);
      if ( !fullItem ) return { ok: false, error: "SIMPLE_SHOP_CRAFT_5E.PurchaseCard.MissingItem" };
      const itemData = fullItem.toObject();
      delete itemData._id;
      if ( needsDefaultPrice(fullItem) ) {
        const defaultPrice = resolveItemPrice(fullItem);
        if ( defaultPrice ) itemData.system.price = defaultPrice;
      }
      if ( fullItem.type === "container" ) {
        for ( let i = 0; i < totalQuantity; i++ ) itemsToCreate.push(foundry.utils.deepClone(itemData));
      } else {
        itemData.system.quantity = totalQuantity;
        itemsToCreate.push(itemData);
      }
    }

    const itemsToDelete = [];
    for ( const line of purchase.sellLines ) {
      const owned = actor.items.get(line.itemId);
      const remaining = owned.system.quantity - line.quantity;
      if ( remaining > 0 ) itemUpdates.push({ _id: line.itemId, "system.quantity": remaining });
      else itemsToDelete.push(line.itemId);
    }

    if ( purchase.netCP < 0 ) {
      const result = await deductActorCurrencyChecked(actor, -purchase.netCP);
      if ( !result.ok ) return result;
    } else if ( purchase.netCP > 0 ) {
      const amounts = breakdownCopper(purchase.netCP)
        .reduce((obj, part) => Object.assign(obj, { [part.denomination]: part.value }), {});
      await game.dnd5e.applications.Award.awardCurrency(amounts, [actor]);
    }

    if ( itemsToCreate.length ) await actor.createEmbeddedDocuments("Item", itemsToCreate);
    if ( itemUpdates.length ) await actor.updateEmbeddedDocuments("Item", itemUpdates);
    if ( itemsToDelete.length ) await actor.deleteEmbeddedDocuments("Item", itemsToDelete);

    const items = shop.items.map(entry => {
      const line = purchase.buyLines.find(l => ShopItemEntry.key(l) === ShopItemEntry.key(entry));
      if ( !line || (entry.stock.current === null) ) return entry.toObject();
      return { ...entry.toObject(), stock: { ...entry.stock, current: entry.stock.current - line.quantity } };
    });
    for ( const line of purchase.sellLines ) {
      if ( !line.identifier ) continue;
      const existing = items.find(i => i.identifier === line.identifier);
      if ( existing && (existing.stock.current !== null) ) existing.stock.current += line.quantity;
    }

    const goldPool = { ...shop.goldPool };
    if ( effectiveGoldCurrent !== null ) {
      const parts = breakdownCopper(effectiveGoldCurrent - purchase.netCP);
      goldPool.current = Object.fromEntries(parts.map(p => [p.denomination, p.value]));
    }

    await Shop.setAll(shops.map(s => s._id === shop._id ? { ...s.toObject(), items, goldPool } : s.toObject()));

    return { ok: true };
  }

  /* -------------------------------------------- */

  /**
   * Restock due shops and clear expired haggling locks.
   * @param {number} worldTime
   * @param {number[]|null} weekdaysPassed  Weekday indices crossed since the last check, or `null` for a
   *   full week or more.
   * @returns {Promise<void>}
   */
  static async handleDayChange(worldTime, weekdaysPassed) {
    if ( !game.user.isActiveGM ) return;

    const perDay = secondsPerDay();
    for ( const shop of Shop.getAll() ) {
      const updateData = {};

      const restockDue = weekdaysPassed === null
        ? (shop.restockWeekdays.size > 0)
        : weekdaysPassed.some(d => shop.restockWeekdays.has(d));
      if ( restockDue ) Object.assign(updateData, shop.restockUpdates());

      let hagglingChanged = false;
      const playerDiscounts = shop.playerDiscounts.map(pd => {
        if ( !pd.hagglingLocked || (Math.floor((worldTime - pd.hagglingTimestamp) / perDay) < 1) ) return pd.toObject();
        hagglingChanged = true;
        return { ...pd.toObject(), hagglingLocked: false, hagglingTimestamp: null };
      });
      if ( hagglingChanged ) updateData.playerDiscounts = playerDiscounts;

      if ( Object.keys(updateData).length ) await Shop.update(shop._id, updateData);
    }
  }

  /* -------------------------------------------- */

  /**
   * Handle Calendaria's day-change hook — fires once per `updateWorldTime` call, even for multi-day jumps.
   * @param {{ previous: object, current: object }} data
   * @returns {Promise<void>}
   */
  static async onCalendariaDayChange(data) {
    const weekdaysPassed = calendariaWeekdaysPassed(data);
    if ( weekdaysPassed === undefined ) return;
    await Shop.handleDayChange(game.time.worldTime, weekdaysPassed);
  }

  /* -------------------------------------------- */

  /**
   * Handle dnd5e's `updateWorldTime` hook, filtered to actual day changes.
   * @param {number} worldTime
   * @param {number} dt
   * @param {object} options
   * @returns {Promise<void>}
   */
  static async onUpdateWorldTime(worldTime, dt, options) {
    if ( dt <= 0 ) return;
    const midnights = options.dnd5e?.deltas?.midnights;
    if ( !(midnights > 0) ) return;
    if ( !isDnd5eAutoRecoveryEnabled() ) return;
    const weekLength = game.time.calendar.days.values.length;
    const dayOfWeek = game.time.calendar.timeToComponents(worldTime).dayOfWeek;
    const weekdaysPassed = (midnights >= weekLength)
      ? null
      : Array.from({ length: midnights }, (_, i) => (dayOfWeek - i + weekLength) % weekLength);
    await Shop.handleDayChange(worldTime, weekdaysPassed);
  }
}

/* -------------------------------------------- */

/**
 * Register this module's localization for the Shop data model.
 */
export function registerShopLocalization() {
  foundry.helpers.Localization.localizeDataModel(Shop);
}
