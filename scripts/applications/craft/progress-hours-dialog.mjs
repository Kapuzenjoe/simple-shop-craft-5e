import { MODULE_ID, SETTING_KEYS } from "../../config.mjs";
import { formatDuration } from "../../utils.mjs";

const { Dialog5e } = globalThis.dnd5e.applications.api;

/**
 * Dialog replacing dnd5e's own activity usage dialog for the "Progress Craft" activity, letting the
 * player choose how many hours of progress this use contributes.
 * @param {object} options
 * @param {Activity} options.activity
 * @param {ActivityUseConfiguration} options.config
 * @param {number} options.max          Maximum hours selectable this use.
 * @param {number} options.initial      Default hours, split into whole hours and minutes for the fields.
 * @param {number} options.workedToday  Hours already worked toward the daily workday limit today.
 * @param {number} options.dailyMax     The daily workday limit, in hours.
 * @param {object[]} options.assistants  Characters that can assist, as `{ uuid, name, remaining }`.
 */
export default class ProgressHoursDialog extends Dialog5e {
  constructor({ activity, config, max, initial, workedToday, dailyMax, assistants=[], ...options }={}) {
    super(options);
    this.activity = activity;
    this.config = config;
    this.baseMax = max;
    this.assistants = assistants;
    const totalMinutes = Math.round(initial * 60);
    this.hours = Math.floor(totalMinutes / 60);
    this.minutes = totalMinutes % 60;
    this.workedToday = workedToday;
    this.dailyMax = dailyMax;
  }

  /* -------------------------------------------- */

  /** @override */
  static DEFAULT_OPTIONS = {
    id: "progress-hours-dialog-{id}",
    classes: ["simple-shop-craft-5e", "progress-hours-dialog", "standard-form"],
    window: { title: "SIMPLE_SHOP_CRAFT_5E.Craft.ProgressHoursDialog.Title" },
    position: { width: 400 },
    actions: {
      stepAmount: ProgressHoursDialog.#stepAmount
    },
    buttons: [
      { action: "confirm", label: "SIMPLE_SHOP_CRAFT_5E.Craft.ProgressHoursDialog.Confirm", icon: "fa-solid fa-check", default: true }
    ],
    form: { handler: ProgressHoursDialog.#onSubmit }
  };

  /* -------------------------------------------- */

  /** @override */
  static PARTS = {
    ...super.PARTS,
    content: { template: "modules/simple-shop-craft-5e/templates/craft/progress-hours-dialog/content.hbs" }
  };

  /* -------------------------------------------- */

  /**
   * The activity being used.
   * @type {Activity}
   */
  activity;

  /* -------------------------------------------- */

  /**
   * The usage config being configured, mutated in place and resolved back to dnd5e's own use() flow.
   * @type {ActivityUseConfiguration}
   */
  config;

  /* -------------------------------------------- */

  /**
   * Maximum hours selectable this use before accounting for assistants.
   * @type {number}
   */
  baseMax;

  /* -------------------------------------------- */

  /**
   * Characters that can assist, with the workday hours each has left.
   * @type {{ uuid: string, name: string, remaining: number }[]}
   */
  assistants;

  /* -------------------------------------------- */

  /**
   * UUIDs of the assistants currently chosen.
   * @type {string[]}
   */
  assistantUuids = [];

  /* -------------------------------------------- */

  /**
   * Maximum hours selectable this use, limited by each chosen assistant's remaining workday.
   * @type {number}
   */
  get max() {
    const chosen = this.assistants.filter(a => this.assistantUuids.includes(a.uuid));
    return Math.min(this.baseMax, ...chosen.map(a => a.remaining));
  }

  /* -------------------------------------------- */

  /**
   * Maximum number of assistants that can be chosen. Unlimited if the setting is empty.
   * @type {number}
   */
  get limit() {
    return game.settings.get(MODULE_ID, SETTING_KEYS.MAX_ASSISTANTS) ?? this.assistants.length;
  }

  /* -------------------------------------------- */

  /**
   * The whole hours currently entered.
   * @type {number}
   */
  hours;

  /* -------------------------------------------- */

  /**
   * The whole minutes currently entered, in addition to `hours`.
   * @type {number}
   */
  minutes;

  /* -------------------------------------------- */

  /**
   * Hours already worked toward the daily workday limit today.
   * @type {number}
   */
  workedToday;

  /* -------------------------------------------- */

  /**
   * The daily workday limit, in hours.
   * @type {number}
   */
  dailyMax;

  /* -------------------------------------------- */

  /**
   * Whether the dialog was confirmed rather than dismissed.
   * @type {boolean}
   */
  #used = false;

  get used() {
    return this.#used;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareContentContext(context, options) {
    context = await super._prepareContentContext(context, options);
    context.legend = this.options.window?.title;
    const exhausted = this.max <= 0;
    context.warn = exhausted;
    context.label = _loc("SIMPLE_SHOP_CRAFT_5E.Craft.ProgressHoursDialog.Progress");
    context.hint = exhausted
      ? _loc("SIMPLE_SHOP_CRAFT_5E.Craft.NoWorkdayRemaining")
      : _loc("SIMPLE_SHOP_CRAFT_5E.Craft.ProgressHoursDialog.HoursHint", {
        worked: formatDuration(this.workedToday, { days: false }),
        daily: formatDuration(this.dailyMax, { days: false })
      });
    context.hours = this.hours;
    context.minutes = this.minutes;
    context.assistantField = this.assistants.length ? [{
      field: new foundry.data.fields.SetField(new foundry.data.fields.StringField()), name: "assistants",
      label: _loc("SIMPLE_SHOP_CRAFT_5E.Craft.ProgressHoursDialog.Assistants"),
      value: this.assistantUuids, options: this.assistants.map(a => ({ value: a.uuid, label: a.name }))
    }] : null;
    return context;
  }

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers                */
  /* -------------------------------------------- */

  /**
   * Clamp the entered hours and minutes to the current maximum.
   */
  #clampAmount() {
    const maxMinutes = Math.round(this.max * 60);
    const maxHours = Math.floor(maxMinutes / 60);
    this.hours = Math.clamp(this.hours, 0, maxHours);
    const minutesCap = (this.hours >= maxHours) ? (maxMinutes % 60) : 59;
    this.minutes = Math.clamp(this.minutes, 0, minutesCap);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onChangeForm(formConfig, event) {
    super._onChangeForm(formConfig, event);
    if ( event.target.name !== "assistants" ) return;
    this.assistantUuids = event.target.value.slice(0, this.limit);
    this.#clampAmount();
    this.render();
  }

  /* -------------------------------------------- */

  /**
   * Handle stepping the hours or minutes value, clamped to the remaining workday budget.
   * @this {ProgressHoursDialog}
   * @param {Event} event         Triggering click event.
   * @param {HTMLElement} target  Button that was clicked.
   */
  static #stepAmount(event, target) {
    const step = Number(target.dataset.step);
    if ( target.dataset.field === "hours" ) this.hours += step;
    else this.minutes += step;
    this.#clampAmount();
    this.render();
  }

  /* -------------------------------------------- */

  /**
   * Handle confirming the chosen hours.
   * @this {ProgressHoursDialog}
   * @param {Event} event                Triggering submit event.
   * @param {HTMLFormElement} form       The submitted form.
   * @param {FormDataExtended} formData  Data from the form.
   * @returns {Promise<void>}
   */
  static async #onSubmit(event, form, formData) {
    if ( this.max <= 0 ) {
      ui.notifications.warn("SIMPLE_SHOP_CRAFT_5E.Craft.NoWorkdayRemaining", { localize: true });
      return;
    }
    const hoursThisUse = this.hours + (this.minutes / 60);
    if ( hoursThisUse <= 0 ) {
      ui.notifications.warn("SIMPLE_SHOP_CRAFT_5E.Craft.ProgressHoursDialog.NoAmountSelected", { localize: true });
      return;
    }
    this.config.simpleShopCraft5e = { hoursThisUse, assistantUuids: this.assistantUuids };
    this.#used = true;
    await this.close();
  }

  /* -------------------------------------------- */
  /*  Factory Methods                             */
  /* -------------------------------------------- */

  /**
   * Display the dialog, resolving with the (mutated) usage config on confirm, rejecting on dismissal.
   * @see dnd5e — ActivityUsageDialog#create()
   * @param {Activity} activity
   * @param {ActivityUseConfiguration} config
   * @param {object} [options]
   * @returns {Promise<ActivityUseConfiguration>}
   */
  static async create(activity, config, options={}) {
    return new Promise((resolve, reject) => {
      const dialog = new this({ activity, config, ...options });
      dialog.addEventListener("close", () => {
        if ( dialog.used ) resolve(dialog.config);
        else reject();
      }, { once: true });
      dialog.render({ force: true });
    });
  }
}
