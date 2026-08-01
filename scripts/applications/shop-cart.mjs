import { breakdownPrice, roundToCopper } from "../shops/currency.mjs";
import { createPurchaseMessage } from "../chat/purchase-card.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Window showing the current shopping cart for a shop, with a confirm action.
 * @mixes HandlebarsApplicationMixin
 * @extends {ApplicationV2}
 */
export default class ShopCart extends HandlebarsApplicationMixin(ApplicationV2) {

  /**
   * @param {object} [options]
   * @param {ShopEditor} [options.shopEditor]  The shop editor this cart belongs to.
   */
  constructor(options={}) {
    super(options);
    this.shopEditor = options.shopEditor;
  }

  /** @override */
  static DEFAULT_OPTIONS = {
    id: "shop-cart-{id}",
    classes: ["dnd5e2", "simple-shop-craft-5e", "shop-cart"],
    window: {
      title: "SIMPLE_SHOP_CRAFT_5E.ShopCart.Title",
      resizable: true
    },
    position: {
      width: 400,
      height: "auto"
    },
    actions: {
      confirm: ShopCart.#confirm
    }
  };

  /** @override */
  static PARTS = {
    content: {
      template: "modules/simple-shop-craft-5e/templates/shop-cart.hbs",
      templates: ["modules/simple-shop-craft-5e/templates/partials/currency-amount.hbs"]
    }
  };

  /* -------------------------------------------- */

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.config = CONFIG.DND5E;
    context.lines = this.shopEditor.cartLines.map(row => ({
      ...row,
      subtotal: breakdownPrice(row.priceGP * row.cartQuantity, "gp", true)
    }));
    context.sellLines = this.shopEditor.sellLines.map(row => ({
      ...row,
      subtotal: breakdownPrice(row.priceGP * row.sellQuantity, "gp")
    }));

    let buyTotalGP = 0;
    for ( const row of context.lines ) buyTotalGP += row.priceGP * row.cartQuantity;
    let sellTotalGP = 0;
    for ( const row of context.sellLines ) sellTotalGP += row.priceGP * row.sellQuantity;
    const netGP = roundToCopper(sellTotalGP - buyTotalGP);
    const hasLines = context.lines.length || context.sellLines.length;
    context.hasLines = hasLines;
    context.total = { parts: hasLines ? breakdownPrice(Math.abs(netGP), "gp", netGP < 0) : [] };
    this.netGP = netGP;

    const actor = this.shopEditor.selectedActorUuid ? fromUuidSync(this.shopEditor.selectedActorUuid) : null;
    context.actor = actor;
    if ( actor ) {
      const currencies = CONFIG.DND5E.currencies;
      const currentGP = Object.entries(actor.system.currency ?? {})
        .reduce((sum, [denom, value]) => sum + value / (currencies[denom]?.conversion ?? 1), 0);
      const afterGP = currentGP + netGP;
      context.balance = {
        before: breakdownPrice(currentGP, "gp"),
        insufficient: afterGP < 0,
        after: afterGP >= 0 ? breakdownPrice(afterGP, "gp") : []
      };
    }

    context.noActiveGM = !game.users.activeGM;
    context.confirmDisabled = context.noActiveGM || !hasLines || !actor || !!context.balance?.insufficient;
    this.lastContext = context;
    return context;
  }

  /* -------------------------------------------- */

  /**
   * Handle confirming the transaction: posts a buy/sell request as a chat card for the GM to accept/reject.
   * Actual currency deduction and item transfer happen once the GM accepts (separate step).
   * @this {ShopCart}
   */
  static async #confirm() {
    const { actor, lines, sellLines, total } = this.lastContext;
    await createPurchaseMessage(this.shopEditor, actor, lines, sellLines, total.parts, this.netGP);
    ui.notifications.info(_loc("SIMPLE_SHOP_CRAFT_5E.ShopCart.PurchaseRequested"));
    this.shopEditor.cart.clear();
    this.shopEditor.sellCart.clear();
    await this.shopEditor.render();
    this.render();
  }
}
