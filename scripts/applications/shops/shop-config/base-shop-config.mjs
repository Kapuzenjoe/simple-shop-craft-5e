import { ShopItemEntry } from "../../../data/shop-data.mjs";

/**
 * @import ShopSheet from "../shop-sheet.mjs";
 */

const { Application5e } = game.dnd5e.applications.api;

/**
 * Base class for the module's autosave config dialogs.
 * @param {object} options
 * @param {string} [options.entryKey]  Entry key of the item being edited.
 * @param {ShopSheet} [options.shopSheet]
 * @param {(updateData: object) => Promise<void>} options.onUpdate
 */
export default class BaseShopConfig extends Application5e {
  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["simple-shop-craft-5e", "config-sheet", "standard-form"],
    tag: "form",
    entryKey: null,
    form: {
      submitOnChange: true,
      closeOnSubmit: false
    },
    onUpdate: null,
    position: {
      width: 400
    },
    shopSheet: null
  };

  /* -------------------------------------------- */

  /** @override */
  static PARTS = {
    content: {
      template: "modules/simple-shop-craft-5e/templates/shared/config-dialog-content.hbs"
    }
  };

  /* -------------------------------------------- */

  /**
   * The item entry being edited.
   * @type {ShopItemEntry}
   */
  get entry() {
    return this.shopSheet.shop.items.find(i => ShopItemEntry.key(i) === this.entryKey);
  }

  /* -------------------------------------------- */

  /**
   * Entry key of the item being edited.
   * @type {string}
   */
  get entryKey() {
    return this.options.entryKey;
  }

  /* -------------------------------------------- */

  /**
   * Callback receiving the shop update.
   * @type {(updateData: object) => Promise<void>}
   */
  get onUpdate() {
    return this.options.onUpdate;
  }

  /* -------------------------------------------- */

  /**
   * The shop editor this config belongs to.
   * @type {ShopSheet}
   */
  get shopSheet() {
    return this.options.shopSheet;
  }

  /* -------------------------------------------- */

  /** @override */
  _canRender(options) {
    if ( this.rendered && this.entryKey && !this.entry ) {
      this.close();
      return false;
    }
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.legend = this.options.window?.title;
    context.fields = this.options.fields ?? [];
    return context;
  }
}
