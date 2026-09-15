import { LODGING_ITEM_TYPE, LODGING_TIERS } from "../config.mjs";

const { FilePathField, HTMLField, StringField } = foundry.data.fields;

/**
 * @import { LodgingBlueprintData } from "../_types.mjs";
 */

/**
 * A data model that represents a shop entry's lodging blueprint — a service with no backing dnd5e Item,
 * synthesized fresh into a display-only item on resolve from its tier's default price.
 * @extends {foundry.abstract.DataModel<LodgingBlueprintData>}
 * @mixes LodgingBlueprintData
 */
export class LodgingBlueprint extends foundry.abstract.DataModel {

  /** @override */
  static defineSchema() {
    return {
      tier: new StringField({ blank: true, choices: Object.keys(LODGING_TIERS) }),
      name: new StringField({ blank: true }),
      description: new HTMLField(),
      img: new FilePathField({ categories: ["IMAGE"], initial: () => "icons/svg/house.svg" })
    };
  }

  /* -------------------------------------------- */

  /**
   * Resolve this blueprint into a synthesized display item.
   * @returns {{ name: string, img: string, type: string, system: object }}
   */
  resolve() {
    const tierConfig = LODGING_TIERS[this.tier];
    return {
      name: this.name || _loc(tierConfig?.label ?? ""), img: this.img, type: LODGING_ITEM_TYPE,
      system: { price: tierConfig?.price ?? null, description: { value: this.description } }
    };
  }
}
