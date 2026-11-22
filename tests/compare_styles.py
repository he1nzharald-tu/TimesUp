"""Vergleicht die berechneten Stile zweier Läufe von shots.py mit DUMP=1:
    python3 tests/compare_styles.py <vorher> <nachher>
Zustände von ::before/::after (laufende Hintergrundanimation) werden ignoriert."""
import sys, json, glob, os, collections
a, b = sys.argv[1], sys.argv[2]
total = 0; bad = collections.Counter(); examples = {}
for f in sorted(glob.glob(a + "/*.json")):
    g = os.path.join(b, os.path.basename(f))
    import re as _re
    normk = lambda k: ">".join(_re.sub(r"(#[^:]+):\d+$", r"\1", seg) for seg in k.split(">"))
    x = {normk(k): v for k, v in json.load(open(f)).items()}
    y = {normk(k): v for k, v in json.load(open(g)).items()}
    if set(x) != set(y): print("Elemente verschieden:", os.path.basename(f), list(set(x) ^ set(y))[:3])
    for el in x:
        if el not in y: continue
        for p, v in x[el].items():
            if p.startswith("::"): continue
            total += 1
            if y[el].get(p) != v:
                key = (el.split(">")[-1], p); bad[key] += 1
                examples.setdefault(key, (os.path.basename(f), v, y[el].get(p)))
print(total, "Werte verglichen,", sum(bad.values()), "verschieden")
for k, n in bad.most_common(60): print(n, k, examples[k])
