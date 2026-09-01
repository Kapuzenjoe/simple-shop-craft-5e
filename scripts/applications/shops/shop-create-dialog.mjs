import { GOLD_POOL_DEFAULT, STARTER_PACKS } from "../../config.mjs";
import { newEntryStock, Shop } from "../../data/shop-data.mjs";
import { resolveIdentifierIndex } from "../../utils.mjs";

import ShopSheet from "./shop-sheet.mjs";

/**
 * @import { default as ShopManager } from "../shop-manager.mjs";
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
    form: { handler: ShopCreateDialog.#onSubmit },
    shopManager: null
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
    const starterItems = getStarterItems(data.starterPack);
    const byIdentifier = await resolveIdentifierIndex(new Set(starterItems.map(i => i.identifier)));
    const resolvedItems = await Promise.all(starterItems.map(({ identifier }) => {
      const uuid = byIdentifier.get(identifier)?.uuid;
      return uuid ? fromUuid(uuid) : null;
    }));
    const stockDefaults = Shop.schema.fields.stockDefaults.getInitialValue({});
    const newShop = {
      name: data.name || packs.find(p => p.value === data.starterPack)?.label
        || _loc("SIMPLE_SHOP_CRAFT_5E.ShopManager.Shops.Create"),
      goldPool: { max: { gp: GOLD_POOL_DEFAULT }, current: { gp: GOLD_POOL_DEFAULT }, unlimited: false },
      items: starterItems.map(({ identifier, bundleSize }, index) => {
        return { identifier, bundleSize, ...newEntryStock(resolvedItems[index], stockDefaults) };
      })
    };
    const created = await Shop.create(newShop);
    this.shopManager.render();
    new ShopSheet({ shopId: created._id }).render({ force: true, mode: ShopSheet.MODES.EDIT });
    await this.close();
  }
}

/* -------------------------------------------- */

/**
 * Get the item identifiers included in a starter pack.
 * @param {string} pack  Starter pack key.
 * @returns {{ identifier: string, bundleSize: number|null }[]}
 */
function getStarterItems(pack) {
  return (STARTER_PACKS[pack]?.items ?? []).map(item => typeof item === "string"
    ? { identifier: item, bundleSize: null }
    : { identifier: item.identifier, bundleSize: item.bundleSize ?? null });
}

/* -------------------------------------------- */

/**
 * Get the localized label/value pairs for the starter pack selection dropdown.
 * @returns {{ value: string, label: string }[]}
 */
function getStarterPackOptions() {
  return Object.entries(STARTER_PACKS).map(([value, pack]) => ({ value, label: _loc(pack.label) }));
}
