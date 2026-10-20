"""Generate the synthetic Northwind Desk support dataset for Casework.

Everything here is invented. The generator is seeded, so running it again
produces exactly the same data (and the same answer keys).

Output: data/out/<table>.parquet for the 8 tables (used by cases/build.py)
and data/arrow/<table>.arrow (loaded by the browser app).
"""
import random
from datetime import datetime, timedelta, date
from pathlib import Path

import duckdb

SEED = 20261001
rng = random.Random(SEED)

START = datetime(2026, 4, 1)
END = datetime(2026, 9, 30, 23, 59)
SNAPSHOT = datetime(2026, 10, 1)  # "today" for every case
ET_OFFSET = timedelta(hours=4)  # New York is UTC-4 for the whole period (EDT)

OUT = Path(__file__).parent / "out"
OUT.mkdir(exist_ok=True)

PLANS = ["basic", "pro", "enterprise"]
PRIORITIES = ["urgent", "high", "normal", "low"]

# ---------------------------------------------------------------- sla_policies
FIRST_RESPONSE = {
    "enterprise": {"urgent": 60, "high": 120, "normal": 240, "low": 480},
    "pro": {"urgent": 120, "high": 240, "normal": 480, "low": 960},
    "basic": {"urgent": 480, "high": 720, "normal": 1440, "low": 1440},
}
RESOLUTION = {
    "enterprise": {"urgent": 8, "high": 24, "normal": 48, "low": 72},
    "pro": {"urgent": 24, "high": 48, "normal": 72, "low": 120},
    "basic": {"urgent": 48, "high": 72, "normal": 120, "low": 168},
}
sla_policies = [
    {"plan_tier": p, "priority": pr, "first_response_minutes": FIRST_RESPONSE[p][pr],
     "resolution_hours": RESOLUTION[p][pr]}
    for p in PLANS for pr in PRIORITIES
]

# ---------------------------------------------------------------- names
ADJ = ["Bright", "Harbor", "Maple", "Summit", "Copper", "Juniper", "Lantern", "Willow", "Granite", "Cedar",
       "Beacon", "Meadow", "Orchid", "Pioneer", "Riverbend", "Saffron", "Tidewater", "Northgate", "Fernwood",
       "Bluebird", "Clover", "Driftwood", "Evergreen", "Foxglove", "Golden", "Hearth", "Ironwood", "Kestrel",
       "Larkspur", "Magnolia", "Oakline", "Pebble", "Quarry", "Rosewood", "Silverline", "Thistle", "Upland",
       "Vista", "Wren", "Yarrow"]
NOUN = ["Dental", "Fitness", "Salon", "Clinic", "Tutoring", "Auto Care", "Physio", "Studios", "Pet Care",
        "Wellness", "Law Group", "Consulting", "Spa", "Optometry", "Veterinary", "Academy", "Chiropractic",
        "Yoga", "Barbers", "Counseling"]
FIRST = ["Ava", "Ben", "Chloe", "Diego", "Elena", "Farah", "Gabe", "Hana", "Isaac", "Jada", "Kai", "Lena",
         "Marco", "Nia", "Omar", "Priya", "Quinn", "Rosa", "Sam", "Tara", "Uma", "Victor", "Wes", "Ximena",
         "Yusuf", "Zoe", "Aiden", "Bea", "Cyrus", "Dana", "Eli", "Fiona", "Grant", "Ivy", "Jon", "Kira"]
LAST = ["Alvarez", "Brooks", "Chen", "Dubois", "Ellis", "Foster", "Garcia", "Hughes", "Ibrahim", "Jensen",
        "Kim", "Lopez", "Morgan", "Nakamura", "Okafor", "Patel", "Quinn", "Rossi", "Singh", "Turner",
        "Usman", "Vega", "Walsh", "Young"]


def slug(name):
    return "".join(ch for ch in name.lower() if ch.isalnum())[:18]


def rand_time(a, b):
    return a + timedelta(seconds=rng.randint(0, int((b - a).total_seconds())))


# ---------------------------------------------------------------- customers
customers = []
used_names = set()
for i in range(300):
    while True:
        name = f"{rng.choice(ADJ)} {rng.choice(NOUN)}"
        if name not in used_names:
            used_names.add(name)
            break
    r = rng.random()
    plan = "basic" if r < .50 else ("pro" if r < .85 else "enterprise")
    customers.append({
        "customer_id": f"C-{1001 + i}", "company_name": name, "plan_tier": plan,
        "plan_changed_at": rand_time(datetime(2024, 1, 1), datetime(2026, 3, 25)),
        "account_owner": rng.choice(["Mara Quist", "Devon Hale", "Lucia Ortega", "Theo Park", "Aisha Bello", "Reid Carver"]),
        "status": "active", "_old_plan": plan, "_upgraded_at": None,
    })

# churn about 8%
for c in rng.sample(customers, 24):
    c["status"] = "churned"

# upgrades during the period: 60 customers move up one plan.
active = [c for c in customers if c["status"] == "active" and c["plan_tier"] != "enterprise"]
upgraders = rng.sample(active, 60)
# 20 of them drift: 12 upgraded during the July credential outage, 8 lost to rate limiting
drift_outage = upgraders[:12]
drift_ratelimit = upgraders[12:20]
OUTAGE_START, OUTAGE_END = datetime(2026, 7, 9), datetime(2026, 7, 15)
for c in upgraders:
    old = c["plan_tier"]
    new = PLANS[PLANS.index(old) + 1]
    if c in drift_outage:
        when = rand_time(OUTAGE_START + timedelta(hours=2), OUTAGE_END - timedelta(hours=6))
    else:
        when = rand_time(datetime(2026, 4, 10), datetime(2026, 9, 10))
        while OUTAGE_START <= when <= OUTAGE_END:
            when = rand_time(datetime(2026, 4, 10), datetime(2026, 9, 10))
    c["_old_plan"], c["plan_tier"], c["plan_changed_at"], c["_upgraded_at"] = old, new, when, when
drift_ids = {c["customer_id"] for c in drift_outage + drift_ratelimit}
cust_by_id = {c["customer_id"]: c for c in customers}

# ---------------------------------------------------------------- helpdesk_orgs
orgs = []
oid = 5000
for c in customers:
    oid += rng.randint(1, 4)
    name = c["company_name"]
    if rng.random() < .12:  # support types names their own way sometimes
        name = name.replace(" and ", " & ").replace("Care", "care") + rng.choice([" LLC", " Inc", ""])
    orgs.append({"org_id": oid, "crm_customer_id": c["customer_id"], "org_name": name,
                 "sla_tier": c["_old_plan"] if c["customer_id"] in drift_ids else c["plan_tier"],
                 "synced_at": None, "_cust": c["customer_id"], "_trial": False})
# duplicate orgs: 6 customers have a second org (2 of them are drift customers)
dup_custs = rng.sample([c for c in customers if c["customer_id"] in drift_ids], 2) + \
    rng.sample([c for c in customers if c["customer_id"] not in drift_ids and c["status"] == "active"], 4)
dup_org_ids = set()
for c in dup_custs:
    oid += rng.randint(1, 4)
    orgs.append({"org_id": oid, "crm_customer_id": c["customer_id"], "org_name": c["company_name"] + " (new)",
                 "sla_tier": c["_old_plan"] if c["customer_id"] in drift_ids else c["plan_tier"],
                 "synced_at": None, "_cust": c["customer_id"], "_trial": False})
    dup_org_ids.add(oid)
# trial orgs with no CRM link, and 3 links with typos
for i in range(14):
    oid += rng.randint(1, 4)
    name = f"{rng.choice(ADJ)} {rng.choice(NOUN)} (trial)"
    orgs.append({"org_id": oid, "crm_customer_id": None, "org_name": name, "sla_tier": "basic",
                 "synced_at": None, "_cust": None, "_trial": True})
typo_ids = ["C-1O07", "C-10l5", "C 1123"]
for t in typo_ids:
    oid += rng.randint(1, 4)
    name = f"{rng.choice(ADJ)} {rng.choice(NOUN)}"
    orgs.append({"org_id": oid, "crm_customer_id": t, "org_name": name, "sla_tier": "pro",
                 "synced_at": None, "_cust": None, "_trial": True})
org_by_id = {o["org_id"]: o for o in orgs}
orgs_by_cust = {}
for o in orgs:
    if o["_cust"]:
        orgs_by_cust.setdefault(o["_cust"], []).append(o)

# ---------------------------------------------------------------- integration_sync_log
ERRORS = {
    401: "Unauthorized: API token expired",
    404: "Organization not found in helpdesk",
    409: "Conflict: more than one organization matches this customer",
    429: "Too Many Requests: rate limit exceeded, retry later",
    500: "Internal Server Error",
    504: "Gateway Timeout: helpdesk did not respond in 30s",
}
sync_log = []
sid = 100000
last_success = {}


def log_attempts(cust_id, run_at, outcome_codes):
    """outcome_codes: list of http statuses, one per attempt in order."""
    global sid
    t = run_at
    for k, code in enumerate(outcome_codes, start=1):
        sid += 1
        sync_log.append({"sync_id": sid, "customer_id": cust_id, "run_at": t, "attempt": k,
                         "status": "success" if code == 200 else "failed", "http_status": code,
                         "error_message": None if code == 200 else ERRORS[code]})
        if code == 200:
            last_success[cust_id] = t
        t = t + timedelta(minutes=rng.choice([5, 10, 15]))


day = datetime(2026, 4, 1)
changes_by_day = {}
for c in upgraders:
    d = c["_upgraded_at"].date()
    nxt = datetime(d.year, d.month, d.day) + timedelta(days=1)
    changes_by_day.setdefault(nxt.date(), []).append(c["customer_id"])
while day <= datetime(2026, 9, 30):
    nightly = day + timedelta(hours=2, minutes=rng.randint(0, 20))
    in_outage = OUTAGE_START.date() < day.date() <= OUTAGE_END.date()
    touched = set(changes_by_day.get(day.date(), []))
    # routine updates to contact details etc.
    pool = [c["customer_id"] for c in customers if c["status"] == "active" and c["customer_id"] not in drift_ids]
    touched.update(rng.sample(pool, rng.randint(10, 18)))
    for cid in sorted(touched):
        t = nightly + timedelta(seconds=rng.randint(0, 3000))
        if in_outage:
            codes = [401, 401, 401]
        elif cid in {c["customer_id"] for c in drift_ratelimit} and cid in changes_by_day.get(day.date(), []):
            codes = [429, 429, 429]
        elif cid in {c["customer_id"] for c in dup_custs}:
            codes = [409, 409, 409] if rng.random() < .5 else [200]
        else:
            r = rng.random()
            if r < .03:
                codes = [429, 200]
            elif r < .045:
                codes = [504, 200]
            elif r < .052:
                codes = [500, 500, 200]
            else:
                codes = [200]
        # after an outage, routine syncs for drift customers must not fix them: their plan field is
        # only resent when the plan changes, so routine syncs touch contact fields only (still 200).
        log_attempts(cid, t, codes)
    day += timedelta(days=1)
# churned customers: the helpdesk org was archived, syncs now 404 and stay that way
for c in customers:
    if c["status"] == "churned":
        t = rand_time(datetime(2026, 9, 1), datetime(2026, 9, 29))
        log_attempts(c["customer_id"], t, [404, 404, 404])
# drift customers: make sure their LATEST attempt is a failure (stuck), by ending on a failed resend
for c in drift_outage + drift_ratelimit:
    t = rand_time(datetime(2026, 9, 25), datetime(2026, 9, 30, 6))
    log_attempts(c["customer_id"], t, [429, 429, 429] if c in drift_ratelimit else [401, 401, 401])
sync_log.sort(key=lambda r: (r["run_at"], r["sync_id"]))
for i, r in enumerate(sync_log):
    r["sync_id"] = 100001 + i
for o in orgs:
    if o["_cust"]:
        o["synced_at"] = last_success.get(o["_cust"], datetime(2026, 3, 31, 2, 10))

# ---------------------------------------------------------------- agents
agents = []
for i in range(24):
    team = "Tier 1" if i < 13 else ("Tier 2" if i < 20 else "Enterprise")
    agents.append({"agent_id": 201 + i, "agent_name": f"{FIRST[i]} {LAST[i]}", "team": team,
                   "deactivated_at": None})
departed = {205: datetime(2026, 6, 15, 17), 211: datetime(2026, 7, 31, 17), 216: datetime(2026, 8, 21, 17)}
for a in agents:
    if a["agent_id"] in departed:
        a["deactivated_at"] = departed[a["agent_id"]]


def pick_agent(when, plan, avoid_departed=True):
    pool = [a for a in agents if not a["deactivated_at"] or a["deactivated_at"] > when]
    if plan == "enterprise" and rng.random() < .6:
        ent = [a for a in pool if a["team"] == "Enterprise"]
        if ent:
            return rng.choice(ent)["agent_id"]
    return rng.choice(pool)["agent_id"]


# ---------------------------------------------------------------- tickets + events
TOPICS = ["billing", "login", "scheduling", "integrations", "notifications", "reporting", "account settings", "bug"]
TOPIC_W = [18, 14, 22, 10, 9, 8, 7, 12]


def messy(topic):
    r = rng.random()
    if r < .07:
        return rng.choice([None, "", " "])
    variants = [topic.title(), topic, topic.upper(), topic + " ", " " + topic.title(),
                topic + "-issue", topic.title() + "-issue"]
    w = [40, 22, 8, 10, 5, 9, 6]
    return rng.choices(variants, weights=w)[0]


def contacts_for(org):
    c = cust_by_id.get(org["_cust"]) if org["_cust"] else None
    domain = slug(org["org_name"].replace(" (trial)", "").replace(" (new)", "")) + ".com"
    n = rng.randint(1, 6)
    return [f"{rng.choice(FIRST).lower()}.{rng.choice(LAST).lower()}@{domain}" for _ in range(n)]


org_contacts = {o["org_id"]: contacts_for(o) for o in orgs}
# a duplicate org shares contacts with its customer's original org
for o in orgs:
    if o["org_id"] in dup_org_ids:
        org_contacts[o["org_id"]] = org_contacts[orgs_by_cust[o["_cust"]][0]["org_id"]][:]

tickets, events = [], []
tid = 4000
eid = 900000


def add_event(ticket_id, etype, actor, at, agent_id=None, new_status=None):
    global eid
    eid += 1
    events.append({"event_id": eid, "ticket_id": ticket_id, "event_type": etype, "actor": actor,
                   "agent_id": agent_id, "new_status": new_status, "event_at": at})


def plan_on(org, when):
    """Return (crm_plan, helpdesk_plan) for this org at this time."""
    if org["_trial"]:
        return None, org["sla_tier"]
    c = cust_by_id[org["_cust"]]
    crm = c["plan_tier"] if (c["_upgraded_at"] is None or when >= c["_upgraded_at"]) else c["_old_plan"]
    if c["customer_id"] in drift_ids:
        hd = c["_old_plan"]
    else:
        hd = crm
    return crm, hd


def business_time():
    """A random true-UTC creation time, weighted to US business hours."""
    while True:
        t = rand_time(START, END - timedelta(hours=2))
        et_hour = (t - ET_OFFSET).hour
        wd = (t - ET_OFFSET).weekday()
        p = .9 if 8 <= et_hour < 19 else .18
        if wd >= 5:
            p *= .35
        if rng.random() < p:
            return t


def make_ticket(org, true_created, requester, topic, channel=None, priority=None, force_open=False):
    global tid
    tid += rng.randint(1, 3)
    t_id = tid
    channel = channel or rng.choices(["email", "chat", "web", "phone"], weights=[45, 25, 20, 10])[0]
    priority = priority or rng.choices(PRIORITIES, weights=[6, 18, 56, 20])[0]
    crm, hd = plan_on(org, true_created)
    agent = pick_agent(true_created, crm or "basic")
    stored_created = true_created - ET_OFFSET if channel == "phone" else true_created
    tk = {"ticket_id": t_id, "org_id": org["org_id"], "requester_email": requester, "channel": channel,
          "priority": priority, "category": messy(topic), "status": None, "assignee_id": agent,
          "created_at": stored_created, "solved_at": None,
          "_topic": topic, "_true_created": true_created}
    add_event(t_id, "created", "customer", true_created)
    if channel in ("email", "web"):
        add_event(t_id, "auto_reply", "system", true_created + timedelta(seconds=rng.randint(4, 90)))
    # agents work to the clock the helpdesk shows them (helpdesk tier)
    target = FIRST_RESPONSE[hd][priority]
    factor = rng.lognormvariate(-.55, .55)
    if channel == "chat":
        factor *= .55
    reply_at = true_created + timedelta(minutes=max(1.5, target * factor))
    tk["_reply_at"] = reply_at
    open_cut = SNAPSHOT - timedelta(days=12)
    still_open = force_open or (true_created > open_cut and rng.random() < .55)
    if reply_at < SNAPSHOT:
        add_event(t_id, "public_reply", "agent", reply_at, agent)
        if rng.random() < .25:
            add_event(t_id, "internal_note", "agent", reply_at + timedelta(minutes=rng.randint(2, 90)), agent)
    if still_open:
        tk["status"] = rng.choice(["open", "open", "pending"])
        if tk["status"] == "pending" and reply_at < SNAPSHOT:
            add_event(t_id, "status_change", "agent", reply_at + timedelta(minutes=1), agent, "pending")
    else:
        res_h = RESOLUTION[hd][priority] * rng.lognormvariate(-.7, .6)
        solved = max(reply_at + timedelta(minutes=10), true_created + timedelta(hours=res_h))
        if solved >= SNAPSHOT:
            tk["status"] = "open"
        else:
            add_event(t_id, "status_change", "agent", solved, agent, "solved")
            final_solved = solved
            if rng.random() < {"integrations": .17, "bug": .12}.get(topic, .06):  # reopened; integrations fixes stick least
                ro = solved + timedelta(hours=rng.uniform(3, 96))
                if ro < SNAPSHOT - timedelta(hours=6):
                    add_event(t_id, "reopened", "customer", ro)
                    add_event(t_id, "public_reply", "agent", ro + timedelta(minutes=rng.randint(20, 400)), agent)
                    final_solved = ro + timedelta(hours=rng.uniform(4, 60))
                    if final_solved < SNAPSHOT:
                        add_event(t_id, "status_change", "agent", final_solved, agent, "solved")
                    else:
                        final_solved = None
            if final_solved:
                tk["solved_at"] = final_solved
                tk["status"] = "closed" if final_solved < SNAPSHOT - timedelta(days=4) else "solved"
            else:
                tk["status"] = "open"
    tickets.append(tk)
    return tk


# ticket volume per org: enterprise customers write in more
weights = {"basic": 1.0, "pro": 1.9, "enterprise": 3.4}
org_w = []
for o in orgs:
    if o["_trial"]:
        w = .5
    else:
        w = weights[cust_by_id[o["_cust"]]["plan_tier"]]
        if cust_by_id[o["_cust"]]["status"] == "churned":
            w *= .4
    if o["org_id"] in dup_org_ids:
        w *= .5
    org_w.append(w)
# drift customers must have enough tickets after their upgrade to matter
for _ in range(5400):
    o = rng.choices(orgs, weights=org_w)[0]
    make_ticket(o, business_time(), rng.choice(org_contacts[o["org_id"]]), rng.choices(TOPICS, weights=TOPIC_W)[0])
for c in drift_outage + drift_ratelimit:
    o = orgs_by_cust[c["customer_id"]][0]
    for _ in range(rng.randint(5, 9)):
        t = rand_time(c["_upgraded_at"] + timedelta(hours=8), END - timedelta(days=3))
        make_ticket(o, t, rng.choice(org_contacts[o["org_id"]]), rng.choices(TOPICS, weights=TOPIC_W)[0])

# duplicate pairs: same person, same topic, a second ticket 2 to 28 minutes later on another channel
merged_dups = []
for _ in range(150):
    first = rng.choice([t for t in tickets if t["channel"] in ("email", "web") and t["status"] in ("closed", "solved")])
    o = org_by_id[first["org_id"]]
    gap = timedelta(minutes=rng.randint(2, 28))
    dup = make_ticket(o, first["_true_created"] + gap, first["requester_email"], first["_topic"], channel="chat",
                      priority=first["priority"])
    if rng.random() < .4:
        # merged into the first ticket: closed, never solved on its own
        add_event(dup["ticket_id"], "merged", "agent", dup["_true_created"] + timedelta(minutes=rng.randint(5, 60)),
                  dup["assignee_id"])
        dup["status"], dup["solved_at"] = "closed", None
        events[:] = [e for e in events if not (e["ticket_id"] == dup["ticket_id"] and e["event_type"] in ("status_change", "reopened"))]
        merged_dups.append(dup["ticket_id"])

# repeat contacts: same person comes back on the same topic 1 to 6 days after a solve
for _ in range(120):
    prev = rng.choice([t for t in tickets if t["solved_at"] and t["solved_at"] < END - timedelta(days=8)])
    o = org_by_id[prev["org_id"]]
    make_ticket(o, prev["solved_at"] + timedelta(hours=rng.uniform(20, 140)), prev["requester_email"], prev["_topic"])

# tickets left with departed agents: assigned before they left, never reassigned, still open
for a_id, gone in departed.items():
    for _ in range(rng.randint(7, 11)):
        o = rng.choices(orgs, weights=org_w)[0]
        t = rand_time(gone - timedelta(days=12), gone - timedelta(hours=4))
        tk = make_ticket(o, t, rng.choice(org_contacts[o["org_id"]]), rng.choices(TOPICS, weights=TOPIC_W)[0],
                         force_open=True)
        tk["assignee_id"] = a_id
        for e in events:
            if e["ticket_id"] == tk["ticket_id"] and e["agent_id"] is not None:
                e["agent_id"] = a_id

# make sure no ticket created after an agent left is assigned to them (except the stuck ones above)
for tk in tickets:
    gone = departed.get(tk["assignee_id"])
    if gone and tk["_true_created"] > gone:
        crm, _ = plan_on(org_by_id[tk["org_id"]], tk["_true_created"])
        tk["assignee_id"] = pick_agent(tk["_true_created"], crm or "basic")

# open urgent tickets for case 01: make sure there is a realistic morning queue
for _ in range(9):
    o = rng.choices(orgs, weights=org_w)[0]
    make_ticket(o, rand_time(SNAPSHOT - timedelta(days=6), SNAPSHOT - timedelta(hours=3)),
                rng.choice(org_contacts[o["org_id"]]), rng.choices(TOPICS, weights=TOPIC_W)[0],
                priority="urgent", force_open=True)

events.sort(key=lambda e: (e["event_at"], e["event_id"]))
for i, e in enumerate(events):
    e["event_id"] = 700001 + i
tickets.sort(key=lambda t: t["ticket_id"])

# From July the new ticket form made category optional, so agents skipped it more.
# Blank ("" or " ") rather than NULL, so case 03's "no category after cleaning"
# rule changes the top 5. Separate RNG so nothing else in the dataset shifts.
blank_rng = random.Random(SEED + 3)
for tk in tickets:
    if tk["created_at"] >= datetime(2026, 7, 1) and tk["category"] is not None and blank_rng.random() < .07:
        tk["category"] = blank_rng.choice(["", " "])

# ---------------------------------------------------------------- csat_responses
csat = []
rid = 30000
reopened_set = {e["ticket_id"] for e in events if e["event_type"] == "reopened"}
first_reply = {}
for e in events:
    if e["event_type"] == "public_reply" and e["ticket_id"] not in first_reply:
        first_reply[e["ticket_id"]] = e["event_at"]
COMMENTS_GOOD = ["Quick and helpful, thanks!", "Solved my issue right away.", "Great support.", None, None, None]
COMMENTS_BAD = ["Took way too long to hear back.", "Had to write in again, same problem.", "Not fixed.", None]
for tk in tickets:
    if not tk["solved_at"] or rng.random() > .36:
        continue
    o = org_by_id[tk["org_id"]]
    crm, hd = plan_on(o, tk["_true_created"])
    late = (first_reply.get(tk["ticket_id"], SNAPSHOT) - tk["_true_created"]).total_seconds() / 60 > FIRST_RESPONSE[crm or hd][tk["priority"]]
    base_r = 4.4 - (1.3 if late else 0) - (1.2 if tk["ticket_id"] in reopened_set else 0)
    rating = max(1, min(5, round(rng.gauss(base_r, .8))))
    rid += 1
    sub = tk["solved_at"] + timedelta(hours=rng.uniform(.5, 48))
    csat.append({"response_id": rid, "ticket_id": tk["ticket_id"], "rating": rating,
                 "comment": rng.choice(COMMENTS_BAD if rating <= 2 else COMMENTS_GOOD), "submitted_at": sub})
# 40 tickets rated twice (the second, later response is the one that counts)
for r in rng.sample(csat, 40):
    rid += 1
    csat.append({"response_id": rid, "ticket_id": r["ticket_id"], "rating": max(1, min(5, r["rating"] + rng.choice([-2, -1, 1]))),
                 "comment": None, "submitted_at": r["submitted_at"] + timedelta(hours=rng.uniform(1, 30))})
# 25 orphans that point at tickets that don't exist
existing = {t["ticket_id"] for t in tickets}
for _ in range(25):
    rid += 1
    fake = rng.randint(90000, 99999)
    while fake in existing:
        fake = rng.randint(90000, 99999)
    csat.append({"response_id": rid, "ticket_id": fake, "rating": rng.randint(1, 5), "comment": None,
                 "submitted_at": rand_time(START, END)})
csat.sort(key=lambda r: r["submitted_at"])
for i, r in enumerate(csat):
    r["response_id"] = 30001 + i

# ---------------------------------------------------------------- write parquet
def clean(rows):
    return [{k: v for k, v in r.items() if not k.startswith("_")} for r in rows]


SCHEMAS = {
    "customers": "customer_id VARCHAR, company_name VARCHAR, plan_tier VARCHAR, plan_changed_at TIMESTAMP, account_owner VARCHAR, status VARCHAR",
    "helpdesk_orgs": "org_id INTEGER, crm_customer_id VARCHAR, org_name VARCHAR, sla_tier VARCHAR, synced_at TIMESTAMP",
    "tickets": "ticket_id INTEGER, org_id INTEGER, requester_email VARCHAR, channel VARCHAR, priority VARCHAR, category VARCHAR, status VARCHAR, assignee_id INTEGER, created_at TIMESTAMP, solved_at TIMESTAMP",
    "ticket_events": "event_id INTEGER, ticket_id INTEGER, event_type VARCHAR, actor VARCHAR, agent_id INTEGER, new_status VARCHAR, event_at TIMESTAMP",
    "agents": "agent_id INTEGER, agent_name VARCHAR, team VARCHAR, deactivated_at TIMESTAMP",
    "sla_policies": "plan_tier VARCHAR, priority VARCHAR, first_response_minutes INTEGER, resolution_hours INTEGER",
    "csat_responses": "response_id INTEGER, ticket_id INTEGER, rating INTEGER, comment VARCHAR, submitted_at TIMESTAMP",
    "integration_sync_log": "sync_id INTEGER, customer_id VARCHAR, run_at TIMESTAMP, attempt INTEGER, status VARCHAR, http_status INTEGER, error_message VARCHAR",
}
DATA = {"customers": customers, "helpdesk_orgs": orgs, "tickets": tickets, "ticket_events": events, "agents": agents,
        "sla_policies": sla_policies, "csat_responses": csat, "integration_sync_log": sync_log}


def trunc(v):
    if isinstance(v, datetime):
        return v.replace(microsecond=0)
    return v


con = duckdb.connect()
for name, schema in SCHEMAS.items():
    rows = clean(DATA[name])
    cols = [c.split()[0] for c in schema.split(", ")]
    con.execute(f"CREATE TABLE {name} ({schema})")
    con.executemany(f"INSERT INTO {name} VALUES ({', '.join('?' for _ in cols)})",
                    [[trunc(r[c]) for c in cols] for r in rows])
    con.execute(f"COPY {name} TO '{OUT / (name + '.parquet')}' (FORMAT PARQUET, COMPRESSION ZSTD)")
    print(f"{name:22s} {con.execute(f'SELECT count(*) FROM {name}').fetchone()[0]:>7,} rows")

# The browser app loads Arrow IPC files: DuckDB-WASM reads them without downloading
# its Parquet extension from a third-party host at runtime.
import pyarrow as pa  # noqa: E402

ARROW = Path(__file__).parent / "arrow"
ARROW.mkdir(exist_ok=True)
for name in SCHEMAS:
    tbl = con.execute(f"SELECT * FROM {name}").arrow()
    if hasattr(tbl, "read_all"):
        tbl = tbl.read_all()
    with pa.OSFile(str(ARROW / f"{name}.arrow"), "wb") as sink:
        with pa.ipc.new_stream(sink, tbl.schema) as writer:
            writer.write_table(tbl)
