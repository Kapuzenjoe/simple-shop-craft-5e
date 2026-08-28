const { DocumentUUIDField } = foundry.data.fields;

/**
 * A data model that represents a shop entry's spell-scroll blueprint — a spell synthesized fresh into a
 * non-persisted scroll Item on resolve, with a unique per-level, per-spell identifier.
 * @extends {foundry.abstract.DataModel}
 */
export class SpellScrollBlueprint extends foundry.abstract.DataModel {

  /** @override */
  static defineSchema() {
    return {
      spellUuid: new DocumentUUIDField({ type: "Item", blank: true })
    };
  }

  /* -------------------------------------------- */

  /**
   * Resolve this blueprint into a synthesized, non-persisted scroll Item — with a unique per-level, per-spell
   * `system.identifier` in place of the template's shared generic one.
   * @returns {Promise<Item5e|null>}
   */
  async resolve() {
    const scroll = await Item.implementation.createScrollFromCompendiumSpell(this.spellUuid, { dialog: false });
    if ( !scroll ) return null;
    const level = scroll.system.activities?.find(a => a.type === "cast")?.spell?.level ?? 0;
    const spell = await fromUuid(this.spellUuid);
    scroll.updateSource({ "system.identifier": `spell-scroll-${level}-${spell?.system.identifier ?? spell?.id}` });
    return scroll;
  }
}
