import { SETTLEMENT_CAPS, GOLD_POOL_DEFAULT } from "../config.mjs";
import { createRecipe, deleteRecipe, getRecipe, getRecipes } from "../data/recipe-store.mjs";
import { createShop, deleteShop, getShop, getShops, updateShop } from "../data/shop-store.mjs";
import { getStarterItems, getStarterPackOptions } from "../data/starter-packs.mjs";
import { resolveEntries } from "../item-resolver.mjs";
import { buildItemTableSections, finalizeGroups } from "../shop/pricing.mjs";

import BasePromptDialog from "./base-prompt-dialog.mjs";
import CraftStartDialog from "./craft-start-dialog.mjs";
import RecipeSheet from "./recipe-sheet.mjs";
import ShopSheet from "./shop-sheet.mjs";

const { Application5e } = game.dnd5e.applications.api;

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
  /*  Creation                                     */
  /* -------------------------------------------- */

  /**
   * Handle creating a new recipe and opening its editor immediately.
   * @this {ShopManager}
   * @returns {Promise<void>}
   */
  static async #createRecipe() {
    const created = await createRecipe({ name: "" });
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
    const shopManager = this;
    const starterPackOptions = [
      { value: "", label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopManager.Shops.Empty") },
      ...getStarterPackOptions()
    ];

    const dialog = new BasePromptDialog({
      window: { title: "SIMPLE_SHOP_CRAFT_5E.ShopManager.Shops.Create" },
      fields: [
        {
          field: new foundry.data.fields.StringField(), name: "starterPack",
          label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopManager.Shops.StarterPack"), options: starterPackOptions
        },
        {
          field: new foundry.data.fields.StringField(), name: "name",
          label: _loc("SIMPLE_SHOP_CRAFT_5E.Shop")
        }
      ],
      buttons: [
        { action: "create", label: "SIMPLE_SHOP_CRAFT_5E.ShopManager.Shops.Create", icon: "fas fa-plus", default: true }
      ],
      onRender: app => {
        const select = app.element.querySelector('select[name="starterPack"]');
        const name = app.element.querySelector('input[name="name"]');
        select?.addEventListener("change", () => {
          name.placeholder = select.value ? (select.selectedOptions[0]?.text ?? "") : "";
        });
      },
      form: {
        handler: async function(event, form, formData) {
          const data = foundry.utils.expandObject(formData.object);
          const packs = getStarterPackOptions();
          const newShop = {
            name: data.name || packs.find(p => p.value === data.starterPack)?.label
              || _loc("SIMPLE_SHOP_CRAFT_5E.ShopManager.Shops.Create"),
            goldPool: { max: { gp: GOLD_POOL_DEFAULT }, current: { gp: GOLD_POOL_DEFAULT }, unlimited: false },
            items: getStarterItems(data.starterPack).map(({ identifier, bundleSize }) => ({
              identifier, bundleSize, stock: { max: null, current: null }
            }))
          };
          const created = await createShop(newShop);
          shopManager.render();
          new ShopSheet({ shopId: created._id }).render({ force: true, mode: ShopSheet.MODES.EDIT });
          await this.close();
        }
      }
    });
    await dialog.render({ force: true });
  }

  /* -------------------------------------------- */

  /**
   * Handle opening the editor for an existing recipe.
   * @this {ShopManager}
   * @param {Event} event         Triggering click event.
   * @param {HTMLElement} target  Button that was clicked.
   * @returns {void}
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
   * @returns {void}
   */
  static #editShop(event, target) {
    new ShopSheet({ shopId: target.dataset.shopId }).render({ force: true });
  }

  /* -------------------------------------------- */

  /**
   * Handle starting a craft from a recipe row.
   * @this {ShopManager}
   * @param {Event} event         Triggering click event.
   * @param {HTMLElement} target  Element that was clicked.
   * @returns {void}
   */
  static #startCraft(event, target) {
    const recipe = getRecipe(target.dataset.recipeId);
    if ( !recipe ) return;
    if ( !game.user.isGM ) {
      const actor = game.user.character;
      const allowed = recipe.openToAll || (actor && recipe.unlockedFor.has(actor.uuid));
      if ( !allowed ) {
        ui.notifications.warn(_loc("SIMPLE_SHOP_CRAFT_5E.ShopManager.Recipes.Locked"));
        return;
      }
    }
    new CraftStartDialog({ recipeId: recipe._id }).render({ force: true });
  }

  /* -------------------------------------------- */

  /**
   * Determine the display label for a shop's settlement cap: the matching preset name, "Custom" for a
   * non-preset value, or an empty string when uncapped.
   * @param {Shop} shop
   * @returns {string}
   */
  static #settlementCapLabel(shop) {
    const preset = Object.entries(SETTLEMENT_CAPS).find(([, v]) => v.value === shop.settlementCap.value)?.[0];
    if ( preset ) return _loc(SETTLEMENT_CAPS[preset].label);
    return shop.settlementCap.value != null ? _loc("SIMPLE_SHOP_CRAFT_5E.Custom") : "";
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
    const shop = getShop(target.dataset.shopId);
    await this.#setShopActive(shop, !shop.active);
  }

  /* -------------------------------------------- */

  /**
   * Add a button to the Item Directory sidebar header to open this application.
   * @param {HTMLElement} html  Rendered Item Directory element.
   * @returns {void}
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

  /** @inheritDoc */
  _attachPartListeners(partId, htmlElement, options) {
    super._attachPartListeners(partId, htmlElement, options);
    if ( ["shops", "recipes"].includes(partId) ) {
      htmlElement.querySelectorAll("[data-context-menu]").forEach(control => {
        return control.addEventListener("click", game.dnd5e.applications.ContextMenu5e.triggerEvent);
      });
    }
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

  /** @inheritDoc */
  async _onFirstRender(context, options) {
    await super._onFirstRender(context, options);
    new game.dnd5e.applications.ContextMenu5e(this.element, "[data-shop-id]", [], {
      onOpen: element => {
        const shop = getShop(element.dataset.shopId);
        ui.context.menuItems = this._getShopContextOptions(shop);
      },
      jQuery: false
    });
    new game.dnd5e.applications.ContextMenu5e(this.element, "[data-recipe-id]", [], {
      onOpen: element => {
        const recipe = getRecipe(element.dataset.recipeId);
        ui.context.menuItems = this._getRecipeContextOptions(recipe);
      },
      jQuery: false
    });
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.isGM = game.user.isGM;
    const shops = getShops().filter(s => context.isGM || s.active);
    const rows = shops.toSorted((a, b) => a.name.localeCompare(b.name)).map(shop => ({
      shop,
      npc: shop.npc ? fromUuidSync(shop.npc) : null,
      subtitle: [shop.location || null, ShopManager.#settlementCapLabel(shop) || null].filter(Boolean).join(" · "),
      template: "modules/simple-shop-craft-5e/templates/shop-manager/shop-row.hbs"
    }));
    const columns = [
      { id: "name" },
      { id: "npc", label: "SIMPLE_SHOP_CRAFT_5E.Owner" },
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
    const recipes = getRecipes();
    const actor = game.user.character;
    const visibleRecipes = context.isGM
      ? recipes
      : recipes.filter(r => r.openToAll || (actor && r.unlockedFor.has(actor.uuid)));
    const targetResolved = await resolveEntries(visibleRecipes.map(r => r.targetItem));
    const recipeRows = visibleRecipes
      .map((recipe, index) => ({
        recipe,
        displayName: recipe.name || targetResolved[index]?.item?.name
          || _loc("SIMPLE_SHOP_CRAFT_5E.NewRecipePlaceholder"),
        unlockedLabel: recipe.openToAll
          ? _loc("SIMPLE_SHOP_CRAFT_5E.ShopManager.Recipes.UnlockedAll")
          : (recipe.unlockedFor.size ? String(recipe.unlockedFor.size) : ""),
        type: targetResolved[index]?.item?.type ?? "unknown"
      }))
      .toSorted((a, b) => a.displayName.localeCompare(b.displayName));
    const recipeGroups = new Map();
    for ( const row of recipeRows ) {
      if ( !recipeGroups.has(row.type) ) recipeGroups.set(row.type, []);
      recipeGroups.get(row.type).push(row);
    }
    context.recipeTable = buildItemTableSections({
      groups: finalizeGroups(recipeGroups),
      emptyLabel: "SIMPLE_SHOP_CRAFT_5E.ShopManager.Recipes.None",
      columns: [{ id: "name" }, { id: "unlocked", label: "SIMPLE_SHOP_CRAFT_5E.ShopManager.Recipes.Unlocked" }, { id: "controls" }],
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
    await deleteRecipe(recipe._id);
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
    await deleteShop(shop._id);
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
    clone.name = game.i18n.format("DOCUMENT.CopyOf", { name: shop.name });
    await createShop(clone);
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
    await updateShop(shop._id, { active });
    this.render();
  }
}
