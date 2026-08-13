import { MODULE_ID } from "../config.mjs";
import { Recipe } from "../data/recipe-data.mjs";
import { getRecipe, updateRecipe } from "../data/recipe-store.mjs";
import { entryKey, resolveEntries } from "../item-resolver.mjs";
import { breakdownCopper, currencyRows, goldPoolCurrencies, toCopper } from "../shop/currency.mjs";

const { Application5e } = game.dnd5e.applications.api;

/**
 * GM-facing editor for a single craft recipe.
 */
export default class RecipeSheet extends Application5e {
  constructor(options={}) {
    super(options);
    this.recipeId = options.recipeId;
  }

  /** @override */
  static DEFAULT_OPTIONS = {
    id: "recipe-sheet-{id}",
    classes: ["sheet", "simple-shop-craft-5e", "recipe-sheet", "standard-form"],
    tag: "form",
    window: { resizable: true },
    position: { width: 480, height: "auto" },
    form: {
      handler: RecipeSheet.#onSubmit,
      submitOnChange: true,
      closeOnSubmit: false
    },
    actions: {
      addMaterial: RecipeSheet.#addMaterial,
      editTargetItem: RecipeSheet.#editTargetItem,
      removeMaterial: RecipeSheet.#removeMaterial,
      removeTargetItem: RecipeSheet.#removeTargetItem
    }
  };

  /** @override */
  static PARTS = {
    content: {
      template: "modules/simple-shop-craft-5e/templates/recipe-sheet/content.hbs",
      templates: ["modules/simple-shop-craft-5e/templates/partials/item-avatar-name.hbs"]
    }
  };

  /* -------------------------------------------- */

  /**
   * Handle adding materials via the compendium browser.
   * @this {RecipeSheet}
   * @returns {Promise<void>}
   */
  static async #addMaterial() {
    const selection = await game.dnd5e.applications.CompendiumBrowser.select({
      tab: "physical", selection: { min: 1 }
    });
    if ( !selection?.size ) return;

    const items = await Promise.all(Array.from(selection).map(uuid => fromUuid(uuid)));
    const newEntries = items.filter(Boolean).map(itemEntryRef);
    if ( !newEntries.length ) return;

    const recipe = this.recipe;
    const existingKeys = new Set(recipe.materials.map(m => entryKey(m)));
    const materials = [
      ...recipe.materials.map(m => m.toObject()),
      ...newEntries.filter(e => !existingKeys.has(entryKey(e)))
    ];
    await updateRecipe(this.recipeId, { materials });
    this.render();
  }

  /* -------------------------------------------- */

  /**
   * Handle picking the recipe's target item via the compendium browser.
   * @this {RecipeSheet}
   * @returns {Promise<void>}
   */
  static async #editTargetItem() {
    const selection = await game.dnd5e.applications.CompendiumBrowser.select({
      tab: "physical", selection: { min: 1, max: 1 }
    });
    const uuid = selection?.size ? Array.from(selection)[0] : null;
    const item = uuid ? await fromUuid(uuid) : null;
    if ( !item ) return;

    await updateRecipe(this.recipeId, { targetItem: itemEntryRef(item), img: item.img });
    this.render();
  }

  /* -------------------------------------------- */

  /**
   * Handle submitting the recipe's form fields (autosave).
   * @this {RecipeSheet}
   * @param {Event} event                Triggering submit event.
   * @param {HTMLFormElement} form       The submitted form.
   * @param {FormDataExtended} formData  Data from the form.
   * @returns {Promise<void>}
   */
  static async #onSubmit(event, form, formData) {
    const data = foundry.utils.expandObject(formData.object);
    if ( data.durationOverride ) data.durationOverride.value ??= null;
    let rerender = false;
    if ( data.targetItem?.uuid ) {
      const item = await fromUuid(data.targetItem.uuid);
      if ( item ) {
        data.targetItem = itemEntryRef(item);
        data.img = item.img;
        rerender = true;
      }
    }
    if ( data.materialPrice ) {
      data.materialPrice = Object.fromEntries(
        Object.entries(data.materialPrice)
          .filter(([, value]) => value !== null)
          .map(([denom, value]) => [denom, Math.max(0, Math.round(value))])
      );
    }
    await updateRecipe(this.recipeId, data);
    if ( rerender ) this.render();
  }

  /* -------------------------------------------- */

  /**
   * Handle removing a material.
   * @this {RecipeSheet}
   * @param {Event} event         Triggering click event.
   * @param {HTMLElement} target  Button that was clicked.
   * @returns {Promise<void>}
   */
  static async #removeMaterial(event, target) {
    const key = target.dataset.key;
    const materials = this.recipe.materials.filter(m => entryKey(m) !== key).map(m => m.toObject());
    await updateRecipe(this.recipeId, { materials });
    this.render();
  }

  /* -------------------------------------------- */

  /**
   * Handle clearing the recipe's target item.
   * @this {RecipeSheet}
   * @returns {Promise<void>}
   */
  static async #removeTargetItem() {
    await updateRecipe(this.recipeId, { targetItem: { identifier: "", uuid: "" }, img: Recipe.DEFAULT_ICON });
    this.render();
  }

  /* -------------------------------------------- */

  /**
   * Id of the recipe being edited.
   * @type {string}
   */
  recipeId;

  /* -------------------------------------------- */

  /**
   * Can the current user edit this recipe at all? GM-only.
   * @type {boolean}
   */
  get isEditable() {
    return game.user.isGM;
  }

  /* -------------------------------------------- */

  /**
   * The recipe currently being edited.
   * @type {Recipe}
   */
  get recipe() {
    return getRecipe(this.recipeId);
  }

  /* -------------------------------------------- */

  /** @override */
  get title() {
    return this.recipe?.name || _loc("SIMPLE_SHOP_CRAFT_5E.NewRecipePlaceholder");
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _onRender(context, options) {
    await super._onRender(context, options);
    if ( !this.isEditable ) this._disableFields();

    const dropArea = this.element.querySelector("[data-drop-area]");
    dropArea?.addEventListener("dragover", event => event.preventDefault());
    dropArea?.addEventListener("dragenter", () => dropArea.classList.add("is-dragover"));
    dropArea?.addEventListener("dragleave", event => {
      if ( event.currentTarget.contains(event.relatedTarget) ) return;
      dropArea.classList.remove("is-dragover");
    });
    dropArea?.addEventListener("drop", event => this.#onDropItem(event));
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const recipe = this.recipe;
    context.recipe = recipe;
    const fields = Recipe.schema.fields;

    const [targetResolved] = await resolveEntries([recipe.targetItem]);
    context.targetItem = targetResolved.item;
    context.craftCost = null;
    if ( targetResolved.item?.uuid ) {
      try {
        const fullItem = await fromUuid(targetResolved.item.uuid);
        if ( fullItem?.system?.getCraftCost ) context.craftCost = await fullItem.system.getCraftCost();
      } catch ( err ) {
        console.warn(`${MODULE_ID} | Failed to compute craft cost for ${targetResolved.item.name}:`, err);
      }
    }
    const craftCostBreakdown = Object.fromEntries(goldPoolCurrencies().map(d => [d, 0]));
    if ( context.craftCost ) {
      for ( const part of breakdownCopper(toCopper(context.craftCost.gold, "gp")) ) craftCostBreakdown[part.denomination] = part.value;
    }

    const materialsResolved = await resolveEntries(recipe.materials);
    const materialRows = materialsResolved.filter(r => r.item).map(r => ({
      key: entryKey(r.entry), img: r.item.img, name: r.item.name,
      template: "modules/simple-shop-craft-5e/templates/recipe-sheet/material-row.hbs"
    }));
    context.materialsTable = {
      hasRows: materialRows.length > 0,
      emptyLabel: "SIMPLE_SHOP_CRAFT_5E.RecipeEditor.MaterialsNone",
      sections: materialRows.length ? [{ label: "", columns: [{ id: "name" }, { id: "controls" }], rows: materialRows }] : []
    };

    context.targetItemUuidField = [
      { field: fields.targetItem.fields.uuid, name: "targetItem.uuid", value: recipe.targetItem.uuid }
    ];
    context.identityFields = [
      {
        field: fields.name, name: "name", value: recipe.name,
        placeholder: targetResolved.item?.name || _loc("SIMPLE_SHOP_CRAFT_5E.NewRecipePlaceholder")
      }
    ];
    context.materialFields = [
      {
        field: fields.allowFreeformMaterials, name: "allowFreeformMaterials", value: recipe.allowFreeformMaterials
      }
    ];
    context.materialPriceRows = currencyRows(recipe.materialPrice, "materialPrice.", craftCostBreakdown);
    context.unlockFields = [
      { field: fields.unlockedFor, name: "unlockedFor", value: Array.from(recipe.unlockedFor) },
      { field: fields.openToAll, name: "openToAll", value: recipe.openToAll }
    ];
    context.toolFields = [
      {
        field: fields.toolProficiencies, name: "toolProficiencies", value: Array.from(recipe.toolProficiencies),
        options: await toolOptions()
      },
      { field: fields.allowWorkshopOverride, name: "allowWorkshopOverride", value: recipe.allowWorkshopOverride }
    ];
    context.durationFields = [
      {
        field: fields.durationOverride.fields.value, name: "durationOverride.value", value: recipe.durationOverride.value,
        input: (field, config) => foundry.applications.fields.createNumberInput(config),
        placeholder: context.craftCost ? String(context.craftCost.days) : undefined
      },
      {
        field: fields.durationOverride.fields.units, name: "durationOverride.units", value: recipe.durationOverride.units,
        options: ["minute", "hour", "day"].map(value => ({ value, label: CONFIG.DND5E.timeUnits[value].label }))
      }
    ];

    return context;
  }

  /* -------------------------------------------- */

  /**
   * Handle dropping an item onto the materials drop area.
   * @param {DragEvent} event
   * @returns {Promise<void>}
   */
  async #onDropItem(event) {
    event.preventDefault();
    event.currentTarget.classList.remove("is-dragover");
    const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
    if ( data?.type !== "Item" ) return;
    const item = await Item.implementation.fromDropData(data);
    if ( !item ) return;

    const recipe = this.recipe;
    const entry = itemEntryRef(item);
    if ( recipe.materials.some(m => entryKey(m) === entryKey(entry)) ) return;

    await updateRecipe(this.recipeId, { materials: [...recipe.materials.map(m => m.toObject()), entry] });
    this.render();
  }
}

/* -------------------------------------------- */

/**
 * Build an identifier/uuid reference for an item. Prefers `identifier` for compendium items (resolvable across
 * package-priority sources), falls back to `uuid` for world items with no matching compendium entry.
 * @param {Item5e} item
 * @returns {{ identifier: string }|{ uuid: string }}
 */
function itemEntryRef(item) {
  return (item.pack && item.system.identifier) ? { identifier: item.system.identifier } : { uuid: item.uuid };
}

/* -------------------------------------------- */

/**
 * Build the tool proficiency select options, limited to Artisan's Tools.
 * @returns {Promise<{ value: string, label: string }[]>}
 */
async function toolOptions() {
  const categories = await game.dnd5e.documents.Trait.categories("tool");
  const artisanTools = categories.art?.children ?? {};
  return Object.entries(artisanTools)
    .map(([value, { label }]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
