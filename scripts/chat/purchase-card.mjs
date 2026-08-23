import { MODULE_ID } from "../config.mjs";
import { applyPurchase } from "../shop/transaction.mjs";

/**
 * @import { default as ShopSheet } from "../applications/shop-sheet.mjs";
 */

/**
 * Template used to render a purchase chat card.
 * @type {string}
 */
const TEMPLATE = "modules/simple-shop-craft-5e/templates/chat/purchase-card.hbs";

/**
 * Localization keys for each pending-transaction status.
 * @type {Record<string, string>}
 */
const STATUS_LABELS = {
  pending: "SIMPLE_SHOP_CRAFT_5E.Status.Pending",
  accepted: "SIMPLE_SHOP_CRAFT_5E.Status.Accepted",
  rejected: "SIMPLE_SHOP_CRAFT_5E.Status.Rejected"
};

/**
 * Create a chat message requesting GM confirmation for a pending buy/sell transaction.
 * @param {ShopSheet} shopSheet  The shop editor the transaction originates from.
 * @param {Actor5e} actor        The acting actor.
 * @param {object[]} buyLines    Buy cart lines, as prepared by {@link ShopSheet#cartLines}.
 * @param {object[]} sellLines   Sell cart lines, as prepared by {@link ShopSheet#sellLines}.
 * @param {object[]} totalParts  Combined (buy - sell) price breakdown parts.
 * @param {number} netCP         Combined total in copper; negative = actor owes, positive = actor is owed.
 * @returns {Promise<ChatMessage>}
 */
export async function createPurchaseMessage(shopSheet, actor, buyLines, sellLines, totalParts, netCP) {
  const purchase = {
    status: "pending",
    shopId: shopSheet.shopId,
    shopName: shopSheet.shop.name,
    shopImg: shopSheet.shop.img,
    actorUuid: actor.uuid,
    actorName: actor.name,
    buyLines: buyLines.map(row => ({
      identifier: row.entry.identifier,
      uuid: row.entry.uuid,
      generated: row.entry.generated ?? null,
      spellScroll: row.entry.spellScroll ?? null,
      name: row.item.name,
      img: row.item.img,
      quantity: row.cartQuantity,
      priceCP: row.priceCP,
      bundleSize: row.bundleSize ?? 1,
      subtotal: row.subtotal
    })),
    sellLines: sellLines.map(row => ({
      itemId: row.item.id,
      identifier: row.item.system.identifier,
      name: row.item.name,
      img: row.item.img,
      quantity: row.sellQuantity,
      priceCP: row.priceCP,
      subtotal: row.subtotal
    })),
    total: totalParts,
    netCP
  };

  return ChatMessage.create({
    content: await renderPurchaseContent(purchase),
    speaker: ChatMessage.getSpeaker({ actor }),
    flags: { [MODULE_ID]: { purchase } }
  });
}

/* -------------------------------------------- */

/**
 * Register hooks needed to handle purchase chat cards.
 */
export function registerPurchaseCard() {
  Hooks.on("dnd5e.renderChatMessage", onRenderPurchaseCard);
}

/* -------------------------------------------- */

/**
 * Record the GM's decision on a pending transaction.
 * @param {ChatMessage} message              The purchase chat message.
 * @param {object} purchase                  The purchase flag data.
 * @param {"accepted"|"rejected"} decision
 * @returns {Promise<void>}
 */
async function handleDecision(message, purchase, decision) {
  if ( decision === "accepted" ) {
    const result = await applyPurchase(purchase);
    if ( !result.ok ) {
      ui.notifications.error(result.error, { localize: true });
      return;
    }
  }

  const updated = { ...purchase, status: decision };
  await message.update({
    content: await renderPurchaseContent(updated),
    [`flags.${MODULE_ID}.purchase`]: updated
  });
}

/* -------------------------------------------- */

/**
 * Wire the Accept/Reject buttons on a rendered purchase card. GM-only.
 * @param {ChatMessage} message  The rendered chat message.
 * @param {HTMLElement} html     Root element of the rendered message.
 */
function onRenderPurchaseCard(message, html) {
  const purchase = message.getFlag(MODULE_ID, "purchase");
  if ( !purchase || (purchase.status !== "pending") ) return;

  if ( !game.user.isGM ) {
    html.querySelector(".card-buttons")?.remove();
    return;
  }

  html.querySelector('[data-action="acceptPurchase"]')?.addEventListener("click", () => handleDecision(message, purchase, "accepted"));
  html.querySelector('[data-action="rejectPurchase"]')?.addEventListener("click", () => handleDecision(message, purchase, "rejected"));
}

/* -------------------------------------------- */

/**
 * Render the purchase card content for the current state of a purchase.
 * @param {object} purchase  Purchase flag data.
 * @returns {Promise<string>}
 */
async function renderPurchaseContent(purchase) {
  return foundry.applications.handlebars.renderTemplate(TEMPLATE, {
    ...purchase,
    pending: purchase.status === "pending",
    statusLabel: _loc(STATUS_LABELS[purchase.status])
  });
}
