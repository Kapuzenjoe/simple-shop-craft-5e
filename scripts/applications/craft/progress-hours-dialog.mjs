import { formatDuration } from "../../utils.mjs";

const { Dialog5e } = globalThis.dnd5e.applications.api;

/**
 * @import { ActivityUseConfiguration } from "../../_types.mjs";
 */

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
 */
export default class ProgressHoursDialog extends Dialog5e {
  constructor({ activity, config, max, initial, workedToday, dailyMax, ...options }={}) {
    super(options);
    this.activity = activity;
    this.config = config;
    this.max = max;
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
    buttons: [
      { action: "confirm", label: "SIMPLE_SHOP_CRAFT_5E.Craft.ProgressHoursDialog.Confirm", icon: "fa-solid fa-check", default: true }
    ],
    form: { handler: ProgressHoursDialog.#onSubmit }
  };

  /* -------------------------------------------- */

  /** @override */
  static PARTS = {
    ...super.PARTS,
    content: { template: "modules/simple-shop-craft-5e/templates/progress-hours-dialog/content.hbs" }
  };

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
   * Maximum hours selectable this use.
   * @type {number}
   */
  max;

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
  used = false;

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareContentContext(context, options) {
    context = await super._prepareContentContext(context, options);
    context.legend = this.options.window?.title;
    const exhausted = this.max <= 0;
    const maxMinutes = Math.round(this.max * 60);
    const maxHours = Math.floor(maxMinutes / 60);
    const minutesCap = (this.hours >= maxHours) ? (maxMinutes % 60) : 59;
    context.disabled = exhausted;
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
    context.hoursField = new foundry.data.fields.NumberField({
      min: 0, max: exhausted ? 0 : maxHours, integer: true, required: true
    });
    context.minutesField = new foundry.data.fields.NumberField({
      min: 0, max: exhausted ? 0 : minutesCap, integer: true, required: true
    });
    return context;
  }

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers                */
  /* -------------------------------------------- */

  /**
   * Handle keeping the minutes field's valid range in sync with the currently entered hours.
   * @param {ApplicationFormConfiguration} formConfig
   * @param {Event} event
   * @returns {void}
   */
  _onChangeForm(formConfig, event) {
    super._onChangeForm(formConfig, event);
    const data = new foundry.applications.ux.FormDataExtended(this.form).object;
    const maxMinutes = Math.round(this.max * 60);
    const maxHours = Math.floor(maxMinutes / 60);
    this.hours = Math.min(Number(data.hours) || 0, maxHours);
    const minutesCap = (this.hours >= maxHours) ? (maxMinutes % 60) : 59;
    this.minutes = Math.min(Number(data.minutes) || 0, minutesCap);
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
    const data = foundry.utils.expandObject(formData.object);
    const hoursThisUse = Number(data.hours) + (Number(data.minutes) / 60);
    if ( hoursThisUse <= 0 ) {
      ui.notifications.warn("SIMPLE_SHOP_CRAFT_5E.Craft.ProgressHoursDialog.NoAmountSelected", { localize: true });
      return;
    }
    this.config.simpleShopCraft5e = { hoursThisUse };
    this.used = true;
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
