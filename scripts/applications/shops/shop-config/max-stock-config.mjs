import { RESTOCK_MODES } from "../../../config.mjs";
import { Shop, ShopItemEntry } from "../../../data/shop-data.mjs";

import BaseShopConfig from "./base-shop-config.mjs";

/**
 * @import { default as ShopSheet } from "../shop-sheet.mjs";
 */

/**
 * Dialog to edit an item's stock max (restock target) and current stock together.
 * @param {object} options
 * @param {ShopSheet} options.shopSheet
 * @param {string} options.entryKey  Entry key of the item being edited.
 * @param {(updateData: object) => Promise<void>} options.onUpdate
 */
export default class MaxStockConfig extends BaseShopConfig {
  constructor({ shopSheet, entryKey: key, onUpdate, ...options }={}) {
    super(options);
    this.shopSheet = shopSheet;
    this.entryKey = key;
    this.onUpdate = onUpdate;
    this.#restockMode = this.#entry.restockMode;
  }

  /* -------------------------------------------- */

  /** @override */
  static DEFAULT_OPTIONS = {
    id: "max-stock-config-{id}",
    window: { title: "SIMPLE_SHOP_CRAFT_5E.ShopEditor.StockMax" },
    position: { width: 480 },
    form: { handler: MaxStockConfig.#onSubmit },
    shopSheet: null,
    entryKey: null,
    onUpdate: null
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
   * Restock behavior for this item, toggled live before submit.
   * @type {string}
   */
  #restockMode;

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
    const stockFields = ShopItemEntry.schema.fields.stock.fields;
    const [resolved] = await ShopItemEntry.resolveMany([entry]);
    const typeDefault = resolved.item ? Shop.defaultStockMax(resolved.item, this.shopSheet.shop.stockDefaults) : null;
    const currentPlaceholder = (this.#restockMode === "unlimited") ? "∞" : 0;
    context.fields = [
      {
        field: stockFields.max, name: "max", value: entry.stock.max,
        placeholder: typeDefault ?? "∞", disabled: this.#restockMode !== "normal",
        label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.StockMax"), hint: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.StockMaxHint")
      },
      {
        field: stockFields.current, name: "current", value: entry.stock.current, placeholder: currentPlaceholder,
        disabled: this.#restockMode === "unlimited", label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.StockCurrent")
      },
      {
        field: ShopItemEntry.schema.fields.restockMode, name: "restockMode", value: this.#restockMode,
        label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.RestockMode"),
        options: Object.entries(RESTOCK_MODES).map(([value, { label }]) => ({ value, label: _loc(label) }))
      }
    ];
    return context;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onChangeForm(formConfig, event) {
    super._onChangeForm(formConfig, event);
    if ( event.target.name !== "restockMode" ) return;
    this.#restockMode = event.target.value;
    this.render({ parts: ["content"] });
  }

  /* -------------------------------------------- */

  /**
   * Handle persisting the new stock values.
   * @this {MaxStockConfig}
   * @param {Event} event                Triggering submit event.
   * @param {HTMLFormElement} form       The submitted form.
   * @param {FormDataExtended} formData  Data from the form.
   * @returns {Promise<void>}
   */
  static async #onSubmit(event, form, formData) {
    const data = foundry.utils.expandObject(formData.object);
    const restockMode = data.restockMode ?? "normal";
    const items = this.shopSheet.shop.items.map(i => {
      if ( ShopItemEntry.key(i) !== this.entryKey ) return i.toObject();
      return {
        ...i.toObject(),
        stock: {
          max: (restockMode === "normal") ? (data.max ?? null) : (i.stock.max ?? null),
          current: (restockMode === "unlimited") ? null : (data.current ?? 0)
        },
        restockMode
      };
    });
    await this.onUpdate({ items });
  }
}
