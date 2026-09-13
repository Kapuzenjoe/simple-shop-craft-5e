import { createSpellScroll } from "../utils.mjs";

const { DocumentUUIDField, FilePathField, StringField } = foundry.data.fields;

/**
 * @import { SpellScrollBlueprintData } from "../_types.mjs";
 */

/**
 * A data model that represents a shop entry's spell-scroll blueprint — a spell synthesized fresh into a
 * non-persisted scroll Item on resolve, with a unique per-level, per-spell identifier.
 * @extends {foundry.abstract.DataModel<SpellScrollBlueprintData>}
 * @mixes SpellScrollBlueprintData
 */
export class SpellScrollBlueprint extends foundry.abstract.DataModel {

  /** @override */
  static defineSchema() {
    return {
      spellUuid: new DocumentUUIDField({ type: "Item", blank: true }),
      img: new FilePathField({ categories: ["IMAGE"], blank: true }),
      identifier: new StringField({ blank: true })
    };
  }

  /* -------------------------------------------- */

  /**
   * Resolve this blueprint into a synthesized, non-persisted scroll Item — with a unique per-level, per-spell
   * `system.identifier` in place of the template's shared generic one.
   * @returns {Promise<Item5e|null>}
   */
  async resolve() {
    const spell = await fromUuid(this.spellUuid);
    if ( !spell ) return null;
    const scroll = await createSpellScroll(spell);
    if ( this.img ) scroll.updateSource({ img: this.img });
    if ( this.identifier ) scroll.updateSource({ "system.identifier": this.identifier });
    return scroll;
  }
}
