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

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const entry = this.entry;
    const actor = entry.hireling.actorUuid ? await fromUuid(entry.hireling.actorUuid) : null;
    context.imgField = HirelingBlueprint.schema.fields.img;
    context.img = entry.hireling.img;
    context.previewImg = entry.hireling.img || actor?.img || CONST.DEFAULT_TOKEN;
    context.description = entry.hireling.description;
    const typeConfig = HIRELING_TYPES[entry.hireling.type];
    context.fields = [
      {
        field: HirelingBlueprint.schema.fields.type, name: "type", value: entry.hireling.type,
        label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.HirelingType"),
        options: Object.entries(HIRELING_TYPES).map(([value, { label }]) => ({ value, label: _loc(label) }))
      },
      {
        field: HirelingBlueprint.schema.fields.name, name: "name", value: entry.hireling.name,
        label: _loc("DOCUMENT.FIELDS.name.label"), placeholder: _loc(typeConfig.label)
      },
      {
        field: HirelingBlueprint.schema.fields.actorUuid, name: "actorUuid", value: entry.hireling.actorUuid,
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
    const type = data.type || this.entry.hireling.type;
    const typeConfig = HIRELING_TYPES[type];
    const items = this.shopSheet.shop.items.map(i => {
      if ( i._id !== this.entryKey ) return i.toObject();
      return {
        ...i.toObject(),
        hireling: {
          type, name: data.name || "", description: data.description || "",
          img: data.img || "", actorUuid: data.actorUuid || ""
        },
        price: { value: data.value ?? null, denomination: data.denomination ?? typeConfig.price.denomination }
      };
    });
    await this.onUpdate({ items });
    if ( ["type", "actorUuid", "img"].includes(event.target?.name) ) this.render({ parts: ["content"] });
  }
}
