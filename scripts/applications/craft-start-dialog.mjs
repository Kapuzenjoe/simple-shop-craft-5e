import { createCraftMessage } from "../chat/craft-card.mjs";
import { HOURS_PER_USE } from "../config.mjs";
import { getRecipe } from "../data/recipe-store.mjs";
import { breakdownCopper, effectiveCraftCost, resolveDefaultPrice, toCopper } from "../shop/currency.mjs";
import { needsDefaultPrice } from "../shop/pricing.mjs";
import { resolveEntries, selectableActors } from "../utils.mjs";

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
      removeFreeformMaterial: CraftStartDialog.#removeFreeformMaterial,
      startCraft: CraftStartDialog.#startCraft
    }
  };

  /* -------------------------------------------- */

  /** @override */
  static PARTS = {
    ...super.PARTS,
    content: { template: "modules/simple-shop-craft-5e/templates/craft-start-dialog/content.hbs" }
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
    return getRecipe(this.recipeId);
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
    context.fixedMaterials = state.fixedLines;
    context.freeformItems = state.freeformItems.map(item => ({ id: item.id, name: item.name, img: item.img }));
    context.allowFreeform = state.recipe.allowFreeformMaterials;
    context.suppliedParts = breakdownCopper(state.suppliedCP);
    context.thresholdParts = breakdownCopper(state.thresholdCP);
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
    const fixedLines = materialsResolved.map(({ entry, item }) => {
      const owned = (actor && entry.identifier)
        ? actor.items.find(i => i.system.identifier === entry.identifier)
        : null;
      return { name: item?.name ?? entry.identifier ?? entry.uuid, img: item?.img, item: owned };
    });

    const freeformItems = actor
      ? Array.from(this.#freeformIds).map(id => actor.items.get(id)).filter(Boolean)
      : [];
    const includedItems = [...fixedLines.filter(l => l.item).map(l => l.item), ...freeformItems];
    const suppliedCP = includedItems.reduce((sum, item) => sum + materialValueCP(item), 0);
    const thresholdCP = craftThresholdCP(recipe, craftCost);
    const shortfallCP = Math.max(0, thresholdCP - suppliedCP);
    const materialsMet = suppliedCP >= thresholdCP;

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

    const canStart = !!actor && !!targetItem && (toolEligible || skillProficient)
      && (materialsMet || (this.#fillWithGold && !goldInsufficient));

    const totalHours = recipe.durationOverride.value != null
      ? recipe.durationOverride.value * HOURS_PER_UNIT[recipe.durationOverride.units]
      : (craftCost?.days ?? 0) * HOURS_PER_USE;

    return {
      recipe, actor, targetItem, craftCost, fixedLines, freeformItems,
      suppliedCP, thresholdCP, shortfallCP, materialsMet, goldCP, goldInsufficient,
      toolKeys, chosenToolKey, proficient, toolOwned, toolEligible, skillProficient, canStart, totalHours, weight, halfPrice
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
   * Handle requesting the craft start: sends a GM-confirmation chat card.
   * @this {CraftStartDialog}
   * @returns {Promise<void>}
   */
  static async #startCraft() {
    const state = await this.#computeState();
    if ( !state.canStart ) return;

    await createCraftMessage({
      actor: state.actor, recipe: state.recipe, targetItem: state.targetItem,
      materialLines: [...state.fixedLines.filter(l => l.item), ...state.freeformItems.map(item => ({ item }))],
      goldCP: state.goldCP, toolKey: state.chosenToolKey, totalHours: state.totalHours,
      weight: state.weight, halfPrice: state.halfPrice
    });
    ui.notifications.info("SIMPLE_SHOP_CRAFT_5E.CraftStart.Requested", { localize: true });
    this.close();
  }
}

/* -------------------------------------------- */

/**
 * Resolve a recipe's material-value threshold in copper: its own explicit threshold if set, otherwise the
 * rules-based crafting cost of the target item.
 * @param {Recipe} recipe
 * @param {{ gold: number, days: number }|null} craftCost
 * @returns {number}
 */
function craftThresholdCP(recipe, craftCost) {
  const explicit = Object.entries(recipe.materialPrice)
    .reduce((sum, [denom, value]) => sum + toCopper(value ?? 0, denom), 0);
  if ( explicit > 0 ) return explicit;
  return craftCost ? toCopper(craftCost.gold, "gp") : 0;
}

/* -------------------------------------------- */

/**
 * Resolve an owned item's contributed value in copper, via its own price or the rarity-based fallback.
 * @param {Item5e} item
 * @returns {number}
 */
function materialValueCP(item) {
  const price = needsDefaultPrice(item) ? resolveDefaultPrice(item) : item.system.price;
  if ( !price?.value ) return 0;
  return toCopper(price.value, price.denomination);
}
