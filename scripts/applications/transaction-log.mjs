import { Shop } from "../data/shop-data.mjs";
import Transaction from "../data/transaction-data.mjs";
import { breakdownCopper, promptImportFiles } from "../utils.mjs";

const { ApplicationV2, DialogV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Window listing the completed purchases and sales of the transaction log in the style of a log file.
 * @param {object} [options={}]
 * @param {string} [options.shopId]  Limit the log to the transactions of this shop.
 */
export default class TransactionLog extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(options={}) {
    super(options);
    this.#shopId = options.shopId ?? null;
  }

  /* -------------------------------------------- */

  /** @override */
  static DEFAULT_OPTIONS = {
    id: "transaction-log-{id}",
    classes: ["simple-shop-craft-5e", "transaction-log"],
    window: { icon: "fa-solid fa-scroll", title: "SIMPLE_SHOP_CRAFT_5E.TransactionLog.Title", resizable: true },
    position: { width: 760, height: 480 },
    actions: {
      exportLog: TransactionLog.#exportLog,
      importLog: TransactionLog.#importLog,
      clearLog: TransactionLog.#clearLog
    }
  };

  /* -------------------------------------------- */

  /** @override */
  static PARTS = {
    content: { template: "modules/simple-shop-craft-5e/templates/transaction-log/content.hbs" }
  };

  /* -------------------------------------------- */

  /**
   * ID of the shop the log is limited to, or `null` for all shops.
   * @type {string|null}
   */
  #shopId;

  /* -------------------------------------------- */

  /**
   * Whether an entry belongs to the shop the log is limited to, if any.
   * @param {{ shopId: string }} entry
   * @returns {boolean}
   */
  #inScope = entry => !this.#shopId || (entry.shopId === this.#shopId);

  /* -------------------------------------------- */

  /** @inheritDoc */
  get title() {
    const shop = Shop.get(this.#shopId);
    return shop ? `${super.title} — ${shop.name}` : super.title;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const itemList = lines => lines
      .map(({ name, quantity }) => (quantity > 1) ? `${quantity}× ${name}` : name).join(", ");
    const number = new Intl.NumberFormat(game.i18n.lang);
    context.showShop = !this.#shopId;
    context.entries = Transaction.getAll()
      .filter(this.#inScope)
      .map(entry => ({
        time: new Date(entry.timestamp).toLocaleString(game.i18n.lang),
        worldTime: game.time.calendar?.format(entry.worldTime) ?? "",
        shopName: entry.shopName, actorName: entry.actorName,
        bought: itemList(entry.buyLines), sold: itemList(entry.sellLines),
        net: breakdownCopper(Math.abs(entry.netCP), { negative: entry.netCP < 0 })
          .map(({ denomination, value }) => {
            return `${number.format(value)} ${CONFIG.DND5E.currencies[denomination].abbreviation}`;
          })
          .join(" ")
      }));
    return context;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _onRender(context, options) {
    await super._onRender(context, options);
    const entries = this.element.querySelector(".log-entries");
    entries.scrollTop = entries.scrollHeight;
    this.element.querySelector('[name="search"]').addEventListener("input", event => {
      const query = event.target.value.toLowerCase();
      for ( const entry of entries.children ) entry.hidden = !entry.textContent.toLowerCase().includes(query);
    });
  }

  /* -------------------------------------------- */

  /**
   * Handle exporting the logged transactions of this shop to a JSON file.
   * @this {TransactionLog}
   */
  static #exportLog() {
    const data = Transaction.getAll().filter(this.#inScope).map(entry => entry.toObject());
    const filename = ["simple-shop-craft-5e-transactions", Shop.get(this.#shopId)?.name.slugify()].filterJoin("-");
    foundry.utils.saveDataToFile(JSON.stringify(data, null, 2), "application/json", `${filename}.json`);
  }

  /* -------------------------------------------- */

  /**
   * Handle importing logged transactions from a JSON file into the log of this shop.
   * @this {TransactionLog}
   * @returns {Promise<void>}
   */
  static async #importLog() {
    const files = await promptImportFiles({
      title: "SIMPLE_SHOP_CRAFT_5E.TransactionLog.Import",
      hint: "SIMPLE_SHOP_CRAFT_5E.TransactionLog.ImportHint"
    });
    if ( !files ) return;
    try {
      const data = JSON.parse(await foundry.utils.readTextFromFile(files[0]));
      const entries = data.map(raw => new Transaction({ ...raw, shopId: this.#shopId }).toObject());
      const added = await Transaction.merge(entries);
      if ( added ) ui.notifications.info("SIMPLE_SHOP_CRAFT_5E.TransactionLog.ImportDone", { format: { count: added } });
      else ui.notifications.warn("SIMPLE_SHOP_CRAFT_5E.TransactionLog.ImportNone", { localize: true });
    } catch ( err ) {
      console.error(err);
      ui.notifications.error("SIMPLE_SHOP_CRAFT_5E.TransactionLog.ImportFailed", { localize: true });
    }
  }

  /* -------------------------------------------- */

  /**
   * Handle deleting the logged transactions shown in this window.
   * @this {TransactionLog}
   * @returns {Promise<void>}
   */
  static async #clearLog() {
    const key = this.#shopId ? "ClearConfirmShop" : "ClearConfirmAll";
    const confirmed = await DialogV2.confirm({
      window: { title: "SIMPLE_SHOP_CRAFT_5E.TransactionLog.Clear" },
      content: `<p>${_loc(`SIMPLE_SHOP_CRAFT_5E.TransactionLog.${key}`)}</p>`
    });
    if ( confirmed ) await Transaction.deleteWhere(this.#inScope);
  }
}
