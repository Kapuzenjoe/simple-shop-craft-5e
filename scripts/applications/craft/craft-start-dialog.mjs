import { CraftMessageData } from "../../data/craft-message.mjs";
import { Recipe } from "../../data/recipe-data.mjs";
import {
  applyDropArea, applyLoadingTooltip, breakdownCopper, buildItemTableSections, matchIdentifier, maxHoursPerWorkday,
  openItemSheet, recipeCraftCost, resolveEntries, resolveTotalHours, resolveUnitPrice, selectableActors,
  subtypeOptions, toCopper
} from "../../utils.mjs";

const { Dialog5e } = game.dnd5e.applications.api;

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
      chooseSpell: CraftStartDialog.#chooseSpell,
      openItemSheet: CraftStartDialog.#openItemSheet,
      removeMaterial: CraftStartDialog.#removeMaterial,
      removeSpell: CraftStartDialog.#removeSpell,
      startCraft: CraftStartDialog.#startCraft,
      stepMaterialQuantity: CraftStartDialog.#stepMaterialQuantity
    }
  };

  /* -------------------------------------------- */

  /** @override */
  static PARTS = {
    ...super.PARTS,
    content: {
      template: "modules/simple-shop-craft-5e/templates/craft/craft-start-dialog/content.hbs",
      templates: [
        "modules/simple-shop-craft-5e/templates/shared/item-avatar-name.hbs",
        "modules/simple-shop-craft-5e/templates/shared/item-table.hbs"
      ]
    }
  };

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * Id of the recipe being crafted.
   * @type {string}
   */
  recipeId;

  /* -------------------------------------------- */

  /**
   * UUID of the selected crafting actor, or "" if none chosen.
   * @type {string}
   */
  selectedActorUuid;

  /* -------------------------------------------- */

  /**
   * Ids of owned items added as freeform materials.
   * @type {Set<string>}
   */
  #freeformIds = new Set();

  /* -------------------------------------------- */

  /**
   * Chosen tool proficiency key, when the recipe allows more than one.
   * @type {string|null}
   */
  #toolKey = null;

  /* -------------------------------------------- */

  /**
   * Whether the player has claimed workshop access in place of owning the tool.
   * @type {boolean}
   */
  #workshopClaimed = false;

  /* -------------------------------------------- */

  /**
   * Whether the shortfall between supplied material value and the threshold should be filled with gold.
   * @type {boolean}
   */
  #fillWithGold = false;

  /* -------------------------------------------- */

  /**
   * Selected quantity per material candidate, keyed by `{index}:{itemId}`.
   * @type {Map<string, number>}
   */
  #materialQuantities = new Map();

  /* -------------------------------------------- */

  /**
   * Number of runs of the recipe to craft at once.
   * @type {number}
   */
  #count = 1;

  /* -------------------------------------------- */

  /**
   * Name of the resolved target item, cached as a title fallback once known.
   * @type {string|null}
   */
  #targetItemName = null;

  /* -------------------------------------------- */

  /**
   * UUID of the chosen spell for a spell-scroll recipe.
   * @type {string|null}
   */
  #chosenSpellUuid = null;

  /* -------------------------------------------- */

  /**
   * Save DC override for a spell-scroll recipe, or `null` to use the computed default.
   * @type {number|null}
   */
  #scrollDC = null;

  /* -------------------------------------------- */

  /**
   * Attack bonus override for a spell-scroll recipe, or `null` to use the computed default.
   * @type {number|null}
   */
  #scrollBonus = null;

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
    return this.#targetItemName || _loc("SIMPLE_SHOP_CRAFT_5E.NewRecipePlaceholder");
  }

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.state = await this.#computeState();
    this.#targetItemName = context.state.recipe.displayName(context.state.targetItem);
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
    context.displayName = this.#targetItemName;
    context.noActor = !state.actor;

    context.countField = (state.targetItem?.type === "container") ? null : [{
      field: new foundry.data.fields.NumberField({ integer: true, min: 1 }), name: "count", value: state.count,
      label: _loc("DND5E.Quantity")
    }];

    context.spellField = null;
    context.noEligibleSpell = false;
    context.chosenSpell = null;
    context.spellValueFields = null;
    if ( state.recipe.spellScroll ) {
      if ( state.recipe.spellScroll.spellSource === "compendium" ) {
        context.chosenSpell = state.chosenSpell;
      } else {
        context.noEligibleSpell = !state.spellOptions.length;
        if ( state.spellOptions.length ) {
          context.spellField = [{
            field: new foundry.data.fields.StringField(), name: "spellUuid", value: state.chosenSpell?.uuid ?? "",
            options: state.spellOptions.map(i => ({ value: i.uuid, label: i.name }))
          }];
        }
      }
      context.spellValueFields = [
        {
          field: new foundry.data.fields.NumberField(), name: "scrollDC", value: state.scrollValues?.dc,
          label: _loc("DND5E.Scroll.SaveDC")
        },
        {
          field: new foundry.data.fields.NumberField(), name: "scrollBonus", value: state.scrollValues?.bonus,
          label: _loc("DND5E.BonusAttack")
        }
      ];
    }

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
    context.skillRequired = state.skillRequired;
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

    context.statusList = (!state.chosenToolKey && (state.toolStatuses.length || state.skillStatuses.length)) ? [
      ...state.toolStatuses.map(({ key, met }) => ({
        met, label: game.dnd5e.documents.Trait.keyLabel(key, { trait: "tool" })
      })),
      ...state.skillStatuses.map(({ key, proficient: met }) => ({
        met, label: _loc(CONFIG.DND5E.skills[key]?.label ?? key)
      }))
    ] : null;

    context.workshopField = ((state.chosenToolKey || state.toolStatuses.length) && state.recipe.allowWorkshopOverride)
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
  /*  Life-Cycle Handlers                         */
  /* -------------------------------------------- */

  /** @inheritDoc */
  async _onRender(context, options) {
    await super._onRender(context, options);
    if ( this.hasFrame ) this.window.title.innerText = this.title;

    applyDropArea(this.element.querySelector("[data-drop-area]"), event => this.#onDropItem(event));

    this.element.querySelectorAll(".item-tooltip[data-uuid]").forEach(applyLoadingTooltip);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onChangeForm(formConfig, event) {
    super._onChangeForm(formConfig, event);
    if ( event.target.name === "selectedActor" ) {
      this.selectedActorUuid = event.target.value;
      this.#freeformIds.clear();
      this.#toolKey = null;
      this.#workshopClaimed = false;
      this.#fillWithGold = false;
      this.#materialQuantities.clear();
      this.#chosenSpellUuid = null;
      this.#scrollDC = null;
      this.#scrollBonus = null;
    }
    else if ( event.target.name === "toolKey" ) this.#toolKey = event.target.value;
    else if ( event.target.name === "count" ) this.#count = Math.max(1, Math.floor(Number(event.target.value)) || 1);
    else if ( event.target.name === "workshopClaimed" ) this.#workshopClaimed = event.target.checked;
    else if ( event.target.name === "fillWithGold" ) this.#fillWithGold = event.target.checked;
    else if ( event.target.name === "spellUuid" ) this.#chosenSpellUuid = event.target.value || null;
    else if ( event.target.name === "scrollDC" ) this.#scrollDC = event.target.value === "" ? null : Number(event.target.value);
    else if ( event.target.name === "scrollBonus" ) this.#scrollBonus = event.target.value === "" ? null : Number(event.target.value);
    else return;
    this.render({ parts: ["content", "footer"] });
  }

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers                */
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
  static #removeMaterial(event, target) {
    this.#freeformIds.delete(target.dataset.itemId);
    this.render({ parts: ["content", "footer"] });
  }

  /* -------------------------------------------- */

  /**
   * Handle adjusting how many units of a material candidate are contributed.
   * @this {CraftStartDialog}
   * @param {Event} event         Triggering click event.
   * @param {HTMLElement} target  Button that was clicked.
   */
  static #stepMaterialQuantity(event, target) {
    const key = `${target.dataset.index}:${target.dataset.itemId}`;
    const step = Number(target.dataset.step);
    const max = Number(target.dataset.max ?? Infinity);
    const physicalMax = Number(target.dataset.physicalMax ?? max);
    const current = Math.min(this.#materialQuantities.get(key) ?? 0, max);
    this.#materialQuantities.set(key, Math.min(physicalMax, Math.max(0, current + step)));
    this.render({ parts: ["content", "footer"] });
  }

  /* -------------------------------------------- */

  /**
   * Handle opening a material's or criteria candidate's item sheet.
   * @this {CraftStartDialog}
   * @param {Event} event         Triggering click event.
   * @param {HTMLElement} target  Element that was clicked.
   * @returns {Promise<void>}
   */
  static async #openItemSheet(event, target) {
    const item = await fromUuid(target.dataset.uuid);
    if ( item ) openItemSheet(item);
  }

  /* -------------------------------------------- */

  /**
   * Handle picking the spell for a compendium-source spell-scroll recipe, locked to its configured level.
   * @this {CraftStartDialog}
   * @returns {Promise<void>}
   */
  static async #chooseSpell() {
    if ( !this.recipe?.spellScroll ) {
      this.render({ parts: ["content", "footer"] });
      return;
    }
    const uuid = await game.dnd5e.applications.CompendiumBrowser.selectOne({
      tab: "spells",
      filters: { locked: {
        types: new Set(["spell"]),
        additional: { level: { min: this.recipe.spellScroll.level, max: this.recipe.spellScroll.level } }
      } }
    });
    if ( !uuid ) return;
    this.#chosenSpellUuid = uuid;
    this.render({ parts: ["content", "footer"] });
  }

  /* -------------------------------------------- */

  /**
   * Handle clearing the chosen compendium spell.
   * @this {CraftStartDialog}
   */
  static #removeSpell() {
    this.#chosenSpellUuid = null;
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

    const materialLines = [
      ...state.fixedLines.flatMap(l => l.candidates.filter(c => c.selected > 0)
        .map(c => ({ item: state.actor.items.get(c.id), quantity: c.selected }))),
      ...state.freeformItems.map(item => ({ item, quantity: 1 }))
    ];
    await CraftMessageData.create({
      actor: state.actor, recipe: state.recipe, targetItem: state.chosenSpell ?? state.targetItem,
      materialLines, spellUuid: state.chosenSpell?.uuid ?? null, scrollValues: state.scrollValues,
      goldCP: state.goldCP, toolKey: state.chosenToolKey, totalHours: state.totalHours,
      hoursPerUse: state.hoursPerUse, weight: state.weight, halfPrice: state.halfPrice, count: state.count
    });
    ui.notifications.info("SIMPLE_SHOP_CRAFT_5E.CraftStart.Requested", { localize: true });
    this.close();
  }

  /* -------------------------------------------- */
  /*  Helpers                                     */
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
    const count = (targetItem?.type === "container") ? 1 : this.#count;
    const craftCost = await recipeCraftCost(recipe, targetItem);
    let weight = null;
    let halfPrice = null;
    if ( !recipe.spellScroll && targetItem?.uuid ) {
      const fullTargetItem = await fromUuid(targetItem.uuid);
      if ( fullTargetItem ) {
        weight = { ...fullTargetItem.system.weight, value: fullTargetItem.system.weight.value * count };
        halfPrice = {
          value: Math.floor(fullTargetItem.system.price.value / 2) * count,
          denomination: fullTargetItem.system.price.denomination
        };
      }
    }

    let spellOptions = null;
    let chosenSpell = null;
    let scrollValues = null;
    if ( recipe.spellScroll ) {
      if ( recipe.spellScroll.spellSource === "compendium" ) {
        chosenSpell = this.#chosenSpellUuid ? await fromUuid(this.#chosenSpellUuid) : null;
      } else {
        spellOptions = actor ? actor.items.filter(i => (i.type === "spell")
          && (i.system.level === recipe.spellScroll.level)
          && ((recipe.spellScroll.spellSource !== "prepared")
            || !CONFIG.DND5E.spellcasting[i.system.method]?.prepares || i.system.prepared || !i.system.level)) : [];
        chosenSpell = spellOptions.find(i => i.uuid === this.#chosenSpellUuid) ?? spellOptions[0] ?? null;
        this.#chosenSpellUuid = chosenSpell?.uuid ?? null;
      }
      const fallback = CONFIG.DND5E.spellScrollValues[recipe.spellScroll.level] ?? {};
      scrollValues = {
        dc: this.#scrollDC ?? (actor ? actor.system.attributes.spell.dc : fallback.dc),
        bonus: this.#scrollBonus ?? (actor ? actor.system.attributes.spell.attack : fallback.bonus)
      };
    }

    const materialsResolved = await resolveEntries(recipe.materials);
    const freeformItems = actor
      ? Array.from(this.#freeformIds).map(id => actor.items.get(id)).filter(Boolean)
      : [];
    const rawCandidates = materialsResolved.map(({ entry, item }) => {
      if ( !actor ) return [];
      if ( entry.criteria?.type ) {
        return actor.items.filter(i => {
          if ( i.type !== entry.criteria.type ) return false;
          if ( entry.criteria.subtype && (i.system.type?.value !== entry.criteria.subtype) ) return false;
          return true;
        });
      }
      const identifier = matchIdentifier(entry, item);
      return identifier
        ? actor.items.filter(i => (i.system.identifier === identifier) && (!item || (i.type === item.type)))
        : [];
    });
    const allocated = new Map(freeformItems.map(item => [item.id, 1]));

    const fixedLines = materialsResolved.map(({ entry, item }, index) => {
      const isRule = !!entry.criteria?.type;
      const needed = entry.quantity * count;
      const limit = isRule ? Infinity : needed;
      const minValueCP = (entry.value?.value != null) ? toCopper(entry.value.value, entry.value.denomination) : null;
      let suppliedUnits = 0;
      const candidates = rawCandidates[index]
        .filter(i => !isRule || (materialValueCP(i) >= (minValueCP ?? 0)))
        .map(i => {
          const valueCP = materialValueCP(i);
          const available = Math.max(0, i.system.quantity - (allocated.get(i.id) ?? 0));
          const max = Math.min(available, limit - suppliedUnits);
          const requested = this.#materialQuantities.get(`${index}:${i.id}`) ?? 0;
          const selected = Math.min(requested, max);
          suppliedUnits += selected;
          allocated.set(i.id, (allocated.get(i.id) ?? 0) + selected);
          return {
            id: i.id, name: i.name, img: i.img, uuid: i.uuid, available, max, selected, valueCP,
            quantity: i.system.quantity,
            price: breakdownCopper(valueCP)
          };
        });
      const suppliedLineCP = (minValueCP != null)
        ? Math.min(suppliedUnits, needed) * minValueCP
        : candidates.reduce((sum, c) => sum + (c.selected * c.valueCP), 0);
      const subtypeLabel = entry.criteria?.subtype
        ? subtypeOptions([entry.criteria.type]).find(o => o.value === entry.criteria.subtype)?.label
        : null;
      const name = isRule
        ? (subtypeLabel ?? _loc(`TYPES.Item.${entry.criteria.type}Pl`))
        : (item?.name || entry.identifier || entry.uuid);
      return {
        name, img: item?.img, uuid: item?.uuid ?? null, criteria: isRule ? entry.criteria : null, candidates, index,
        required: entry.required, quantity: needed, suppliedUnits,
        availableUnits: candidates.reduce((sum, c) => sum + c.available, 0), suppliedLineCP,
        slotMet: suppliedUnits >= needed,
        priceOverride: (entry.value?.value != null) ? entry.value : null
      };
    });
    const suppliedCP = fixedLines.reduce((sum, l) => sum + l.suppliedLineCP, 0)
      + freeformItems.reduce((sum, item) => sum + materialValueCP(item), 0);
    const thresholdCP = recipe.craftThreshold(craftCost, targetItem) * count;
    const shortfallCP = Math.max(0, thresholdCP - suppliedCP);
    const materialsMet = recipe.ignoreCraftValue || (suppliedCP >= thresholdCP);
    const requiredMet = fixedLines.every(l => !l.required || l.slotMet);
    const requiredAvailable = fixedLines.every(l => !l.required || (l.availableUnits >= l.quantity));

    let goldCP = 0;
    let goldInsufficient = false;
    if ( this.#fillWithGold && (shortfallCP > 0) && actor ) {
      goldCP = shortfallCP;
      const updates = game.dnd5e.applications.CurrencyManager.getActorCurrencyUpdates(actor, goldCP, "cp", {});
      goldInsufficient = !updates.remainder.almostEqual(0);
    }

    const toolKeys = Array.from(recipe.toolProficiencies);
    const skillKeys = Array.from(recipe.skillProficiencies);
    const mode = recipe.proficiencyMode;

    const toolStatuses = toolKeys.map(key => {
      const keyProficient = !!actor && ((actor.system.tools[key]?.value ?? 0) > 0);
      const owned = !!actor?.items.some(i => (i.type === "tool") && (i.system.type?.baseItem === key));
      return {
        key, proficient: keyProficient, owned,
        met: keyProficient && (owned || (recipe.allowWorkshopOverride && this.#workshopClaimed))
      };
    });
    const skillStatuses = skillKeys.map(key => ({
      key, proficient: !!actor && ((actor.system.skills[key]?.value ?? 0) > 0)
    }));

    const chosenToolKey = (mode === "both")
      ? ((toolKeys.length > 1) ? (this.#toolKey ?? toolKeys[0]) : (toolKeys[0] ?? null))
      : null;
    const chosenTool = toolStatuses.find(t => t.key === chosenToolKey) ?? {};
    const proficient = chosenToolKey ? !!chosenTool.proficient : true;
    const toolOwned = chosenToolKey ? !!chosenTool.owned : true;
    const toolEligible = !chosenToolKey || !!chosenTool.met;

    const skillProficient = skillStatuses.some(s => s.proficient);
    const skillEligible = !skillKeys.length || skillProficient;

    let proficiencyEligible = toolEligible && skillEligible;
    if ( mode === "all" ) {
      proficiencyEligible = toolStatuses.every(t => t.met) && skillStatuses.every(s => s.proficient);
    } else if ( mode === "either" ) {
      proficiencyEligible = (!toolKeys.length && !skillKeys.length)
        || toolStatuses.some(t => t.met) || skillStatuses.some(s => s.proficient);
    }

    const spellChosen = !recipe.spellScroll || !!chosenSpell;
    const canStart = !!actor && !!targetItem && spellChosen && proficiencyEligible && requiredMet
      && (materialsMet || (this.#fillWithGold && !goldInsufficient));

    const totalHours = resolveTotalHours(recipe, craftCost, targetItem);
    const hoursPerUse = Math.min(maxHoursPerWorkday(), totalHours);

    return {
      recipe, actor, targetItem, craftCost, fixedLines, freeformItems,
      suppliedCP, thresholdCP, shortfallCP, materialsMet, goldCP, goldInsufficient,
      toolKeys, chosenToolKey, proficient, toolOwned, toolEligible, skillProficient,
      skillRequired: skillKeys.length > 0, toolStatuses, skillStatuses, canStart, totalHours,
      hoursPerUse, weight, halfPrice, count, requiredMet, requiredAvailable, spellOptions, chosenSpell,
      scrollValues
    };
  }
}

/* -------------------------------------------- */

/**
 * Build item-table row data for the crafting-materials list: one row per material line (with its candidates
 * nested as an activity list), and freeform items.
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
      ...shared, img: line.img, name: line.name, uuid: line.uuid, price,
      quantityLabel: `${line.suppliedUnits}/${line.quantity}`, candidates: line.candidates,
      subtitle: (line.availableUnits >= line.quantity)
        ? null
        : (line.availableUnits > 0
          ? _loc("SIMPLE_SHOP_CRAFT_5E.CraftStart.MaterialInsufficient",
            { owned: line.availableUnits, required: line.quantity })
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
    groups: rows.length ? [{ label: "SIMPLE_SHOP_CRAFT_5E.Material", items: rows }] : [],
    emptyLabel: "SIMPLE_SHOP_CRAFT_5E.CraftStart.MaterialsNone",
    columns: [
      { id: "price", label: "DND5E.Price" },
      { id: "quantity", label: "DND5E.Quantity" }, { id: "controls" }
    ],
    rowTemplate: "modules/simple-shop-craft-5e/templates/shared/material-row.hbs"
  });
}

/* -------------------------------------------- */

/**
 * Resolve an owned item's contributed value in copper, per unit — via its own price or the rarity-based
 * fallback, divided by its bundle size (e.g. a stack of 20 arrows priced as a whole).
 * @param {Item5e} item
 * @returns {number}
 */
function materialValueCP(item) {
  const price = resolveUnitPrice(item);
  return price ? toCopper(price.value, price.denomination) : 0;
}
