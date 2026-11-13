import { HIRELING_TYPES } from "../../../config.mjs";
import { HirelingBlueprint } from "../../../data/hireling-blueprint.mjs";
import ItemConfig from "./item-config.mjs";

/**
 * Dialog to edit a hireling entry's type, name, icon, description, and optional linked actor besides its item
 * settings. Autosaves on every change.
 */
export default class HirelingConfig extends ItemConfig {
  /** @override */
  static DEFAULT_OPTIONS = {
    id: "hireling-config-{id}",
    window: { title: "SIMPLE_SHOP_CRAFT_5E.ShopEditor.EditHireling" },
    position: { width: 400 }
  };

  /* -------------------------------------------- */

  /** @override */
  static PARTS = {
    content: { template: "modules/simple-shop-craft-5e/templates/shops/shop-config/hireling-config/content.hbs" },
    ...ItemConfig.PARTS
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
    const typeConfig = HIRELING_TYPES[entry.hireling.type] ?? Object.values(HIRELING_TYPES)[0];
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
      }
    ];
    return context;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _getEntryUpdate(data, entry) {
    return {
      ...super._getEntryUpdate(data, entry),
      hireling: {
        type: data.type || entry.hireling.type, name: data.name || "", description: data.description || "",
        img: data.img || "", actorUuid: data.actorUuid || ""
      }
    };
  }
}
