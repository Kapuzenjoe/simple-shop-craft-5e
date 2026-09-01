import { Recipe } from "../data/recipe-data.mjs";
import { Shop } from "../data/shop-data.mjs";
import {
  applyItemFilters, applyItemSort, applyLoadingTooltip, breakdownCopper, buildItemTableSections, effectiveCraftCost,
  finalizeGroups, formatDuration, resolveEntries, resolveTotalHours, toCopper
} from "../utils.mjs";

import CraftStartDialog from "./craft/craft-start-dialog.mjs";
import RecipeSheet from "./craft/recipe-sheet.mjs";
import ShopCreateDialog from "./shops/shop-create-dialog.mjs";
import ShopSheet from "./shops/shop-sheet.mjs";

const { Application5e } = game.dnd5e.applications.api;

/**
 * Cycle-able Shops-list sort modes, in cycle order.
 * @type {Record<string, { icon: string, label: string }>}
 */
const SHOP_SORT_MODES = {
  name: { icon: "fa-solid fa-arrow-down-a-z", label: "SIMPLE_SHOP_CRAFT_5E.ShopEditor.SortByName" },
  settlementCap: { icon: "fa-solid fa-arrow-down-1-9", label: "SIMPLE_SHOP_CRAFT_5E.ShopManager.Shops.SortBySettlementCap" }
};

/**
 * Cycle-able Recipes-list sort modes, in cycle order.
 * @type {Record<string, { icon: string, label: string }>}
 */
const RECIPE_SORT_MODES = {
  name: { icon: "fa-solid fa-arrow-down-a-z", label: "SIMPLE_SHOP_CRAFT_5E.ShopEditor.SortByName" },
  materialValue: { icon: "fa-solid fa-arrow-down-1-9", label: "SIMPLE_SHOP_CRAFT_5E.ShopManager.Recipes.SortByMaterialValue" }
};

/**
 * GM-facing application for managing shops.
 */
export default class ShopManager extends Application5e {

  /** @override */
  static DEFAULT_OPTIONS = {
    id: "shop-manager",
    classes: ["simple-shop-craft-5e", "shop-manager", "standard-form"],
    window: {
      title: "SIMPLE_SHOP_CRAFT_5E.ShopManager.Title",
      resizable: true
    },
    position: {
      width: 720,
      height: 640
    },
    actions: {
      createRecipe: ShopManager.#createRecipe,
      createShop: ShopManager.#createShop,
      editRecipe: ShopManager.#editRecipe,
      editShop: ShopManager.#editShop,
      startCraft: ShopManager.#startCraft,
      toggleActive: ShopManager.#toggleActive
    }
  };

  /* -------------------------------------------- */

  /** @override */
  static PARTS = {
    tabs: { template: "templates/generic/tab-navigation.hbs" },
    shops: {
      template: "modules/simple-shop-craft-5e/templates/shop-manager/shops.hbs",
      templates: ["modules/simple-shop-craft-5e/templates/partials/item-avatar-name.hbs"]
    },
    recipes: {
      template: "modules/simple-shop-craft-5e/templates/shop-manager/recipes.hbs",
      templates: ["modules/simple-shop-craft-5e/templates/partials/item-avatar-name.hbs"]
    }
  };

  /* -------------------------------------------- */

  /** @override */
  static TABS = {
    primary: {
      tabs: [
        { id: "shops", label: "SIMPLE_SHOP_CRAFT_5E.ShopManager.Tabs.Shops" },
        { id: "recipes", label: "SIMPLE_SHOP_CRAFT_5E.ShopManager.Tabs.Recipes" }
      ],
      initial: "shops"
    }
  };

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * Current name search query for the shops list.
   * @type {string}
   */
  #shopSearch = "";

  /* -------------------------------------------- */

  /**
   * Current sort mode for the shops list, a key of {@link SORT_MODES}.
   * @type {"name"|"settlementCap"}
   */
  #shopSort = "name";

  /* -------------------------------------------- */

  /**
   * Current name search query for the recipes list.
   * @type {string}
   */
  #recipeSearch = "";

  /* -------------------------------------------- */

  /**
   * Current item-type filter for the recipes list. Empty string means no filter.
   * @type {string}
   */
  #recipeTypeFilter = "";

  /* -------------------------------------------- */

  /**
   * Current sort mode for the recipes list, a key of {@link RECIPE_SORT_MODES}.
   * @type {"name"|"materialValue"}
   */
  #recipeSort = "name";

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.isGM = game.user.isGM;
    const shops = Shop.getAll().filter(s => context.isGM || s.active);
    const byName = (a, b) => a.name.localeCompare(b.name);
    const capCP = shop => shop.settlementCap.value == null
      ? Number.MAX_SAFE_INTEGER
      : toCopper(shop.settlementCap.value, shop.settlementCap.denomination);
    const sorted = (this.#shopSort === "settlementCap")
      ? shops.toSorted((a, b) => (capCP(a) - capCP(b)) || byName(a, b))
      : shops.toSorted(byName);
    const rows = sorted.map(shop => ({
      shop,
      npc: shop.npc ? fromUuidSync(shop.npc) : null,
      openingHours: shop.openingHoursDisplay(),
      subtitle: shop.location,
      settlementCapDisplay: (shop.settlementCap.value != null) ? breakdownCopper(capCP(shop)) : null,
      template: "modules/simple-shop-craft-5e/templates/shop-manager/shop-row.hbs"
    }));
    const columns = [
      { id: "npc", label: "SIMPLE_SHOP_CRAFT_5E.Owner" },
      { id: "openingHours", label: "SIMPLE_SHOP_CRAFT_5E.ShopEditor.OpeningHours" },
      { id: "settlementCap", label: "SIMPLE_SHOP_CRAFT_5E.ShopEditor.SettlementCap" },
      { id: "active", label: "SIMPLE_SHOP_CRAFT_5E.ShopManager.Shops.Status" },
      { id: "controls" }
    ];
    const sections = context.isGM
      ? [
        { label: "SIMPLE_SHOP_CRAFT_5E.ShopManager.Shops.Active", columns, rows: rows.filter(r => r.shop.active) },
        { label: "SIMPLE_SHOP_CRAFT_5E.ShopManager.Shops.Inactive", columns, rows: rows.filter(r => !r.shop.active) }
      ].filter(s => s.rows.length)
      : [{ label: "SIMPLE_SHOP_CRAFT_5E.Shop", columns, rows }];
    context.table = {
      hasRows: rows.length > 0,
      emptyLabel: "SIMPLE_SHOP_CRAFT_5E.ShopManager.Shops.None",
      sections
    };
    const recipes = Recipe.getAll();
    const actor = game.user.character;
    const visibleRecipes = context.isGM
      ? recipes
      : recipes.filter(r => r.openToAll || (actor && r.unlockedFor.has(actor.uuid)));
    const targetResolved = await resolveEntries(visibleRecipes.map(r => r.targetItem));
    const craftCosts = await Promise.all(targetResolved.map(async ({ item }) => {
      if ( !item?.uuid ) return null;
      const fullItem = await fromUuid(item.uuid);
      return fullItem?.system?.getCraftCost ? effectiveCraftCost(fullItem) : null;
    }));
    const toolLabel = key => game.dnd5e.documents.Trait.keyLabel(key, { trait: "tool" });
    const skillLabel = key => _loc(CONFIG.DND5E.skills[key]?.label ?? key);
    const recipeRows = visibleRecipes
      .map((recipe, index) => {
        const item = targetResolved[index]?.item;
        const materialValueCP = recipe.craftThreshold(craftCosts[index], item);
        return {
          recipe,
          displayName: recipe.name || item?.name || _loc("SIMPLE_SHOP_CRAFT_5E.NewRecipePlaceholder"),
          itemUuid: item?.uuid ?? null,
          unlockedLabel: recipe.openToAll
            ? _loc("SIMPLE_SHOP_CRAFT_5E.ShopManager.Recipes.UnlockedAll")
            : (recipe.unlockedFor.size ? String(recipe.unlockedFor.size) : ""),
          unlockedTooltip: (!recipe.openToAll && recipe.unlockedFor.size)
            ? Array.from(recipe.unlockedFor).map(uuid => fromUuidSync(uuid)?.name).filter(Boolean).join("\n")
            : "",
          toolProfTooltip: Array.from(recipe.toolProficiencies).map(toolLabel).filter(Boolean).join("\n"),
          skillProfTooltip: Array.from(recipe.skillProficiencies).map(skillLabel).filter(Boolean).join("\n"),
          type: item?.type ?? "unknown",
          bundleSize: (recipe.targetQuantity > 1) ? recipe.targetQuantity : null,
          materialValueCP,
          materialValueDisplay: recipe.ignoreCraftValue ? null : breakdownCopper(materialValueCP),
          durationDisplay: formatDuration(resolveTotalHours(recipe, craftCosts[index]))
        };
      })
      .toSorted((a, b) => a.displayName.localeCompare(b.displayName));
    const recipeGroups = new Map();
    for ( const row of recipeRows ) {
      if ( !recipeGroups.has(row.type) ) recipeGroups.set(row.type, []);
      recipeGroups.get(row.type).push(row);
    }
    context.recipeTable = buildItemTableSections({
      groups: finalizeGroups(recipeGroups),
      emptyLabel: "SIMPLE_SHOP_CRAFT_5E.ShopManager.Recipes.None",
      columns: [
        { id: "materialValue", label: "SIMPLE_SHOP_CRAFT_5E.ShopManager.Recipes.MaterialValue" },
        { id: "duration", label: "DND5E.Duration" },
        ...(context.isGM ? [{ id: "unlocked", label: "SIMPLE_SHOP_CRAFT_5E.ShopManager.Recipes.Unlocked" }] : []),
        { id: "controls" }
      ],
      rowTemplate: "modules/simple-shop-craft-5e/templates/shop-manager/recipe-row.hbs"
    });
    return context;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _preparePartContext(partId, context, options) {
    context = await super._preparePartContext(partId, context, options);
    context.tab = context.tabs?.[partId];
    return context;
  }

  /* -------------------------------------------- */
  /*  Life-Cycle Handlers                         */
  /* -------------------------------------------- */

  /** @inheritDoc */
  async _onFirstRender(context, options) {
    await super._onFirstRender(context, options);
    new game.dnd5e.applications.ContextMenu5e(this.element, "[data-shop-id]", [], {
      onOpen: element => {
        const shop = Shop.get(element.dataset.shopId);
        ui.context.menuItems = this._getShopContextOptions(shop);
      },
      jQuery: false
    });
    new game.dnd5e.applications.ContextMenu5e(this.element, "[data-recipe-id]", [], {
      onOpen: element => {
        const recipe = Recipe.get(element.dataset.recipeId);
        ui.context.menuItems = this._getRecipeContextOptions(recipe);
      },
      jQuery: false
    });
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _attachPartListeners(partId, htmlElement, options) {
    super._attachPartListeners(partId, htmlElement, options);

    if ( partId === "shops" ) {
      const content = htmlElement.querySelector(".items-list");
      const sortButton = htmlElement.querySelector(".sort-control");
      sortButton.querySelector("i").className = SHOP_SORT_MODES[this.#shopSort].icon;
      sortButton.setAttribute("aria-label", _loc(SHOP_SORT_MODES[this.#shopSort].label));
      sortButton.addEventListener("click", () => {
        const modes = Object.keys(SHOP_SORT_MODES);
        this.#shopSort = modes[(modes.indexOf(this.#shopSort) + 1) % modes.length];
        this.render();
      });
      new foundry.applications.ux.SearchFilter({
        inputSelector: ".item-search", contentSelector: ".items-list",
        initial: this.#shopSearch,
        callback: (event, query, rgx) => {
          this.#shopSearch = query;
          applyItemFilters(rgx, "", content);
        }
      }).bind(htmlElement);
    }

    if ( partId === "recipes" ) {
      const content = htmlElement.querySelector(".items-list");
      htmlElement.querySelectorAll(".item-tooltip[data-uuid]").forEach(el => applyLoadingTooltip(el));
      const typeSelect = htmlElement.querySelector(".item-type-filter");
      const sortButton = htmlElement.querySelector(".sort-control");
      const clearButton = htmlElement.querySelector(".clear-control");
      typeSelect.value = this.#recipeTypeFilter;
      typeSelect.closest(".filter-control").classList.toggle("active", !!typeSelect.value);
      sortButton.querySelector("i").className = RECIPE_SORT_MODES[this.#recipeSort].icon;
      sortButton.setAttribute("aria-label", _loc(RECIPE_SORT_MODES[this.#recipeSort].label));
      applyItemSort(this.#recipeSort, content);
      const searchFilter = new foundry.applications.ux.SearchFilter({
        inputSelector: ".item-search", contentSelector: ".items-list",
        initial: this.#recipeSearch,
        callback: (event, query, rgx) => {
          this.#recipeSearch = query;
          applyItemFilters(rgx, typeSelect.value, content);
        }
      });
      searchFilter.bind(htmlElement);
      typeSelect.addEventListener("change", () => {
        this.#recipeTypeFilter = typeSelect.value;
        typeSelect.closest(".filter-control").classList.toggle("active", !!typeSelect.value);
        applyItemFilters(searchFilter.rgx, typeSelect.value, content);
      });
      sortButton.addEventListener("click", () => {
        const modes = Object.keys(RECIPE_SORT_MODES);
        this.#recipeSort = modes[(modes.indexOf(this.#recipeSort) + 1) % modes.length];
        this.render();
      });
      clearButton.addEventListener("click", () => {
        searchFilter.filter(null, "");
        typeSelect.value = "";
        typeSelect.dispatchEvent(new Event("change"));
      });
    }
  }

  /* -------------------------------------------- */

  /**
   * Handle creating a new recipe and opening its editor immediately.
   * @this {ShopManager}
   * @returns {Promise<void>}
   */
  static async #createRecipe() {
    const created = await Recipe.create({ name: "" });
    this.render();
    new RecipeSheet({ recipeId: created._id }).render({ force: true });
  }

  /* -------------------------------------------- */

  /**
   * Handle creating a new shop: small name/starter-pack prompt, then opens the full edit view.
   * @this {ShopManager}
   * @returns {Promise<void>}
   */
  static async #createShop() {
    await new ShopCreateDialog({ shopManager: this }).render({ force: true });
  }

  /* -------------------------------------------- */

  /**
   * Handle opening the editor for an existing recipe.
   * @this {ShopManager}
   * @param {Event} event         Triggering click event.
   * @param {HTMLElement} target  Button that was clicked.
   */
  static #editRecipe(event, target) {
    new RecipeSheet({ recipeId: target.dataset.recipeId }).render({ force: true });
  }

  /* -------------------------------------------- */

  /**
   * Handle opening the editor for an existing shop.
   * @this {ShopManager}
   * @param {Event} event         Triggering click event.
   * @param {HTMLElement} target  Button that was clicked.
   */
  static #editShop(event, target) {
    const shop = Shop.get(target.dataset.shopId);
    if ( !game.user.isGM && !shop.isOpen() ) {
      ui.notifications.warn("SIMPLE_SHOP_CRAFT_5E.ShopManager.Shops.Closed", { localize: true });
      return;
    }
    new ShopSheet({ shopId: shop._id }).render({ force: true });
  }

  /* -------------------------------------------- */

  /**
   * Handle starting a craft from a recipe row.
   * @this {ShopManager}
   * @param {Event} event         Triggering click event.
   * @param {HTMLElement} target  Element that was clicked.
   */
  static #startCraft(event, target) {
    const recipe = Recipe.get(target.dataset.recipeId);
    if ( !recipe ) return;
    if ( !game.user.isGM ) {
      const actor = game.user.character;
      const allowed = recipe.openToAll || (actor && recipe.unlockedFor.has(actor.uuid));
      if ( !allowed ) {
        ui.notifications.warn("SIMPLE_SHOP_CRAFT_5E.ShopManager.Recipes.Locked", { localize: true });
        return;
      }
    }
    new CraftStartDialog({ recipeId: recipe._id }).render({ force: true });
  }

  /* -------------------------------------------- */

  /**
   * Handle toggling a shop's active/visible state.
   * @this {ShopManager}
   * @param {Event} event         Triggering click event.
   * @param {HTMLElement} target  Element that was clicked.
   * @returns {Promise<void>}
   */
  static async #toggleActive(event, target) {
    const shop = Shop.get(target.dataset.shopId);
    await this.#setShopActive(shop, !shop.active);
  }

  /* -------------------------------------------- */
  /*  Helpers                                     */
  /* -------------------------------------------- */

  /**
   * Add a button to the Item Directory sidebar header to open this application.
   * @param {HTMLElement} html  Rendered Item Directory element.
   */
  static injectSidebarButton(html) {
    const button = document.createElement("button");
    button.type = "button";
    button.classList.add("open-shop-manager");
    button.innerHTML = `<i class="fas fa-store" inert></i> ${_loc("SIMPLE_SHOP_CRAFT_5E.ShopManager.Title")}`;
    button.addEventListener("click", () => (new ShopManager()).render({ force: true }));
    html.querySelector(".header-actions").append(button);
  }

  /* -------------------------------------------- */

  /**
   * Prepare an array of context menu options which are available for a recipe row.
   * @param {Recipe} recipe
   * @returns {ContextMenuEntry[]}
   * @protected
   */
  _getRecipeContextOptions(recipe) {
    return [
      {
        label: "SIMPLE_SHOP_CRAFT_5E.ShopManager.Recipes.Delete",
        icon: '<i class="fa-solid fa-trash fa-fw"></i>',
        onClick: () => this.#confirmDeleteRecipe(recipe)
      }
    ];
  }

  /* -------------------------------------------- */

  /**
   * Prepare an array of context menu options which are available for a shop row.
   * @param {Shop} shop
   * @returns {ContextMenuEntry[]}
   * @protected
   */
  _getShopContextOptions(shop) {
    return [
      {
        label: shop.active
          ? "SIMPLE_SHOP_CRAFT_5E.ShopManager.Shops.Deactivate"
          : "SIMPLE_SHOP_CRAFT_5E.ShopManager.Shops.Activate",
        icon: `<i class="fa-solid fa-toggle-${shop.active ? "off" : "on"} fa-fw"></i>`,
        onClick: () => this.#setShopActive(shop, !shop.active)
      },
      {
        label: "SIMPLE_SHOP_CRAFT_5E.ShopManager.Shops.Duplicate",
        icon: '<i class="fa-solid fa-copy fa-fw"></i>',
        onClick: () => this.#duplicateShop(shop)
      },
      {
        label: "SIMPLE_SHOP_CRAFT_5E.ShopManager.Shops.Delete",
        icon: '<i class="fa-solid fa-trash fa-fw"></i>',
        onClick: () => this.#confirmDeleteShop(shop)
      }
    ];
  }

  /* -------------------------------------------- */

  /**
   * Handle deleting an existing recipe, after confirmation.
   * @param {Recipe} recipe
   * @returns {Promise<void>}
   */
  async #confirmDeleteRecipe(recipe) {
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: "SIMPLE_SHOP_CRAFT_5E.ShopManager.Recipes.Delete" },
      content: `<p>${_loc("SIMPLE_SHOP_CRAFT_5E.ShopManager.Recipes.DeleteConfirm")}</p>`
    });
    if ( !confirmed ) return;
    await Recipe.delete(recipe._id);
    this.render();
  }

  /* -------------------------------------------- */

  /**
   * Handle deleting an existing shop, after confirmation.
   * @param {Shop} shop
   * @returns {Promise<void>}
   */
  async #confirmDeleteShop(shop) {
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: "SIMPLE_SHOP_CRAFT_5E.ShopManager.Shops.Delete" },
      content: `<p>${_loc("SIMPLE_SHOP_CRAFT_5E.ShopManager.Shops.DeleteConfirm")}</p>`
    });
    if ( !confirmed ) return;
    await Shop.delete(shop._id);
    this.render();
  }

  /* -------------------------------------------- */

  /**
   * Handle duplicating an existing shop.
   * @param {Shop} shop
   * @returns {Promise<void>}
   */
  async #duplicateShop(shop) {
    const clone = shop.toObject();
    delete clone._id;
    clone.name = _loc("DOCUMENT.CopyOf", { name: shop.name });
    await Shop.create(clone);
    this.render();
  }

  /* -------------------------------------------- */

  /**
   * Set a shop's active/visible state.
   * @param {Shop} shop
   * @param {boolean} active
   * @returns {Promise<void>}
   */
  async #setShopActive(shop, active) {
    await Shop.update(shop._id, { active });
    this.render();
  }
}
