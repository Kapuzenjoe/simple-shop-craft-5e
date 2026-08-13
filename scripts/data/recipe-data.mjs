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
    return itemRefSchema();
  }
}

/* -------------------------------------------- */

/**
 * A data model that represents a craft recipe.
 * @extends {foundry.abstract.DataModel<RecipeData>}
 * @mixes RecipeData
 */
export class Recipe extends foundry.abstract.DataModel {

  /**
   * Default icon used for recipes without a custom image.
   * @type {string}
   */
  static DEFAULT_ICON = "icons/svg/book.svg";

  /**
   * Localization prefixes used to auto-localize this schema's field labels/hints.
   * @type {string[]}
   */
  static LOCALIZATION_PREFIXES = ["SIMPLE_SHOP_CRAFT_5E.RECIPE"];

  /** @override */
  static defineSchema() {
    return {
      _id: new DocumentIdField({ initial: () => foundry.utils.randomID() }),
      name: new StringField({ blank: true }),
      img: new FilePathField({ categories: ["IMAGE"], initial: () => Recipe.DEFAULT_ICON }),
      targetItem: new SchemaField(itemRefSchema()),
      materials: new ArrayField(new EmbeddedDataField(RecipeMaterial)),
      allowFreeformMaterials: new BooleanField({ initial: true }),
      unlockedFor: new SetField(new DocumentUUIDField({ type: "Actor" })),
      openToAll: new BooleanField({ initial: false }),
      materialPrice: new ObjectField({ initial: {} }),
      toolProficiencies: new SetField(new StringField()),
      allowWorkshopOverride: new BooleanField({ initial: false }),
      durationOverride: new SchemaField({
        value: new NumberField({ initial: null, nullable: true, integer: true, min: 0 }),
        units: new StringField({ initial: "day", choices: ["minute", "hour", "day"] })
      })
    };
  }
}

/* -------------------------------------------- */

/**
 * Register this module's localization for the Recipe data model.
 * @returns {void}
 */
export function registerRecipeLocalization() {
  foundry.helpers.Localization.localizeDataModel(Recipe);
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
