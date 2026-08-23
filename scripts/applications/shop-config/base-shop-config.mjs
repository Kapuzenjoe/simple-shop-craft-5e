const { Application5e } = game.dnd5e.applications.api;

/**
 * Base class for the module's autosave config dialogs.
 */
export default class BaseShopConfig extends Application5e {
  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["simple-shop-craft-5e", "config-sheet", "standard-form"],
    tag: "form",
    form: {
      submitOnChange: true,
      closeOnSubmit: false
    },
    position: {
      width: 400
    }
  };

  /* -------------------------------------------- */

  /** @override */
  static PARTS = {
    content: {
      template: "modules/simple-shop-craft-5e/templates/partials/config-dialog-content.hbs"
    }
  };

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.legend = this.options.window?.title;
    context.fields = this.options.fields ?? [];
    return context;
  }
}
