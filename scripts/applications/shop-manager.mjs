import { MODULE_ID, SETTING_KEYS } from "../config.mjs";
import { getStarterItems, getStarterPackOptions } from "../data/starter-packs.mjs";
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
    classes: ["dnd5e2", "simple-shop-craft-5e", "shop-manager"],
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
      deleteShop: ShopManager.#deleteShop,
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
    shops: { template: "modules/simple-shop-craft-5e/templates/shop-manager-shops.hbs" },
    crafting: { template: "modules/simple-shop-craft-5e/templates/shop-manager-crafting.hbs" }
  };

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.isGM = game.user.isGM;
    const shops = game.settings.get(MODULE_ID, SETTING_KEYS.SHOPS).filter(s => context.isGM || s.active);
    context.shops = shops.map(shop => ({
      shop, npc: shop.npc ? fromUuidSync(shop.npc) : null
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
  static async #createShop() {
    const { createFormGroup, createSelectInput, createTextInput } = foundry.applications.fields;
    const packs = getStarterPackOptions();
    const content = `<fieldset>
      ${createFormGroup({
        label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.ShopName"),
        input: createTextInput({ name: "name" })
      }).outerHTML}
      ${createFormGroup({
        label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopManager.Shops.StarterPack"),
        input: createSelectInput({
          name: "starterPack",
          blank: _loc("SIMPLE_SHOP_CRAFT_5E.ShopManager.Shops.Empty"),
          options: packs
        })
      }).outerHTML}
    </fieldset>`;

    const data = await foundry.applications.api.DialogV2.input({
      window: { title: "SIMPLE_SHOP_CRAFT_5E.ShopManager.Shops.Create" },
      content,
      render: (event, dialog) => {
        const select = dialog.element.querySelector('select[name="starterPack"]');
        const name = dialog.element.querySelector('input[name="name"]');
        select.addEventListener("change", () => name.placeholder = select.selectedOptions[0]?.text ?? "");
      }
    });
    if ( !data ) return;

    const shops = game.settings.get(MODULE_ID, SETTING_KEYS.SHOPS);
    await game.settings.set(MODULE_ID, SETTING_KEYS.SHOPS, [
      ...shops.map(s => s.toObject()),
      {
        name: data.name || packs.find(p => p.value === data.starterPack)?.label
          || _loc("SIMPLE_SHOP_CRAFT_5E.ShopManager.Shops.Create"),
        items: getStarterItems(data.starterPack).map(identifier => ({ identifier, stock: { max: null, current: null } }))
      }
    ]);
    this.render();
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
   * Handle deleting an existing shop.
   * @this {ShopManager}
   * @param {Event} event         Triggering click event.
   * @param {HTMLElement} target  Button that was clicked.
   */
  static async #deleteShop(event, target) {
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: "SIMPLE_SHOP_CRAFT_5E.ShopManager.Shops.Delete" },
      content: `<p>${_loc("SIMPLE_SHOP_CRAFT_5E.ShopManager.Shops.DeleteConfirm")}</p>`
    });
    if ( !confirmed ) return;

    const shopId = target.dataset.shopId;
    const shops = game.settings.get(MODULE_ID, SETTING_KEYS.SHOPS);
    await game.settings.set(MODULE_ID, SETTING_KEYS.SHOPS,
      shops.filter(s => s._id !== shopId).map(s => s.toObject()));
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
    const shopId = target.dataset.shopId;
    const shops = game.settings.get(MODULE_ID, SETTING_KEYS.SHOPS);
    await game.settings.set(MODULE_ID, SETTING_KEYS.SHOPS, shops.map(s =>
      s._id === shopId ? { ...s.toObject(), active: !s.active } : s.toObject()
    ));
    this.render();
  }
}
