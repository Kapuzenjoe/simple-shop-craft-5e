import { MODULE_ID, SETTING_KEYS } from "../config.mjs";
import { breakdownPrice, effectiveGoldPool, roundToCopper } from "../shops/currency.mjs";
import { entryKey, resolveShopItems } from "../shops/item-resolver.mjs";

const TEMPLATE = "modules/simple-shop-craft-5e/templates/chat/purchase-card.hbs";

const STATUS_LABELS = {
  pending: "SIMPLE_SHOP_CRAFT_5E.PurchaseCard.Status.Pending",
  accepted: "SIMPLE_SHOP_CRAFT_5E.PurchaseCard.Status.Accepted",
  rejected: "SIMPLE_SHOP_CRAFT_5E.PurchaseCard.Status.Rejected"
};

/**
 * Register hooks needed to handle purchase chat cards.
 * @returns {void}
 */
export function registerPurchaseCard() {
  Hooks.on("dnd5e.renderChatMessage", onRenderPurchaseCard);
}

/* -------------------------------------------- */

/**
 * Create a chat message requesting GM confirmation for a pending buy/sell transaction.
 * @param {ShopEditor} shopEditor    The shop editor the transaction originates from.
 * @param {Actor5e} actor            The acting actor.
 * @param {Array<object>} buyLines   Buy cart lines, as prepared by {@link ShopCart#_prepareContext}.
 * @param {Array<object>} sellLines  Sell cart lines, as prepared by {@link ShopCart#_prepareContext}.
 * @param {Array<object>} total      Combined (buy - sell) price breakdown parts.
 * @param {number} netGP             Combined total in GP; negative = actor owes, positive = actor is owed.
 * @returns {Promise<ChatMessage>}
 */
export async function createPurchaseMessage(shopEditor, actor, buyLines, sellLines, total, netGP) {
  const purchase = {
    status: "pending",
    shopId: shopEditor.shopId,
    shopName: shopEditor.shop.name,
    shopImg: shopEditor.shop.img,
    actorUuid: actor.uuid,
    actorName: actor.name,
    buyLines: buyLines.map(row => ({
      identifier: row.entry.identifier,
      uuid: row.entry.uuid,
      name: row.item.name,
      img: row.item.img,
      quantity: row.cartQuantity,
      priceGP: row.priceGP,
      subtotal: row.subtotal
    })),
    sellLines: sellLines.map(row => ({
      itemId: row.item.id,
      identifier: row.item.system.identifier,
      name: row.item.name,
      img: row.item.img,
      quantity: row.sellQuantity,
      priceGP: row.priceGP,
      subtotal: row.subtotal
    })),
    total,
    netGP
  };

  return ChatMessage.create({
    content: await renderPurchaseContent(purchase),
    speaker: ChatMessage.getSpeaker({ actor }),
    flags: { [MODULE_ID]: { purchase } }
  });
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

/* -------------------------------------------- */

/**
 * Wire the Accept/Reject buttons on a rendered purchase card. GM-only.
 * @param {ChatMessage} message  The rendered chat message.
 * @param {HTMLElement} html     Root element of the rendered message.
 */
function onRenderPurchaseCard(message, html) {
  if ( !game.user.isGM ) return;

  const purchase = message.getFlag(MODULE_ID, "purchase");
  if ( !purchase || (purchase.status !== "pending") ) return;

  html.querySelector('[data-action="acceptPurchase"]')?.addEventListener("click", () => handleDecision(message, purchase, "accepted"));
  html.querySelector('[data-action="rejectPurchase"]')?.addEventListener("click", () => handleDecision(message, purchase, "rejected"));
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
  if ( (decision === "accepted") && !(await applyPurchase(purchase)) ) return;

  const updated = { ...purchase, status: decision };
  await message.update({
    content: await renderPurchaseContent(updated),
    [`flags.${MODULE_ID}.purchase`]: updated
  });
}

/* -------------------------------------------- */

/**
 * Apply an accepted transaction: deduct/credit currency, transfer items both ways, adjust shop stock.
 * Aborts without making any changes if stock, ownership, or funds are no longer sufficient at accept time
 * (the buyer's actor or the shop may have changed since the request was made).
 * @param {object} purchase  Purchase flag data.
 * @returns {Promise<boolean>}  Whether the transaction was applied.
 */
async function applyPurchase(purchase) {
  const actor = fromUuidSync(purchase.actorUuid);
  if ( !actor ) {
    ui.notifications.error(_loc("SIMPLE_SHOP_CRAFT_5E.PurchaseCard.MissingActor"));
    return false;
  }

  const shops = game.settings.get(MODULE_ID, SETTING_KEYS.SHOPS);
  const shop = shops.find(s => s._id === purchase.shopId);
  if ( !shop ) {
    ui.notifications.error(_loc("SIMPLE_SHOP_CRAFT_5E.PurchaseCard.MissingShop"));
    return false;
  }

  for ( const line of purchase.buyLines ) {
    const entry = shop.items.find(i => entryKey(i) === entryKey(line));
    if ( (entry?.stock.current !== null) && (entry?.stock.current < line.quantity) ) {
      ui.notifications.error(_loc("SIMPLE_SHOP_CRAFT_5E.PurchaseCard.InsufficientStock"));
      return false;
    }
  }

  for ( const line of purchase.sellLines ) {
    const owned = actor.items.get(line.itemId);
    if ( !owned || (owned.system.quantity < line.quantity) ) {
      ui.notifications.error(_loc("SIMPLE_SHOP_CRAFT_5E.PurchaseCard.InsufficientSellQuantity"));
      return false;
    }
  }

  const sellTotalGP = roundToCopper(purchase.sellLines.reduce((sum, line) => sum + (line.priceGP * line.quantity), 0));
  const effectiveGoldCurrent = effectiveGoldPool(shop.goldPool);
  if ( (effectiveGoldCurrent !== null) && (effectiveGoldCurrent < sellTotalGP) ) {
    ui.notifications.error(_loc("SIMPLE_SHOP_CRAFT_5E.PurchaseCard.InsufficientShopGold"));
    return false;
  }

  const resolved = await resolveShopItems(purchase.buyLines.map(line => ({ identifier: line.identifier, uuid: line.uuid })));
  const itemsToCreate = [];
  const itemUpdates = [];
  for ( const [index, line] of purchase.buyLines.entries() ) {
    const indexEntry = resolved[index].item;
    const bundleSize = (indexEntry?.system?.quantity > 1) ? indexEntry.system.quantity : 1;
    const totalQuantity = line.quantity * bundleSize;

    const existing = line.identifier ? actor.items.find(i => i.system.identifier === line.identifier) : null;
    if ( existing ) {
      itemUpdates.push({ _id: existing.id, "system.quantity": existing.system.quantity + totalQuantity });
      continue;
    }

    const fullItem = indexEntry?.uuid ? await fromUuid(indexEntry.uuid) : null;
    if ( !fullItem ) {
      ui.notifications.error(_loc("SIMPLE_SHOP_CRAFT_5E.PurchaseCard.MissingItem"));
      return false;
    }
    const itemData = fullItem.toObject();
    delete itemData._id;
    itemData.system.quantity = totalQuantity;
    itemsToCreate.push(itemData);
  }

  const itemsToDelete = [];
  for ( const line of purchase.sellLines ) {
    const owned = actor.items.get(line.itemId);
    const remaining = owned.system.quantity - line.quantity;
    if ( remaining > 0 ) itemUpdates.push({ _id: line.itemId, "system.quantity": remaining });
    else itemsToDelete.push(line.itemId);
  }

  if ( purchase.netGP < 0 ) {
    const parts = breakdownPrice(-purchase.netGP, "gp");
    try {
      for ( const part of parts ) {
        await game.dnd5e.applications.CurrencyManager.deductActorCurrency(actor, part.value, part.denomination);
      }
    } catch ( err ) {
      ui.notifications.error(err.message);
      return false;
    }
  } else if ( purchase.netGP > 0 ) {
    const amounts = breakdownPrice(purchase.netGP, "gp")
      .reduce((obj, part) => Object.assign(obj, { [part.denomination]: part.value }), {});
    await game.dnd5e.applications.Award.awardCurrency(amounts, [actor]);
  }

  if ( itemsToCreate.length ) await actor.createEmbeddedDocuments("Item", itemsToCreate);
  if ( itemUpdates.length ) await actor.updateEmbeddedDocuments("Item", itemUpdates);
  if ( itemsToDelete.length ) await actor.deleteEmbeddedDocuments("Item", itemsToDelete);

  const items = shop.items.map(entry => {
    const line = purchase.buyLines.find(l => entryKey(l) === entryKey(entry));
    if ( !line || (entry.stock.current === null) ) return entry.toObject();
    return { ...entry.toObject(), stock: { ...entry.stock, current: entry.stock.current - line.quantity } };
  });
  for ( const line of purchase.sellLines ) {
    if ( !line.identifier ) continue;
    const existing = items.find(i => i.identifier === line.identifier);
    if ( existing ) {
      if ( existing.stock.current !== null ) existing.stock.current += line.quantity;
    } else {
      items.push({ identifier: line.identifier, stock: { max: null, current: line.quantity } });
    }
  }

  const goldPool = { ...shop.goldPool };
  if ( effectiveGoldCurrent !== null ) {
    const parts = breakdownPrice(effectiveGoldCurrent - sellTotalGP, "gp", false, ["ep", "pp"]);
    goldPool.current = Object.fromEntries(parts.map(p => [p.denomination, p.value]));
  }

  await game.settings.set(MODULE_ID, SETTING_KEYS.SHOPS,
    shops.map(s => s._id === shop._id ? { ...s.toObject(), items, goldPool } : s.toObject()));

  return true;
}
