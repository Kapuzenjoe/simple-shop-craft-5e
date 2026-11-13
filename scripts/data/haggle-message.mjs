import { CARD_STATUSES, HAGGLE_DEFAULT_PERCENT, HAGGLE_PERCENTS, MODULE_ID } from "../config.mjs";
import { Shop } from "./shop-data.mjs";

const { DocumentUUIDField, StringField } = foundry.data.fields;

/**
 * @import { HaggleMessageCardData } from "../_types.mjs";
 */

/**
 * Template used to render a haggling tray.
 * @type {string}
 */
const TEMPLATE = "modules/simple-shop-craft-5e/templates/chat/haggle-tray.hbs";

/**
 * A data model that represents a haggling roll message's own flag data, shown to the GM as a tray below the roll.
 * @extends {foundry.abstract.DataModel<HaggleMessageCardData>}
 * @mixes HaggleMessageCardData
 */
export class HaggleMessageData extends foundry.abstract.DataModel {

  /** @override */
  static defineSchema() {
    return {
      status: new StringField({ initial: "pending", choices: Object.keys(CARD_STATUSES) }),
      shopId: new StringField({ blank: true }),
      actorUuid: new DocumentUUIDField({ type: "Actor" }),
      side: new StringField({ initial: "buy", choices: ["buy", "sell"] })
    };
  }

  /* -------------------------------------------- */

  /**
   * IDs of the messages whose decision is currently being applied on this client.
   * @type {Set<string>}
   */
  static #processing = new Set();

  /* -------------------------------------------- */

  /**
   * Append the haggling tray to a rendered roll message if the roll succeeded. GM-only.
   * @param {ChatMessage} message  The rendered chat message.
   * @param {HTMLElement} html     Root element of the rendered message.
   */
  static onRender(message, html) {
    const flag = message.getFlag(MODULE_ID, "haggle");
    const roll = message.rolls[0];
    if ( !game.user.isGM || !flag || !roll?.isSuccess ) return;

    const haggle = new HaggleMessageData(flag);
    haggle.renderTray().then(markup => {
      const content = html.querySelector(".message-content");
      content.insertAdjacentHTML("beforeend", markup);
      if ( haggle.status === "pending" ) haggle.#activate(message, content.lastElementChild);
    });
  }

  /* -------------------------------------------- */

  /**
   * Render this tray for its current status.
   * @returns {Promise<string>}
   */
  async renderTray() {
    const isBuy = this.side === "buy";
    const current = Shop.get(this.shopId)?.resolvePlayerOverride(this.actorUuid)[this.side] ?? 0;
    return foundry.applications.handlebars.renderTemplate(TEMPLATE, {
      pending: this.status === "pending",
      sideLabel: _loc(`SIMPLE_SHOP_CRAFT_5E.ShopEditor.Tabs.${isBuy ? "Buy" : "Sell"}`),
      percentLabel: _loc(`SIMPLE_SHOP_CRAFT_5E.HaggleTray.${isBuy ? "Discount" : "Bonus"}`),
      current,
      statusLabel: _loc(CARD_STATUSES[this.status].label),
      percents: HAGGLE_PERCENTS, percent: HAGGLE_DEFAULT_PERCENT
    });
  }

  /* -------------------------------------------- */

  /**
   * Wire the percentage and the Apply/Reject buttons of a rendered tray.
   * @param {ChatMessage} message  The roll message the tray belongs to.
   * @param {HTMLElement} tray     The rendered tray.
   */
  #activate(message, tray) {
    const percentButtons = Array.from(tray.querySelectorAll(".multiplier-button"));
    for ( const button of percentButtons ) {
      button.addEventListener("click", () => {
        percentButtons.forEach(other => other.setAttribute("aria-pressed", other === button));
      });
    }
    const decide = (event, decision) => {
      const pressed = percentButtons.find(button => button.getAttribute("aria-pressed") === "true");
      return this.#handleDecision(message, decision, Number(pressed.value), event.currentTarget);
    };
    tray.querySelector('[data-action="applyHaggle"]').addEventListener("click", event => decide(event, "accepted"));
    tray.querySelector('[data-action="rejectHaggle"]').addEventListener("click", event => decide(event, "rejected"));
  }

  /* -------------------------------------------- */

  /**
   * Record the GM's decision on this pending haggling, writing the chosen modifier to the shop on acceptance.
   * @param {ChatMessage} message              The roll message the tray belongs to.
   * @param {"accepted"|"rejected"} decision
   * @param {number} percent                   The percentage chosen for the discount or bonus.
   * @param {HTMLButtonElement} button         The clicked button, disabled while the decision is applied.
   * @returns {Promise<void>}
   */
  async #handleDecision(message, decision, percent, button) {
    const processing = HaggleMessageData.#processing;
    if ( processing.has(message.id) || (message.getFlag(MODULE_ID, "haggle")?.status !== "pending") ) return;
    processing.add(message.id);
    button.disabled = true;
    try {
      if ( decision === "accepted" ) {
        if ( !Shop.get(this.shopId) ) {
          ui.notifications.error("SIMPLE_SHOP_CRAFT_5E.HaggleTray.MissingShop", { localize: true });
          return;
        }
        if ( !fromUuidSync(this.actorUuid) ) {
          ui.notifications.error("SIMPLE_SHOP_CRAFT_5E.HaggleTray.MissingActor", { localize: true });
          return;
        }
        await Shop.update(this.shopId, Shop.mergePlayerDiscount(this.actorUuid, {
          [`${this.side}Modifier`]: (this.side === "buy") ? -percent : percent
        }));
      }

      this.updateSource({ status: decision });
      await message.update({ [`flags.${MODULE_ID}.haggle`]: this.toObject() });
    } finally {
      processing.delete(message.id);
      button.disabled = false;
    }
  }
}
