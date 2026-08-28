import { MODULE_ID } from "../../config.mjs";
import { Shop, ShopItemEntry } from "../../data/shop-data.mjs";
import { calendariaWeekdayOptions, isCalendariaActive } from "../../integrations/calendaria.mjs";
import {
  breakdownCopper, buildItemTableSections, finalizeGroups, isDnd5eAutoRecoveryEnabled, loadingTooltip,
  needsDefaultPrice, openItemSheet, resolveItemPrice, selectableActors, toCopper
} from "../../utils.mjs";

import GenerateItemDialog from "./generate-item-dialog.mjs";
import HaggleDialog from "./haggle-dialog.mjs";
import ShopCart from "./shop-cart.mjs";
import GoldPoolConfig from "./shop-config/gold-pool-config.mjs";
import MaxStockConfig from "./shop-config/max-stock-config.mjs";
import PlayersConfig from "./shop-config/players-config.mjs";
import SettlementCapConfig from "./shop-config/settlement-cap-config.mjs";
import {
  openDiscountConfig, openModifiersConfig,
  openOwnerConfig, openPriceConfig, openRenameConfig
} from "./shop-config/simple-configs.mjs";

/**
 * @import { ShopItemEntryData } from "../../_types.mjs";
 */

const { Application5e } = game.dnd5e.applications.api;

/**
 * Column definitions for the Buy tab's item table.
 * @type {{ id: string, label?: string }[]}
 */
const BUY_COLUMNS = [
  { id: "cart", label: "SIMPLE_SHOP_CRAFT_5E.ShopEditor.CartQuantity" },
  { id: "name" },
  { id: "discount", label: "SIMPLE_SHOP_CRAFT_5E.ShopEditor.PriceModifier" },
  { id: "price", label: "DND5E.Price" },
  { id: "weight", label: "DND5E.Weight" },
  { id: "quantity", label: "SIMPLE_SHOP_CRAFT_5E.ShopEditor.Stock" },
  { id: "controls" }
];

/**
 * Column definitions for the Sell tab's item table.
 * @type {{ id: string, label?: string }[]}
 */
const SELL_COLUMNS = [
  { id: "cart", label: "SIMPLE_SHOP_CRAFT_5E.ShopEditor.SellQuantity" },
  { id: "name" },
  { id: "discount", label: "SIMPLE_SHOP_CRAFT_5E.ShopEditor.PriceModifier" },
  { id: "price", label: "DND5E.Price" },
  { id: "weight", label: "DND5E.Weight" },
  { id: "quantity", label: "DND5E.Quantity" },
  { id: "controls" }
];

/**
 * Festival options for the active calendar, if it supports festivals. Empty otherwise.
 * @returns {{ value: string, label: string }[]}
 */
function festivalOptions() {
  const calendar = game.time.calendar;
  const festivals = calendar.festivalsArray ?? calendar.festivals ?? [];
  return festivals.map(f => ({ value: f.name, label: _loc(f.name) }));
}

/* -------------------------------------------- */

/**
 * Application for viewing and, in Edit mode, configuring a single shop.
 * @param {object} [options]
 * @param {string} [options.shopId]  Id of the ShopData being edited.
 */
export default class ShopSheet extends Application5e {
  constructor(options={}) {
    super(options);
    this.shopId = options.shopId;
  }

  /* -------------------------------------------- */

  /** @override */
  static DEFAULT_OPTIONS = {
    id: "shop-sheet-{id}",
    classes: ["sheet", "simple-shop-craft-5e", "shop-sheet", "standard-form"],
    tag: "form",
    window: {
      title: "SIMPLE_SHOP_CRAFT_5E.ShopEditor.Title",
      resizable: true
    },
    position: {
      width: 850,
      height: 700
    },
    form: {
      handler: ShopSheet.#onSubmit,
      submitOnChange: true,
      closeOnSubmit: false
    },
    actions: {
      addItems: ShopSheet.#addItems,
      adjustCartQuantity: ShopSheet.#adjustCartQuantity,
      adjustSellQuantity: ShopSheet.#adjustSellQuantity,
      changeMode: ShopSheet.#changeMode,
      editDiscount: ShopSheet.#editDiscount,
      editGoldPool: ShopSheet.#editGoldPool,
      editImage: ShopSheet.#editImage,
      editMaxStock: ShopSheet.#editMaxStock,
      editModifiers: ShopSheet.#editModifiers,
      editOwner: ShopSheet.#editOwner,
      editPlayers: ShopSheet.#editPlayers,
      editPrice: ShopSheet.#editPrice,
      editSettlementCap: ShopSheet.#editSettlementCap,
      generateItem: ShopSheet.#generateItem,
      haggle: ShopSheet.#haggle,
      openCart: ShopSheet.#openCart,
      openItemSheet: ShopSheet.#openItemSheet,
      removeItem: ShopSheet.#removeItem,
      renameShop: ShopSheet.#renameShop,
      resetShop: ShopSheet.#resetShop,
      spotlight: ShopSheet.#spotlight,
      toggleActive: ShopSheet.#toggleActive
    }
  };

  /* -------------------------------------------- */

  /**
   * Available sheet modes.
   * @enum {number}
   */
  static MODES = {
    PLAY: 1,
    EDIT: 2
  };

  /* -------------------------------------------- */

  /** @override */
  static PARTS = {
    header: {
      template: "modules/simple-shop-craft-5e/templates/shop-sheet/header.hbs",
      templates: ["modules/simple-shop-craft-5e/templates/partials/currency-parts.hbs"]
    },
    tabs: {
      template: "systems/dnd5e/templates/shared/horizontal-tabs.hbs",
      templates: ["templates/generic/tab-navigation.hbs"]
    },
    buy: {
      template: "modules/simple-shop-craft-5e/templates/partials/tab-item-table.hbs",
      templates: [
        "modules/simple-shop-craft-5e/templates/partials/currency-parts.hbs",
        "modules/simple-shop-craft-5e/templates/partials/item-avatar-name.hbs",
        "modules/simple-shop-craft-5e/templates/partials/item-weight-cell.hbs",
        "modules/simple-shop-craft-5e/templates/partials/item-table.hbs",
        "modules/simple-shop-craft-5e/templates/shop-sheet/buy-row.hbs"
      ],
      scrollable: [""]
    },
    sell: {
      template: "modules/simple-shop-craft-5e/templates/partials/tab-item-table.hbs",
      templates: [
        "modules/simple-shop-craft-5e/templates/partials/currency-parts.hbs",
        "modules/simple-shop-craft-5e/templates/partials/item-avatar-name.hbs",
        "modules/simple-shop-craft-5e/templates/partials/item-weight-cell.hbs",
        "modules/simple-shop-craft-5e/templates/partials/item-table.hbs",
        "modules/simple-shop-craft-5e/templates/shop-sheet/sell-row.hbs"
      ],
      scrollable: [""]
    },
    description: {
      template: "modules/simple-shop-craft-5e/templates/shop-sheet/description.hbs",
      scrollable: [""]
    },
    footer: {
      template: "templates/generic/form-footer.hbs"
    }
  };

  /* -------------------------------------------- */

  /** @override */
  static TABS = {
    primary: {
      tabs: [
        { id: "buy", label: "SIMPLE_SHOP_CRAFT_5E.ShopEditor.Tabs.Buy", icon: "fas fa-cart-shopping" },
        { id: "sell", label: "SIMPLE_SHOP_CRAFT_5E.ShopEditor.Tabs.Sell", icon: "fas fa-hand-holding-dollar" },
        { id: "description", label: "DND5E.Description", icon: "fas fa-book-open" }
      ],
      initial: "buy"
    }
  };

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * Id of the shop being edited.
   * @type {string}
   */
  shopId;

  /* -------------------------------------------- */

  /**
   * The mode the sheet is currently in. GM-only — players always effectively view in Play mode.
   * @type {ShopSheet.MODES|null}
   * @protected
   */
  _mode = null;

  /* -------------------------------------------- */

  /**
   * Selected buy quantities, keyed by {@link ShopItemEntry.key}. Per-user, not persisted across sessions.
   * @type {Map<string, number>}
   */
  cart = new Map();

  /* -------------------------------------------- */

  /**
   * UUID of the actor (or party) currently selected for buy/sell. Per-user, not persisted across sessions.
   * @type {string|null|undefined}
   */
  selectedActorUuid = undefined;

  /* -------------------------------------------- */

  /**
   * Selected sell quantities, keyed by the actor-owned item's id. Per-user, not persisted across sessions.
   * @type {Map<string, number>}
   */
  sellCart = new Map();

  /* -------------------------------------------- */

  /**
   * The shopping cart window, opened on demand and reused across renders.
   * @type {ShopCart|null}
   */
  #cartApp = null;

  /* -------------------------------------------- */

  /**
   * Buy-side item groups from the last render, used to resolve cart lines.
   * @type {{ type: string, label: string, items: object[] }[]}
   */
  #lastGroups = [];

  /* -------------------------------------------- */

  /**
   * Sell-side item groups from the last render, used to resolve sell lines.
   * @type {{ type: string, label: string, items: object[] }[]}
   */
  #lastSellGroups = [];

  /* -------------------------------------------- */

  /**
   * Rows currently selected in the shopping cart, resolved from the last render.
   * @type {object[]}
   */
  get cartLines() {
    return (this.#lastGroups ?? []).flatMap(group => group.items).filter(row => row.cartQuantity > 0);
  }

  /* -------------------------------------------- */

  /**
   * Can the current user edit this sheet at all? GM-only.
   * @type {boolean}
   */
  get isEditable() {
    return game.user.isGM;
  }

  /* -------------------------------------------- */

  /**
   * Is the sheet in edit mode?
   * @type {boolean}
   */
  get isEditMode() {
    return this._mode === this.constructor.MODES.EDIT;
  }

  /* -------------------------------------------- */

  /**
   * Rows currently selected to sell, resolved from the last render.
   * @type {object[]}
   */
  get sellLines() {
    return (this.#lastSellGroups ?? []).flatMap(group => group.items).filter(row => row.sellQuantity > 0);
  }

  /* -------------------------------------------- */

  /**
   * The shop currently being edited.
   * @type {Shop}
   */
  get shop() {
    return Shop.get(this.shopId);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  get title() {
    return this.shop?.name ?? super.title;
  }

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /** @inheritDoc */
  _configureRenderOptions(options) {
    super._configureRenderOptions(options);
    this._mode = options.mode ?? this._mode ?? this.constructor.MODES.PLAY;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _getHeaderControls() {
    const controls = super._getHeaderControls();
    if ( !this.isEditable ) return controls;
    return [
      ...controls,
      { icon: "fa-solid fa-pen", label: "SIMPLE_SHOP_CRAFT_5E.ShopEditor.RenameShop", action: "renameShop" },
      {
        icon: this.shop.active ? "fa-solid fa-toggle-on" : "fa-solid fa-toggle-off",
        label: this.shop.active
          ? "SIMPLE_SHOP_CRAFT_5E.ShopManager.Shops.Deactivate" : "SIMPLE_SHOP_CRAFT_5E.ShopManager.Shops.Activate",
        action: "toggleActive"
      },
      { icon: "fa-solid fa-bullhorn", label: "SIMPLE_SHOP_CRAFT_5E.ShopEditor.Spotlight", action: "spotlight" }
    ];
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.shop = this.shop;
    context.config = CONFIG.DND5E;
    context.isGM = game.user.isGM;
    context.editable = this.isEditable;
    context.isEditMode = this.isEditMode;
    context.shopClosed = !this.isEditMode && !this.shop.isOpen();
    const { characters, party } = selectableActors({ includeParty: true });
    if ( this.selectedActorUuid === undefined ) {
      this.selectedActorUuid = game.user.character?.type === "character" ? game.user.character.uuid : "";
    }
    context.actorOptions = [
      { value: "", label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.NoActorSelected") },
      ...(party ? [{ value: party.uuid, label: party.name }] : []),
      ...characters.map(a => ({ value: a.uuid, label: a.name }))
    ].map(o => ({ ...o, selected: o.value === this.selectedActorUuid }));
    context.actor = this.selectedActorUuid ? fromUuidSync(this.selectedActorUuid) : null;
    context.hagglingLocked = context.shop.isHagglingLocked(this.selectedActorUuid);
    const playerOverride = context.shop.resolvePlayerOverride(this.selectedActorUuid);
    const renderDiscountTooltip = (sources, total) => ShopSheet.#renderAttribution(sources, total);

    const resolved = await ShopItemEntry.resolveMany(context.shop.items);
    context.groups = await groupByType({
      rows: resolved, settlementCap: context.shop.settlementCap, buyModifier: context.shop.buyModifier,
      cart: this.cart, fixedValueLootTypes: context.shop.fixedValueLootTypes, playerBuyModifier: playerOverride.buy,
      actorName: context.actor?.name, renderDiscountTooltip
    });
    this.#lastGroups = context.groups;

    context.sellGroups = await groupSellItems({
      items: context.actor?.items ?? [], sellModifier: context.shop.sellModifier, sellCart: this.sellCart,
      fixedValueLootTypes: context.shop.fixedValueLootTypes, playerSellModifier: playerOverride.sell,
      actorName: context.actor?.name, renderDiscountTooltip, settlementCap: context.shop.settlementCap
    });
    this.#lastSellGroups = context.sellGroups;

    context.goldPoolDisplay = context.shop.resolveGoldPoolRows({ namePrefix: "currentGold." });
    context.settlementCapDisplay = context.shop.settlementCap.value != null
      ? `${context.shop.settlementCap.value} ${context.shop.settlementCap.denomination.toUpperCase()}`
      : "∞";
    return context;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _preparePartContext(partId, context, options) {
    context = await super._preparePartContext(partId, context, options);
    context.tab = context.tabs?.[partId];
    if ( partId === "footer" ) {
      context.buttons = [{
        type: "button", action: "openCart", icon: "fas fa-basket-shopping",
        label: "SIMPLE_SHOP_CRAFT_5E.ShopCart.ViewCart", cssClass: "always-interactive"
      }];
    }
    if ( partId === "description" ) {
      context.shopFields = Shop.schema.fields;
      context.openingHoursDisplay = context.shop.openingHoursDisplay();
      context.statusOverrideOptions = [
        { value: "", label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.StatusOverrideAuto") },
        { value: "open", label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.StatusOverrideOpen") },
        { value: "closed", label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.StatusOverrideClosed") }
      ];
      context.restockCalendarActive = isCalendariaActive() || isDnd5eAutoRecoveryEnabled();
      context.restockWeekdayOptions = isCalendariaActive()
        ? calendariaWeekdayOptions()
        : game.time.calendar.days.values.map((day, value) => ({ value, label: _loc(day.name) }));
      context.restockWeekdays = Array.from(context.shop.restockWeekdays);
      const selectedNames = context.restockWeekdayOptions
        .filter(o => context.shop.restockWeekdays.has(o.value)).map(o => o.label);
      context.restockWeekdaysDisplay = selectedNames.length
        ? selectedNames.join(", ") : _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.AutoRestockNever");

      context.closedWeekdays = Array.from(context.shop.closedWeekdays);
      const closedWeekdayNames = context.restockWeekdayOptions
        .filter(o => context.shop.closedWeekdays.has(o.value)).map(o => o.label);
      context.closedWeekdaysDisplay = closedWeekdayNames.join(", ");

      context.festivalOptions = festivalOptions();
      context.closedFestivals = Array.from(context.shop.closedFestivals);
      const closedFestivalNames = context.festivalOptions
        .filter(o => context.shop.closedFestivals.has(o.value)).map(o => o.label);
      context.closedFestivalsDisplay = closedFestivalNames.join(", ");
    }
    if ( partId === "buy" ) {
      context.tabId = "buy";
      context.table = buildItemTableSections({
        groups: context.groups, emptyLabel: "SIMPLE_SHOP_CRAFT_5E.ShopEditor.None", columns: BUY_COLUMNS,
        rowTemplate: "modules/simple-shop-craft-5e/templates/shop-sheet/buy-row.hbs"
      });
    }
    if ( partId === "sell" ) {
      context.tabId = "sell";
      context.showNoActor = !context.actor;
      context.noActorLabel = "SIMPLE_SHOP_CRAFT_5E.NoActorSelectedHint";
      context.table = buildItemTableSections({
        groups: context.sellGroups, emptyLabel: "SIMPLE_SHOP_CRAFT_5E.ShopEditor.NoSellableItems",
        columns: SELL_COLUMNS, rowTemplate: "modules/simple-shop-craft-5e/templates/shop-sheet/sell-row.hbs"
      });
    }
    return context;
  }

  /* -------------------------------------------- */
  /*  Life-Cycle Handlers                         */
  /* -------------------------------------------- */

  /** @inheritDoc */
  async _onFirstRender(context, options) {
    await super._onFirstRender(context, options);

    const actions = document.createElement("div");
    actions.classList.add("window-content-actions");

    const button = document.createElement("button");
    button.type = "button";
    button.dataset.tooltip = "SIMPLE_SHOP_CRAFT_5E.ShopEditor.AddItems";
    button.ariaLabel = _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.AddItems");
    button.classList.add("gold-button", "always-interactive");
    button.dataset.action = "addItems";
    button.innerHTML = '<i class="fas fa-plus" inert></i>';

    const generateButton = document.createElement("button");
    generateButton.type = "button";
    generateButton.dataset.tooltip = "SIMPLE_SHOP_CRAFT_5E.ShopEditor.GenerateItem";
    generateButton.ariaLabel = _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.GenerateItem");
    generateButton.classList.add("gold-button", "always-interactive");
    generateButton.dataset.action = "generateItem";
    generateButton.innerHTML = '<i class="fas fa-wand-magic-sparkles" inert></i>';

    actions.append(button, generateButton);
    this.element.querySelector(".window-content").append(actions);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _onRender(context, options) {
    await super._onRender(context, options);

    this._renderModeToggle();
    if ( this._mode === this.constructor.MODES.PLAY ) this._disableFields();

    const actions = this.element.querySelector(".window-content-actions");
    if ( actions ) actions.hidden = !context.editable || !this.isEditMode || !context.tabs?.buy?.active;
  }

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers                */
  /* -------------------------------------------- */

  /** @inheritDoc */
  _attachPartListeners(partId, htmlElement, options) {
    super._attachPartListeners(partId, htmlElement, options);
    const editable = this.isEditable;

    if ( partId === "header" ) {
      htmlElement.querySelector('select[name="selectedActor"]')?.addEventListener("change", async event => {
        event.stopPropagation();
        this.selectedActorUuid = event.target.value;
        this.sellCart.clear();
        await this.render();
        if ( this.#cartApp?.rendered ) this.#cartApp.render();
      });
    }

    if ( (partId === "buy") || (partId === "sell") ) {
      htmlElement.querySelectorAll(".item-tooltip[data-uuid]").forEach(el => {
        const uuid = el.dataset.uuid;
        if ( !uuid ) return;
        if ( (partId === "buy") && needsDefaultPrice(this.#findRowItem(el.dataset.key)) ) return;
        el.dataset.tooltipHtml = loadingTooltip(uuid);
        el.dataset.tooltipClass = game.dnd5e.utils.loadingTooltip
          ? "dnd5e2 dnd5e-tooltip item-tooltip"
          : "dnd5e2 dnd5e-tooltip item-tooltip themed theme-light";
        el.dataset.tooltipDirection ??= "LEFT";
      });
    }

    if ( partId === "buy" ) {
      htmlElement.querySelectorAll(".item-tooltip[data-key]").forEach(el => {
        const item = this.#findRowItem(el.dataset.key);
        if ( !item ) return;
        const defaultPrice = needsDefaultPrice(item) ? resolveItemPrice(item) : null;
        if ( !defaultPrice && el.dataset.uuid ) return;
        const resolved = (typeof item.clone === "function") ? Promise.resolve(item) : fromUuid(item.uuid);
        resolved
          .then(fullItem => defaultPrice ? fullItem?.clone({ system: { price: defaultPrice } }) : fullItem)
          .then(tooltipItem => tooltipItem?.richTooltip())
          .then(result => {
            if ( !result ) return;
            el.dataset.tooltipHtml = result.content;
            el.dataset.tooltipClass = result.classes.join(" ");
            el.dataset.tooltipDirection ??= "LEFT";
          });
      });
    }

    if ( partId === "buy" ) {
      const buyTab = htmlElement.matches('.tab[data-tab="buy"]') ? htmlElement : htmlElement.querySelector('.tab[data-tab="buy"]');
      if ( editable && buyTab ) {
        buyTab.addEventListener("dragover", event => event.preventDefault());
        buyTab.addEventListener("drop", async event => {
          const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
          if ( data.type !== "Item" ) return;
          const item = await fromUuid(data.uuid);
          if ( !item || !CONFIG.Item.dataModels[item.type]?.inventorySection ) return;
          await this.#mergeItemEntries([
            { uuid: data.uuid, stock: { max: null, current: null } }
          ]);
        });
      }
    }
  }

  /* -------------------------------------------- */

  /**
   * Handle adding items to this shop via the compendium browser.
   * @this {ShopSheet}
   */
  static async #addItems() {
    const selection = await game.dnd5e.applications.CompendiumBrowser.select({
      tab: "physical",
      selection: { min: 1 }
    });
    if ( !selection?.size ) return;

    const items = await Promise.all(Array.from(selection).map(uuid => fromUuid(uuid)));
    const entries = items
      .filter(item => item?.system?.identifier)
      .map(item => ({ identifier: item.system.identifier, stock: { max: null, current: null } }));
    if ( !entries.length ) return;

    await this.#mergeItemEntries(entries);
  }

  /* -------------------------------------------- */

  /**
   * Handle incrementing/decrementing an item's quantity in the (session-only) shopping cart.
   * @this {ShopSheet}
   * @param {Event} event         Triggering click event.
   * @param {HTMLElement} target  Button that was clicked.
   */
  static async #adjustCartQuantity(event, target) {
    const key = target.dataset.key;
    const row = this.#findRow(key);
    const max = row?.suppressed
      ? 0 : (this.shop.items.find(i => ShopItemEntry.key(i) === key)?.stock.current ?? Infinity);
    const delta = Number(target.dataset.delta);
    const next = Math.clamp((this.cart.get(key) ?? 0) + delta, 0, max);
    if ( next === 0 ) this.cart.delete(key);
    else this.cart.set(key, next);
    await this.render();
    if ( this.#cartApp?.rendered ) this.#cartApp.render();
  }

  /* -------------------------------------------- */

  /**
   * Handle incrementing/decrementing a sell quantity.
   * @this {ShopSheet}
   * @param {Event} event         Triggering click event.
   * @param {HTMLElement} target  Button that was clicked.
   */
  static async #adjustSellQuantity(event, target) {
    const itemId = target.dataset.itemId;
    const actor = this.selectedActorUuid ? fromUuidSync(this.selectedActorUuid) : null;
    const row = this.#lastSellGroups.flatMap(group => group.items).find(row => row.item.id === itemId);
    const max = row?.suppressed ? 0 : (actor?.items.get(itemId)?.system?.quantity ?? 0);
    const delta = Number(target.dataset.delta);
    const next = Math.clamp((this.sellCart.get(itemId) ?? 0) + delta, 0, max);
    if ( next === 0 ) this.sellCart.delete(itemId);
    else this.sellCart.set(itemId, next);
    await this.render();
    if ( this.#cartApp?.rendered ) this.#cartApp.render();
  }

  /* -------------------------------------------- */

  /**
   * Handle toggling the sheet's Play/Edit mode.
   * @this {ShopSheet}
   */
  static async #changeMode() {
    this._mode = this.isEditMode ? this.constructor.MODES.PLAY : this.constructor.MODES.EDIT;
    this.render();
  }

  /* -------------------------------------------- */

  /**
   * Handle opening a small dialog to edit an item's price-modifier override.
   * @this {ShopSheet}
   * @param {Event} event         Triggering click event.
   * @param {HTMLElement} target  Element that was clicked.
   */
  static async #editDiscount(event, target) {
    const playerOverride = this.shop.resolvePlayerOverride(this.selectedActorUuid);
    await openDiscountConfig(this, target, playerOverride, updateData => this.#updateShop(updateData));
  }

  /* -------------------------------------------- */

  /**
   * Handle opening a dialog to edit the shop's maximum money pool.
   * @this {ShopSheet}
   */
  static async #editGoldPool() {
    await new GoldPoolConfig({ shopSheet: this, onUpdate: updateData => this.#updateShop(updateData) })
      .render({ force: true });
  }

  /* -------------------------------------------- */

  /**
   * Handle opening the file picker to change this shop's image, mirroring core's own
   * `DocumentSheetV2#_onEditImage` (`document-sheet.mjs:320`).
   * @this {ShopSheet}
   * @param {Event} event         Triggering click event.
   * @param {HTMLElement} target  The `<img data-edit="img">` element that was clicked.
   */
  static async #editImage(event, target) {
    const fp = new foundry.applications.apps.FilePicker.implementation({
      current: this.shop.img,
      type: "image",
      redirectToRoot: [Shop.DEFAULT_ICON],
      callback: path => {
        target.src = path;
        if ( this.options.form.submitOnChange ) {
          this.form.dispatchEvent(new Event("submit", { cancelable: true }));
        }
      },
      position: { top: this.position.top + 40, left: this.position.left + 10 }
    });
    await fp.browse();
  }

  /* -------------------------------------------- */

  /**
   * Handle opening a small dialog to edit an item's stock max (restock target) and current stock together.
   * @this {ShopSheet}
   * @param {Event} event         Triggering click event.
   * @param {HTMLElement} target  Element that was clicked.
   */
  static async #editMaxStock(event, target) {
    await new MaxStockConfig({
      shopSheet: this, entryKey: target.dataset.key, onUpdate: updateData => this.#updateShop(updateData)
    }).render({ force: true });
  }

  /* -------------------------------------------- */

  /**
   * Handle opening a dialog to edit the shop's buy/sell price modifiers.
   * @this {ShopSheet}
   */
  static async #editModifiers() {
    await openModifiersConfig(this, updateData => this.#updateShop(updateData));
  }

  /* -------------------------------------------- */

  /**
   * Handle opening a dialog to edit the shop's owner.
   * @this {ShopSheet}
   */
  static async #editOwner() {
    await openOwnerConfig(this, updateData => this.#updateShop(updateData));
  }

  /* -------------------------------------------- */

  /**
   * Handle opening a dialog to manage this shop's per-player discount overrides and haggling locks.
   * @this {ShopSheet}
   */
  static async #editPlayers() {
    await new PlayersConfig({
      shopSheet: this,
      onUpdate: updateData => this.#updateShop(updateData),
      onUpdatePlayerDiscount: (actorUuid, updateData) => this.#updatePlayerDiscount(actorUuid, updateData)
    }).render({ force: true });
  }

  /* -------------------------------------------- */

  /**
   * Handle opening a small dialog to edit an item's price.
   * @this {ShopSheet}
   * @param {Event} event         Triggering click event.
   * @param {HTMLElement} target  Element that was clicked.
   */
  static async #editPrice(event, target) {
    await openPriceConfig(this, target, updateData => this.#updateShop(updateData));
  }

  /* -------------------------------------------- */

  /**
   * Handle opening a dialog to edit the shop's settlement cap.
   * @this {ShopSheet}
   */
  static async #editSettlementCap() {
    await new SettlementCapConfig({ shopSheet: this, onUpdate: updateData => this.#updateShop(updateData) })
      .render({ force: true });
  }

  /* -------------------------------------------- */

  /**
   * Handle opening the magic item generator dialog.
   * @this {ShopSheet}
   */
  static async #generateItem() {
    await new GenerateItemDialog({ shopSheet: this, onGenerated: entries => this.#mergeItemEntries(entries) })
      .render({ force: true });
  }

  /* -------------------------------------------- */

  /**
   * Handle opening a dialog to pick a Charisma skill and the NPC's attitude, then roll it against the
   * shop NPC's DC for the acting actor.
   * @this {ShopSheet}
   */
  static async #haggle() {
    if ( !this.selectedActorUuid ) return;
    await new HaggleDialog({
      shopSheet: this,
      onUpdatePlayerDiscount: (actorUuid, updateData) => this.#updatePlayerDiscount(actorUuid, updateData)
    }).render({ force: true });
  }

  /* -------------------------------------------- */

  /**
   * Handle submitting the shop's inline form fields: item discount overrides, image, location,
   * description, and current gold pool.
   * @this {ShopSheet}
   * @param {Event} event                Triggering submit event.
   * @param {HTMLFormElement} form       The submitted form.
   * @param {FormDataExtended} formData  Data from the form.
   * @returns {Promise<void>}
   */
  static async #onSubmit(event, form, formData) {
    const data = foundry.utils.expandObject(formData.object);
    const overrides = data.items ?? {};
    const items = this.shop.items.map(entry => {
      const override = overrides[ShopItemEntry.key(entry)];
      if ( !override ) return entry.toObject();
      const result = entry.toObject();
      if ( override.discount !== undefined ) {
        result.discount = override.discount === null ? null : Math.clamp(Math.round(override.discount), -100, 1000);
      }
      return result;
    });

    const updateData = { items };
    if ( data.img !== undefined ) updateData.img = data.img;
    if ( data.location !== undefined ) updateData.location = data.location;
    if ( data.openHour !== undefined ) updateData.openHour = data.openHour;
    if ( data.openMinute !== undefined ) updateData.openMinute = Math.clamp(Math.round(data.openMinute ?? 0), 0, 59);
    if ( data.closeHour !== undefined ) updateData.closeHour = data.closeHour;
    if ( data.closeMinute !== undefined ) updateData.closeMinute = Math.clamp(Math.round(data.closeMinute ?? 0), 0, 59);
    if ( data.restockWeekdays !== undefined ) updateData.restockWeekdays = data.restockWeekdays;
    if ( data.closedWeekdays !== undefined ) updateData.closedWeekdays = data.closedWeekdays;
    if ( data.closedFestivals !== undefined ) updateData.closedFestivals = data.closedFestivals;
    if ( data.statusOverride !== undefined ) updateData.statusOverride = data.statusOverride;
    if ( data.description !== undefined ) updateData.description = data.description;
    if ( data.currentGold ) {
      const current = Object.fromEntries(
        Object.entries(data.currentGold).map(([denom, value]) => [denom, Math.max(0, Math.round(value ?? 0))])
      );
      updateData.goldPool = { ...this.shop.goldPool, current };
    }
    await this.#updateShop(updateData);
  }

  /* -------------------------------------------- */

  /**
   * Handle opening the shopping cart window.
   * @this {ShopSheet}
   */
  static #openCart() {
    this.#cartApp ??= new ShopCart({ shopSheet: this });
    this.#cartApp.render({ force: true });
  }

  /* -------------------------------------------- */

  /**
   * Handle opening an item's sheet from the Buy/Sell table. Always re-resolves via UUID rather than
   * trusting the row's last-rendered data, matching dnd5e's own Compendium Browser click-to-open pattern.
   * Falls back to the last-rendered row item for generated entries, which have no resolvable UUID.
   * @this {ShopSheet}
   * @param {Event} event         Triggering click event.
   * @param {HTMLElement} target  Element that was clicked.
   */
  static async #openItemSheet(event, target) {
    const uuid = target.dataset.uuid;
    const item = uuid ? await fromUuid(uuid) : this.#findRowItem(target.dataset.key);
    if ( item ) openItemSheet(item);
  }

  /* -------------------------------------------- */

  /**
   * Handle removing an item from this shop.
   * @this {ShopSheet}
   * @param {Event} event         Triggering click event.
   * @param {HTMLElement} target  Button that was clicked.
   */
  static async #removeItem(event, target) {
    const key = target.dataset.key;
    const items = this.shop.items.filter(i => ShopItemEntry.key(i) !== key).map(i => i.toObject());
    await this.#updateShop({ items });
  }

  /* -------------------------------------------- */

  /**
   * Handle opening a dialog to rename this shop.
   * @this {ShopSheet}
   */
  static async #renameShop() {
    await openRenameConfig(this, updateData => this.#updateShop(updateData));
  }

  /* -------------------------------------------- */

  /**
   * Handle resetting this shop's stock (to each item's configured max, skipping items excluded via
   * `noRestock`) and gold pool (to its max, falling back to the default gold pool unless unlimited).
   * @this {ShopSheet}
   */
  static async #resetShop() {
    await this.#updateShop(this.shop.restockUpdates());
  }

  /* -------------------------------------------- */

  /**
   * Handle broadcasting this shop to every connected client, opening it in their Shop Editor.
   * @this {ShopSheet}
   */
  static async #spotlight() {
    const targets = game.users.filter(u => u.active && (u.id !== game.user.id));
    if ( !targets.length ) {
      ui.notifications.warn("SIMPLE_SHOP_CRAFT_5E.ShopEditor.SpotlightNoTargets", { localize: true });
      return;
    }
    await User.queryMany(targets, `${MODULE_ID}.spotlight`, { shopId: this.shopId });
    ui.notifications.info("SIMPLE_SHOP_CRAFT_5E.ShopEditor.SpotlightSuccess", { localize: true });
  }

  /* -------------------------------------------- */

  /**
   * Handle toggling this shop's active/visible state.
   * @this {ShopSheet}
   */
  static async #toggleActive() {
    await this.#updateShop({ active: !this.shop.active });
  }

  /* -------------------------------------------- */
  /*  Helpers                                     */
  /* -------------------------------------------- */

  /**
   * Render dnd5e's property-attribution table markup for use as a hover tooltip.
   * @param {object[]} sources
   * @param {string} total
   * @returns {Promise<string>}
   */
  static async #renderAttribution(sources, total) {
    return foundry.applications.handlebars.renderTemplate("systems/dnd5e/templates/apps/property-attribution.hbs", {
      caption: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.PriceModifier"), sources, total
    });
  }

  /* -------------------------------------------- */

  /**
   * Find a row from the most recently rendered Buy groups.
   * @param {string} key
   * @returns {object|null}
   */
  #findRow(key) {
    return this.#lastGroups.flatMap(group => group.items).find(row => row.key === key) ?? null;
  }

  /* -------------------------------------------- */

  /**
   * Find a row's resolved item from the most recently rendered Buy/Sell groups, used for
   * generated entries which have no resolvable UUID.
   * @param {string} key
   * @returns {object|null}
   */
  #findRowItem(key) {
    return this.#findRow(key)?.item ?? null;
  }

  /* -------------------------------------------- */

  /**
   * Merge new item entries into the shop's item list, replacing any existing entry with the same
   * {@link ShopItemEntry.key}.
   * @param {ShopItemEntryData[]} newEntries
   */
  async #mergeItemEntries(newEntries) {
    const entries = new Map(this.shop.items.map(i => [ShopItemEntry.key(i), i.toObject()]));
    for ( const entry of newEntries ) entries.set(ShopItemEntry.key(entry), entry);
    await this.#updateShop({ items: Array.from(entries.values()) });
  }

  /* -------------------------------------------- */

  /**
   * Merge an update into an actor's playerDiscounts entry for this shop, creating one with no discount
   * overrides yet if it doesn't already exist.
   * @param {string} actorUuid
   * @param {object} updateData
   * @returns {Promise<void>}
   */
  async #updatePlayerDiscount(actorUuid, updateData) {
    const existing = this.shop.playerDiscounts.map(pd => pd.toObject());
    const index = existing.findIndex(pd => pd.actor === actorUuid);
    const playerDiscounts = index >= 0
      ? existing.map((pd, i) => i === index ? { ...pd, ...updateData } : pd)
      : [...existing, { actor: actorUuid, buyModifier: null, sellModifier: null, ...updateData }];
    await this.#updateShop({ playerDiscounts });
  }

  /* -------------------------------------------- */

  /**
   * Persist a partial update to this shop's data and re-render.
   * @param {object} updateData  Fields to merge into the shop's current data.
   * @returns {Promise<void>}
   */
  async #updateShop(updateData) {
    if ( game.user.isGM ) await Shop.update(this.shopId, updateData);
    else {
      const gm = game.users.activeGM;
      if ( !gm ) return ui.notifications.warn(_loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.NoActiveGM"));
      await gm.query(`${MODULE_ID}.updateShop`, { shopId: this.shopId, updateData });
    }
    this.render();
    if ( this.#cartApp?.rendered ) this.#cartApp.render();
  }
}

/* -------------------------------------------- */

/**
 * Build a property-attribution source entry for an additive percent term, matching dnd5e's own
 * convention of flipping negative "add" values to type "subtract" with an absolute display value.
 * @param {string} label
 * @param {number} value
 * @returns {{ label: string, value: string, type: string }}
 */
function additiveSource(label, value) {
  return { label, value: `${Math.abs(value)}%`, type: (value < 0) ? "subtract" : "add" };
}

/* -------------------------------------------- */

/**
 * Group resolved item rows by their item type.
 * @param {object} options
 * @param {{ entry: ShopItemEntryData, item: object|null }[]} options.rows
 * @param {{ value: number|null, denomination: string }} options.settlementCap
 * @param {number} options.buyModifier  Shop's default buy-side percent discount/markup, used when an item has
 *   no override.
 * @param {Map<string, number>} options.cart  Selected buy quantities, keyed by {@link ShopItemEntry.key}.
 * @param {Set<string>} options.fixedValueLootTypes
 * @param {number|null} [options.playerBuyModifier]  Acting actor's buy-side override, used when an item has
 *   no override.
 * @param {string} [options.actorName]  Acting actor's name, used to label the player row.
 * @param {(sources: object[], total: string) => Promise<string>} options.renderDiscountTooltip
 * @returns {Promise<{ type: string, label: string, items: object[] }[]>}
 */
async function groupByType({
  rows, settlementCap, buyModifier, cart, fixedValueLootTypes, playerBuyModifier, actorName, renderDiscountTooltip
}) {
  const targetUnit = game.settings.get("dnd5e", "metricWeightUnits") ? "kg" : "lb";
  const capCP = settlementCap?.value != null ? toCopper(settlementCap.value, settlementCap.denomination) : null;
  const groups = new Map();
  for ( const row of rows ) {
    row.key = ShopItemEntry.key(row.entry);
    const itemPrice = resolveItemPrice(row.item);
    const basePrice = row.entry.price?.value ?? itemPrice?.value ?? 0;
    const denomination = (row.entry.price?.value != null)
      ? row.entry.price.denomination
      : (itemPrice?.denomination ?? CONFIG.DND5E.defaultCurrency);
    const rowIsFixedValue = isFixedValue(row.item, fixedValueLootTypes);
    const { percent: discountPercent, sources } = resolveDiscountSources({
      itemOverride: row.entry.discount, isFixedValue: rowIsFixedValue, shopModifier: buyModifier,
      playerModifier: playerBuyModifier, actorName
    });
    const finalValue = basePrice * (1 + (discountPercent / 100));
    const baseCP = toCopper(basePrice, denomination);
    const priceCP = toCopper(finalValue, denomination);
    row.priceDisplay = breakdownCopper(priceCP);
    row.priceCP = priceCP;
    row.discountPercent = discountPercent;
    row.discountTooltip = await renderDiscountTooltip(sources, `${discountPercent}%`);
    row.cartQuantity = cart.get(row.key) ?? 0;
    const bundleSize = row.entry.bundleSize
      ?? ((row.item?.system?.quantity > 1) ? row.item.system.quantity : 1);
    row.bundleSize = bundleSize > 1 ? bundleSize : null;
    row.weight = resolveWeight(row.item?.system, targetUnit);
    row.stockTracked = row.entry.stock.current !== null;

    const reasons = [];
    if ( !row.item ) reasons.push(_loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.SuppressedNotFound"));
    if ( row.entry.stock.current === 0 ) reasons.push(_loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.SuppressedStock"));
    if ( (capCP != null) && (baseCP > capCP) ) reasons.push(_loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.SuppressedCap"));
    row.suppressed = reasons.length > 0;
    row.suppressReason = reasons.join(", ");
    row.itemImg = row.item?.img ?? "icons/svg/hazard.svg";
    row.itemName = row.item?.name ?? row.entry.identifier ?? row.entry.uuid ?? "?";

    const type = row.item?.type ?? "unknown";
    if ( !groups.has(type) ) groups.set(type, []);
    groups.get(type).push(row);
  }
  return finalizeGroups(groups);
}

/* -------------------------------------------- */

/**
 * Group a selected actor's sellable inventory by item type.
 * @param {object} options
 * @param {Item5e[]|Collection} options.items      The actor's items.
 * @param {number} options.sellModifier            Shop's sell-side percent discount/markup.
 * @param {Map<string, number>} options.sellCart   Selected sell quantities, keyed by item id.
 * @param {Set<string>} options.fixedValueLootTypes
 * @param {number|null} [options.playerSellModifier]  Acting actor's sell-side override, if configured.
 * @param {string} [options.actorName]  Acting actor's name, used to label the player row.
 * @param {(sources: object[], total: string) => Promise<string>} options.renderDiscountTooltip
 * @param {{ value: number|null, denomination: string, appliesToSell: boolean }} [options.settlementCap]
 *   Blocks selling an item for more than this value, if `appliesToSell` is set.
 * @returns {Promise<{ type: string, label: string, items: object[] }[]>}
 */
async function groupSellItems({
  items, sellModifier, sellCart, fixedValueLootTypes, playerSellModifier, actorName, renderDiscountTooltip,
  settlementCap
}) {
  const targetUnit = game.settings.get("dnd5e", "metricWeightUnits") ? "kg" : "lb";
  const capCP = (settlementCap?.value != null) && settlementCap.appliesToSell
    ? toCopper(settlementCap.value, settlementCap.denomination) : null;
  const sellable = Array.from(items).filter(item => CONFIG.Item.dataModels[item.type]?.inventorySection);
  const resolved = await ShopItemEntry.resolveMany(sellable.map(item => ({ identifier: item.system.identifier })));
  const groups = new Map();
  for ( const [index, item] of sellable.entries() ) {
    const catalogItem = resolved[index].item;
    const bundleSize = (catalogItem?.system?.quantity > 1) ? catalogItem.system.quantity : 1;
    const basePrice = (item.system.price?.value ?? 0) / bundleSize;
    const denomination = item.system.price?.denomination ?? CONFIG.DND5E.defaultCurrency;
    const rowIsFixedValue = isFixedValue(item, fixedValueLootTypes);
    const { percent: discountPercent, sources } = resolveDiscountSources({
      itemOverride: null, isFixedValue: rowIsFixedValue, shopModifier: sellModifier,
      playerModifier: playerSellModifier, actorName
    });
    const finalValue = basePrice * (1 + (discountPercent / 100));
    const priceCP = toCopper(finalValue, denomination);
    const suppressed = (capCP != null) && (priceCP > capCP);
    const row = {
      item,
      priceDisplay: breakdownCopper(priceCP),
      discountPercent,
      discountTooltip: await renderDiscountTooltip(sources, `${discountPercent}%`),
      sellQuantity: sellCart.get(item.id) ?? 0,
      owned: item.system.quantity ?? 1,
      priceCP,
      suppressed,
      weight: resolveWeight(item.system, targetUnit)
    };
    if ( !groups.has(item.type) ) groups.set(item.type, []);
    groups.get(item.type).push(row);
  }
  return finalizeGroups(groups);
}

/* -------------------------------------------- */

/**
 * Items of the shop's configured fixed-value loot subtypes (default: Gemstones and Art Objects) have a
 * fixed market value — never subject to any buy/sell discount or markup.
 * @param {Item5e|object} [item]
 * @param {Set<string>} fixedValueLootTypes
 * @returns {boolean}
 */
function isFixedValue(item, fixedValueLootTypes) {
  return (item?.type === "loot") && fixedValueLootTypes.has(item?.system?.type?.value);
}

/* -------------------------------------------- */

/**
 * Resolve a row's effective discount percent and the attribution sources behind it: item override, else
 * fixed-value (0%), else shop default + player modifier. Rendering the sources into a tooltip is left to
 * the caller (a View concern).
 * @param {object} options
 * @param {number|null} options.itemOverride    The item entry's own discount override, if any (buy-side only).
 * @param {boolean} options.isFixedValue        Whether the item is a fixed-value loot subtype (always 0%).
 * @param {number} options.shopModifier         Shop's default percent for this side (buy or sell).
 * @param {number|null} options.playerModifier  Acting actor's additive modifier for this side, if configured.
 * @param {string} [options.actorName]          Acting actor's name, used to label the player row.
 * @returns {{ percent: number, sources: object[] }}
 */
function resolveDiscountSources({
  itemOverride, isFixedValue: rowIsFixedValue, shopModifier, playerModifier, actorName
}) {
  if ( itemOverride != null ) {
    const sources = [{ label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.ItemOverride"), value: `${itemOverride}%`, type: "override" }];
    return { percent: itemOverride, sources };
  }
  if ( rowIsFixedValue ) {
    const sources = [{ label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.FixedValueItem"), value: "0%", type: "override" }];
    return { percent: 0, sources };
  }
  const sources = [additiveSource(_loc("SIMPLE_SHOP_CRAFT_5E.Shop"), shopModifier)];
  let percent = shopModifier;
  if ( playerModifier ) {
    sources.push(additiveSource(actorName, playerModifier));
    percent += playerModifier;
  }
  return { percent, sources };
}

/* -------------------------------------------- */

/**
 * Convert an item's weight to the world's configured weight unit, if it has one.
 * @param {object} [itemSystem]  The item's system data.
 * @param {string} targetUnit    "kg" or "lb", per the world's `metricWeightUnits` setting.
 * @returns {{ value: number, unit: string }|undefined}
 */
function resolveWeight(itemSystem, targetUnit) {
  if ( !itemSystem?.weight ) return undefined;
  return {
    value: game.dnd5e.utils.convertWeight(itemSystem.weight.value, itemSystem.weight.units || "lb", targetUnit),
    unit: targetUnit
  };
}
