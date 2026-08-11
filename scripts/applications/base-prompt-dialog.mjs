const { Dialog5e } = game.dnd5e.applications.api;

/**
 * Base class for the module's confirm/prompt dialogs.
 */
export default class BasePromptDialog extends Dialog5e {
  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["simple-shop-craft-5e", "standard-form"],
    position: { width: 400 }
  };

  /* -------------------------------------------- */

  /** @inheritDoc */
  static PARTS = {
    ...super.PARTS,
    content: {
      template: "modules/simple-shop-craft-5e/templates/partials/config-dialog-content.hbs"
    }
  };

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _onRender(context, options) {
    await super._onRender(context, options);
    this.options.onRender?.(this);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareContentContext(context, options) {
    context = await super._prepareContentContext(context, options);
    context.hint = this.options.hint;
    context.fields = (this.options.fields instanceof Function) ? this.options.fields() : (this.options.fields ?? []);
    context.extraContent = (this.options.extraContent instanceof Function)
      ? await this.options.extraContent() : (this.options.extraContent ?? "");
    return context;
  }

  /* -------------------------------------------- */

  /** @override */
  async _prepareFooterContext(context, options) {
    const buttons = (this.options.buttons instanceof Function) ? this.options.buttons() : (this.options.buttons ?? []);
    context.buttons = buttons.map(button => ({ ...button, cssClass: button.class }));
    return context;
  }
}
