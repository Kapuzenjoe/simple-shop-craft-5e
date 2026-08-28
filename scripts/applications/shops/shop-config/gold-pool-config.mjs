import { Shop } from "../../../data/shop-data.mjs";
import { currencyRows, goldPoolCurrencies } from "../../../utils.mjs";

import BaseShopConfig from "./base-shop-config.mjs";

/**
 * @import { default as ShopSheet } from "../shop-sheet.mjs";
 */

/**
 * Dialog to edit a shop's maximum money pool.
 * @param {object} options
 * @param {ShopSheet} options.shopSheet
 * @param {(updateData: object) => Promise<void>} options.onUpdate
 */
export default class GoldPoolConfig extends BaseShopConfig {
  constructor({ shopSheet, onUpdate, ...options }={}) {
    super(options);
    this.shopSheet = shopSheet;
    this.onUpdate = onUpdate;
    this.#unlimited = !!this.shopSheet.shop.goldPool.unlimited;
    this.#amounts = { ...this.shopSheet.shop.goldPool.max };
  }

  /* -------------------------------------------- */

  /** @override */
  static DEFAULT_OPTIONS = {
    id: "gold-pool-config-{id}",
    window: { title: "SIMPLE_SHOP_CRAFT_5E.ShopEditor.GoldPoolMax" },
    form: { handler: GoldPoolConfig.#onSubmit }
  };

  /**
   * The shop editor this config belongs to.
   * @type {ShopSheet}
   */
  shopSheet;

  /**
   * Callback receiving the shop update.
   * @type {(updateData: object) => Promise<void>}
   */
  onUpdate;

  /* -------------------------------------------- */

  /**
   * Whether the gold pool is unlimited, toggled live before submit.
   * @type {boolean}
   */
  #unlimited;

  /* -------------------------------------------- */

  /**
   * Currency amounts as last edited, keyed by denomination.
   * @type {Record<string, number>}
   */
  #amounts;

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.fields = [
      {
        field: Shop.schema.fields.goldPool.fields.unlimited, name: "unlimited", value: this.#unlimited,
        hint: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.GoldPoolMaxHint")
      }
    ];
    if ( !this.#unlimited ) {
      const rows = currencyRows(this.#amounts);
      const amountsHtml = await foundry.applications.handlebars.renderTemplate(
        "modules/simple-shop-craft-5e/templates/partials/currency-inputs.hbs", { rows }
      );
      context.extraContent = `<section class="currency">${amountsHtml}</section>`;
    }
    return context;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onChangeForm(formConfig, event) {
    super._onChangeForm(formConfig, event);
    const formData = new foundry.applications.ux.FormDataExtended(this.form);
    foundry.utils.mergeObject(this.#amounts, formData.object);
    if ( event.target.name !== "unlimited" ) return;
    this.#unlimited = event.target.checked;
    this.render({ parts: ["content"] });
  }

  /* -------------------------------------------- */

  /**
   * Handle persisting the new gold pool.
   * @this {GoldPoolConfig}
   * @param {Event} event                Triggering submit event.
   * @param {HTMLFormElement} form       The submitted form.
   * @param {FormDataExtended} formData  Data from the form.
   * @returns {Promise<void>}
   */
  static async #onSubmit(event, form, formData) {
    const data = foundry.utils.expandObject(formData.object);
    const currentMax = this.shopSheet.shop.goldPool.max;
    const max = goldPoolCurrencies().reduce((obj, denom) => {
      obj[denom] = (denom in data) ? Math.max(0, Math.round(data[denom] ?? 0)) : (currentMax[denom] ?? 0);
      return obj;
    }, {});
    await this.onUpdate({
      goldPool: { ...this.shopSheet.shop.goldPool, max, unlimited: !!data.unlimited }
    });
  }
}
