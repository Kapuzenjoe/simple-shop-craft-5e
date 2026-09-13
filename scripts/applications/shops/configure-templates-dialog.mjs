import { EnchantedItemBlueprint } from "../../data/enchanted-item-blueprint.mjs";

const { Dialog5e } = game.dnd5e.applications.api;

/**
 * Dialog to configure Spell Scroll and Enchant-item templates picked via the Compendium Browser into
 * concrete `spellScroll`/`generated` blueprints.
 * @param {object} options
 * @param {{ kind: "spellScroll"|"enchant", item: Item5e }[]} options.templates
 * @param {boolean} options.isService
 * @param {(entries: object[]) => Promise<void>} options.onSubmit
 */
export default class ConfigureTemplatesDialog extends Dialog5e {
  constructor({ templates, isService, onSubmit, ...options }={}) {
    super(options);
    this.isService = isService;
    this.onSubmit = onSubmit;
    this.#rows = templates.map(t => (t.kind === "spellScroll")
      ? { kind: "spellScroll", item: t.item, spell: null }
      : {
        kind: "enchant", item: t.item,
        profiles: EnchantedItemBlueprint.getEnchantmentProfiles(t.item)
          .filter(p => EnchantedItemBlueprint.resolveProfileRarity(t.item, p.effect) !== "artifact"),
        profileIndex: 0, candidates: null, baseItem: null
      });
  }

  /* -------------------------------------------- */

  /** @override */
  static DEFAULT_OPTIONS = {
    id: "configure-templates-dialog-{id}",
    classes: ["simple-shop-craft-5e", "configure-templates-dialog", "standard-form"],
    window: { title: "SIMPLE_SHOP_CRAFT_5E.ShopEditor.ConfigureTemplates" },
    position: { width: 480 },
    actions: {
      pickSpell: ConfigureTemplatesDialog.#pickSpell,
      pickBaseItem: ConfigureTemplatesDialog.#pickBaseItem,
      changeProfile: ConfigureTemplatesDialog.#changeProfile
    },
    form: { handler: ConfigureTemplatesDialog.#onSubmit }
  };

  /* -------------------------------------------- */

  /** @override */
  static PARTS = {
    ...super.PARTS,
    content: { template: "modules/simple-shop-craft-5e/templates/shops/configure-templates-dialog/content.hbs" }
  };

  /* -------------------------------------------- */

  /**
   * Whether the resulting entries are for the Services tab.
   * @type {boolean}
   */
  isService;

  /* -------------------------------------------- */

  /**
   * Callback receiving the configured `generated`/`spellScroll` entries.
   * @type {(entries: object[]) => Promise<void>}
   */
  onSubmit;

  /* -------------------------------------------- */

  /**
   * Per-template working state.
   * @type {object[]}
   */
  #rows;

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _onFirstRender(context, options) {
    await super._onFirstRender(context, options);
    for ( const row of this.#rows ) {
      if ( row.kind === "enchant" ) await this.#resolveRowCandidates(row);
    }
    this.render({ parts: ["content", "footer"] });
  }

  /* -------------------------------------------- */

  /**
   * Resolve and cache the base-item candidates for a row's currently selected profile.
   * @param {object} row
   * @returns {Promise<void>}
   */
  async #resolveRowCandidates(row) {
    const { activity } = row.profiles[row.profileIndex];
    row.candidates = await EnchantedItemBlueprint.resolveBaseItemCandidates(activity);
    row.baseItem = null;
  }

  /* -------------------------------------------- */

  /**
   * Whether every row has a complete pick.
   * @returns {boolean}
   */
  #isComplete() {
    return this.#rows.every(row => (row.kind === "spellScroll")
      ? !!row.spell
      : !!row.candidates?.explicit || !!row.baseItem);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareContentContext(context, options) {
    context = await super._prepareContentContext(context, options);
    context.rows = this.#rows.map((row, index) => ({
      index, kind: row.kind, itemName: row.item.name, itemImg: row.item.img,
      spellImg: row.spell?.img ?? "icons/svg/hazard.svg",
      spellName: row.spell?.name ?? _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.NoSpellPicked"),
      hasMultipleProfiles: (row.kind === "enchant") && (row.profiles.length > 1),
      profileOptions: (row.kind === "enchant")
        ? row.profiles.map((p, i) => ({ value: i, label: p.effect.name })) : null,
      profileIndex: row.profileIndex,
      baseItemOptions: (row.kind === "enchant") && row.candidates?.explicit
        ? row.candidates.explicit.map(item => ({ value: item.uuid, label: item.name })) : null,
      baseItemImg: row.baseItem?.img ?? "icons/svg/hazard.svg",
      baseItemName: row.baseItem?.name ?? _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.NoBaseItemPicked")
    }));
    return context;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareFooterContext(context, options) {
    context = await super._prepareFooterContext(context, options);
    context.buttons = [{ action: "add", label: "DND5E.Add", icon: "fas fa-check", disabled: !this.#isComplete() }];
    return context;
  }

  /* -------------------------------------------- */

  /**
   * Handle picking a spell for a Spell Scroll row.
   * @this {ConfigureTemplatesDialog}
   * @param {Event} event
   * @param {HTMLElement} target
   */
  static async #pickSpell(event, target) {
    const row = this.#rows[target.dataset.row];
    const uuid = await game.dnd5e.applications.CompendiumBrowser.selectOne({ tab: "spells" });
    if ( uuid ) row.spell = await fromUuid(uuid);
    this.render({ parts: ["content", "footer"] });
  }

  /* -------------------------------------------- */

  /**
   * Handle changing an Enchant row's rarity profile.
   * @this {ConfigureTemplatesDialog}
   * @param {Event} event
   * @param {HTMLElement} target
   */
  static async #changeProfile(event, target) {
    const row = this.#rows[target.dataset.row];
    row.profileIndex = Number(target.value);
    await this.#resolveRowCandidates(row);
    this.render({ parts: ["content", "footer"] });
  }

  /* -------------------------------------------- */

  /**
   * Handle picking a base item for an Enchant row.
   * @this {ConfigureTemplatesDialog}
   * @param {Event} event
   * @param {HTMLElement} target
   */
  static async #pickBaseItem(event, target) {
    const row = this.#rows[target.dataset.row];
    const { activity } = row.profiles[row.profileIndex];
    const { types, filters } = row.candidates;
    const uuid = await game.dnd5e.applications.CompendiumBrowser.selectOne({
      tab: "physical", filters: { locked: { types, arbitrary: filters } }
    });
    const picked = uuid ? await fromUuid(uuid) : null;
    if ( picked && (activity.canEnchant(picked) !== true) ) {
      ui.notifications.warn("SIMPLE_SHOP_CRAFT_5E.ShopEditor.InvalidBaseItem", { localize: true });
    } else if ( picked ) {
      row.baseItem = picked;
    }
    this.render({ parts: ["content", "footer"] });
  }

  /* -------------------------------------------- */

  /**
   * Handle building the configured `generated`/`spellScroll` entries.
   * @this {ConfigureTemplatesDialog}
   * @param {Event} event                Triggering submit event.
   * @param {HTMLFormElement} form       The submitted form.
   * @param {FormDataExtended} formData  Data from the form.
   * @returns {Promise<void>}
   */
  static async #onSubmit(event, form, formData) {
    const data = foundry.utils.expandObject(formData.object);
    const entries = this.#rows.map((row, index) => {
      const shared = { isService: this.isService, stock: { max: null, current: 1 }, restockMode: "exclude" };
      if ( row.kind === "spellScroll" ) return { ...shared, spellScroll: { spellUuid: row.spell.uuid } };
      const baseItemUuid = row.candidates.explicit ? data[`baseItem-${index}`] : row.baseItem.uuid;
      const { effect } = row.profiles[row.profileIndex];
      return {
        ...shared,
        generated: { baseItemUuid, enchantItemUuid: row.item.uuid, effectId: effect.id }
      };
    });
    await this.onSubmit(entries);
    await this.close();
  }
}
