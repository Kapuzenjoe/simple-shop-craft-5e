import { MODULE_ID, SETTING_KEYS, SETTLEMENT_CAPS } from "../config.mjs";
import { getCurrencyOptions, goldPoolCurrencies } from "../shops/currency.mjs";
import { Shop } from "../data/shop-data.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * GM-facing application for creating a shop, or editing its non-inventory settings.
 * @mixes HandlebarsApplicationMixin
 * @extends {ApplicationV2}
 */
export default class ShopConfig extends HandlebarsApplicationMixin(ApplicationV2) {

  /**
   * @param {object} [options]
   * @param {string} [options.shopId]  Id of the shop being edited; omitted when creating a new shop.
   */
  constructor(options={}) {
    super(options);
    this.shopId = options.shopId;
  }

  /** @override */
  static DEFAULT_OPTIONS = {
    id: "shop-config-{id}",
    classes: ["dnd5e2", "simple-shop-craft-5e", "shop-config", "standard-form"],
    tag: "form",
    window: {
      title: "SIMPLE_SHOP_CRAFT_5E.ShopManager.Shops.EditConfig",
      resizable: true
    },
    position: {
      width: 560
    },
    form: {
      handler: ShopConfig.#onSubmit,
      submitOnChange: true,
      closeOnSubmit: false
    }
  };

  /** @override */
  static PARTS = {
    tabs: { template: "templates/generic/tab-navigation.hbs" },
    identity: { template: "modules/simple-shop-craft-5e/templates/shop-config/identity.hbs" },
    economy: { template: "modules/simple-shop-craft-5e/templates/shop-config/economy.hbs" }
  };

  /** @override */
  static TABS = {
    primary: {
      tabs: [
        { id: "identity", label: "DND5E.ACTIVITY.SECTIONS.Identity", icon: "fas fa-tag" },
        { id: "economy", label: "SIMPLE_SHOP_CRAFT_5E.ShopConfig.Tabs.Economy", icon: "fas fa-coins" }
      ],
      initial: "identity"
    }
  };

  /* -------------------------------------------- */

  /**
   * The shop currently being edited, or `null` when creating a new one.
   * @type {Shop|null}
   */
  get shop() {
    return this.shopId ? game.settings.get(MODULE_ID, SETTING_KEYS.SHOPS).find(s => s._id === this.shopId) : null;
  }

  /** @override */
  get title() {
    return this.shop?.name ?? super.title;
  }

  /* -------------------------------------------- */

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const shop = this.shop;
    context.fields = Shop.schema.fields;
    context.name = shop?.name ?? "";
    context.img = shop?.img ?? Shop.DEFAULT_ICON;
    context.location = shop?.location ?? "";
    context.description = shop?.description ?? "";
    context.npcUuid = shop?.npc ?? "";

    context.buyModifier = shop?.buyModifier ?? 0;
    context.sellModifier = shop?.sellModifier ?? -50;

    const settlementCap = shop?.settlementCap ?? { value: null, denomination: "gp" };
    const preset = Object.entries(SETTLEMENT_CAPS).find(([, v]) => v === settlementCap.value)?.[0]
      ?? (settlementCap.value != null ? "custom" : "");
    context.settlementCapPreset = preset;
    context.settlementCapPresetField = new foundry.data.fields.StringField({
      label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.SettlementCap"),
      choices: {
        "": "SIMPLE_SHOP_CRAFT_5E.ShopEditor.NoCap",
        village: "SIMPLE_SHOP_CRAFT_5E.ShopEditor.Village",
        town: "SIMPLE_SHOP_CRAFT_5E.ShopEditor.Town",
        city: "SIMPLE_SHOP_CRAFT_5E.ShopEditor.City",
        custom: "SIMPLE_SHOP_CRAFT_5E.ShopEditor.Custom"
      }
    });
    context.settlementCapCustom = preset === "custom";
    context.settlementCapValue = settlementCap.value;
    context.currencyOptions = getCurrencyOptions({ abbreviated: true })
      .map(o => ({ ...o, selected: o.value === settlementCap.denomination }));

    const goldPool = shop?.goldPool ?? { max: {}, unlimited: false };
    context.goldPoolUnlimited = goldPool.unlimited;
    context.goldCurrencies = goldPoolCurrencies().reduce((obj, denom) => {
      obj[denom] = {
        label: CONFIG.DND5E.currencies[denom].label,
        value: goldPool.max?.[denom] ?? null
      };
      return obj;
    }, {});
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
  _attachPartListeners(partId, htmlElement, options) {
    super._attachPartListeners(partId, htmlElement, options);

    if ( partId === "economy" ) {
      const capSelect = htmlElement.querySelector('select[name="settlementCapPreset"]');
      const capValueGroup = htmlElement.querySelector('input[name="settlementCapValue"]')?.closest(".form-group");
      capSelect?.addEventListener("change", () => capValueGroup.hidden = capSelect.value !== "custom");

      const goldUnlimited = htmlElement.querySelector('input[name="goldPoolUnlimited"]');
      const goldGroup = htmlElement.querySelector('[data-goldpool-amounts]');
      goldUnlimited?.addEventListener("change", () => {
        goldGroup.hidden = goldUnlimited.checked;
        goldGroup.querySelectorAll("input").forEach(input => input.disabled = goldUnlimited.checked);
      });
    }
  }

  /* -------------------------------------------- */

  /**
   * Handle submitting the edit form.
   * @this {ShopConfig}
   * @param {Event} event
   * @param {HTMLElement} form
   * @param {FormDataExtended} formData
   */
  static async #onSubmit(event, form, formData) {
    const data = foundry.utils.expandObject(formData.object);
    const shops = game.settings.get(MODULE_ID, SETTING_KEYS.SHOPS);

    const settlementCapValue = data.settlementCapPreset === "custom"
      ? (data.settlementCapValue ?? null)
      : (data.settlementCapPreset === "" ? null : SETTLEMENT_CAPS[data.settlementCapPreset]);
    const settlementCapDenomination = (data.settlementCapPreset === "custom") ? (data.settlementCapDenomination || "gp") : "gp";
    const goldPoolMax = data.goldPool ?? {};
    const buyModifier = Math.clamp(Math.round(data.buyModifier ?? 0), -100, 1000);
    const sellModifier = Math.clamp(Math.round(data.sellModifier ?? -50), -100, 1000);

    await game.settings.set(MODULE_ID, SETTING_KEYS.SHOPS, shops.map(s => s._id !== this.shopId ? s.toObject() : {
      ...s.toObject(),
      name: data.name || s.name,
      img: data.img || s.img,
      location: data.location ?? "",
      description: data.description ?? "",
      npc: data.npc || null,
      buyModifier, sellModifier,
      settlementCap: { value: settlementCapValue, denomination: settlementCapDenomination },
      goldPool: { ...s.goldPool, max: goldPoolMax, unlimited: !!data.goldPoolUnlimited }
    }));
  }
}
