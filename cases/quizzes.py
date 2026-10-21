"""Quizzes for Casework.

Each level can have a short quiz. Questions come from real sticking points
while solving that level's cases (Patricia's testing of Foundations, Oct 2026),
so they test understanding rather than repeating a case.

Question types:
  spot     a query with numbered lines; pick the line with the bug
  choice   multiple choice with text options
  predict  multiple choice where each option is a small result table
  fix      a broken query to fix in the editor; graded by the normal checker

build.py checks every answer it can: spot and fix questions run against the
real data (the bug must change the result, the fix must be valid), predict
questions run on their small example tables, and choice questions that make a
factual claim about SQL run a query that proves it.
"""

QUIZZES = [
  {
    "id": "foundations",
    "level": "foundations",
    "title": "Foundations quiz",
    "intro": "Six questions on the ideas behind cases 01 to 04. You'll see right away whether each answer is right and why. No tutor, no time limit.",
    "questions": [
      {
        "type": "spot",
        "concept": "AND before OR",
        "review": "01",
        "title": "Too many urgent tickets",
        "prompt": "This query should list urgent tickets that are open or pending. It returns far too many rows. Which line has the bug?",
        "lines": [
          "SELECT ticket_id, priority, status",
          "FROM tickets",
          "WHERE priority = 'urgent'",
          "  AND status = 'open' OR status = 'pending'",
        ],
        "answer": 4,
        "fixed_line": "  AND status IN ('open', 'pending')",
        "explain": "SQL handles AND before OR, so line 4 reads as \"(urgent and open) or pending\". Every pending ticket gets in, urgent or not. Use `status IN ('open', 'pending')`, or wrap the OR in parentheses.",
      },
      {
        "type": "choice",
        "concept": "Writing a date",
        "review": "02",
        "title": "The date that became a number",
        "prompt": "`date_diff('day', created_at, 2026-10-01)` fails with an error saying it got an INTEGER. Why?",
        "options": [
          "Without quotes, SQL reads 2026-10-01 as subtraction: 2026 minus 10 minus 1.",
          "date_diff only works on timestamps, not dates.",
          "Dates have to be written as 10/01/2026.",
          "created_at has to come last in date_diff.",
        ],
        "answer": 0,
        "proof": {"sql": "SELECT 2026-10-01", "expect": [[2015]]},
        "explain": "Unquoted, `2026-10-01` is math and equals 2015. Write `DATE '2026-10-01'`: the quotes make it text, and `DATE` tells SQL to read the text as a date.",
      },
      {
        "type": "fix",
        "concept": "Nesting functions",
        "review": "03",
        "title": "Clean the categories",
        "prompt": "This query should list each distinct category after cleaning: lowercase, with '-issue' removed, and spaces trimmed. It doesn't run. Fix it in the editor and press Run.",
        "broken": "SELECT DISTINCT replace(category, '-issue', '') AND lower(category) AND trim(category) AS clean\nFROM tickets;",
        "solution": "SELECT DISTINCT trim(lower(replace(category, '-issue', ''))) AS clean\nFROM tickets",
        "returns": ["clean"],
        "explain": "AND combines true/false conditions; it can't chain text functions. To apply several functions to one value, put each inside the next: `trim(lower(replace(category, '-issue', '')))`. The innermost one runs first.",
      },
      {
        "type": "predict",
        "concept": "Blank text vs NULL",
        "review": "03",
        "title": "What survives the filter?",
        "prompt": "A category column holds three values: 'Billing', a single space ' ', and NULL. Which rows does this keep?",
        "code": "SELECT category\nFROM t\nWHERE trim(category) <> ''",
        "setup": "WITH t(category) AS (VALUES ('Billing'), (' '), (NULL))",
        "options": [
          {"columns": ["category"], "rows": [["Billing"]]},
          {"columns": ["category"], "rows": [["Billing"], [None]]},
          {"columns": ["category"], "rows": [["Billing"], [" "]]},
          {"columns": ["category"], "rows": [["Billing"], [" "], [None]]},
        ],
        "answer": 0,
        "explain": "`trim(' ')` becomes empty text, which equals '', so the space is dropped. NULL is dropped too: comparing NULL to anything gives \"unknown\", and WHERE only keeps rows that are true.",
      },
      {
        "type": "predict",
        "concept": "What LEFT JOIN returns",
        "review": "04",
        "title": "Three orgs, one customer",
        "prompt": "The orgs table has org 1 (crm_customer_id C-101), org 2 (C-999) and org 3 (blank). The customers table has only C-101. What does this return?",
        "code": "SELECT o.org_id, c.customer_id\nFROM orgs o\nLEFT JOIN customers c\n  ON c.customer_id = o.crm_customer_id",
        "setup": "WITH orgs(org_id, crm_customer_id) AS (VALUES (1, 'C-101'), (2, 'C-999'), (3, NULL)), customers(customer_id) AS (VALUES ('C-101'))",
        "options": [
          {"columns": ["org_id", "customer_id"], "rows": [[1, "C-101"]]},
          {"columns": ["org_id", "customer_id"], "rows": [[1, "C-101"], [2, None], [3, None]]},
          {"columns": ["org_id", "customer_id"], "rows": [[2, None], [3, None]]},
          {"columns": ["org_id", "customer_id"], "rows": [[1, "C-101"], [2, "C-101"], [3, None]]},
        ],
        "answer": 1,
        "explain": "A LEFT JOIN keeps every org. Org 1 finds its customer. Orgs 2 and 3 find no partner, so the customer side comes back NULL. Filtering for that NULL is how you find the unmatched ones.",
      },
      {
        "type": "spot",
        "concept": "= in ON, NULL in WHERE",
        "review": "04",
        "title": "The orgs that hid",
        "prompt": "This query should find helpdesk orgs with no matching CRM customer. It finds the orgs with a blank ID but misses the ones with a mistyped ID. Which line has the bug?",
        "lines": [
          "SELECT o.org_id, o.org_name",
          "FROM helpdesk_orgs o",
          "LEFT JOIN customers c",
          "  ON c.customer_id != o.crm_customer_id",
          "WHERE c.customer_id IS NULL",
        ],
        "answer": 4,
        "fixed_line": "  ON c.customer_id = o.crm_customer_id",
        "explain": "ON describes which rows belong together, so it needs `=`. With `!=`, an org with a mistyped ID \"matches\" every customer, so its customer side is never NULL and WHERE skips it. Find non-matches afterward, with `IS NULL`.",
      },
    ],
  },
]
