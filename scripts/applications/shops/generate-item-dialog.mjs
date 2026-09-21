import GeneratorProfile from "../../data/generator-profile.mjs";
import { ShopItemEntry } from "../../data/shop-data.mjs";
import { subtypeOptions } from "../../utils.mjs";

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
 * subtype restriction, a global rarity/magic filter, an optional spell-scroll filter, a weighting, and a count.
 * A preview beside the filters summarizes the pool the settings draw from.
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
      { action: "generate", label: "SIMPLE_SHOP_CRAFT_5E.ShopEditor.GenerateItemRoll", icon: "fa-solid fa-dice-d20", default: true }
    ],
    actions: {
      generate: GenerateItemDialog.#generate
    }
  };

  /* -------------------------------------------- */

  /** @override */
  static PARTS = {
    content: { template: "modules/simple-shop-craft-5e/templates/shops/generate-item-dialog/content.hbs" },
    preview: { template: "modules/simple-shop-craft-5e/templates/shops/generate-item-dialog/preview.hbs" },
    settings: { template: "modules/simple-shop-craft-5e/templates/shops/generate-item-dialog/settings.hbs" },
    footer: super.PARTS.footer
  };

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
   * Build the pool of the current settings and show its preview, unless the settings changed in the meantime.
   * @type {Function}
   */
  #refreshPool = foundry.utils.debounce(async () => {
    const profile = this.#profile;
    const pool = await profile.buildPool(this.shopSheet.shop.settlementCap);
    if ( profile !== this.#profile ) return;
    this.#pool = pool;
    await this.render({ parts: ["preview"] });
  }, 300);

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /** @inheritDoc */
  async _onFirstRender(context, options) {
    await super._onFirstRender(context, options);
    this.#refreshPool();
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _preparePartContext(partId, context, options) {
    context = await super._preparePartContext(partId, context, options);
    if ( partId === "preview" ) context = await this._preparePreviewContext(context, options);
    if ( partId === "settings" ) context = await this._prepareSettingsContext(context, options);
    return context;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareContentContext(context, options) {
    context = await super._prepareContentContext(context, options);

    const typeOptions = Object.keys(CONFIG.Item.dataModels)
      .filter(type => CONFIG.Item.dataModels[type]?.inventorySection)
      .map(type => ({ value: type, label: _loc(`TYPES.Item.${type}Pl`) }));

    context.typeFields = [{
      field: new foundry.data.fields.SetField(new foundry.data.fields.StringField()), name: "types",
      label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.GenerateItemType"), value: Object.keys(this.#profile.types),
      options: typeOptions
    }];

    context.typeFieldsets = Object.keys(this.#profile.types)
      .toSorted((a, b) => (CONFIG.Item.dataModels[a]?.inventorySection?.order ?? Infinity)
        - (CONFIG.Item.dataModels[b]?.inventorySection?.order ?? Infinity))
      .map(type => {
        const selected = this.#profile.types[type];
        return {
          label: _loc(`TYPES.Item.${type}Pl`),
          fields: [{
            field: new foundry.data.fields.SetField(new foundry.data.fields.StringField()), name: `subtypes.${type}`,
            label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.GenerateItemSubtype"),
            value: selected.size ? Array.from(selected) : [ANY_VALUE],
            options: [
              { value: ANY_VALUE, label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.GenerateItemAny") },
              ...subtypeOptions([type])
            ]
          }]
        };
      });

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
   * Prepare rendering context for the settings part.
   * @param {ApplicationRenderContext} context  Context being prepared.
   * @param {HandlebarsRenderOptions} options   Options which configure application rendering behavior.
   * @returns {Promise<ApplicationRenderContext>}
   * @protected
   */
  async _prepareSettingsContext(context, options) {
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
    if ( !this.#pool ) return context;
    const { included, capped } = this.#pool.summary;
    const total = Object.values(included).reduce((sum, count) => sum + count, 0);
    const weights = {};
    for ( const { kind, weight } of this.#pool.candidates ) weights[kind] = (weights[kind] ?? 0) + weight;
    const totalWeight = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
    context.pool = {
      total,
      capped: Object.values(capped).reduce((sum, count) => sum + count, 0),
      rarities: ["", ...Object.keys(CONFIG.DND5E.itemRarity)]
        .filter(rarity => included[rarity] || capped[rarity])
        .map(rarity => ({
          label: rarity ? CONFIG.DND5E.itemRarity[rarity].capitalize()
            : _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.GenerateItemMundane"),
          count: included[rarity] ?? 0,
          capped: capped[rarity] ?? 0,
          percent: total ? Math.round(((included[rarity] ?? 0) / total) * 100) : 0
        })),
      chances: ["item", "template", "spell"]
        .filter(kind => weights[kind])
        .map(kind => ({
          label: _loc(`SIMPLE_SHOP_CRAFT_5E.ShopEditor.GenerateItemPoolKind${kind.capitalize()}`),
          percent: Math.round((weights[kind] / totalWeight) * 100)
        }))
    };
    return context;
  }

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers                */
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
      rarities: parseMultiSelect(data, "rarities").map(r => r === "mundane" ? "" : r),
      magic: data.magic || ANY_VALUE,
      weighting: data.weighting,
      spellFilter: {
        schools: parseMultiSelect(data, "schools"),
        classes: parseMultiSelect(data, "classes"),
        levels: parseMultiSelect(data, "levels").map(Number),
        ritualOnly: !!data.ritualOnly
      },
      count: Math.clamp(Number(data.count) || 1, 1, 10)
    });
    this.#pool = null;
    this.#refreshPool();
    await this.render({ parts: ["content", "settings", "preview", "footer"] });
  }

  /* -------------------------------------------- */

  /**
   * Roll and add the generated entries.
   * @this {GenerateItemDialog}
   * @param {Event} event         Triggering click event.
   * @param {HTMLElement} target  Button that was clicked.
   * @returns {Promise<void>}
   */
  static async #generate(event, target) {
    target.disabled = true;
    try {
      const { count } = this.#profile;
      const existingKeys = new Set(this.shopSheet.shop.items.map(i => ShopItemEntry.key(i)));

      const { settlementCap, stockDefaults } = this.shopSheet.shop;
      const rolled = await this.#profile.roll({ existingKeys, settlementCap, stockDefaults, pool: this.#pool });

      if ( !rolled.length ) {
        ui.notifications.warn("SIMPLE_SHOP_CRAFT_5E.ShopEditor.GenerateItemNone", { localize: true });
        return;
      }

      await this.onGenerated(rolled.map(r => r.entry));
      const [key, format] = (rolled.length === 1)
        ? ["SIMPLE_SHOP_CRAFT_5E.ShopEditor.GenerateItemResult", { name: rolled[0].label }]
        : (rolled.length === count)
          ? ["SIMPLE_SHOP_CRAFT_5E.ShopEditor.GenerateItemResultMultiple", { count: rolled.length }]
          : ["SIMPLE_SHOP_CRAFT_5E.ShopEditor.GenerateItemPartial", { count: rolled.length, total: count }];
      ui.notifications.info(key, { format });
    } finally {
      target.disabled = false;
    }
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
