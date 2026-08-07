const {
  ArrayField, BooleanField, DocumentIdField, DocumentUUIDField, EmbeddedDataField, FilePathField, HTMLField,
  NumberField, ObjectField, SchemaField, SetField, StringField
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
      bundleSize: new NumberField({ initial: null, nullable: true, integer: true, min: 1 })
    };
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
export class Shop extends foundry.abstract.DataModel {

  /**
   * Default icon used for shops without a custom image.
   * @type {string}
   */
  static DEFAULT_ICON = "icons/svg/chest.svg";

  /**
   * Localization prefixes used to auto-localize this schema's field labels/hints.
   * @type {string[]}
   */
  static LOCALIZATION_PREFIXES = ["SIMPLE_SHOP_CRAFT_5E.SHOP"];

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
      settlementCap: new SchemaField({
        value: new NumberField({ initial: null, nullable: true, min: 0 }),
        denomination: new StringField({ initial: () => CONFIG.DND5E.defaultCurrency })
      }),
      goldPool: new SchemaField({
        max: new ObjectField({ initial: {} }),
        current: new ObjectField({ initial: {} }),
        unlimited: new BooleanField({ initial: false })
      }),
      lastRestock: new NumberField({ initial: null, nullable: true, integer: true }),
      description: new HTMLField(),
      items: new ArrayField(new EmbeddedDataField(ShopItemEntry))
    };
  }
}

/* -------------------------------------------- */

/**
 * Register this module's localization for the Shop data model.
 * @returns {void}
 */
export function registerLocalization() {
  foundry.helpers.Localization.localizeDataModel(Shop);
}
