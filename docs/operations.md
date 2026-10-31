# Operations guide

For the people who use the order intake every day. No programming is needed.

## Every day

- Open the **Orders** sheet. Shaded rows have status `review`: the script was not sure about
  these orders and did not accept them.
- For each order in review, read the **reasons** column, then either fix the order with the
  customer or correct the row by hand and change its status to `accepted`.
- You also get one email per run that found something to review. If no email arrives, there was
  nothing to review.

## When you get "The order intake did not run"

The email says why. No order is lost: the emails stay under the inbox label until a run succeeds.

| The email says | What to do |
|---|---|
| A value on the Settings sheet is wrong | Fix that value, then **Order intake → Check settings**, then **Run now** |
| The Gmail label does not exist | Ask the owner to check the Gmail filter and label names, or run **Set up sheets and labels** |
| Anything else | Forward the email to the owner listed in the [handover checklist](handover.md) |

## Changing how it works

All of these are on the **Settings** sheet. Change the value in column B; the next run uses it.

| Key | Example | Meaning |
|---|---|---|
| `notifyTo` | `orders@example.com, lead@example.com` | Who gets the summary |
| `maxQuantityPerLine` | `500` | A line above this quantity goes to review |
| `maxMessagesPerRun` | `50` | Emails read per run. Keep it small; the rest are read on the next run |
| `notifyWhenClean` | `FALSE` | `TRUE` sends a summary even when nothing needs review |
| `inboxLabel` / `doneLabel` | `orders/new` / `orders/done` | Gmail labels. Change them only together with the Gmail filter |

To accept a new product, add its SKU to the **Products** sheet.

## Things to tell customers

- Send each order as a new email, in the agreed format.
- Keep the item lines together, right after the `---` line, one `SKU, quantity` per line.
  A blank line ends the list.
