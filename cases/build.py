"""Run every case's reference solution, verify its trap, and write the answer keys.

Writes:
  cases/cases.json      public: prompts, rules and expected result rows (sent to the browser)
  cases/solutions.json  private: reference SQL (stays on the tutor server)
"""
import glob
import json
import os
from collections import Counter
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path

import duckdb

from cases import CASES

ROOT = Path(__file__).resolve().parent.parent
HERE = Path(__file__).resolve().parent


def connect():
    con = duckdb.connect()
    for f in sorted(glob.glob(str(ROOT / "data" / "out" / "*.parquet"))):
        con.execute(f"CREATE TABLE {os.path.basename(f)[:-8]} AS SELECT * FROM '{f}'")
    return con


def norm(v):
    """The same normalization the browser checker uses."""
    if v is None:
        return None
    if isinstance(v, bool):
        return v
    if isinstance(v, datetime):
        s = v.strftime("%Y-%m-%d %H:%M:%S")
        return s[:10] if s.endswith(" 00:00:00") else s
    if isinstance(v, date):
        return v.strftime("%Y-%m-%d")
    if isinstance(v, (float, Decimal)):
        f = round(float(v), 2)
        return int(f) if f == int(f) else f
    return v


def run(con, sql):
    cur = con.execute(sql)
    cols = [d[0] for d in cur.description]
    return cols, [[norm(v) for v in row] for row in cur.fetchall()]


def same(a_rows, b_rows, ordered):
    if ordered:
        return a_rows == b_rows
    key = lambda r: json.dumps(r, sort_keys=True)
    return Counter(map(key, a_rows)) == Counter(map(key, b_rows))


def main():
    con = connect()
    public, private = [], {}
    # case 15's prompt quotes the dashboard and real percentages
    pct = con.execute(CASES[14]["solution"].split("SELECT CASE")[0] + """
        SELECT round(100.0 * avg(dashboard_met::INT), 1), round(100.0 * avg(real_met::INT), 1) FROM judged""").fetchone()
    print(f"case 15: dashboard {pct[0]}%  real {pct[1]}%\n")
    for c in CASES:
        cols, rows = run(con, c["solution"])
        assert cols == c["returns"], (c["id"], cols)
        assert rows, f"case {c['id']} returned no rows"
        _, naive = run(con, c["naive"])
        trap_ok = not same(rows, naive, c["ordered"])
        print(f"{c['id']} {c['title'][:38]:38s} rows={len(rows):4d}  trap changes answer: {trap_ok}")
        assert trap_ok, f"case {c['id']}: naive query gives the same answer"
        if not c["ordered"]:
            rows = sorted(rows, key=lambda r: json.dumps(r, sort_keys=True))
        prompt = c["prompt"].format(dash_pct=pct[0], real_pct=pct[1])
        public.append({k: c[k] for k in ("id", "level", "title", "rules", "returns", "ordered", "tables", "skills")}
                      | {"prompt": prompt, "expected": {"columns": cols, "rows": rows}})
        private[c["id"]] = c["solution"].strip()
    (HERE / "cases.json").write_text(json.dumps(public, indent=1))
    (HERE / "solutions.json").write_text(json.dumps(private, indent=1))
    print(f"\nwrote cases.json ({(HERE / 'cases.json').stat().st_size:,} bytes) and solutions.json")


if __name__ == "__main__":
    main()
