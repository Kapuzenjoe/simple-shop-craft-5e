import { ShopItemEntry } from "../../data/shop-data.mjs";

/**
 * @import { default as ShopSheet } from "./shop-sheet.mjs";
 */

const { Dialog5e } = game.dnd5e.applications.api;
const { DocumentUUIDField, StringField } = foundry.data.fields;

/**
 * Dialog to draw items from a RollTable and add them to a shop's stock.
 * @param {object} options
 * @param {ShopSheet} options.shopSheet
 * @param {(entries: object[]) => Promise<void>} options.onFilled
 */
export default class FillFromTableDialog extends Dialog5e {
  constructor({ shopSheet, onFilled, ...options }={}) {
    super(options);
    this.shopSheet = shopSheet;
    this.onFilled = onFilled;
  }

  /* -------------------------------------------- */

  /** @override */
  static DEFAULT_OPTIONS = {
    id: "fill-from-table-dialog-{id}",
    classes: ["simple-shop-craft-5e", "fill-from-table-dialog", "standard-form"],
    window: { title: "SIMPLE_SHOP_CRAFT_5E.ShopEditor.FillFromTable" },
    position: { width: 400 },
    buttons: [
      { action: "fill", label: "SIMPLE_SHOP_CRAFT_5E.ShopEditor.FillFromTable", icon: "fas fa-table-list", default: true }
    ],
    form: { handler: FillFromTableDialog.#onSubmit },
    shopSheet: null,
    onFilled: null
  };

  /* -------------------------------------------- */

  /** @override */
  static PARTS = {
    ...super.PARTS,
    content: { template: "modules/simple-shop-craft-5e/templates/partials/config-dialog-content.hbs" }
  };

  /**
   * The shop editor this dialog was opened from.
   * @type {ShopSheet}
   */
  shopSheet;

  /**
   * Callback receiving the resolved item entries.
   * @type {(entries: object[]) => Promise<void>}
   */
  onFilled;

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareContentContext(context, options) {
    context = await super._prepareContentContext(context, options);
    context.legend = this.options.window?.title;
    context.fields = [
      {
        field: new DocumentUUIDField({ type: "RollTable", required: true }), name: "table",
        label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.FillFromTableTable")
      },
      {
        field: new StringField({ initial: "1", required: true, blank: false }), name: "formula",
        label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.FillFromTableCount"),
        hint: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.FillFromTableCountHint")
      }
    ];
    return context;
  }

  /* -------------------------------------------- */

  /**
   * Handle drawing from the selected table and adding the resolved items to the shop's stock. A new item
   * is excluded from restock with current stock set to how many times it was drawn; an item already in
   * the shop just has its current stock increased by that count, restock mode and max left untouched.
   * @this {FillFromTableDialog}
   * @param {Event} event                Triggering submit event.
   * @param {HTMLFormElement} form       The submitted form.
   * @param {FormDataExtended} formData  Data from the form.
   * @returns {Promise<void>}
   */
  static async #onSubmit(event, form, formData) {
    const data = foundry.utils.expandObject(formData.object);
    const table = await fromUuid(data.table);
    if ( !table ) return;
    const roll = await new Roll(data.formula).evaluate({ allowInteractive: false });
    if ( roll.total <= 0 ) return;

    const { results } = await table.drawMany(roll.total, { displayChat: false });
    const drawnItems = await Promise.all(
      results.filter(r => r.type === "document").map(r => fromUuid(r.documentUuid))
    );

    const counted = new Map();
    let skipped = 0;
    for ( const item of drawnItems ) {
      if ( !CONFIG.Item.dataModels[item?.type]?.inventorySection ) { skipped++; continue; }
      const entry = item.system.identifier ? { identifier: item.system.identifier } : { uuid: item.uuid };
      const key = ShopItemEntry.key(entry);
      const existing = counted.get(key);
      if ( existing ) existing.count++;
      else counted.set(key, { entry, label: item.name, count: 1 });
    }
    const rolled = Array.from(counted.values());

    if ( !rolled.length ) {
      ui.notifications.warn("SIMPLE_SHOP_CRAFT_5E.ShopEditor.FillFromTableNone", { localize: true });
      return;
    }

    const existingByKey = new Map(this.shopSheet.shop.items.map(i => [ShopItemEntry.key(i), i]));
    await this.onFilled(rolled.map(({ entry, count }) => {
      const existing = existingByKey.get(ShopItemEntry.key(entry));
      if ( existing ) {
        return { ...existing.toObject(), stock: { ...existing.stock, current: (existing.stock.current ?? 0) + count } };
      }
      return { ...entry, stock: { max: null, current: count }, restockMode: "exclude" };
    }));
    const [key, format] = skipped
      ? ["SIMPLE_SHOP_CRAFT_5E.ShopEditor.FillFromTablePartial", { count: rolled.length, skipped }]
      : (rolled.length === 1)
        ? ["SIMPLE_SHOP_CRAFT_5E.ShopEditor.FillFromTableResult", { name: rolled[0].label }]
        : ["SIMPLE_SHOP_CRAFT_5E.ShopEditor.FillFromTableResultMultiple", { count: rolled.length }];
    ui.notifications.info(key, { format });
    await this.close();
  }
}
