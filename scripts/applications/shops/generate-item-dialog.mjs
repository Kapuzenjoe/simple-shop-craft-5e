import { ShopItemEntry } from "../../data/shop-data.mjs";
import { subtypeOptions } from "../../utils.mjs";

/**
 * @import { ShopItemEntryData } from "../../_types.mjs";
 * @import { default as ShopSheet } from "./shop-sheet.mjs";
 */

const { Dialog5e } = game.dnd5e.applications.api;

/**
 * Sentinel value meaning "no restriction on this axis" in a multi-select field.
 * @type {string}
 */
const ANY_VALUE = "any";

/**
 * GM-facing dialog to roll random shop item entries: multi-select item types, each with its own
 * subtype restriction, a global rarity/magic filter, an optional spell-scroll filter, and a count.
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
    position: { width: 420, height: "auto" },
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
    },
    shopSheet: null,
    onGenerated: null
  };

  /* -------------------------------------------- */

  /** @override */
  static PARTS = {
    ...super.PARTS,
    content: { template: "modules/simple-shop-craft-5e/templates/generate-item-dialog/content.hbs" }
  };

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
   * Selected item types.
   * @type {Set<string>}
   */
  #types = new Set();

  /* -------------------------------------------- */

  /**
   * Selected subtypes per type. An empty (or absent) Set for a type means "Any" — no restriction.
   * @type {Map<string, Set<string>>}
   */
  #subtypesByType = new Map();

  /* -------------------------------------------- */

  /**
   * Selected rarities; empty means "Any".
   * @type {Set<string>}
   */
  #rarities = new Set();

  /* -------------------------------------------- */

  /**
   * Magic/Mundane filter.
   * @type {"any"|"magic"|"mundane"}
   */
  #magic = ANY_VALUE;

  /* -------------------------------------------- */

  /**
   * Selected spell schools for scroll generation; empty means "Any".
   * @type {Set<string>}
   */
  #schools = new Set();

  /* -------------------------------------------- */

  /**
   * Whether to restrict scroll generation to rituals only.
   * @type {boolean}
   */
  #ritualOnly = false;

  /* -------------------------------------------- */

  /**
   * Selected spellcasting classes for scroll generation; empty means "Any".
   * @type {Set<string>}
   */
  #classes = new Set();

  /* -------------------------------------------- */

  /**
   * Selected spell levels for scroll generation; empty means "Any".
   * @type {Set<number>}
   */
  #levels = new Set();

  /* -------------------------------------------- */

  /**
   * Number of items to generate in this batch.
   * @type {number}
   */
  #count = 1;

  /* -------------------------------------------- */

  /**
   * Whether the consumable type is selected with its subtypes narrowed to scrolls, showing the
   * spell-scroll filter fieldset.
   * @type {boolean}
   */
  get #showSpellFilter() {
    return this.#types.has("consumable") && (this.#subtypesByType.get("consumable")?.has("scroll") ?? false);
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
      label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.GenerateItemType"), value: Array.from(this.#types), options: typeOptions
    }];

    context.typeFieldsets = Array.from(this.#types)
      .toSorted((a, b) => (CONFIG.Item.dataModels[a]?.inventorySection?.order ?? Infinity)
        - (CONFIG.Item.dataModels[b]?.inventorySection?.order ?? Infinity))
      .map(type => {
        const selected = this.#subtypesByType.get(type) ?? new Set();
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

    context.spellFieldset = this.#showSpellFilter ? {
      fields: [
        {
          field: new foundry.data.fields.SetField(new foundry.data.fields.StringField()), name: "schools",
          label: _loc("DND5E.School"),
          value: this.#schools.size ? Array.from(this.#schools) : [ANY_VALUE],
          options: [
            { value: ANY_VALUE, label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.GenerateItemAny") },
            ...Object.entries(CONFIG.DND5E.spellSchools).map(([value, { label }]) => ({ value, label: _loc(label) }))
          ]
        },
        {
          field: new foundry.data.fields.SetField(new foundry.data.fields.StringField()), name: "classes",
          label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.GenerateItemClass"),
          value: this.#classes.size ? Array.from(this.#classes) : [ANY_VALUE],
          options: [
            { value: ANY_VALUE, label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.GenerateItemAny") },
            ...game.dnd5e.registry.spellLists.options.filter(o => o.type === "class")
              .map(o => ({ value: o.value, label: o.label }))
          ]
        },
        {
          field: new foundry.data.fields.SetField(new foundry.data.fields.StringField()), name: "levels",
          label: _loc("DND5E.Level"),
          value: this.#levels.size ? Array.from(this.#levels) : [ANY_VALUE],
          options: [
            { value: ANY_VALUE, label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.GenerateItemAny") },
            ...Object.entries(CONFIG.DND5E.spellLevels).map(([value, label]) => ({ value, label: _loc(label) }))
          ]
        },
        {
          field: new foundry.data.fields.BooleanField(), name: "ritualOnly",
          label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.GenerateItemRitualOnly"), value: this.#ritualOnly
        }
      ]
    } : null;

    context.globalFields = [
      {
        field: new foundry.data.fields.SetField(new foundry.data.fields.StringField()), name: "rarities",
        label: _loc("DND5E.Rarity"),
        value: this.#rarities.size ? Array.from(this.#rarities).map(r => r === "" ? "mundane" : r) : [ANY_VALUE],
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
        label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.GenerateItemMagic"), value: this.#magic,
        options: [
          { value: ANY_VALUE, label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.GenerateItemAny") },
          { value: "magic", label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.GenerateItemMagicOnly") },
          { value: "mundane", label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.GenerateItemMundane") }
        ]
      }
    ];

    context.count = this.#count;
    return context;
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

    this.#types = new Set(data.types ?? []);

    const subtypesByType = new Map();
    for ( const type of this.#types ) subtypesByType.set(type, parseMultiSelect(data.subtypes ?? {}, type));
    this.#subtypesByType = subtypesByType;

    this.#rarities = new Set(Array.from(parseMultiSelect(data, "rarities")).map(r => r === "mundane" ? "" : r));

    this.#magic = data.magic || ANY_VALUE;

    this.#schools = parseMultiSelect(data, "schools");
    this.#ritualOnly = !!data.ritualOnly;

    this.#classes = parseMultiSelect(data, "classes");
    this.#levels = new Set(Array.from(parseMultiSelect(data, "levels")).map(Number));

    this.#count = Math.clamp(Number(data.count) || 1, 1, 10);

    await this.render({ parts: ["content", "footer"] });
  }

  /* -------------------------------------------- */

  /**
   * Roll and add the generated entries.
   * @this {GenerateItemDialog}
   * @returns {Promise<void>}
   */
  static async #generate() {
    const typeConfigs = new Map(Array.from(this.#types).map(type => {
      const subtypes = this.#subtypesByType.get(type);
      return [type, subtypes?.size ? subtypes : null];
    }));
    const spellFilter = this.#showSpellFilter
      ? {
        schools: this.#schools.size ? this.#schools : null, ritualOnly: this.#ritualOnly,
        classes: this.#classes.size ? this.#classes : null, levels: this.#levels.size ? this.#levels : null
      }
      : null;
    const existingKeys = new Set(this.shopSheet.shop.items.map(i => ShopItemEntry.key(i)));

    const rolled = await ShopItemEntry.rollMany({
      typeConfigs, rarities: this.#rarities.size ? this.#rarities : null, magic: this.#magic,
      spellFilter, count: this.#count, existingKeys, settlementCap: this.shopSheet.shop.settlementCap
    });

    if ( !rolled.length ) {
      ui.notifications.warn("SIMPLE_SHOP_CRAFT_5E.ShopEditor.GenerateItemNone", { localize: true });
      return;
    }

    await this.onGenerated(rolled.map(r => r.entry));
    const [key, format] = (rolled.length === 1)
      ? ["SIMPLE_SHOP_CRAFT_5E.ShopEditor.GenerateItemResult", { name: rolled[0].label }]
      : (rolled.length === this.#count)
        ? ["SIMPLE_SHOP_CRAFT_5E.ShopEditor.GenerateItemResultMultiple", { count: rolled.length }]
        : ["SIMPLE_SHOP_CRAFT_5E.ShopEditor.GenerateItemPartial", { count: rolled.length, total: this.#count }];
    ui.notifications.info(key, { format });
  }
}

/* -------------------------------------------- */

/**
 * Read a multi-select field's submitted values into a clean Set, with the "Any" sentinel stripped.
 * @param {object} data
 * @param {string} key
 * @returns {Set<string>}
 */
function parseMultiSelect(data, key) {
  const set = new Set(data[key] ?? []);
  set.delete(ANY_VALUE);
  return set;
}
