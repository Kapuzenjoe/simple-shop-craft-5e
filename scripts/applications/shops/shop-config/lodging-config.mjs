import { LODGING_TIERS } from "../../../config.mjs";
import { LodgingBlueprint } from "../../../data/lodging-blueprint.mjs";
import { ShopItemEntry } from "../../../data/shop-data.mjs";
import { currencyValueField } from "../../../utils.mjs";
import BaseShopConfig from "./base-shop-config.mjs";

/**
 * Dialog to edit a lodging entry's tier, name, price, icon, and description. Autosaves on every change.
 */
export default class LodgingConfig extends BaseShopConfig {
  /** @override */
  static DEFAULT_OPTIONS = {
    id: "lodging-config-{id}",
    window: { title: "SIMPLE_SHOP_CRAFT_5E.ShopEditor.EditLodging" },
    position: { width: 400 },
    form: { handler: LodgingConfig.#onSubmit }
  };

  /* -------------------------------------------- */

  /** @override */
  static PARTS = {
    content: { template: "modules/simple-shop-craft-5e/templates/shops/shop-config/lodging-config/content.hbs" }
  };

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const entry = this.entry;
    context.imgField = LodgingBlueprint.schema.fields.img;
    context.img = entry.lodging.img;
    context.description = entry.lodging.description;
    const tierConfig = LODGING_TIERS[entry.lodging.tier];
    context.fields = [
      {
        field: LodgingBlueprint.schema.fields.tier, name: "tier", value: entry.lodging.tier,
        label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.LodgingTier"),
        options: Object.entries(LODGING_TIERS).map(([value, { label }]) => ({ value, label: _loc(label) }))
      },
      {
        field: LodgingBlueprint.schema.fields.name, name: "name", value: entry.lodging.name,
        label: _loc("DOCUMENT.FIELDS.name.label"), placeholder: _loc(tierConfig.label)
      },
      currencyValueField({
        label: _loc("DND5E.Price"), field: ShopItemEntry.schema.fields.price,
        valueName: "value", value: entry.price?.value, placeholder: tierConfig.price.value,
        denominationName: "denomination", denomination: entry.price?.denomination ?? tierConfig.price.denomination
      })
    ];
    return context;
  }

  /* -------------------------------------------- */

  /**
   * Handle persisting the edited lodging entry.
   * @this {LodgingConfig}
   * @param {Event} event                Triggering submit event.
   * @param {HTMLFormElement} form       The submitted form.
   * @param {FormDataExtended} formData  Data from the form.
   * @returns {Promise<void>}
   */
  static async #onSubmit(event, form, formData) {
    const data = foundry.utils.expandObject(formData.object);
    const tier = data.tier || this.entry.lodging.tier;
    const tierConfig = LODGING_TIERS[tier];
    const items = this.shopSheet.shop.items.map(i => {
      if ( i._id !== this.entryKey ) return i.toObject();
      return {
        ...i.toObject(),
        lodging: {
          tier, name: data.name || "", description: data.description || "",
          img: data.img || "icons/svg/house.svg"
        },
        price: { value: data.value ?? null, denomination: data.denomination ?? tierConfig.price.denomination }
      };
    });
    await this.onUpdate({ items });
    if ( ["tier", "img"].includes(event.target?.name) ) this.render({ parts: ["content"] });
  }
}
