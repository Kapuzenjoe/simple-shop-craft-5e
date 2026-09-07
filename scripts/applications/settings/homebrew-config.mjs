import { SETTING_KEYS } from "../../config.mjs";

import BaseSettingsConfig from "./base-config.mjs";

/**
 * Optional house-rule overrides for module mechanics.
 */
export default class HomebrewConfig extends BaseSettingsConfig {

  /** @override */
  static DEFAULT_OPTIONS = {
    window: {
      icon: "fa-solid fa-book",
      title: "SIMPLE_SHOP_CRAFT_5E.Settings.Homebrew.Name"
    }
  };

  /* -------------------------------------------- */

  /** @override */
  static FIELDSETS = [
    {
      legend: "SIMPLE_SHOP_CRAFT_5E.Settings.Homebrew.Groups.Crafting",
      keys: [SETTING_KEYS.MAX_HOURS_PER_WORKDAY, SETTING_KEYS.CALENDAR_MODE]
    }
  ];
}
