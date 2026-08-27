import { GOLD_POOL_DEFAULT } from "../config.mjs";
import { createShop } from "../data/shop-store.mjs";
import { getStarterItems, getStarterPackOptions } from "../data/starter-packs.mjs";

import ShopSheet from "./shop-sheet.mjs";

/**
 * @import { default as ShopManager } from "./shop-manager.mjs";
 */

const { Dialog5e } = game.dnd5e.applications.api;

/**
 * Dialog to create a new shop: name/starter-pack prompt, then opens the full edit view.
 */
export default class ShopCreateDialog extends Dialog5e {
  constructor({ shopManager, ...options }={}) {
    super(options);
    this.shopManager = shopManager;
  }

  /* -------------------------------------------- */

  /** @override */
  static DEFAULT_OPTIONS = {
    id: "shop-create-dialog-{id}",
    classes: ["simple-shop-craft-5e", "shop-create-dialog", "standard-form"],
    window: { title: "SIMPLE_SHOP_CRAFT_5E.ShopManager.Shops.Create" },
    position: { width: 400 },
    buttons: [
      { action: "create", label: "SIMPLE_SHOP_CRAFT_5E.ShopManager.Shops.Create", icon: "fas fa-plus", default: true }
    ],
    form: { handler: ShopCreateDialog.#onSubmit }
  };

  /* -------------------------------------------- */

  /** @override */
  static PARTS = {
    ...super.PARTS,
    content: { template: "modules/simple-shop-craft-5e/templates/partials/config-dialog-content.hbs" }
  };

  /**
   * The shop manager this dialog was opened from.
   * @type {ShopManager}
   */
  shopManager;

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareContentContext(context, options) {
    context = await super._prepareContentContext(context, options);
    context.legend = this.options.window?.title;
    const starterPackOptions = [
      { value: "", label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopManager.Shops.Empty") },
      ...getStarterPackOptions()
    ];
    context.fields = [
      {
        field: new foundry.data.fields.StringField(), name: "starterPack",
        label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopManager.Shops.StarterPack"), options: starterPackOptions
      },
      {
        field: new foundry.data.fields.StringField(), name: "name",
        label: _loc("SIMPLE_SHOP_CRAFT_5E.Shop")
      }
    ];
    return context;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _onRender(context, options) {
    await super._onRender(context, options);
    const select = this.element.querySelector('select[name="starterPack"]');
    const name = this.element.querySelector('input[name="name"]');
    select?.addEventListener("change", () => {
      name.placeholder = select.value ? (select.selectedOptions[0]?.text ?? "") : "";
    });
  }

  /* -------------------------------------------- */

  /**
   * Handle creating the shop and opening its full edit view.
   * @this {ShopCreateDialog}
   * @param {Event} event                Triggering submit event.
   * @param {HTMLFormElement} form       The submitted form.
   * @param {FormDataExtended} formData  Data from the form.
   * @returns {Promise<void>}
   */
  static async #onSubmit(event, form, formData) {
    const data = foundry.utils.expandObject(formData.object);
    const packs = getStarterPackOptions();
    const newShop = {
      name: data.name || packs.find(p => p.value === data.starterPack)?.label
        || _loc("SIMPLE_SHOP_CRAFT_5E.ShopManager.Shops.Create"),
      goldPool: { max: { gp: GOLD_POOL_DEFAULT }, current: { gp: GOLD_POOL_DEFAULT }, unlimited: false },
      items: getStarterItems(data.starterPack).map(({ identifier, bundleSize }) => ({
        identifier, bundleSize, stock: { max: null, current: null }
      }))
    };
    const created = await createShop(newShop);
    this.shopManager.render();
    new ShopSheet({ shopId: created._id }).render({ force: true, mode: ShopSheet.MODES.EDIT });
    await this.close();
  }
}
