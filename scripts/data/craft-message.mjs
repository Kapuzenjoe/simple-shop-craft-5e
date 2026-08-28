import { MODULE_ID } from "../config.mjs";
import { breakdownCopper } from "../utils.mjs";

import { InProgressCraft } from "./in-progress-craft.mjs";

const {
  ArrayField, DocumentUUIDField, FilePathField, NumberField, SchemaField, StringField
} = foundry.data.fields;

/**
 * @import { Recipe } from "./recipe-data.mjs";
 */

/**
 * Template used to render a craft-start chat card.
 * @type {string}
 */
const TEMPLATE = "modules/simple-shop-craft-5e/templates/chat/craft-card.hbs";

/**
 * Localization keys for each pending-craft status.
 * @type {Record<string, string>}
 */
const STATUS_LABELS = {
  pending: "SIMPLE_SHOP_CRAFT_5E.Status.Pending",
  accepted: "SIMPLE_SHOP_CRAFT_5E.Status.Accepted",
  rejected: "SIMPLE_SHOP_CRAFT_5E.Status.Rejected"
};

/**
 * A data model that represents a craft-start chat card's own flag data.
 * @extends {foundry.abstract.DataModel}
 */
export class CraftMessageData extends foundry.abstract.DataModel {

  /** @override */
  static defineSchema() {
    return {
      status: new StringField({ initial: "pending", choices: ["pending", "accepted", "rejected"] }),
      recipeId: new StringField({ blank: true }),
      targetItem: new SchemaField({
        identifier: new StringField({ blank: true }),
        uuid: new DocumentUUIDField({ type: "Item", blank: true })
      }),
      targetName: new StringField(),
      targetImg: new FilePathField({ categories: ["IMAGE"] }),
      actorUuid: new DocumentUUIDField({ type: "Actor" }),
      actorName: new StringField(),
      toolKey: new StringField({ nullable: true, initial: null }),
      materialLines: new ArrayField(new SchemaField({
        itemId: new StringField(), name: new StringField(), img: new FilePathField({ categories: ["IMAGE"] }),
        quantity: new NumberField()
      })),
      goldCP: new NumberField({ initial: 0 }),
      totalHours: new NumberField({ initial: 0 }),
      hoursPerUse: new NumberField({ nullable: true, initial: null }),
      weight: new SchemaField({
        value: new NumberField({ initial: 0 }), units: new StringField({ initial: "lb" })
      }),
      halfPrice: new SchemaField({
        value: new NumberField({ initial: 0 }), denomination: new StringField({ initial: "gp" })
      })
    };
  }

  /* -------------------------------------------- */

  /**
   * Copper amount filled in from the actor's own currency, broken down for display.
   * @type {{ denomination: string, value: number }[]}
   */
  get goldParts() {
    return this.goldCP > 0 ? breakdownCopper(this.goldCP) : [];
  }

  /* -------------------------------------------- */

  /**
   * Create a chat message requesting GM confirmation for a pending craft start.
   * @param {object} options
   * @param {Actor5e} options.actor                    The crafting actor.
   * @param {Recipe} options.recipe                    The recipe being crafted.
   * @param {Item5e} options.targetItem                Resolved target item (name/img).
   * @param {{ item: Item5e, quantity: number }[]} options.materialLines  Owned items contributed as materials.
   * @param {number} options.goldCP                     Copper amount filled in from the actor's own currency.
   * @param {string|null} options.toolKey               Tool proficiency key used, if any.
   * @param {number} options.totalHours                 Total progress hours needed to finish the craft.
   * @param {number} options.hoursPerUse                Progress hours added by each "Progress Craft" activation.
   * @param {{ value: number, units: string }} options.weight              Target item's weight.
   * @param {{ value: number, denomination: string }} options.halfPrice    Half the target item's price.
   * @returns {Promise<ChatMessage>}
   */
  static async create({
    actor, recipe, targetItem, materialLines, goldCP, toolKey, totalHours, hoursPerUse, weight, halfPrice
  }) {
    const craft = new CraftMessageData({
      recipeId: recipe._id,
      targetItem: { identifier: recipe.targetItem.identifier, uuid: recipe.targetItem.uuid },
      targetName: targetItem.name, targetImg: targetItem.img,
      actorUuid: actor.uuid, actorName: actor.name, toolKey: toolKey || null,
      materialLines: materialLines.map(line => ({
        itemId: line.item.id, name: line.item.name, img: line.item.img, quantity: line.quantity
      })),
      goldCP, totalHours, hoursPerUse, weight, halfPrice
    });

    return ChatMessage.create({
      content: await craft.renderContent(),
      speaker: ChatMessage.getSpeaker({ actor }),
      flags: { [MODULE_ID]: { craft: craft.toObject() } }
    });
  }

  /* -------------------------------------------- */

  /**
   * Wire the Accept/Reject buttons on a rendered craft card. GM-only.
   * @param {ChatMessage} message  The rendered chat message.
   * @param {HTMLElement} html     Root element of the rendered message.
   */
  static onRender(message, html) {
    const flag = message.getFlag(MODULE_ID, "craft");
    if ( !flag || (flag.status !== "pending") ) return;

    if ( !game.user.isGM ) {
      html.querySelector(".card-buttons")?.remove();
      return;
    }

    const craft = new CraftMessageData(flag);
    html.querySelector('[data-action="acceptCraft"]')?.addEventListener("click", () => craft.#handleDecision(message, "accepted"));
    html.querySelector('[data-action="rejectCraft"]')?.addEventListener("click", () => craft.#handleDecision(message, "rejected"));
  }

  /* -------------------------------------------- */

  /**
   * Render this card's content for its current status.
   * @returns {Promise<string>}
   */
  async renderContent() {
    return foundry.applications.handlebars.renderTemplate(TEMPLATE, {
      ...this.toObject(), goldParts: this.goldParts,
      pending: this.status === "pending", statusLabel: _loc(STATUS_LABELS[this.status])
    });
  }

  /* -------------------------------------------- */

  /**
   * Record the GM's decision on this pending craft start.
   * @param {ChatMessage} message              The craft chat message.
   * @param {"accepted"|"rejected"} decision
   * @returns {Promise<void>}
   */
  async #handleDecision(message, decision) {
    if ( decision === "accepted" ) {
      const result = await InProgressCraft.start(this.toObject());
      if ( !result.ok ) {
        ui.notifications.error(result.error, { localize: true });
        return;
      }
    }

    this.updateSource({ status: decision });
    await message.update({
      content: await this.renderContent(),
      [`flags.${MODULE_ID}.craft`]: this.toObject()
    });
  }
}
