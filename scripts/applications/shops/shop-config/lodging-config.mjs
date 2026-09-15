import { LODGING_TIERS } from "../../../config.mjs";
import { LodgingBlueprint } from "../../../data/lodging-blueprint.mjs";
import { ShopItemEntry } from "../../../data/shop-data.mjs";
import { currencyValueField } from "../../../utils.mjs";

import BaseShopConfig from "./base-shop-config.mjs";

/**
 * @import ShopSheet from "../shop-sheet.mjs";
 */

/**
 * Dialog to edit a lodging entry's tier, name, price, icon, and description. Autosaves on every change.
 * @param {object} options
 * @param {ShopSheet} options.shopSheet
 * @param {string} options.entryKey  Entry key of the lodging entry being edited.
 * @param {(updateData: object) => Promise<void>} options.onUpdate
 */
export default class LodgingConfig extends BaseShopConfig {
  constructor({ shopSheet, entryKey, onUpdate, ...options }={}) {
    super(options);
    this.shopSheet = shopSheet;
    this.entryKey = entryKey;
    this.onUpdate = onUpdate;
    this.#tier = this.#entry.lodging.tier;
  }

  /* -------------------------------------------- */

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

  /**
   * The shop editor this config belongs to.
   * @type {ShopSheet}
   */
  shopSheet;

  /* -------------------------------------------- */

  /**
   * Entry key of the lodging entry being edited.
   * @type {string}
   */
  entryKey;

  /* -------------------------------------------- */

  /**
   * Callback receiving the shop update.
   * @type {(updateData: object) => Promise<void>}
   */
  onUpdate;

  /* -------------------------------------------- */

  /**
   * Currently selected tier, toggled live to drive the Name placeholder and Price default.
   * @type {string}
   */
  #tier;

  /* -------------------------------------------- */

  /**
   * The item entry being edited.
   * @type {ShopItemEntry}
   */
  get #entry() {
    return this.shopSheet.shop.items.find(i => ShopItemEntry.key(i) === this.entryKey);
  }

  /* -------------------------------------------- */

  /**
   * @override
   * @see dnd5e — EffectChangeConfig#_canRender()
   */
  _canRender(options) {
    if ( this.rendered && !this.#entry ) {
      this.close();
      return false;
    }
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const entry = this.#entry;
    context.imgField = LodgingBlueprint.schema.fields.img;
    context.img = entry.lodging.img;
    context.description = entry.lodging.description;
    const tierConfig = LODGING_TIERS[this.#tier];
    context.fields = [
      {
        field: LodgingBlueprint.schema.fields.tier, name: "tier", value: this.#tier,
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

  /** @inheritDoc */
  _onChangeForm(formConfig, event) {
    super._onChangeForm(formConfig, event);
    if ( event.target.name === "img" ) {
      const preview = this.element.querySelector(".icon-picker-preview");
      if ( preview ) preview.src = event.target.value || "icons/svg/house.svg";
      return;
    }
    if ( event.target.name !== "tier" ) return;
    this.#tier = event.target.value;
    this.render({ parts: ["content"] });
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
    const tierConfig = LODGING_TIERS[data.tier];
    const items = this.shopSheet.shop.items.map(i => {
      if ( ShopItemEntry.key(i) !== this.entryKey ) return i.toObject();
      return {
        ...i.toObject(),
        lodging: {
          tier: data.tier, name: data.name || "", description: data.description || "",
          img: data.img || "icons/svg/house.svg"
        },
        price: { value: data.value ?? null, denomination: data.denomination ?? tierConfig.price.denomination }
      };
    });
    await this.onUpdate({ items });
  }
}
