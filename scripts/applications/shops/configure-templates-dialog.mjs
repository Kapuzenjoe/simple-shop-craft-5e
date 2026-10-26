import { EnchantedItemBlueprint } from "../../data/enchanted-item-blueprint.mjs";
import GeneratorProfile from "../../data/generator-profile.mjs";
import { createSpellScroll } from "../../utils.mjs";

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
      ? { kind: "spellScroll", item: t.item, spell: null, previewScroll: null, imgOverride: "", identifierOverride: "" }
      : {
        kind: "enchant", item: t.item,
        profiles: EnchantedItemBlueprint.getEnchantmentProfiles(t.item),
        profileIndex: 0, candidates: null, baseItem: null, spell: null, spellOptions: [],
        imgOverride: "", identifierOverride: ""
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
      pickBaseItem: ConfigureTemplatesDialog.#pickBaseItem
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
  /*  Properties                                  */
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
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareContentContext(context, options) {
    context = await super._prepareContentContext(context, options);
    context.imgField = EnchantedItemBlueprint.schema.fields.img;
    context.identifierField = EnchantedItemBlueprint.schema.fields.identifier;
    context.rows = this.#rows.map((row, index) => {
      const pick = (row.kind === "spellScroll")
        ? (row.spell ? { img: row.previewScroll?.img ?? row.spell.img, name: row.spell.name } : null)
        : (row.baseItem ? { img: row.baseItem.img, name: row.baseItem.name } : null);
      const identifierPreview = (row.kind === "spellScroll")
        ? (row.previewScroll?.system.identifier ?? "")
        : (row.baseItem
          ? EnchantedItemBlueprint.resolveIdentifier(
            row.baseItem, row.item, row.profiles[row.profileIndex].effect, row.spell
          )
          : "");
      return {
        index, kind: row.kind, itemName: row.item.name, itemImg: row.item.img,
        needsSpell: isEnspelled(row),
        spellOptions: isEnspelled(row)
          ? row.spellOptions.map(spell => ({
            value: spell.uuid, label: spell.name, selected: spell.uuid === row.spell?.uuid
          })) : null,
        hasMultipleProfiles: (row.kind === "enchant") && (row.profiles.length > 1),
        profileOptions: (row.kind === "enchant")
          ? row.profiles.map((p, i) => ({ value: i, label: p.effect.name })) : null,
        profileIndex: row.profileIndex,
        baseItemOptions: (row.kind === "enchant") && row.candidates?.explicit
          ? row.candidates.explicit.map(item => ({
            value: item.uuid, label: item.name, selected: item.uuid === row.baseItem?.uuid
          })) : null,
        restrictionLabel: (row.kind === "enchant") ? row.candidates?.label : null,
        pick, imgOverride: row.imgOverride, identifierOverride: row.identifierOverride, identifierPreview
      };
    });
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
  /*  Life-Cycle Handlers                         */
  /* -------------------------------------------- */

  /** @inheritDoc */
  async _onFirstRender(context, options) {
    await super._onFirstRender(context, options);
    const enchantRows = this.#rows.filter(row => row.kind === "enchant");
    await Promise.all(enchantRows.map(row => this.#resolveRowCandidates(row)));
    this.render({ parts: ["content", "footer"] });
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onChangeForm(formConfig, event) {
    super._onChangeForm(formConfig, event);
    const [, prefix, index] = event.target.name?.match(/^(img|identifier|baseItem|spell|profile)-(\d+)$/) ?? [];
    if ( !prefix ) return;
    const row = this.#rows[index];
    if ( prefix === "img" ) {
      row.imgOverride = event.target.value;
      this.render({ parts: ["content", "footer"] });
    } else if ( prefix === "identifier" ) row.identifierOverride = event.target.value;
    else if ( prefix === "baseItem" ) {
      row.baseItem = row.candidates.explicit.find(item => item.uuid === event.target.value) ?? null;
      this.render({ parts: ["content", "footer"] });
    } else if ( prefix === "spell" ) {
      fromUuid(event.target.value).then(spell => {
        row.spell = spell;
        this.render({ parts: ["content", "footer"] });
      });
    } else {
      row.profileIndex = Number(event.target.value);
      this.#resolveRowCandidates(row).then(() => this.render({ parts: ["content", "footer"] }));
    }
  }

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers                */
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
    if ( uuid ) {
      row.spell = await fromUuid(uuid);
      row.previewScroll = await createSpellScroll(row.spell);
    }
    this.render({ parts: ["content", "footer"] });
  }

  /* -------------------------------------------- */

  /**
   * Handle picking a base item for an Enchant row. If no base item matches the template, the Compendium Browser
   * opens unfiltered.
   * @this {ConfigureTemplatesDialog}
   * @param {Event} event
   * @param {HTMLElement} target
   */
  static async #pickBaseItem(event, target) {
    const row = this.#rows[target.dataset.row];
    if ( !row.candidates ) return;
    const { activity } = row.profiles[row.profileIndex];
    const { types, filters } = row.candidates;
    const hasBaseItems = (await EnchantedItemBlueprint.listEnchantableBaseItems(activity)).length > 0;
    const uuid = await game.dnd5e.applications.CompendiumBrowser.selectOne({
      tab: "physical", filters: { locked: hasBaseItems ? { types, arbitrary: filters } : {} }
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
    const entries = this.#rows.map(row => {
      const shared = { isService: this.isService, stock: { max: null, current: 1 }, restockMode: "exclude" };
      if ( row.kind === "spellScroll" ) {
        return {
          ...shared,
          spellScroll: { spellUuid: row.spell.uuid, img: row.imgOverride, identifier: row.identifierOverride }
        };
      }
      const { effect } = row.profiles[row.profileIndex];
      return {
        ...shared,
        generated: {
          baseItemUuid: row.baseItem.uuid, enchantItemUuid: row.item.uuid, effectId: effect.id,
          spellUuid: row.spell?.uuid ?? "", img: row.imgOverride, identifier: row.identifierOverride
        }
      };
    });
    await this.onSubmit(entries);
    await this.close();
  }

  /* -------------------------------------------- */
  /*  Helpers                                     */
  /* -------------------------------------------- */

  /**
   * Resolve and cache the base-item and spell candidates for a row's currently selected profile.
   * @param {object} row
   * @returns {Promise<void>}
   */
  async #resolveRowCandidates(row) {
    const { activity, level } = row.profiles[row.profileIndex];
    row.candidates = await EnchantedItemBlueprint.resolveBaseItemCandidates(activity);
    const { explicit } = row.candidates;
    const keepBaseItem = row.baseItem && (explicit
      ? explicit.some(item => item.uuid === row.baseItem.uuid) : (activity.canEnchant(row.baseItem) === true));
    if ( !keepBaseItem ) row.baseItem = explicit?.[0] ?? null;
    if ( isEnspelled(row) ) {
      row.spellOptions = await GeneratorProfile.fetchEnspelledSpells(row.item.system.identifier, level);
      row.spell = row.spellOptions.length ? await fromUuid(row.spellOptions[0].uuid) : null;
    }
  }

  /* -------------------------------------------- */

  /**
   * Whether every row has a complete pick.
   * @returns {boolean}
   */
  #isComplete() {
    return this.#rows.every(row => (row.kind === "spellScroll")
      ? !!row.spell : (!!row.baseItem && (!isEnspelled(row) || !!row.spell)));
  }
}

/* -------------------------------------------- */

/**
 * Does the row's enchanted item bind a spell?
 * @param {object} row
 * @returns {boolean}
 */
function isEnspelled(row) {
  return (row.kind === "enchant") && EnchantedItemBlueprint.isEnspelledItem(row.item);
}
