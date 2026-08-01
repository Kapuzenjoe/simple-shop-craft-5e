import { MODULE_ID, SETTING_KEYS, SETTLEMENT_CAPS } from "../config.mjs";
import ShopConfig from "./shop-config.mjs";
import ShopEditor from "./shop-editor.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * GM-facing application for managing shops.
 * @mixes HandlebarsApplicationMixin
 * @extends {ApplicationV2}
 */
export default class ShopManager extends HandlebarsApplicationMixin(ApplicationV2) {

  /** @override */
  static DEFAULT_OPTIONS = {
    id: "shop-manager",
    classes: ["dnd5e2", "simple-shop-craft-5e", "shop-manager", "standard-form"],
    window: {
      title: "SIMPLE_SHOP_CRAFT_5E.ShopManager.Title",
      resizable: true
    },
    position: {
      width: 720,
      height: 640
    },
    actions: {
      createShop: ShopManager.#createShop,
      editShopConfig: ShopManager.#editShopConfig,
      editShop: ShopManager.#editShop,
      toggleActive: ShopManager.#toggleActive
    }
  };

  /** @override */
  static TABS = {
    primary: {
      tabs: [
        { id: "shops", label: "SIMPLE_SHOP_CRAFT_5E.ShopManager.Tabs.Shops" },
        { id: "crafting", label: "SIMPLE_SHOP_CRAFT_5E.ShopManager.Tabs.Crafting" }
      ],
      initial: "shops"
    }
  };

  /** @override */
  static PARTS = {
    tabs: { template: "templates/generic/tab-navigation.hbs" },
    shops: {
      template: "modules/simple-shop-craft-5e/templates/shop-manager-shops.hbs",
      templates: ["modules/simple-shop-craft-5e/templates/partials/item-avatar-name.hbs"]
    },
    crafting: { template: "modules/simple-shop-craft-5e/templates/shop-manager-crafting.hbs" }
  };

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.isGM = game.user.isGM;
    const shops = game.settings.get(MODULE_ID, SETTING_KEYS.SHOPS).filter(s => context.isGM || s.active);
    context.shops = shops.toSorted((a, b) => b.active - a.active).map(shop => ({
      shop,
      npc: shop.npc ? fromUuidSync(shop.npc) : null,
      subtitle: [shop.location || null, ShopManager.#settlementCapLabel(shop) || null].filter(Boolean).join(" · ")
    }));
    return context;
  }

  /* -------------------------------------------- */

  /** @override */
  async _preparePartContext(partId, context, options) {
    context = await super._preparePartContext(partId, context, options);
    context.tab = context.tabs?.[partId];
    return context;
  }

  /* -------------------------------------------- */

  /** @override */
  async _onFirstRender(context, options) {
    await super._onFirstRender(context, options);
    new game.dnd5e.applications.ContextMenu5e(this.element, "[data-shop-id]", [], {
      onOpen: element => {
        const shop = game.settings.get(MODULE_ID, SETTING_KEYS.SHOPS).find(s => s._id === element.dataset.shopId);
        ui.context.menuItems = this.#getShopContextOptions(shop);
      },
      jQuery: false
    });
  }

  /* -------------------------------------------- */

  /** @override */
  _attachPartListeners(partId, htmlElement, options) {
    super._attachPartListeners(partId, htmlElement, options);
    if ( partId === "shops" ) {
      htmlElement.querySelectorAll("[data-context-menu]").forEach(control =>
        control.addEventListener("click", ShopManager.#triggerContextMenu));
    }
  }

  /* -------------------------------------------- */

  /**
   * Trigger the row's context menu from a click on the "..." button. {@link ContextMenu5e.triggerEvent} does the
   * same thing, but its target selector is hardcoded to dnd5e's own id attributes and doesn't know `data-shop-id`.
   * @param {PointerEvent} event
   */
  static #triggerContextMenu(event) {
    event.preventDefault();
    event.stopPropagation();
    const { clientX, clientY } = event;
    const target = event.target.closest("[data-shop-id]");
    target?.dispatchEvent(new PointerEvent("contextmenu", { view: window, bubbles: true, cancelable: true, clientX, clientY }));
  }

  /* -------------------------------------------- */

  /**
   * Determine the display label for a shop's settlement cap: the matching preset name, "Custom" for a
   * non-preset value, or an empty string when uncapped.
   * @param {Shop} shop
   * @returns {string}
   */
  static #settlementCapLabel(shop) {
    const preset = Object.entries(SETTLEMENT_CAPS).find(([, v]) => v === shop.settlementCap.value)?.[0];
    if ( preset ) {
      const label = _loc(`SIMPLE_SHOP_CRAFT_5E.ShopEditor.${preset[0].toUpperCase()}${preset.slice(1)}`);
      return label.replace(/\s*\(.*\)$/, "");
    }
    return shop.settlementCap.value != null ? _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.Custom") : "";
  }

  /* -------------------------------------------- */

  /**
   * Build the "..." context menu entries for a shop row.
   * @param {Shop} shop
   * @returns {object[]}
   */
  #getShopContextOptions(shop) {
    return [
      {
        label: "SIMPLE_SHOP_CRAFT_5E.ShopManager.Shops.EditConfig",
        icon: '<i class="fas fa-gear fa-fw"></i>',
        onClick: () => new ShopConfig({ shopId: shop._id }).render({ force: true })
      },
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
   * Handle duplicating an existing shop.
   * @param {Shop} shop
   */
  async #duplicateShop(shop) {
    const clone = shop.toObject();
    delete clone._id;
    clone.name = game.i18n.format("DOCUMENT.CopyOf", { name: shop.name });
    const shops = game.settings.get(MODULE_ID, SETTING_KEYS.SHOPS);
    await game.settings.set(MODULE_ID, SETTING_KEYS.SHOPS, [...shops.map(s => s.toObject()), clone]);
    this.render();
  }

  /* -------------------------------------------- */

  /**
   * Add a button to the Item Directory sidebar header to open this application.
   * @param {HTMLElement} html  Rendered Item Directory element.
   */
  static injectSidebarButton(html) {
    const button = document.createElement("button");
    button.type = "button";
    button.classList.add("open-shop-manager");
    button.innerHTML = `<i class="fas fa-store" inert></i> ${_loc("SIMPLE_SHOP_CRAFT_5E.ShopManager.Action.Open")}`;
    button.addEventListener("click", () => (new ShopManager()).render({ force: true }));
    html.querySelector(".header-actions").append(button);
  }

  /* -------------------------------------------- */
  /*  Creation                                     */
  /* -------------------------------------------- */

  /**
   * Handle creating a new shop.
   * @this {ShopManager}
   */
  static #createShop() {
    new ShopConfig().render({ force: true });
  }

  /* -------------------------------------------- */

  /**
   * Handle opening the settings dialog for an existing shop.
   * @this {ShopManager}
   * @param {Event} event         Triggering click event.
   * @param {HTMLElement} target  Button that was clicked.
   */
  static #editShopConfig(event, target) {
    new ShopConfig({ shopId: target.dataset.shopId }).render({ force: true });
  }

  /* -------------------------------------------- */

  /**
   * Handle opening the editor for an existing shop.
   * @this {ShopManager}
   * @param {Event} event         Triggering click event.
   * @param {HTMLElement} target  Button that was clicked.
   */
  static #editShop(event, target) {
    new ShopEditor({ shopId: target.dataset.shopId }).render({ force: true });
  }

  /* -------------------------------------------- */

  /**
   * Handle deleting an existing shop, after confirmation.
   * @param {Shop} shop
   */
  async #confirmDeleteShop(shop) {
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: "SIMPLE_SHOP_CRAFT_5E.ShopManager.Shops.Delete" },
      content: `<p>${_loc("SIMPLE_SHOP_CRAFT_5E.ShopManager.Shops.DeleteConfirm")}</p>`
    });
    if ( !confirmed ) return;

    const shops = game.settings.get(MODULE_ID, SETTING_KEYS.SHOPS);
    await game.settings.set(MODULE_ID, SETTING_KEYS.SHOPS,
      shops.filter(s => s._id !== shop._id).map(s => s.toObject()));
    this.render();
  }

  /* -------------------------------------------- */

  /**
   * Handle toggling a shop's active/visible state.
   * @this {ShopManager}
   * @param {Event} event         Triggering click event.
   * @param {HTMLElement} target  Element that was clicked.
   */
  static async #toggleActive(event, target) {
    const shop = game.settings.get(MODULE_ID, SETTING_KEYS.SHOPS).find(s => s._id === target.dataset.shopId);
    await this.#setShopActive(shop, !shop.active);
  }

  /* -------------------------------------------- */

  /**
   * Set a shop's active/visible state.
   * @param {Shop} shop
   * @param {boolean} active
   */
  async #setShopActive(shop, active) {
    const shops = game.settings.get(MODULE_ID, SETTING_KEYS.SHOPS);
    await game.settings.set(MODULE_ID, SETTING_KEYS.SHOPS, shops.map(s =>
      s._id === shop._id ? { ...s.toObject(), active } : s.toObject()
    ));
    this.render();
  }
}
