import { rollShopItem } from "../shop/generator.mjs";
import { entryKey } from "../shop/item-resolver.mjs";
import { subtypeOptions } from "../utils.mjs";

import BasePromptDialog from "./base-prompt-dialog.mjs";

/**
 * Open the magic item generator dialog for a shop, rolling one random entry from its submission and
 * handing it to the caller to persist.
 * @param {ShopSheet} shopSheet
 * @param {(entries: ShopItemEntryData[]) => Promise<void>} onGenerated
 * @returns {Promise<void>}
 */
export async function openGenerateItemDialog(shopSheet, onGenerated) {
  const typeOptions = Object.keys(CONFIG.Item.dataModels)
    .filter(type => CONFIG.Item.dataModels[type]?.inventorySection)
    .map(type => ({ value: type, label: _loc(`TYPES.Item.${type}Pl`) }));
  const rarityOptions = [
    { value: "mundane", label: _loc("DND5E.ItemRarityMundane").capitalize() },
    ...Object.entries(CONFIG.DND5E.itemRarity)
      .filter(([value]) => value !== "artifact")
      .map(([value, label]) => ({ value, label: label.capitalize() }))
  ];

  let dialog;
  const liveValues = name => Array.from(dialog?.element?.querySelector(`[name="${name}"]`)?.value ?? []);
  const buildFields = () => {
    const selectedTypes = liveValues("types");
    const subtypeOpts = subtypeOptions(selectedTypes.length ? selectedTypes : typeOptions.map(o => o.value));
    return [
      {
        field: new foundry.data.fields.SetField(new foundry.data.fields.StringField()), name: "types",
        label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.GenerateItemType"), value: selectedTypes, options: typeOptions
      },
      {
        field: new foundry.data.fields.SetField(new foundry.data.fields.StringField()), name: "rarities",
        label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.GenerateItemRarity"), value: liveValues("rarities"),
        options: rarityOptions
      },
      {
        field: new foundry.data.fields.SetField(new foundry.data.fields.StringField()), name: "subtypes",
        label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.GenerateItemSubtype"),
        value: liveValues("subtypes").filter(v => subtypeOpts.some(o => o.value === v)),
        options: subtypeOpts, disabled: !subtypeOpts.length
      }
    ];
  };

  dialog = new BasePromptDialog({
    window: { title: "SIMPLE_SHOP_CRAFT_5E.ShopEditor.GenerateItem" },
    fields: buildFields,
    onRender: app => {
      app.element.querySelector('[name="types"]')?.addEventListener("change", () => app.render());
    },
    buttons: [
      { action: "generate", label: "SIMPLE_SHOP_CRAFT_5E.ShopEditor.GenerateItemRoll", icon: "fa-solid fa-dice-d20", default: true }
    ],
    form: {
      closeOnSubmit: false,
      handler: async function(event, form, formData) {
        const data = foundry.utils.expandObject(formData.object);
        const types = data.types?.length ? data.types : typeOptions.map(o => o.value);
        const rarities = data.rarities?.length
          ? new Set(data.rarities.map(r => r === "mundane" ? "" : r)) : null;
        const subtypes = data.subtypes?.length ? data.subtypes : null;
        const existingKeys = new Set(shopSheet.shop.items.map(i => entryKey(i)));

        const rolled = await rollShopItem({ types, rarities, subtypes, existingKeys });
        if ( !rolled ) {
          ui.notifications.warn("SIMPLE_SHOP_CRAFT_5E.ShopEditor.GenerateItemNone");
          return;
        }

        await onGenerated([rolled.entry]);
        ui.notifications.info(game.i18n.format("SIMPLE_SHOP_CRAFT_5E.ShopEditor.GenerateItemResult", { name: rolled.label }));
      }
    }
  });
  await dialog.render({ force: true });
}
