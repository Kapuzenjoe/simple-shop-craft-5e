import { Shop, ShopItemEntry } from "../../data/shop-data.mjs";
import { entryKey, resolveShopItems } from "../../shop/entry-resolver.mjs";
import { getCurrencyOptions } from "../../utils.mjs";

import BaseShopConfig from "./base-shop-config.mjs";

/**
 * @import { default as ShopSheet } from "../shop-sheet.mjs";
 */

/**
 * Open a small dialog to edit an item's price-modifier override.
 * @param {ShopSheet} shopSheet
 * @param {HTMLElement} target  Element that was clicked.
 * @param {{ buy: number|null, sell: number|null }} playerOverride  Acting actor's discount override, if any.
 * @param {(updateData: object) => Promise<void>} onUpdate
 * @returns {Promise<void>}
 */
export async function openDiscountConfig(shopSheet, target, playerOverride, onUpdate) {
  const key = target.dataset.key;
  const entry = shopSheet.shop.items.find(i => entryKey(i) === key);
  const effectiveDefault = shopSheet.shop.buyModifier + (playerOverride.buy ?? 0);

  const dialog = new BaseShopConfig({
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
        await onUpdate({ items });
      }
    }
  });
  await dialog.render({ force: true });
}

/* -------------------------------------------- */

/**
 * Open a dialog to edit the shop's buy/sell price modifiers.
 * @param {ShopSheet} shopSheet
 * @param {(updateData: object) => Promise<void>} onUpdate
 * @returns {Promise<void>}
 */
export async function openModifiersConfig(shopSheet, onUpdate) {
  const fields = Shop.schema.fields;
  const lootTypeOptions = Object.entries(CONFIG.DND5E.lootTypes).map(([value, cfg]) => ({ value, label: cfg.label }));

  const dialog = new BaseShopConfig({
    window: { title: "SIMPLE_SHOP_CRAFT_5E.ShopEditor.Discount" },
    fields: [
      {
        field: fields.buyModifier, name: "buyModifier", value: shopSheet.shop.buyModifier,
        input: (field, config) => foundry.applications.fields.createNumberInput(config),
        placeholder: fields.buyModifier.getInitialValue({})
      },
      {
        field: fields.sellModifier, name: "sellModifier", value: shopSheet.shop.sellModifier,
        input: (field, config) => foundry.applications.fields.createNumberInput(config),
        placeholder: fields.sellModifier.getInitialValue({})
      },
      {
        field: fields.fixedValueLootTypes, name: "fixedValueLootTypes",
        value: Array.from(shopSheet.shop.fixedValueLootTypes), options: lootTypeOptions
      }
    ],
    form: {
      handler: async (event, form, formData) => {
        const data = foundry.utils.expandObject(formData.object);
        await onUpdate({
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
 * Open a dialog to edit the shop's owner.
 * @param {ShopSheet} shopSheet
 * @param {(updateData: object) => Promise<void>} onUpdate
 * @returns {Promise<void>}
 */
export async function openOwnerConfig(shopSheet, onUpdate) {
  const dialog = new BaseShopConfig({
    window: { title: "SIMPLE_SHOP_CRAFT_5E.Owner" },
    fields: [
      {
        field: Shop.schema.fields.npc, name: "npc", value: shopSheet.shop.npc ?? "",
        label: _loc("SIMPLE_SHOP_CRAFT_5E.Owner")
      }
    ],
    form: {
      handler: async (event, form, formData) => {
        const data = foundry.utils.expandObject(formData.object);
        await onUpdate({ npc: data.npc || null });
      }
    }
  });
  await dialog.render({ force: true });
}

/* -------------------------------------------- */

/**
 * Open a small dialog to edit an item's price.
 * @param {ShopSheet} shopSheet
 * @param {HTMLElement} target  Element that was clicked.
 * @param {(updateData: object) => Promise<void>} onUpdate
 * @returns {Promise<void>}
 */
export async function openPriceConfig(shopSheet, target, onUpdate) {
  const key = target.dataset.key;
  const entry = shopSheet.shop.items.find(i => entryKey(i) === key);
  const item = (await resolveShopItems([entry]))[0]?.item;
  const priceFields = ShopItemEntry.schema.fields.price.fields;
  const bundleSizeField = ShopItemEntry.schema.fields.bundleSize;

  const dialog = new BaseShopConfig({
    window: { title: "DND5E.Price" },
    fields: [
      {
        field: priceFields.value, name: "value", value: entry.price?.value,
        label: _loc("DND5E.Price"), hint: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.PriceOverrideHint"),
        placeholder: item?.system?.price?.value
      },
      {
        field: priceFields.denomination, name: "denomination",
        value: entry.price?.denomination ?? item?.system?.price?.denomination ?? CONFIG.DND5E.defaultCurrency,
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
        await onUpdate({ items });
      }
    }
  });
  await dialog.render({ force: true });
}

/* -------------------------------------------- */

/**
 * Open a dialog to rename this shop.
 * @param {ShopSheet} shopSheet
 * @param {(updateData: object) => Promise<void>} onUpdate
 * @returns {Promise<void>}
 */
export async function openRenameConfig(shopSheet, onUpdate) {
  const dialog = new BaseShopConfig({
    window: { title: "SIMPLE_SHOP_CRAFT_5E.ShopEditor.RenameShop" },
    fields: [
      { field: Shop.schema.fields.name, name: "name", value: shopSheet.shop.name }
    ],
    form: {
      handler: async (event, form, formData) => {
        const data = foundry.utils.expandObject(formData.object);
        await onUpdate({ name: data.name || shopSheet.shop.name });
      }
    }
  });
  await dialog.render({ force: true });
}
