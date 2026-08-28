import { SETTING_KEYS } from "../config.mjs";
import { toCopper } from "../utils.mjs";

import { SettingCollectionMixin } from "./setting-collection.mjs";

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
      openToAll: new BooleanField({ initial: false }),
      materialPrice: new ObjectField({ initial: {} }),
      toolProficiencies: new SetField(new StringField()),
      skillProficiencies: new SetField(new StringField()),
      allowWorkshopOverride: new BooleanField({ initial: false }),
      durationOverride: new SchemaField({
        value: new NumberField({ initial: null, nullable: true, integer: true, min: 0 }),
        units: new StringField({ initial: "day", choices: ["minute", "hour", "day"] })
      })
    };
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
 * Register this module's localization for the Recipe data model.
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
