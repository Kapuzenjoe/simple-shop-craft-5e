import { MODULE_ID } from "../../config.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Base class for the module's settings menus — reads and writes registered settings generically through
 * Foundry's own generic form templates, grouped into fieldsets declared per subclass.
 */
export default class BaseSettingsConfig extends HandlebarsApplicationMixin(ApplicationV2) {

  /** @override */
  static DEFAULT_OPTIONS = {
    tag: "form",
    classes: ["simple-shop-craft-5e"],
    form: {
      closeOnSubmit: true,
      handler: BaseSettingsConfig.#onSubmit
    },
    position: { width: 600 },
    window: { contentClasses: ["standard-form"] }
  };

  /* -------------------------------------------- */

  /**
   * Setting keys grouped into fieldsets, in declaration order.
   * @type {{ legend: string, keys: string[] }[]}
   */
  static FIELDSETS = [];

  /* -------------------------------------------- */

  /** @override */
  static PARTS = {
    form: { scrollable: [""], template: "templates/generic/form-fields.hbs" },
    footer: { template: "templates/generic/form-footer.hbs" }
  };

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.buttons = [{ icon: "fa-solid fa-floppy-disk", label: "SETTINGS.Save", type: "submit" }];
    context.fields = this.constructor.FIELDSETS.map(({ legend, keys }) => ({
      legend, fieldset: true, fields: keys.map(key => this.#settingField(key)).filter(Boolean)
    })).filter(group => group.fields.length);
    return context;
  }

  /* -------------------------------------------- */

  /**
   * Resolve a registered setting into a form-field entry. Each setting owns a dedicated field instance
   * (never shared with a document schema), so setting its name/label/hint here is safe.
   * @param {string} key
   * @returns {{ field: foundry.data.fields.DataField, value: * }|null}
   */
  #settingField(key) {
    const setting = game.settings.settings.get(`${MODULE_ID}.${key}`);
    if ( !(setting?.type instanceof foundry.data.fields.DataField) ) return null;
    const field = setting.type;
    field.name = setting.id;
    field.label ||= setting.name;
    field.hint ||= setting.hint ?? "";
    return { field, value: game.settings.get(MODULE_ID, key) };
  }

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers                */
  /* -------------------------------------------- */

  /**
   * Persist every changed setting from the submitted form, prompting a reload if any changed setting
   * requires one.
   * @param {SubmitEvent} event
   * @param {HTMLFormElement} form
   * @param {FormDataExtended} formData
   * @returns {Promise<void>}
   */
  static async #onSubmit(event, form, formData) {
    let requiresClientReload = false;
    let requiresWorldReload = false;
    for ( const [id, value] of Object.entries(formData.object) ) {
      const setting = game.settings.settings.get(id);
      if ( !setting ) continue;
      const prior = game.settings.get(setting.namespace, setting.key);
      await game.settings.set(setting.namespace, setting.key, value);
      if ( setting.requiresReload && !foundry.utils.objectsEqual(prior, value) ) {
        requiresClientReload ||= setting.scope !== "world";
        requiresWorldReload ||= setting.scope === "world";
      }
    }
    if ( requiresClientReload || requiresWorldReload ) {
      return foundry.applications.settings.SettingsConfig.reloadConfirm({ world: requiresWorldReload });
    }
  }
}
