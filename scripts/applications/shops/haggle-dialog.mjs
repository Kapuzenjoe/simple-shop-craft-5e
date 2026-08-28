/**
 * @import { default as ShopSheet } from "./shop-sheet.mjs";
 */

const { Dialog5e } = game.dnd5e.applications.api;

/**
 * Dialog to pick a Charisma skill and the NPC's attitude, then roll it against the shop NPC's DC for
 * the acting actor.
 */
export default class HaggleDialog extends Dialog5e {
  constructor({ shopSheet, onUpdatePlayerDiscount, ...options }={}) {
    super(options);
    this.shopSheet = shopSheet;
    this.onUpdatePlayerDiscount = onUpdatePlayerDiscount;
  }

  /* -------------------------------------------- */

  /** @override */
  static DEFAULT_OPTIONS = {
    id: "haggle-dialog-{id}",
    classes: ["simple-shop-craft-5e", "haggle-dialog", "standard-form"],
    window: { title: "SIMPLE_SHOP_CRAFT_5E.ShopEditor.Haggling" },
    position: { width: 400 },
    buttons: [
      { action: "roll", label: "SIMPLE_SHOP_CRAFT_5E.ShopEditor.HagglingRoll", icon: "fa-solid fa-dice-d20", default: true }
    ],
    form: { handler: HaggleDialog.#onSubmit },
    shopSheet: null,
    onUpdatePlayerDiscount: null
  };

  /* -------------------------------------------- */

  /** @override */
  static PARTS = {
    ...super.PARTS,
    content: { template: "modules/simple-shop-craft-5e/templates/partials/config-dialog-content.hbs" }
  };

  /**
   * The shop editor this dialog belongs to.
   * @type {ShopSheet}
   */
  shopSheet;

  /**
   * Callback receiving a haggling-lock update for the acting actor.
   * @type {(actorUuid: string, updateData: object) => Promise<void>}
   */
  onUpdatePlayerDiscount;

  /**
   * DC computed for the current NPC, cached during content preparation for reuse on submit.
   * @type {number}
   */
  #dc;

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareContentContext(context, options) {
    context = await super._prepareContentContext(context, options);
    context.legend = this.options.window?.title;
    const playerOverride = this.shopSheet.shop.resolvePlayerOverride(this.shopSheet.selectedActorUuid);
    const effectiveBuy = this.shopSheet.shop.buyModifier + (playerOverride.buy ?? 0);
    const effectiveSell = this.shopSheet.shop.sellModifier + (playerOverride.sell ?? 0);
    const chaSkills = Object.entries(CONFIG.DND5E.skills).filter(([, s]) => s.ability === "cha");
    const npc = this.shopSheet.shop.npc ? await fromUuid(this.shopSheet.shop.npc) : null;
    this.#dc = Math.max(15, npc?.system.abilities?.int?.value ?? 0);
    const dispositionAttitude = {
      [CONST.TOKEN_DISPOSITIONS.HOSTILE]: "hostile", [CONST.TOKEN_DISPOSITIONS.FRIENDLY]: "friendly"
    };

    context.hint = `${_loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.HagglingCurrent")}: `
      + `${_loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.Tabs.Buy")} ${effectiveBuy}% / `
      + `${_loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.Tabs.Sell")} ${effectiveSell}% (DC ${this.#dc})`;
    context.fields = [
      {
        field: new foundry.data.fields.StringField(), name: "skill",
        label: _loc("DND5E.Skill"), options: chaSkills.map(([value, s]) => ({ value, label: s.label }))
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
    ];
    return context;
  }

  /* -------------------------------------------- */

  /**
   * Handle rolling the haggle check and applying a lock on failure.
   * @this {HaggleDialog}
   * @param {Event} event                Triggering submit event.
   * @param {HTMLFormElement} form       The submitted form.
   * @param {FormDataExtended} formData  Data from the form.
   * @returns {Promise<void>}
   */
  static async #onSubmit(event, form, formData) {
    const actor = fromUuidSync(this.shopSheet.selectedActorUuid);
    if ( !actor ) return;
    const data = foundry.utils.expandObject(formData.object);
    const rolls = await actor.rollSkill({
      skill: data.skill, target: this.#dc,
      advantage: data.attitude === "friendly", disadvantage: data.attitude === "hostile"
    });
    if ( rolls?.[0] ) {
      await this.onUpdatePlayerDiscount(
        actor.uuid, rolls[0].isFailure ? { hagglingLocked: true, hagglingTimestamp: game.time.worldTime } : {}
      );
    }
    await this.close();
  }
}
