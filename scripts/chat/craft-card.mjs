import { MODULE_ID } from "../config.mjs";
import { applyCraftStart } from "../craft/transaction.mjs";
import { breakdownCopper } from "../shop/currency.mjs";

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
 * Create a chat message requesting GM confirmation for a pending craft start.
 * @param {object} options
 * @param {Actor5e} options.actor                    The crafting actor.
 * @param {Recipe} options.recipe                    The recipe being crafted.
 * @param {Item5e} options.targetItem                Resolved target item (name/img).
 * @param {{ item: Item5e }[]} options.materialLines  Owned items contributed as materials.
 * @param {number} options.goldCP                     Copper amount filled in from the actor's own currency.
 * @param {string|null} options.toolKey               Tool proficiency key used, if any.
 * @param {number} options.totalHours                 Total progress hours needed to finish the craft.
 * @param {{ value: number, units: string }} options.weight              Target item's weight.
 * @param {{ value: number, denomination: string }} options.halfPrice    Half the target item's price.
 * @returns {Promise<ChatMessage>}
 */
export async function createCraftMessage({
  actor, recipe, targetItem, materialLines, goldCP, toolKey, totalHours, weight, halfPrice
}) {
  const craft = {
    status: "pending",
    recipeId: recipe._id,
    targetItem: { identifier: recipe.targetItem.identifier, uuid: recipe.targetItem.uuid },
    targetName: targetItem.name,
    targetImg: targetItem.img,
    actorUuid: actor.uuid,
    actorName: actor.name,
    toolKey: toolKey || null,
    materialLines: materialLines.map(line => ({ itemId: line.item.id, name: line.item.name, img: line.item.img })),
    goldCP,
    goldParts: goldCP > 0 ? breakdownCopper(goldCP) : [],
    totalHours, weight, halfPrice
  };

  return ChatMessage.create({
    content: await renderCraftContent(craft),
    speaker: ChatMessage.getSpeaker({ actor }),
    flags: { [MODULE_ID]: { craft } }
  });
}

/* -------------------------------------------- */

/**
 * Register hooks needed to handle craft chat cards.
 * @returns {void}
 */
export function registerCraftCard() {
  Hooks.on("dnd5e.renderChatMessage", onRenderCraftCard);
}

/* -------------------------------------------- */

/**
 * Record the GM's decision on a pending craft start.
 * @param {ChatMessage} message              The craft chat message.
 * @param {object} craft                     The craft flag data.
 * @param {"accepted"|"rejected"} decision
 * @returns {Promise<void>}
 */
async function handleDecision(message, craft, decision) {
  if ( decision === "accepted" ) {
    const result = await applyCraftStart(craft);
    if ( !result.ok ) {
      ui.notifications.error(result.error);
      return;
    }
  }

  const updated = { ...craft, status: decision };
  await message.update({
    content: await renderCraftContent(updated),
    [`flags.${MODULE_ID}.craft`]: updated
  });
}

/* -------------------------------------------- */

/**
 * Wire the Accept/Reject buttons on a rendered craft card. GM-only.
 * @param {ChatMessage} message  The rendered chat message.
 * @param {HTMLElement} html     Root element of the rendered message.
 */
function onRenderCraftCard(message, html) {
  const craft = message.getFlag(MODULE_ID, "craft");
  if ( !craft || (craft.status !== "pending") ) return;

  if ( !game.user.isGM ) {
    html.querySelector(".card-buttons")?.remove();
    return;
  }

  html.querySelector('[data-action="acceptCraft"]')?.addEventListener("click", () => handleDecision(message, craft, "accepted"));
  html.querySelector('[data-action="rejectCraft"]')?.addEventListener("click", () => handleDecision(message, craft, "rejected"));
}

/* -------------------------------------------- */

/**
 * Render the craft card content for the current state of a craft.
 * @param {object} craft  Craft flag data.
 * @returns {Promise<string>}
 */
async function renderCraftContent(craft) {
  return foundry.applications.handlebars.renderTemplate(TEMPLATE, {
    ...craft,
    pending: craft.status === "pending",
    statusLabel: _loc(STATUS_LABELS[craft.status])
  });
}
