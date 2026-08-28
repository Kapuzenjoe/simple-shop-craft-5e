import { MODULE_ID } from "../config.mjs";

import { EnchantedItemBlueprint } from "./enchanted-item-blueprint.mjs";
import { Shop } from "./shop-data.mjs";
import { SpellScrollBlueprint } from "./spell-scroll-blueprint.mjs";

const {
  ArrayField, DocumentUUIDField, EmbeddedDataField, FilePathField, NumberField, SchemaField, StringField
} = foundry.data.fields;

/**
 * @import { default as ShopSheet } from "../applications/shops/shop-sheet.mjs";
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
 * A data model that represents a purchase chat card's own flag data.
 * @extends {foundry.abstract.DataModel}
 */
export class PurchaseMessageData extends foundry.abstract.DataModel {

  /** @override */
  static defineSchema() {
    return {
      status: new StringField({ initial: "pending", choices: ["pending", "accepted", "rejected"] }),
      shopId: new StringField({ blank: true }),
      shopName: new StringField(),
      shopImg: new FilePathField({ categories: ["IMAGE"] }),
      actorUuid: new DocumentUUIDField({ type: "Actor" }),
      actorName: new StringField(),
      buyLines: new ArrayField(new SchemaField({
        identifier: new StringField({ blank: true }),
        uuid: new DocumentUUIDField({ type: "Item", blank: true }),
        generated: new EmbeddedDataField(EnchantedItemBlueprint, { nullable: true, initial: null }),
        spellScroll: new EmbeddedDataField(SpellScrollBlueprint, { nullable: true, initial: null }),
        name: new StringField(), img: new FilePathField({ categories: ["IMAGE"] }),
        quantity: new NumberField(), priceCP: new NumberField(), bundleSize: new NumberField({ initial: 1 }),
        subtotal: currencyPartsField()
      })),
      sellLines: new ArrayField(new SchemaField({
        itemId: new StringField(), identifier: new StringField({ blank: true }),
        name: new StringField(), img: new FilePathField({ categories: ["IMAGE"] }),
        quantity: new NumberField(), priceCP: new NumberField(), subtotal: currencyPartsField()
      })),
      total: currencyPartsField(),
      netCP: new NumberField({ initial: 0 })
    };
  }

  /* -------------------------------------------- */

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
  static async create(shopSheet, actor, buyLines, sellLines, totalParts, netCP) {
    const purchase = new PurchaseMessageData({
      shopId: shopSheet.shopId, shopName: shopSheet.shop.name, shopImg: shopSheet.shop.img,
      actorUuid: actor.uuid, actorName: actor.name,
      buyLines: buyLines.map(row => ({
        identifier: row.entry.identifier, uuid: row.entry.uuid,
        generated: row.entry.generated ?? null, spellScroll: row.entry.spellScroll ?? null,
        name: row.item.name, img: row.item.img, quantity: row.cartQuantity, priceCP: row.priceCP,
        bundleSize: row.bundleSize ?? 1, subtotal: row.subtotal
      })),
      sellLines: sellLines.map(row => ({
        itemId: row.item.id, identifier: row.item.system.identifier,
        name: row.item.name, img: row.item.img, quantity: row.sellQuantity, priceCP: row.priceCP,
        subtotal: row.subtotal
      })),
      total: totalParts, netCP
    });

    return ChatMessage.create({
      content: await purchase.renderContent(),
      speaker: ChatMessage.getSpeaker({ actor }),
      flags: { [MODULE_ID]: { purchase: purchase.toObject() } }
    });
  }

  /* -------------------------------------------- */

  /**
   * Wire the Accept/Reject buttons on a rendered purchase card. GM-only.
   * @param {ChatMessage} message  The rendered chat message.
   * @param {HTMLElement} html     Root element of the rendered message.
   */
  static onRender(message, html) {
    const flag = message.getFlag(MODULE_ID, "purchase");
    if ( !flag || (flag.status !== "pending") ) return;

    if ( !game.user.isGM ) {
      html.querySelector(".card-buttons")?.remove();
      return;
    }

    const purchase = new PurchaseMessageData(flag);
    html.querySelector('[data-action="acceptPurchase"]')?.addEventListener("click", () => purchase.#handleDecision(message, "accepted"));
    html.querySelector('[data-action="rejectPurchase"]')?.addEventListener("click", () => purchase.#handleDecision(message, "rejected"));
  }

  /* -------------------------------------------- */

  /**
   * Render this card's content for its current status.
   * @returns {Promise<string>}
   */
  async renderContent() {
    return foundry.applications.handlebars.renderTemplate(TEMPLATE, {
      ...this.toObject(), pending: this.status === "pending", statusLabel: _loc(STATUS_LABELS[this.status])
    });
  }

  /* -------------------------------------------- */

  /**
   * Record the GM's decision on this pending transaction.
   * @param {ChatMessage} message              The purchase chat message.
   * @param {"accepted"|"rejected"} decision
   * @returns {Promise<void>}
   */
  async #handleDecision(message, decision) {
    if ( decision === "accepted" ) {
      const result = await Shop.applyPurchase(this.toObject());
      if ( !result.ok ) {
        ui.notifications.error(result.error, { localize: true });
        return;
      }
    }

    this.updateSource({ status: decision });
    await message.update({
      content: await this.renderContent(),
      [`flags.${MODULE_ID}.purchase`]: this.toObject()
    });
  }
}

/**
 * A currency breakdown, largest denomination to smallest.
 * @returns {ArrayField}
 */
function currencyPartsField() {
  return new ArrayField(new SchemaField({ denomination: new StringField(), value: new NumberField() }));
}
