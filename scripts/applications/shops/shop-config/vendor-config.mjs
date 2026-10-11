import { STOCK_MAGIC_RULES } from "../../../config.mjs";
import { Shop } from "../../../data/shop-data.mjs";
import { currencyRows, goldPoolCurrencies, parseTypeFilter, typeFilterFields } from "../../../utils.mjs";
import TransactionLog from "../../transaction-log.mjs";
import BaseShopConfig from "./base-shop-config.mjs";

/**
 * Dialog to edit a shop's money pool and default stock per item type.
 * @param {object} options
 * @param {Shop} options.shop
 */
export default class VendorConfig extends BaseShopConfig {
  constructor({ shop, ...options }={}) {
    super(options);
    this.#shopId = shop._id;
  }

  /* -------------------------------------------- */

  /** @override */
  static DEFAULT_OPTIONS = {
    id: "vendor-config-{id}",
    window: { title: "SIMPLE_SHOP_CRAFT_5E.ShopEditor.VendorSettings" },
    form: { handler: VendorConfig.#onSubmit },
    actions: { openTransactionLog: VendorConfig.#openTransactionLog }
  };

  /* -------------------------------------------- */

  /** @override */
  static PARTS = {
    ...super.PARTS,
    content: { template: "modules/simple-shop-craft-5e/templates/shops/shop-config/vendor-config/content.hbs" }
  };

  /* -------------------------------------------- */

  /**
   * ID of the shop being configured.
   * @type {string}
   */
  #shopId;

  /* -------------------------------------------- */

  /**
   * The shop being configured.
   * @type {Shop}
   */
  get shop() {
    return Shop.get(this.#shopId);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const { goldPool, stockDefaults } = this.shop;

    context.nameFields = [
      { field: Shop.schema.fields.name, name: "name", value: this.shop.name }
    ];

    context.moneyFields = [
      {
        field: Shop.schema.fields.goldPool.fields.sellDisabled, name: "sellDisabled", value: goldPool.sellDisabled,
        hint: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.SellDisabledHint")
      }
    ];
    context.currencyRows = null;
    context.typeFilter = null;
    if ( !goldPool.sellDisabled ) {
      context.moneyFields.push({
        field: Shop.schema.fields.goldPool.fields.unlimited, name: "unlimited", value: goldPool.unlimited,
        hint: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.GoldPoolMaxHint")
      });
      if ( !goldPool.unlimited ) context.currencyRows = currencyRows(goldPool.max);
      const { typeFields, typeFieldsets } = typeFilterFields(this.shop.sellTypes);
      typeFields[0].hint = _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.SellTypesHint");
      context.typeFilter = {
        typeFields: [
          ...typeFields, ...typeFieldsets.flatMap(({ label, fields }) => fields.map(field => ({ ...field, label })))
        ],
        typeFieldsets: []
      };
    }

    const byTypeField = Shop.schema.fields.stockDefaults.fields.byType.element;
    context.stockFields = [
      {
        field: Shop.schema.fields.stockDefaults.fields.magicRule, name: "magicRule", value: stockDefaults.magicRule,
        options: Object.entries(STOCK_MAGIC_RULES).map(([value, { label }]) => ({ value, label: _loc(label) })),
        hint: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.StockMagicRuleHint")
      },
      ...Object.keys(stockDefaults.byType).map((type, index, types) => ({
        field: byTypeField, name: `stockByType.${type}`, value: stockDefaults.byType[type], placeholder: "—",
        label: _loc(`TYPES.Item.${type}Pl`),
        hint: (index === types.length - 1) ? _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.StockDefaultHint") : undefined
      }))
    ];

    return context;
  }

  /* -------------------------------------------- */

  /**
   * Handle opening the transaction log of this shop.
   * @this {VendorConfig}
   */
  static #openTransactionLog() {
    new TransactionLog({ shopId: this.shop._id }).render({ force: true });
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
    const currentGoldPool = this.shop.goldPool;
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
      stockDefaults: { byType, magicRule: data.magicRule ?? "gear" },
      ...(("types" in data) ? { sellTypes: parseTypeFilter(data) } : {})
    });
    const name = event.target?.name;
    if ( ["sellDisabled", "unlimited", "types"].includes(name) || name?.startsWith("subtypes.") ) {
      this.render({ parts: ["content"] });
    }
  }
}
