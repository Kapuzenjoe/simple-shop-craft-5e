import { Shop } from "../../../data/shop-data.mjs";
import BaseShopConfig from "./base-shop-config.mjs";

/**
 * Dialog to edit a shop's owner.
 */
export default class OwnerConfig extends BaseShopConfig {
  /** @override */
  static DEFAULT_OPTIONS = {
    id: "owner-config-{id}",
    window: { title: "SIMPLE_SHOP_CRAFT_5E.Owner" },
    form: { handler: OwnerConfig.#onSubmit }
  };

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const { shop } = this.shopSheet;
    context.fields = [
      {
        field: Shop.schema.fields.npcName, name: "npcName", value: shop.npcName,
        label: _loc("DOCUMENT.FIELDS.name.label")
      },
      {
        field: Shop.schema.fields.npc, name: "npc", value: shop.npc ?? "", label: _loc("DOCUMENT.Actor")
      }
    ];
    return context;
  }

  /* -------------------------------------------- */

  /**
   * Handle persisting the new owner.
   * @this {OwnerConfig}
   * @param {Event} event                Triggering submit event.
   * @param {HTMLFormElement} form       The submitted form.
   * @param {FormDataExtended} formData  Data from the form.
   * @returns {Promise<void>}
   */
  static async #onSubmit(event, form, formData) {
    const data = foundry.utils.expandObject(formData.object);
    await this.onUpdate({ npcName: data.npcName || "", npc: data.npc || null });
  }
}
