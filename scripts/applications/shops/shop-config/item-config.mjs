import { RESTOCK_MODES } from "../../../config.mjs";
import { Shop, ShopItemEntry } from "../../../data/shop-data.mjs";
import { currencyValueField, resolveBundleSize } from "../../../utils.mjs";
import BaseShopConfig from "./base-shop-config.mjs";

/**
 * Dialog to edit an item entry's price, price modifier, and stock settings. Autosaves on every change.
 */
export default class ItemConfig extends BaseShopConfig {
  /** @override */
  static DEFAULT_OPTIONS = {
    id: "item-config-{id}",
    window: { title: "SIMPLE_SHOP_CRAFT_5E.ShopEditor.ItemSettings" },
    form: { handler: ItemConfig.#onSubmit }
  };

  /* -------------------------------------------- */

  /** @override */
  static PARTS = {
    settings: { template: "modules/simple-shop-craft-5e/templates/shops/shop-config/item-config/settings.hbs" }
  };

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const { shop, selectedActorUuid } = this.shopSheet;
    const entry = this.entry;
    const item = (await ShopItemEntry.resolveMany([entry]))[0]?.item;
    options.window ??= {};
    options.window.subtitle = item?.name ?? "";
    const entryFields = ShopItemEntry.schema.fields;

    context.priceFields = [
      currencyValueField({
        label: _loc("DND5E.Price"), hint: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.PriceOverrideHint"),
        field: entryFields.price, valueName: "value", value: entry.price?.value,
        placeholder: item?.system?.price?.value,
        denominationName: "denomination",
        denomination: entry.price?.denomination ?? item?.system?.price?.denomination ?? CONFIG.DND5E.defaultCurrency
      })
    ];
    if ( !entry.isService ) {
      context.priceFields.push({
        field: entryFields.bundleSize, name: "bundleSize", value: entry.bundleSize,
        label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.BundleSize"),
        hint: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.BundleSizeHint"),
        placeholder: resolveBundleSize(item)
      });
    }
    context.priceFields.push({
      field: entryFields.discount, name: "discount", value: entry.discount,
      input: (field, config) => foundry.applications.fields.createNumberInput(config),
      label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.PriceModifier"),
      hint: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.DiscountOverrideHint"),
      placeholder: String(shop.buyModifier + (shop.resolvePlayerOverride(selectedActorUuid).buy ?? 0))
    });

    const typeDefault = item ? Shop.defaultStockMax(item, shop.stockDefaults) : null;
    context.stockFields = [
      {
        field: entryFields.restockMode, name: "restockMode", value: entry.restockMode,
        label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.RestockMode"),
        options: Object.entries(RESTOCK_MODES).map(([value, { label }]) => ({ value, label: _loc(label) }))
      },
      {
        field: entryFields.stock.fields.max, name: "max", value: entry.stock.max,
        placeholder: typeDefault ?? 0, disabled: entry.restockMode !== "normal",
        label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.StockMax"), hint: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.StockMaxHint")
      }
    ];
    return context;
  }

  /* -------------------------------------------- */

  /**
   * Prepare the changes to an item entry from the submitted form data.
   * @param {object} data           Expanded form data.
   * @param {ShopItemEntry} entry   The entry being edited.
   * @returns {object}              Properties to merge into the entry.
   * @protected
   */
  _getEntryUpdate(data, entry) {
    const restockMode = data.restockMode ?? "normal";
    return {
      price: { value: data.value ?? null, denomination: data.denomination },
      bundleSize: data.bundleSize ?? null,
      discount: data.discount ?? null,
      restockMode,
      stock: {
        max: (restockMode === "normal") ? (data.max ?? null) : (entry.stock.max ?? null),
        current: (restockMode === "unlimited") ? null : (entry.stock.current ?? 0)
      }
    };
  }

  /* -------------------------------------------- */

  /**
   * Handle persisting the changed entry settings.
   * @this {ItemConfig}
   * @param {Event} event                Triggering submit event.
   * @param {HTMLFormElement} form       The submitted form.
   * @param {FormDataExtended} formData  Data from the form.
   * @returns {Promise<void>}
   */
  static async #onSubmit(event, form, formData) {
    const data = foundry.utils.expandObject(formData.object);
    const items = this.shopSheet.shop.items.map(i => (i._id !== this.entryKey) ? i.toObject() : {
      ...i.toObject(),
      ...this._getEntryUpdate(data, i)
    });
    await this.onUpdate({ items });
  }
}
