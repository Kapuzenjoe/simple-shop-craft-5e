const { Application5e } = game.dnd5e.applications.api;

/**
 * Base class for the module's autosave config dialogs.
 */
export default class BaseConfigDialog extends Application5e {
  constructor(options={}) {
    super(options);
    this.#formState = { ...options.state };
  }

  /* -------------------------------------------- */

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

  /**
   * State derived from the form's last change, available to a `fields`/`extraContent` function.
   * @type {object}
   */
  #formState;

  /* -------------------------------------------- */

  get formState() {
    return this.#formState;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onChangeForm(formConfig, event) {
    super._onChangeForm(formConfig, event);
    if ( this.options.autoRerender === false ) return;
    if ( !(this.options.fields instanceof Function) && !(this.options.extraContent instanceof Function) ) return;
    const formData = new foundry.applications.ux.FormDataExtended(this.form);
    foundry.utils.mergeObject(this.#formState, formData.object);
    this.render({ parts: ["content"] });
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _onRender(context, options) {
    await super._onRender(context, options);
    this.options.onRender?.(this);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.hint = this.options.hint;
    context.fields = (this.options.fields instanceof Function)
      ? this.options.fields(this.#formState) : (this.options.fields ?? []);
    context.extraContent = (this.options.extraContent instanceof Function)
      ? await this.options.extraContent(this.#formState) : (this.options.extraContent ?? "");
    return context;
  }

  /* -------------------------------------------- */

  set formState(value) {
    this.#formState = value;
  }
}
