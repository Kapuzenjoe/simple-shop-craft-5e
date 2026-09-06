import { ShopItemEntry } from "../../../data/shop-data.mjs";
import { getCurrencyOptions } from "../../../utils.mjs";

import BaseShopConfig from "./base-shop-config.mjs";

/**
 * @import ShopSheet from "../shop-sheet.mjs";
 */

/**
 * Dialog to edit an item's price.
 * @param {object} options
 * @param {ShopSheet} options.shopSheet
 * @param {string} options.entryKey  Entry key of the item being edited.
 * @param {(updateData: object) => Promise<void>} options.onUpdate
 */
export default class PriceConfig extends BaseShopConfig {
  constructor({ shopSheet, entryKey, onUpdate, ...options }={}) {
    super(options);
    this.shopSheet = shopSheet;
    this.entryKey = entryKey;
    this.onUpdate = onUpdate;
  }

  /* -------------------------------------------- */

  /** @override */
  static DEFAULT_OPTIONS = {
    id: "price-config-{id}",
    window: { title: "DND5E.Price" },
    form: { handler: PriceConfig.#onSubmit }
  };

  /* -------------------------------------------- */

  /**
   * The shop editor this config belongs to.
   * @type {ShopSheet}
   */
  shopSheet;

  /* -------------------------------------------- */

  /**
   * Entry key of the item being edited.
   * @type {string}
   */
  entryKey;

  /* -------------------------------------------- */

  /**
   * Callback receiving the shop update.
   * @type {(updateData: object) => Promise<void>}
   */
  onUpdate;

  /* -------------------------------------------- */

  /**
   * The item entry being edited.
   * @type {ShopItemEntry}
   */
  get #entry() {
    return this.shopSheet.shop.items.find(i => ShopItemEntry.key(i) === this.entryKey);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const entry = this.#entry;
    const item = (await ShopItemEntry.resolveMany([entry]))[0]?.item;
    const priceFields = ShopItemEntry.schema.fields.price.fields;
    const bundleSizeField = ShopItemEntry.schema.fields.bundleSize;
    context.fields = [
      {
        field: priceFields.value, name: "value", value: entry.price?.value,
        label: _loc("DND5E.Price"), hint: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.PriceOverrideHint"),
        placeholder: item?.system?.price?.value
      },
      {
        field: priceFields.denomination, name: "denomination",
        value: entry.price?.denomination ?? item?.system?.price?.denomination ?? CONFIG.DND5E.defaultCurrency,
        label: _loc("DND5E.Currency"), options: getCurrencyOptions()
      },
      {
        field: bundleSizeField, name: "bundleSize", value: entry.bundleSize,
        label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.BundleSize"),
        hint: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.BundleSizeHint"),
        placeholder: (item?.system?.quantity > 1) ? item.system.quantity : 1
      }
    ];
    return context;
  }

  /* -------------------------------------------- */

  /**
   * Handle persisting the new price override.
   * @this {PriceConfig}
   * @param {Event} event                Triggering submit event.
   * @param {HTMLFormElement} form       The submitted form.
   * @param {FormDataExtended} formData  Data from the form.
   * @returns {Promise<void>}
   */
  static async #onSubmit(event, form, formData) {
    const data = foundry.utils.expandObject(formData.object);
    const items = this.shopSheet.shop.items.map(i => ShopItemEntry.key(i) !== this.entryKey ? i.toObject() : {
      ...i.toObject(),
      price: { value: data.value ?? null, denomination: data.denomination },
      bundleSize: data.bundleSize ?? null
    });
    await this.onUpdate({ items });
  }
}
