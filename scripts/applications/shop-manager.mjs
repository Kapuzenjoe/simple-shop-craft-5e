import { MODULE_ID, SETTING_KEYS, SETTLEMENT_CAPS, GOLD_POOL_DEFAULT } from "../config.mjs";
import { getStarterItems, getStarterPackOptions } from "../data/starter-packs.mjs";

import BasePromptDialog from "./base-prompt-dialog.mjs";
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
      createShop: ShopManager.#createShop,
      editShop: ShopManager.#editShop,
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
    crafting: { template: "modules/simple-shop-craft-5e/templates/shop-manager/crafting.hbs" }
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

  /**
   * Handle creating a new shop: small name/starter-pack prompt, then opens the full edit view.
   * @this {ShopManager}
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
          label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopManager.Shops.Shop")
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
          const shops = game.settings.get(MODULE_ID, SETTING_KEYS.SHOPS);
          const newShop = {
            name: data.name || packs.find(p => p.value === data.starterPack)?.label
              || _loc("SIMPLE_SHOP_CRAFT_5E.ShopManager.Shops.Create"),
            goldPool: { max: { gp: GOLD_POOL_DEFAULT }, current: { gp: GOLD_POOL_DEFAULT }, unlimited: false },
            items: getStarterItems(data.starterPack).map(({ identifier, bundleSize }) => ({
              identifier, bundleSize, stock: { max: null, current: null }
            }))
          };
          await game.settings.set(MODULE_ID, SETTING_KEYS.SHOPS, [...shops.map(s => s.toObject()), newShop]);
          shopManager.render();
          const created = game.settings.get(MODULE_ID, SETTING_KEYS.SHOPS).at(-1);
          new ShopSheet({ shopId: created._id }).render({ force: true, mode: ShopSheet.MODES.EDIT });
          await this.close();
        }
      }
    });
    await dialog.render({ force: true });
  }

  /* -------------------------------------------- */

  /**
   * Handle opening the editor for an existing shop.
   * @this {ShopManager}
   * @param {Event} event         Triggering click event.
   * @param {HTMLElement} target  Button that was clicked.
   */
  static #editShop(event, target) {
    new ShopSheet({ shopId: target.dataset.shopId }).render({ force: true });
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
    return shop.settlementCap.value != null ? _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.Custom") : "";
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

  /** @inheritDoc */
  _attachPartListeners(partId, htmlElement, options) {
    super._attachPartListeners(partId, htmlElement, options);
    if ( partId === "shops" ) {
      htmlElement.querySelectorAll("[data-context-menu]").forEach(control => {
        return control.addEventListener("click", game.dnd5e.applications.ContextMenu5e.triggerEvent);
      });
    }
  }

  /* -------------------------------------------- */

  /**
   * Prepare an array of context menu options which are available for a shop row.
   * @param {Shop} shop
   * @returns {ContextMenuEntry[]}
   * @protected
   */
  _getContextOptions(shop) {
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
        const shop = game.settings.get(MODULE_ID, SETTING_KEYS.SHOPS).find(s => s._id === element.dataset.shopId);
        ui.context.menuItems = this._getContextOptions(shop);
      },
      jQuery: false
    });
  }

  /* -------------------------------------------- */
  /*  Creation                                     */
  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.isGM = game.user.isGM;
    const shops = game.settings.get(MODULE_ID, SETTING_KEYS.SHOPS).filter(s => context.isGM || s.active);
    const rows = shops.toSorted((a, b) => a.name.localeCompare(b.name)).map(shop => ({
      shop,
      npc: shop.npc ? fromUuidSync(shop.npc) : null,
      subtitle: [shop.location || null, ShopManager.#settlementCapLabel(shop) || null].filter(Boolean).join(" · "),
      template: "modules/simple-shop-craft-5e/templates/shop-manager/shop-row.hbs"
    }));
    const columns = [
      { id: "name" },
      { id: "npc", label: "SIMPLE_SHOP_CRAFT_5E.ShopManager.Shops.Owner" },
      { id: "active", label: "SIMPLE_SHOP_CRAFT_5E.ShopManager.Shops.Status" },
      { id: "controls" }
    ];
    const sections = context.isGM
      ? [
        { label: "SIMPLE_SHOP_CRAFT_5E.ShopManager.Shops.Active", columns, rows: rows.filter(r => r.shop.active) },
        { label: "SIMPLE_SHOP_CRAFT_5E.ShopManager.Shops.Inactive", columns, rows: rows.filter(r => !r.shop.active) }
      ].filter(s => s.rows.length)
      : [{ label: "SIMPLE_SHOP_CRAFT_5E.ShopManager.Shops.Shop", columns, rows }];
    context.table = {
      hasRows: rows.length > 0,
      emptyLabel: "SIMPLE_SHOP_CRAFT_5E.ShopManager.Shops.None",
      sections
    };
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
   * Handle deleting an existing shop, after confirmation.
   * @param {Shop} shop
   */
  async #confirmDeleteShop(shop) {
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: "SIMPLE_SHOP_CRAFT_5E.ShopManager.Shops.Delete" },
      content: `<p>${_loc("SIMPLE_SHOP_CRAFT_5E.ShopManager.Shops.DeleteConfirm")}</p>`
    });
    if ( !confirmed ) return;
    await this.#persistShops(shops => shops.filter(s => s._id !== shop._id).map(s => s.toObject()));
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
    await this.#persistShops(shops => [...shops.map(s => s.toObject()), clone]);
  }

  /* -------------------------------------------- */

  /**
   * Persist a transformed copy of the shops list and re-render.
   * @param {(shops: Shop[]) => object[]} transform  Produces the new shops array (as plain objects).
   * @returns {Promise<void>}
   */
  async #persistShops(transform) {
    const shops = game.settings.get(MODULE_ID, SETTING_KEYS.SHOPS);
    await game.settings.set(MODULE_ID, SETTING_KEYS.SHOPS, transform(shops));
    this.render();
  }

  /* -------------------------------------------- */

  /**
   * Set a shop's active/visible state.
   * @param {Shop} shop
   * @param {boolean} active
   */
  async #setShopActive(shop, active) {
    await this.#persistShops(shops => shops.map(s => s._id === shop._id ? { ...s.toObject(), active } : s.toObject()));
  }
}
