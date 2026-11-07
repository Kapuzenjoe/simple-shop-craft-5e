import { ACTIVATION_MODES, MODULE_ID, SETTING_KEYS, SETTLEMENT_CAPS, STOCK_MAGIC_RULES } from "../../../config.mjs";
import { Shop } from "../../../data/shop-data.mjs";
import {
  currencyRows, currencyValueField, festivalOptions, goldPoolCurrencies, isCalendarModeActive, parseTypeFilter,
  typeFilterFields
} from "../../../utils.mjs";
import BaseShopConfig from "./base-shop-config.mjs";

/**
 * Dialog to edit a shop's identity, owner, opening hours, prices, money pool, and default stock per item type.
 * @param {object} options
 * @param {Shop} options.shop
 */
export default class VendorConfig extends BaseShopConfig {
  constructor({ shop, ...options }={}) {
    super(options);
    this.#shopId = shop._id;
  }

  /* -------------------------------------------- */

  /** @override */
  static DEFAULT_OPTIONS = {
    id: "vendor-config-{id}",
    window: { title: "SIMPLE_SHOP_CRAFT_5E.ShopEditor.VendorSettings" },
    form: { handler: VendorConfig.#onSubmit },
    position: {
      width: 500,
      height: "auto"
    }
  };

  /* -------------------------------------------- */

  /** @override */
  static PARTS = {
    tabs: {
      template: "templates/generic/tab-navigation.hbs"
    },
    general: {
      template: "modules/simple-shop-craft-5e/templates/shops/shop-config/vendor-config/general.hbs"
    },
    prices: {
      template: "modules/simple-shop-craft-5e/templates/shops/shop-config/vendor-config/prices.hbs"
    },
    money: {
      template: "modules/simple-shop-craft-5e/templates/shops/shop-config/vendor-config/money.hbs"
    }
  };

  /* -------------------------------------------- */

  /** @override */
  static TABS = {
    sheet: {
      tabs: [
        { id: "general", label: "SIMPLE_SHOP_CRAFT_5E.ShopEditor.Tabs.General", icon: "fa-solid fa-shop" },
        { id: "prices", label: "SIMPLE_SHOP_CRAFT_5E.ShopEditor.Tabs.Prices", icon: "fa-solid fa-tags" },
        { id: "money", label: "SIMPLE_SHOP_CRAFT_5E.ShopEditor.Tabs.Money", icon: "fa-solid fa-coins" }
      ],
      initial: "general"
    }
  };

  /* -------------------------------------------- */

  /**
   * Selected settlement cap preset, "" for no cap, "custom" for a manual value. Derived from the shop on first render.
   * @type {string}
   */
  #capPreset;

  /* -------------------------------------------- */

  /**
   * ID of the shop being configured.
   * @type {string}
   */
  #shopId;

  /* -------------------------------------------- */

  /**
   * The shop being configured.
   * @type {Shop}
   */
  get shop() {
    return Shop.get(this.#shopId);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const { goldPool, stockDefaults } = this.shop;

    context.nameFields = [
      { field: Shop.schema.fields.name, name: "name", value: this.shop.name }
    ];
    context.imgField = Shop.schema.fields.img;
    context.img = (this.shop.img === Shop.DEFAULT_ICON) ? "" : this.shop.img;
    context.previewImg = this.shop.displayImg;

    context.shop = this.shop;
    context.shopFields = Shop.schema.fields;
    context.ownerFields = [
      { field: Shop.schema.fields.npcName, name: "npcName", value: this.shop.npcName },
      { field: Shop.schema.fields.npc, name: "npc", value: this.shop.npc ?? "" }
    ];

    context.locationFields = [
      {
        field: Shop.schema.fields.location, name: "location", value: this.shop.location,
        placeholder: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.LocationPlaceholder")
      },
      { field: Shop.schema.fields.scenes, name: "scenes", value: Array.from(this.shop.scenes) },
      {
        field: Shop.schema.fields.activationMode, name: "activationMode", value: this.shop.activationMode,
        options: Object.entries(ACTIVATION_MODES).map(([value, { label }]) => ({ value, label: _loc(label) }))
      }
    ];

    context.calendarModeActive = isCalendarModeActive();
    context.statusOverrideOptions = [
      { value: "", label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.StatusOverrideAuto") },
      { value: "open", label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.StatusOverrideOpen") },
      { value: "closed", label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.StatusOverrideClosed") }
    ];
    context.restockWeekdayOptions = game.time.calendar.days.values.map(
      (day, value) => ({ value, label: _loc(day.name) })
    );
    context.restockWeekdays = Array.from(this.shop.restockWeekdays);
    context.closedWeekdays = Array.from(this.shop.closedWeekdays);
    context.festivalOptions = festivalOptions();
    context.closedFestivals = Array.from(this.shop.closedFestivals);

    const lootTypeOptions = Object.entries(CONFIG.DND5E.lootTypes).map(([value, cfg]) => ({ value, label: cfg.label }));
    context.modifierFields = [
      {
        field: Shop.schema.fields.buyModifier, name: "buyModifier", value: this.shop.buyModifier,
        input: (field, config) => foundry.applications.fields.createNumberInput(config),
        placeholder: game.settings.get(MODULE_ID, SETTING_KEYS.DEFAULT_BUY_MODIFIER)
      },
      {
        field: Shop.schema.fields.sellModifier, name: "sellModifier", value: this.shop.sellModifier,
        input: (field, config) => foundry.applications.fields.createNumberInput(config),
        placeholder: game.settings.get(MODULE_ID, SETTING_KEYS.DEFAULT_SELL_MODIFIER)
      },
      {
        field: Shop.schema.fields.fixedValueLootTypes, name: "fixedValueLootTypes",
        value: Array.from(this.shop.fixedValueLootTypes), options: lootTypeOptions
      }
    ];

    const { settlementCap } = this.shop;
    this.#capPreset ??= Object.entries(SETTLEMENT_CAPS).find(([, v]) => {
      return (v.value === settlementCap.value) && (settlementCap.denomination === "gp");
    })?.[0] ?? (settlementCap.value != null ? "custom" : "");
    const presetOptions = [
      { value: "", label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.NoCap") },
      ...Object.entries(SETTLEMENT_CAPS).map(([key, { label, value }]) => ({
        value: key,
        label: `${_loc(label)} (${new Intl.NumberFormat(game.i18n.lang).format(value)} ${CONFIG.DND5E.currencies.gp.abbreviation})`
      })),
      { value: "custom", label: _loc("SIMPLE_SHOP_CRAFT_5E.Custom") }
    ];
    context.capFields = [
      {
        field: new foundry.data.fields.StringField(), name: "settlementCapPreset", value: this.#capPreset,
        label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.SettlementCapPreset"), options: presetOptions
      },
      ...(this.#capPreset === "custom" ? [currencyValueField({
        label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.SettlementCapValue"),
        field: Shop.schema.fields.settlementCap, valueName: "settlementCapValue", value: settlementCap.value,
        denominationName: "settlementCapDenomination", denomination: settlementCap.denomination
      })] : []),
      {
        field: Shop.schema.fields.settlementCap.fields.appliesToSell, name: "appliesToSell",
        value: !!settlementCap.appliesToSell,
        label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.SettlementCapAppliesToSell"),
        hint: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.SettlementCapAppliesToSellHint")
      }
    ];

    context.moneyFields = [
      {
        field: Shop.schema.fields.goldPool.fields.sellDisabled, name: "sellDisabled", value: goldPool.sellDisabled,
        hint: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.SellDisabledHint")
      }
    ];
    context.currencyRows = null;
    context.typeFilter = null;
    if ( !goldPool.sellDisabled ) {
      context.moneyFields.push({
        field: Shop.schema.fields.goldPool.fields.unlimited, name: "unlimited", value: goldPool.unlimited,
        label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.UnlimitedMoney"),
        hint: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.UnlimitedMoneyHint")
      });
      if ( !goldPool.unlimited ) context.currencyRows = currencyRows(goldPool.max);
      const { typeFields, typeFieldsets } = typeFilterFields(this.shop.sellTypes);
      typeFields[0].hint = _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.SellTypesHint");
      context.typeFilter = {
        typeFields: [
          ...typeFields, ...typeFieldsets.flatMap(({ label, fields }) => fields.map(field => ({ ...field, label })))
        ],
        typeFieldsets: []
      };
    }

    const byTypeField = Shop.schema.fields.stockDefaults.fields.byType.element;
    context.stockFields = [
      {
        field: Shop.schema.fields.stockDefaults.fields.magicRule, name: "magicRule", value: stockDefaults.magicRule,
        options: Object.entries(STOCK_MAGIC_RULES).map(([value, { label }]) => ({ value, label: _loc(label) })),
        hint: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.StockMagicRuleHint")
      },
      ...Object.keys(stockDefaults.byType).map((type, index, types) => ({
        field: byTypeField, name: `stockByType.${type}`, value: stockDefaults.byType[type], placeholder: "—",
        label: _loc(`TYPES.Item.${type}Pl`),
        hint: (index === types.length - 1) ? _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.StockDefaultHint") : undefined
      }))
    ];

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

  /** @inheritDoc */
  _onChangeForm(formConfig, event) {
    super._onChangeForm(formConfig, event);
    if ( event.target.name !== "settlementCapPreset" ) return;
    this.#capPreset = event.target.value;
    this.render({ parts: ["prices"] });
  }

  /* -------------------------------------------- */

  /**
   * Handle persisting the changed shop settings.
   * @this {VendorConfig}
   * @param {Event} event                Triggering submit event.
   * @param {HTMLFormElement} form       The submitted form.
   * @param {FormDataExtended} formData  Data from the form.
   * @returns {Promise<void>}
   */
  static async #onSubmit(event, form, formData) {
    const data = foundry.utils.expandObject(formData.object);
    const currentGoldPool = this.shop.goldPool;
    const { activationMode, scenes } = this.shop;
    const sellDisabled = !!data.sellDisabled;
    const unlimited = sellDisabled ? currentGoldPool.unlimited : !!data.unlimited;
    const max = sellDisabled ? currentGoldPool.max : goldPoolCurrencies().reduce((obj, denom) => {
      obj[denom] = (denom in data) ? Math.max(0, Math.round(data[denom] ?? 0)) : (currentGoldPool.max[denom] ?? 0);
      return obj;
    }, {});

    const byType = Object.fromEntries(
      Object.keys(this.shop.stockDefaults.byType).map(type => {
        const raw = data.stockByType?.[type];
        const value = ((raw === "") || (raw == null)) ? null : Math.max(0, Math.round(raw));
        return [type, value];
      })
    );

    const { settlementCap } = this.shop;
    const customCap = data.settlementCapPreset === "custom";
    const capValue = customCap ? (("settlementCapValue" in data) ? data.settlementCapValue : settlementCap.value)
      : (data.settlementCapPreset ? SETTLEMENT_CAPS[data.settlementCapPreset].value : null);

    await this.onUpdate({
      name: data.name || this.shop.name,
      img: data.img || Shop.DEFAULT_ICON,
      npcName: data.npcName || "",
      npc: data.npc || null,
      location: data.location ?? "",
      scenes: data.scenes ?? [],
      activationMode: data.activationMode ?? "manual",
      statusOverride: data.statusOverride ?? "",
      openHour: data.openHour ?? null,
      openMinute: Math.clamp(Math.round(data.openMinute ?? 0), 0, 59),
      closeHour: data.closeHour ?? null,
      closeMinute: Math.clamp(Math.round(data.closeMinute ?? 0), 0, 59),
      closedWeekdays: data.closedWeekdays ?? [],
      restockWeekdays: data.restockWeekdays ?? [],
      buyModifier: Math.clamp(
        Math.round(data.buyModifier ?? game.settings.get(MODULE_ID, SETTING_KEYS.DEFAULT_BUY_MODIFIER)), -100, 1000
      ),
      sellModifier: Math.clamp(
        Math.round(data.sellModifier ?? game.settings.get(MODULE_ID, SETTING_KEYS.DEFAULT_SELL_MODIFIER)), -100, 1000
      ),
      fixedValueLootTypes: data.fixedValueLootTypes ?? [],
      settlementCap: {
        value: capValue,
        denomination: customCap ? (data.settlementCapDenomination ?? settlementCap.denomination) : "gp",
        appliesToSell: !!data.appliesToSell
      },
      goldPool: { ...currentGoldPool, max, unlimited, sellDisabled },
      stockDefaults: { byType, magicRule: data.magicRule ?? "gear" },
      ...(("closedFestivals" in data) ? { closedFestivals: data.closedFestivals } : {}),
      ...(("types" in data) ? { sellTypes: parseTypeFilter(data) } : {})
    });
    if ( (this.shop.activationMode !== activationMode) || !this.shop.scenes.equals(scenes) ) {
      await Shop.syncSceneActivation();
    }
  }
}
