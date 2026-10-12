# MLC Polling Personnel Randomisation — offline tool

A single HTML file, **`MLC_Polling_Personnel_Tool.html`**, that runs in any modern browser
(Chrome, Edge, Firefox) on any computer. No server, no database, no internet:
the Excel library, styles and code are all embedded in the file.

Any district can use it: district, constituencies, reserve %, rules, venues and
authorities are all entered on the Setup page (Bihar districts and MLC
constituencies are offered as suggestions only).

## Quick start

1. Copy `MLC_Polling_Personnel_Tool.html` to the computer and double-click it.
2. **Rehearse with test data:** *Save / Load / Test Data → Small — Load into tool*.
   Lock Setup → Training → Officers → Booths, run the 2nd randomisation (3 tabs),
   lock it, run the final randomisation, lock it, then print from *Reports & Letters*.
3. **Live data:** *Dashboard → Start a new, empty project*, then enter or import your data.
4. **Save Project (.xlsx)** regularly. That one Excel file holds everything and can be
   opened on another computer with **Open Project (.xlsx)**.

The browser also autosaves (local storage), but only for that browser on that
computer. The project Excel file is the real backup.

## Workflow and dependencies

| Step | Needs | Notes |
|---|---|---|
| Election Setup | — | Manual entry, old Setup JSON, or Configuration Excel |
| Training Schedule | — | Manual entry, old Training JSON, or Configuration Excel |
| Officers Database | Setup | Excel import (replace/append) or manual add/edit |
| **Booth Entry** | **Setup only** | **Independent** — not tied to officers, training or 1st letter |
| 1st Appointment Letter | Officers + Training | Duty and training only |
| 2nd Randomisation | Officers + Booths | Party / PCCP / Micro formation; booth not disclosed |
| Final Randomisation | 2nd locked | Booth tagging; untagged = Reserve |

## Rules enforced

* A polling party is 1 Presiding Officer + P1 + P2 + P3.
* **All four members of a party are from different offices** (on by default; “same office”
  means same office name, or optionally name + address).
* **Nobody is tagged to a booth whose block is his/her home block or posting block** —
  applied to every PrO, P1, P2, P3, PCCP (Patrolling Magistrate) and Micro Observer.
* Optional, stricter: party members must have different posting blocks / home blocks.
* Party count per constituency = booths + reserve %; PCCP and Micro Observer counts =
  required (from Setup) + reserve %.
* Block names are compared loosely (case, spaces, punctuation and the word “block” are ignored),
  so “Dumri Katsari”, “dumri-katsari” and “Dumri Katsari Block” are the same block.

How it is guaranteed: in the 2nd randomisation every main party is formed against a
hidden random booth so a valid assignment always exists; the final randomisation is
a fresh random bipartite matching of *all* formed parties to booths, so which parties
become Main or Reserve is decided only at the final stage. After every run an
**independent rule check** re-verifies every rule; locking is refused if any check fails.
Randomness uses the browser's cryptographic generator (`crypto.getRandomValues`).

If the data cannot satisfy the rules (e.g. every Presiding Officer lives or works in one
block that has booths), the tool says exactly which block and duty is short.

## File formats

**Project workbook** (`Save Project`): sheets `Setup`, `Constituencies`, `Training`,
`Officers`, `Booths`, `Second_Parties`, `Second_PCCP`, `Second_Micro`, `Final_Polling`,
`Final_PCCP`, `Final_Micro`, `Status`, `Signature`, `Audit_Log`. The first five can be
prepared or corrected in Excel. Randomisation sheets are re-verified on opening and
discarded if any rule is broken.

**Officers** columns: `PIN, Name, Designation, Office Name, Office Address, Mobile, Duty,
Home Block, Posting Block, Account No, Bank, Branch, IFSC`. Duty may be written as
`PRESIDING OFFICER / POLLING OFFICER-1 / -2 / -3 / PATROLLING MAGISTRATE / MICRO OBSERVER`
or `PrO / P1 / P2 / P3 / PCCP / MO`. Blank PIN → district code + serial. Many alternate
header spellings are recognised (e.g. the earlier tool's `officername`, `officename`, `block`).

**Booths** columns: `Constituency, Booth No, Main/Aux, Location / Building, Block`.
Constituency is a code from Setup (e.g. `TC`, `GC`) or a name containing “Teachers”/“Graduates”.

Dates are `DD-MM-YYYY` (ISO and Excel dates also accepted); times `HH:MM`.

## Test data (`test-data/`)

| File | Use |
|---|---|
| `TEST_Sheohar_Project.xlsx` | 5 blocks, 6 TC + 6 GC booths, 126 officers — quick full rehearsal |
| `TEST_Muzaffarpur_Project.xlsx` | 16 blocks, 60 TC + 80 GC booths, ~1,000 officers — volume test |
| `TEST_With_Errors_Project.xlsx` | Deliberate mistakes (duplicate PIN, missing block, unknown duty…) to test validation |
| `Officers_Template.xlsx`, `Booths_Template.xlsx` | Blank formats for live data |

All names and numbers in test files are fictitious. The same datasets can be generated
inside the tool (*Save / Load / Test Data*).

## Development

```
node build.js                                   # src/ + vendor/ → MLC_Polling_Personnel_Tool.html
NODE_PATH=$(npm root -g) node tests/e2e.test.js # headless Chromium end-to-end tests (needs playwright)
WRITE_TEST_DATA=1 NODE_PATH=$(npm root -g) node tests/e2e.test.js   # also regenerates test-data/
```

The tests cover the full UI workflow, all letters/reports, Excel round-trip, 200 + 15
repeated randomisations with rule verification, randomness, infeasible-data refusal,
validation, legacy JSON import and booth-entry independence.

Embedded library: SheetJS Community Edition 0.18.5 (Apache-2.0, `vendor/SHEETJS_LICENSE`).
