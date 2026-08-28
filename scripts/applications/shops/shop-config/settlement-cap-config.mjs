import { SETTLEMENT_CAPS } from "../../../config.mjs";
import { Shop } from "../../../data/shop-data.mjs";
import { getCurrencyOptions } from "../../../utils.mjs";

import BaseShopConfig from "./base-shop-config.mjs";

/**
 * @import { default as ShopSheet } from "../shop-sheet.mjs";
 */

/**
 * Dialog to edit a shop's settlement cap.
 * @param {object} options
 * @param {ShopSheet} options.shopSheet
 * @param {(updateData: object) => Promise<void>} options.onUpdate
 */
export default class SettlementCapConfig extends BaseShopConfig {
  constructor({ shopSheet, onUpdate, ...options }={}) {
    super(options);
    this.shopSheet = shopSheet;
    this.onUpdate = onUpdate;
    const settlementCap = this.shopSheet.shop.settlementCap;
    this.#preset = Object.entries(SETTLEMENT_CAPS).find(([, v]) => v.value === settlementCap.value)?.[0]
      ?? (settlementCap.value != null ? "custom" : "");
    this.#customValue = settlementCap.value;
    this.#customDenomination = settlementCap.denomination;
  }

  /* -------------------------------------------- */

  /** @override */
  static DEFAULT_OPTIONS = {
    id: "settlement-cap-config-{id}",
    window: { title: "SIMPLE_SHOP_CRAFT_5E.ShopEditor.SettlementCap" },
    form: { handler: SettlementCapConfig.#onSubmit },
    shopSheet: null,
    onUpdate: null
  };

  /** @override */
  static PARTS = {
    ...super.PARTS,
    content: { template: "modules/simple-shop-craft-5e/templates/settlement-cap-config/content.hbs" }
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
   * Selected preset key, "" for no cap, "custom" for a manual value.
   * @type {string}
   */
  #preset;

  /* -------------------------------------------- */

  /**
   * Custom cap value as last edited, only relevant while `#preset` is "custom".
   * @type {number|null}
   */
  #customValue;

  /* -------------------------------------------- */

  /**
   * Custom cap denomination as last edited, only relevant while `#preset` is "custom".
   * @type {string}
   */
  #customDenomination;

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const capFields = Shop.schema.fields.settlementCap.fields;
    const presetOptions = [
      { value: "", label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.NoCap") },
      ...Object.entries(SETTLEMENT_CAPS).map(([key, { label, value }]) => ({
        value: key, label: `${_loc(label)} (${new Intl.NumberFormat(game.i18n.lang).format(value)} GP)`
      })),
      { value: "custom", label: _loc("SIMPLE_SHOP_CRAFT_5E.Custom") }
    ];
    context.fields = [
      {
        field: new foundry.data.fields.StringField(), name: "settlementCapPreset", value: this.#preset,
        label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.SettlementCap"), options: presetOptions
      },
      {
        field: capFields.appliesToSell, name: "appliesToSell",
        value: !!this.shopSheet.shop.settlementCap.appliesToSell,
        label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.SettlementCapAppliesToSell"),
        hint: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.SettlementCapAppliesToSellHint")
      }
    ];
    context.customFields = (this.#preset === "custom") ? [
      {
        field: capFields.value, name: "settlementCapValue", value: this.#customValue,
        label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.SettlementCapValue")
      },
      {
        field: capFields.denomination, name: "settlementCapDenomination",
        value: this.#customDenomination, options: getCurrencyOptions(), label: _loc("DND5E.Currency")
      }
    ] : null;
    return context;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onChangeForm(formConfig, event) {
    super._onChangeForm(formConfig, event);
    const formData = new foundry.applications.ux.FormDataExtended(this.form);
    if ( "settlementCapValue" in formData.object ) this.#customValue = formData.object.settlementCapValue;
    if ( "settlementCapDenomination" in formData.object ) {
      this.#customDenomination = formData.object.settlementCapDenomination;
    }
    if ( event.target.name !== "settlementCapPreset" ) return;
    this.#preset = event.target.value;
    this.render({ parts: ["content"] });
  }

  /* -------------------------------------------- */

  /**
   * Handle persisting the new settlement cap.
   * @this {SettlementCapConfig}
   * @param {Event} event                Triggering submit event.
   * @param {HTMLFormElement} form       The submitted form.
   * @param {FormDataExtended} formData  Data from the form.
   * @returns {Promise<void>}
   */
  static async #onSubmit(event, form, formData) {
    const data = foundry.utils.expandObject(formData.object);
    const value = data.settlementCapPreset === "custom" ? (data.settlementCapValue ?? null)
      : (data.settlementCapPreset === "" ? null : SETTLEMENT_CAPS[data.settlementCapPreset].value);
    const denomination = (data.settlementCapPreset === "custom")
      ? (data.settlementCapDenomination || CONFIG.DND5E.defaultCurrency) : CONFIG.DND5E.defaultCurrency;
    await this.onUpdate({ settlementCap: { value, denomination, appliesToSell: !!data.appliesToSell } });
  }
}
