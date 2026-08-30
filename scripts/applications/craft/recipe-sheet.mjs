import { MODULE_ID } from "../../config.mjs";
import { Recipe, RecipeMaterial } from "../../data/recipe-data.mjs";
import {
  applyLoadingTooltip, breakdownCopper, buildItemTableSections, currencyRows, effectiveCraftCost, getCurrencyOptions,
  goldPoolCurrencies, isDefaultIdentifier, itemRefKey, resolveEntries, resolveIdentifierIndex,
  resolveItemPrice, subtypeOptions, toCopper
} from "../../utils.mjs";
import BaseShopConfig from "../shops/shop-config/base-shop-config.mjs";

import MaterialCriteriaDialog from "./material-criteria-dialog.mjs";

const { Application5e } = game.dnd5e.applications.api;

/**
 * GM-facing editor for a single craft recipe.
 */
export default class RecipeSheet extends Application5e {
  constructor(options={}) {
    super(options);
    this.recipeId = options.recipeId;
  }

  /* -------------------------------------------- */

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
      addMaterialCriteria: RecipeSheet.#addMaterialCriteria,
      editTargetItem: RecipeSheet.#editTargetItem,
      removeTargetItem: RecipeSheet.#removeTargetItem,
      stepMaterialQuantity: RecipeSheet.#stepMaterialQuantity,
      toggleMaterialRequired: RecipeSheet.#toggleMaterialRequired
    },
    recipeId: null
  };

  /* -------------------------------------------- */

  /** @override */
  static PARTS = {
    content: {
      template: "modules/simple-shop-craft-5e/templates/recipe-sheet/content.hbs",
      templates: [
        "modules/simple-shop-craft-5e/templates/partials/item-avatar-name.hbs",
        "modules/simple-shop-craft-5e/templates/partials/currency-parts.hbs",
        "modules/simple-shop-craft-5e/templates/partials/item-table.hbs"
      ]
    }
  };

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * Id of the recipe being edited.
   * @type {string}
   */
  recipeId;

  /* -------------------------------------------- */

  /**
   * Name of the resolved target item, cached as a title fallback once known.
   * @type {string|null}
   */
  #targetItemName = null;

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
    return Recipe.get(this.recipeId);
  }

  /* -------------------------------------------- */

  /** @override */
  get title() {
    return this.recipe?.name || this.#targetItemName || _loc("SIMPLE_SHOP_CRAFT_5E.NewRecipePlaceholder");
  }

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const recipe = this.recipe;
    context.recipe = recipe;
    const fields = Recipe.schema.fields;

    const [targetResolved] = await resolveEntries([recipe.targetItem]);
    context.targetItem = targetResolved.item;
    this.#targetItemName = targetResolved.item?.name ?? null;
    context.craftCost = null;
    if ( targetResolved.item?.uuid ) {
      try {
        const fullItem = await fromUuid(targetResolved.item.uuid);
        if ( fullItem?.system?.getCraftCost ) context.craftCost = await effectiveCraftCost(fullItem);
      } catch ( err ) {
        console.warn(`${MODULE_ID} | Failed to compute craft cost for ${targetResolved.item.name}:`, err);
      }
    }
    const craftCostBreakdown = Object.fromEntries(goldPoolCurrencies().map(d => [d, 0]));
    if ( context.craftCost ) {
      for ( const part of breakdownCopper(toCopper(context.craftCost.gold, "gp")) ) craftCostBreakdown[part.denomination] = part.value;
    }
    const thresholdCP = recipe.craftThreshold(context.craftCost, targetResolved.item);

    const materialsResolved = await resolveEntries(recipe.materials);
    const materialRows = materialsResolved.map((r, index) => ({ ...r, index })).map(r => {
      const shared = {
        index: r.index, required: r.entry.required, requiredEditable: true,
        requiredTooltip: "SIMPLE_SHOP_CRAFT_5E.RecipeEditor.MaterialRequired",
        showQuantity: true, quantity: r.entry.quantity, quantityLabel: r.entry.quantity,
        hasContextMenu: true, uuid: r.item?.uuid ?? null
      };
      const bundleSize = (r.item?.system?.quantity > 1) ? r.item.system.quantity : 1;
      const rawPrice = (!r.entry.criteria?.type && r.item) ? resolveItemPrice(r.item) : null;
      const itemPrice = (r.entry.value?.value != null)
        ? r.entry.value
        : (rawPrice ? { value: rawPrice.value / bundleSize, denomination: rawPrice.denomination } : null);
      const price = (itemPrice?.value != null) ? [itemPrice] : null;
      const valueCP = (itemPrice?.value != null) ? toCopper(itemPrice.value, itemPrice.denomination) : 0;
      if ( r.entry.criteria?.type ) {
        const subtypeLabel = r.entry.criteria.subtype
          ? subtypeOptions([r.entry.criteria.type]).find(o => o.value === r.entry.criteria.subtype)?.label
          : null;
        const name = subtypeLabel ?? _loc(`TYPES.Item.${r.entry.criteria.type}Pl`);
        return {
          ...shared, img: "systems/dnd5e/icons/svg/item-choice.svg", name, price, valueCP,
          subtitle: _loc("SIMPLE_SHOP_CRAFT_5E.MaterialRule")
        };
      }
      if ( !r.item ) {
        return {
          ...shared, img: "icons/svg/hazard.svg",
          name: r.entry.identifier || r.entry.uuid || _loc("SIMPLE_SHOP_CRAFT_5E.Unknown"),
          subtitle: r.entry.identifier || null, price: null, valueCP: 0,
          warning: true, warningTooltip: _loc("SIMPLE_SHOP_CRAFT_5E.RecipeEditor.UnresolvedWarning")
        };
      }
      return {
        ...shared, img: r.item.img, name: r.item.name, subtitle: r.entry.identifier || null,
        price, valueCP, warning: isDefaultIdentifier(r.item),
        warningTooltip: isDefaultIdentifier(r.item) ? _loc("SIMPLE_SHOP_CRAFT_5E.RecipeEditor.NoIdentifierWarning") : null
      };
    });
    const requiredSumCP = materialRows.filter(r => r.required)
      .reduce((sum, r) => sum + ((r.valueCP ?? 0) * r.quantity), 0);
    context.requiredValueParts = breakdownCopper(requiredSumCP);
    context.thresholdParts = breakdownCopper(thresholdCP);
    context.requiredValueMet = recipe.ignoreCraftValue || (requiredSumCP >= thresholdCP);
    context.materialsTable = buildItemTableSections({
      groups: materialRows.length ? [{ label: "SIMPLE_SHOP_CRAFT_5E.Material", items: materialRows }] : [],
      emptyLabel: "SIMPLE_SHOP_CRAFT_5E.RecipeEditor.MaterialsNone",
      columns: [
        { id: "price", label: "DND5E.Price" },
        { id: "quantity", label: "DND5E.Quantity" }, { id: "controls" }, { id: "controls" }
      ],
      rowTemplate: "modules/simple-shop-craft-5e/templates/partials/material-row.hbs"
    });

    context.targetItemUuidField = [
      { field: fields.targetItem.fields.uuid, name: "targetItem.uuid", value: recipe.targetItem.uuid }
    ];
    context.targetQuantityField = [
      { field: fields.targetQuantity, name: "targetQuantity", value: recipe.targetQuantity }
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
      },
      {
        field: fields.ignoreCraftValue, name: "ignoreCraftValue", value: recipe.ignoreCraftValue
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
      {
        field: fields.skillProficiencies, name: "skillProficiencies", value: Array.from(recipe.skillProficiencies),
        options: skillOptions()
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
        label: _loc("DND5E.Unit"),
        options: ["minute", "hour", "day"].map(value => ({ value, label: CONFIG.DND5E.timeUnits[value].label }))
      }
    ];

    return context;
  }

  /* -------------------------------------------- */
  /*  Life-Cycle Handlers                         */
  /* -------------------------------------------- */

  /** @inheritDoc */
  async _onFirstRender(context, options) {
    await super._onFirstRender(context, options);
    new game.dnd5e.applications.ContextMenu5e(this.element, "[data-id]", this.#materialContextOptions(), { jQuery: false });
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _onRender(context, options) {
    await super._onRender(context, options);
    if ( this.hasFrame ) this.window.title.innerText = this.title;
    if ( !this.isEditable ) this._disableFields();

    const dropArea = this.element.querySelector("[data-drop-area]");
    dropArea?.addEventListener("dragover", event => event.preventDefault());
    dropArea?.addEventListener("dragenter", () => dropArea.classList.add("is-dragover"));
    dropArea?.addEventListener("dragleave", event => {
      if ( event.currentTarget.contains(event.relatedTarget) ) return;
      dropArea.classList.remove("is-dragover");
    });
    dropArea?.addEventListener("drop", event => this.#onDropItem(event));

    this.element.querySelectorAll(".item-tooltip[data-uuid]").forEach(applyLoadingTooltip);
  }

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers                */
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
    const newEntries = await Promise.all(items.filter(Boolean).map(itemEntryRef));
    if ( !newEntries.length ) return;

    const recipe = this.recipe;
    const existingKeys = new Set(recipe.materials.map(m => itemRefKey(m)));
    const materials = [
      ...recipe.materials.map(m => m.toObject()),
      ...newEntries.filter(e => !existingKeys.has(itemRefKey(e)))
    ];
    await Recipe.update(this.recipeId, { materials });
    this.render();
  }

  /* -------------------------------------------- */

  /**
   * Handle adding a type/subtype/value material rule.
   * @this {RecipeSheet}
   * @returns {Promise<void>}
   */
  static async #addMaterialCriteria() {
    await new MaterialCriteriaDialog({
      onSubmit: async ({ type, subtype, value }) => {
        const materials = [...this.recipe.materials.map(m => m.toObject()), { criteria: { type, subtype }, value }];
        await Recipe.update(this.recipeId, { materials });
        this.render();
      }
    }).render({ force: true });
  }

  /* -------------------------------------------- */

  /**
   * Handle toggling whether a material slot must have a resolved match to start crafting.
   * @this {RecipeSheet}
   * @param {Event} event         Triggering click event.
   * @param {HTMLElement} target  Button that was clicked.
   * @returns {Promise<void>}
   */
  static async #toggleMaterialRequired(event, target) {
    const index = Number(target.dataset.index);
    const materials = this.recipe.materials.map((m, i) => (i === index)
      ? { ...m.toObject(), required: !m.required } : m.toObject());
    await Recipe.update(this.recipeId, { materials });
    this.render();
  }

  /* -------------------------------------------- */

  /**
   * Handle adjusting the number of matching units required for a material slot.
   * @this {RecipeSheet}
   * @param {Event} event         Triggering click event.
   * @param {HTMLElement} target  Button that was clicked.
   * @returns {Promise<void>}
   */
  static async #stepMaterialQuantity(event, target) {
    const index = Number(target.dataset.index);
    const step = Number(target.dataset.step);
    const materials = this.recipe.materials.map((m, i) => (i === index)
      ? { ...m.toObject(), quantity: Math.max(1, m.quantity + step) } : m.toObject());
    await Recipe.update(this.recipeId, { materials });
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

    const skillProficiencies = new Set(this.recipe.skillProficiencies);
    if ( item.system.properties?.has("mgc") ) skillProficiencies.add("arc");
    const targetItem = await itemEntryRef(item);
    const targetQuantity = (item.system.quantity > 1) ? item.system.quantity : 1;
    await Recipe.update(this.recipeId, {
      targetItem, targetQuantity, img: item.img, skillProficiencies: Array.from(skillProficiencies)
    });
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
    if ( data.targetItem?.uuid && (data.targetItem.uuid !== this.recipe.targetItem.uuid) ) {
      const item = await fromUuid(data.targetItem.uuid);
      if ( item ) {
        data.targetItem = await itemEntryRef(item);
        data.img = item.img;
        data.targetQuantity = (item.system.quantity > 1) ? item.system.quantity : 1;
        const skillProficiencies = new Set(data.skillProficiencies ?? this.recipe.skillProficiencies);
        if ( item.system.properties?.has("mgc") ) skillProficiencies.add("arc");
        data.skillProficiencies = Array.from(skillProficiencies);
      }
    }
    if ( data.materialPrice ) {
      data.materialPrice = Object.fromEntries(
        Object.entries(data.materialPrice)
          .filter(([, value]) => value !== null)
          .map(([denom, value]) => [denom, Math.max(0, Math.round(value))])
      );
    }
    await Recipe.update(this.recipeId, data);
    this.render();
  }

  /* -------------------------------------------- */

  /**
   * Build the entries for a material row's additional-controls context menu.
   * @returns {ContextMenuEntry[]}
   */
  #materialContextOptions() {
    return [
      {
        label: "SIMPLE_SHOP_CRAFT_5E.RecipeEditor.ChangeValue",
        icon: '<i class="fas fa-coins" inert></i>',
        onClick: (event, target) => this.#editMaterialValue(target)
      },
      {
        label: "SIMPLE_SHOP_CRAFT_5E.RecipeEditor.ChangeIdentifier",
        icon: '<i class="fas fa-fingerprint" inert></i>',
        visible: target => !this.recipe.materials[Number(target.dataset.index)]?.criteria?.type,
        onClick: (event, target) => this.#editMaterialIdentifier(target)
      },
      {
        label: "SIMPLE_SHOP_CRAFT_5E.RemoveMaterial",
        icon: '<i class="fas fa-trash" inert></i>',
        onClick: (event, target) => RecipeSheet.#removeMaterial.call(this, event, target)
      }
    ];
  }

  /* -------------------------------------------- */

  /**
   * Handle editing a fixed material's crafting-value override.
   * @param {HTMLElement} target  Row element the context menu was triggered for.
   * @returns {Promise<void>}
   */
  async #editMaterialValue(target) {
    const index = Number(target.dataset.index);
    const entry = this.recipe.materials[index];
    const valueFields = RecipeMaterial.schema.fields.value.fields;

    const dialog = new BaseShopConfig({
      window: { title: "SIMPLE_SHOP_CRAFT_5E.RecipeEditor.ChangeValue" },
      fields: [
        {
          field: valueFields.value, name: "value", value: entry.value?.value,
          label: _loc("DND5E.Price"), hint: _loc("SIMPLE_SHOP_CRAFT_5E.RecipeEditor.MaterialValueHint")
        },
        {
          field: valueFields.denomination, name: "denomination",
          value: entry.value?.denomination ?? CONFIG.DND5E.defaultCurrency,
          label: _loc("DND5E.Currency"), options: getCurrencyOptions()
        }
      ],
      form: {
        handler: async (event, form, formData) => {
          const data = foundry.utils.expandObject(formData.object);
          const materials = this.recipe.materials.map((m, i) => (i !== index) ? m.toObject() : {
            ...m.toObject(),
            value: { value: data.value ?? null, denomination: data.denomination }
          });
          await Recipe.update(this.recipeId, { materials });
          this.render();
        }
      }
    });
    await dialog.render({ force: true });
  }

  /* -------------------------------------------- */

  /**
   * Handle editing a fixed material's identifier reference. Resolved the same way as any other identifier
   * (module compendiums, then system, then world compendiums, then the world's Items directory).
   * @param {HTMLElement} target  Row element the context menu was triggered for.
   * @returns {Promise<void>}
   */
  async #editMaterialIdentifier(target) {
    const index = Number(target.dataset.index);
    const entry = this.recipe.materials[index];

    const dialog = new BaseShopConfig({
      window: { title: "SIMPLE_SHOP_CRAFT_5E.RecipeEditor.ChangeIdentifier" },
      fields: [
        {
          field: RecipeMaterial.schema.fields.identifier, name: "identifier", value: entry.identifier,
          label: _loc("DND5E.Identifier"), hint: _loc("SIMPLE_SHOP_CRAFT_5E.RecipeEditor.ChangeIdentifierHint")
        }
      ],
      form: {
        handler: async (event, form, formData) => {
          const data = foundry.utils.expandObject(formData.object);
          const identifier = data.identifier?.trim() ?? "";
          if ( !identifier ) {
            ui.notifications.warn("SIMPLE_SHOP_CRAFT_5E.RecipeEditor.IdentifierRequired", { localize: true });
            return;
          }
          const resolved = await resolveIdentifierIndex(new Set([identifier]));
          if ( !resolved.size ) {
            ui.notifications.warn("SIMPLE_SHOP_CRAFT_5E.RecipeEditor.IdentifierNotFound", { localize: true });
            return;
          }
          const materials = this.recipe.materials.map((m, i) => (i !== index) ? m.toObject() : {
            ...m.toObject(), identifier, uuid: ""
          });
          await Recipe.update(this.recipeId, { materials });
          this.render();
        }
      }
    });
    await dialog.render({ force: true });
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
    const index = Number(target.dataset.index);
    const materials = this.recipe.materials.filter((m, i) => i !== index).map(m => m.toObject());
    await Recipe.update(this.recipeId, { materials });
    this.render();
  }

  /* -------------------------------------------- */

  /**
   * Handle clearing the recipe's target item.
   * @this {RecipeSheet}
   * @returns {Promise<void>}
   */
  static async #removeTargetItem() {
    await Recipe.update(this.recipeId, { targetItem: { identifier: "", uuid: "" }, img: Recipe.DEFAULT_ICON });
    this.render();
  }

  /* -------------------------------------------- */
  /*  Helpers                                     */
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
    const entry = await itemEntryRef(item);
    if ( recipe.materials.some(m => itemRefKey(m) === itemRefKey(entry)) ) return;

    await Recipe.update(this.recipeId, { materials: [...recipe.materials.map(m => m.toObject()), entry] });
    this.render();
  }
}

/* -------------------------------------------- */

/**
 * Build an identifier/uuid reference for an item. Prefers `identifier` when it resolves against a real
 * compendium/world source (stable regardless of where the item currently lives — a compendium, an actor's
 * inventory, or the world), falls back to `uuid` for items with no identifier or an unresolvable one.
 * @param {Item5e} item
 * @returns {Promise<{ identifier: string }|{ uuid: string }>}
 */
async function itemEntryRef(item) {
  if ( item.system.identifier ) {
    const resolved = await resolveIdentifierIndex(new Set([item.system.identifier]));
    if ( resolved.size ) return { identifier: item.system.identifier };
  }
  return { uuid: item.uuid };
}

/* -------------------------------------------- */

/**
 * Build the skill select options: all skills, for the alternative skill-proficiency requirement.
 * @returns {{ value: string, label: string }[]}
 */
function skillOptions() {
  return Object.entries(CONFIG.DND5E.skills)
    .map(([value, { label }]) => ({ value, label: _loc(label) }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/* -------------------------------------------- */

/**
 * Build the tool proficiency select options: Artisan's Tools plus the Herbalism Kit and Poisoner's Kit,
 * the two specialty kits with a defined crafting role (Potions, poisons).
 * @returns {Promise<{ value: string, label: string }[]>}
 */
async function toolOptions() {
  const categories = await game.dnd5e.documents.Trait.categories("tool");
  const artisanTools = categories.art?.children ?? {};
  const specialtyKits = { herb: categories.herb, pois: categories.pois };
  return Object.entries({ ...artisanTools, ...specialtyKits })
    .filter(([, data]) => data)
    .map(([value, { label }]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
