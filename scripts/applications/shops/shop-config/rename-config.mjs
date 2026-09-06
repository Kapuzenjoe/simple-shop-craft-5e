import { Shop } from "../../../data/shop-data.mjs";

import BaseShopConfig from "./base-shop-config.mjs";

/**
 * @import ShopSheet from "../shop-sheet.mjs";
 */

/**
 * Dialog to rename a shop.
 * @param {object} options
 * @param {ShopSheet} options.shopSheet
 * @param {(updateData: object) => Promise<void>} options.onUpdate
 */
export default class RenameConfig extends BaseShopConfig {
  constructor({ shopSheet, onUpdate, ...options }={}) {
    super(options);
    this.shopSheet = shopSheet;
    this.onUpdate = onUpdate;
  }

  /* -------------------------------------------- */

  /** @override */
  static DEFAULT_OPTIONS = {
    id: "rename-config-{id}",
    window: { title: "SIMPLE_SHOP_CRAFT_5E.ShopEditor.RenameShop" },
    form: { handler: RenameConfig.#onSubmit }
  };

  /* -------------------------------------------- */

  /**
   * The shop editor this config belongs to.
   * @type {ShopSheet}
   */
  shopSheet;

  /* -------------------------------------------- */

  /**
   * Callback receiving the shop update.
   * @type {(updateData: object) => Promise<void>}
   */
  onUpdate;

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.fields = [
      { field: Shop.schema.fields.name, name: "name", value: this.shopSheet.shop.name }
    ];
    return context;
  }

  /* -------------------------------------------- */

  /**
   * Handle persisting the new shop name.
   * @this {RenameConfig}
   * @param {Event} event                Triggering submit event.
   * @param {HTMLFormElement} form       The submitted form.
   * @param {FormDataExtended} formData  Data from the form.
   * @returns {Promise<void>}
   */
  static async #onSubmit(event, form, formData) {
    const data = foundry.utils.expandObject(formData.object);
    await this.onUpdate({ name: data.name || this.shopSheet.shop.name });
  }
}
