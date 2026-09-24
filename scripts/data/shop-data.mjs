import {
  DEFAULT_STOCK_BY_TYPE, MAGIC_EXEMPT_TYPES, RESTOCK_MODES, SETTING_KEYS, STOCK_MAGIC_RULES
} from "../config.mjs";
import { calendariaDayOfWeek, isCalendariaActive } from "../integrations/calendaria.mjs";
import {
  breakdownCopper, currencyRows, deductActorCurrencyChecked, isCalendarModeActive, isDefaultIdentifier,
  secondsPerDay, itemRefKey, needsDefaultPrice, resolveEntries, resolveItemPrice, shouldHandleWorldTimeAdvance,
  toCopper
} from "../utils.mjs";
import { EnchantedItemBlueprint } from "./enchanted-item-blueprint.mjs";
import { HirelingBlueprint } from "./hireling-blueprint.mjs";
import { LodgingBlueprint } from "./lodging-blueprint.mjs";
import SettingCollectionMixin from "./setting-collection-mixin.mjs";
import { SpellScrollBlueprint } from "./spell-scroll-blueprint.mjs";

const {
  ArrayField, BooleanField, DocumentIdField, DocumentUUIDField, EmbeddedDataField, FilePathField, HTMLField,
  NumberField, ObjectField, SchemaField, SetField, StringField, TypedObjectField
} = foundry.data.fields;

/**
 * @import { ShopPlayerDiscountData, ShopItemEntryData, ShopData } from "../_types.mjs";
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
      _id: new DocumentIdField({ initial: () => foundry.utils.randomID() }),
      uuid: new DocumentUUIDField({ type: "Item", blank: true }),
      stock: new SchemaField({
        max: new NumberField({ initial: null, nullable: true, integer: true, min: 0 }),
        current: new NumberField({ initial: null, nullable: true, integer: true, min: 0 })
      }),
      discount: new NumberField({ initial: null, nullable: true, integer: true, min: -100, max: 1000 }),
      restockMode: new StringField({ initial: "normal", choices: Object.keys(RESTOCK_MODES), required: true }),
      price: new SchemaField({
        value: new NumberField({ initial: null, nullable: true, min: 0 }),
        denomination: new StringField({ initial: () => CONFIG.DND5E.defaultCurrency })
      }),
      bundleSize: new NumberField({ initial: null, nullable: true, integer: true, min: 1 }),
      generated: new EmbeddedDataField(EnchantedItemBlueprint, { nullable: true, initial: null }),
      spellScroll: new EmbeddedDataField(SpellScrollBlueprint, { nullable: true, initial: null }),
      isService: new BooleanField({ initial: false }),
      lodging: new EmbeddedDataField(LodgingBlueprint, { nullable: true, initial: null }),
      hireling: new EmbeddedDataField(HirelingBlueprint, { nullable: true, initial: null })
    };
  }

  /* -------------------------------------------- */
  /*  Data Migration                              */
  /* -------------------------------------------- */

  /** @inheritDoc */
  static _migrateData(source) {
    super._migrateData(source);
    ShopItemEntry.#migrateRestockMode(source);
    return source;
  }

  /* -------------------------------------------- */

  /**
   * Migrate the `noRestock` boolean to the three-way `restockMode`.
   * @param {object} source  The candidate source data from which the model will be constructed.
   */
  static #migrateRestockMode(source) {
    if ( !("noRestock" in source) ) return;
    source.restockMode = source.noRestock ? "exclude" : "normal";
    delete source.noRestock;
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
      const { baseItemUuid, enchantItemUuid, effectId, spellUuid } = entry.generated;
      return [baseItemUuid, enchantItemUuid, effectId, ...(spellUuid ? [spellUuid] : [])].join("|");
    }
    if ( entry.spellScroll ) return entry.spellScroll.spellUuid;
    return itemRefKey(entry) || entry._id;
  }

  /* -------------------------------------------- */

  /**
   * Resolve a batch of shop item entries (by `identifier` or `uuid`) to their referenced items.
   * Generated and spell scroll entries are synthesized fresh from their blueprint instead.
   * @param {ShopItemEntryData[]} entries
   * @returns {Promise<{ entry: ShopItemEntryData, item: object|null }[]>}
   */
  static async resolveMany(entries) {
    const plain = entries.filter(e => !e.generated && !e.spellScroll && !e.lodging && !e.hireling);
    const plainResolved = await resolveEntries(plain);
    const byEntry = new Map(plainResolved.map(r => [r.entry, r]));

    return Promise.all(entries.map(async entry => {
      if ( entry.generated ) return { entry, item: await new EnchantedItemBlueprint(entry.generated).resolve() };
      if ( entry.spellScroll ) return { entry, item: await new SpellScrollBlueprint(entry.spellScroll).resolve() };
      if ( entry.lodging ) return { entry, item: new LodgingBlueprint(entry.lodging).resolve() };
      if ( entry.hireling ) return { entry, item: await new HirelingBlueprint(entry.hireling).resolve() };
      return byEntry.get(entry);
    }));
  }
}

/* -------------------------------------------- */

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
      hagglingLocks: new TypedObjectField(new NumberField({ integer: true }), { initial: () => ({}) })
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
        unlimited: new BooleanField({ initial: false }),
        sellDisabled: new BooleanField({ initial: false })
      }),
      stockDefaults: new SchemaField({
        byType: new TypedObjectField(new NumberField({ nullable: true, integer: true, min: 0 }), {
          initial: () => ({ ...DEFAULT_STOCK_BY_TYPE })
        }),
        magicRule: new StringField({ initial: "gear", choices: Object.keys(STOCK_MAGIC_RULES), required: true })
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
   * Merge an update into one actor's playerDiscounts entry, creating one with no discount overrides yet
   * if it doesn't already exist.
   * @param {string} actorUuid
   * @param {object} updateData
   * @returns {function(Shop): object}  Update function for {@link Shop.update}.
   */
  static mergePlayerDiscount(actorUuid, updateData) {
    return shop => {
      const existing = shop.playerDiscounts.map(pd => pd.toObject());
      const index = existing.findIndex(pd => pd.actor === actorUuid);
      const playerDiscounts = index >= 0
        ? existing.map((pd, i) => i === index ? { ...pd, ...updateData } : pd)
        : [...existing, { actor: actorUuid, buyModifier: null, sellModifier: null, ...updateData }];
      return { playerDiscounts };
    };
  }

  /* -------------------------------------------- */

  /**
   * Create a copy of a shop, named "Copy of X".
   * @param {Shop} shop
   * @returns {Promise<ShopData>}
   */
  static async duplicate(shop) {
    const clone = shop.toObject();
    delete clone._id;
    clone.name = _loc("DOCUMENT.CopyOf", { name: shop.name });
    return Shop.create(clone);
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
   * Resolve a shop's default max stock for an item with no per-item override, from its per-type defaults
   * and magic-item rule.
   * @param {Item5e|object} item
   * @param {{ byType: Record<string, number|null>, magicRule: string }} stockDefaults
   * @returns {number|null}  Default max stock, or `null` for unlimited.
   */
  static defaultStockMax(item, stockDefaults) {
    const props = item.system.properties;
    const isMagic = props?.has?.("mgc") ?? props?.includes?.("mgc") ?? false;
    const { magicRule, byType } = stockDefaults;
    const exempt = isMagic
      && ((magicRule === "all") || ((magicRule === "gear") && MAGIC_EXEMPT_TYPES.has(item.type)));
    return exempt ? null : (byType[item.type] ?? null);
  }

  /* -------------------------------------------- */

  /**
   * Whether an actor is currently locked out from Haggling with a specific Charisma skill for this shop,
   * after failing an Influence check "in the same way" within the last 24 hours.
   * @param {string} [actorUuid]
   * @param {string} skill
   * @returns {boolean}
   */
  isHagglingLocked(actorUuid, skill) {
    return !!(actorUuid && this.playerDiscounts.find(pd => pd.actor === actorUuid)?.hagglingLocks?.[skill]);
  }

  /* -------------------------------------------- */

  /**
   * Whether an actor has any currently active Haggling lock for this shop, regardless of skill.
   * @param {string} [actorUuid]
   * @returns {boolean}
   */
  hasHagglingLocks(actorUuid) {
    const locks = actorUuid && this.playerDiscounts.find(pd => pd.actor === actorUuid)?.hagglingLocks;
    return !!locks && (Object.keys(locks).length > 0);
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
   * Resolve this shop's restock updates: full stock for normal-mode items (falling back to the shop's
   * per-type default when uncapped) and gold pool.
   * @returns {Promise<{ items: object[], goldPool: object }>}
   */
  async restockUpdates() {
    const needsDefaults = this.items.some(e => (e.restockMode === "normal") && (e.stock.max === null));
    const resolved = needsDefaults ? await ShopItemEntry.resolveMany(this.items) : [];
    const items = this.items.map((entry, index) => {
      const obj = entry.toObject();
      if ( obj.restockMode === "normal" ) {
        const item = resolved[index]?.item;
        const defaultMax = item ? Shop.defaultStockMax(item, this.stockDefaults) : null;
        obj.stock = { ...obj.stock, current: obj.stock.max ?? defaultMax };
      }
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

    if ( shop.goldPool.sellDisabled && purchase.sellLines.length ) {
      return { ok: false, error: "SIMPLE_SHOP_CRAFT_5E.PurchaseCard.SellDisabled" };
    }

    for ( const line of purchase.buyLines ) {
      const entry = shop.items.find(i => ShopItemEntry.key(i) === ShopItemEntry.key(line));
      const current = (entry && (entry.restockMode !== "unlimited")) ? (entry.stock.current ?? 0) : null;
      if ( (current !== null) && (current < line.quantity) ) {
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
      if ( line.isService ) continue;
      const indexEntry = resolved[index].item;
      const totalQuantity = line.quantity * line.bundleSize;

      const stackIdentifier = line.identifier
        || ((indexEntry && !isDefaultIdentifier(indexEntry)) ? indexEntry.system.identifier : null);
      const existing = stackIdentifier ? actor.items.find(i => i.system.identifier === stackIdentifier) : null;
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

    await Shop.update(shop._id, freshShop => {
      const items = freshShop.items.map(entry => {
        const line = purchase.buyLines.find(l => ShopItemEntry.key(l) === ShopItemEntry.key(entry));
        if ( !line || (entry.restockMode === "unlimited") ) return entry.toObject();
        return { ...entry.toObject(), stock: { ...entry.stock, current: (entry.stock.current ?? 0) - line.quantity } };
      });
      for ( const line of purchase.sellLines ) {
        if ( !line.identifier ) continue;
        const existing = items.find(i => i.identifier === line.identifier);
        if ( existing && (existing.stock.current !== null) ) existing.stock.current += line.quantity;
      }

      const goldPool = { ...freshShop.goldPool };
      if ( effectiveGoldCurrent !== null ) {
        const parts = breakdownCopper(effectiveGoldCurrent - purchase.netCP);
        goldPool.current = Object.fromEntries(parts.map(p => [p.denomination, p.value]));
      }

      return { items, goldPool };
    });

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
      if ( restockDue ) Object.assign(updateData, await shop.restockUpdates());

      let hagglingChanged = false;
      const playerDiscounts = shop.playerDiscounts.map(pd => {
        const locks = pd.hagglingLocks ?? {};
        const remaining = Object.fromEntries(
          Object.entries(locks).filter(([, timestamp]) => Math.floor((worldTime - timestamp) / perDay) < 1)
        );
        if ( Object.keys(remaining).length === Object.keys(locks).length ) return pd.toObject();
        hagglingChanged = true;
        return { ...pd.toObject(), hagglingLocks: remaining };
      });
      if ( hagglingChanged ) updateData.playerDiscounts = playerDiscounts;

      if ( Object.keys(updateData).length ) await Shop.update(shop._id, updateData);
    }
  }

  /* -------------------------------------------- */

  /**
   * Handle Foundry's `updateWorldTime` hook, restocking due shops and clearing expired haggling locks.
   * @param {number} worldTime
   * @param {number} dt
   * @returns {Promise<void>}
   */
  static async onUpdateWorldTime(worldTime, dt) {
    if ( !shouldHandleWorldTimeAdvance(dt) ) return;
    if ( !isCalendarModeActive() ) return;
    const perDay = secondsPerDay();
    const midnights = Math.floor(worldTime / perDay) - Math.floor((worldTime - dt) / perDay);
    if ( midnights <= 0 ) return;
    const weekLength = game.time.calendar.days.values.length;
    const dayOfWeek = isCalendariaActive()
      ? calendariaDayOfWeek(worldTime) : game.time.calendar.timeToComponents(worldTime).dayOfWeek;
    const weekdaysPassed = (midnights >= weekLength)
      ? null
      : Array.from({ length: midnights }, (_, i) => (dayOfWeek - i + weekLength) % weekLength);
    await Shop.handleDayChange(worldTime, weekdaysPassed);
  }
}

/* -------------------------------------------- */

/**
 * Build the stock/restock fields for a newly added shop item entry: excluded from restock at a single
 * unit when magic-exempt, unlimited when its type has no configured default, otherwise its type's default
 * max stock as a starting count (with `max` itself left unset, following the shop's default going forward).
 * @param {Item5e|object|null} item
 * @param {{ byType: Record<string, number|null>, magicRule: string }} stockDefaults
 * @returns {{ stock?: { max: null, current: number }, restockMode?: "exclude"|"unlimited" }}
 */
export function newEntryStock(item, stockDefaults) {
  if ( !item ) return {};
  const isMagic = item.system.properties?.has("mgc") ?? false;
  if ( isMagic ) {
    const { magicRule } = stockDefaults;
    const exempt = (magicRule === "all") || ((magicRule === "gear") && MAGIC_EXEMPT_TYPES.has(item.type));
    if ( exempt ) return { stock: { max: null, current: 1 }, restockMode: "exclude" };
  }
  const max = Shop.defaultStockMax(item, stockDefaults);
  if ( max === null ) return { restockMode: "unlimited" };
  return { stock: { max: null, current: max } };
}
