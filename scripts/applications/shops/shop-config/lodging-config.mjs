import { LODGING_TIERS } from "../../../config.mjs";
import { LodgingBlueprint } from "../../../data/lodging-blueprint.mjs";
import ItemConfig from "./item-config.mjs";

/**
 * Dialog to edit a lodging entry's tier, name, icon, and description besides its item settings. Autosaves on every
 * change.
 */
export default class LodgingConfig extends ItemConfig {
  /** @override */
  static DEFAULT_OPTIONS = {
    id: "lodging-config-{id}",
    window: { title: "SIMPLE_SHOP_CRAFT_5E.ShopEditor.EditLodging" },
    position: { width: 400 }
  };

  /* -------------------------------------------- */

  /** @override */
  static PARTS = {
    content: { template: "modules/simple-shop-craft-5e/templates/shops/shop-config/lodging-config/content.hbs" },
    ...ItemConfig.PARTS
  };

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const entry = this.entry;
    context.imgField = LodgingBlueprint.schema.fields.img;
    context.img = entry.lodging.img;
    context.description = entry.lodging.description;
    const tierConfig = LODGING_TIERS[entry.lodging.tier] ?? Object.values(LODGING_TIERS)[0];
    context.fields = [
      {
        field: LodgingBlueprint.schema.fields.tier, name: "tier", value: entry.lodging.tier,
        label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.LodgingTier"),
        options: Object.entries(LODGING_TIERS).map(([value, { label }]) => ({ value, label: _loc(label) }))
      },
      {
        field: LodgingBlueprint.schema.fields.name, name: "name", value: entry.lodging.name,
        label: _loc("DOCUMENT.FIELDS.name.label"), placeholder: _loc(tierConfig.label)
      }
    ];
    return context;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _getEntryUpdate(data, entry) {
    return {
      ...super._getEntryUpdate(data, entry),
      lodging: {
        tier: data.tier || entry.lodging.tier, name: data.name || "", description: data.description || "",
        img: data.img || "icons/svg/house.svg"
      }
    };
  }
}
