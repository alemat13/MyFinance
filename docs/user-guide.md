# MyFinance User Guide

This guide walks through every screen in MyFinance and how to use it. It's written for
people *using* the app to track household finances — for schema/database details, see
[`data-model.md`](./data-model.md) instead.

## Table of Contents

1. [Getting Started](#getting-started)
2. [Dashboard](#dashboard)
3. [Accounts](#accounts)
4. [Categories](#categories)
5. [Transactions](#transactions)
6. [Users](#users)
7. [Split Weights](#split-weights)
8. [Import CSV](#import-csv)
9. [Bank Sync](#bank-sync)
10. [Backup & Restore](#backup--restore)
11. [Charts](#charts)
12. [Appendix: Validation Rules & Tips](#appendix-validation-rules--tips)

## Getting Started

### First launch

The first time you open MyFinance, a prompt appears asking you to pick who you are from
the list of users. This prompt can't be dismissed without choosing — MyFinance needs to
know which person is "you" so it can filter and personalize views. Your choice is
remembered between visits.

### The header bar

Every screen shares the same header:

- **User selector** — a dropdown showing "All Users" or a specific person. This is the
  single most important control in the app: it decides which accounts, transactions,
  and balances you see everywhere else. Switching users (or back to "All Users") is
  instant and remembered the next time you open the app.
- **Theme toggle** — switches between light and dark mode.

### Navigation

MyFinance shows four primary destinations — **Dashboard**, **Transactions**,
**Accounts**, and **Charts** — plus a **More** button for everything else (Categories,
Users, Split Weights, Import CSV, Bank Sync, Backup & Restore, and Help). On a phone, the primary
destinations sit in a tab bar fixed to the bottom of the screen and **More** opens a
sheet that slides up from the bottom; on a wider screen, the same buttons sit in a bar
under the header, with **More** opening a panel from the right instead. Either way, the
current screen is reflected in the page URL, so you can bookmark or share a link to a
specific view.

### Installing MyFinance on your phone

MyFinance can be installed like a native app. On iOS Safari, use **Share → Add to Home
Screen**; on Android Chrome, use the **Install app** prompt (or **⋮ menu → Install
app**). Once installed, it opens in its own window without browser address bars or
tabs, using the icon and name set here.

Opening it with no connection loads the app but no data — every figure comes from the
server, so you get empty screens until you're back online.

### The "Filtering by" banner

Whenever a specific user (not "All Users") is selected, a banner appears at the top of
the active view reading "Filtering by: *Name* · Clear". Click **Clear** to switch back
to "All Users" without opening the dropdown. When a specific user is selected:

- **Accounts** and **Dashboard** only show accounts that person has an ownership share in.
- **Transactions** only shows transactions on an account they own, or where they're
  entitled to a split share, and adds **My share** and **Balance** columns for that
  person (see [Finding transactions](#finding-transactions)).

Every other screen (except Dashboard, which *is* the home screen) also has a **Back**
link to return to the Dashboard.

## Dashboard

The Dashboard is the home screen and gives an at-a-glance summary:

- **Balance widget** — who owes whom. With exactly two users in the household, this
  reads as a plain sentence: "*Alice* owes *Bob* $42.50" (or "All settled up" if the
  net is zero). With more than two users, it instead lists each person's net position
  (green if the household owes them, red if they owe the household), grouped by
  currency for households with accounts in more than one currency.
- **Account cards** — one card per visible account, showing its name, type, and current
  balance (colored green for positive, red for negative). Clicking a card (or focusing
  it and pressing Enter or Space) jumps to the **Transactions** screen with the account
  filter already set to that account, so you go straight from a balance to the
  transactions behind it. Any filter left over from an earlier visit to Transactions is
  cleared, so you see that account and nothing else.
- **Recent transactions** — the last 10 transactions across your visible accounts,
  showing date, payee, category, account, amount, and memo if present, as a table on
  wider screens or a list of cards on a phone. Category is shown as a colored icon
  badge (or a gray "Uncategorized" badge if none is set), not just a plain label. A
  transaction split between multiple people shows a "Shared · your share: $X" badge
  when a specific user is selected, so you can tell at a glance what your actual
  liability is versus the transaction's full amount.

## Accounts

Manage your checking accounts, savings accounts, credit cards, and so on.

The accounts table lists **Name, Type, Balance, Currency, Owners,** and row actions.
The **Owners** column shows each owner as "Name (percentage%)".

- **+ New Account** opens an inline form: name, type, current balance, and currency
  (pick from a curated list of common currencies, or choose "Other…" to type any
  3-letter code).
- **Balance is the account's balance right now**, and it moves on its own: it goes up
  and down as you add, edit, import, or delete transactions on that account. The
  number you type when creating the account is what it's worth at that moment, not a
  figure frozen at creation time.
- If the displayed balance ever drifts from what your bank shows (a missing
  transaction, an import you didn't reconcile), just **Edit** the account and type the
  real balance. That restates the account from today onward and leaves every
  transaction untouched; the balance keeps tracking activity from there.
- Every account has two independent sub-tables when you add or edit it:
  - An **ownership** sub-table where you add one or more owners and set each one's
    ownership percentage. This is what determines who an account (and its balance)
    shows up for when a specific user is selected, and it drives who's on the hook for
    the "paid" side of the household balance. **The percentages across all owners must
    add up to exactly 100%** before you can save — the form validates this for you.
  - A **Split Weight** sub-table — an optional, separate integer weight per person,
    used only to prefill the split on new transactions for this account (see
    [Split Weights](#split-weights) for how the three weight tiers work together).
    This has nothing to do with ownership: a single-owner account can still have a
    split weight configured, and changing one never affects the other.
- **Edit** turns the row's cells into editable inputs in place; **Delete** asks for
  confirmation first.
- You can't delete an account that still has transactions on it — remove or reassign
  its transactions first.
- **Archive** (once an account is closed) hides it from the Dashboard and from the
  account dropdown when creating a new transaction, without deleting anything — its
  existing transactions, balances, and charts are unaffected. Archived accounts are
  hidden from this list by default; check **Show archived** to see them again and
  click **Unarchive** to bring one back into active use.

## Categories

Categories classify transactions (e.g. Groceries, Rent, Salary). A category can
optionally have **subcategories** — one extra level of grouping (e.g. "Housing" as a
parent with "Rent" and "Home Insurance" underneath). Only two levels are allowed: a
subcategory can't itself have subcategories.

The table lists **Name, Type, Default Split,** and row actions. A category with
subcategories shows a count ("N subcategories") and an expand/collapse arrow; clicking
it reveals the subcategories indented underneath, along with a **+ Add subcategory**
action that opens the New Category form pre-filled with that parent.

- **+ New Category** (and Edit) lets you set a name, a type (free text — commonly
  Income, Expense, or Transfer), an optional **parent category**, a **color** and an
  **icon** (pick from a curated set of finance-themed icons), and an optional
  **default split weight**: a set of per-user integer weights used to prefill the
  split on any new transaction in this category — this is the highest-priority of the
  three weight tiers (see [Split Weights](#split-weights)). If you don't set one for a
  category, new transactions in it fall back to the account's split weight, and then
  to the household's global split weight, instead.
- Picking a parent category **locks the type field** to match the parent's — a
  subcategory always shares its parent's type. Only a top-level category can be
  chosen as a parent (no 3-level nesting).
- A category that already has subcategories can't be turned into a subcategory
  itself, and its type can't be changed while it still has subcategories.
- Both a parent category and its subcategories can be assigned directly to a
  transaction — picking the most specific one is never required.
- The color and icon show up as a small colored badge wherever the category appears —
  in this table, on Transactions rows, and in the Dashboard's recent transactions.
- Weights just need to be zero or greater, with at least one greater than zero — unlike
  ownership, there's no requirement that they add up to any particular total, since
  they're a ratio (e.g. 2:1) rather than a percentage. A subcategory does **not**
  inherit its parent's default split weight — each category's weight tier (if any) is
  its own.
- You can't delete a category that still has transactions assigned to it, or one that
  still has subcategories — delete or reassign those first.

## Transactions

The most detailed screen in the app — this is where you record and review individual
transactions.

### Finding transactions

Two filtering modes are available:

- **Simple filters**: free-text search over payee/memo, a date range, account and
  category dropdowns, a min/max amount range, and a **Reconciled** filter (Any /
  Reconciled only / Unreconciled only — see [Reconciling transactions](#reconciling-transactions)
  below). **Clear** resets all of these.
- **Advanced filters**: build arbitrary AND/OR conditions across payee, memo, amount,
  date, account, or category, each with its own operator (contains, equals, between,
  greater/less than, etc.) — useful for more precise or compound searches than the
  simple filters allow. Reconciled status isn't available as an advanced-mode
  condition; use the simple filter for that.

Results can be sorted by any column and paginated (25, 50, or 100 rows per page).
Your filters, sort order, and page are all kept in the page URL, so you can bookmark
or share a specific search.

The results are grouped by date. On a phone, they're shown as a list of cards (payee,
amount, category, account, reconciled toggle, and — when a specific user is selected —
My share/Balance) instead of the table described below, since an eight-column table
doesn't fit a narrow screen; on wider screens it's the table. Either way, tapping or
clicking a transaction opens the same **History** panel: a full audit trail of who
created or edited the transaction and when, what fields changed, and whether it
originated from a CSV import. Changes to the transaction's own split weights — set on
creation or edited later — are tracked here too, shown as each involved user's weight
before and after the change, and the same applies to reconciled status changes.

When a specific user is selected (not "All Users"), the table adds two columns after
**Amount**:

- **My share** — that person's own share of the transaction, from its split.
- **Balance** — what they actually owe (shown negative) or are owed (shown positive)
  on that one transaction, once account ownership is factored in: their share minus
  the portion of the amount their ownership percentage on that account already covers.
  For example, a €100 joint purchase split 55/45 on an account owned 50/50 leaves a
  Balance of −€5 (they owe €5 to their co-owner); the same purchase paid from an
  account they own 100% leaves a Balance of +€45 (they're owed that back).

These two columns are hidden when "All Users" is selected, since "my share" has no
meaning without a specific person chosen. A bold **Total** row at the bottom of the
table sums Amount, My share, and Balance for the rows currently displayed — it reflects
only the current page, not every result matching your filters across all pages.

### Exporting your transactions

The **Export** button, next to **+ New Transaction** at the top of the page, opens a
menu with **CSV** and **Excel** choices. Either one downloads every transaction
matching your **current filters** — simple or advanced — across **all pages**, not
just the one currently shown (unlike the Total row above). There's no separate export
dialog: it always exports exactly what your current search would return, and both
formats contain identical data — only the file format differs.

The downloaded file (named `myfinance-transactions-<timestamp>.csv` or
`myfinance-transactions-<timestamp>.xlsx` depending on which you pick) includes every
transaction field — ID, Date, Payee, Memo, Amount, Currency, Account, Category,
Accounting Month, Reconciled, Divide Group ID — plus three columns per household
user, always present regardless of which user (or "All Users") is currently selected
in the page's user switcher:

- **Weight `<name>`** — that person's integer split weight on the transaction, blank
  if they're not part of its split at all.
- **Share `<name>`** — their euro share of the transaction, same as **My share**
  above.
- **Balance `<name>`** — what they owe or are owed on that one transaction, same
  formula as **Balance** above (their share minus what their account ownership
  already covers).

### Adding or editing a transaction

Clicking **+ New Transaction** or an existing row both open the same panel. The form
captures:

- **Date** and an **accounting month** offset — normally a transaction counts toward
  the reporting month it's dated in, but you can shift it up to 3 months earlier or
  later (e.g. a paycheck dated the last day of the month that should count toward next
  month).
- **Payee**, an optional **memo**, and the **amount** (negative for an expense,
  positive for income).
- The **account** it belongs to, and its **category** — picking a category is
  optional; leaving it as "Uncategorized" (the default) is a valid, final choice, and
  such transactions display with a gray "Uncategorized" badge instead of a category
  name. The category field is a searchable dropdown: subcategories are grouped and
  indented under their parent, the parent itself is also selectable, and typing in the
  search box filters the list by category or parent name. The same picker is used for
  the Transactions screen's category filters.
- A **Split** section, always visible — no separate "customize" step, and **required**:
  a transaction can't be saved with nobody in the split. It shows one integer
  **weight** per involved person, with a read-only euro amount next to each that
  updates live as you type (each person's share is that person's weight divided by
  the total weight, times the transaction amount, rounded to the cent — any rounding
  remainder goes to the last person so the shares always add up exactly).
  - When you pick a category and account, the weights are prefilled automatically
    from whichever tier applies first: the **category's** default split weight, then
    the **account's**, then the household's **global** weight (see
    [Split Weights](#split-weights)) — the global tier always has at least one
    person in it by default, so a brand-new transaction is never left with an empty
    split even before you configure anything.
  - **Quick-fill buttons** let you pull in weights at any time, overwriting
    whatever's currently in the fields: Global, Account, and Category pull in a
    specific tier's weights (disabled if that tier has nothing configured);
    **Split Evenly** sets weight 1 for every user; and a button per user (named
    after them) assigns weight 1 to that user alone, with no one else in the split.
  - You can also just type your own weight for anyone directly — there's no
    requirement that the numbers add up to anything in particular, or match any tier —
    but you can't remove every row and save; at least one person must remain.
  - Editing an **existing** transaction always starts from its own previously-saved
    weights, never re-prefilled from the category/account/global config as it
    currently stands — the quick-fill buttons are the only way to pull a tier's
    *current* weights into an existing transaction.

The **Delete** button and the **History** panel only appear once the transaction
already exists — there's nothing to delete or show history for while you're still
filling in a new one. Deleting a transaction asks for confirmation first.

Editing an existing transaction also shows a **Reconciled** checkbox next to the
category field — see the next section for what it means. It's not shown while
creating a new transaction, since a transaction is always created unreconciled.

#### "As reported by the bank"

Transactions that came in through **Bank Sync** carry a collapsed **As reported by
the bank** section near the bottom of the panel. Expand it to see what the source
actually said, before you renamed anything:

- **Original label** — the label the bank sent, word for word. The Payee field is
  yours to rewrite; this is not, so the original wording is still there months later.
- **Counterparty** — who the bank named on the other side. Empty when it named nobody.
- **Bank transaction code** — the bank's own classification of the payment.
- **Merchant category code** — the merchant's MCC, when the bank supplies one.
- **Merchant location** and **Purchase date** — where the purchase happened, and the
  day it happened, which is often a few days before the bank booked it.

None of these can be edited, here or anywhere else: they are a record of what the
source said, not fields of your own. A row is simply left out when the source didn't
supply it, and the whole section is hidden for a transaction that has none of them —
anything you typed in by hand, or imported from a CSV. The badge next to the heading
says where the values came from.

### Dividing a transaction

**Divide** is a different feature from the **Split** section above, even though both
involve dividing up an amount — don't confuse them:

- **Split** divides a transaction's amount *among the people in your household*. The
  transaction itself still stays as one row, one category, one date.
- **Divide** breaks *one transaction* into *several separate transactions*, each with
  its own amount, category, date, and memo. Use it when a single purchase actually
  covers more than one thing — e.g. a 50€ shopping trip that was really 20€ of party
  supplies and 30€ of groceries — or when part of a transaction's amount should
  really be accounted in a different month.

Open an existing transaction and click **Divide** (next to Delete — it's only
available once the transaction has been saved) to open the Divide panel. It starts
with two parts, pre-filled from the transaction you're dividing: the first part
keeps the full original amount, the second starts at 0. Each part has its own date,
accounting-month offset, payee, memo, amount, and category, editable independently
— so parts can differ by category, by date, by both, or (with matching category and
date) simply peel an amount off into its own row.

- **Add part** appends another row; each row (once there are more than two) can be
  removed again, down to a minimum of two.
- A running **Remaining to allocate** total shows the gap between what's currently
  assigned across all parts and the original transaction's amount, turning red until
  it reaches zero — the parts' amounts must add up exactly to the original amount,
  and every part needs a non-zero amount and a payee before **Divide** is enabled.
- Confirming replaces the original transaction with the parts: the first part reuses
  the original transaction's own id (so its History trail and any bookmarked link to
  it keep working), and the rest become new transactions. Each part's own
  person-split (see [Split Weights](#split-weights)) is filled in automatically from
  the usual category/account/global cascade — open any part afterward to fine-tune it
  like any other transaction.
- Once divided, every part shows a **Divided transaction** section linking to its
  sibling parts, so you can jump between them. A part can be divided again to add
  more siblings to the same group; but if you open one of the *other* parts, its
  Divide button won't appear — divide the original part instead.

### Reconciling transactions

"Reconciled" marks a transaction as reviewed and validated by you — for example,
after checking it against your bank statement. It's purely manual: MyFinance never
sets or clears it on its own. Every new transaction, whether entered by hand or
brought in via [CSV import](#import-csv), starts out **unreconciled**.

There are three ways to mark a transaction reconciled (or un-reconciled again):

- Click the small circle icon next to a transaction's payee in the results table —
  a filled green check means reconciled, an empty outline means not. Clicking it
  toggles that one transaction immediately, without opening its detail panel.
  Reconciled rows are also shown slightly dimmed, so the transactions still needing
  review stand out.
- Open the transaction and check/uncheck **Reconciled**, alongside its other fields.
- Use **Bulk Edit** (below) to mark many transactions at once.

Tip: if your filter is set to "Unreconciled only" and you mark the matching
transactions as reconciled (via the inline icon or Bulk Edit), they'll disappear
from the list as soon as the change applies, since they no longer match the filter.

### Bulk editing transactions

Select multiple transactions using the checkboxes in the results table — a checkbox
in the header selects or deselects every transaction currently shown on the page
(selection is per-page; it doesn't carry over when you change page or filters). On a
phone, where the list is a stack of cards rather than a table, there's no header row:
tick one card first, then use the **Select all** button that appears in the selection
bar to extend it to every transaction on the page. Once
at least one row is selected, a bar appears above the table showing how many are
selected, with **Bulk Edit**, **Delete selected**, and **Clear selection** buttons.

**Bulk Edit** opens a dialog with four independent, optional changes you can apply
together in a single save:

- **Category** — leave this off to keep each transaction's own category unchanged;
  turn it on to set every selected transaction to the same category (including
  explicitly choosing "Uncategorized").
- **Accounting month** — leave this off to keep each transaction's own accounting
  month; turn it on to shift all of them by the same offset (e.g. +1 month). Because
  the shift is relative to each transaction's own date, transactions with different
  dates each land on their own correct target month, not necessarily the same
  calendar month as each other.
- **Split** — leave this off to keep each transaction's own existing split
  untouched; turn it on to enter one set of per-person weights that gets applied to
  every selected transaction. Each transaction still gets its own share amounts,
  proportioned against its own amount — the weights are shared, but the euro amounts
  are not.
- **Mark as reconciled / unreconciled** — leave this off to keep each transaction's
  own reconciled status unchanged; turn it on and choose "Reconciled" or "Not
  reconciled" to apply that status to every selected transaction in one action —
  the quickest way to point a whole batch of imported or reviewed transactions at
  once.

At least one of the four must be turned on to save. After saving, you'll see a
confirmation, the list refreshes, and the selection is cleared. If your current
filter is "Unreconciled only" and you bulk-mark the selection as reconciled, those
rows will no longer match the filter and will disappear from the list once the
change applies.

**Delete selected** permanently removes every selected transaction (and its
splits) after a confirmation prompt — there's no undo. Unlike Bulk Edit, it's a
single action with no options to configure: click it, confirm, and the selected
transactions are gone. After confirming, the list refreshes and the selection is
cleared, same as after a Bulk Edit save.

## Users

Manage the people in your household.

The table lists **Name, Email,** and row actions. **+ New User** / **Edit** capture a
name and an optional email address. Clicking a user's name anywhere in this table sets
them as the currently selected user (same effect as picking them from the header
dropdown).

You can't delete a user who still owns a share of any account — remove their ownership
from those accounts first (or delete the accounts). If the user you're deleting is the
only person in some transaction's split, deleting them re-splits that transaction using
the same category/account/global fallback described in [Split Weights](#split-weights)
— you'll only be blocked if no other user has a usable weight to fall back to.

## Split Weights

Every transaction's split is driven by its own per-user integer **weight** — see
[Adding or editing a transaction](#adding-or-editing-a-transaction). Rather than typing
those weights from scratch every time, MyFinance lets you configure three fallback
tiers that prefill sensible defaults, checked in this order (first match wins):

1. **Category** — set per-category on the [Categories](#categories) screen. Highest
   priority: e.g. "Rent" can always default to 1:1 regardless of the account or
   household default.
2. **Account** — set per-account on the [Accounts](#accounts) screen, in a sub-table
   that's completely separate from ownership. Useful when one particular account (say,
   a joint account funded unevenly) should default differently from the rest of the
   household.
3. **Global** — set on this screen, and used whenever neither the category nor the
   account has a weight configured. For example, weights proportional to each person's
   income can be used so shared expenses default to splitting proportionally rather
   than 50/50. Unlike the other two tiers, the global one is **mandatory**: every new
   person you add starts with a weight of 1 here automatically, and this screen won't
   let you save a state where everyone is at 0 — it's the guaranteed fallback that
   makes every transaction's split possible in the first place.

All three are just relative weights, zero or greater — there's no requirement that they
add up to 100 or any other total, since it's a ratio (e.g. 2:1), not a percentage. The
category and account tiers may legitimately be left unconfigured (in which case they're
simply skipped in favor of the next tier down); the global tier may not — it always
needs at least one person with a weight greater than zero.

**These tiers only ever prefill.** Once a transaction is saved, its own weights are
what's used going forward — editing a tier later never reaches back and changes an
already-saved transaction. The Global/Account/Category quick-fill buttons on the
transaction form are the only way to pull a tier's *current* weights into an existing
transaction.

## Import CSV

Bulk-load transactions from a bank or credit card export instead of entering them by
hand. It's a four-step wizard:

1. **Upload & account** — choose the CSV file and a default account. This account is used
   for every row unless the file has its own account-name column (see below), in which
   case it's only the fallback for rows whose account name doesn't match one of yours.
   Files are capped at 5,000 rows per import; for larger exports, split the file and
   import it in batches.
2. **Format detection** — MyFinance auto-detects the file's encoding, delimiter, date
   format, decimal separator, and which column maps to which field (date, payee, amount,
   category, etc.), showing a preview of a few sample rows. You can correct any of these
   before continuing. If the file has a column naming an account per row (e.g. Linxo
   exports' "Nom du compte"), it's auto-detected too — rows are then routed to the
   matching account instead of the single default one.
3. **Review** — every row is shown with a status badge: **OK**, **Needs category**
   (non-blocking — it can still be imported without one), **Possible duplicate** (looks
   like a transaction that already exists), or **Error**. A row whose account name didn't
   match any existing account additionally shows an **Account not matched** notice — it
   falls back to the default account but you can pick the right one from a dropdown. You
   can override the category or account per row, or check a box to skip importing that
   row entirely.
4. **Commit** — imports everything that isn't skipped or erroring, and confirms when done.

Imported transactions are tagged as such, and show up in a transaction's
[History](#adding-or-editing-a-transaction) panel later. Their split is resolved the
same way as a manually-entered transaction's: the category > account > global cascade
described in [Split Weights](#split-weights), since imported transactions must be
split too. Like any newly-created transaction, every imported row starts out
**unreconciled** — see [Reconciling transactions](#reconciling-transactions).

## Bank Sync

Connects a bank directly so its transactions arrive on their own, instead of exporting a
CSV and importing it by hand. It covers any bank reachable through open banking, which in
practice means current accounts and cards — a life-insurance or brokerage contract is not
a payment account and can't be connected this way.

**Connecting a bank.** Pick your bank from the list and press **Connect**. You're sent to
your bank's own site to log in and approve access; MyFinance never sees your banking
credentials. When you come back, the bank appears on this screen with every account the
approval covers.

**When a bank shows no account.** Occasionally a bank approves the access but no account
appears under it. Press **Refresh accounts** first: the approval you already gave is
still valid, so this just asks your bank again and doesn't send you back through its
login screen.

If it still comes back empty, the usual cause isn't the bank at all. An Enable Banking
application running in restricted mode only ever sees the accounts explicitly linked to
it in Enable Banking's own Control Panel — every other account is filtered out and the
list arrives empty. Link an account for this bank there, then refresh again, or
disconnect the bank here and connect it afresh.

**Linking an account.** A connected bank account does nothing until you tell it which
MyFinance account it feeds, using the **Feeds MyFinance account** dropdown. Only one bank
account may feed a given MyFinance account, and archived accounts can't be picked.
**Import from** sets how far back the first sync reaches — it defaults to the day you
link the account, so connecting a bank doesn't re-import years of history you already
entered another way. Move it earlier if you do want older transactions.

**Syncing.** Once linked, an account syncs on its own a few times a day, and **Sync now**
runs one immediately. Each sync also re-reads the last few days, so a transaction your
bank posted late still gets picked up. Re-reading never creates duplicates: MyFinance
remembers the identifier the bank gave each transaction. Transactions that were already
in MyFinance before you connected the bank are left alone too, matched on their date and
amount. The last sync's result — how many transactions came in, or what went wrong — is
shown under each account.

**What an imported transaction looks like.** It arrives with the bank's own date, label
and amount, minus the "CARTE 18/09" style prefix card payments carry (the label shows
just the merchant; the bank's full wording is kept under **As reported by the bank**),
with **no category**, and a split resolved through the usual account > global
cascade described in [Split Weights](#split-weights). Categorize it exactly as you would
a transaction you typed yourself. Like any new transaction it starts out
**unreconciled** — see [Reconciling transactions](#reconciling-transactions) — and it
shows up in the [History](#adding-or-editing-a-transaction) panel as having come from a
bank sync.

**Consent expiry.** Banks grant access for a limited time, typically 90 days. The screen
shows the expiry date for each bank and warns you in the last week. To renew it, connect
the same bank again — your account links and sync history are preserved, and the same is
true of **Refresh accounts**.

**Disconnecting.** **Disconnect** revokes the access at your bank and stops future syncs.
Transactions already imported stay exactly where they are; they're ordinary MyFinance
transactions.

Bank connections are part of a backup: restoring one in **Overwrite** mode brings back
each connected bank and which MyFinance account each of its accounts feeds, so you don't
have to grant access at your bank again. A consent that has lapsed since the backup was
taken still needs renewing, as usual. A backup exported before bank connections were
included restores with no bank connected, and **Append** mode never touches them.

## Backup & Restore

- **Export Backup** downloads a zip file containing a full JSON snapshot of your data —
  keep this somewhere safe before making risky changes, or as a periodic backup.
- **Import Backup** uploads a previously exported zip file, in one of two modes:
  - **Overwrite** replaces all existing data with the backup's contents. This is
    destructive and asks you to confirm before proceeding.
  - **Append** adds the backup's data alongside what's already there, and also asks
    for confirmation first.
- A backup includes your bank connections (see [Bank sync](#bank-sync)) but never the
  OneDrive connection below, and restoring one leaves the OneDrive connection as it was.

### OneDrive Automatic Backup

Connects a OneDrive account so a backup (the same archive **Export Backup** produces) is
uploaded automatically on a schedule, without you having to remember to export one
yourself. There's no restore-from-OneDrive feature — if you ever need to restore one of
these backups, download it from OneDrive yourself and use **Import Backup** above, same
as any other backup file.

- **Connect OneDrive** starts a Microsoft sign-in flow; once approved, the connected
  account's email is shown.
- **Folder path** is where backups are uploaded (e.g. `/MyFinance Backups`) — it's
  created automatically if it doesn't already exist.
- **Frequency** is Daily, Weekly, or Monthly.
- **Keep last** sets how many backup files to retain in the folder — older ones beyond
  this count are deleted automatically after each successful backup.
- **Backup Now** runs a backup immediately, without waiting for the schedule — useful to
  confirm the connection and folder are working.
- The last backup's time and outcome (success or failed, with an error message) are
  shown once connected.
- **Disconnect** stops future scheduled backups and forgets the connection. It doesn't
  delete any backup files already uploaded to OneDrive.

## Charts

Visual summaries of spending and income. This screen requires a specific user to be
selected (not "All Users") — it's your own view of the household's finances.

A "From"/"To" month-range filter at the top of the screen scopes both charts below to a
period, defaulting to the trailing 12 months on first load. If your accounts span more
than one currency, a currency selector also appears, letting you switch which currency's
transactions the charts summarize (amounts across currencies are never combined into one
number).

Two charts are shown:

- **Spending per month** — a stacked bar chart, one bar per month, with one segment per
  top-level expense category (plus a gray "Uncategorized" segment for any uncategorized
  transactions, so they're never silently left out of the totals) and a black line
  tracing each month's total spend. Income doesn't appear in this chart. Click a
  category in the legend beneath the chart to drill into that category's own
  subcategories for the same date range — a breadcrumb appears above the chart, and
  clicking "Overview" in it returns to the top-level view.
- **Net income per month** — green income bars and red expense bars per month, plus a
  black line tracing the net (income minus expense) per month.

## Appendix: Validation Rules & Tips

A quick reference for the rules the app enforces:

| Rule | Where it applies |
|------|-------------------|
| Ownership percentages must sum to exactly 100% | Account owners |
| Split weights must be ≥ 0, with at least one > 0 — no sum requirement | Category, Account, and Global split weights; a transaction's own split |
| A transaction's split can't be empty, and the Global split-weight tier can't be left with every weight at 0 | Global split weights; a transaction's own split |
| Currency must be a 3-letter code (e.g. `EUR`, `USD`) | Accounts |
| Can't delete an account with existing transactions | Accounts |
| Can't create a new transaction on an archived account | Accounts, Transactions |
| Can't delete a category with existing transactions | Categories |
| Can't delete a category with existing subcategories | Categories |
| A subcategory's type must match its parent's, and only 2 levels of categories are allowed | Categories |
| Can't delete a user who still owns a share of an account | Users |
| Can't delete a user who's the only person in some transaction's split, unless another user has a fallback weight to re-split it with | Users |
| OneDrive backup folder path can't be empty | Backup & Restore (OneDrive) |
| OneDrive backup "Keep last" count must be between 1 and 365 | Backup & Restore (OneDrive) |

Split-weight prefill priority, from highest to lowest: a transaction's **category**
weight beats its **account** weight, which beats the household's **global** weight.
Every transaction is always split — the global tier is a guaranteed fallback (every
person defaults to a weight of 1 there), so even with no category or account weight
configured and no custom weights typed in, a transaction still resolves a split rather
than being left unsplit. Ownership is a separate concept entirely — it never determines
a split, only who an account is visible to and who's on the hook for the "paid" side of
the household balance.
