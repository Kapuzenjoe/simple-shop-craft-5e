import { MODULE_ID, SETTING_KEYS } from "../../../config.mjs";
import { Shop } from "../../../data/shop-data.mjs";

import BaseShopConfig from "./base-shop-config.mjs";

/**
 * @import ShopSheet from "../shop-sheet.mjs";
 */

/**
 * Dialog to edit a shop's buy/sell price modifiers.
 * @param {object} options
 * @param {ShopSheet} options.shopSheet
 * @param {(updateData: object) => Promise<void>} options.onUpdate
 */
export default class ModifiersConfig extends BaseShopConfig {
  constructor({ shopSheet, onUpdate, ...options }={}) {
    super(options);
    this.shopSheet = shopSheet;
    this.onUpdate = onUpdate;
  }

  /* -------------------------------------------- */

  /** @override */
  static DEFAULT_OPTIONS = {
    id: "modifiers-config-{id}",
    window: { title: "SIMPLE_SHOP_CRAFT_5E.ShopEditor.Discount" },
    form: { handler: ModifiersConfig.#onSubmit }
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
    const fields = Shop.schema.fields;
    const lootTypeOptions = Object.entries(CONFIG.DND5E.lootTypes).map(([value, cfg]) => ({ value, label: cfg.label }));
    context.fields = [
      {
        field: fields.buyModifier, name: "buyModifier", value: this.shopSheet.shop.buyModifier,
        input: (field, config) => foundry.applications.fields.createNumberInput(config),
        placeholder: game.settings.get(MODULE_ID, SETTING_KEYS.DEFAULT_BUY_MODIFIER)
      },
      {
        field: fields.sellModifier, name: "sellModifier", value: this.shopSheet.shop.sellModifier,
        input: (field, config) => foundry.applications.fields.createNumberInput(config),
        placeholder: game.settings.get(MODULE_ID, SETTING_KEYS.DEFAULT_SELL_MODIFIER)
      },
      {
        field: fields.fixedValueLootTypes, name: "fixedValueLootTypes",
        value: Array.from(this.shopSheet.shop.fixedValueLootTypes), options: lootTypeOptions
      }
    ];
    return context;
  }

  /* -------------------------------------------- */

  /**
   * Handle persisting the new price modifiers.
   * @this {ModifiersConfig}
   * @param {Event} event                Triggering submit event.
   * @param {HTMLFormElement} form       The submitted form.
   * @param {FormDataExtended} formData  Data from the form.
   * @returns {Promise<void>}
   */
  static async #onSubmit(event, form, formData) {
    const data = foundry.utils.expandObject(formData.object);
    await this.onUpdate({
      buyModifier: Math.clamp(
        Math.round(data.buyModifier ?? game.settings.get(MODULE_ID, SETTING_KEYS.DEFAULT_BUY_MODIFIER)), -100, 1000
      ),
      sellModifier: Math.clamp(
        Math.round(data.sellModifier ?? game.settings.get(MODULE_ID, SETTING_KEYS.DEFAULT_SELL_MODIFIER)), -100, 1000
      ),
      fixedValueLootTypes: data.fixedValueLootTypes ?? []
    });
  }
}
