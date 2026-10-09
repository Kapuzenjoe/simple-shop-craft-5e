import {
  DEFAULT_STOCK_BY_TYPE, defaultStockKey, LEGACY_IDENTIFIERS, MODULE_ID, SETTING_KEYS, STARTER_PACKS, STARTER_SOURCES
} from "../../config.mjs";
import { newEntryStock, Shop } from "../../data/shop-data.mjs";
import { bulkFromUuid, itemRef } from "../../utils.mjs";
import ShopSheet from "./shop-sheet.mjs";

const { Dialog5e } = game.dnd5e.applications.api;

/**
 * @import ShopManager from "../shop-manager.mjs";
 */

/**
 * Dialog to create a new shop: name/starter-pack prompt, then opens the full edit view.
 */
export default class ShopCreateDialog extends Dialog5e {
  constructor({ shopManager, ...options }={}) {
    super(options);
    this.shopManager = shopManager;
  }

  /* -------------------------------------------- */

  /** @override */
  static DEFAULT_OPTIONS = {
    id: "shop-create-dialog-{id}",
    classes: ["simple-shop-craft-5e", "shop-create-dialog", "standard-form"],
    window: { title: "SIMPLE_SHOP_CRAFT_5E.ShopManager.Shops.Create" },
    position: { width: 400 },
    buttons: [
      { action: "create", label: "SIMPLE_SHOP_CRAFT_5E.ShopManager.Shops.Create", icon: "fas fa-plus", default: true }
    ],
    form: { handler: ShopCreateDialog.#onSubmit }
  };

  /* -------------------------------------------- */

  /** @override */
  static PARTS = {
    ...super.PARTS,
    content: { template: "modules/simple-shop-craft-5e/templates/shared/config-dialog-content.hbs" }
  };

  /* -------------------------------------------- */

  /**
   * The shop manager this dialog was opened from.
   * @type {ShopManager}
   */
  shopManager;

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareContentContext(context, options) {
    context = await super._prepareContentContext(context, options);
    context.legend = this.options.window?.title;
    const starterPackOptions = [
      { value: "", label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopManager.Shops.Empty") },
      ...getStarterPackOptions()
    ];
    context.fields = [
      {
        field: new foundry.data.fields.StringField(), name: "starterPack",
        label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopManager.Shops.StarterPack"), options: starterPackOptions
      },
      {
        field: new foundry.data.fields.StringField(), name: "name",
        label: _loc("SIMPLE_SHOP_CRAFT_5E.Shop")
      }
    ];
    return context;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onChangeForm(formConfig, event) {
    super._onChangeForm(formConfig, event);
    if ( event.target.name !== "starterPack" ) return;
    const name = this.element.querySelector('input[name="name"]');
    name.placeholder = event.target.value ? (event.target.selectedOptions[0]?.text ?? "") : "";
  }

  /* -------------------------------------------- */

  /**
   * Handle creating the shop and opening its full edit view.
   * @this {ShopCreateDialog}
   * @param {Event} event                Triggering submit event.
   * @param {HTMLFormElement} form       The submitted form.
   * @param {FormDataExtended} formData  Data from the form.
   * @returns {Promise<void>}
   */
  static async #onSubmit(event, form, formData) {
    const data = foundry.utils.expandObject(formData.object);
    const packs = getStarterPackOptions();
    const modern = game.dnd5e.settings.rulesVersion === "modern";
    const identifiers = (STARTER_PACKS[data.starterPack]?.items ?? [])
      .map(identifier => modern ? identifier : (LEGACY_IDENTIFIERS[identifier] ?? identifier));
    const byIdentifier = identifiers.length ? await getStarterUuids(modern) : new Map();
    const uuids = identifiers.map(identifier => byIdentifier.get(identifier)).filter(_ => _);
    const documents = await bulkFromUuid(uuids);
    const items = uuids.map(uuid => documents.get(uuid)).filter(_ => _);
    const stockDefaults = {
      byType: Object.fromEntries(
        Object.keys(DEFAULT_STOCK_BY_TYPE).map(type => [type, game.settings.get(MODULE_ID, defaultStockKey(type))])
      ),
      magicRule: game.settings.get(MODULE_ID, SETTING_KEYS.DEFAULT_STOCK_MAGIC_RULE)
    };
    const goldPool = game.settings.get(MODULE_ID, SETTING_KEYS.DEFAULT_GOLD_POOL);
    const newShop = {
      name: data.name || packs.find(p => p.value === data.starterPack)?.label
        || _loc("SIMPLE_SHOP_CRAFT_5E.ShopManager.Shops.Create"),
      buyModifier: game.settings.get(MODULE_ID, SETTING_KEYS.DEFAULT_BUY_MODIFIER),
      sellModifier: game.settings.get(MODULE_ID, SETTING_KEYS.DEFAULT_SELL_MODIFIER),
      goldPool: { max: { gp: goldPool }, current: { gp: goldPool }, unlimited: false },
      stockDefaults,
      items: items.map(item => ({ ...itemRef(item), ...newEntryStock(item, stockDefaults) }))
    };
    const created = await Shop.create(newShop);
    this.shopManager.render();
    new ShopSheet({ shopId: created._id }).render({ force: true, mode: ShopSheet.MODES.EDIT });
    await this.close();
  }
}

/* -------------------------------------------- */

/**
 * Get the UUIDs of the items offered to starter packs, from the first compendium that has them.
 * @param {boolean} modern  Whether the world uses the modern rules.
 * @returns {Promise<Map<string, string>>}  Identifier of the item mapped to its UUID.
 */
async function getStarterUuids(modern) {
  const rules = modern ? "modern" : "legacy";
  const packs = STARTER_SOURCES[rules].map(name => game.packs.get(name)).filter(_ => _);
  const byIdentifier = new Map();
  for ( const pack of packs ) {
    for ( const entry of await pack.getIndex({ fields: ["system.container", "system.identifier"] }) ) {
      if ( entry.system?.container || !CONFIG.Item.dataModels[entry.type]?.inventorySection ) continue;
      const identifier = entry.system?.identifier || game.dnd5e.utils.formatIdentifier(entry.name);
      if ( !byIdentifier.has(identifier) ) byIdentifier.set(identifier, entry.uuid);
    }
  }
  return byIdentifier;
}

/* -------------------------------------------- */

/**
 * Get the localized label/value pairs for the starter pack selection dropdown.
 * @returns {{ value: string, label: string }[]}
 */
function getStarterPackOptions() {
  return Object.entries(STARTER_PACKS).map(([value, pack]) => ({ value, label: _loc(pack.label) }));
}
