import { HIRELING_ITEM_TYPE, HIRELING_TYPES } from "../config.mjs";

const { DocumentUUIDField, FilePathField, HTMLField, StringField } = foundry.data.fields;

/**
 * @import { HirelingBlueprintData } from "../_types.mjs";
 */

/**
 * A data model that represents a shop entry's hireling blueprint — a service with no backing dnd5e Item,
 * synthesized fresh into a display-only item on resolve from its type's default price.
 * @extends {foundry.abstract.DataModel<HirelingBlueprintData>}
 * @mixes HirelingBlueprintData
 */
export class HirelingBlueprint extends foundry.abstract.DataModel {

  /** @override */
  static defineSchema() {
    return {
      type: new StringField({ blank: true, choices: Object.keys(HIRELING_TYPES) }),
      name: new StringField({ blank: true }),
      description: new HTMLField(),
      img: new FilePathField({ categories: ["IMAGE"], blank: true }),
      actorUuid: new DocumentUUIDField({ type: "Actor", blank: true })
    };
  }

  /* -------------------------------------------- */

  /**
   * Resolve this blueprint into a synthesized display item. Falls back to the linked actor's own image,
   * then Foundry's generic unknown-actor icon, when no custom icon is set.
   * @returns {Promise<{ name: string, img: string, type: string, system: object }>}
   */
  async resolve() {
    const typeConfig = HIRELING_TYPES[this.type];
    const actor = this.actorUuid ? await fromUuid(this.actorUuid) : null;
    return {
      name: this.name || _loc(typeConfig?.label ?? ""),
      img: this.img || actor?.img || CONST.DEFAULT_TOKEN,
      type: HIRELING_ITEM_TYPE,
      system: { price: typeConfig?.price ?? null, description: { value: this.description } }
    };
  }
}
