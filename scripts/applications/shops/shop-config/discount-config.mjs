import { ShopItemEntry } from "../../../data/shop-data.mjs";

import BaseShopConfig from "./base-shop-config.mjs";

/**
 * @import ShopSheet from "../shop-sheet.mjs";
 */

/**
 * Dialog to edit an item's price-modifier override.
 * @param {object} options
 * @param {ShopSheet} options.shopSheet
 * @param {string} options.entryKey  Entry key of the item being edited.
 * @param {{ buy: number|null, sell: number|null }} options.playerOverride  Acting actor's discount override, if any.
 * @param {(updateData: object) => Promise<void>} options.onUpdate
 */
export default class DiscountConfig extends BaseShopConfig {
  constructor({ shopSheet, entryKey, playerOverride, onUpdate, ...options }={}) {
    super(options);
    this.shopSheet = shopSheet;
    this.entryKey = entryKey;
    this.playerOverride = playerOverride;
    this.onUpdate = onUpdate;
  }

  /* -------------------------------------------- */

  /** @override */
  static DEFAULT_OPTIONS = {
    id: "discount-config-{id}",
    window: { title: "SIMPLE_SHOP_CRAFT_5E.ShopEditor.PriceModifier" },
    form: { handler: DiscountConfig.#onSubmit }
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
   * Acting actor's discount override, if any.
   * @type {{ buy: number|null, sell: number|null }}
   */
  playerOverride;

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
    const effectiveDefault = this.shopSheet.shop.buyModifier + (this.playerOverride.buy ?? 0);
    context.fields = [
      {
        field: ShopItemEntry.schema.fields.discount, name: "discount", value: entry.discount,
        input: (field, config) => foundry.applications.fields.createNumberInput(config),
        label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.PriceModifier"),
        hint: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.DiscountOverrideHint"),
        placeholder: String(effectiveDefault)
      }
    ];
    return context;
  }

  /* -------------------------------------------- */

  /**
   * Handle persisting the new discount override.
   * @this {DiscountConfig}
   * @param {Event} event                Triggering submit event.
   * @param {HTMLFormElement} form       The submitted form.
   * @param {FormDataExtended} formData  Data from the form.
   * @returns {Promise<void>}
   */
  static async #onSubmit(event, form, formData) {
    const data = foundry.utils.expandObject(formData.object);
    const items = this.shopSheet.shop.items.map(i => ShopItemEntry.key(i) !== this.entryKey ? i.toObject() : {
      ...i.toObject(),
      discount: data.discount ?? null
    });
    await this.onUpdate({ items });
  }
}
