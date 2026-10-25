"""Drills: short exercises, one skill at a time, for practice by repetition.

A drill works like a small case (same brief, editor, checker and tutor) but
takes 1 to 3 minutes. Sets are grouped by level; each set reviews one skill
and links back to the case that introduced it. Every drill has a "naive"
query that makes the skill's classic mistake; build.py checks that it gives a
different answer, so the checker always catches that mistake.

The Foundations drills come from Patricia's sticking points on cases 01 to 04
(Oct 2026): AND/OR, writing dates, nesting text functions, and joins.
"""

DRILL_SETS = [
  {
    "id": "andor", "level": "foundations", "title": "AND, OR and IN", "review": "01",
    "intro": "Combining conditions. SQL handles AND before OR, so mixing them without parentheses changes the meaning. IN is the safe way to say \"any of these values\".",
    "drills": [
      {
        "title": "Phone or chat, still open",
        "prompt": "List tickets that came in by phone or chat and are still open.",
        "rules": ["Open means status is 'open'."],
        "returns": ["ticket_id", "channel"], "ordered": False, "tables": ["tickets"], "skills": ["IN", "AND"],
        "solution": "SELECT ticket_id, channel FROM tickets WHERE channel IN ('phone', 'chat') AND status = 'open'",
        "naive": "SELECT ticket_id, channel FROM tickets WHERE channel = 'phone' OR channel = 'chat' AND status = 'open'",
      },
      {
        "title": "High stakes, waiting on the customer",
        "prompt": "List high or urgent priority tickets that are pending.",
        "rules": ["Priority is 'high' or 'urgent'.", "Status is 'pending'."],
        "returns": ["ticket_id", "priority"], "ordered": False, "tables": ["tickets"], "skills": ["OR", "parentheses"],
        "solution": "SELECT ticket_id, priority FROM tickets WHERE (priority = 'high' OR priority = 'urgent') AND status = 'pending'",
        "naive": "SELECT ticket_id, priority FROM tickets WHERE priority = 'high' OR priority = 'urgent' AND status = 'pending'",
      },
      {
        "title": "Two lists at once",
        "prompt": "List tickets that still need work and came in through email or the web form.",
        "rules": ["Still needs work means status is 'open' or 'pending'.", "The web form channel is 'web'."],
        "returns": ["ticket_id", "channel", "status"], "ordered": False, "tables": ["tickets"], "skills": ["IN", "IN"],
        "solution": "SELECT ticket_id, channel, status FROM tickets WHERE status IN ('open', 'pending') AND channel IN ('email', 'web')",
        "naive": "SELECT ticket_id, channel, status FROM tickets WHERE status = 'open' OR status = 'pending' AND channel IN ('email', 'web')",
      },
      {
        "title": "Everything except",
        "prompt": "List low priority tickets that aren't finished yet.",
        "rules": ["Finished means status is 'solved' or 'closed'.", "Priority is 'low'."],
        "returns": ["ticket_id", "status"], "ordered": False, "tables": ["tickets"], "skills": ["NOT IN"],
        "solution": "SELECT ticket_id, status FROM tickets WHERE status NOT IN ('solved', 'closed') AND priority = 'low'",
        "naive": "SELECT ticket_id, status FROM tickets WHERE (status != 'solved' OR status != 'closed') AND priority = 'low'",
      },
    ],
  },
  {
    "id": "dates", "level": "foundations", "title": "Writing dates", "review": "02",
    "intro": "Dates go in quotes with DATE in front, like DATE '2026-10-01'. A timestamp also has a time of day, which matters at the edges of a date range.",
    "drills": [
      {
        "title": "The last day of September",
        "prompt": "List every ticket created on September 30, 2026, at any time that day.",
        "rules": ["created_at includes the time of day."],
        "returns": ["ticket_id", "created_at"], "ordered": False, "tables": ["tickets"], "skills": ["DATE", "ranges"],
        "solution": "SELECT ticket_id, created_at FROM tickets WHERE created_at >= DATE '2026-09-30' AND created_at < DATE '2026-10-01'",
        "naive": "SELECT ticket_id, created_at FROM tickets WHERE created_at = DATE '2026-09-30'",
      },
      {
        "title": "Who left before August",
        "prompt": "Which agents left before August 1, 2026?",
        "rules": ["An agent left on the date in deactivated_at."],
        "returns": ["agent_name", "deactivated_at"], "ordered": False, "tables": ["agents"], "skills": ["DATE", "<"],
        "solution": "SELECT agent_name, deactivated_at FROM agents WHERE deactivated_at < DATE '2026-08-01'",
        "naive": "SELECT agent_name, deactivated_at FROM agents WHERE deactivated_at IS NOT NULL",
      },
      {
        "title": "Days to solve",
        "prompt": "For urgent tickets created in September 2026 that have been solved, how many whole days did each take?",
        "rules": ["A ticket has been solved if solved_at is filled in.", "Name the column days_to_solve."],
        "returns": ["ticket_id", "days_to_solve"], "ordered": False, "tables": ["tickets"], "skills": ["date_diff", "IS NOT NULL"],
        "solution": "SELECT ticket_id, date_diff('day', created_at, solved_at) AS days_to_solve FROM tickets WHERE priority = 'urgent' AND solved_at IS NOT NULL AND created_at >= DATE '2026-09-01' AND created_at < DATE '2026-10-01'",
        "naive": "SELECT ticket_id, date_diff('day', solved_at, created_at) AS days_to_solve FROM tickets WHERE priority = 'urgent' AND solved_at IS NOT NULL AND created_at >= DATE '2026-09-01' AND created_at < DATE '2026-10-01'",
      },
      {
        "title": "The outage week",
        "prompt": "List tickets created from July 9 through July 15, 2026, including both days.",
        "rules": ["Include all of July 15, up to midnight."],
        "returns": ["ticket_id"], "ordered": False, "tables": ["tickets"], "skills": ["date ranges"],
        "solution": "SELECT ticket_id FROM tickets WHERE created_at >= DATE '2026-07-09' AND created_at < DATE '2026-07-16'",
        "naive": "SELECT ticket_id FROM tickets WHERE created_at >= DATE '2026-07-09' AND created_at <= DATE '2026-07-15'",
      },
    ],
  },
  {
    "id": "text", "level": "foundations", "title": "Cleaning text", "review": "03",
    "intro": "Text typed by people needs cleaning before you compare or count it. Put functions inside each other: the innermost one runs first.",
    "drills": [
      {
        "title": "Find the trials",
        "prompt": "List helpdesk orgs that are trials: the word 'trial' appears somewhere in the name, in any capitalization.",
        "rules": ["Match 'trial', 'Trial' or 'TRIAL'."],
        "returns": ["org_id", "org_name"], "ordered": False, "tables": ["helpdesk_orgs"], "skills": ["lower", "LIKE"],
        "solution": "SELECT org_id, org_name FROM helpdesk_orgs WHERE lower(org_name) LIKE '%trial%'",
        "naive": "SELECT org_id, org_name FROM helpdesk_orgs WHERE org_name LIKE '%Trial%'",
      },
      {
        "title": "Two functions, one value",
        "prompt": "List each distinct category after making it lowercase and trimming spaces. Leave '-issue' alone for now.",
        "rules": ["Name the column clean."],
        "returns": ["clean"], "ordered": False, "tables": ["tickets"], "skills": ["nesting", "DISTINCT"],
        "solution": "SELECT DISTINCT trim(lower(category)) AS clean FROM tickets",
        "naive": "SELECT DISTINCT lower(category) AS clean FROM tickets",
      },
      {
        "title": "August's top topics",
        "prompt": "What were the three most common ticket topics in August 2026, after cleaning the categories?",
        "rules": ["Clean a category by making it lowercase, removing a trailing '-issue', and trimming spaces.",
                  "Leave out tickets with no category after cleaning.",
                  "Most tickets first. If two topics tie, put them in alphabetical order."],
        "returns": ["category", "tickets"], "ordered": True, "tables": ["tickets"], "skills": ["nesting", "GROUP BY", "tie-breaker", "LIMIT"],
        "solution": """SELECT trim(lower(replace(category, '-issue', ''))) AS category, count(*) AS tickets
FROM tickets
WHERE created_at >= DATE '2026-08-01' AND created_at < DATE '2026-09-01'
  AND trim(lower(replace(category, '-issue', ''))) <> ''
GROUP BY 1 ORDER BY tickets DESC, category LIMIT 3""",
        "naive": """SELECT category, count(*) AS tickets FROM tickets
WHERE created_at >= DATE '2026-08-01' AND created_at < DATE '2026-09-01'
GROUP BY 1 ORDER BY tickets DESC LIMIT 3""",
      },
      {
        "title": "Tickets with no topic",
        "prompt": "How many tickets have no category: missing, empty, or only spaces?",
        "rules": ["Return one number, named no_category."],
        "returns": ["no_category"], "ordered": False, "tables": ["tickets"], "skills": ["IS NULL", "trim", "COUNT"],
        "solution": "SELECT count(*) AS no_category FROM tickets WHERE category IS NULL OR trim(category) = ''",
        "naive": "SELECT count(*) AS no_category FROM tickets WHERE category IS NULL",
      },
    ],
  },
  {
    "id": "joins", "level": "foundations", "title": "Joining tables", "review": "04",
    "intro": "ON says which rows belong together, so it uses =. A regular JOIN keeps only matches; a LEFT JOIN keeps every row from the first table and fills the other side with NULL when nothing matches.",
    "drills": [
      {
        "title": "Who has the urgent queue",
        "prompt": "List open urgent tickets with the name of the agent assigned to each.",
        "rules": ["Open means status is 'open'."],
        "returns": ["ticket_id", "agent_name"], "ordered": False, "tables": ["tickets", "agents"], "skills": ["JOIN"],
        "solution": "SELECT t.ticket_id, a.agent_name FROM tickets t JOIN agents a ON a.agent_id = t.assignee_id WHERE t.priority = 'urgent' AND t.status = 'open'",
        "naive": "SELECT t.ticket_id, a.agent_name FROM tickets t, agents a WHERE t.priority = 'urgent' AND t.status = 'open'",
      },
      {
        "title": "Churned customers in the helpdesk",
        "prompt": "List customers the CRM marks as churned, with the name of their helpdesk org.",
        "rules": ["Churned means the CRM status is 'churned'."],
        "returns": ["company_name", "org_name"], "ordered": False, "tables": ["customers", "helpdesk_orgs"], "skills": ["JOIN", "WHERE"],
        "solution": "SELECT c.company_name, o.org_name FROM customers c JOIN helpdesk_orgs o ON o.crm_customer_id = c.customer_id WHERE c.status = 'churned'",
        "naive": "SELECT c.company_name, o.org_name FROM customers c JOIN helpdesk_orgs o ON o.crm_customer_id = c.customer_id",
      },
      {
        "title": "Enterprise in the CRM",
        "prompt": "List helpdesk orgs whose customer is on the enterprise plan in the CRM, with that plan.",
        "rules": ["Use the CRM's plan_tier, not the helpdesk."],
        "returns": ["org_id", "plan_tier"], "ordered": False, "tables": ["helpdesk_orgs", "customers"], "skills": ["JOIN", "which table to trust"],
        "solution": "SELECT o.org_id, c.plan_tier FROM helpdesk_orgs o JOIN customers c ON c.customer_id = o.crm_customer_id WHERE c.plan_tier = 'enterprise'",
        "naive": "SELECT o.org_id, c.plan_tier FROM helpdesk_orgs o JOIN customers c ON c.customer_id != o.crm_customer_id WHERE c.plan_tier = 'enterprise'",
      },
      {
        "title": "Tickets from unknown customers",
        "prompt": "List tickets whose helpdesk org can't be matched to a CRM customer.",
        "rules": ["An org is unmatched if its crm_customer_id is blank or doesn't match any customer_id."],
        "returns": ["ticket_id", "org_id"], "ordered": False, "tables": ["tickets", "helpdesk_orgs", "customers"], "skills": ["JOIN", "LEFT JOIN", "IS NULL"],
        "solution": """SELECT t.ticket_id, t.org_id
FROM tickets t
JOIN helpdesk_orgs o ON o.org_id = t.org_id
LEFT JOIN customers c ON c.customer_id = o.crm_customer_id
WHERE c.customer_id IS NULL""",
        "naive": """SELECT t.ticket_id, t.org_id
FROM tickets t
JOIN helpdesk_orgs o ON o.org_id = t.org_id
JOIN customers c ON c.customer_id = o.crm_customer_id
WHERE c.customer_id IS NULL""",
      },
    ],
  },
  # ---------------- Bridge drills
  {
    "id": "groups", "level": "bridge", "title": "Counting by group", "review": "B1",
    "intro": "GROUP BY puts rows with the same value together, and COUNT, MIN or MAX work inside each group. Every column in SELECT is either grouped or wrapped in one of those.",
    "drills": [
      {
        "title": "Tickets per channel",
        "prompt": "How many tickets came in through each channel, across all six months?",
        "rules": ["Name the count tickets."],
        "returns": ["channel", "tickets"], "ordered": False, "tables": ["tickets"], "skills": ["GROUP BY", "COUNT"],
        "solution": "SELECT channel, count(*) AS tickets FROM tickets GROUP BY channel",
        "naive": "SELECT channel, count(DISTINCT org_id) AS tickets FROM tickets GROUP BY channel",
      },
      {
        "title": "Tickets per team",
        "prompt": "How many tickets has each support team been assigned?",
        "rules": ["A ticket belongs to the team of the agent it's assigned to.", "Name the count tickets."],
        "returns": ["team", "tickets"], "ordered": False, "tables": ["tickets", "agents"], "skills": ["JOIN", "GROUP BY"],
        "solution": "SELECT a.team, count(*) AS tickets FROM tickets t JOIN agents a ON a.agent_id = t.assignee_id GROUP BY a.team",
        "naive": "SELECT team, count(*) AS tickets FROM agents GROUP BY team",
      },
      {
        "title": "Oldest in each lane",
        "prompt": "For tickets that still need work, how many are there at each priority, and when was the oldest one created?",
        "rules": ["A ticket still needs work if its status is open or pending.", "Name the columns tickets and oldest."],
        "returns": ["priority", "tickets", "oldest"], "ordered": False, "tables": ["tickets"], "skills": ["COUNT", "MIN"],
        "solution": "SELECT priority, count(*) AS tickets, min(created_at) AS oldest FROM tickets WHERE status IN ('open', 'pending') GROUP BY priority",
        "naive": "SELECT priority, count(*) AS tickets, min(created_at) AS oldest FROM tickets GROUP BY priority",
      },
    ],
  },
  {
    "id": "having", "level": "bridge", "title": "Filtering groups", "review": "B2",
    "intro": "WHERE filters rows before they're grouped. HAVING filters the groups afterward, so it can use counts and other totals.",
    "drills": [
      {
        "title": "Busy orgs in September",
        "prompt": "Which orgs filed more than 10 tickets in September 2026?",
        "rules": ["Name the count tickets."],
        "returns": ["org_id", "tickets"], "ordered": False, "tables": ["tickets"], "skills": ["WHERE", "HAVING"],
        "solution": "SELECT org_id, count(*) AS tickets FROM tickets WHERE created_at >= DATE '2026-09-01' AND created_at < DATE '2026-10-01' GROUP BY org_id HAVING count(*) > 10",
        "naive": "SELECT org_id, count(*) AS tickets FROM tickets GROUP BY org_id HAVING count(*) > 10",
      },
      {
        "title": "High stakes queues",
        "prompt": "Which agents have at least 5 high or urgent tickets that still need work?",
        "rules": ["A ticket still needs work if its status is open or pending.", "Name the count tickets."],
        "returns": ["agent_name", "tickets"], "ordered": False, "tables": ["tickets", "agents"], "skills": ["IN", "HAVING"],
        "solution": "SELECT a.agent_name, count(*) AS tickets FROM tickets t JOIN agents a ON a.agent_id = t.assignee_id WHERE t.status IN ('open', 'pending') AND t.priority IN ('high', 'urgent') GROUP BY a.agent_name HAVING count(*) >= 5",
        "naive": "SELECT a.agent_name, count(*) AS tickets FROM tickets t JOIN agents a ON a.agent_id = t.assignee_id WHERE t.status IN ('open', 'pending') AND t.priority = 'high' OR t.priority = 'urgent' GROUP BY a.agent_name HAVING count(*) >= 5",
      },
      {
        "title": "Heavy days",
        "prompt": "Which days in September 2026 had more than 40 tickets?",
        "rules": ["Group by calendar day, not by the exact time.", "Name the columns day and tickets."],
        "returns": ["day", "tickets"], "ordered": False, "tables": ["tickets"], "skills": ["CAST AS DATE", "HAVING"],
        "solution": "SELECT CAST(created_at AS DATE) AS day, count(*) AS tickets FROM tickets WHERE created_at >= DATE '2026-09-01' AND created_at < DATE '2026-10-01' GROUP BY 1 HAVING count(*) > 40",
        "naive": "SELECT created_at AS day, count(*) AS tickets FROM tickets WHERE created_at >= DATE '2026-09-01' AND created_at < DATE '2026-10-01' GROUP BY 1 HAVING count(*) > 40",
      },
    ],
  },
  {
    "id": "case", "level": "bridge", "title": "Labeling with CASE", "review": "B3",
    "intro": "CASE WHEN checks conditions in order and returns the label of the first one that's true, or the ELSE label. It's how you turn values into categories, or count only some rows.",
    "drills": [
      {
        "title": "Fast lane",
        "prompt": "Label each ticket that still needs work as 'fast lane' if it's high or urgent priority, otherwise 'standard'.",
        "rules": ["A ticket still needs work if its status is open or pending.", "Name the label lane."],
        "returns": ["ticket_id", "lane"], "ordered": False, "tables": ["tickets"], "skills": ["CASE WHEN", "IN"],
        "solution": "SELECT ticket_id, CASE WHEN priority IN ('high', 'urgent') THEN 'fast lane' ELSE 'standard' END AS lane FROM tickets WHERE status IN ('open', 'pending')",
        "naive": "SELECT ticket_id, CASE WHEN priority = 'urgent' THEN 'fast lane' ELSE 'standard' END AS lane FROM tickets WHERE status IN ('open', 'pending')",
      },
      {
        "title": "Weekend tickets",
        "prompt": "How many tickets were created on weekends versus weekdays?",
        "rules": ["In DuckDB, dayofweek(created_at) gives 0 for Sunday through 6 for Saturday.",
                  "Label rows 'weekend' or 'weekday', and name the columns day_type and tickets."],
        "returns": ["day_type", "tickets"], "ordered": False, "tables": ["tickets"], "skills": ["CASE WHEN", "dayofweek"],
        "solution": "SELECT CASE WHEN dayofweek(created_at) IN (0, 6) THEN 'weekend' ELSE 'weekday' END AS day_type, count(*) AS tickets FROM tickets GROUP BY 1",
        "naive": "SELECT CASE WHEN dayofweek(created_at) IN (6, 7) THEN 'weekend' ELSE 'weekday' END AS day_type, count(*) AS tickets FROM tickets GROUP BY 1",
      },
      {
        "title": "Counting only some rows",
        "prompt": "For each channel, show the total number of tickets and how many of them were urgent.",
        "rules": ["Name the columns tickets and urgent_tickets."],
        "returns": ["channel", "tickets", "urgent_tickets"], "ordered": False, "tables": ["tickets"], "skills": ["SUM(CASE WHEN)"],
        "solution": "SELECT channel, count(*) AS tickets, sum(CASE WHEN priority = 'urgent' THEN 1 ELSE 0 END) AS urgent_tickets FROM tickets GROUP BY channel",
        "naive": "SELECT channel, count(*) AS tickets, count(CASE WHEN priority = 'urgent' THEN 1 ELSE 0 END) AS urgent_tickets FROM tickets GROUP BY channel",
      },
    ],
  },
  {
    "id": "time", "level": "bridge", "title": "Grouping by time", "review": "B4",
    "intro": "date_trunc rounds a timestamp down to the start of its week, month or year, so all the rows in that period share one value you can group by.",
    "drills": [
      {
        "title": "Weeks of September",
        "prompt": "How many tickets were created in each week that started in September 2026?",
        "rules": ["Weeks start on Monday; show each week as its first day.",
                  "Include a week if its Monday is in September, even if it ends in October.",
                  "Name the columns week and tickets."],
        "returns": ["week", "tickets"], "ordered": False, "tables": ["tickets"], "skills": ["date_trunc('week')"],
        "solution": "SELECT date_trunc('week', created_at) AS week, count(*) AS tickets FROM tickets GROUP BY 1 HAVING date_trunc('week', created_at) >= DATE '2026-09-01' AND date_trunc('week', created_at) < DATE '2026-10-01'",
        "naive": "SELECT date_trunc('week', created_at) AS week, count(*) AS tickets FROM tickets WHERE created_at >= DATE '2026-09-01' AND created_at < DATE '2026-10-01' GROUP BY 1",
      },
      {
        "title": "Urgent by month",
        "prompt": "How many urgent tickets came in each month?",
        "rules": ["Show each month as its first day.", "Name the columns month and urgent_tickets."],
        "returns": ["month", "urgent_tickets"], "ordered": False, "tables": ["tickets"], "skills": ["date_trunc('month')", "WHERE"],
        "solution": "SELECT date_trunc('month', created_at) AS month, count(*) AS urgent_tickets FROM tickets WHERE priority = 'urgent' GROUP BY 1",
        "naive": "SELECT date_trunc('month', created_at) AS month, count(*) AS urgent_tickets FROM tickets GROUP BY 1",
      },
      {
        "title": "Month and channel",
        "prompt": "How many tickets came in each month through each channel?",
        "rules": ["Show each month as its first day.", "Name the count tickets."],
        "returns": ["month", "channel", "tickets"], "ordered": False, "tables": ["tickets"], "skills": ["GROUP BY two columns"],
        "solution": "SELECT date_trunc('month', created_at) AS month, channel, count(*) AS tickets FROM tickets GROUP BY 1, 2",
        "naive": "SELECT date_trunc('week', created_at) AS month, channel, count(*) AS tickets FROM tickets GROUP BY 1, 2",
      },
    ],
  },
  {
    "id": "cte", "level": "bridge", "title": "Building in steps", "review": "B5",
    "intro": "A CTE names a step: WITH step_name AS (a query), then the main query reads from step_name like a table. Big questions get easier when you answer them in small named steps.",
    "drills": [
      {
        "title": "Orgs over 15",
        "prompt": "How many orgs filed more than 15 tickets from July through September 2026?",
        "rules": ["Step 1: count tickets per org in that period. Step 2: count the orgs over 15.",
                  "Return one number, named orgs."],
        "returns": ["orgs"], "ordered": False, "tables": ["tickets"], "skills": ["WITH", "two steps"],
        "solution": "WITH per_org AS (SELECT org_id, count(*) AS tickets FROM tickets WHERE created_at >= DATE '2026-07-01' AND created_at < DATE '2026-10-01' GROUP BY org_id) SELECT count(*) AS orgs FROM per_org WHERE tickets > 15",
        "naive": "SELECT count(*) AS orgs FROM tickets WHERE created_at >= DATE '2026-07-01' AND created_at < DATE '2026-10-01'",
      },
      {
        "title": "The average org",
        "prompt": "On average, how many tickets did an org file in September 2026?",
        "rules": ["Average over orgs that filed at least one ticket in September.", "Round to one decimal place and name it avg_tickets."],
        "returns": ["avg_tickets"], "ordered": False, "tables": ["tickets"], "skills": ["WITH", "avg", "round"],
        "solution": "WITH per_org AS (SELECT org_id, count(*) AS tickets FROM tickets WHERE created_at >= DATE '2026-09-01' AND created_at < DATE '2026-10-01' GROUP BY org_id) SELECT round(avg(tickets), 1) AS avg_tickets FROM per_org",
        "naive": "WITH per_org AS (SELECT org_id, count(*) AS tickets FROM tickets GROUP BY org_id) SELECT round(avg(tickets), 1) AS avg_tickets FROM per_org",
      },
      {
        "title": "Above their team's average",
        "prompt": "Which active agents have more tickets still needing work than the average active agent on their own team?",
        "rules": ["A ticket still needs work if its status is open or pending.", "Active means deactivated_at is empty.",
                  "Compare each agent with their own team's average, not everyone's.", "Name the count open_tickets."],
        "returns": ["agent_name", "open_tickets"], "ordered": False, "tables": ["tickets", "agents"], "skills": ["WITH", "two steps", "JOIN"],
        "solution": """WITH loads AS (
  SELECT a.agent_name, a.team, count(*) AS open_tickets
  FROM tickets t JOIN agents a ON a.agent_id = t.assignee_id
  WHERE t.status IN ('open', 'pending') AND a.deactivated_at IS NULL
  GROUP BY a.agent_name, a.team
), team_avg AS (
  SELECT team, avg(open_tickets) AS avg_open FROM loads GROUP BY team
)
SELECT l.agent_name, l.open_tickets
FROM loads l JOIN team_avg ta ON ta.team = l.team
WHERE l.open_tickets > ta.avg_open""",
        "naive": """WITH loads AS (
  SELECT a.agent_name, a.team, count(*) AS open_tickets
  FROM tickets t JOIN agents a ON a.agent_id = t.assignee_id
  WHERE t.status IN ('open', 'pending') AND a.deactivated_at IS NULL
  GROUP BY a.agent_name, a.team
)
SELECT agent_name, open_tickets FROM loads WHERE open_tickets > (SELECT avg(open_tickets) FROM loads)""",
      },
    ],
  },
]
