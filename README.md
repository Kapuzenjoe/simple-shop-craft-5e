# Simple Shop & Craft 5e

![Static Badge](https://img.shields.io/badge/Foundry-v14-informational)
![Static Badge](https://img.shields.io/badge/Dnd5e-v5.3-informational)

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/peterlankton86911)

**Simple Shop & Craft 5e** adds shop management and crafting to the **dnd5e** system in Foundry VTT. GMs
configure shops and recipes; players buy, sell, haggle, and craft directly from their own sheets.

> Every transaction — buying, selling, starting a craft — goes through a GM-confirmation chat card before
> anything actually changes.

## Highlights

- Any number of independent shops, each with its own buy/sell modifiers, settlement cap, and money pool
- Haggling: a skill check against the shop NPC's attitude that temporarily adjusts prices
- Per-player buy/sell discounts, layered additively on top of a shop's own modifiers
- A magic item generator with per-type filters and dedicated spell scroll filters (school, class, level, ritual)
- Crafting: GM-defined recipes, a player-facing start flow, and progress tracked on a real in-game item

---

## Shops & Trading

- Buy/Sell tabs list price, weight, and stock per item; the settlement cap caps individual item prices, the
  shop money pool is tracked separately from player currency.
- The "Acting As" selector lets a GM operate the sheet on behalf of any player character.
- Every buy/sell line from a visit is collected into one cart and confirmed as a single net total.

<table>
  <tr>
    <td colspan="2">
      <strong>Shop sheet</strong><br>
      <img src="docs/example_shop_sheet.png" alt="Shop sheet showing the Buy tab of the Blacksmith shop" width="100%">
    </td>
  </tr>
  <tr>
    <td width="50%">
      <strong>Shopping cart</strong><br>
      <img src="docs/example_shopping_cart.png" alt="Shopping cart summarizing items to buy and sell before confirming" width="320">
    </td>
    <td width="50%">
      <strong>Purchase confirmation</strong><br>
      <img src="docs/example_chat_card.png" alt="Chat card requesting GM confirmation for a purchase" width="320">
    </td>
  </tr>
</table>

---

## Haggling & Discounts

- Haggling rolls a chosen skill against a DC derived from the shop NPC's attitude; a success improves the
  shop's buy/sell modifiers until the GM resets the lock.
- Per-player discounts are stored per shop and stack additively with the shop's own buy/sell modifier.
- Price modifier tooltips list every contributing source (shop default, haggling, player override, item
  override) and the resulting total percentage.

<table>
  <tr>
    <td width="33%">
      <strong>Haggle dialog</strong><br>
      <img src="docs/example_haggle_dialog.png" alt="Haggle dialog with a skill and NPC attitude selection" width="320">
    </td>
    <td width="33%">
      <strong>Player discounts</strong><br>
      <img src="docs/example_players_discount.png" alt="Per-player buy and sell discount overrides" width="320">
    </td>
    <td width="33%">
      <strong>Price modifier breakdown</strong><br>
      <img src="docs/example_price_mod.png" alt="Tooltip breaking down a price modifier into its individual sources" width="320">
    </td>
  </tr>
</table>

---

## Shop Management

- The "Shop & Craft" window lists every shop split into Active/Inactive sections; GMs create, duplicate,
  deactivate, or delete shops from there.

<table>
  <tr>
    <td colspan="2">
      <strong>Shop Manager</strong><br>
      <img src="docs/example_shop_manager.png" alt="Shop Manager overview listing active and inactive shops" width="100%">
    </td>
  </tr>
</table>

---

## Magic Item Generator

- Item type is a multi-select; each selected type gets its own subtype filter, so e.g. "Weapons: Simple
  only" and "Equipment: Wondrous only" combine in a single roll.
- Selecting the Scroll subtype under Consumables adds spell-specific filters: school, class (drawn from
  registered spell lists), level, and ritual-only.
- A global rarity filter and a magic/mundane toggle apply across every selected type.
- A count slider generates up to ten items in one roll, drawn from a shared, pre-filtered candidate pool.
- Enchanted results (e.g. a magic weapon template) are resolved by picking a random valid base item and
  effect profile, then synthesizing a non-persisted item that combines the base item's data with a clone
  of the enchantment effect — this "virtual" item only exists for display in the Buy tab; the real item
  document is created on the actor's inventory once the purchase is confirmed.
- If an enchantment doesn't override price or rarity itself, the synthesized item inherits the enchant
  item's price/rarity; if that's still unresolved, it falls back to the same rarity-based default price
  table used for any catalog item without its own price (ammunition priced per piece, a tenth of the
  consumable default, per DMG 2024 guidance).

<table>
  <tr>
    <td width="50%">
      <strong>Generate Item dialog</strong><br>
      <img src="docs/example_item_generator.png" alt="Generate Item dialog with type, subtype, spell, rarity, and count filters" width="320">
    </td>
  </tr>
</table>

---

## Crafting

- A recipe defines a target item, fixed and/or freeform materials, a required tool proficiency (with an
  optional workshop-access override for players without the tool), a duration, and which actors may start it.
- The Craft tab of the "Shop & Craft" window lists recipes grouped by the target item's type.
- Starting a craft is a player-facing dialog: pick a character, supply materials from inventory or drop in
  substitutes if the recipe allows it, optionally fill the remaining value with gold, and see tool
  proficiency/ownership at a glance.
- Progress lives on a real in-progress item, tracked through dnd5e's own Limited-Uses/Activity system —
  using the item's activity once advances progress by one workday, reflected directly in the item's
  description. The item is automatically replaced by the finished item once progress is complete.

<table>
  <tr>
    <td width="50%">
      <strong>Recipe editor</strong><br>
      <img src="docs/example_new_recipe.png" alt="Recipe editor defining a target item, materials, tool, duration, and unlock rules" width="320">
    </td>
    <td width="50%">
      <strong>Start Craft dialog</strong><br>
      <img src="docs/example_new_craft_order.png" alt="Start Craft dialog with material selection and a fill-with-gold option" width="320">
    </td>
  </tr>
  <tr>
    <td colspan="2">
      <strong>Recipe list</strong><br>
      <img src="docs/example_craft_recipe_list.png" alt="Craft tab listing recipes grouped by item type" width="100%">
    </td>
  </tr>
  <tr>
    <td width="50%">
      <strong>Craft confirmation</strong><br>
      <img src="docs/example_craft_chat.png" alt="Chat card requesting GM confirmation to start a craft" width="320">
    </td>
    <td width="50%">
      <strong>In-progress craft item</strong><br>
      <img src="docs/example_craft_item.png" alt="In-progress crafted item showing workday progress in its description" width="320">
    </td>
  </tr>
</table>

---

## What's Next

- Non-item services: spellcasting, hirelings, food & lodging
- Search and filtering for the recipe browser
- Calender-based Restock (dnd5e 6.0.0)
