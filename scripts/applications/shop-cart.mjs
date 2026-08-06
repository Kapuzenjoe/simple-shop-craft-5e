import { breakdownPrice, roundToCopper } from "../shops/currency.mjs";
import { createPurchaseMessage } from "../chat/purchase-card.mjs";
import BasePromptDialog from "./base-prompt-dialog.mjs";

/**
 * Window showing the current shopping cart for a shop, with a confirm action.
 */
export default class ShopCart extends BasePromptDialog {

  /**
   * @param {object} [options]
   * @param {ShopEditor} [options.shopEditor]  The shop editor this cart belongs to.
   */
  constructor({ shopEditor, ...options }={}) {
    super({
      window: { title: "SIMPLE_SHOP_CRAFT_5E.ShopCart.Title", resizable: true },
      extraContent: () => ShopCart.#renderContent(shopEditor),
      buttons: () => {
        const state = ShopCart.#computeState(shopEditor);
        return [{ action: "confirm", label: "SIMPLE_SHOP_CRAFT_5E.ShopCart.Confirm", disabled: state.confirmDisabled }];
      },
      form: {
        closeOnSubmit: false,
        handler: async function(event, form, formData) {
          const state = ShopCart.#computeState(shopEditor);
          await createPurchaseMessage(shopEditor, state.actor, state.lines, state.sellLines, state.total.parts, state.netGP);
          ui.notifications.info(_loc("SIMPLE_SHOP_CRAFT_5E.ShopCart.PurchaseRequested"));
          shopEditor.cart.clear();
          shopEditor.sellCart.clear();
          await shopEditor.render();
          this.render();
        }
      },
      ...options
    });
    this.shopEditor = shopEditor;
  }

  /* -------------------------------------------- */

  /**
   * Compute the current buy/sell lines, net total, and confirm-eligibility for a shop editor's cart.
   * @param {ShopEditor} shopEditor
   * @returns {object}
   */
  static #computeState(shopEditor) {
    const lines = shopEditor.cartLines.map(row => ({
      ...row,
      subtotal: breakdownPrice(row.priceGP * row.cartQuantity, "gp", true)
    }));
    const sellLines = shopEditor.sellLines.map(row => ({
      ...row,
      subtotal: breakdownPrice(row.priceGP * row.sellQuantity, "gp")
    }));

    let buyTotalGP = 0;
    for ( const row of lines ) buyTotalGP += row.priceGP * row.cartQuantity;
    let sellTotalGP = 0;
    for ( const row of sellLines ) sellTotalGP += row.priceGP * row.sellQuantity;
    const netGP = roundToCopper(sellTotalGP - buyTotalGP);
    const hasLines = lines.length || sellLines.length;
    const total = { parts: hasLines ? breakdownPrice(Math.abs(netGP), "gp", netGP < 0) : [] };

    const actor = shopEditor.selectedActorUuid ? fromUuidSync(shopEditor.selectedActorUuid) : null;
    const balance = { insufficient: false };
    if ( actor && (netGP < 0) ) {
      const updates = game.dnd5e.applications.CurrencyManager.getActorCurrencyUpdates(actor, -netGP, "gp", {});
      balance.insufficient = !updates.remainder.almostEqual(0);
    }

    const noActiveGM = !game.users.activeGM;
    const confirmDisabled = noActiveGM || !hasLines || !actor || !!balance.insufficient;
    return { lines, sellLines, netGP, hasLines, total, actor, balance, noActiveGM, confirmDisabled };
  }

  /* -------------------------------------------- */

  /**
   * Render the buy list, sell list, and balance sections for the dialog's content.
   * @param {ShopEditor} shopEditor
   * @returns {Promise<string>}
   */
  static async #renderContent(shopEditor) {
    const state = ShopCart.#computeState(shopEditor);
    const buyRows = state.lines.map(row => ({
      img: row.item.img, name: row.item.name, quantity: row.cartQuantity, subtotal: row.subtotal
    }));
    const sellRows = state.sellLines.map(row => ({
      img: row.item.img, name: row.item.name, quantity: row.sellQuantity, subtotal: row.subtotal
    }));

    return foundry.applications.handlebars.renderTemplate(
      "modules/simple-shop-craft-5e/templates/shop-cart/content.hbs",
      {
        buyRows, sellRows, hasLines: state.hasLines, total: state.total,
        balance: state.balance, actor: state.actor, noActiveGM: state.noActiveGM
      }
    );
  }
}
