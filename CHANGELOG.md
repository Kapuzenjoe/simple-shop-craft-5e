# Changelog

## 0.4.0

- Changed a recipe's "Open to All" checkbox to a three-way Unlock Mode: Individual, Open to All, or Tool-Proficient (any actor proficient in the recipe's required tool).
- Changed the Recipes list's Unlocked hover to also show current Tool-Proficient party characters.

## 0.3.0

- Added a "Fill from Table" action to a shop's Buy tab, drawing items from a RollTable into its stock.
- Added a "Magical Items" rule to a shop's Vendor Settings dialog, controlling which magic items skip the default stock and are excluded from restock instead.
- Added a "Purchase Only" toggle to a shop's Vendor Settings dialog, disabling its Sell tab.
- Added an item tooltip and tool/skill proficiency icons (hover for details) to the Shop Manager's Recipes list.
- Added default max stock per item type, set in the Vendor Settings dialog.
- Added search and sort by name/settlement cap to the Shop Manager's Shops list, plus a Settlement Cap column.
- Added search, type filter, and sort by name/material value to the Shop Manager's Recipes list, plus Material Value and Duration columns.
- Added search, type filter, and sort by name/price to a shop's Buy and Sell tables.
- Changed a shop item's "Exclude from Restock" toggle to a Normal/Unlimited/Exclude stock mode.
- Changed the Recipes list's Unlocked count to show unlocked actor names on hover; hidden from players entirely.
- Fixed the Vendor Settings dialog's currency fields never appearing.
- Renamed the shop's Max. Shop Money dialog to Vendor Settings.

## 0.2.1

- Fixed starting a craft with an unallocated optional material sometimes deleting it from the actor.
- Fixed accepting a craft where the same owned item was allocated to two material slots deducting it only once.
- Fixed a fixed material never being recognized as owned when its recipe reference had no resolvable identifier.
- Added a warning icon in the Recipe Editor for a fixed material with no distinct identifier, since it won't reliably match an owned item during crafting.
- Fixed the Recipe Editor's required material value not scaling with a recipe's target quantity, showing a lower threshold than the craft order actually requires.
- Fixed the craft order occasionally computing a fractional-copper material threshold, leaving the Start button disabled despite the displayed amounts matching.
- Fixed a bundled material's crafting value rounding to 0 in the Recipe Editor while the craft order still charged a fraction of a copper for it — both now divide before converting to copper, matching the shop's own pricing.
- Fixed the item generator being able to roll unusable "Enspelled Weapon"/"Enspelled Armor" template items (already excluded "Enspelled Staff" - the plan is to implement a logic similar to that used in spell-scrolls here.). 
- Fixed a recipe's tool and skill proficiency requirements being combined with OR instead of AND.
- Fixed a required fixed material showing only its allocated count instead of how many are still needed.
- Fixed a material quantity stepper not clamping to its maximum, making the minus button appear frozen after over-clicking plus.
- Fixed the Recipe Editor silently hiding a material whose referenced item could no longer be found, leaving no way to remove it.
- Fixed the Recipe Editor showing no price for a material valued only by its rarity, unlike the craft order.
- Fixed changing a recipe's target item via its UUID field not updating its bundle-size quantity.
- Fixed a required fixed material only counting the first matching stack, undercounting how much a player actually owns across multiple stacks.

## 0.2.0

- Added an automatic Arcana suggestion under a recipe's Skill Proficiencies when the target item is magical.
- Fixed recipes/materials referencing a legacy (2014 Rules) item failing to resolve under modern rules.
- Fixed the shop's Settlement Cap value fields being invisible on dnd5e 5.3.3.
- Fixed clicking a generated item's name in the Buy/Sell table throwing an error.
- Reworked the recipe material system:
  - Added type/subtype/minimum-value rules as an alternative to fixed item references.
  - Added a required quantity and a "Required" toggle per material.
  - Added a crafting-value override per material, independent of its market price.
  - Added an "Ignore Crafting Value" recipe option for material-presence-only crafting.
  - Added interactive quantity selection for materials in the craft order.
  - Added interactive quantity selection for target items.
  - Changed the material tables to match the shop's Buy/Sell layout, with hover tooltips.
  - Fixed world items (not from a compendium) sometimes not counting as owned.
  - Fixed a few incorrect or missing hints about why a craft can't be started.

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
