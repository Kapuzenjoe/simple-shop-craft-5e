import { MODULE_ID, SETTING_KEYS, SETTLEMENT_CAPS } from "../config.mjs";
import { Shop, ShopItemEntry } from "../data/shop-data.mjs";
import { breakdownCopper, currencyRows, displayGoldPool, getCurrencyOptions, goldPoolCurrencies, toCopper } from "../shops/currency.mjs";
import { entryKey, pickItemIdentifiers, resolveShopItems } from "../shops/item-resolver.mjs";

import BaseConfigDialog from "./base-config-dialog.mjs";
import BasePromptDialog from "./base-prompt-dialog.mjs";
import ShopCart from "./shop-cart.mjs";

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
 * Application for viewing and, in Edit mode, configuring a single shop.
 */
export default class ShopSheet extends Application5e {

  /**
   * @param {object} [options]
   * @param {string} [options.shopId]  Id of the ShopData being edited.
   */
  constructor(options={}) {
    super(options);
    this.shopId = options.shopId;
  }

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
      removeItem: ShopSheet.#removeItem,
      editImage: ShopSheet.#editImage,
      editPrice: ShopSheet.#editPrice,
      editDiscount: ShopSheet.#editDiscount,
      adjustCartQuantity: ShopSheet.#adjustCartQuantity,
      adjustSellQuantity: ShopSheet.#adjustSellQuantity,
      openCart: ShopSheet.#openCart,
      resetShop: ShopSheet.#resetShop,
      editMaxStock: ShopSheet.#editMaxStock,
      openItemSheet: ShopSheet.#openItemSheet,
      haggle: ShopSheet.#haggle,
      editPlayers: ShopSheet.#editPlayers,
      toggleActive: ShopSheet.#toggleActive,
      spotlight: ShopSheet.#spotlight,
      changeMode: ShopSheet.#changeMode,
      editModifiers: ShopSheet.#editModifiers,
      editSettlementCap: ShopSheet.#editSettlementCap,
      editVendorGold: ShopSheet.#editVendorGold,
      editOwner: ShopSheet.#editOwner,
      renameShop: ShopSheet.#renameShop
    }
  };

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
    cart: {
      template: "modules/simple-shop-craft-5e/templates/shop-sheet/cart.hbs",
      templates: ["modules/simple-shop-craft-5e/templates/partials/currency-parts.hbs"]
    }
  };

  /** @override */
  static TABS = {
    primary: {
      tabs: [
        { id: "buy", label: "SIMPLE_SHOP_CRAFT_5E.ShopEditor.Tabs.Buy", icon: "fas fa-cart-shopping" },
        { id: "sell", label: "SIMPLE_SHOP_CRAFT_5E.ShopEditor.Tabs.Sell", icon: "fas fa-hand-holding-dollar" },
        { id: "description", label: "SIMPLE_SHOP_CRAFT_5E.ShopEditor.Tabs.Description", icon: "fas fa-book-open" }
      ],
      initial: "buy"
    }
  };

  /* -------------------------------------------- */

  /**
   * Handle adding items to this shop via the compendium browser.
   * @this {ShopSheet}
   */
  static async #addItems() {
    const picked = await pickItemIdentifiers();
    if ( !picked.length ) return;

    await this.#mergeItemEntries(picked.map(({ identifier }) => ({ identifier, stock: { max: null, current: null } })));
  }

  /* -------------------------------------------- */

  /**
   * Build a property-attribution source entry for an additive percent term, matching dnd5e's own
   * convention of flipping negative "add" values to type "subtract" with an absolute display value.
   * @param {string} label
   * @param {number} value
   * @returns {{ label: string, value: string, type: string }}
   */
  static #additiveSource(label, value) {
    return { label, value: `${Math.abs(value)}%`, type: (value < 0) ? "subtract" : "add" };
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
    const max = this.shop.items.find(i => entryKey(i) === key)?.stock.current ?? Infinity;
    const delta = Number(target.dataset.delta);
    const next = Math.clamp((this.cart.get(key) ?? 0) + delta, 0, max);
    if ( next === 0 ) this.cart.delete(key);
    else this.cart.set(key, next);
    await this.render();
    if ( this.cartApp?.rendered ) this.cartApp.render();
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
    const max = actor?.items.get(itemId)?.system?.quantity ?? 0;
    const delta = Number(target.dataset.delta);
    const next = Math.clamp((this.sellCart.get(itemId) ?? 0) + delta, 0, max);
    if ( next === 0 ) this.sellCart.delete(itemId);
    else this.sellCart.set(itemId, next);
    await this.render();
    if ( this.cartApp?.rendered ) this.cartApp.render();
  }

  /* -------------------------------------------- */

  /**
   * Build the `item-table.hbs` context for a set of item-type groups.
   * @param {{ label: string, items: object[] }[]} groups
   * @param {string} emptyLabel
   * @param {object[]} columns
   * @param {string} rowTemplate
   * @returns {{ hasRows: boolean, emptyLabel: string, sections: object[] }}
   */
  static #buildItemTable(groups, emptyLabel, columns, rowTemplate) {
    const sections = groups.map(group => ({
      label: group.label,
      columns,
      rows: group.items.map(row => ({ ...row, template: rowTemplate }))
    }));
    return { hasRows: sections.some(s => s.rows.length > 0), emptyLabel, sections };
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
    const key = target.dataset.key;
    const entry = this.shop.items.find(i => entryKey(i) === key);
    const playerOverride = ShopSheet.#getPlayerOverride(this.shop.playerDiscounts, this.selectedActorUuid);
    const effectiveDefault = this.shop.buyModifier + (playerOverride.buy ?? 0);
    const shopSheet = this;

    const dialog = new BaseConfigDialog({
      window: { title: "SIMPLE_SHOP_CRAFT_5E.ShopEditor.PriceModifier" },
      fields: [
        {
          field: ShopItemEntry.schema.fields.discount, name: "discount", value: entry.discount,
          input: (field, config) => foundry.applications.fields.createNumberInput(config),
          label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.PriceModifier"),
          hint: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.DiscountOverrideHint"),
          placeholder: String(effectiveDefault)
        }
      ],
      form: {
        handler: async (event, form, formData) => {
          const data = foundry.utils.expandObject(formData.object);
          const items = shopSheet.shop.items.map(i => entryKey(i) !== key ? i.toObject() : {
            ...i.toObject(),
            discount: data.discount ?? null
          });
          await shopSheet.#updateShop({ items });
        }
      }
    });
    await dialog.render({ force: true });
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
        if ( this.options.form.submitOnChange ) this.form.dispatchEvent(new Event("submit", { cancelable: true }));
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
    const key = target.dataset.key;
    const entry = this.shop.items.find(i => entryKey(i) === key);
    const shopSheet = this;
    const stockFields = ShopItemEntry.schema.fields.stock.fields;

    const dialog = new BaseConfigDialog({
      window: { title: "SIMPLE_SHOP_CRAFT_5E.ShopEditor.StockMax" },
      position: { width: 480 },
      state: { max: entry.stock.max, current: entry.stock.current, noRestock: entry.noRestock },
      fields: formState => [
        {
          field: stockFields.max, name: "max", value: formState.max, placeholder: "∞", disabled: !!formState.noRestock,
          label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.StockMax"), hint: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.StockMaxHint")
        },
        {
          field: stockFields.current, name: "current", value: formState.current, placeholder: "∞",
          label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.StockCurrent")
        },
        {
          field: ShopItemEntry.schema.fields.noRestock, name: "noRestock", value: !!formState.noRestock,
          label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.NoRestock"), hint: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.NoRestockHint")
        }
      ],
      form: {
        handler: async (event, form, formData) => {
          const data = foundry.utils.expandObject(formData.object);
          const items = shopSheet.shop.items.map(i => entryKey(i) !== key ? i.toObject() : {
            ...i.toObject(),
            stock: { max: data.noRestock ? null : (data.max ?? null), current: data.current ?? null },
            noRestock: !!data.noRestock
          });
          await shopSheet.#updateShop({ items });
        }
      }
    });
    await dialog.render({ force: true });
  }

  /* -------------------------------------------- */

  /**
   * Handle opening a dialog to edit the shop's buy/sell price modifiers.
   * @this {ShopSheet}
   */
  static async #editModifiers() {
    const shopSheet = this;
    const fields = Shop.schema.fields;
    const lootTypeOptions = Object.entries(CONFIG.DND5E.lootTypes).map(([value, cfg]) => ({ value, label: cfg.label }));

    const dialog = new BaseConfigDialog({
      window: { title: "SIMPLE_SHOP_CRAFT_5E.ShopConfig.Discount" },
      fields: [
        {
          field: fields.buyModifier, name: "buyModifier", value: this.shop.buyModifier,
          input: (field, config) => foundry.applications.fields.createNumberInput(config),
          placeholder: fields.buyModifier.getInitialValue({})
        },
        {
          field: fields.sellModifier, name: "sellModifier", value: this.shop.sellModifier,
          input: (field, config) => foundry.applications.fields.createNumberInput(config),
          placeholder: fields.sellModifier.getInitialValue({})
        },
        {
          field: fields.fixedValueLootTypes, name: "fixedValueLootTypes",
          value: Array.from(this.shop.fixedValueLootTypes), options: lootTypeOptions
        }
      ],
      form: {
        handler: async (event, form, formData) => {
          const data = foundry.utils.expandObject(formData.object);
          await shopSheet.#updateShop({
            buyModifier: Math.clamp(Math.round(data.buyModifier ?? 0), -100, 1000),
            sellModifier: Math.clamp(Math.round(data.sellModifier ?? -50), -100, 1000),
            fixedValueLootTypes: data.fixedValueLootTypes ?? []
          });
        }
      }
    });
    await dialog.render({ force: true });
  }

  /* -------------------------------------------- */

  /**
   * Handle opening a dialog to edit the shop's owner.
   * @this {ShopSheet}
   */
  static async #editOwner() {
    const shopSheet = this;
    const dialog = new BaseConfigDialog({
      window: { title: "SIMPLE_SHOP_CRAFT_5E.ShopEditor.Owner" },
      fields: [
        {
          field: Shop.schema.fields.npc, name: "npc", value: this.shop.npc ?? "",
          label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.Owner")
        }
      ],
      form: {
        handler: async (event, form, formData) => {
          const data = foundry.utils.expandObject(formData.object);
          await shopSheet.#updateShop({ npc: data.npc || null });
        }
      }
    });
    await dialog.render({ force: true });
  }

  /* -------------------------------------------- */

  /**
   * Handle opening this shop's config directly on the Players tab.
   * @this {ShopSheet}
   */
  static async #editPlayers() {
    const shopSheet = this;
    const buildRows = actorUuids => actorUuids.map((uuid, index) => {
      const existing = shopSheet.shop.playerDiscounts.find(pd => pd.actor === uuid);
      const actor = fromUuidSync(uuid);
      return {
        index, actorUuid: uuid, actorImg: actor?.img, actorName: actor?.name,
        buyModifier: existing?.buyModifier ?? null, sellModifier: existing?.sellModifier ?? null,
        template: "modules/simple-shop-craft-5e/templates/shop-sheet/players-dialog-row.hbs"
      };
    });

    const dialog = new BaseConfigDialog({
      window: { title: "SIMPLE_SHOP_CRAFT_5E.ShopConfig.Tabs.Players" },
      classes: ["dnd5e2"],
      autoRerender: false,
      state: { actorUuids: this.shop.playerDiscounts.map(pd => pd.actor) },
      extraContent: async formState => {
        const rows = buildRows(formState.actorUuids);
        const tableHtml = await foundry.applications.handlebars.renderTemplate(
          "modules/simple-shop-craft-5e/templates/partials/item-table.hbs",
          {
            hasRows: rows.length > 0,
            emptyLabel: "SIMPLE_SHOP_CRAFT_5E.ShopConfig.Players.None",
            sections: [{
              label: "SIMPLE_SHOP_CRAFT_5E.ShopEditor.Player",
              columns: [
                { id: "name" },
                { id: "discount", label: "SIMPLE_SHOP_CRAFT_5E.ShopEditor.Tabs.Buy" },
                { id: "discount", label: "SIMPLE_SHOP_CRAFT_5E.ShopEditor.Tabs.Sell" },
                { id: "controls" }
              ],
              rows
            }]
          }
        );
        return `${tableHtml}<document-tags name="newPlayerActors" type="Actor" class="drop-area" `
          + `data-drop-hint="${_loc("SIMPLE_SHOP_CRAFT_5E.ShopConfig.Players.DropHint")}"></document-tags>`;
      },
      onRender: app => {
        const persistPlayerList = async () => {
          const existing = new Map(shopSheet.shop.playerDiscounts.map(pd => [pd.actor, pd]));
          const playerDiscounts = app.formState.actorUuids.map(uuid => ({
            actor: uuid,
            buyModifier: existing.get(uuid)?.buyModifier ?? null,
            sellModifier: existing.get(uuid)?.sellModifier ?? null
          }));
          await shopSheet.#updateShop({ playerDiscounts });
        };

        const tags = app.element.querySelector('document-tags[name="newPlayerActors"]');
        tags?.addEventListener("change", async () => {
          const uuids = Array.from(new Set([...app.formState.actorUuids, ...tags.value]));
          app.formState = { actorUuids: uuids };
          await persistPlayerList();
          app.render({ parts: ["content"] });
        });
        app.element.querySelector(".item-list")?.addEventListener("click", async event => {
          const button = event.target.closest('[data-action="removePlayerDiscount"]');
          if ( !button ) return;
          const uuid = button.closest("li")?.dataset.actorUuid;
          app.formState = { actorUuids: app.formState.actorUuids.filter(u => u !== uuid) };
          await persistPlayerList();
          app.render({ parts: ["content"] });
        });
      },
      form: {
        handler: async (event, form, formData) => {
          const data = foundry.utils.expandObject(formData.object);
          const playerDiscounts = Object.values(data.playerDiscounts ?? {}).map(row => ({
            actor: row.actor,
            buyModifier: ((row.buy === "") || (row.buy == null)) ? null : Number(row.buy),
            sellModifier: ((row.sell === "") || (row.sell == null)) ? null : Number(row.sell)
          }));
          await shopSheet.#updateShop({ playerDiscounts });
        }
      }
    });
    await dialog.render({ force: true });
  }

  /* -------------------------------------------- */

  /**
   * Handle opening a small dialog to edit an item's price.
   * @this {ShopSheet}
   * @param {Event} event         Triggering click event.
   * @param {HTMLElement} target  Element that was clicked.
   */
  static async #editPrice(event, target) {
    const key = target.dataset.key;
    const entry = this.shop.items.find(i => entryKey(i) === key);
    const item = (await resolveShopItems([entry]))[0]?.item;
    const shopSheet = this;
    const priceFields = ShopItemEntry.schema.fields.price.fields;
    const bundleSizeField = ShopItemEntry.schema.fields.bundleSize;

    const dialog = new BaseConfigDialog({
      window: { title: "DND5E.Price" },
      fields: [
        {
          field: priceFields.value, name: "value", value: entry.price?.value,
          label: _loc("DND5E.Price"), hint: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.PriceOverrideHint"),
          placeholder: item?.system?.price?.value
        },
        {
          field: priceFields.denomination, name: "denomination",
          value: entry.price?.denomination ?? item?.system?.price?.denomination ?? "gp",
          label: _loc("DND5E.Currency"), options: getCurrencyOptions()
        },
        {
          field: bundleSizeField, name: "bundleSize", value: entry.bundleSize,
          label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.BundleSize"),
          hint: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.BundleSizeHint"),
          placeholder: (item?.system?.quantity > 1) ? item.system.quantity : 1
        }
      ],
      form: {
        handler: async (event, form, formData) => {
          const data = foundry.utils.expandObject(formData.object);
          const items = shopSheet.shop.items.map(i => entryKey(i) !== key ? i.toObject() : {
            ...i.toObject(),
            price: { value: data.value ?? null, denomination: data.denomination },
            bundleSize: data.bundleSize ?? null
          });
          await shopSheet.#updateShop({ items });
        }
      }
    });
    await dialog.render({ force: true });
  }

  /* -------------------------------------------- */

  /**
   * Handle opening a dialog to edit the shop's settlement cap.
   * @this {ShopSheet}
   */
  static async #editSettlementCap() {
    const shopSheet = this;
    const settlementCap = this.shop.settlementCap;
    const preset = Object.entries(SETTLEMENT_CAPS).find(([, v]) => v.value === settlementCap.value)?.[0]
      ?? (settlementCap.value != null ? "custom" : "");
    const presetOptions = [
      { value: "", label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.NoCap") },
      ...Object.entries(SETTLEMENT_CAPS).map(([key, { label, value }]) => ({
        value: key, label: `${_loc(label)} (${new Intl.NumberFormat(game.i18n.lang).format(value)} GP)`
      })),
      { value: "custom", label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.Custom") }
    ];
    const capFields = Shop.schema.fields.settlementCap.fields;

    const dialog = new BaseConfigDialog({
      window: { title: "SIMPLE_SHOP_CRAFT_5E.ShopEditor.SettlementCap" },
      state: {
        settlementCapPreset: preset, settlementCapValue: settlementCap.value,
        settlementCapDenomination: settlementCap.denomination
      },
      fields: formState => {
        const fields = [
          {
            field: new foundry.data.fields.StringField(), name: "settlementCapPreset", value: formState.settlementCapPreset,
            label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.SettlementCap"), options: presetOptions
          }
        ];
        if ( formState.settlementCapPreset === "custom" ) {
          fields.push({
            group: { label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.SettlementCapValue") },
            fields: [
              { field: capFields.value, name: "settlementCapValue", value: formState.settlementCapValue },
              {
                field: capFields.denomination, name: "settlementCapDenomination",
                value: formState.settlementCapDenomination, options: getCurrencyOptions()
              }
            ]
          });
        }
        return fields;
      },
      form: {
        handler: async (event, form, formData) => {
          const data = foundry.utils.expandObject(formData.object);
          const value = data.settlementCapPreset === "custom" ? (data.settlementCapValue ?? null)
            : (data.settlementCapPreset === "" ? null : SETTLEMENT_CAPS[data.settlementCapPreset].value);
          const denomination = (data.settlementCapPreset === "custom") ? (data.settlementCapDenomination || "gp") : "gp";
          await shopSheet.#updateShop({ settlementCap: { value, denomination } });
        }
      }
    });
    await dialog.render({ force: true });
  }

  /* -------------------------------------------- */

  /**
   * Handle opening a dialog to edit the shop's maximum money pool.
   * @this {ShopSheet}
   */
  static async #editVendorGold() {
    const shopSheet = this;
    const goldPool = this.shop.goldPool;
    const currencies = goldPoolCurrencies();

    const dialog = new BaseConfigDialog({
      window: { title: "SIMPLE_SHOP_CRAFT_5E.ShopEditor.GoldPoolMax" },
      state: { unlimited: goldPool.unlimited, ...goldPool.max },
      fields: formState => [
        {
          field: Shop.schema.fields.goldPool.fields.unlimited, name: "unlimited", value: !!formState.unlimited,
          hint: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.GoldPoolMaxHint")
        }
      ],
      extraContent: async formState => {
        if ( formState.unlimited ) return "";
        const rows = currencyRows(formState);
        const amountsHtml = await foundry.applications.handlebars.renderTemplate(
          "modules/simple-shop-craft-5e/templates/partials/currency-inputs.hbs", { rows }
        );
        return `<section class="currency">${amountsHtml}</section>`;
      },
      form: {
        handler: async (event, form, formData) => {
          const data = foundry.utils.expandObject(formData.object);
          const currentMax = shopSheet.shop.goldPool.max;
          const max = currencies.reduce((obj, denom) => {
            obj[denom] = (denom in data) ? Math.max(0, Math.round(data[denom] ?? 0)) : (currentMax[denom] ?? 0);
            return obj;
          }, {});
          await shopSheet.#updateShop({
            goldPool: { ...shopSheet.shop.goldPool, max, unlimited: !!data.unlimited }
          });
        }
      }
    });
    await dialog.render({ force: true });
  }

  /* -------------------------------------------- */

  /**
   * Turn a Map of type → rows into the sorted, labeled group array used by both Buy and Sell tables.
   * @param {Map<string, object[]>} groups
   * @returns {{ type: string, label: string, items: object[] }[]}
   */
  static #finalizeGroups(groups) {
    return Array.from(groups, ([type, items]) => ({
      type,
      label: _loc(`TYPES.Item.${type}Pl`),
      items
    })).sort((a, b) => {
      return (CONFIG.Item.dataModels[a.type]?.inventorySection?.order ?? Infinity)
      - (CONFIG.Item.dataModels[b.type]?.inventorySection?.order ?? Infinity);
    }
    );
  }

  /* -------------------------------------------- */

  /**
   * Resolve the acting actor's discount override for this shop, if one is configured.
   * @param {ShopPlayerDiscount[]} playerDiscounts
   * @param {string} [actorUuid]
   * @returns {{ buy: number|null, sell: number|null }}
   */
  static #getPlayerOverride(playerDiscounts, actorUuid) {
    const override = actorUuid ? playerDiscounts.find(pd => pd.actor === actorUuid) : null;
    return { buy: override?.buyModifier ?? null, sell: override?.sellModifier ?? null };
  }

  /* -------------------------------------------- */

  /**
   * Determine which actors/party the current user may act as for buy/sell — player characters and the party actor only.
   * @returns {{ characters: Actor5e[], party: Actor5e|null }}
   */
  static #getSelectableActors() {
    const isGM = game.user.isGM;
    const characters = game.actors.filter(a => (a.type === "character") && (isGM || a.isOwner));
    const party = game.actors.party;
    const partySelectable = party && (isGM
      || (game.user.character && party.system.playerCharacters.includes(game.user.character) && party.isOwner));
    return { characters, party: partySelectable ? party : null };
  }

  /* -------------------------------------------- */

  /**
   * Group resolved item rows by their item type.
   * @param {{ entry: ShopItemEntryData, item: object|null }[]} rows
   * @param {{ value: number|null, denomination: string }} settlementCap
   * @param {number} buyModifier  Shop's default buy-side percent discount/markup, used when an item has no override.
   * @param {Map<string, number>} cart  Selected buy quantities, keyed by {@link entryKey}.
   * @param {Set<string>} fixedValueLootTypes
   * @param {number|null} [playerBuyModifier]  Acting actor's buy-side override, used when an item has no override.
   * @param {string} [actorName]  Acting actor's name, used to label the player row.
   * @returns {Promise<{ type: string, label: string, items: object[] }[]>}
   */
  static async #groupByType(rows, settlementCap, buyModifier, cart, fixedValueLootTypes, playerBuyModifier, actorName) {
    const targetUnit = game.settings.get("dnd5e", "metricWeightUnits") ? "kg" : "lb";
    const capCP = settlementCap?.value != null ? toCopper(settlementCap.value, settlementCap.denomination) : null;
    const groups = new Map();
    for ( const row of rows ) {
      row.key = entryKey(row.entry);
      const basePrice = row.entry.price?.value ?? row.item?.system?.price?.value ?? 0;
      const denomination = (row.entry.price?.value != null)
        ? row.entry.price.denomination
        : (row.item?.system?.price?.denomination ?? "gp");
      const isFixedValue = ShopSheet.#isFixedValue(row.item, fixedValueLootTypes);
      const { percent: discountPercent, tooltip: discountTooltip } = await ShopSheet.#resolveDiscount(
        row.entry.discount, isFixedValue, buyModifier, playerBuyModifier, actorName
      );
      const finalValue = basePrice * (1 + (discountPercent / 100));
      const baseCP = toCopper(basePrice, denomination);
      const priceCP = toCopper(finalValue, denomination);
      row.priceDisplay = breakdownCopper(priceCP);
      row.priceCP = priceCP;
      row.discountPercent = discountPercent;
      row.discountTooltip = discountTooltip;
      row.cartQuantity = cart.get(row.key) ?? 0;
      const isAmmo = (row.item?.type === "consumable") && (row.item?.system?.type?.value === "ammo");
      const bundleSize = row.entry.bundleSize
        ?? ((isAmmo && (row.item?.system?.quantity > 1)) ? row.item.system.quantity : 1);
      row.bundleSize = bundleSize > 1 ? bundleSize : null;
      row.weight = ShopSheet.#resolveWeight(row.item?.system, targetUnit);
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
    return ShopSheet.#finalizeGroups(groups);
  }

  /* -------------------------------------------- */

  /**
   * Group a selected actor's sellable inventory by item type.
   * @param {Item5e[]|Collection} items      The actor's items.
   * @param {number} sellModifier            Shop's sell-side percent discount/markup.
   * @param {Map<string, number>} sellCart   Selected sell quantities, keyed by item id.
   * @param {Set<string>} fixedValueLootTypes
   * @param {number|null} [playerSellModifier]  Acting actor's sell-side override, if configured.
   * @param {string} [actorName]  Acting actor's name, used to label the player row.
   * @returns {Promise<{ type: string, label: string, items: object[] }[]>}
   */
  static async #groupSellItems(items, sellModifier, sellCart, fixedValueLootTypes, playerSellModifier, actorName) {
    const targetUnit = game.settings.get("dnd5e", "metricWeightUnits") ? "kg" : "lb";
    const sellable = Array.from(items).filter(item => CONFIG.Item.dataModels[item.type]?.inventorySection);
    const resolved = await resolveShopItems(sellable.map(item => ({ identifier: item.system.identifier })));
    const groups = new Map();
    for ( const [index, item] of sellable.entries() ) {
      const catalogItem = resolved[index].item;
      const isAmmo = (item.type === "consumable") && (item.system?.type?.value === "ammo");
      const bundleSize = (isAmmo && (catalogItem?.system?.quantity > 1)) ? catalogItem.system.quantity : 1;
      const basePrice = (item.system.price?.value ?? 0) / bundleSize;
      const denomination = item.system.price?.denomination ?? "gp";
      const isFixedValue = ShopSheet.#isFixedValue(item, fixedValueLootTypes);
      const { percent: discountPercent, tooltip: discountTooltip } = await ShopSheet.#resolveDiscount(
        null, isFixedValue, sellModifier, playerSellModifier, actorName
      );
      const finalValue = basePrice * (1 + (discountPercent / 100));
      const priceCP = toCopper(finalValue, denomination);
      const row = {
        item,
        priceDisplay: breakdownCopper(priceCP),
        discountPercent,
        discountTooltip,
        sellQuantity: sellCart.get(item.id) ?? 0,
        owned: item.system.quantity ?? 1,
        priceCP,
        weight: ShopSheet.#resolveWeight(item.system, targetUnit)
      };
      if ( !groups.has(item.type) ) groups.set(item.type, []);
      groups.get(item.type).push(row);
    }
    return ShopSheet.#finalizeGroups(groups);
  }

  /* -------------------------------------------- */

  /**
   * Handle opening a dialog to pick a Charisma skill and the NPC's attitude, then roll it against the
   * shop NPC's DC for the acting actor.
   * @this {ShopSheet}
   */
  static async #haggle() {
    const actor = this.selectedActorUuid ? fromUuidSync(this.selectedActorUuid) : null;
    if ( !actor ) return;
    const playerOverride = ShopSheet.#getPlayerOverride(this.shop.playerDiscounts, this.selectedActorUuid);
    const effectiveBuy = this.shop.buyModifier + (playerOverride.buy ?? 0);
    const effectiveSell = this.shop.sellModifier + (playerOverride.sell ?? 0);
    const chaSkills = Object.entries(CONFIG.DND5E.skills).filter(([, s]) => s.ability === "cha");
    const npc = this.shop.npc ? await fromUuid(this.shop.npc) : null;
    const dc = Math.max(15, npc?.system.abilities?.int?.value ?? 0);
    const dispositionAttitude = {
      [CONST.TOKEN_DISPOSITIONS.HOSTILE]: "hostile", [CONST.TOKEN_DISPOSITIONS.FRIENDLY]: "friendly"
    };

    const dialog = new BasePromptDialog({
      window: { title: "SIMPLE_SHOP_CRAFT_5E.ShopEditor.Haggling" },
      hint: `${_loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.HagglingCurrent")}: `
        + `${_loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.Tabs.Buy")} ${effectiveBuy}% / `
        + `${_loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.Tabs.Sell")} ${effectiveSell}% (DC ${dc})`,
      fields: [
        {
          field: new foundry.data.fields.StringField(), name: "skill",
          label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.HagglingSkill"),
          options: chaSkills.map(([value, s]) => ({ value, label: s.label }))
        },
        {
          field: new foundry.data.fields.StringField(), name: "attitude",
          label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.HagglingAttitude"),
          value: dispositionAttitude[npc?.prototypeToken?.disposition] ?? "neutral",
          options: [
            { value: "hostile", label: _loc("TOKEN.DISPOSITION.HOSTILE") },
            { value: "neutral", label: _loc("TOKEN.DISPOSITION.NEUTRAL") },
            { value: "friendly", label: _loc("TOKEN.DISPOSITION.FRIENDLY") }
          ]
        }
      ],
      buttons: [
        { action: "roll", label: "SIMPLE_SHOP_CRAFT_5E.ShopEditor.HagglingRoll", icon: "fa-solid fa-dice-d20", default: true }
      ],
      form: {
        handler: async function(event, form, formData) {
          const data = foundry.utils.expandObject(formData.object);
          await actor.rollSkill({
            skill: data.skill, target: dc,
            advantage: data.attitude === "friendly", disadvantage: data.attitude === "hostile"
          });
          await this.close();
        }
      }
    });
    await dialog.render({ force: true });
  }

  /* -------------------------------------------- */

  /**
   * Items of the shop's configured fixed-value loot subtypes (default: Gemstones and Art Objects) have a
   * fixed market value — never subject to any buy/sell discount or markup.
   * @param {Item5e|object} [item]
   * @param {Set<string>} fixedValueLootTypes
   * @returns {boolean}
   */
  static #isFixedValue(item, fixedValueLootTypes) {
    return (item?.type === "loot") && fixedValueLootTypes.has(item?.system?.type?.value);
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
      const override = overrides[entryKey(entry)];
      if ( !override ) return entry.toObject();
      const result = entry.toObject();
      if ( override.discount !== undefined ) {
        result.discount = override.discount === null ? null : Math.clamp(Math.round(override.discount), -100, 1000);
      }
      return result;
    });

    const patch = { items };
    if ( data.img !== undefined ) patch.img = data.img;
    if ( data.location !== undefined ) patch.location = data.location;
    if ( data.description !== undefined ) patch.description = data.description;
    if ( data.currentGold ) {
      const current = Object.fromEntries(
        Object.entries(data.currentGold).map(([denom, value]) => [denom, Math.max(0, Math.round(value ?? 0))])
      );
      patch.goldPool = { ...this.shop.goldPool, current };
    }
    await this.#updateShop(patch);
  }

  /* -------------------------------------------- */

  /**
   * Handle opening the shopping cart window.
   * @this {ShopSheet}
   */
  static #openCart() {
    this.cartApp ??= new ShopCart({ shopSheet: this });
    this.cartApp.render({ force: true });
  }

  /* -------------------------------------------- */

  /**
   * Handle opening an item's sheet from the Buy/Sell table. Always re-resolves via UUID rather than
   * trusting the row's last-rendered data, matching dnd5e's own Compendium Browser click-to-open pattern.
   * @this {ShopSheet}
   * @param {Event} event         Triggering click event.
   * @param {HTMLElement} target  Element that was clicked.
   */
  static async #openItemSheet(event, target) {
    const uuid = target.dataset.uuid;
    if ( !uuid ) return;
    const item = await fromUuid(uuid);
    item?.sheet?.render(true);
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
    const items = this.shop.items.filter(i => entryKey(i) !== key).map(i => i.toObject());
    await this.#updateShop({ items });
  }

  /* -------------------------------------------- */

  /**
   * Handle opening a dialog to rename this shop.
   * @this {ShopSheet}
   */
  static async #renameShop() {
    const shopSheet = this;
    const dialog = new BaseConfigDialog({
      window: { title: "SIMPLE_SHOP_CRAFT_5E.ShopEditor.RenameShop" },
      fields: [
        { field: Shop.schema.fields.name, name: "name", value: this.shop.name }
      ],
      form: {
        handler: async (event, form, formData) => {
          const data = foundry.utils.expandObject(formData.object);
          await shopSheet.#updateShop({ name: data.name || shopSheet.shop.name });
        }
      }
    });
    await dialog.render({ force: true });
  }

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
   * Handle resetting this shop's stock (to each item's configured max, skipping items excluded via
   * `noRestock`) and gold pool (to its max, falling back to the default gold pool unless unlimited).
   * @this {ShopSheet}
   */
  static async #resetShop() {
    const items = this.shop.items.map(entry => {
      const obj = entry.toObject();
      if ( !obj.noRestock ) obj.stock = { ...obj.stock, current: obj.stock.max };
      return obj;
    });
    const goldPool = { ...this.shop.goldPool };
    if ( !goldPool.unlimited ) goldPool.current = { ...goldPool.max };

    await this.#updateShop({ items, goldPool, lastRestock: Date.now() });
  }

  /* -------------------------------------------- */

  /**
   * Resolve a row's effective discount percent and a rendered attribution tooltip breaking down the
   * result: item override, else fixed-value (0%), else shop default + player modifier.
   * @param {number|null} itemOverride    The item entry's own discount override, if any (buy-side only).
   * @param {boolean} isFixedValue        Whether the item is a fixed-value loot subtype (always 0%).
   * @param {number} shopModifier         Shop's default percent for this side (buy or sell).
   * @param {number|null} playerModifier  Acting actor's additive modifier for this side, if configured.
   * @param {string} [actorName]          Acting actor's name, used to label the player row.
   * @returns {Promise<{ percent: number, tooltip: string }>}
   */
  static async #resolveDiscount(itemOverride, isFixedValue, shopModifier, playerModifier, actorName) {
    if ( itemOverride != null ) {
      const sources = [{ label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.ItemOverride"), value: `${itemOverride}%`, type: "override" }];
      return { percent: itemOverride, tooltip: await ShopSheet.#renderAttribution(sources, `${itemOverride}%`) };
    }
    if ( isFixedValue ) {
      const sources = [{ label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.FixedValueItem"), value: "0%", type: "override" }];
      return { percent: 0, tooltip: await ShopSheet.#renderAttribution(sources, "0%") };
    }
    const sources = [ShopSheet.#additiveSource(_loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.ShopDefault"), shopModifier)];
    let percent = shopModifier;
    if ( playerModifier ) {
      sources.push(ShopSheet.#additiveSource(actorName, playerModifier));
      percent += playerModifier;
    }
    const tooltip = await ShopSheet.#renderAttribution(sources, `${percent}%`);
    return { percent, tooltip };
  }

  /* -------------------------------------------- */

  /**
   * Convert an item's weight to the world's configured weight unit, if it has one.
   * @param {object} [itemSystem]  The item's system data.
   * @param {string} targetUnit    "kg" or "lb", per the world's `metricWeightUnits` setting.
   * @returns {{ value: number, unit: string }|undefined}
   */
  static #resolveWeight(itemSystem, targetUnit) {
    if ( !itemSystem?.weight ) return undefined;
    return {
      value: game.dnd5e.utils.convertWeight(itemSystem.weight.value, itemSystem.weight.units || "lb", targetUnit),
      unit: targetUnit
    };
  }

  /* -------------------------------------------- */

  /**
   * Handle broadcasting this shop to every connected client, opening it in their Shop Editor.
   * @this {ShopSheet}
   */
  static async #spotlight() {
    const targets = game.users.filter(u => u.active && (u.id !== game.user.id));
    if ( !targets.length ) {
      ui.notifications.warn("SIMPLE_SHOP_CRAFT_5E.ShopEditor.SpotlightNoTargets");
      return;
    }
    await User.queryMany(targets, `${MODULE_ID}.spotlight`, { shopId: this.shopId });
    ui.notifications.info("SIMPLE_SHOP_CRAFT_5E.ShopEditor.SpotlightSuccess");
  }

  /* -------------------------------------------- */

  /**
   * Summarize the current buy and sell carts across all groups into a single net total.
   * Buying costs money (negative), selling earns money (positive).
   * @param {{ items: object[] }[]} buyGroups   Rows returned by {@link ShopSheet.#groupByType}.
   * @param {{ items: object[] }[]} sellGroups  Rows returned by {@link ShopSheet.#groupSellItems}.
   * @returns {{ count: number, parts: { denomination: string, value: number }[] }}
   */
  static #summarizeCart(buyGroups, sellGroups) {
    let count = 0;
    let buyTotalCP = 0;
    for ( const group of buyGroups ) {
      for ( const row of group.items ) {
        if ( !row.cartQuantity ) continue;
        count += row.cartQuantity;
        buyTotalCP += row.priceCP * row.cartQuantity;
      }
    }
    let sellTotalCP = 0;
    for ( const group of sellGroups ) {
      for ( const row of group.items ) {
        if ( !row.sellQuantity ) continue;
        count += row.sellQuantity;
        sellTotalCP += row.priceCP * row.sellQuantity;
      }
    }
    const netCP = sellTotalCP - buyTotalCP;
    return { count, parts: count > 0 ? breakdownCopper(Math.abs(netCP), { negative: netCP < 0 }) : [] };
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
   * The mode the sheet is currently in. GM-only — players always effectively view in Play mode.
   * @type {ShopSheet.MODES|null}
   * @protected
   */
  _mode = null;

  /* -------------------------------------------- */
  /*  Actions                                      */
  /* -------------------------------------------- */

  /**
   * Selected buy quantities, keyed by {@link entryKey}. Per-user, not persisted across sessions.
   * @type {Map<string, number>}
   */
  cart = new Map();

  /* -------------------------------------------- */

  /**
   * The shopping cart window, opened on demand and reused across renders.
   * @type {ShopCart|null}
   */
  cartApp = null;

  /* -------------------------------------------- */

  /**
   * Buy-side item groups from the last render, used to resolve cart lines.
   * @type {{ type: string, label: string, items: object[] }[]}
   */
  lastGroups = [];

  /* -------------------------------------------- */

  /**
   * Sell-side item groups from the last render, used to resolve sell lines.
   * @type {{ type: string, label: string, items: object[] }[]}
   */
  lastSellGroups = [];

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
   * Rows currently selected in the shopping cart, resolved from the last render.
   * @type {object[]}
   */
  get cartLines() {
    return (this.lastGroups ?? []).flatMap(group => group.items).filter(row => row.cartQuantity > 0);
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
    return (this.lastSellGroups ?? []).flatMap(group => group.items).filter(row => row.sellQuantity > 0);
  }

  /* -------------------------------------------- */

  /**
   * The shop currently being edited.
   * @type {Shop}
   */
  get shop() {
    return game.settings.get(MODULE_ID, SETTING_KEYS.SHOPS).find(s => s._id === this.shopId);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  get title() {
    return this.shop?.name ?? super.title;
  }

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
        if ( this.cartApp?.rendered ) this.cartApp.render();
      });
    }

    if ( (partId === "buy") || (partId === "sell") ) {
      htmlElement.querySelectorAll(".item-tooltip[data-uuid]").forEach(el => {
        const uuid = el.dataset.uuid;
        if ( !uuid ) return;
        el.dataset.tooltip = `<section class="loading" data-uuid="${uuid}"><i class="fas fa-spinner fa-spin-pulse"></i></section>`;
        el.dataset.tooltipClass = "dnd5e2 dnd5e-tooltip item-tooltip themed theme-light";
        el.dataset.tooltipDirection ??= "LEFT";
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
            { identifier: item.system.identifier ?? "", uuid: data.uuid, stock: { max: null, current: null } }
          ]);
        });
      }
    }
  }

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
  async _onFirstRender(context, options) {
    await super._onFirstRender(context, options);

    const button = document.createElement("button");
    button.type = "button";
    button.dataset.tooltip = "SIMPLE_SHOP_CRAFT_5E.ShopEditor.AddItems";
    button.ariaLabel = _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.AddItems");
    button.classList.add("create-child", "gold-button", "always-interactive");
    button.dataset.action = "addItems";
    button.innerHTML = '<i class="fas fa-plus" inert></i>';
    this.element.querySelector(".window-content").append(button);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _onRender(context, options) {
    await super._onRender(context, options);

    this._renderModeToggle();
    if ( this._mode === this.constructor.MODES.PLAY ) this._disableFields();

    const addButton = this.element.querySelector(".create-child");
    if ( addButton ) addButton.hidden = !context.editable || !this.isEditMode || !context.tabs?.buy?.active;
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
    const { characters, party } = ShopSheet.#getSelectableActors();
    if ( this.selectedActorUuid === undefined ) {
      this.selectedActorUuid = game.user.character?.type === "character" ? game.user.character.uuid : "";
    }
    context.actorOptions = [
      { value: "", label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.NoActorSelected") },
      ...(party ? [{ value: party.uuid, label: party.name }] : []),
      ...characters.map(a => ({ value: a.uuid, label: a.name }))
    ].map(o => ({ ...o, selected: o.value === this.selectedActorUuid }));
    context.actor = this.selectedActorUuid ? fromUuidSync(this.selectedActorUuid) : null;
    const playerOverride = ShopSheet.#getPlayerOverride(context.shop.playerDiscounts, this.selectedActorUuid);

    const resolved = await resolveShopItems(context.shop.items);
    context.groups = await ShopSheet.#groupByType(
      resolved, context.shop.settlementCap, context.shop.buyModifier, this.cart, context.shop.fixedValueLootTypes,
      playerOverride.buy, context.actor?.name
    );
    this.lastGroups = context.groups;

    context.sellGroups = await ShopSheet.#groupSellItems(
      context.actor?.items ?? [], context.shop.sellModifier, this.sellCart, context.shop.fixedValueLootTypes,
      playerOverride.sell, context.actor?.name
    );
    this.lastSellGroups = context.sellGroups;

    context.cart = ShopSheet.#summarizeCart(context.groups, context.sellGroups);
    context.goldPoolDisplay = displayGoldPool(context.shop.goldPool, { namePrefix: "currentGold." });
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
    if ( partId === "buy" ) {
      context.tabId = "buy";
      context.table = ShopSheet.#buildItemTable(
        context.groups, "SIMPLE_SHOP_CRAFT_5E.ShopEditor.None", BUY_COLUMNS,
        "modules/simple-shop-craft-5e/templates/shop-sheet/buy-row.hbs"
      );
    }
    if ( partId === "sell" ) {
      context.tabId = "sell";
      context.showNoActor = !context.actor;
      context.noActorLabel = "SIMPLE_SHOP_CRAFT_5E.ShopEditor.NoActorForSell";
      context.table = ShopSheet.#buildItemTable(
        context.sellGroups, "SIMPLE_SHOP_CRAFT_5E.ShopEditor.NoSellableItems", SELL_COLUMNS,
        "modules/simple-shop-craft-5e/templates/shop-sheet/sell-row.hbs"
      );
    }
    return context;
  }

  /* -------------------------------------------- */

  /**
   * Merge new item entries into the shop's item list, replacing any existing entry with the same
   * {@link entryKey}.
   * @param {ShopItemEntryData[]} newEntries
   */
  async #mergeItemEntries(newEntries) {
    const entries = new Map(this.shop.items.map(i => [entryKey(i), i.toObject()]));
    for ( const entry of newEntries ) entries.set(entryKey(entry), entry);
    await this.#updateShop({ items: Array.from(entries.values()) });
  }

  /* -------------------------------------------- */

  /**
   * Persist a partial update to this shop's data and re-render.
   * @param {object} patch  Fields to merge into the shop's current data.
   * @returns {Promise<void>}
   */
  async #updateShop(patch) {
    const shops = game.settings.get(MODULE_ID, SETTING_KEYS.SHOPS);
    await game.settings.set(MODULE_ID, SETTING_KEYS.SHOPS, shops.map(s => {
      return s._id === this.shopId ? { ...s.toObject(), ...patch } : s.toObject();
    }
    ));
    this.render();
    if ( this.cartApp?.rendered ) this.cartApp.render();
  }
}
