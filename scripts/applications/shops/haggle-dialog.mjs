import { MODULE_ID } from "../../config.mjs";
import { HaggleMessageData } from "../../data/haggle-message.mjs";

const { Dialog5e } = game.dnd5e.applications.api;

/**
 * @import ShopSheet from "./shop-sheet.mjs";
 */

/**
 * Dialog to pick the side of the transaction, a Charisma skill, and the NPC's attitude, then roll it against
 * the shop NPC's DC for the acting actor.
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
    form: { handler: HaggleDialog.#onSubmit }
  };

  /* -------------------------------------------- */

  /** @override */
  static PARTS = {
    ...super.PARTS,
    content: { template: "modules/simple-shop-craft-5e/templates/shared/config-dialog-content.hbs" }
  };

  /* -------------------------------------------- */

  /**
   * The shop editor this dialog belongs to.
   * @type {ShopSheet}
   */
  shopSheet;

  /* -------------------------------------------- */

  /**
   * Callback receiving a haggling-lock update for the acting actor.
   * @type {(actorUuid: string, updateData: object) => Promise<void>}
   */
  onUpdatePlayerDiscount;

  /* -------------------------------------------- */

  /**
   * DC computed for the current NPC, cached during content preparation for reuse on submit.
   * @type {number}
   */
  #dc;

  /* -------------------------------------------- */

  /**
   * Whether every Charisma skill is haggling-locked, cached during content preparation for reuse
   * in the footer.
   * @type {boolean}
   */
  #allSkillsLocked = false;

  /* -------------------------------------------- */

  /**
   * Side of the shop the haggling is about, kept across re-renders.
   * @type {"buy"|"sell"}
   */
  #side = "buy";

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareContentContext(context, options) {
    context = await super._prepareContentContext(context, options);
    context.legend = this.options.window?.title;
    const actorUuid = this.shopSheet.selectedActorUuid;
    const shop = this.shopSheet.shop;
    const playerOverride = shop.resolvePlayerOverride(actorUuid);
    const effectiveBuy = shop.buyModifier + (playerOverride.buy ?? 0);
    const effectiveSell = shop.sellModifier + (playerOverride.sell ?? 0);
    const chaSkills = Object.entries(CONFIG.DND5E.skills).filter(([, s]) => s.ability === "cha");
    const npc = this.shopSheet.shop.npc ? await fromUuid(this.shopSheet.shop.npc) : null;
    this.#dc = Math.max(15, npc?.system.abilities?.int?.value ?? 0);
    const dispositionAttitude = {
      [CONST.TOKEN_DISPOSITIONS.HOSTILE]: "hostile", [CONST.TOKEN_DISPOSITIONS.FRIENDLY]: "friendly"
    };

    context.hint = `${_loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.HagglingCurrent")}: `
      + `${_loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.Tabs.Buy")} ${effectiveBuy}% / `
      + `${_loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.Tabs.Sell")} ${effectiveSell}% (DC ${this.#dc})`;
    const isLocked = skill => shop.isHagglingLocked(actorUuid, skill, this.#side);
    if ( chaSkills.some(([value]) => isLocked(value)) ) {
      context.hint += ` ${_loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.HagglingSomeLocked")}`;
    }
    const unlockedSkill = chaSkills.find(([value]) => !isLocked(value));
    this.#allSkillsLocked = !unlockedSkill;
    context.fields = [
      {
        field: new foundry.data.fields.StringField({ blank: false, required: true }), name: "side",
        label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.HagglingSide"), value: this.#side,
        options: [
          { value: "buy", label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.Tabs.Buy") },
          { value: "sell", label: _loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.Tabs.Sell") }
        ]
      },
      {
        field: new foundry.data.fields.StringField({ blank: false, required: true }), name: "skill",
        label: _loc("DND5E.Skill"),
        value: unlockedSkill?.[0] ?? chaSkills[0]?.[0],
        options: chaSkills.map(([value, s]) => ({
          value,
          label: isLocked(value)
            ? `${s.label} (${_loc("SIMPLE_SHOP_CRAFT_5E.ShopEditor.HagglingLocked")})` : s.label,
          disabled: isLocked(value)
        }))
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

  /** @inheritDoc */
  async _prepareFooterContext(context, options) {
    context = await super._prepareFooterContext(context, options);
    context.buttons[0].disabled = this.#allSkillsLocked;
    return context;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onChangeForm(formConfig, event) {
    super._onChangeForm(formConfig, event);
    if ( event.target.name !== "side" ) return;
    this.#side = event.target.value;
    this.render({ parts: ["content", "footer"] });
  }

  /* -------------------------------------------- */

  /**
   * Handle rolling the haggle check and locking the side: the rolled skill on a failure, every Charisma skill on
   * a success.
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
    if ( this.shopSheet.shop.isHagglingLocked(actor.uuid, data.skill, data.side) ) return;
    await this.close();
    const attitudeMod = data.attitude === "friendly" ? { advantage: true }
      : data.attitude === "hostile" ? { disadvantage: true } : {};
    const haggle = new HaggleMessageData({
      shopId: this.shopSheet.shopId, actorUuid: actor.uuid, side: data.side
    });
    const rolls = await actor.rollSkill({ skill: data.skill, target: this.#dc, ...attitudeMod }, {}, {
      data: { flags: { [MODULE_ID]: { haggle: haggle.toObject() } } }
    });
    if ( !rolls?.[0] ) return;
    const skills = rolls[0].isSuccess
      ? Object.keys(CONFIG.DND5E.skills).filter(key => CONFIG.DND5E.skills[key].ability === "cha")
      : [data.skill];
    const existing = this.shopSheet.shop.playerDiscounts.find(pd => pd.actor === actor.uuid);
    const hagglingLocks = { ...existing?.hagglingLocks };
    for ( const skill of skills ) hagglingLocks[`${data.side}-${skill}`] = game.time.worldTime;
    await this.onUpdatePlayerDiscount(actor.uuid, { hagglingLocks });
  }
}
