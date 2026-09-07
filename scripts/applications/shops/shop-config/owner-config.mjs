import { Shop } from "../../../data/shop-data.mjs";

import BaseShopConfig from "./base-shop-config.mjs";

/**
 * @import ShopSheet from "../shop-sheet.mjs";
 */

/**
 * Dialog to edit a shop's owner.
 * @param {object} options
 * @param {ShopSheet} options.shopSheet
 * @param {(updateData: object) => Promise<void>} options.onUpdate
 */
export default class OwnerConfig extends BaseShopConfig {
  constructor({ shopSheet, onUpdate, ...options }={}) {
    super(options);
    this.shopSheet = shopSheet;
    this.onUpdate = onUpdate;
  }

  /* -------------------------------------------- */

  /** @override */
  static DEFAULT_OPTIONS = {
    id: "owner-config-{id}",
    window: { title: "SIMPLE_SHOP_CRAFT_5E.Owner" },
    form: { handler: OwnerConfig.#onSubmit }
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
      {
        field: Shop.schema.fields.npc, name: "npc", value: this.shopSheet.shop.npc ?? "",
        label: _loc("SIMPLE_SHOP_CRAFT_5E.Owner")
      }
    ];
    return context;
  }

  /* -------------------------------------------- */

  /**
   * Handle persisting the new owner.
   * @this {OwnerConfig}
   * @param {Event} event                Triggering submit event.
   * @param {HTMLFormElement} form       The submitted form.
   * @param {FormDataExtended} formData  Data from the form.
   * @returns {Promise<void>}
   */
  static async #onSubmit(event, form, formData) {
    const data = foundry.utils.expandObject(formData.object);
    await this.onUpdate({ npc: data.npc || null });
  }
}
