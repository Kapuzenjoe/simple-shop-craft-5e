import {
  HIRELING_ITEM_TYPE, HIRELING_TYPES, LODGING_ITEM_TYPE, LODGING_TIERS, MODULE_ID
} from "../../config.mjs";
import { EnchantedItemBlueprint } from "../../data/enchanted-item-blueprint.mjs";
import { newEntryStock, Shop, ShopItemEntry } from "../../data/shop-data.mjs";
import {
  applyItemSort, applyListControls, applyLoadingTooltip, applyRichTooltip, breakdownCopper, buildItemTableSections,
  confirmDeleteShop, finalizeGroups, isCalendarModeActive, isSpellScrollItem, needsDefaultPrice, openItemSheet,
  resolveItemPrice, selectableActors, spotlightShop, toCopper
} from "../../utils.mjs";

import AddEntryDialog from "./add-entry-dialog.mjs";
import ConfigureTemplatesDialog from "./configure-templates-dialog.mjs";
import FillFromTableDialog from "./fill-from-table-dialog.mjs";
import GenerateItemDialog from "./generate-item-dialog.mjs";
import HaggleDialog from "./haggle-dialog.mjs";
import ShopCart from "./shop-cart.mjs";
import DiscountConfig from "./shop-config/discount-config.mjs";
import HirelingConfig from "./shop-config/hireling-config.mjs";
import LodgingConfig from "./shop-config/lodging-config.mjs";
import MaxStockConfig from "./shop-config/max-stock-config.mjs";
import ModifiersConfig from "./shop-config/modifiers-config.mjs";
import OwnerConfig from "./shop-config/owner-config.mjs";
import PlayersConfig from "./shop-config/players-config.mjs";
import PriceConfig from "./shop-config/price-config.mjs";
import SettlementCapConfig from "./shop-config/settlement-cap-config.mjs";
import VendorConfig from "./shop-config/vendor-config.mjs";

/**
 * @import { ShopItemEntryData } from "../../_types.mjs";
 */

const { Application5e } = game.dnd5e.applications.api;

/**
 * Column definitions for the Buy tab's item table.
 * @type {{ id: string, label?: string }[]}
 */
const BUY_COLUMNS = [
  { id: "cart" },
  { id: "discount", label: "SIMPLE_SHOP_CRAFT_5E.ShopEditor.PriceModifier" },
  { id: "price", label: "DND5E.Price" },
  { id: "weight", label: "DND5E.Weight" },
  { id: "quantity", label: "SIMPLE_SHOP_CRAFT_5E.ShopEditor.Stock" },
  { id: "controls" }
];

/**
 * Column definitions for the Services tab's item table — same as Buy, without Weight.
 * @type {{ id: string, label?: string }[]}
 */
const SERVICES_COLUMNS = BUY_COLUMNS.filter(column => column.id !== "weight");

/**
 * Column definitions for the Sell tab's item table.
 * @type {{ id: string, label?: string }[]}
 */
const SELL_COLUMNS = [
  { id: "cart" },
  { id: "discount", label: "SIMPLE_SHOP_CRAFT_5E.ShopEditor.PriceModifier" },
  { id: "price", label: "DND5E.Price" },
  { id: "weight", label: "DND5E.Weight" },
  { id: "quantity", label: "DND5E.Quantity" },
  { id: "controls" }
];

/**
 * Cycle-able Buy/Sell sort modes, in cycle order.
 * @type {Record<string, { icon: string, label: string }>}
 */
const SORT_MODES = {
  name: { icon: "fa-solid fa-arrow-down-a-z", label: "SIMPLE_SHOP_CRAFT_5E.ShopEditor.SortByName" },
  price: { icon: "fa-solid fa-arrow-down-1-9", label: "SIMPLE_SHOP_CRAFT_5E.ShopEditor.SortByPrice" }
};

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
    shopId: null,
    classes: ["sheet", "simple-shop-craft-5e", "shop-sheet", "standard-form"],
    tag: "form",
    window: {
      title: "SIMPLE_SHOP_CRAFT_5E.ShopEditor.Title",
      resizable: true,
      controls: [
        { action: "editVendorSettings", icon: "fa-solid fa-cog", label: "SIMPLE_SHOP_CRAFT_5E.ShopEditor.VendorSettings",
          visible: ShopSheet.#isEditable },
        { action: "toggleActive", icon: "fa-solid fa-toggle-on", label: "SIMPLE_SHOP_CRAFT_5E.ShopManager.Shops.Deactivate",
          visible: ShopSheet.#canDeactivate },
        { action: "toggleActive", icon: "fa-solid fa-toggle-off", label: "SIMPLE_SHOP_CRAFT_5E.ShopManager.Shops.Activate",
          visible: ShopSheet.#canActivate },
        { action: "spotlight", icon: "fa-solid fa-bullhorn", label: "SIMPLE_SHOP_CRAFT_5E.ShopEditor.Spotlight",
          visible: ShopSheet.#isEditable },
        { action: "duplicateShop", icon: "fa-solid fa-copy", label: "SIMPLE_SHOP_CRAFT_5E.ShopManager.Shops.Duplicate",
          visible: ShopSheet.#isEditable },
        { action: "deleteShop", icon: "fa-solid fa-trash", label: "SIMPLE_SHOP_CRAFT_5E.ShopManager.Shops.Delete",
          visible: ShopSheet.#isEditable }
      ]
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
      addService: ShopSheet.#addService,
      adjustCartQuantity: ShopSheet.#adjustCartQuantity,
      adjustSellQuantity: ShopSheet.#adjustSellQuantity,
      changeMode: ShopSheet.#changeMode,
      deleteShop: ShopSheet.#deleteShop,
      duplicateShop: ShopSheet.#duplicateShop,
      editDiscount: ShopSheet.#editDiscount,
      editImage: ShopSheet.#editImage,
      editMaxStock: ShopSheet.#editMaxStock,
      editModifiers: ShopSheet.#editModifiers,
      editOwner: ShopSheet.#editOwner,
      editPlayers: ShopSheet.#editPlayers,
      editPrice: ShopSheet.#editPrice,
      editSettlementCap: ShopSheet.#editSettlementCap,
      editVendorSettings: ShopSheet.#editVendorSettings,
      fillFromTable: ShopSheet.#fillFromTable,
      generateItem: ShopSheet.#generateItem,
      haggle: ShopSheet.#haggle,
      openCart: ShopSheet.#openCart,
      openItemSheet: ShopSheet.#openItemSheet,
      openLinkedActor: ShopSheet.#openLinkedActor,
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
      template: "modules/simple-shop-craft-5e/templates/shops/shop-sheet/header.hbs",
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
        "modules/simple-shop-craft-5e/templates/shops/shop-sheet/buy-row.hbs"
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
        "modules/simple-shop-craft-5e/templates/shops/shop-sheet/sell-row.hbs"
      ],
      scrollable: [""]
    },
    services: {
      template: "modules/simple-shop-craft-5e/templates/partials/tab-item-table.hbs",
      templates: [
        "modules/simple-shop-craft-5e/templates/partials/currency-parts.hbs",
        "modules/simple-shop-craft-5e/templates/partials/item-avatar-name.hbs",
        "modules/simple-shop-craft-5e/templates/partials/item-weight-cell.hbs",
        "modules/simple-shop-craft-5e/templates/partials/item-table.hbs",
        "modules/simple-shop-craft-5e/templates/shops/shop-sheet/buy-row.hbs"
      ],
      scrollable: [""]
    },
    description: {
      template: "modules/simple-shop-craft-5e/templates/shops/shop-sheet/description.hbs",
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
        { id: "services", label: "SIMPLE_SHOP_CRAFT_5E.ShopEditor.Tabs.Services", icon: "fas fa-bell-concierge" },
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
   * Service item groups from the last render.
   * @type {{ type: string, label: string, items: object[] }[]}
   */
  #lastServiceGroups = [];

  /* -------------------------------------------- */

  /**
   * Current Buy-tab search query, kept live across re-renders.
   * @type {string}
   */
  #buySearch = "";

  /* -------------------------------------------- */

  /**
   * Current Sell-tab search query, kept live across re-renders.
   * @type {string}
   */
  #sellSearch = "";

  /* -------------------------------------------- */

  /**
   * Current Buy-tab type filter, kept live across re-renders. Empty string means no filter.
   * @type {string}
   */
  #buyTypeFilter = "";

  /* -------------------------------------------- */

  /**
   * Current Sell-tab type filter, kept live across re-renders. Empty string means no filter.
   * @type {string}
   */
  #sellTypeFilter = "";

  /* -------------------------------------------- */

  /**
   * Current Buy-tab sort, kept live across re-renders. "type" is the default server-rendered order.
   * @type {"type"|"name"}
   */
  #buySort = "name";

  /* -------------------------------------------- */

  /**
   * Current Sell-tab sort, kept live across re-renders. "type" is the default server-rendered order.
   * @type {"type"|"name"}
   */
  #sellSort = "name";

  /* -------------------------------------------- */

  /**
   * Current Services-tab search query, kept live across re-renders.
   * @type {string}
   */
  #serviceSearch = "";

  /* -------------------------------------------- */

  /**
   * Current Services-tab type filter, kept live across re-renders. Empty string means no filter.
   * @type {string}
   */
  #serviceTypeFilter = "";

  /* -------------------------------------------- */

  /**
   * Current Services-tab sort, kept live across re-renders. "type" is the default server-rendered order.
   * @type {"type"|"name"}
   */
  #serviceSort = "name";

  /* -------------------------------------------- */

  /**
   * Rows currently selected in the shopping cart, resolved from the last render.
   * @type {object[]}
   */
  get cartLines() {
    return [...(this.#lastGroups ?? []), ...(this.#lastServiceGroups ?? [])]
      .flatMap(group => group.items).filter(row => row.cartQuantity > 0);
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
    const playerOverride = context.shop.resolvePlayerOverride(this.selectedActorUuid);
    const renderDiscountTooltip = (sources, total) => ShopSheet.#renderAttribution(sources, total);
    const hasCrafterFeat = (game.dnd5e.settings.rulesVersion === "modern")
      && !!context.actor?.items.some(i => (i.type === "feat") && (i.system.identifier === "crafter"));

    const resolved = await ShopItemEntry.resolveMany(context.shop.items);
    const buyResolved = resolved.filter(({ entry }) => !entry.isService);
    const serviceResolved = resolved.filter(({ entry }) => entry.isService);
    context.groups = await groupByType({
      rows: buyResolved, settlementCap: context.shop.settlementCap, buyModifier: context.shop.buyModifier,
      cart: this.cart, fixedValueLootTypes: context.shop.fixedValueLootTypes, playerBuyModifier: playerOverride.buy,
      actorName: context.actor?.name, renderDiscountTooltip, stockDefaults: context.shop.stockDefaults,
      hasCrafterFeat
    });
    this.#lastGroups = context.groups;

    context.serviceGroups = await groupByType({
      rows: serviceResolved, settlementCap: context.shop.settlementCap, buyModifier: context.shop.buyModifier,
      cart: this.cart, fixedValueLootTypes: context.shop.fixedValueLootTypes, playerBuyModifier: playerOverride.buy,
      actorName: context.actor?.name, renderDiscountTooltip, stockDefaults: context.shop.stockDefaults,
      hasCrafterFeat
    });
    this.#lastServiceGroups = context.serviceGroups;

    context.sellGroups = context.shop.goldPool.sellDisabled ? [] : await groupSellItems({
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
    switch ( partId ) {
      case "footer": context = await this._prepareFooterContext(context, options); break;
      case "description": context = await this._prepareDescriptionContext(context, options); break;
      case "buy": context = await this._prepareBuyContext(context, options); break;
      case "sell": context = await this._prepareSellContext(context, options); break;
      case "services": context = await this._prepareServicesContext(context, options); break;
    }
    return context;
  }

  /* -------------------------------------------- */

  /**
   * Prepare rendering context for the footer part.
   * @param {ApplicationRenderContext} context  Context being prepared.
   * @param {HandlebarsRenderOptions} options   Options which configure application rendering behavior.
   * @returns {ApplicationRenderContext}
   * @protected
   */
  async _prepareFooterContext(context, options) {
    context.buttons = [{
      type: "button", action: "openCart", icon: "fas fa-basket-shopping",
      label: "SIMPLE_SHOP_CRAFT_5E.ShopCart.ViewCart", cssClass: "always-interactive"
    }];
    return context;
  }

  /* -------------------------------------------- */

  /**
   * Prepare rendering context for the description tab.
   * @param {ApplicationRenderContext} context  Context being prepared.
   * @param {HandlebarsRenderOptions} options   Options which configure application rendering behavior.
   * @returns {ApplicationRenderContext}
   * @protected
   */
  async _prepareDescriptionContext(context, options) {
    context.shopFields = Shop.schema.fields;
    context.openingHoursDisplay = context.shop.openingHoursDisplay();
    context.statusOverrideOptions = [
      { value: "", label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.StatusOverrideAuto") },
      { value: "open", label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.StatusOverrideOpen") },
      { value: "closed", label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.StatusOverrideClosed") }
    ];
    context.calendarModeActive = isCalendarModeActive();
    context.restockWeekdayOptions = game.time.calendar.days.values.map(
      (day, value) => ({ value, label: _loc(day.name) })
    );
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
    return context;
  }

  /* -------------------------------------------- */

  /**
   * Prepare rendering context for the buy tab.
   * @param {ApplicationRenderContext} context  Context being prepared.
   * @param {HandlebarsRenderOptions} options   Options which configure application rendering behavior.
   * @returns {ApplicationRenderContext}
   * @protected
   */
  async _prepareBuyContext(context, options) {
    context.tabId = "buy";
    context.table = buildItemTableSections({
      groups: context.groups, emptyLabel: "SIMPLE_SHOP_CRAFT_5E.ShopEditor.None", columns: BUY_COLUMNS,
      rowTemplate: "modules/simple-shop-craft-5e/templates/shops/shop-sheet/buy-row.hbs"
    });
    return context;
  }

  /* -------------------------------------------- */

  /**
   * Prepare rendering context for the services tab.
   * @param {ApplicationRenderContext} context  Context being prepared.
   * @param {HandlebarsRenderOptions} options   Options which configure application rendering behavior.
   * @returns {ApplicationRenderContext}
   * @protected
   */
  async _prepareServicesContext(context, options) {
    context.tabId = "services";
    context.table = buildItemTableSections({
      groups: context.serviceGroups, emptyLabel: "SIMPLE_SHOP_CRAFT_5E.ShopEditor.None", columns: SERVICES_COLUMNS,
      rowTemplate: "modules/simple-shop-craft-5e/templates/shops/shop-sheet/buy-row.hbs"
    });
    return context;
  }

  /* -------------------------------------------- */

  /**
   * Prepare rendering context for the sell tab.
   * @param {ApplicationRenderContext} context  Context being prepared.
   * @param {HandlebarsRenderOptions} options   Options which configure application rendering behavior.
   * @returns {ApplicationRenderContext}
   * @protected
   */
  async _prepareSellContext(context, options) {
    context.tabId = "sell";
    context.showNoActor = !context.actor;
    context.noActorLabel = "SIMPLE_SHOP_CRAFT_5E.NoActorSelectedHint";
    context.table = buildItemTableSections({
      groups: context.sellGroups,
      emptyLabel: context.shop.goldPool.sellDisabled
        ? "SIMPLE_SHOP_CRAFT_5E.ShopEditor.PurchaseOnlyShopHint"
        : "SIMPLE_SHOP_CRAFT_5E.ShopEditor.NoSellableItems",
      columns: SELL_COLUMNS, rowTemplate: "modules/simple-shop-craft-5e/templates/shops/shop-sheet/sell-row.hbs"
    });
    return context;
  }

  /* -------------------------------------------- */

  /**
   * Prepare an array of context menu options which are available for a Buy/Services row.
   * @param {string} key
   * @param {ShopItemEntry} entry
   * @returns {ContextMenuEntry[]}
   * @protected
   */
  _getItemContextOptions(key, entry) {
    return [
      {
        label: "DND5E.ItemEdit",
        icon: '<i class="fa-solid fa-pen-to-square fa-fw"></i>',
        onClick: () => this.#openLodgingConfig(key),
        visible: !!entry.lodging
      },
      {
        label: "DND5E.ItemEdit",
        icon: '<i class="fa-solid fa-pen-to-square fa-fw"></i>',
        onClick: () => this.#openHirelingConfig(key),
        visible: !!entry.hireling
      },
      {
        label: entry.isService
          ? "SIMPLE_SHOP_CRAFT_5E.ShopEditor.UnmarkService"
          : "SIMPLE_SHOP_CRAFT_5E.ShopEditor.MarkService",
        icon: '<i class="fa-solid fa-bell-concierge fa-fw"></i>',
        onClick: () => this.#setItemService(key, !entry.isService),
        visible: !entry.lodging && !entry.hireling
      },
      {
        label: "DND5E.ItemDelete",
        icon: '<i class="fas fa-trash fa-fw"></i>',
        onClick: () => this.#removeEntry(key)
      }
    ];
  }

  /* -------------------------------------------- */
  /*  Life-Cycle Handlers                         */
  /* -------------------------------------------- */

  /** @inheritDoc */
  async _onFirstRender(context, options) {
    await super._onFirstRender(context, options);
    if ( this.tabGroups.primary ) this.element.classList.add(`tab-${this.tabGroups.primary}`);

    const buyActions = this.#createFloatingActions("buy", [
      { action: "addItems", tooltip: "SIMPLE_SHOP_CRAFT_5E.ShopEditor.AddItems", icon: "fas fa-plus" },
      { action: "generateItem", tooltip: "SIMPLE_SHOP_CRAFT_5E.ShopEditor.GenerateItem",
        icon: "fas fa-wand-magic-sparkles" },
      { action: "fillFromTable", tooltip: "SIMPLE_SHOP_CRAFT_5E.ShopEditor.FillFromTable", icon: "fas fa-table-list" }
    ]);
    const serviceActions = this.#createFloatingActions("services", [
      { action: "addService", tooltip: "SIMPLE_SHOP_CRAFT_5E.ShopEditor.AddService", icon: "fas fa-plus" }
    ]);
    this.element.querySelector(".window-content").append(buyActions, serviceActions);

    new game.dnd5e.applications.ContextMenu5e(this.element, "li.item[data-key]", [], {
      onOpen: element => {
        const key = element.dataset.key;
        const entry = this.shop.items.find(i => ShopItemEntry.key(i) === key);
        ui.context.menuItems = (this.isEditable && entry)
          ? this._getItemContextOptions(key, entry) : [];
      },
      jQuery: false
    });
  }

  /* -------------------------------------------- */

  /**
   * Build a floating action-button cluster, shown only while its tab is active and the sheet is editable.
   * @param {string} tabScope
   * @param {{ action: string, tooltip: string, icon: string }[]} buttons
   * @returns {HTMLDivElement}
   */
  #createFloatingActions(tabScope, buttons) {
    const actions = document.createElement("div");
    actions.classList.add("window-content-actions");
    actions.dataset.tabScope = tabScope;
    actions.append(...buttons.map(({ action, tooltip, icon }) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.tooltip = tooltip;
      button.ariaLabel = _loc(tooltip);
      button.classList.add("gold-button", "always-interactive");
      button.dataset.action = action;
      button.innerHTML = `<i class="${icon}" inert></i>`;
      return button;
    }));
    return actions;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  changeTab(tab, group, options) {
    super.changeTab(tab, group, options);
    if ( group !== "primary" ) return;
    this.element.className = this.element.className.replace(/tab-\w+/g, "");
    this.element.classList.add(`tab-${tab}`);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _onRender(context, options) {
    await super._onRender(context, options);

    this._renderModeToggle();
    if ( this._mode === this.constructor.MODES.PLAY ) this._disableFields();

    const canShowActions = context.editable && this.isEditMode;
    this.element.querySelectorAll(".window-content-actions").forEach(actions => actions.hidden = !canShowActions);
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

    htmlElement.querySelectorAll(".item-tooltip[data-uuid]").forEach(el => applyLoadingTooltip(el));

    htmlElement.querySelectorAll(".item-tooltip[data-key]").forEach(el => {
      const item = this.#findRowItem(el.dataset.key);
      if ( !item ) return;
      if ( item.type === LODGING_ITEM_TYPE ) {
        applyRichTooltip(el, {
          name: item.name, img: item.img, price: item.system.price,
          description: item.system.description.value, subtitle: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.Lodging")
        });
        return;
      }
      if ( item.type === HIRELING_ITEM_TYPE ) {
        applyRichTooltip(el, {
          name: item.name, img: item.img, price: item.system.price,
          description: item.system.description.value, subtitle: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.Hireling")
        });
        return;
      }
      if ( typeof item.richTooltip !== "function" ) return;
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

    if ( (partId === "buy") || (partId === "services") ) {
      const dropTab = htmlElement.matches(`.tab[data-tab="${partId}"]`)
        ? htmlElement : htmlElement.querySelector(`.tab[data-tab="${partId}"]`);
      if ( editable && dropTab ) {
        dropTab.addEventListener("dragover", event => event.preventDefault());
        dropTab.addEventListener("drop", async event => {
          const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
          if ( data.type !== "Item" ) return;
          const item = await fromUuid(data.uuid);
          if ( !item || !CONFIG.Item.dataModels[item.type]?.inventorySection ) return;
          await this.#mergeItemEntries([
            { uuid: data.uuid, isService: partId === "services", ...newEntryStock(item, this.shop.stockDefaults) }
          ]);
        });
      }
    }

    if ( (partId === "buy") || (partId === "sell") || (partId === "services") ) {
      const tabState = {
        buy: {
          sort: this.#buySort, setSort: v => this.#buySort = v,
          typeFilter: this.#buyTypeFilter, setTypeFilter: v => this.#buyTypeFilter = v,
          search: this.#buySearch, setSearch: v => this.#buySearch = v
        },
        sell: {
          sort: this.#sellSort, setSort: v => this.#sellSort = v,
          typeFilter: this.#sellTypeFilter, setTypeFilter: v => this.#sellTypeFilter = v,
          search: this.#sellSearch, setSearch: v => this.#sellSearch = v
        },
        services: {
          sort: this.#serviceSort, setSort: v => this.#serviceSort = v,
          typeFilter: this.#serviceTypeFilter, setTypeFilter: v => this.#serviceTypeFilter = v,
          search: this.#serviceSearch, setSearch: v => this.#serviceSearch = v
        }
      }[partId];
      const content = applyListControls(htmlElement, { sortModes: SORT_MODES, ...tabState, onSort: () => this.render() });
      if ( content ) applyItemSort(tabState.sort, content);
    }
  }

  /* -------------------------------------------- */

  /**
   * Whether shop-editing header controls (vendor settings, spotlight) should be visible.
   * @this {ShopSheet}
   * @returns {boolean}
   */
  static #isEditable() {
    return this.isEditable;
  }

  /* -------------------------------------------- */

  /**
   * Whether the "Deactivate" header control should be visible.
   * @this {ShopSheet}
   * @returns {boolean}
   */
  static #canDeactivate() {
    return this.isEditable && this.shop.active;
  }

  /* -------------------------------------------- */

  /**
   * Whether the "Activate" header control should be visible.
   * @this {ShopSheet}
   * @returns {boolean}
   */
  static #canActivate() {
    return this.isEditable && !this.shop.active;
  }

  /* -------------------------------------------- */

  /**
   * Handle opening the "Add Items" dialog.
   * @this {ShopSheet}
   */
  static async #addItems() {
    new AddEntryDialog({
      window: { title: "SIMPLE_SHOP_CRAFT_5E.ShopEditor.AddItems" }, isService: false,
      methods: [
        { value: "compendium", icon: "fa-solid fa-book-atlas", label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.FromCompendium") },
        { value: "uuid", icon: "fa-solid fa-link", label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.ByUuid") }
      ],
      onSubmit: (method, uuid) => this.#handleAddEntryMethod(method, uuid, false)
    }).render({ force: true });
  }

  /* -------------------------------------------- */

  /**
   * Handle opening the "Add Service" dialog.
   * @this {ShopSheet}
   */
  static async #addService() {
    new AddEntryDialog({
      window: { title: "SIMPLE_SHOP_CRAFT_5E.ShopEditor.AddService" }, isService: true,
      methods: [
        { value: "compendium", icon: "fa-solid fa-book-atlas", label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.FromCompendium") },
        { value: "uuid", icon: "fa-solid fa-link", label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.ByUuid") },
        { value: "lodging", icon: "fa-solid fa-bed", label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.AddLodging") },
        { value: "hireling", icon: "fa-solid fa-user-plus", label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.AddHireling") }
      ],
      onSubmit: (method, uuid) => this.#handleAddEntryMethod(method, uuid, true)
    }).render({ force: true });
  }

  /* -------------------------------------------- */

  /**
   * Route the chosen "Add Items"/"Add Service" method to its flow.
   * @param {string} method
   * @param {string} uuid  Picked item UUID, only set for method "uuid".
   * @param {boolean} isService
   * @returns {Promise<void>}
   */
  async #handleAddEntryMethod(method, uuid, isService) {
    switch ( method ) {
      case "compendium": return this.#pickAndAddItems({ isService });
      case "uuid": return this.#addByUuid(uuid, isService);
      case "lodging": return this.#addLodging();
      case "hireling": return this.#addHireling();
    }
  }

  /* -------------------------------------------- */

  /**
   * Prompt the compendium browser and add the picked items to this shop.
   * @param {object} options
   * @param {boolean} options.isService
   */
  async #pickAndAddItems({ isService }) {
    const selection = await game.dnd5e.applications.CompendiumBrowser.select({
      tab: "physical",
      selection: { min: 1 }
    });
    if ( !selection?.size ) return;

    const items = await Promise.all(Array.from(selection).map(uuid => fromUuid(uuid)));
    const entries = [];
    const templates = [];
    for ( const item of items ) {
      if ( !item ) continue;
      if ( isSpellScrollItem(item) ) {
        templates.push({ kind: "spellScroll", item });
      } else if ( EnchantedItemBlueprint.getEnchantmentProfiles(item)
        .some(p => EnchantedItemBlueprint.resolveProfileRarity(item, p.effect) !== "artifact") ) {
        templates.push({ kind: "enchant", item });
      } else if ( item.system?.identifier ) {
        entries.push({ identifier: item.system.identifier, isService, ...newEntryStock(item, this.shop.stockDefaults) });
      }
    }
    if ( entries.length ) await this.#mergeItemEntries(entries);
    if ( templates.length ) {
      new ConfigureTemplatesDialog({
        templates, isService, onSubmit: newEntries => this.#mergeItemEntries(newEntries)
      }).render({ force: true });
    }
  }

  /* -------------------------------------------- */

  /**
   * Add an item to this shop by UUID.
   * @param {string} uuid
   * @param {boolean} isService
   * @returns {Promise<void>}
   */
  async #addByUuid(uuid, isService) {
    if ( !uuid ) return;

    const item = await fromUuid(uuid);
    if ( !item || !CONFIG.Item.dataModels[item.type]?.inventorySection ) {
      ui.notifications.warn("WARNING.ObjectDoesNotExist", { format: { name: _loc("DOCUMENT.Item"), identifier: uuid } });
      return;
    }
    await this.#mergeItemEntries([
      { uuid, isService, ...newEntryStock(item, this.shop.stockDefaults) }
    ]);
  }

  /* -------------------------------------------- */

  /**
   * Create a new lodging entry with default values, then open its editor.
   * @returns {Promise<void>}
   */
  async #addLodging() {
    const tier = Object.keys(LODGING_TIERS)[0];
    const entry = {
      _id: foundry.utils.randomID(), isService: true, restockMode: "unlimited",
      lodging: { tier, name: "", description: "", img: "icons/svg/house.svg" },
      price: { value: null, denomination: LODGING_TIERS[tier].price.denomination }
    };
    await this.#mergeItemEntries([entry]);
    this.#openLodgingConfig(ShopItemEntry.key(entry));
  }

  /* -------------------------------------------- */

  /**
   * Open the autosaving editor for a lodging entry.
   * @param {string} key
   */
  #openLodgingConfig(key) {
    new LodgingConfig({
      shopSheet: this, entryKey: key, onUpdate: updateData => this.#updateShop(updateData)
    }).render({ force: true });
  }

  /* -------------------------------------------- */

  /**
   * Create a new hireling entry with default values, then open its editor.
   * @returns {Promise<void>}
   */
  async #addHireling() {
    const type = Object.keys(HIRELING_TYPES)[0];
    const entry = {
      _id: foundry.utils.randomID(), isService: true, restockMode: "unlimited",
      hireling: { type, name: "", description: "", img: "", actorUuid: "" },
      price: { value: null, denomination: HIRELING_TYPES[type].price.denomination }
    };
    await this.#mergeItemEntries([entry]);
    this.#openHirelingConfig(ShopItemEntry.key(entry));
  }

  /* -------------------------------------------- */

  /**
   * Open the autosaving editor for a hireling entry.
   * @param {string} key
   */
  #openHirelingConfig(key) {
    new HirelingConfig({
      shopSheet: this, entryKey: key, onUpdate: updateData => this.#updateShop(updateData)
    }).render({ force: true });
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
    await new DiscountConfig({
      shopSheet: this, entryKey: target.dataset.key, playerOverride,
      onUpdate: updateData => this.#updateShop(updateData)
    }).render({ force: true });
  }

  /* -------------------------------------------- */

  /**
   * Handle opening the file picker to change this shop's image.
   * @see dnd5e — BaseApplication5e#_onEditImage()
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
    await new ModifiersConfig({ shopSheet: this, onUpdate: updateData => this.#updateShop(updateData) })
      .render({ force: true });
  }

  /* -------------------------------------------- */

  /**
   * Handle opening a dialog to edit the shop's owner.
   * @this {ShopSheet}
   */
  static async #editOwner() {
    await new OwnerConfig({ shopSheet: this, onUpdate: updateData => this.#updateShop(updateData) })
      .render({ force: true });
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
    await new PriceConfig({
      shopSheet: this, entryKey: target.dataset.key, onUpdate: updateData => this.#updateShop(updateData)
    }).render({ force: true });
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
   * Handle opening a dialog to edit the shop's money pool and default stock per item type.
   * @this {ShopSheet}
   */
  static async #editVendorSettings() {
    await new VendorConfig({ shop: this.shop, onUpdate: updateData => this.#updateShop(updateData) })
      .render({ force: true });
  }

  /* -------------------------------------------- */

  /**
   * Handle opening the fill-from-table dialog.
   * @this {ShopSheet}
   */
  static async #fillFromTable() {
    await new FillFromTableDialog({ shopSheet: this, onFilled: entries => this.#mergeItemEntries(entries) })
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
   * Handle opening the sheet of a hireling's linked actor.
   * @this {ShopSheet}
   * @param {Event} event         Triggering click event.
   * @param {HTMLElement} target  Element that was clicked.
   */
  static async #openLinkedActor(event, target) {
    const entry = this.shop.items.find(i => ShopItemEntry.key(i) === target.dataset.key);
    const actor = entry?.hireling?.actorUuid ? await fromUuid(entry.hireling.actorUuid) : null;
    actor?.sheet?.render(true);
  }

  /* -------------------------------------------- */

  /**
   * Remove an item entry from this shop.
   * @param {string} key
   */
  async #removeEntry(key) {
    const items = this.shop.items.filter(i => ShopItemEntry.key(i) !== key).map(i => i.toObject());
    await this.#updateShop({ items });
  }

  /* -------------------------------------------- */

  /**
   * Set an item entry's Service flag, moving it between the Buy and Services tabs.
   * @param {string} key
   * @param {boolean} isService
   */
  async #setItemService(key, isService) {
    const items = this.shop.items.map(i => ShopItemEntry.key(i) === key
      ? { ...i.toObject(), isService } : i.toObject());
    await this.#updateShop({ items });
    ui.notifications.info(
      isService ? "SIMPLE_SHOP_CRAFT_5E.ShopEditor.MarkedAsService" : "SIMPLE_SHOP_CRAFT_5E.ShopEditor.UnmarkedAsService",
      { localize: true }
    );
  }

  /* -------------------------------------------- */

  /**
   * Handle resetting this shop's stock (to each item's max, per-type default, or unchanged depending on
   * its restock mode) and gold pool (to its max, falling back to the default gold pool unless unlimited).
   * @this {ShopSheet}
   */
  static async #resetShop() {
    await this.#updateShop(await this.shop.restockUpdates());
  }

  /* -------------------------------------------- */

  /**
   * Handle broadcasting this shop to every connected client, opening it in their Shop Editor.
   * @this {ShopSheet}
   */
  static async #spotlight() {
    await spotlightShop(this.shopId);
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

  /**
   * Handle duplicating this shop and opening the copy's editor.
   * @this {ShopSheet}
   */
  static async #duplicateShop() {
    const clone = await Shop.duplicate(this.shop);
    new ShopSheet({ shopId: clone._id }).render({ force: true });
  }

  /* -------------------------------------------- */

  /**
   * Handle deleting this shop, after confirmation. Closes this sheet first, since its shop no longer
   * exists afterward.
   * @this {ShopSheet}
   */
  static async #deleteShop() {
    const confirmed = await confirmDeleteShop();
    if ( !confirmed ) return;
    await this.close();
    await Shop.delete(this.shopId);
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
    return this.#lastGroups.flatMap(group => group.items).find(row => row.key === key)
      ?? this.#lastServiceGroups.flatMap(group => group.items).find(row => row.key === key)
      ?? null;
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
   * {@link ShopItemEntry.key}. An entry whose key already exists with a different `isService` value
   * (same catalog item present in both Buy and Services) is skipped with a warning instead of overwriting it.
   * @param {ShopItemEntryData[]} newEntries
   * @returns {Promise<void>}
   */
  async #mergeItemEntries(newEntries) {
    const entries = new Map(this.shop.items.map(i => [ShopItemEntry.key(i), i.toObject()]));
    let blocked = false;
    let changed = false;
    for ( const entry of newEntries ) {
      const key = ShopItemEntry.key(entry);
      const existing = entries.get(key);
      if ( existing && (!!existing.isService !== !!entry.isService) ) {
        blocked = true;
        continue;
      }
      entries.set(key, entry);
      changed = true;
    }
    if ( blocked ) ui.notifications.warn("SIMPLE_SHOP_CRAFT_5E.ShopEditor.AlreadyExistsOtherTab", { localize: true });
    if ( changed ) await this.#updateShop({ items: Array.from(entries.values()) });
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
    if ( game.user.isGM ) await Shop.update(this.shopId, Shop.mergePlayerDiscount(actorUuid, updateData));
    else {
      const gm = game.users.activeGM;
      if ( !gm ) {
        ui.notifications.warn("SIMPLE_SHOP_CRAFT_5E.ShopEditor.NoActiveGM", { localize: true });
        return;
      }
      await gm.query(`${MODULE_ID}.updatePlayerDiscount`, { shopId: this.shopId, actorUuid, updateData });
    }
    this.render();
    if ( this.#cartApp?.rendered ) this.#cartApp.render();
  }

  /* -------------------------------------------- */

  /**
   * Persist a partial update to this shop's data and re-render.
   * @param {object} updateData  Fields to merge into the shop's current data.
   * @returns {Promise<void>}
   */
  async #updateShop(updateData) {
    if ( !game.user.isGM ) return;
    await Shop.update(this.shopId, updateData);
    this.render({ window: { title: this.title } });
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
 * @param {{ byType: Record<string, number|null>, magicRule: string }} options.stockDefaults  The shop's
 *   default stock configuration, used to resolve a row's default max stock for display.
 * @param {boolean} options.hasCrafterFeat  Whether the acting actor owns the PHB 2024 "Crafter" feat.
 * @returns {Promise<{ type: string, label: string, items: object[] }[]>}
 */
async function groupByType({
  rows, settlementCap, buyModifier, cart, fixedValueLootTypes, playerBuyModifier, actorName, renderDiscountTooltip,
  stockDefaults, hasCrafterFeat
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
    const isMagic = Array.from(row.item?.system?.properties ?? []).includes("mgc");
    const { percent: discountPercent, sources } = resolveDiscountSources({
      itemOverride: row.entry.discount, isFixedValue: rowIsFixedValue, shopModifier: buyModifier,
      playerModifier: playerBuyModifier, actorName, crafterDiscount: hasCrafterFeat && !isMagic
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
    row.stockTracked = row.entry.restockMode !== "unlimited";
    row.stockCurrent = row.stockTracked ? (row.entry.stock.current ?? 0) : null;
    row.stockMax = (row.entry.restockMode === "normal")
      ? (row.entry.stock.max ?? (row.item ? Shop.defaultStockMax(row.item, stockDefaults) : null))
      : null;

    const reasons = [];
    if ( !row.item ) reasons.push(_loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.SuppressedNotFound"));
    if ( row.stockCurrent === 0 ) reasons.push(_loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.SuppressedStock"));
    if ( (capCP != null) && (baseCP > capCP) ) reasons.push(_loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.SuppressedCap"));
    row.suppressed = reasons.length > 0;
    row.suppressReason = reasons.join(", ");
    row.itemImg = row.item?.img ?? "icons/svg/hazard.svg";
    row.itemName = row.item?.name ?? row.entry.identifier ?? row.entry.uuid ?? "?";

    const type = row.item?.type ?? "unknown";
    if ( !groups.has(type) ) groups.set(type, []);
    groups.get(type).push(row);
  }
  return finalizeGroups(groups, {
    labelFor: type => (type === LODGING_ITEM_TYPE) ? _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.Lodging")
      : (type === HIRELING_ITEM_TYPE) ? _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.Hireling") : null
  });
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
 * @param {boolean} [options.crafterDiscount]   Whether the PHB 2024 "Crafter" feat's 20% buy discount applies.
 * @returns {{ percent: number, sources: object[] }}
 */
function resolveDiscountSources({
  itemOverride, isFixedValue: rowIsFixedValue, shopModifier, playerModifier, actorName, crafterDiscount
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
  if ( crafterDiscount ) {
    sources.push(additiveSource(_loc("SIMPLE_SHOP_CRAFT_5E.CrafterFeat"), -20));
    percent -= 20;
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
