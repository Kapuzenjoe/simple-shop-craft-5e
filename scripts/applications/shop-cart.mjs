import { createPurchaseMessage } from "../chat/purchase-card.mjs";
import { breakdownCopper } from "../shop/currency.mjs";
import { summarizeNet } from "../shop/pricing.mjs";

import BasePromptDialog from "./base-prompt-dialog.mjs";

/**
 * Window showing the current shopping cart for a shop, with a confirm action.
 */
export default class ShopCart extends BasePromptDialog {

  /**
   * @param {object} [options]
   * @param {ShopSheet} [options.shopSheet]  The shop editor this cart belongs to.
   */
  constructor({ shopSheet, ...options }={}) {
    super({
      window: { title: "SIMPLE_SHOP_CRAFT_5E.ShopCart.Title", resizable: true },
      extraContent: () => ShopCart.#renderContent(shopSheet),
      buttons: () => {
        const state = ShopCart.#computeState(shopSheet);
        return [{ action: "confirm", label: "DND5E.Confirm", disabled: state.confirmDisabled }];
      },
      form: {
        closeOnSubmit: false,
        handler: async function(event, form, formData) {
          const state = ShopCart.#computeState(shopSheet);
          await createPurchaseMessage(
            shopSheet, state.actor, state.lines, state.sellLines, state.total.parts, state.netCP
          );
          ui.notifications.info("SIMPLE_SHOP_CRAFT_5E.ShopCart.PurchaseRequested");
          shopSheet.cart.clear();
          shopSheet.sellCart.clear();
          await shopSheet.render();
          this.render();
        }
      },
      ...options
    });
    this.shopSheet = shopSheet;
  }

  /* -------------------------------------------- */

  /**
   * Compute the current buy/sell lines, net total, and confirm-eligibility for a shop editor's cart.
   * @param {ShopSheet} shopSheet
   * @returns {object}
   */
  static #computeState(shopSheet) {
    const lines = shopSheet.cartLines.map(row => ({
      ...row,
      subtotal: breakdownCopper(row.priceCP * row.cartQuantity, { negative: true })
    }));
    const sellLines = shopSheet.sellLines.map(row => ({
      ...row,
      subtotal: breakdownCopper(row.priceCP * row.sellQuantity)
    }));

    const { count, netCP, parts } = summarizeNet(lines, sellLines);
    const hasLines = count > 0;
    const total = { parts };

    const actor = shopSheet.selectedActorUuid ? fromUuidSync(shopSheet.selectedActorUuid) : null;
    const balance = { insufficient: false };
    if ( actor && (netCP < 0) ) {
      const updates = game.dnd5e.applications.CurrencyManager.getActorCurrencyUpdates(actor, -netCP, "cp", {});
      balance.insufficient = !updates.remainder.almostEqual(0);
    }

    const noActiveGM = !game.users.activeGM;
    const confirmDisabled = noActiveGM || !hasLines || !actor || !!balance.insufficient;
    return { lines, sellLines, netCP, hasLines, total, actor, balance, noActiveGM, confirmDisabled };
  }

  /* -------------------------------------------- */

  /**
   * Render the buy list, sell list, and balance sections for the dialog's content.
   * @param {ShopSheet} shopSheet
   * @returns {Promise<string>}
   */
  static async #renderContent(shopSheet) {
    const state = ShopCart.#computeState(shopSheet);
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
