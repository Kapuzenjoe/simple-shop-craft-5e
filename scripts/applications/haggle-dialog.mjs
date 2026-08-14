import { resolvePlayerOverride } from "../shop/pricing.mjs";

import BasePromptDialog from "./base-prompt-dialog.mjs";

/**
 * Open a dialog to pick a Charisma skill and the NPC's attitude, then roll it against the shop NPC's DC
 * for the acting actor.
 * @param {ShopSheet} shopSheet
 * @param {(actorUuid: string, patch: object) => Promise<void>} onPatchPlayerDiscount
 * @returns {Promise<void>}
 */
export async function openHaggleDialog(shopSheet, onPatchPlayerDiscount) {
  const actor = shopSheet.selectedActorUuid ? fromUuidSync(shopSheet.selectedActorUuid) : null;
  if ( !actor ) return;
  const playerOverride = resolvePlayerOverride(shopSheet.shop.playerDiscounts, shopSheet.selectedActorUuid);
  const effectiveBuy = shopSheet.shop.buyModifier + (playerOverride.buy ?? 0);
  const effectiveSell = shopSheet.shop.sellModifier + (playerOverride.sell ?? 0);
  const chaSkills = Object.entries(CONFIG.DND5E.skills).filter(([, s]) => s.ability === "cha");
  const npc = shopSheet.shop.npc ? await fromUuid(shopSheet.shop.npc) : null;
  const dc = Math.max(15, npc?.system.abilities?.int?.value ?? 0);
  const dispositionAttitude = {
    [CONST.TOKEN_DISPOSITIONS.HOSTILE]: "hostile", [CONST.TOKEN_DISPOSITIONS.FRIENDLY]: "friendly"
  };

  const dialog = new BasePromptDialog({
    window: { title: "SIMPLE_SHOP_CRAFT_5E.ShopEditor.Haggling" },
    hint: `${_loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.HagglingCurrent")}: `
      + `${_loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.Tabs.Buy")} ${effectiveBuy}% / `
      + `${_loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.Tabs.Sell")} ${effectiveSell}% (DC ${dc})`,
    fields: [
      {
        field: new foundry.data.fields.StringField(), name: "skill",
        label: _loc("DND5E.Skill"),
        options: chaSkills.map(([value, s]) => ({ value, label: s.label }))
      },
      {
        field: new foundry.data.fields.StringField(), name: "attitude",
        label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.HagglingAttitude"),
        value: dispositionAttitude[npc?.prototypeToken?.disposition] ?? "neutral",
        options: [
          { value: "hostile", label: _loc("TOKEN.DISPOSITION.HOSTILE") },
          { value: "neutral", label: _loc("TOKEN.DISPOSITION.NEUTRAL") },
          { value: "friendly", label: _loc("TOKEN.DISPOSITION.FRIENDLY") }
        ]
      }
    ],
    buttons: [
      { action: "roll", label: "SIMPLE_SHOP_CRAFT_5E.ShopEditor.HagglingRoll", icon: "fa-solid fa-dice-d20", default: true }
    ],
    form: {
      handler: async function(event, form, formData) {
        const data = foundry.utils.expandObject(formData.object);
        const rolls = await actor.rollSkill({
          skill: data.skill, target: dc,
          advantage: data.attitude === "friendly", disadvantage: data.attitude === "hostile"
        });
        if ( rolls?.[0] ) {
          await onPatchPlayerDiscount(
            actor.uuid, rolls[0].isFailure ? { hagglingLocked: true, hagglingTimestamp: Date.now() } : {}
          );
        }
        await this.close();
      }
    }
  });
  await dialog.render({ force: true });
}
