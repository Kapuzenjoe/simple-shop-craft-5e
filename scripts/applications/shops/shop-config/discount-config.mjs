import { ShopItemEntry } from "../../../data/shop-data.mjs";
import BaseShopConfig from "./base-shop-config.mjs";

/**
 * Dialog to edit an item's price-modifier override.
 * @param {object} options
 * @param {{ buy: number|null, sell: number|null }} options.playerOverride  Acting actor's discount override, if any.
 */
export default class DiscountConfig extends BaseShopConfig {
  constructor({ playerOverride, ...options }={}) {
    super(options);
    this.playerOverride = playerOverride;
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
   * Acting actor's discount override, if any.
   * @type {{ buy: number|null, sell: number|null }}
   */
  playerOverride;

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const entry = this.entry;
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
