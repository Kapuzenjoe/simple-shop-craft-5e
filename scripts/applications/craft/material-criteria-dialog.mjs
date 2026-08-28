import { RecipeMaterial } from "../../data/recipe-data.mjs";
import { getCurrencyOptions, subtypeOptions } from "../../utils.mjs";

const { Dialog5e } = game.dnd5e.applications.api;

/**
 * Dialog to define a type/subtype/value rule for a recipe's material slot, in place of a fixed item reference.
 * @param {object} options
 * @param {(result: { type: string, subtype: string, value: object }) => Promise<void>} options.onSubmit
 */
export default class MaterialCriteriaDialog extends Dialog5e {
  constructor({ onSubmit, ...options }={}) {
    super(options);
    this.onSubmit = onSubmit;
  }

  /* -------------------------------------------- */

  /** @override */
  static DEFAULT_OPTIONS = {
    id: "material-criteria-dialog-{id}",
    classes: ["simple-shop-craft-5e", "material-criteria-dialog", "standard-form"],
    window: { title: "SIMPLE_SHOP_CRAFT_5E.RecipeEditor.MaterialCriteriaTitle" },
    position: { width: 400 },
    buttons: [
      { action: "add", label: "SIMPLE_SHOP_CRAFT_5E.RecipeEditor.AddMaterialCriteria", icon: "fas fa-plus", default: true }
    ],
    form: { handler: MaterialCriteriaDialog.#onSubmit },
    onSubmit: null
  };

  /** @override */
  static PARTS = {
    ...super.PARTS,
    content: { template: "modules/simple-shop-craft-5e/templates/partials/config-dialog-content.hbs" }
  };

  /**
   * Callback receiving the finished criteria.
   * @type {(result: { type: string, subtype: string, value: object }) => Promise<void>}
   */
  onSubmit;

  /* -------------------------------------------- */

  /**
   * Selected item type, or null before a choice is made.
   * @type {string|null}
   */
  #type = null;

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareContentContext(context, options) {
    context = await super._prepareContentContext(context, options);
    context.legend = this.options.window?.title;
    const typeOptions = Object.keys(CONFIG.Item.dataModels)
      .filter(type => CONFIG.Item.dataModels[type]?.inventorySection)
      .map(type => ({ value: type, label: _loc(`TYPES.Item.${type}Pl`) }));
    const subtypes = this.#type ? subtypeOptions([this.#type]) : [];
    context.fields = [
      {
        field: new foundry.data.fields.StringField(), name: "type", value: this.#type ?? "",
        label: _loc("SIMPLE_SHOP_CRAFT_5E.RecipeEditor.MaterialCriteriaType"),
        options: [
          { value: "", label: _loc("SIMPLE_SHOP_CRAFT_5E.RecipeEditor.MaterialCriteriaChooseType") }, ...typeOptions
        ]
      },
      ...(subtypes.length ? [{
        field: new foundry.data.fields.StringField(), name: "subtype",
        label: _loc("SIMPLE_SHOP_CRAFT_5E.RecipeEditor.MaterialCriteriaSubtype"),
        options: [{ value: "", label: _loc("SIMPLE_SHOP_CRAFT_5E.RecipeEditor.MaterialCriteriaAny") }, ...subtypes]
      }] : []),
      {
        field: RecipeMaterial.schema.fields.value.fields.value, name: "value",
        label: _loc("DND5E.Price")
      },
      {
        field: RecipeMaterial.schema.fields.value.fields.denomination, name: "denomination",
        value: CONFIG.DND5E.defaultCurrency, label: _loc("DND5E.Currency"), options: getCurrencyOptions()
      }
    ];
    return context;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _onRender(context, options) {
    await super._onRender(context, options);
    this.element.querySelector('select[name="type"]')?.addEventListener("change", event => {
      this.#type = event.target.value || null;
      this.render({ parts: ["content"] });
    });
  }

  /* -------------------------------------------- */

  /**
   * Handle submitting the finished material criteria.
   * @this {MaterialCriteriaDialog}
   * @param {Event} event                Triggering submit event.
   * @param {HTMLFormElement} form       The submitted form.
   * @param {FormDataExtended} formData  Data from the form.
   * @returns {Promise<void>}
   */
  static async #onSubmit(event, form, formData) {
    const data = foundry.utils.expandObject(formData.object);
    if ( !data.type ) {
      ui.notifications.warn("SIMPLE_SHOP_CRAFT_5E.RecipeEditor.MaterialCriteriaTypeRequired", { localize: true });
      return;
    }
    const value = { value: data.value ?? null, denomination: data.denomination };
    await this.onSubmit({ type: data.type, subtype: data.subtype || "", value });
  }
}
