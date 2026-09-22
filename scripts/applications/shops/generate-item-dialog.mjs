import GeneratorProfile from "../../data/generator-profile.mjs";
import { ShopItemEntry } from "../../data/shop-data.mjs";
import { breakdownCopper, itemRarity, resolveItemPrice, subtypeOptions, toCopper } from "../../utils.mjs";

const { Dialog5e } = game.dnd5e.applications.api;

/**
 * @import { GeneratorPool, ShopItemEntryData } from "../../_types.mjs";
 * @import ShopSheet from "./shop-sheet.mjs";
 */

/**
 * Sentinel value meaning "no restriction on this axis" in a multi-select field.
 * @type {string}
 */
const ANY_VALUE = "any";

/**
 * GM-facing dialog to roll random shop item entries: multi-select item types, each with its own
 * subtype restriction, a global rarity/magic filter, an optional spell-scroll filter, a weighting, and a count,
 * split into a Filters and an Options tab. A preview beside the tabs summarizes the pool the settings draw from.
 */
export default class GenerateItemDialog extends Dialog5e {
  constructor({ shopSheet, onGenerated, ...options }={}) {
    super(options);
    this.shopSheet = shopSheet;
    this.onGenerated = onGenerated;
  }

  /* -------------------------------------------- */

  /** @override */
  static DEFAULT_OPTIONS = {
    id: "generate-item-dialog-{id}",
    classes: ["simple-shop-craft-5e", "generate-item-dialog", "standard-form"],
    window: { title: "SIMPLE_SHOP_CRAFT_5E.ShopEditor.GenerateItem", resizable: true },
    position: { width: 720, height: "auto" },
    form: {
      handler: GenerateItemDialog.#onSubmit,
      submitOnChange: true,
      closeOnSubmit: false
    },
    buttons: [
      { action: "generate", label: "SIMPLE_SHOP_CRAFT_5E.ShopEditor.GenerateItemRoll", icon: "fa-solid fa-dice-d20", default: true },
      { action: "add", label: "SIMPLE_SHOP_CRAFT_5E.ShopEditor.AddItems", icon: "fa-solid fa-plus" }
    ],
    actions: {
      generate: GenerateItemDialog.#generate,
      add: GenerateItemDialog.#add,
      reroll: GenerateItemDialog.#reroll,
      remove: GenerateItemDialog.#remove
    }
  };

  /* -------------------------------------------- */

  /** @override */
  static PARTS = {
    tabs: {
      template: "systems/dnd5e/templates/shared/horizontal-tabs.hbs",
      templates: ["templates/generic/tab-navigation.hbs"]
    },
    filters: { template: "modules/simple-shop-craft-5e/templates/shops/generate-item-dialog/filters.hbs" },
    options: { template: "modules/simple-shop-craft-5e/templates/shops/generate-item-dialog/options.hbs" },
    preview: {
      template: "modules/simple-shop-craft-5e/templates/shops/generate-item-dialog/preview.hbs",
      templates: ["modules/simple-shop-craft-5e/templates/shared/item-avatar-name.hbs"]
    },
    footer: super.PARTS.footer
  };

  /* -------------------------------------------- */

  /** @override */
  static TABS = {
    primary: {
      tabs: [
        { id: "filters", label: "SIMPLE_SHOP_CRAFT_5E.ShopEditor.GenerateItemFilters", icon: "fas fa-filter" },
        { id: "options", label: "SIMPLE_SHOP_CRAFT_5E.ShopEditor.GenerateItemOptions", icon: "fas fa-sliders" }
      ],
      initial: "filters"
    }
  };

  /* -------------------------------------------- */

  /**
   * The number of milliseconds to delay between changes to the settings before rebuilding the pool.
   * @type {number}
   */
  static REFRESH_DELAY = 300;

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * The shop this generator is adding items to.
   * @type {ShopSheet}
   */
  shopSheet;

  /* -------------------------------------------- */

  /**
   * Callback receiving the generated entries.
   * @type {(entries: ShopItemEntryData[]) => Promise<void>}
   */
  onGenerated;

  /* -------------------------------------------- */

  /**
   * The generator settings being edited.
   * @type {GeneratorProfile}
   */
  #profile = new GeneratorProfile();

  /* -------------------------------------------- */

  /**
   * The pool of the current settings, or `null` while it is being built.
   * @type {GeneratorPool|null}
   */
  #pool = null;

  /* -------------------------------------------- */

  /**
   * The rolled items awaiting addition to the shop, each with its resolved item.
   * @type {{ entry: ShopItemEntryData, item: Item5e }[]}
   */
  #results = [];

  /* -------------------------------------------- */

  /**
   * The function to invoke when the pool needs to be rebuilt.
   * @type {Function}
   */
  _debouncedRefreshPool = foundry.utils.debounce(this._onRefreshPool.bind(this), this.constructor.REFRESH_DELAY);

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /** @inheritDoc */
  async _onFirstRender(context, options) {
    await super._onFirstRender(context, options);
    this._debouncedRefreshPool();
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _preparePartContext(partId, context, options) {
    context = await super._preparePartContext(partId, context, options);
    context.tab = context.tabs?.[partId];
    switch ( partId ) {
      case "filters": context = await this._prepareFiltersContext(context, options); break;
      case "options": context = await this._prepareOptionsContext(context, options); break;
      case "preview": context = await this._preparePreviewContext(context, options); break;
    }
    return context;
  }

  /* -------------------------------------------- */

  /**
   * Prepare rendering context for the filters part.
   * @param {ApplicationRenderContext} context  Context being prepared.
   * @param {HandlebarsRenderOptions} options   Options which configure application rendering behavior.
   * @returns {Promise<ApplicationRenderContext>}
   * @protected
   */
  async _prepareFiltersContext(context, options) {
    const typeOptions = Object.keys(CONFIG.Item.dataModels)
      .filter(type => CONFIG.Item.dataModels[type]?.inventorySection)
      .map(type => ({ value: type, label: _loc(`TYPES.Item.${type}Pl`) }));

    context.typeFields = [{
      field: new foundry.data.fields.SetField(new foundry.data.fields.StringField()), name: "types",
      label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.GenerateItemType"), value: Object.keys(this.#profile.types),
      options: typeOptions
    }];

    context.typeFieldsets = await Promise.all(Object.keys(this.#profile.types)
      .toSorted((a, b) => (CONFIG.Item.dataModels[a]?.inventorySection?.order ?? Infinity)
        - (CONFIG.Item.dataModels[b]?.inventorySection?.order ?? Infinity))
      .map(async type => {
        const selected = this.#profile.types[type];
        const fields = [{
          field: new foundry.data.fields.SetField(new foundry.data.fields.StringField()), name: `subtypes.${type}`,
          label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.GenerateItemSubtype"),
          value: selected.size ? Array.from(selected) : [ANY_VALUE],
          options: [
            { value: ANY_VALUE, label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.GenerateItemAny") },
            ...subtypeOptions([type])
          ]
        }];
        const baseItemOptions = await this.#profile.getBaseItemOptions(type);
        if ( baseItemOptions.length ) {
          const selectedBaseItems = this.#profile.getBaseItems(type);
          fields.push({
            field: new foundry.data.fields.SetField(new foundry.data.fields.StringField()), name: `baseItems.${type}`,
            label: _loc(`DND5E.Item${type.capitalize()}Base`),
            value: selectedBaseItems ? Array.from(selectedBaseItems) : [ANY_VALUE],
            options: [
              { value: ANY_VALUE, label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.GenerateItemAny") },
              ...baseItemOptions
            ]
          });
        }
        return { label: _loc(`TYPES.Item.${type}Pl`), fields };
      }));

    context.globalFields = [
      {
        field: new foundry.data.fields.SetField(new foundry.data.fields.StringField()), name: "rarities",
        label: _loc("DND5E.Rarity"),
        value: this.#profile.rarities.size
          ? Array.from(this.#profile.rarities).map(r => r === "" ? "mundane" : r) : [ANY_VALUE],
        options: [
          { value: ANY_VALUE, label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.GenerateItemAny") },
          { value: "mundane", label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.GenerateItemMundane") },
          ...Object.entries(CONFIG.DND5E.itemRarity)
            .filter(([value]) => value !== "artifact")
            .map(([value, label]) => ({ value, label: label.capitalize() }))
        ]
      },
      {
        field: new foundry.data.fields.StringField(), name: "magic",
        label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.GenerateItemMagic"), value: this.#profile.magic,
        options: [
          { value: ANY_VALUE, label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.GenerateItemAny") },
          { value: "magic", label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.GenerateItemMagicOnly") },
          { value: "mundane", label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.GenerateItemMundane") }
        ]
      }
    ];

    return context;
  }

  /* -------------------------------------------- */

  /**
   * Prepare rendering context for the options part.
   * @param {ApplicationRenderContext} context  Context being prepared.
   * @param {HandlebarsRenderOptions} options   Options which configure application rendering behavior.
   * @returns {Promise<ApplicationRenderContext>}
   * @protected
   */
  async _prepareOptionsContext(context, options) {
    context.spellToggles = [
      {
        field: new foundry.data.fields.BooleanField(), name: "includeScrolls",
        label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.GenerateItemScrolls"),
        hint: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.GenerateItemScrollsHint"),
        value: this.#profile.includeScrolls
      },
      {
        field: new foundry.data.fields.BooleanField(), name: "includeEnspelled",
        label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.GenerateItemEnspelled"),
        hint: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.GenerateItemEnspelledHint"),
        value: this.#profile.includeEnspelled
      }
    ];

    const { spellFilter } = this.#profile;
    context.spellFieldset = this.#profile.includesScrolls ? {
      fields: [
        {
          field: new foundry.data.fields.SetField(new foundry.data.fields.StringField()), name: "schools",
          label: _loc("DND5E.School"),
          value: spellFilter.schools.size ? Array.from(spellFilter.schools) : [ANY_VALUE],
          options: [
            { value: ANY_VALUE, label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.GenerateItemAny") },
            ...Object.entries(CONFIG.DND5E.spellSchools).map(([value, { label }]) => ({ value, label: _loc(label) }))
          ]
        },
        {
          field: new foundry.data.fields.SetField(new foundry.data.fields.StringField()), name: "classes",
          label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.GenerateItemClass"),
          value: spellFilter.classes.size ? Array.from(spellFilter.classes) : [ANY_VALUE],
          options: [
            { value: ANY_VALUE, label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.GenerateItemAny") },
            ...game.dnd5e.registry.spellLists.options.filter(o => o.type === "class")
              .map(o => ({ value: o.value, label: o.label }))
          ]
        },
        {
          field: new foundry.data.fields.SetField(new foundry.data.fields.StringField()), name: "levels",
          label: _loc("DND5E.Level"),
          value: spellFilter.levels.size ? Array.from(spellFilter.levels) : [ANY_VALUE],
          options: [
            { value: ANY_VALUE, label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.GenerateItemAny") },
            ...Object.entries(CONFIG.DND5E.spellLevels).map(([value, label]) => ({ value, label: _loc(label) }))
          ]
        },
        {
          field: new foundry.data.fields.BooleanField(), name: "ritualOnly",
          label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.GenerateItemRitualOnly"), value: spellFilter.ritualOnly
        }
      ]
    } : null;

    const { weighting } = this.#profile;
    context.weightingFields = [{
      field: GeneratorProfile.schema.fields.weighting, name: "weighting",
      label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.GenerateItemWeighting"), value: weighting,
      hint: _loc(`SIMPLE_SHOP_CRAFT_5E.ShopEditor.GenerateItemWeighting${weighting.capitalize()}Hint`),
      options: GeneratorProfile.schema.fields.weighting.choices.map(value => ({
        value, label: _loc(`SIMPLE_SHOP_CRAFT_5E.ShopEditor.GenerateItemWeighting${value.capitalize()}`)
      }))
    }];
    context.count = this.#profile.count;
    return context;
  }

  /* -------------------------------------------- */

  /**
   * Prepare rendering context for the preview part.
   * @param {ApplicationRenderContext} context  Context being prepared.
   * @param {HandlebarsRenderOptions} options   Options which configure application rendering behavior.
   * @returns {Promise<ApplicationRenderContext>}
   * @protected
   */
  async _preparePreviewContext(context, options) {
    context.results = this.#results.map(({ item }) => {
      const rarity = itemRarity(item);
      const price = resolveItemPrice(item);
      return {
        name: item.name,
        img: item.img,
        rarity: rarity ? CONFIG.DND5E.itemRarity[rarity].capitalize()
          : _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.GenerateItemMundane"),
        price: price ? breakdownCopper(toCopper(price.value, price.denomination)) : null
      };
    });
    if ( !this.#pool ) return context;
    const { included, capped, owned } = this.#pool.summary;
    const total = Object.values(included).reduce((sum, count) => sum + count, 0);
    const cappedTotal = Math.ceil(Object.values(capped).reduce((sum, count) => sum + count, 0));
    const ownedTotal = Math.ceil(Object.values(owned).reduce((sum, count) => sum + count, 0));
    const reason = cappedTotal ? (ownedTotal ? "Both" : "Capped") : (ownedTotal ? "Owned" : "");
    context.pool = {
      total: Math.ceil(total),
      capped: cappedTotal,
      owned: ownedTotal,
      empty: total ? null : _loc(`SIMPLE_SHOP_CRAFT_5E.ShopEditor.GenerateItemPoolEmpty${reason}`),
      rarities: ["", ...Object.keys(CONFIG.DND5E.itemRarity)]
        .filter(rarity => included[rarity] || capped[rarity])
        .map(rarity => ({
          label: rarity ? CONFIG.DND5E.itemRarity[rarity].capitalize()
            : _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.GenerateItemMundane"),
          count: Math.ceil(included[rarity] ?? 0),
          capped: Math.ceil(capped[rarity] ?? 0),
          percent: total ? Math.round(((included[rarity] ?? 0) / total) * 100) : 0
        }))
    };
    return context;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareFooterContext(context, options) {
    context = await super._prepareFooterContext(context, options);
    context.buttons.find(button => button.action === "add").disabled = !this.#results.length;
    return context;
  }

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers                */
  /* -------------------------------------------- */

  /**
   * Handle rebuilding the pool of the current settings and updating its preview, unless the settings have changed
   * in the meantime.
   * @returns {Promise<void>}
   * @protected
   */
  async _onRefreshPool() {
    const profile = this.#profile;
    const pool = await profile.buildPool({
      settlementCap: this.shopSheet.shop.settlementCap, existingKeys: this.#entryKeys()
    });
    if ( profile !== this.#profile ) return;
    this.#pool = pool;
    await this.render({ parts: ["preview"] });
  }

  /* -------------------------------------------- */

  /**
   * Sync all filter state from a full form submission (also used on every field change).
   * @this {GenerateItemDialog}
   * @param {Event} event
   * @param {HTMLFormElement} form
   * @param {FormDataExtended} formData
   * @returns {Promise<void>}
   */
  static async #onSubmit(event, form, formData) {
    const data = foundry.utils.expandObject(formData.object);
    this.#profile = new GeneratorProfile({
      types: Object.fromEntries(
        (data.types ?? []).map(type => [type, parseMultiSelect(data.subtypes ?? {}, type)])
      ),
      baseItems: Object.fromEntries(
        (data.types ?? []).map(type => [type, parseMultiSelect(data.baseItems ?? {}, type)])
      ),
      rarities: parseMultiSelect(data, "rarities").map(r => r === "mundane" ? "" : r),
      magic: data.magic || ANY_VALUE,
      weighting: data.weighting,
      includeScrolls: !!data.includeScrolls,
      includeEnspelled: !!data.includeEnspelled,
      spellFilter: {
        schools: parseMultiSelect(data, "schools"),
        classes: parseMultiSelect(data, "classes"),
        levels: parseMultiSelect(data, "levels").map(Number),
        ritualOnly: !!data.ritualOnly
      },
      count: Math.clamp(Number(data.count) || 1, 1, 10)
    });
    this.#pool = null;
    this._debouncedRefreshPool();
    await this.render({ parts: ["filters", "options", "preview", "footer"] });
  }

  /* -------------------------------------------- */

  /**
   * Get the keys of the entries in the shop, along with those of any extra entries.
   * @param {ShopItemEntryData[]} [extra]
   * @returns {Set<string>}
   */
  #entryKeys(extra=[]) {
    return new Set([...this.shopSheet.shop.items, ...extra].map(entry => ShopItemEntry.key(entry)));
  }

  /* -------------------------------------------- */

  /**
   * Roll items that are neither in the shop nor in the result list, and resolve them.
   * @param {ShopItemEntryData[]} [listed]  Entries of the result list that must not come up again.
   * @param {number} [count]                How many items to roll. Defaults to the count of the settings.
   * @returns {Promise<{ entry: ShopItemEntryData, item: Item5e }[]>}
   */
  async #rollResults(listed=[], count=this.#profile.count) {
    const { settlementCap, stockDefaults } = this.shopSheet.shop;
    const rolled = await this.#profile.roll({
      existingKeys: this.#entryKeys(listed), settlementCap, stockDefaults, pool: this.#pool, count
    });
    return (await ShopItemEntry.resolveMany(rolled.map(r => r.entry))).filter(({ item }) => item);
  }

  /* -------------------------------------------- */

  /**
   * Roll items into the result list, replacing the previous ones.
   * @this {GenerateItemDialog}
   * @param {Event} event         Triggering click event.
   * @param {HTMLElement} target  Button that was clicked.
   * @returns {Promise<void>}
   */
  static async #generate(event, target) {
    target.disabled = true;
    try {
      const { count } = this.#profile;
      this.#results = await this.#rollResults();
      await this.render({ parts: ["preview", "footer"] });

      if ( !this.#results.length ) {
        ui.notifications.warn("SIMPLE_SHOP_CRAFT_5E.ShopEditor.GenerateItemNone", { localize: true });
      } else if ( this.#results.length < count ) {
        ui.notifications.info("SIMPLE_SHOP_CRAFT_5E.ShopEditor.GenerateItemPartial", {
          format: { count: this.#results.length, total: count }
        });
      }
    } finally {
      target.disabled = false;
    }
  }

  /* -------------------------------------------- */

  /**
   * Replace an item of the result list with a newly rolled one.
   * @this {GenerateItemDialog}
   * @param {Event} event         Triggering click event.
   * @param {HTMLElement} target  Button that was clicked.
   * @returns {Promise<void>}
   */
  static async #reroll(event, target) {
    const [result] = await this.#rollResults(this.#results.map(({ entry }) => entry), 1);
    if ( !result ) {
      ui.notifications.warn("SIMPLE_SHOP_CRAFT_5E.ShopEditor.GenerateItemNone", { localize: true });
      return;
    }
    this.#results[Number(target.dataset.index)] = result;
    await this.render({ parts: ["preview"] });
  }

  /* -------------------------------------------- */

  /**
   * Remove an item from the result list.
   * @this {GenerateItemDialog}
   * @param {Event} event         Triggering click event.
   * @param {HTMLElement} target  Button that was clicked.
   * @returns {Promise<void>}
   */
  static async #remove(event, target) {
    this.#results.splice(Number(target.dataset.index), 1);
    await this.render({ parts: ["preview", "footer"] });
  }

  /* -------------------------------------------- */

  /**
   * Add the rolled items to the shop and clear the result list.
   * @this {GenerateItemDialog}
   * @returns {Promise<void>}
   */
  static async #add() {
    const count = this.#results.length;
    await this.onGenerated(this.#results.map(({ entry }) => entry));
    this.#results = [];
    this.#pool = null;
    this._debouncedRefreshPool();
    await this.render({ parts: ["preview", "footer"] });
    ui.notifications.info("SIMPLE_SHOP_CRAFT_5E.ShopEditor.GenerateItemAdded", { format: { count } });
  }
}

/* -------------------------------------------- */

/**
 * Read a multi-select field's submitted values, with the "Any" sentinel stripped.
 * @param {object} data
 * @param {string} key
 * @returns {string[]}
 */
function parseMultiSelect(data, key) {
  return (data[key] ?? []).filter(value => value !== ANY_VALUE);
}
