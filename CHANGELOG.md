# Changelog

## 0.1.0

- Added automatic shop restock: pick the weekdays a shop restocks on via the restock button next to the manual
  reset action. Runs at the next in-game day change once dnd5e's Calendar Configuration is enabled, or the
  Calendaria module is active.
- Changed haggling lockouts (after a failed Influence check) to expire automatically at the next in-game day
  change under the same calendar requirement as restock, instead of requiring a manual GM unlock.
- Added shop opening hours: a daily open/close time (24-hour, to the minute) set per shop under the Description
  tab, shown in the Shop Manager's shop list.
  - Players can't open a closed shop and get a notification; GMs can still open it in Play Mode and see a
    closed-shop warning near the shop cart.
  - Added weekday-based closures: pick the weekdays a shop is always closed on.
  - Added festival-based closures: pick specific festivals a shop is closed on, when the active calendar
    (Calendaria, or dnd5e's own Harptos preset) defines any.
  - Added a manual status override to force a shop open or closed regardless of hours, weekdays, or festivals.
- Fixed several notifications showing their raw localization key instead of the translated message.
- Fixed the item generator sometimes creating items with no price (0 gp) — mundane items without a value are now filtered out like priceless magic items already were.
- Changed selling to a shop so an item can't be sold for more than the shop's Settlement Cap, if set, matching the existing cap on what a shop offers to buy from players.
  - Added a checkbox next to the Settlement Cap to turn this off (on by default).
- Fixed the buy/sell quantity counters ignoring the Settlement Cap, letting items exceeding it be added to the cart despite the warning shown.
- Fixed the item generator ignoring the Settlement Cap, letting generated items over it silently land in the shop as unbuyable.
- Fixed the shop's Gold Pool being visible to players — it's now only shown to the GM.
- Added an optional "Skill Proficiencies" setting on recipes (e.g. Arcana for spell scrolls) — an actor proficient in any of the listed skills may start the craft without needing to also own or be proficient with one of the recipe's tools.
- Fixed haggling throwing a permission error for players ("lacks permission to update Setting") — the resulting discount lock is now relayed through an online GM instead of being written directly by the player.
- Fixed a recipe's Duration Override being ignored by the "Progress Craft" activity — each activation now costs and adds the recipe's own per-use duration (converted to whole hours or minutes as needed) instead of always using the fixed 8-hour workday increment. (#1)


## 0.0.1

- Initial release
