import { STOCK_MAGIC_RULES } from "../../../config.mjs";
import { Shop } from "../../../data/shop-data.mjs";
import { currencyRows, goldPoolCurrencies } from "../../../utils.mjs";
import BaseShopConfig from "./base-shop-config.mjs";

/**
 * Dialog to edit a shop's money pool and default stock per item type.
 * @param {object} options
 * @param {Shop} options.shop
 */
export default class VendorConfig extends BaseShopConfig {
  constructor({ shop, ...options }={}) {
    super(options);
    this.shop = shop;
    this.#unlimited = !!this.shop.goldPool.unlimited;
    this.#amounts = { ...this.shop.goldPool.max };
    this.#sellDisabled = !!this.shop.goldPool.sellDisabled;
    this.#stockByType = { ...this.shop.stockDefaults.byType };
    this.#magicRule = this.shop.stockDefaults.magicRule;
  }

  /* -------------------------------------------- */

  /** @override */
  static DEFAULT_OPTIONS = {
    id: "vendor-config-{id}",
    window: { title: "SIMPLE_SHOP_CRAFT_5E.ShopEditor.VendorSettings" },
    form: { handler: VendorConfig.#onSubmit }
  };

  /* -------------------------------------------- */

  /** @override */
  static PARTS = {
    ...super.PARTS,
    content: { template: "modules/simple-shop-craft-5e/templates/shops/shop-config/vendor-config/content.hbs" }
  };

  /* -------------------------------------------- */

  /**
   * The shop being configured.
   * @type {Shop}
   */
  shop;

  /* -------------------------------------------- */

  /**
   * Whether the gold pool is unlimited, toggled live before submit.
   * @type {boolean}
   */
  #unlimited;

  /* -------------------------------------------- */

  /**
   * Whether this shop is purchase-only, toggled live before submit.
   * @type {boolean}
   */
  #sellDisabled;

  /* -------------------------------------------- */

  /**
   * Default max stock per item type, toggled live before submit. `null` per type means unlimited.
   * @type {Record<string, number|null>}
   */
  #stockByType;

  /* -------------------------------------------- */

  /**
   * Magic-item stock exemption rule, toggled live before submit.
   * @type {string}
   */
  #magicRule;

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

    context.nameFields = [
      { field: Shop.schema.fields.name, name: "name", value: this.shop.name }
    ];

    context.moneyFields = [
      {
        field: Shop.schema.fields.goldPool.fields.sellDisabled, name: "sellDisabled", value: this.#sellDisabled,
        hint: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.SellDisabledHint")
      }
    ];
    context.currencyRows = null;
    if ( !this.#sellDisabled ) {
      context.moneyFields.push({
        field: Shop.schema.fields.goldPool.fields.unlimited, name: "unlimited", value: this.#unlimited,
        hint: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.GoldPoolMaxHint")
      });
      if ( !this.#unlimited ) context.currencyRows = currencyRows(this.#amounts);
    }

    const byTypeField = Shop.schema.fields.stockDefaults.fields.byType.element;
    context.stockFields = [
      {
        field: Shop.schema.fields.stockDefaults.fields.magicRule, name: "magicRule", value: this.#magicRule,
        options: Object.entries(STOCK_MAGIC_RULES).map(([value, { label }]) => ({ value, label: _loc(label) })),
        hint: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.StockMagicRuleHint")
      },
      ...Object.keys(this.#stockByType).map((type, index, types) => ({
        field: byTypeField, name: `stockByType.${type}`, value: this.#stockByType[type], placeholder: "—",
        label: _loc(`TYPES.Item.${type}Pl`),
        hint: (index === types.length - 1) ? _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.StockDefaultHint") : undefined
      }))
    ];

    return context;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onChangeForm(formConfig, event) {
    super._onChangeForm(formConfig, event);
    const formData = new foundry.applications.ux.FormDataExtended(this.form);
    foundry.utils.mergeObject(this.#amounts, formData.object);
    if ( event.target.name === "sellDisabled" ) {
      this.#sellDisabled = event.target.checked;
      this.render({ parts: ["content"] });
      return;
    }
    if ( event.target.name !== "unlimited" ) return;
    this.#unlimited = event.target.checked;
    this.render({ parts: ["content"] });
  }

  /* -------------------------------------------- */

  /**
   * Handle persisting the new gold pool and default stock settings.
   * @this {VendorConfig}
   * @param {Event} event                Triggering submit event.
   * @param {HTMLFormElement} form       The submitted form.
   * @param {FormDataExtended} formData  Data from the form.
   * @returns {Promise<void>}
   */
  static async #onSubmit(event, form, formData) {
    const data = foundry.utils.expandObject(formData.object);
    const currentGoldPool = Shop.get(this.shop._id).goldPool;
    const sellDisabled = !!data.sellDisabled;
    const unlimited = sellDisabled ? currentGoldPool.unlimited : !!data.unlimited;
    const max = sellDisabled ? currentGoldPool.max : goldPoolCurrencies().reduce((obj, denom) => {
      obj[denom] = (denom in data) ? Math.max(0, Math.round(data[denom] ?? 0)) : (currentGoldPool.max[denom] ?? 0);
      return obj;
    }, {});

    const byType = Object.fromEntries(
      Object.keys(this.shop.stockDefaults.byType).map(type => {
        const raw = data.stockByType?.[type];
        const value = ((raw === "") || (raw == null)) ? null : Math.max(0, Math.round(raw));
        return [type, value];
      })
    );

    await this.onUpdate({
      name: data.name || this.shop.name,
      goldPool: { ...currentGoldPool, max, unlimited, sellDisabled },
      stockDefaults: { byType, magicRule: data.magicRule ?? "gear" }
    });
  }
}
