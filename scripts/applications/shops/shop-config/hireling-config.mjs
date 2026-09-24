import { HIRELING_TYPES } from "../../../config.mjs";
import { HirelingBlueprint } from "../../../data/hireling-blueprint.mjs";
import { ShopItemEntry } from "../../../data/shop-data.mjs";
import { currencyValueField } from "../../../utils.mjs";
import BaseShopConfig from "./base-shop-config.mjs";

/**
 * Dialog to edit a hireling entry's type, name, price, icon, description, and optional linked actor.
 * Autosaves on every change.
 */
export default class HirelingConfig extends BaseShopConfig {
  constructor(options={}) {
    super(options);
    this.#type = this.entry.hireling.type;
    this.#actorUuid = this.entry.hireling.actorUuid;
  }

  /* -------------------------------------------- */

  /** @override */
  static DEFAULT_OPTIONS = {
    id: "hireling-config-{id}",
    window: { title: "SIMPLE_SHOP_CRAFT_5E.ShopEditor.EditHireling" },
    position: { width: 400 },
    form: { handler: HirelingConfig.#onSubmit }
  };

  /* -------------------------------------------- */

  /** @override */
  static PARTS = {
    content: { template: "modules/simple-shop-craft-5e/templates/shops/shop-config/hireling-config/content.hbs" }
  };

  /* -------------------------------------------- */

  /**
   * Currently selected type, toggled live to drive the Name placeholder and Price default.
   * @type {string}
   */
  #type;

  /* -------------------------------------------- */

  /**
   * Linked actor UUID as last edited, read live to avoid a stale icon fallback before autosave lands.
   * @type {string}
   */
  #actorUuid;

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const entry = this.entry;
    const actor = this.#actorUuid ? await fromUuid(this.#actorUuid) : null;
    context.imgField = HirelingBlueprint.schema.fields.img;
    context.img = entry.hireling.img;
    context.previewImg = entry.hireling.img || actor?.img || CONST.DEFAULT_TOKEN;
    context.description = entry.hireling.description;
    const typeConfig = HIRELING_TYPES[this.#type];
    context.fields = [
      {
        field: HirelingBlueprint.schema.fields.type, name: "type", value: this.#type,
        label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.HirelingType"),
        options: Object.entries(HIRELING_TYPES).map(([value, { label }]) => ({ value, label: _loc(label) }))
      },
      {
        field: HirelingBlueprint.schema.fields.name, name: "name", value: entry.hireling.name,
        label: _loc("DOCUMENT.FIELDS.name.label"), placeholder: _loc(typeConfig.label)
      },
      {
        field: HirelingBlueprint.schema.fields.actorUuid, name: "actorUuid", value: this.#actorUuid,
        label: _loc("DOCUMENT.Actor")
      },
      currencyValueField({
        label: _loc("DND5E.Price"), field: ShopItemEntry.schema.fields.price,
        valueName: "value", value: entry.price?.value, placeholder: typeConfig.price.value,
        denominationName: "denomination", denomination: entry.price?.denomination ?? typeConfig.price.denomination
      })
    ];
    return context;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onChangeForm(formConfig, event) {
    super._onChangeForm(formConfig, event);
    if ( event.target.name === "actorUuid" ) {
      const formData = new foundry.applications.ux.FormDataExtended(this.form);
      this.#actorUuid = formData.object.actorUuid ?? "";
      this.render({ parts: ["content"] });
      return;
    }
    if ( event.target.name === "img" ) {
      this.render({ parts: ["content"] });
      return;
    }
    if ( event.target.name !== "type" ) return;
    this.#type = event.target.value;
    this.render({ parts: ["content"] });
  }

  /* -------------------------------------------- */

  /**
   * Handle persisting the edited hireling entry.
   * @this {HirelingConfig}
   * @param {Event} event                Triggering submit event.
   * @param {HTMLFormElement} form       The submitted form.
   * @param {FormDataExtended} formData  Data from the form.
   * @returns {Promise<void>}
   */
  static async #onSubmit(event, form, formData) {
    const data = foundry.utils.expandObject(formData.object);
    const typeConfig = HIRELING_TYPES[data.type];
    const items = this.shopSheet.shop.items.map(i => {
      if ( ShopItemEntry.key(i) !== this.entryKey ) return i.toObject();
      return {
        ...i.toObject(),
        hireling: {
          type: data.type, name: data.name || "", description: data.description || "",
          img: data.img || "", actorUuid: data.actorUuid || ""
        },
        price: { value: data.value ?? null, denomination: data.denomination ?? typeConfig.price.denomination }
      };
    });
    await this.onUpdate({ items });
  }
}
