"""The 15 support-operations cases for Casework.

Each case has the learner-facing prompt, the reference solution (kept on the
server, never sent to the browser), and a "naive" query that falls into the
case's trap. build.py runs every solution against the generated data, checks
that the naive query gives a different answer, and writes cases.json.
"""

CLEAN_CAT = "NULLIF(trim(replace(lower(category), '-issue', '')), '')"
MERGED = "(SELECT ticket_id FROM ticket_events WHERE event_type = 'merged')"

CASES = [
  {
    "id": "01", "level": "foundations", "title": "Today's urgent queue",
    "prompt": "The morning lead wants every urgent ticket that still needs work, oldest first, so she knows where to start.",
    "rules": ["A ticket still needs work if its status is open or pending.", "Sort oldest first by created_at, then by ticket_id."],
    "returns": ["ticket_id", "org_id", "created_at"], "ordered": True,
    "tables": ["tickets"], "skills": ["SELECT", "WHERE", "IN", "ORDER BY"],
    "solution": """
SELECT ticket_id, org_id, created_at
FROM tickets
WHERE priority = 'urgent' AND status IN ('open', 'pending')
ORDER BY created_at, ticket_id""",
    "naive": """
SELECT ticket_id, org_id, created_at FROM tickets
WHERE priority = 'urgent' AND status = 'open' ORDER BY created_at, ticket_id""",
  },
  {
    "id": "02", "level": "foundations", "title": "Tickets owned by people who left",
    "prompt": "Some agents have left the team. Find tickets that still need work and are still assigned to someone who no longer works here, with how long each has been waiting.",
    "rules": ["An agent has left if deactivated_at is filled in.", "A ticket still needs work if its status is open or pending.",
              "Measure days_waiting as whole days from created_at to the snapshot date, 2026-10-01."],
    "returns": ["ticket_id", "agent_name", "days_waiting"], "ordered": False,
    "tables": ["tickets", "agents"], "skills": ["JOIN", "IS NOT NULL", "date_diff"],
    "solution": """
SELECT t.ticket_id, a.agent_name,
       date_diff('day', t.created_at, TIMESTAMP '2026-10-01') AS days_waiting
FROM tickets t
JOIN agents a ON a.agent_id = t.assignee_id
WHERE a.deactivated_at IS NOT NULL
  AND t.status IN ('open', 'pending')""",
    "naive": """
SELECT t.ticket_id, a.agent_name, date_diff('day', t.created_at, TIMESTAMP '2026-10-01')
FROM tickets t JOIN agents a ON a.agent_id = t.assignee_id
WHERE a.deactivated_at IS NOT NULL AND t.status = 'open'""",
  },
  {
    "id": "03", "level": "foundations", "title": "What are customers writing in about?",
    "prompt": "Leadership wants the five most common ticket topics for July through September. Agents type categories by hand, so clean them up first.",
    "rules": ["Clean a category by making it lowercase, removing a trailing '-issue', and trimming spaces.",
              "Leave out tickets with no category after cleaning.", "Only tickets created from 2026-07-01 up to (not including) 2026-10-01.",
              "Most tickets first."],
    "returns": ["category", "tickets"], "ordered": True,
    "tables": ["tickets"], "skills": ["lower", "trim", "replace", "GROUP BY", "LIMIT"],
    "solution": f"""
WITH q3 AS (
  SELECT {CLEAN_CAT} AS category
  FROM tickets
  WHERE created_at >= TIMESTAMP '2026-07-01' AND created_at < TIMESTAMP '2026-10-01'
)
SELECT category, count(*) AS tickets
FROM q3
WHERE category IS NOT NULL
GROUP BY category
ORDER BY tickets DESC
LIMIT 5""",
    "naive": """
SELECT category, count(*) AS tickets FROM tickets
WHERE created_at >= TIMESTAMP '2026-07-01' AND created_at < TIMESTAMP '2026-10-01' AND category IS NOT NULL
GROUP BY category ORDER BY tickets DESC LIMIT 5""",
  },
  {
    "id": "04", "level": "foundations", "title": "Customers the CRM doesn't know",
    "prompt": "Which helpdesk organizations can't be matched to a customer in the CRM?",
    "rules": ["An organization is unmatched if its crm_customer_id is blank or doesn't match any customer_id."],
    "returns": ["org_id", "org_name"], "ordered": False,
    "tables": ["helpdesk_orgs", "customers"], "skills": ["LEFT JOIN", "IS NULL"],
    "solution": """
SELECT o.org_id, o.org_name
FROM helpdesk_orgs o
LEFT JOIN customers c ON c.customer_id = o.crm_customer_id
WHERE c.customer_id IS NULL""",
    "naive": """
SELECT org_id, org_name FROM helpdesk_orgs WHERE crm_customer_id IS NULL""",
  },
  {
    "id": "05", "level": "core", "title": "Weekly volume by channel",
    "prompt": "Staffing wants to see how many tickets arrive each week on each channel, one row per week.",
    "rules": ["Weeks start on Monday (date_trunc('week', ...)).", "One column per channel, in this order: email, chat, web, phone."],
    "returns": ["week", "email", "chat", "web", "phone"], "ordered": False,
    "tables": ["tickets"], "skills": ["date_trunc", "COUNT with FILTER or CASE", "GROUP BY"],
    "solution": """
SELECT date_trunc('week', created_at) AS week,
       count(*) FILTER (WHERE channel = 'email') AS email,
       count(*) FILTER (WHERE channel = 'chat')  AS chat,
       count(*) FILTER (WHERE channel = 'web')   AS web,
       count(*) FILTER (WHERE channel = 'phone') AS phone
FROM tickets
GROUP BY 1""",
    "naive": """
SELECT date_trunc('month', created_at), count(*) FILTER (WHERE channel='email'), count(*) FILTER (WHERE channel='chat'),
count(*) FILTER (WHERE channel='web'), count(*) FILTER (WHERE channel='phone') FROM tickets GROUP BY 1""",
  },
  {
    "id": "06", "level": "core", "title": "How fast do we really reply?",
    "prompt": "For each priority, what is the median time from a ticket being created to the first reply from a person?",
    "rules": ["A reply from a person is a ticket_events row with event_type 'public_reply' and actor 'agent'.",
              "Measure from tickets.created_at, in minutes, rounded to 1 decimal place.",
              "Leave out tickets that haven't had a reply from a person yet."],
    "returns": ["priority", "median_first_reply_minutes"], "ordered": False,
    "tables": ["tickets", "ticket_events"], "skills": ["CTE", "MIN", "median", "date_diff"],
    "solution": """
WITH first_reply AS (
  SELECT ticket_id, min(event_at) AS first_reply_at
  FROM ticket_events
  WHERE event_type = 'public_reply' AND actor = 'agent'
  GROUP BY ticket_id
)
SELECT t.priority,
       round(median(date_diff('second', t.created_at, f.first_reply_at) / 60.0), 1) AS median_first_reply_minutes
FROM tickets t
JOIN first_reply f ON f.ticket_id = t.ticket_id
GROUP BY t.priority""",
    "naive": """
WITH f AS (SELECT ticket_id, min(event_at) a FROM ticket_events WHERE event_type IN ('public_reply','auto_reply') GROUP BY 1)
SELECT t.priority, round(median(date_diff('second', t.created_at, f.a)/60.0), 1) FROM tickets t JOIN f USING (ticket_id) GROUP BY 1""",
  },
  {
    "id": "07", "level": "core", "title": "Two clocks for one ticket",
    "prompt": "Every ticket also has a 'created' event in ticket_events. Some tickets disagree with their own created event. Find out which ones, and by how much.",
    "rules": ["Compare tickets.created_at with the event_at of that ticket's 'created' event.",
              "Summarize by channel: how many tickets disagree, and the average difference in minutes (event_at minus created_at), rounded to a whole number."],
    "returns": ["channel", "mismatched_tickets", "minutes_off"], "ordered": False,
    "tables": ["tickets", "ticket_events"], "skills": ["JOIN", "date_diff", "GROUP BY", "data quality"],
    "solution": """
SELECT t.channel,
       count(*) AS mismatched_tickets,
       round(avg(date_diff('minute', t.created_at, e.event_at))) AS minutes_off
FROM tickets t
JOIN ticket_events e ON e.ticket_id = t.ticket_id AND e.event_type = 'created'
WHERE e.event_at <> t.created_at
GROUP BY t.channel""",
    "naive": """
SELECT t.channel, count(*), 0 FROM tickets t GROUP BY 1""",
  },
  {
    "id": "08", "level": "core", "title": "Solved, then reopened",
    "prompt": "Which topics have the highest reopen rate? A reopened ticket means the first fix didn't work.",
    "rules": ["Clean categories the same way as case 03 and leave out tickets with no category.",
              "A solved ticket has a solved_at. It was reopened if it has at least one 'reopened' event.",
              "reopen_rate is reopened / solved * 100, rounded to 1 decimal place.", "Only categories with at least 50 solved tickets."],
    "returns": ["category", "solved", "reopened", "reopen_rate"], "ordered": False,
    "tables": ["tickets", "ticket_events"], "skills": ["LEFT JOIN", "COUNT", "HAVING"],
    "solution": f"""
WITH solved AS (
  SELECT ticket_id, {CLEAN_CAT} AS category
  FROM tickets
  WHERE solved_at IS NOT NULL
),
reopened AS (
  SELECT DISTINCT ticket_id FROM ticket_events WHERE event_type = 'reopened'
)
SELECT s.category,
       count(*) AS solved,
       count(r.ticket_id) AS reopened,
       round(100.0 * count(r.ticket_id) / count(*), 1) AS reopen_rate
FROM solved s
LEFT JOIN reopened r ON r.ticket_id = s.ticket_id
WHERE s.category IS NOT NULL
GROUP BY s.category
HAVING count(*) >= 50""",
    "naive": """
SELECT category, count(*), count(*) FILTER (WHERE status='open'), 0 FROM tickets WHERE solved_at IS NOT NULL
GROUP BY 1 HAVING count(*) >= 50""",
  },
  {
    "id": "09", "level": "core", "title": "The same problem, twice",
    "prompt": "Customers often email, then open a chat about the same problem minutes later. Find likely duplicate tickets that nobody merged.",
    "rules": ["A duplicate is a later ticket from the same requester_email, with the same cleaned category, created within 30 minutes after the first (more than 0, up to and including 30).",
              "Leave out tickets that were already merged (they have a 'merged' event).",
              "minutes_apart is rounded to 1 decimal place."],
    "returns": ["first_ticket", "duplicate_ticket", "minutes_apart"], "ordered": False,
    "tables": ["tickets", "ticket_events"], "skills": ["self-join", "time windows", "NOT IN"],
    "solution": f"""
WITH t AS (
  SELECT ticket_id, requester_email, created_at, {CLEAN_CAT} AS category
  FROM tickets
  WHERE ticket_id NOT IN {MERGED}
)
SELECT a.ticket_id AS first_ticket,
       b.ticket_id AS duplicate_ticket,
       round(date_diff('second', a.created_at, b.created_at) / 60.0, 1) AS minutes_apart
FROM t a
JOIN t b
  ON b.requester_email = a.requester_email
 AND b.category = a.category
 AND b.created_at > a.created_at
 AND b.created_at <= a.created_at + INTERVAL 30 MINUTE""",
    "naive": f"""
WITH t AS (SELECT ticket_id, requester_email, created_at, {CLEAN_CAT} c FROM tickets)
SELECT a.ticket_id, b.ticket_id, round(date_diff('second', a.created_at, b.created_at)/60.0, 1) FROM t a JOIN t b
ON b.requester_email = a.requester_email AND b.c = a.c AND b.created_at > a.created_at AND b.created_at <= a.created_at + INTERVAL 30 MINUTE""",
  },
  {
    "id": "10", "level": "advanced", "title": "Customers on the wrong clock",
    "prompt": "Find customers whose plan in the helpdesk doesn't match the CRM, and how many of their tickets since the CRM plan changed were judged against the wrong SLA.",
    "rules": ["The CRM (customers.plan_tier) is correct. The helpdesk copy is helpdesk_orgs.sla_tier.",
              "Count tickets from all of the customer's helpdesk organizations created at or after customers.plan_changed_at.",
              "One row per customer."],
    "returns": ["customer_id", "crm_plan", "helpdesk_plan", "affected_tickets"], "ordered": False,
    "tables": ["customers", "helpdesk_orgs", "tickets"], "skills": ["JOIN", "DISTINCT", "comparing systems"],
    "solution": """
WITH mismatched AS (
  SELECT DISTINCT c.customer_id, c.plan_tier AS crm_plan, o.sla_tier AS helpdesk_plan, c.plan_changed_at
  FROM customers c
  JOIN helpdesk_orgs o ON o.crm_customer_id = c.customer_id
  WHERE c.plan_tier <> o.sla_tier
)
SELECT m.customer_id, m.crm_plan, m.helpdesk_plan, count(t.ticket_id) AS affected_tickets
FROM mismatched m
JOIN helpdesk_orgs o ON o.crm_customer_id = m.customer_id
LEFT JOIN tickets t ON t.org_id = o.org_id AND t.created_at >= m.plan_changed_at
GROUP BY m.customer_id, m.crm_plan, m.helpdesk_plan""",
    "naive": """
SELECT c.customer_id, c.plan_tier, o.sla_tier, count(t.ticket_id)
FROM customers c JOIN helpdesk_orgs o ON o.crm_customer_id = c.customer_id
JOIN helpdesk_orgs o2 ON o2.crm_customer_id = c.customer_id
LEFT JOIN tickets t ON t.org_id = o2.org_id AND t.created_at >= c.plan_changed_at
WHERE c.plan_tier <> o.sla_tier GROUP BY 1, 2, 3""",
  },
  {
    "id": "11", "level": "advanced", "title": "Why the syncs failed",
    "prompt": "The nightly CRM to helpdesk sync retries when it fails. Count failed syncs by week and error code. What happened in July?",
    "rules": ["Treat all attempts for the same customer on the same day as one sync.",
              "A sync failed if none of its attempts succeeded. Its error code is the http_status of its last attempt.",
              "Weeks start on Monday."],
    "returns": ["week", "http_status", "failed_syncs"], "ordered": False,
    "tables": ["integration_sync_log"], "skills": ["GROUP BY", "bool_or / MAX", "latest value in a group"],
    "solution": """
WITH syncs AS (
  SELECT customer_id,
         date_trunc('day', run_at) AS sync_day,
         bool_or(status = 'success') AS succeeded,
         arg_max(http_status, run_at) AS last_status
  FROM integration_sync_log
  GROUP BY customer_id, date_trunc('day', run_at)
)
SELECT date_trunc('week', sync_day) AS week, last_status AS http_status, count(*) AS failed_syncs
FROM syncs
WHERE NOT succeeded
GROUP BY 1, 2""",
    "naive": """
SELECT date_trunc('week', run_at), http_status, count(*) FROM integration_sync_log WHERE status = 'failed' GROUP BY 1, 2""",
  },
  {
    "id": "12", "level": "advanced", "title": "Still stuck after retries",
    "prompt": "For each customer, look only at their most recent sync attempt. Which customers are still failing today?",
    "rules": ["The most recent attempt is the latest run_at (break ties with the higher attempt number).",
              "Only customers whose most recent attempt failed."],
    "returns": ["customer_id", "last_attempt_at", "http_status", "error_message"], "ordered": False,
    "tables": ["integration_sync_log"], "skills": ["ROW_NUMBER", "PARTITION BY", "latest record"],
    "solution": """
WITH ranked AS (
  SELECT *,
         row_number() OVER (PARTITION BY customer_id ORDER BY run_at DESC, attempt DESC) AS rn
  FROM integration_sync_log
)
SELECT customer_id, run_at AS last_attempt_at, http_status, error_message
FROM ranked
WHERE rn = 1 AND status = 'failed'""",
    "naive": """
SELECT customer_id, max(run_at), max(http_status), max(error_message) FROM integration_sync_log WHERE status = 'failed' GROUP BY 1""",
  },
  {
    "id": "13", "level": "advanced", "title": "Came back within a week",
    "prompt": "Find people who wrote in again about the same topic within 7 days of their last ticket being solved. That's a sign the fix didn't stick.",
    "rules": ["Clean categories as in case 03 and leave out tickets with no category. Leave out merged tickets.",
              "For each ticket, the next ticket is the same requester's next ticket in the same category, by created_at.",
              "Count it when the ticket has a solved_at and the next ticket was created after solved_at and within 7 days of it."],
    "returns": ["requester_email", "category", "solved_at", "next_ticket_at"], "ordered": False,
    "tables": ["tickets", "ticket_events"], "skills": ["LEAD", "window functions", "intervals"],
    "solution": f"""
WITH t AS (
  SELECT ticket_id, requester_email, created_at, solved_at, {CLEAN_CAT} AS category
  FROM tickets
  WHERE ticket_id NOT IN {MERGED}
),
with_next AS (
  SELECT *,
         lead(created_at) OVER (PARTITION BY requester_email, category ORDER BY created_at, ticket_id) AS next_ticket_at
  FROM t
  WHERE category IS NOT NULL
)
SELECT requester_email, category, solved_at, next_ticket_at
FROM with_next
WHERE solved_at IS NOT NULL
  AND next_ticket_at > solved_at
  AND next_ticket_at <= solved_at + INTERVAL 7 DAY""",
    "naive": """
WITH n AS (SELECT requester_email, category, solved_at, lead(created_at) OVER (PARTITION BY requester_email, category ORDER BY created_at) nx FROM tickets)
SELECT * FROM n WHERE solved_at IS NOT NULL AND nx > solved_at AND nx <= solved_at + INTERVAL 7 DAY""",
  },
  {
    "id": "14", "level": "advanced", "title": "Satisfaction you can trust",
    "prompt": "Average satisfaction (CSAT) by agent, but only from responses you can trust.",
    "rules": ["Some tickets were rated twice. Keep only the latest response per ticket.",
              "Ignore responses whose ticket_id doesn't match a real ticket.",
              "The agent is the ticket's assignee. avg_rating is rounded to 2 decimal places."],
    "returns": ["agent_name", "rated_tickets", "avg_rating"], "ordered": False,
    "tables": ["csat_responses", "tickets", "agents"], "skills": ["ROW_NUMBER", "de-duplicating", "INNER JOIN"],
    "solution": """
WITH latest AS (
  SELECT *,
         row_number() OVER (PARTITION BY ticket_id ORDER BY submitted_at DESC) AS rn
  FROM csat_responses
)
SELECT a.agent_name, count(*) AS rated_tickets, round(avg(l.rating), 2) AS avg_rating
FROM latest l
JOIN tickets t ON t.ticket_id = l.ticket_id
JOIN agents a ON a.agent_id = t.assignee_id
WHERE l.rn = 1
GROUP BY a.agent_name""",
    "naive": """
SELECT a.agent_name, count(*), round(avg(r.rating), 2) FROM csat_responses r
JOIN tickets t ON t.ticket_id = r.ticket_id JOIN agents a ON a.agent_id = t.assignee_id GROUP BY 1""",
  },
  {
    "id": "15", "level": "advanced", "title": "The real SLA report",
    "prompt": "The dashboard says {dash_pct}% of tickets met their first-response SLA. Recalculate it correctly ({real_pct}% is the real number), then count the tickets the dashboard judged wrong, by cause.",
    "rules": [
      "Only tickets from CRM customers that have had a reply from a person, created at or after the customer's plan_changed_at.",
      "The dashboard's way: from tickets.created_at to the first auto_reply or public_reply, against the target for helpdesk_orgs.sla_tier.",
      "The correct way: from the ticket's 'created' event to the first public_reply by an agent, against the target for customers.plan_tier.",
      "A ticket was judged wrong when the two ways disagree on whether the SLA was met (met means minutes <= first_response_minutes).",
      "Cause: phone tickets are timezone_shift; otherwise auto_reply_counted if the dashboard's first response was an auto_reply; otherwise wrong_plan_tier."],
    "returns": ["likely_cause", "tickets"], "ordered": False,
    "tables": ["tickets", "ticket_events", "helpdesk_orgs", "customers", "sla_policies"], "skills": ["several CTEs", "CASE", "combining every fix"],
    "solution": """
WITH created AS (
  SELECT ticket_id, event_at AS created_true FROM ticket_events WHERE event_type = 'created'
),
first_any AS (
  SELECT ticket_id, min(event_at) AS any_at, arg_min(event_type, event_at) AS any_type
  FROM ticket_events WHERE event_type IN ('auto_reply', 'public_reply') GROUP BY ticket_id
),
first_human AS (
  SELECT ticket_id, min(event_at) AS human_at
  FROM ticket_events WHERE event_type = 'public_reply' AND actor = 'agent' GROUP BY ticket_id
),
judged AS (
  SELECT t.ticket_id, t.channel, fa.any_type,
         date_diff('second', t.created_at, fa.any_at) / 60.0 <= hd.first_response_minutes AS dashboard_met,
         date_diff('second', cr.created_true, fh.human_at) / 60.0 <= crm.first_response_minutes AS real_met
  FROM tickets t
  JOIN helpdesk_orgs o ON o.org_id = t.org_id
  JOIN customers c ON c.customer_id = o.crm_customer_id
  JOIN created cr ON cr.ticket_id = t.ticket_id
  JOIN first_any fa ON fa.ticket_id = t.ticket_id
  JOIN first_human fh ON fh.ticket_id = t.ticket_id
  JOIN sla_policies hd ON hd.plan_tier = o.sla_tier AND hd.priority = t.priority
  JOIN sla_policies crm ON crm.plan_tier = c.plan_tier AND crm.priority = t.priority
  WHERE cr.created_true >= c.plan_changed_at
)
SELECT CASE
         WHEN channel = 'phone' THEN 'timezone_shift'
         WHEN any_type = 'auto_reply' THEN 'auto_reply_counted'
         ELSE 'wrong_plan_tier'
       END AS likely_cause,
       count(*) AS tickets
FROM judged
WHERE dashboard_met <> real_met
GROUP BY 1""",
    "naive": """
SELECT 'auto_reply_counted', count(*) FROM tickets""",
  },
]
