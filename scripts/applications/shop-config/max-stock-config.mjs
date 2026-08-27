import { ShopItemEntry } from "../../data/shop-data.mjs";
import { entryKey } from "../../shop/entry-resolver.mjs";

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
    this.#noRestock = !!this.#entry.noRestock;
  }

  /* -------------------------------------------- */

  /** @override */
  static DEFAULT_OPTIONS = {
    id: "max-stock-config-{id}",
    window: { title: "SIMPLE_SHOP_CRAFT_5E.ShopEditor.StockMax" },
    position: { width: 480 },
    form: { handler: MaxStockConfig.#onSubmit }
  };

  /**
   * The shop editor this config belongs to.
   * @type {ShopSheet}
   */
  shopSheet;

  /**
   * Entry key of the item being edited.
   * @type {string}
   */
  entryKey;

  /**
   * Callback receiving the shop update.
   * @type {(updateData: object) => Promise<void>}
   */
  onUpdate;

  /* -------------------------------------------- */

  /**
   * Whether restocking is disabled for this item, toggled live before submit.
   * @type {boolean}
   */
  #noRestock;

  /* -------------------------------------------- */

  /**
   * The item entry being edited.
   * @type {ShopItemEntry}
   */
  get #entry() {
    return this.shopSheet.shop.items.find(i => entryKey(i) === this.entryKey);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const entry = this.#entry;
    const stockFields = ShopItemEntry.schema.fields.stock.fields;
    context.fields = [
      {
        field: stockFields.max, name: "max", value: entry.stock.max, placeholder: "∞", disabled: this.#noRestock,
        label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.StockMax"), hint: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.StockMaxHint")
      },
      {
        field: stockFields.current, name: "current", value: entry.stock.current, placeholder: "∞",
        label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.StockCurrent")
      },
      {
        field: ShopItemEntry.schema.fields.noRestock, name: "noRestock", value: this.#noRestock,
        label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.NoRestock"), hint: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.NoRestockHint")
      }
    ];
    return context;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onChangeForm(formConfig, event) {
    super._onChangeForm(formConfig, event);
    if ( event.target.name !== "noRestock" ) return;
    this.#noRestock = event.target.checked;
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
    const items = this.shopSheet.shop.items.map(i => entryKey(i) !== this.entryKey ? i.toObject() : {
      ...i.toObject(),
      stock: { max: data.noRestock ? null : (data.max ?? null), current: data.current ?? null },
      noRestock: !!data.noRestock
    });
    await this.onUpdate({ items });
  }
}
