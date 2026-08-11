import { SETTLEMENT_CAPS } from "../config.mjs";
import { Shop, ShopItemEntry } from "../data/shop-data.mjs";
import { currencyRows, goldPoolCurrencies } from "../shop/currency.mjs";
import { entryKey, resolveShopItems } from "../shop/item-resolver.mjs";
import { getCurrencyOptions } from "../utils.mjs";

import BaseConfigDialog from "./base-config-dialog.mjs";

/**
 * Open a small dialog to edit an item's price-modifier override.
 * @param {ShopSheet} shopSheet
 * @param {HTMLElement} target  Element that was clicked.
 * @param {{ buy: number|null, sell: number|null }} playerOverride  Acting actor's discount override, if any.
 * @param {(patch: object) => Promise<void>} onUpdate
 * @returns {Promise<void>}
 */
export async function openDiscountDialog(shopSheet, target, playerOverride, onUpdate) {
  const key = target.dataset.key;
  const entry = shopSheet.shop.items.find(i => entryKey(i) === key);
  const effectiveDefault = shopSheet.shop.buyModifier + (playerOverride.buy ?? 0);

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
        await onUpdate({ items });
      }
    }
  });
  await dialog.render({ force: true });
}

/* -------------------------------------------- */

/**
 * Open a dialog to edit the shop's maximum money pool.
 * @param {ShopSheet} shopSheet
 * @param {(patch: object) => Promise<void>} onUpdate
 * @returns {Promise<void>}
 */
export async function openGoldPoolDialog(shopSheet, onUpdate) {
  const goldPool = shopSheet.shop.goldPool;
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
        await onUpdate({
          goldPool: { ...shopSheet.shop.goldPool, max, unlimited: !!data.unlimited }
        });
      }
    }
  });
  await dialog.render({ force: true });
}

/* -------------------------------------------- */

/**
 * Open the file picker to change a shop's image.
 * @param {ShopSheet} shopSheet
 * @param {HTMLElement} target  The `<img data-edit="img">` element that was clicked.
 * @returns {Promise<void>}
 */
export async function openImageDialog(shopSheet, target) {
  const fp = new foundry.applications.apps.FilePicker.implementation({
    current: shopSheet.shop.img,
    type: "image",
    redirectToRoot: [Shop.DEFAULT_ICON],
    callback: path => {
      target.src = path;
      if ( shopSheet.options.form.submitOnChange ) {
        shopSheet.form.dispatchEvent(new Event("submit", { cancelable: true }));
      }
    },
    position: { top: shopSheet.position.top + 40, left: shopSheet.position.left + 10 }
  });
  await fp.browse();
}

/* -------------------------------------------- */

/**
 * Open a small dialog to edit an item's stock max (restock target) and current stock together.
 * @param {ShopSheet} shopSheet
 * @param {HTMLElement} target  Element that was clicked.
 * @param {(patch: object) => Promise<void>} onUpdate
 * @returns {Promise<void>}
 */
export async function openMaxStockDialog(shopSheet, target, onUpdate) {
  const key = target.dataset.key;
  const entry = shopSheet.shop.items.find(i => entryKey(i) === key);
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
 * @param {(patch: object) => Promise<void>} onUpdate
 * @returns {Promise<void>}
 */
export async function openModifiersDialog(shopSheet, onUpdate) {
  const fields = Shop.schema.fields;
  const lootTypeOptions = Object.entries(CONFIG.DND5E.lootTypes).map(([value, cfg]) => ({ value, label: cfg.label }));

  const dialog = new BaseConfigDialog({
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
 * @param {(patch: object) => Promise<void>} onUpdate
 * @returns {Promise<void>}
 */
export async function openOwnerDialog(shopSheet, onUpdate) {
  const dialog = new BaseConfigDialog({
    window: { title: "SIMPLE_SHOP_CRAFT_5E.ShopEditor.Owner" },
    fields: [
      {
        field: Shop.schema.fields.npc, name: "npc", value: shopSheet.shop.npc ?? "",
        label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.Owner")
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
 * Open a dialog to manage a shop's per-player discount overrides and haggling locks.
 * @param {ShopSheet} shopSheet
 * @param {(patch: object) => Promise<void>} onUpdate
 * @param {(actorUuid: string, patch: object) => Promise<void>} onPatchPlayerDiscount
 * @returns {Promise<void>}
 */
export async function openPlayersDialog(shopSheet, onUpdate, onPatchPlayerDiscount) {
  const buildRows = actorUuids => actorUuids.map((uuid, index) => {
    const existing = shopSheet.shop.playerDiscounts.find(pd => pd.actor === uuid);
    const actor = fromUuidSync(uuid);
    return {
      index, actorUuid: uuid, actorImg: actor?.img, actorName: actor?.name,
      buyModifier: existing?.buyModifier ?? null, sellModifier: existing?.sellModifier ?? null,
      hagglingLocked: !!existing?.hagglingLocked,
      template: "modules/simple-shop-craft-5e/templates/shop-sheet/players-dialog-row.hbs"
    };
  });

  const dialog = new BaseConfigDialog({
    window: { title: "SIMPLE_SHOP_CRAFT_5E.ShopEditor.Tabs.Players" },
    autoRerender: false,
    state: { actorUuids: shopSheet.shop.playerDiscounts.map(pd => pd.actor) },
    extraContent: async formState => {
      const rows = buildRows(formState.actorUuids);
      const tableHtml = await foundry.applications.handlebars.renderTemplate(
        "modules/simple-shop-craft-5e/templates/partials/item-table.hbs",
        {
          hasRows: rows.length > 0,
          emptyLabel: "SIMPLE_SHOP_CRAFT_5E.ShopEditor.Players.None",
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
        + `data-drop-hint="${_loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.Players.DropHint")}"></document-tags>`;
    },
    onRender: app => {
      const persistPlayerList = async () => {
        const existing = new Map(shopSheet.shop.playerDiscounts.map(pd => [pd.actor, pd]));
        const playerDiscounts = app.formState.actorUuids.map(uuid => ({
          actor: uuid,
          buyModifier: existing.get(uuid)?.buyModifier ?? null,
          sellModifier: existing.get(uuid)?.sellModifier ?? null,
          hagglingLocked: existing.get(uuid)?.hagglingLocked ?? false,
          hagglingTimestamp: existing.get(uuid)?.hagglingTimestamp ?? null
        }));
        await onUpdate({ playerDiscounts });
      };

      const tags = app.element.querySelector('document-tags[name="newPlayerActors"]');
      tags?.addEventListener("change", async () => {
        const uuids = Array.from(new Set([...app.formState.actorUuids, ...tags.value]));
        app.formState = { actorUuids: uuids };
        await persistPlayerList();
        app.render({ parts: ["content"] });
      });
      app.element.querySelector(".item-list")?.addEventListener("click", async event => {
        const removeButton = event.target.closest('[data-action="removePlayerDiscount"]');
        if ( removeButton ) {
          const uuid = removeButton.closest("li")?.dataset.actorUuid;
          app.formState = { actorUuids: app.formState.actorUuids.filter(u => u !== uuid) };
          await persistPlayerList();
          app.render({ parts: ["content"] });
          return;
        }
        const unlockButton = event.target.closest('[data-action="resetHaggling"]');
        if ( unlockButton ) {
          const uuid = unlockButton.closest("li")?.dataset.actorUuid;
          await onPatchPlayerDiscount(uuid, { hagglingLocked: false, hagglingTimestamp: null });
          app.render({ parts: ["content"] });
        }
      });
    },
    form: {
      handler: async (event, form, formData) => {
        const data = foundry.utils.expandObject(formData.object);
        const existing = new Map(shopSheet.shop.playerDiscounts.map(pd => [pd.actor, pd]));
        const playerDiscounts = Object.values(data.playerDiscounts ?? {}).map(row => ({
          actor: row.actor,
          buyModifier: ((row.buy === "") || (row.buy == null)) ? null : Number(row.buy),
          sellModifier: ((row.sell === "") || (row.sell == null)) ? null : Number(row.sell),
          hagglingLocked: existing.get(row.actor)?.hagglingLocked ?? false,
          hagglingTimestamp: existing.get(row.actor)?.hagglingTimestamp ?? null
        }));
        await onUpdate({ playerDiscounts });
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
 * @param {(patch: object) => Promise<void>} onUpdate
 * @returns {Promise<void>}
 */
export async function openPriceDialog(shopSheet, target, onUpdate) {
  const key = target.dataset.key;
  const entry = shopSheet.shop.items.find(i => entryKey(i) === key);
  const item = (await resolveShopItems([entry]))[0]?.item;
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
 * @param {(patch: object) => Promise<void>} onUpdate
 * @returns {Promise<void>}
 */
export async function openRenameDialog(shopSheet, onUpdate) {
  const dialog = new BaseConfigDialog({
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

/* -------------------------------------------- */

/**
 * Open a dialog to edit the shop's settlement cap.
 * @param {ShopSheet} shopSheet
 * @param {(patch: object) => Promise<void>} onUpdate
 * @returns {Promise<void>}
 */
export async function openSettlementCapDialog(shopSheet, onUpdate) {
  const settlementCap = shopSheet.shop.settlementCap;
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
        const denomination = (data.settlementCapPreset === "custom")
          ? (data.settlementCapDenomination || CONFIG.DND5E.defaultCurrency) : CONFIG.DND5E.defaultCurrency;
        await onUpdate({ settlementCap: { value, denomination } });
      }
    }
  });
  await dialog.render({ force: true });
}
