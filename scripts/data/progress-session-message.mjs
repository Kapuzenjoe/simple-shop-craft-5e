import { MODULE_ID } from "../config.mjs";
import { formatDuration } from "../utils.mjs";

import { InProgressCraft } from "./in-progress-craft.mjs";

const { BooleanField, DocumentUUIDField, FilePathField, NumberField, StringField } = foundry.data.fields;

/**
 * @import { ProgressSessionMessageCardData } from "../_types.mjs";
 */

/**
 * Template used to render a progress-session chat card.
 * @type {string}
 */
const TEMPLATE = "modules/simple-shop-craft-5e/templates/chat/progress-session-card.hbs";

/**
 * A data model that represents a calendar-mode progress session's own chat card flag data.
 * @extends {foundry.abstract.DataModel<ProgressSessionMessageCardData>}
 * @mixes ProgressSessionMessageCardData
 */
export class ProgressSessionMessageData extends foundry.abstract.DataModel {

  /** @override */
  static defineSchema() {
    return {
      resolved: new BooleanField({ initial: false }),
      itemUuid: new DocumentUUIDField({ type: "Item" }),
      actorUuid: new DocumentUUIDField({ type: "Actor" }),
      actorName: new StringField(),
      itemName: new StringField(),
      itemImg: new FilePathField({ categories: ["IMAGE"] }),
      pendingHours: new NumberField()
    };
  }

  /* -------------------------------------------- */

  /**
   * Create a chat message announcing a started calendar-mode progress session.
   * @param {Item5e} item          The in-progress craft item.
   * @param {Actor5e} actor        The crafting actor.
   * @param {number} pendingHours  Hours planned for this session.
   * @returns {Promise<ChatMessage>}
   */
  static async create(item, actor, pendingHours) {
    const session = new ProgressSessionMessageData({
      itemUuid: item.uuid, actorUuid: actor.uuid, actorName: actor.name,
      itemName: item.name, itemImg: item.img, pendingHours
    });

    return ChatMessage.create({
      content: await session.renderContent(),
      speaker: ChatMessage.getSpeaker({ actor }),
      flags: { [MODULE_ID]: { progressSession: session.toObject() } }
    });
  }

  /* -------------------------------------------- */

  /**
   * Wire the End Progress button on a rendered session card. GM-only.
   * @param {ChatMessage} message  The rendered chat message.
   * @param {HTMLElement} html     Root element of the rendered message.
   */
  static onRender(message, html) {
    const flag = message.getFlag(MODULE_ID, "progressSession");
    if ( !flag || flag.resolved ) return;

    if ( !game.user.isGM ) {
      html.querySelector(".card-buttons")?.remove();
      return;
    }

    const session = new ProgressSessionMessageData(flag);
    html.querySelector('[data-action="endProgress"]')?.addEventListener("click", () => session.#endProgress(message));
  }

  /* -------------------------------------------- */

  /**
   * Render this card's content for its current state.
   * @returns {Promise<string>}
   */
  async renderContent() {
    return foundry.applications.handlebars.renderTemplate(TEMPLATE, {
      ...this.toObject(),
      startedLabel: _loc("SIMPLE_SHOP_CRAFT_5E.Craft.ProgressSession.Started", {
        hours: formatDuration(this.pendingHours, { days: false })
      })
    });
  }

  /* -------------------------------------------- */

  /**
   * Mark a progress-session message resolved, hiding its End Progress button.
   * @param {string} messageId
   * @returns {Promise<void>}
   */
  static async resolve(messageId) {
    const message = game.messages.get(messageId);
    const flag = message?.getFlag(MODULE_ID, "progressSession");
    if ( !flag || flag.resolved ) return;

    const session = new ProgressSessionMessageData(flag);
    session.updateSource({ resolved: true });
    await message.update({
      content: await session.renderContent(),
      [`flags.${MODULE_ID}.progressSession`]: session.toObject()
    });
  }

  /* -------------------------------------------- */

  /**
   * Handle the GM ending this session early: credit only the elapsed hours.
   * @param {ChatMessage} message  The session chat message.
   * @returns {Promise<void>}
   */
  async #endProgress(message) {
    const item = await fromUuid(this.itemUuid);
    const flag = item?.getFlag(MODULE_ID, "craft");
    if ( flag?.pendingStart == null ) return;

    const craft = new InProgressCraft(flag);
    await craft.resolvePendingSession(item, { early: true });
  }
}
