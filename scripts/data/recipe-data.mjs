import { PROFICIENCY_MODES, SETTING_KEYS, SPELL_SCROLL_SOURCES, UNLOCK_MODES } from "../config.mjs";
import { toCopper } from "../utils.mjs";
import SettingCollectionMixin from "./setting-collection-mixin.mjs";

const {
  ArrayField, BooleanField, DocumentIdField, DocumentUUIDField, EmbeddedDataField, FilePathField, NumberField,
  ObjectField, SchemaField, SetField, StringField
} = foundry.data.fields;

/**
 * @import { RecipeData, RecipeMaterialData } from "../_types.mjs";
 */

/**
 * A data model that represents a single required material for a recipe.
 * @extends {foundry.abstract.DataModel<RecipeMaterialData>}
 * @mixes RecipeMaterialData
 */
export class RecipeMaterial extends foundry.abstract.DataModel {

  /** @override */
  static defineSchema() {
    return {
      ...itemRefSchema(),
      criteria: new SchemaField({
        type: new StringField({ blank: true }),
        subtype: new StringField({ blank: true })
      }, { nullable: true, initial: null }),
      required: new BooleanField({ initial: false }),
      quantity: new NumberField({ initial: 1, integer: true, min: 1 }),
      value: new SchemaField({
        value: new NumberField({ initial: null, nullable: true, min: 0 }),
        denomination: new StringField({ initial: () => CONFIG.DND5E.defaultCurrency })
      })
    };
  }
}

/* -------------------------------------------- */

/**
 * A data model that represents a craft recipe.
 * @extends {foundry.abstract.DataModel<RecipeData>}
 * @mixes RecipeData
 */
export class Recipe extends SettingCollectionMixin(foundry.abstract.DataModel, SETTING_KEYS.RECIPES) {

  /**
   * Default icon used for recipes without a custom image.
   * @type {string}
   */
  static DEFAULT_ICON = "icons/svg/book.svg";

  /* -------------------------------------------- */

  /** @override */
  static LOCALIZATION_PREFIXES = ["SIMPLE_SHOP_CRAFT_5E.RECIPE"];

  /* -------------------------------------------- */

  /** @override */
  static defineSchema() {
    return {
      _id: new DocumentIdField({ initial: () => foundry.utils.randomID() }),
      name: new StringField({ blank: true }),
      img: new FilePathField({ categories: ["IMAGE"], initial: () => Recipe.DEFAULT_ICON }),
      targetItem: new SchemaField(itemRefSchema()),
      targetQuantity: new NumberField({ initial: 1, integer: true, min: 1 }),
      materials: new ArrayField(new EmbeddedDataField(RecipeMaterial)),
      allowFreeformMaterials: new BooleanField({ initial: false }),
      ignoreCraftValue: new BooleanField({ initial: false }),
      unlockedFor: new SetField(new DocumentUUIDField({ type: "Actor" })),
      unlockMode: new StringField({ initial: "individual", choices: Object.keys(UNLOCK_MODES), required: true }),
      materialPrice: new ObjectField({ initial: {} }),
      toolProficiencies: new SetField(new StringField()),
      skillProficiencies: new SetField(new StringField()),
      proficiencyMode: new StringField({
        initial: "both", choices: Object.keys(PROFICIENCY_MODES), required: true
      }),
      allowWorkshopOverride: new BooleanField({ initial: false }),
      durationOverride: new SchemaField({
        value: new NumberField({ initial: null, nullable: true, integer: true, min: 0 }),
        units: new StringField({ initial: "day", choices: ["minute", "hour", "day"] })
      }),
      spellScroll: new SchemaField({
        level: new NumberField({ initial: 0, integer: true, min: 0, max: 9, required: true }),
        spellSource: new StringField({
          initial: "prepared", choices: Object.keys(SPELL_SCROLL_SOURCES), required: true
        })
      }, { nullable: true, initial: null })
    };
  }

  /* -------------------------------------------- */
  /*  Data Migration                              */
  /* -------------------------------------------- */

  /** @inheritDoc */
  static _migrateData(source) {
    super._migrateData(source);
    Recipe.#migrateUnlockMode(source);
    return source;
  }

  /* -------------------------------------------- */

  /**
   * Migrate the `openToAll` boolean to the three-way `unlockMode`.
   * @param {object} source  The candidate source data from which the model will be constructed.
   */
  static #migrateUnlockMode(source) {
    if ( !("openToAll" in source) ) return;
    source.unlockMode = source.openToAll ? "all" : "individual";
    delete source.openToAll;
  }

  /* -------------------------------------------- */

  /**
   * This recipe's display name: its own name if set, otherwise the target item's name — with the spell
   * level appended for a spell-scroll recipe, or a generic placeholder if nothing resolves.
   * @param {Item5e|null} targetItem  The resolved target item, if any.
   * @returns {string}
   */
  displayName(targetItem) {
    const itemName = this.spellScroll
      ? `${_loc("SIMPLE_SHOP_CRAFT_5E.RecipeEditor.SpellScroll")}, ${_loc(CONFIG.DND5E.spellLevels[this.spellScroll.level])}`
      : targetItem?.name;
    return this.name || itemName || _loc("SIMPLE_SHOP_CRAFT_5E.NewRecipePlaceholder");
  }

  /* -------------------------------------------- */

  /**
   * Determine whether the given actor may start this craft.
   * @param {Actor5e|null} actor  Actor attempting to craft.
   * @returns {boolean}
   */
  canCraft(actor) {
    if ( this.unlockMode === "all" ) return true;
    if ( !actor ) return false;
    if ( this.unlockedFor.has(actor.uuid) ) return true;
    if ( this.unlockMode === "toolProficiency" ) {
      return Array.from(this.toolProficiencies).some(key => (actor.system.tools?.[key]?.value ?? 0) > 0);
    }
    return false;
  }

  /* -------------------------------------------- */

  /**
   * Resolve this recipe's material-value threshold in copper — its own explicit threshold if set,
   * otherwise the rules-based crafting cost of the target item — scaled by the ratio of the recipe's
   * target quantity to the target item's own bundle size.
   * @param {{ gold: number, days: number }|null} craftCost
   * @param {Item5e} [targetItem]
   * @returns {number}
   */
  craftThreshold(craftCost, targetItem) {
    const explicit = Object.entries(this.materialPrice)
      .reduce((sum, [denom, value]) => sum + toCopper(value ?? 0, denom), 0);
    const targetBundleSize = (targetItem?.system?.quantity > 1) ? targetItem.system.quantity : 1;
    const scale = this.targetQuantity / targetBundleSize;
    if ( explicit > 0 ) return Math.ceil(explicit * scale);
    return craftCost ? toCopper(craftCost.gold * scale, "gp") : 0;
  }
}

/* -------------------------------------------- */

/**
 * Shared identifier/uuid fields used for an item reference (recipe target item or material).
 * @returns {object}
 */
function itemRefSchema() {
  return {
    identifier: new StringField({ blank: true }),
    uuid: new DocumentUUIDField({ type: "Item", blank: true })
  };
}
