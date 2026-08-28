import { HOURS_PER_USE } from "../../config.mjs";
import { CraftMessageData } from "../../data/craft-message.mjs";
import { Recipe } from "../../data/recipe-data.mjs";
import {
  breakdownCopper, buildItemTableSections, effectiveCraftCost, loadingTooltip, needsDefaultPrice, openItemSheet,
  resolveBundleSizes, resolveEntries, resolveItemPrice, selectableActors, subtypeOptions, toCopper
} from "../../utils.mjs";

const { Dialog5e } = game.dnd5e.applications.api;

/**
 * Hours per duration unit, for converting a recipe's duration override to total progress hours.
 * @type {Record<string, number>}
 */
const HOURS_PER_UNIT = { minute: 1 / 60, hour: 1, day: HOURS_PER_USE };

/**
 * Player-facing dialog to request starting a craft: tool/material selection against a recipe's
 * requirements, with optional gold fill-in, ending in a GM-confirmation chat card.
 */
export default class CraftStartDialog extends Dialog5e {
  constructor({ recipeId, ...options }={}) {
    super(options);
    this.recipeId = recipeId;
    this.selectedActorUuid = game.user.character?.type === "character" ? game.user.character.uuid : "";
  }

  /* -------------------------------------------- */

  /** @override */
  static DEFAULT_OPTIONS = {
    id: "craft-start-dialog-{id}",
    classes: ["simple-shop-craft-5e", "craft-start-dialog", "standard-form"],
    window: { resizable: true },
    position: { width: 420, height: "auto" },
    actions: {
      openItemSheet: CraftStartDialog.#openItemSheet,
      removeMaterial: CraftStartDialog.#removeFreeformMaterial,
      stepMaterialQuantity: CraftStartDialog.#stepMaterialCandidate,
      startCraft: CraftStartDialog.#startCraft
    }
  };

  /* -------------------------------------------- */

  /** @override */
  static PARTS = {
    ...super.PARTS,
    content: {
      template: "modules/simple-shop-craft-5e/templates/craft-start-dialog/content.hbs",
      templates: [
        "modules/simple-shop-craft-5e/templates/partials/item-avatar-name.hbs",
        "modules/simple-shop-craft-5e/templates/partials/item-table.hbs"
      ]
    }
  };

  /* -------------------------------------------- */

  /**
   * Id of the recipe being crafted.
   * @type {string}
   */
  recipeId;

  /**
   * UUID of the selected crafting actor, or "" if none chosen.
   * @type {string}
   */
  selectedActorUuid;

  /**
   * Ids of owned items added as freeform materials.
   * @type {Set<string>}
   */
  #freeformIds = new Set();

  /**
   * Chosen tool proficiency key, when the recipe allows more than one.
   * @type {string|null}
   */
  #toolKey = null;

  /**
   * Whether the player has claimed workshop access in place of owning the tool.
   * @type {boolean}
   */
  #workshopClaimed = false;

  /**
   * Whether the shortfall between supplied material value and the threshold should be filled with gold.
   * @type {boolean}
   */
  #fillWithGold = false;

  /**
   * Selected quantity per criteria-slot candidate, keyed by `{index}:{itemId}`.
   * @type {Map<string, number>}
   */
  #materialQuantities = new Map();

  /**
   * Name of the resolved target item, cached as a title fallback once known.
   * @type {string|null}
   */
  #targetItemName = null;

  /* -------------------------------------------- */

  /**
   * The currently selected crafting actor.
   * @type {Actor5e|null}
   */
  get actor() {
    return this.selectedActorUuid ? fromUuidSync(this.selectedActorUuid) : null;
  }

  /* -------------------------------------------- */

  /**
   * The recipe being crafted.
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

  /** @inheritDoc */
  async _onRender(context, options) {
    await super._onRender(context, options);
    if ( this.hasFrame ) this.window.title.innerText = this.title;

    this.element.addEventListener("change", event => {
      if ( event.target.name === "selectedActor" ) {
        this.selectedActorUuid = event.target.value;
        this.#freeformIds.clear();
        this.#toolKey = null;
        this.#workshopClaimed = false;
        this.#fillWithGold = false;
        this.#materialQuantities.clear();
      }
      else if ( event.target.name === "toolKey" ) this.#toolKey = event.target.value;
      else if ( event.target.name === "workshopClaimed" ) this.#workshopClaimed = event.target.checked;
      else if ( event.target.name === "fillWithGold" ) this.#fillWithGold = event.target.checked;
      else return;
      this.render({ parts: ["content", "footer"] });
    });

    const dropArea = this.element.querySelector("[data-drop-area]");
    dropArea?.addEventListener("dragover", event => event.preventDefault());
    dropArea?.addEventListener("dragenter", () => dropArea.classList.add("is-dragover"));
    dropArea?.addEventListener("dragleave", event => {
      if ( event.currentTarget.contains(event.relatedTarget) ) return;
      dropArea.classList.remove("is-dragover");
    });
    dropArea?.addEventListener("drop", event => this.#onDropItem(event));

    this.element.querySelectorAll(".item-tooltip[data-uuid]").forEach(el => {
      const uuid = el.dataset.uuid;
      if ( !uuid ) return;
      el.dataset.tooltipHtml = loadingTooltip(uuid);
      el.dataset.tooltipClass = game.dnd5e.utils.loadingTooltip
        ? "dnd5e2 dnd5e-tooltip item-tooltip"
        : "dnd5e2 dnd5e-tooltip item-tooltip themed theme-light";
      el.dataset.tooltipDirection ??= "LEFT";
    });
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.state = await this.#computeState();
    this.#targetItemName = context.state.targetItem?.name ?? null;
    return context;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareContentContext(context, options) {
    context = await super._prepareContentContext(context, options);
    const state = context.state;

    context.actorOptions = [
      { value: "", label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.NoActorSelected") },
      ...selectableActors().map(a => ({ value: a.uuid, label: a.name }))
    ].map(o => ({ ...o, selected: o.value === this.selectedActorUuid }));
    context.recipe = state.recipe;
    context.targetItem = state.targetItem;
    context.displayName = state.recipe.name || state.targetItem?.name
      || _loc("SIMPLE_SHOP_CRAFT_5E.NewRecipePlaceholder");
    context.noActor = !state.actor;
    context.materialsTable = buildMaterialsTable(state);
    context.allowFreeform = state.recipe.allowFreeformMaterials;
    context.suppliedParts = breakdownCopper(state.suppliedCP);
    context.thresholdParts = breakdownCopper(state.thresholdCP);
    context.materialsMet = state.materialsMet;
    context.requiredMet = state.requiredMet;
    context.requiredAvailable = state.requiredAvailable;
    context.toolProficient = state.proficient;
    context.toolOwned = state.toolOwned;
    context.skillProficient = state.skillProficient;
    context.chosenToolKey = state.chosenToolKey;

    context.toolLabel = null;
    context.toolField = null;
    if ( state.chosenToolKey ) {
      const categories = await game.dnd5e.documents.Trait.categories("tool");
      if ( state.toolKeys.length > 1 ) {
        context.toolField = [{
          field: new foundry.data.fields.StringField(), name: "toolKey", value: state.chosenToolKey,
          label: _loc("SIMPLE_SHOP_CRAFT_5E.RECIPE.FIELDS.toolProficiencies.label"),
          options: state.toolKeys.map(key => ({
            value: key, label: categories.art?.children?.[key]?.label ?? categories[key]?.label ?? key
          }))
        }];
      } else {
        context.toolLabel = categories.art?.children?.[state.chosenToolKey]?.label
          ?? categories[state.chosenToolKey]?.label ?? state.chosenToolKey;
      }
    }

    context.workshopField = (state.chosenToolKey && state.recipe.allowWorkshopOverride)
      ? [{
        field: new foundry.data.fields.BooleanField(), name: "workshopClaimed", value: this.#workshopClaimed,
        label: _loc("SIMPLE_SHOP_CRAFT_5E.CraftStart.WorkshopAccess")
      }]
      : null;

    context.goldField = (state.shortfallCP > 0) ? [{
      field: new foundry.data.fields.BooleanField(), name: "fillWithGold", value: this.#fillWithGold,
      label: _loc("SIMPLE_SHOP_CRAFT_5E.CraftStart.FillWithGold")
    }] : null;
    context.fillWithGold = this.#fillWithGold;
    context.goldParts = state.goldCP > 0 ? breakdownCopper(state.goldCP) : [];
    context.goldInsufficient = state.goldInsufficient;

    return context;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareFooterContext(context, options) {
    context = await super._prepareFooterContext(context, options);
    context.buttons = [{
      type: "button", action: "startCraft", icon: "fas fa-hammer",
      label: "SIMPLE_SHOP_CRAFT_5E.CraftStart.Start", disabled: !context.state.canStart
    }];
    return context;
  }

  /* -------------------------------------------- */

  /**
   * Compute the current selection state: resolved target/materials, running value vs. threshold, gold
   * fill, and tool eligibility. Shared between rendering and the actual start action.
   * @returns {Promise<object>}
   */
  async #computeState() {
    const recipe = this.recipe;
    const actor = this.actor;

    const [targetResolved] = await resolveEntries([recipe.targetItem]);
    const targetItem = targetResolved.item;
    let craftCost = null;
    let weight = null;
    let halfPrice = null;
    if ( targetItem?.uuid ) {
      const fullTargetItem = await fromUuid(targetItem.uuid);
      if ( fullTargetItem?.system?.getCraftCost ) craftCost = await effectiveCraftCost(fullTargetItem);
      if ( fullTargetItem ) {
        weight = { ...fullTargetItem.system.weight };
        halfPrice = {
          value: Math.floor(fullTargetItem.system.price.value / 2),
          denomination: fullTargetItem.system.price.denomination
        };
      }
    }

    const materialsResolved = await resolveEntries(recipe.materials);
    const freeformItems = actor
      ? Array.from(this.#freeformIds).map(id => actor.items.get(id)).filter(Boolean)
      : [];
    const rawCandidates = materialsResolved.map(({ entry }) => {
      if ( !actor || !entry.criteria?.type ) return [];
      return actor.items.filter(i => {
        if ( i.type !== entry.criteria.type ) return false;
        if ( entry.criteria.subtype && (i.system.type?.value !== entry.criteria.subtype) ) return false;
        return true;
      });
    });
    const bundleSizes = await resolveBundleSizes([...rawCandidates.flat(), ...freeformItems]);

    const fixedLines = materialsResolved.map(({ entry, item }, index) => {
      if ( entry.criteria?.type ) {
        const minValueCP = (entry.value?.value != null) ? toCopper(entry.value.value, entry.value.denomination) : null;
        const candidates = rawCandidates[index]
          .filter(i => materialValueCP(i, bundleSizes.get(i.id)) >= (minValueCP ?? 0))
          .map(i => {
            const valueCP = materialValueCP(i, bundleSizes.get(i.id));
            return {
              id: i.id, name: i.name, img: i.img, uuid: i.uuid, owned: i.system.quantity,
              selected: Math.min(this.#materialQuantities.get(`${index}:${i.id}`) ?? 0, i.system.quantity),
              valueCP, price: breakdownCopper(valueCP)
            };
          });
        const suppliedUnits = candidates.reduce((sum, c) => sum + c.selected, 0);
        const suppliedLineCP = (minValueCP != null)
          ? Math.min(suppliedUnits, entry.quantity) * minValueCP
          : candidates.reduce((sum, c) => sum + (c.selected * c.valueCP), 0);
        const subtypeLabel = entry.criteria.subtype
          ? subtypeOptions([entry.criteria.type]).find(o => o.value === entry.criteria.subtype)?.label
          : null;
        const name = subtypeLabel ?? _loc(`TYPES.Item.${entry.criteria.type}Pl`);
        return {
          name, criteria: entry.criteria, candidates, index, required: entry.required, quantity: entry.quantity,
          suppliedUnits, suppliedLineCP, slotMet: suppliedUnits >= entry.quantity,
          priceOverride: (entry.value?.value != null) ? entry.value : null
        };
      }
      const materialIdentifier = item?.system?.identifier || entry.identifier;
      const owned = (actor && materialIdentifier)
        ? actor.items.find(i => i.system.identifier === materialIdentifier)
        : null;
      const maxUnits = owned ? Math.min(owned.system.quantity, entry.quantity) : 0;
      const overrideKey = owned ? `${index}:${owned.id}` : null;
      const suppliedUnits = owned ? Math.min(this.#materialQuantities.get(overrideKey) ?? 0, maxUnits) : 0;
      const itemBundleSize = (item?.system?.quantity > 1) ? item.system.quantity : 1;
      const itemValueCP = (entry.value?.value != null)
        ? toCopper(entry.value.value, entry.value.denomination)
        : (owned ? materialValueCP(owned, itemBundleSize) : 0);
      const ownedPrice = owned ? resolveItemPrice(owned) : null;
      return {
        name: item?.name ?? entry.identifier ?? entry.uuid, img: item?.img, item: owned,
        required: entry.required, quantity: entry.quantity, suppliedUnits, ownedQuantity: owned?.system.quantity ?? 0,
        suppliedLineCP: suppliedUnits * itemValueCP, slotMet: suppliedUnits >= entry.quantity,
        priceOverride: (entry.value?.value != null) ? entry.value : (ownedPrice
          ? { value: ownedPrice.value / itemBundleSize, denomination: ownedPrice.denomination }
          : null)
      };
    });
    const suppliedCP = fixedLines.reduce((sum, l) => sum + l.suppliedLineCP, 0)
      + freeformItems.reduce((sum, item) => sum + materialValueCP(item, bundleSizes.get(item.id)), 0);
    const thresholdCP = recipe.craftThreshold(craftCost, targetItem);
    const shortfallCP = Math.max(0, thresholdCP - suppliedCP);
    const materialsMet = recipe.ignoreCraftValue || (suppliedCP >= thresholdCP);
    const requiredMet = fixedLines.every(l => !l.required || l.slotMet);
    const requiredAvailable = fixedLines.every(l => {
      if ( !l.required ) return true;
      if ( l.criteria ) return l.candidates.reduce((sum, c) => sum + c.owned, 0) >= l.quantity;
      return l.ownedQuantity >= l.quantity;
    });

    let goldCP = 0;
    let goldInsufficient = false;
    if ( this.#fillWithGold && (shortfallCP > 0) && actor ) {
      goldCP = shortfallCP;
      const updates = game.dnd5e.applications.CurrencyManager.getActorCurrencyUpdates(actor, goldCP, "cp", {});
      goldInsufficient = !updates.remainder.almostEqual(0);
    }

    const toolKeys = Array.from(recipe.toolProficiencies);
    const chosenToolKey = (toolKeys.length > 1) ? (this.#toolKey ?? toolKeys[0]) : (toolKeys[0] ?? null);
    let proficient = true;
    let toolOwned = true;
    if ( chosenToolKey ) {
      proficient = !!actor && ((actor.system.tools[chosenToolKey]?.value ?? 0) > 0);
      toolOwned = !!actor?.items.some(i => (i.type === "tool") && (i.system.type?.baseItem === chosenToolKey));
    }
    const toolEligible = !chosenToolKey
      || (proficient && (toolOwned || (recipe.allowWorkshopOverride && this.#workshopClaimed)));

    const skillKeys = Array.from(recipe.skillProficiencies);
    const skillProficient = !!actor && skillKeys.some(k => (actor.system.skills[k]?.value ?? 0) > 0);

    const canStart = !!actor && !!targetItem && (toolEligible || skillProficient) && requiredMet
      && (materialsMet || (this.#fillWithGold && !goldInsufficient));

    const totalHours = recipe.durationOverride.value != null
      ? recipe.durationOverride.value * HOURS_PER_UNIT[recipe.durationOverride.units]
      : (craftCost?.days ?? 0) * HOURS_PER_USE;
    const hoursPerUse = Math.min(HOURS_PER_USE, totalHours);

    return {
      recipe, actor, targetItem, craftCost, fixedLines, freeformItems,
      suppliedCP, thresholdCP, shortfallCP, materialsMet, goldCP, goldInsufficient,
      toolKeys, chosenToolKey, proficient, toolOwned, toolEligible, skillProficient, canStart, totalHours,
      hoursPerUse, weight, halfPrice, requiredMet, requiredAvailable
    };
  }

  /* -------------------------------------------- */

  /**
   * Handle a drop of an owned item onto the freeform-materials drop area.
   * @param {DragEvent} event
   * @returns {Promise<void>}
   */
  async #onDropItem(event) {
    event.preventDefault();
    event.currentTarget.classList.remove("is-dragover");
    const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
    if ( data?.type !== "Item" ) return;
    const item = await Item.implementation.fromDropData(data);
    if ( !item || (item.parent !== this.actor) ) {
      ui.notifications.warn("SIMPLE_SHOP_CRAFT_5E.CraftStart.MustOwnMaterial", { localize: true });
      return;
    }
    this.#freeformIds.add(item.id);
    this.render({ parts: ["content", "footer"] });
  }

  /* -------------------------------------------- */

  /**
   * Handle removing a freeform material.
   * @this {CraftStartDialog}
   * @param {Event} event         Triggering click event.
   * @param {HTMLElement} target  Button that was clicked.
   */
  static #removeFreeformMaterial(event, target) {
    this.#freeformIds.delete(target.dataset.itemId);
    this.render({ parts: ["content", "footer"] });
  }

  /* -------------------------------------------- */

  /**
   * Handle adjusting how many units of a criteria-slot candidate are contributed.
   * @this {CraftStartDialog}
   * @param {Event} event         Triggering click event.
   * @param {HTMLElement} target  Button that was clicked.
   */
  static #stepMaterialCandidate(event, target) {
    const key = `${target.dataset.index}:${target.dataset.itemId}`;
    const step = Number(target.dataset.step);
    this.#materialQuantities.set(key, Math.max(0, (this.#materialQuantities.get(key) ?? 0) + step));
    this.render({ parts: ["content", "footer"] });
  }

  /* -------------------------------------------- */

  /**
   * Handle opening a criteria candidate's item sheet.
   * @param {Event} event         Triggering click event.
   * @param {HTMLElement} target  Button that was clicked.
   * @returns {Promise<void>}
   */
  static async #openItemSheet(event, target) {
    const item = await fromUuid(target.dataset.uuid);
    if ( item ) openItemSheet(item);
  }

  /* -------------------------------------------- */

  /**
   * Handle requesting the craft start: sends a GM-confirmation chat card.
   * @this {CraftStartDialog}
   * @returns {Promise<void>}
   */
  static async #startCraft() {
    const state = await this.#computeState();
    if ( !state.canStart ) return;

    const materialLines = [
      ...state.fixedLines.flatMap(l => l.criteria
        ? l.candidates.filter(c => c.selected > 0)
          .map(c => ({ item: state.actor.items.get(c.id), quantity: c.selected }))
        : ((l.item && (l.suppliedUnits > 0)) ? [{ item: l.item, quantity: l.suppliedUnits }] : [])),
      ...state.freeformItems.map(item => ({ item, quantity: 1 }))
    ];
    await CraftMessageData.create({
      actor: state.actor, recipe: state.recipe, targetItem: state.targetItem,
      materialLines,
      goldCP: state.goldCP, toolKey: state.chosenToolKey, totalHours: state.totalHours,
      hoursPerUse: state.hoursPerUse, weight: state.weight, halfPrice: state.halfPrice
    });
    ui.notifications.info("SIMPLE_SHOP_CRAFT_5E.CraftStart.Requested", { localize: true });
    this.close();
  }
}

/* -------------------------------------------- */

/**
 * Build item-table row data for the crafting-materials list: fixed material lines, one row per criteria
 * slot (with its candidates nested as an activity list), and freeform items.
 * @param {object} state  Computed dialog state.
 * @returns {{ hasRows: boolean, emptyLabel: string, sections: object[] }}
 */
function buildMaterialsTable(state) {
  const requiredTooltip = "SIMPLE_SHOP_CRAFT_5E.CraftStart.MaterialRequired";
  const rows = state.fixedLines.map((line, index) => {
    const shared = { index, required: line.required, requiredEditable: false, requiredTooltip };
    const price = line.priceOverride ? [line.priceOverride] : null;
    if ( line.criteria ) {
      return {
        ...shared, img: "systems/dnd5e/icons/svg/item-choice.svg", name: line.name, price,
        subtitle: line.candidates.length
          ? _loc("SIMPLE_SHOP_CRAFT_5E.MaterialRule")
          : _loc("SIMPLE_SHOP_CRAFT_5E.CraftStart.MaterialMissing"),
        quantityLabel: `${line.suppliedUnits}/${line.quantity}`, candidates: line.candidates
      };
    }
    return {
      ...shared, img: line.img, name: line.name, uuid: line.item?.uuid ?? null, price,
      showQuantity: !!line.item, quantity: line.suppliedUnits, itemId: line.item?.id ?? null,
      quantityLabel: line.item ? line.suppliedUnits : null,
      subtitle: (line.ownedQuantity >= line.quantity)
        ? null
        : (line.ownedQuantity > 0
          ? game.i18n.format("SIMPLE_SHOP_CRAFT_5E.CraftStart.MaterialInsufficient",
            { owned: line.ownedQuantity, required: line.quantity })
          : _loc("SIMPLE_SHOP_CRAFT_5E.CraftStart.MaterialMissing"))
    };
  });
  for ( const item of state.freeformItems ) {
    rows.push({
      img: item.img, name: item.name, uuid: item.uuid,
      removable: true, removeTooltip: "SIMPLE_SHOP_CRAFT_5E.RemoveMaterial", itemId: item.id
    });
  }

  return buildItemTableSections({
    groups: rows.length ? [{ label: "", items: rows }] : [],
    emptyLabel: "SIMPLE_SHOP_CRAFT_5E.CraftStart.MaterialsNone",
    columns: [
      { id: "name", label: "SIMPLE_SHOP_CRAFT_5E.Material" },
      { id: "price", label: "DND5E.Price" },
      { id: "quantity", label: "DND5E.Quantity" }, { id: "controls" }
    ],
    rowTemplate: "modules/simple-shop-craft-5e/templates/partials/material-row.hbs"
  });
}

/* -------------------------------------------- */

/**
 * Resolve an owned item's contributed value in copper, per unit — via its own price or the rarity-based
 * fallback, divided by its canonical bundle size (e.g. a stack of 20 arrows priced as a whole).
 * @param {Item5e} item
 * @param {number} [bundleSize]
 * @returns {number}
 */
function materialValueCP(item, bundleSize=1) {
  const price = needsDefaultPrice(item) ? resolveItemPrice(item) : item.system.price;
  if ( !price?.value ) return 0;
  return toCopper(price.value / bundleSize, price.denomination);
}
