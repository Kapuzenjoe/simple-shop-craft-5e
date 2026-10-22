import { EnchantedItemBlueprint } from "../../data/enchanted-item-blueprint.mjs";
import GeneratorProfile from "../../data/generator-profile.mjs";
import { ShopItemEntry } from "../../data/shop-data.mjs";
import { SpellScrollBlueprint } from "../../data/spell-scroll-blueprint.mjs";
import { itemRef, resolveItemPrice, toCopper } from "../../utils.mjs";
import ConfigureTemplatesDialog from "./configure-templates-dialog.mjs";

const { Dialog5e } = game.dnd5e.applications.api;
const { DocumentUUIDField, StringField } = foundry.data.fields;

/**
 * @import { GeneratorCandidate } from "../../_types.mjs";
 * @import ShopSheet from "./shop-sheet.mjs";
 */

/**
 * Dialog to draw items from a RollTable and add them to a shop's stock.
 * @param {object} options
 * @param {ShopSheet} options.shopSheet
 * @param {(entries: object[]) => Promise<void>} options.onFilled
 */
export default class FillFromTableDialog extends Dialog5e {
  constructor({ shopSheet, onFilled, ...options }={}) {
    super(options);
    this.shopSheet = shopSheet;
    this.onFilled = onFilled;
  }

  /* -------------------------------------------- */

  /** @override */
  static DEFAULT_OPTIONS = {
    id: "fill-from-table-dialog-{id}",
    classes: ["simple-shop-craft-5e", "fill-from-table-dialog", "standard-form"],
    window: { title: "SIMPLE_SHOP_CRAFT_5E.ShopEditor.FillFromTable" },
    position: { width: 400 },
    buttons: [
      { action: "fill", label: "SIMPLE_SHOP_CRAFT_5E.ShopEditor.FillFromTable", icon: "fas fa-table-list", default: true }
    ],
    form: { handler: FillFromTableDialog.#onSubmit }
  };

  /* -------------------------------------------- */

  /** @override */
  static PARTS = {
    ...super.PARTS,
    content: { template: "modules/simple-shop-craft-5e/templates/shared/config-dialog-content.hbs" }
  };

  /* -------------------------------------------- */

  /**
   * The shop editor this dialog was opened from.
   * @type {ShopSheet}
   */
  shopSheet;

  /* -------------------------------------------- */

  /**
   * Callback receiving the resolved item entries.
   * @type {(entries: object[]) => Promise<void>}
   */
  onFilled;

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareContentContext(context, options) {
    context = await super._prepareContentContext(context, options);
    context.legend = this.options.window?.title;
    context.extraContent = `<p class="note warn">${_loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.FillFromTableExhaustedHint")}</p>`;
    context.fields = [
      {
        field: new DocumentUUIDField({ type: "RollTable", required: true }), name: "table",
        label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.FillFromTableTable")
      },
      {
        field: new StringField({ initial: "1", required: true, blank: false }), name: "formula",
        label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.FillFromTableCount"),
        hint: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.FillFromTableCountHint")
      },
      {
        field: new StringField({
          choices: {
            manual: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.FillFromTableTemplatesManual"),
            random: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.FillFromTableTemplatesRandom")
          },
          initial: "manual", required: true, blank: false
        }), name: "templates",
        label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.FillFromTableTemplates"),
        hint: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.FillFromTableTemplatesHint")
      }
    ];
    return context;
  }

  /* -------------------------------------------- */

  /**
   * Handle drawing from the selected table and adding the resolved items to the shop's stock. A new item
   * is excluded from restock with current stock set to how many times it was drawn; an item already in
   * the shop's Buy tab just has its current stock increased by that count, restock mode and max left untouched.
   * @this {FillFromTableDialog}
   * @param {Event} event                Triggering submit event.
   * @param {HTMLFormElement} form       The submitted form.
   * @param {FormDataExtended} formData  Data from the form.
   * @returns {Promise<void>}
   */
  static async #onSubmit(event, form, formData) {
    const data = foundry.utils.expandObject(formData.object);
    const table = await fromUuid(data.table);
    if ( !table ) return;
    const roll = await new Roll(data.formula).evaluate({ allowInteractive: false });
    if ( roll.total <= 0 ) return;

    const { results } = await table.drawMany(roll.total, { displayChat: false });
    const drawnItems = await Promise.all(
      results.filter(r => r.type === "document").map(r => fromUuid(r.documentUuid))
    );

    const settlementCap = this.shopSheet.shop.settlementCap;
    const capCP = settlementCap?.value != null ? toCopper(settlementCap.value, settlementCap.denomination) : null;

    const counted = new Map();
    const templates = [];
    let skipped = 0;
    for ( const item of drawnItems ) {
      if ( !CONFIG.Item.dataModels[item?.type]?.inventorySection ) {
        skipped++;
        continue;
      }
      if ( capCP != null ) {
        const price = resolveItemPrice(item);
        if ( price && (toCopper(price.value, price.denomination) > capCP) ) {
          skipped++;
          continue;
        }
      }
      if ( SpellScrollBlueprint.isSpellScrollItem(item) ) {
        templates.push({ kind: "spellScroll", item });
        continue;
      }
      if ( EnchantedItemBlueprint.isEnchantItem(item) ) {
        templates.push({ kind: "enchant", item });
        continue;
      }
      const entry = itemRef(item);
      const key = ShopItemEntry.key(entry, item);
      const existing = counted.get(key);
      if ( existing ) existing.count++;
      else counted.set(key, { key, entry, label: item.name, count: 1 });
    }
    const rolled = Array.from(counted.values());

    if ( !rolled.length && !templates.length ) {
      ui.notifications.warn("SIMPLE_SHOP_CRAFT_5E.ShopEditor.FillFromTableNone", { localize: true });
      return;
    }

    const inShop = await ShopItemEntry.byKey(this.shopSheet.shop.items.filter(i => !i.isService));
    if ( templates.length ) await this.#addTemplates(templates, data.templates, new Set(inShop.keys()));
    if ( !rolled.length ) {
      await this.close();
      return;
    }
    await this.onFilled(rolled.map(({ key, entry, count }) => {
      const existing = inShop.get(key);
      if ( existing ) {
        return { ...existing.toObject(), stock: { ...existing.stock, current: (existing.stock.current ?? 0) + count } };
      }
      return { ...entry, stock: { max: null, current: count }, restockMode: "exclude" };
    }));
    const [key, format] = skipped
      ? ["SIMPLE_SHOP_CRAFT_5E.ShopEditor.FillFromTablePartial", { count: rolled.length, skipped }]
      : (rolled.length === 1)
        ? ["SIMPLE_SHOP_CRAFT_5E.ShopEditor.FillFromTableResult", { name: rolled[0].label }]
        : ["SIMPLE_SHOP_CRAFT_5E.ShopEditor.FillFromTableResultMultiple", { count: rolled.length }];
    ui.notifications.info(key, { format });
    await this.close();
  }

  /* -------------------------------------------- */

  /**
   * Add the drawn Spell Scroll and enchantment templates to the shop, either configured manually or resolved at
   * random. Templates that can't be resolved at random are configured manually instead.
   * @param {{ kind: "spellScroll"|"enchant", item: Item5e }[]} templates
   * @param {string} mode                Either `manual` or `random`.
   * @param {Set<string>} existingKeys   Entry keys already present in the shop's Buy tab.
   * @returns {Promise<void>}
   */
  async #addTemplates(templates, mode, existingKeys) {
    let manual = templates;
    if ( mode === "random" ) {
      manual = [];
      const profile = new GeneratorProfile();
      const entries = [];
      for ( const template of templates ) {
        const candidates = await getCandidates(template);
        const [result] = await profile.roll({
          existingKeys, stockDefaults: this.shopSheet.shop.stockDefaults, pool: { candidates }, count: 1
        });
        if ( !result ) {
          manual.push(template);
          continue;
        }
        existingKeys.add(ShopItemEntry.key(result.entry));
        entries.push(result.entry);
      }
      if ( entries.length ) await this.onFilled(entries);
      if ( manual.length ) {
        ui.notifications.warn("SIMPLE_SHOP_CRAFT_5E.ShopEditor.FillFromTableRandomFailed", { localize: true });
      }
    }
    if ( !manual.length ) return;
    new ConfigureTemplatesDialog({
      templates: manual, isService: false, onSubmit: this.onFilled
    }).render({ force: true });
  }
}

/* -------------------------------------------- */

/**
 * Build the candidates the generator can draw from to resolve a template at random.
 * @param {{ kind: "spellScroll"|"enchant", item: Item5e }} template
 * @returns {Promise<GeneratorCandidate[]>}  Empty if the template can't be resolved.
 */
async function getCandidates({ kind, item }) {
  if ( kind === "spellScroll" ) {
    const [level] = Object.entries(CONFIG.DND5E.spellScrollIds).find(([, uuid]) => uuid === item.uuid) ?? [];
    if ( level === undefined ) return [];
    const spells = await GeneratorProfile.fetchEnspelledSpells("spell-scroll", Number(level));
    return spells.map(index => ({ kind: "spell", index, weight: 1 }));
  }
  const profiles = await Promise.all(EnchantedItemBlueprint.getEnchantmentProfiles(item)
    .map(async profile => ({
      ...profile, weight: 1, baseItems: await EnchantedItemBlueprint.listEnchantableBaseItems(profile.activity)
    })));
  const open = profiles.filter(profile => profile.baseItems.length);
  return open.length ? [{ kind: "template", item, profiles: open, weight: 1 }] : [];
}
