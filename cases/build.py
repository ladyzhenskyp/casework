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
    case15 = next(c for c in CASES if c["id"] == "15")
    pct = con.execute(case15["solution"].split("SELECT CASE")[0] + """
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
    build_quizzes(con)
    build_drills(con)


def build_drills(con):
    """Run every drill's solution, check its classic mistake changes the answer, write drills.json."""
    from drills import DRILL_SETS
    out = []
    for s in DRILL_SETS:
        drills = []
        for i, d in enumerate(s["drills"], 1):
            did = f"{s['id']}{i}"
            cols, rows = run(con, d["solution"])
            assert cols == d["returns"], (did, cols)
            assert rows, f"drill {did} returned no rows"
            _, naive = run(con, d["naive"])
            assert not same(rows, naive, d["ordered"]), f"drill {did}: the mistake gives the same answer"
            print(f"drill {did:7s} {d['title'][:34]:34s} rows={len(rows):4d}  mistake rows={len(naive)}")
            if not d["ordered"]:
                rows = sorted(rows, key=lambda r: json.dumps(r, sort_keys=True))
            drills.append({"id": did, "kind": "drill", "set": s["id"], "level": s["level"]}
                          | {k: d[k] for k in ("title", "prompt", "rules", "returns", "ordered", "tables", "skills")}
                          | {"expected": {"columns": cols, "rows": rows}})
        out.append({k: s[k] for k in ("id", "level", "title", "review", "intro")} | {"drills": drills})
    (HERE / "drills.json").write_text(json.dumps(out, indent=1))
    print(f"wrote drills.json ({(HERE / 'drills.json').stat().st_size:,} bytes)")


def build_quizzes(con):
    """Verify every quiz answer that can be checked by running SQL, then write quizzes.json."""
    from quizzes import QUIZZES
    out = []
    for quiz in QUIZZES:
        qs = []
        for i, q in enumerate(quiz["questions"], 1):
            q = dict(q)
            tag = f"quiz {quiz['id']} q{i}"
            if q["type"] == "spot":
                bug = "\n".join(q["lines"])
                fixed = "\n".join(q["fixed_line"] if n == q["answer"] else l for n, l in enumerate(q["lines"], 1))
                _, bug_rows = run(con, bug)
                _, fix_rows = run(con, fixed)
                assert not same(bug_rows, fix_rows, False), f"{tag}: the bug doesn't change the result"
                print(f"{tag} spot: bug {len(bug_rows)} rows, fixed {len(fix_rows)} rows")
                del q["fixed_line"]
            elif q["type"] == "predict":
                cols, rows = run(con, q["setup"] + "\n" + q["code"])
                right = q["options"][q["answer"]]
                assert same(rows, right["rows"], False), f"{tag}: answer option doesn't match {rows}"
                for j, opt in enumerate(q["options"]):
                    assert j == q["answer"] or not same(rows, opt["rows"], False), f"{tag}: option {j} is also right"
                print(f"{tag} predict: verified")
                del q["setup"]
            elif q["type"] == "choice" and "proof" in q:
                _, rows = run(con, q["proof"]["sql"])
                assert rows == q["proof"]["expect"], f"{tag}: proof gave {rows}"
                print(f"{tag} choice: claim verified")
                del q["proof"]
            elif q["type"] == "fix":
                cols, rows = run(con, q["solution"])
                assert cols == q["returns"], (tag, cols)
                try:
                    run(con, q["broken"])
                    raise AssertionError(f"{tag}: the broken query runs")
                except duckdb.Error:
                    pass
                q["expected"] = {"columns": cols, "rows": sorted(rows, key=lambda r: json.dumps(r))}
                print(f"{tag} fix: {len(rows)} expected rows")
                del q["solution"]
            qs.append(q)
        out.append({k: quiz[k] for k in ("id", "level", "title", "intro")} | {"questions": qs})
    (HERE / "quizzes.json").write_text(json.dumps(out, indent=1))
    print(f"wrote quizzes.json ({(HERE / 'quizzes.json').stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
