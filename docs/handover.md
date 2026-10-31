# Handover checklist

Use this when the script moves to a new owner, so that it does not stop when one person leaves.

## Ownership

- [ ] The spreadsheet and the Apps Script project are owned by a shared or team account, not a personal one.
- [ ] The time-based trigger was installed by that account (**Order intake → Turn on automatic runs**).
      Triggers run as the person who installed them.
- [ ] The Gmail filter that adds `orders/new` exists in the same account.
- [ ] Owner and backup are written down below.

| Role | Name | Contact |
|---|---|---|
| Owner (fixes the script) | | |
| Backup | | |
| Business contact (decides the rules) | | |

## Code

- [ ] The source is in git, and `npm run check` passes.
- [ ] The deployed code is the build of a commit on `main` (`npm run push` from a clean checkout).
- [ ] `.clasp.json` and clasp credentials are not committed.

## Running

- [ ] The **Run log** shows runs every 15 minutes with status `ok` or `review`.
- [ ] A test order with an unknown SKU goes to review and the summary email arrives.
- [ ] The business team has read the [operations guide](operations.md) and knows what to do with a review row.

## Limits to know

- Apps Script stops a run after 6 minutes; `maxMessagesPerRun` keeps runs short.
- MailApp has a daily quota; the script sends at most one email per run.
- The script reads the newest 100 threads under the inbox label per run.
