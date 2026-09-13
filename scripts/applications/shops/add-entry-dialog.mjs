import { ShopItemEntry } from "../../data/shop-data.mjs";
import { isDefaultIdentifier } from "../../utils.mjs";

const { Dialog5e } = game.dnd5e.applications.api;

/**
 * Dialog to choose how a new shop entry should be added.
 * @param {object} options
 * @param {{ value: string, icon: string, label: string }[]} options.methods
 * @param {boolean} [options.isService]  Whether this entry is for the Services tab — skips the "no distinct
 *   identifier" warning for UUID entries, since services never match/stack against owned items.
 * @param {(method: string, uuid: string) => Promise<void>} options.onSubmit
 */
export default class AddEntryDialog extends Dialog5e {
  constructor({ methods, isService=false, onSubmit, ...options }={}) {
    super(options);
    this.methods = methods;
    this.isService = isService;
    this.onSubmit = onSubmit;
    this.#method = methods[0]?.value;
    this.#uuid = "";
  }

  /* -------------------------------------------- */

  /** @override */
  static DEFAULT_OPTIONS = {
    id: "add-entry-dialog-{id}",
    classes: ["simple-shop-craft-5e", "add-entry-dialog", "standard-form"],
    position: { width: 400 },
    buttons: [
      { action: "add", label: "DND5E.Add", icon: "fas fa-check", default: true }
    ],
    form: { handler: AddEntryDialog.#onSubmit }
  };

  /* -------------------------------------------- */

  /** @override */
  static PARTS = {
    ...super.PARTS,
    content: { template: "modules/simple-shop-craft-5e/templates/shops/add-entry-dialog/content.hbs" }
  };

  /* -------------------------------------------- */

  /**
   * The methods offered by this dialog.
   * @type {{ value: string, icon: string, label: string }[]}
   */
  methods;

  /* -------------------------------------------- */

  /**
   * Whether this entry is for the Services tab.
   * @type {boolean}
   */
  isService;

  /* -------------------------------------------- */

  /**
   * Callback receiving the chosen method and, for "uuid", the picked item UUID.
   * @type {(method: string, uuid: string) => Promise<void>}
   */
  onSubmit;

  /* -------------------------------------------- */

  /**
   * Currently selected method, toggled live to show/hide the UUID field.
   * @type {string}
   */
  #method;

  /* -------------------------------------------- */

  /**
   * UUID as last edited, preserved across method switches.
   * @type {string}
   */
  #uuid;

  /* -------------------------------------------- */

  /**
   * Whether the currently entered UUID resolves to an item with no distinct identifier.
   * @type {boolean}
   */
  #uuidWarning = false;

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareContentContext(context, options) {
    context = await super._prepareContentContext(context, options);
    context.methods = this.methods.map(m => ({
      ...m, selected: this.#method === m.value, isUuid: m.value === "uuid"
    }));
    context.showUuidField = this.#method === "uuid";
    if ( context.showUuidField ) {
      context.uuidField = [
        {
          field: ShopItemEntry.schema.fields.uuid, name: "uuid", value: this.#uuid,
          label: _loc("SIMPLE_SHOP_CRAFT_5E.RECIPE.FIELDS.targetItem.uuid.label"),
          hint: this.#uuidWarning ? _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.NoIdentifierWarning") : undefined
        }
      ];
    }
    return context;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onChangeForm(formConfig, event) {
    super._onChangeForm(formConfig, event);
    if ( event.target.name === "uuid" ) {
      const formData = new foundry.applications.ux.FormDataExtended(this.form);
      this.#uuid = formData.object.uuid ?? "";
      this.#refreshUuidWarning();
      return;
    }
    if ( event.target.name !== "method" ) return;
    this.#method = event.target.value;
    this.render({ parts: ["content"] });
  }

  /* -------------------------------------------- */

  /**
   * Re-resolve the current UUID and refresh the "no distinct identifier" warning.
   * @returns {Promise<void>}
   */
  async #refreshUuidWarning() {
    if ( this.isService ) return;
    const item = this.#uuid ? await fromUuid(this.#uuid) : null;
    this.#uuidWarning = !!item && isDefaultIdentifier(item);
    this.render({ parts: ["content"] });
  }

  /* -------------------------------------------- */

  /**
   * Handle confirming the chosen method.
   * @this {AddEntryDialog}
   * @param {Event} event                Triggering submit event.
   * @param {HTMLFormElement} form       The submitted form.
   * @param {FormDataExtended} formData  Data from the form.
   * @returns {Promise<void>}
   */
  static async #onSubmit(event, form, formData) {
    const data = foundry.utils.expandObject(formData.object);
    if ( (data.method === "uuid") && !data.uuid ) {
      throw new Error(_loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.MissingUuid"));
    }
    await this.onSubmit(data.method, data.uuid);
    await this.close();
  }
}
