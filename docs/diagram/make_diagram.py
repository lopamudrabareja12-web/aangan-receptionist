# Generates the swimlane Components Map (SVG -> HTML) for the Aangan phone receptionist.
import html

W, LABEL_W = 2400, 230
COLS = ["TRIGGER", "INPUT", "CONTEXT", "PROCESSING", "AI", "OUTPUT"]
COL_W = (W - LABEL_W) / len(COLS)
HEAD = 150
ROWS = [  # key, label, sublabel, height
    ("caller", "CALLER", "(homeowner / business)", 178),
    ("vaani", "VAANI", "(voice agent)", 178),
    ("app", "OUR APP", "(webhook + code · Vercel)", 360),
    ("gemini", "GEMINI", "(LLM · after the call)", 178),
    ("db", "SUPABASE", "(database)", 178),
    ("crm", "HUBSPOT", "(CRM · Nikhil's workspace)", 178),
    ("design", "DESIGNERS", "(email + claim)", 178),
    ("nikhil", "NIKHIL", "(founder)", 178),
]
ROW_Y, y = {}, HEAD
for k, _, _, h in ROWS:
    ROW_Y[k] = (y, h)
    y += h
BODY_END = y
BW, BH = 304, 128
STYLE = {  # fill, stroke, text, badge
    "human": ("#e8f0ff", "#3b6fd4", "#1d3b82", "#3b6fd4"),
    "code": ("#eef0f4", "#3d4659", "#222a3a", "#3d4659"),
    "ai": ("#fde8ef", "#d6336c", "#7d1038", "#d6336c"),
    "data": ("#e6f6ec", "#1f9d55", "#0f5130", "#1f9d55"),
    "gate": ("#fff4d6", "#d9a400", "#6b4e00", "#d9a400"),
}

def cx(c): return LABEL_W + c * COL_W + COL_W / 2
def box_xy(row, col, sub=None):
    ry, rh = ROW_Y[row]
    top = ry + (32 if sub == "top" else 200 if sub == "bottom" else (rh - BH) / 2)
    return cx(col) - BW / 2, top

BOXES = [  # n, row, col, sub, type, title(optional), lines, planned
    (1, "caller", 0, None, "human", None, ["Calls the studio number,", "any hour, day or night", "(1 in 3 enquiries come", "after hours)"], False),
    (2, "vaani", 0, None, "ai", None, ["Answers EVERY call,", "English / Hindi; says it is", "an AI and may record"], False),
    (3, "vaani", 1, None, "ai", None, ["Call ends: sends a signed", "webhook with transcript,", "duration and summary"], False),
    (4, "app", 1, "top", "code", None, ["Webhook arrives; signature", "is verified; the call is", "stored ONCE (retry-safe)"], False),
    (5, "app", 2, "top", "code", None, ["Loads the rules: services,", "Nikhil's 5-point rubric,", "ONE price reply, NO prices"], False),
    (6, "db", 2, None, "data", None, ["Earlier calls from same", "number (10-min dedupe),", "cost rates, settings"], False),
    (7, "app", 3, "top", "code", None, ["Strips phone, email and the", "caller's own name BEFORE", "anything goes to AI"], False),
    (8, "gemini", 4, None, "ai", "GEMINI 3.5 FLASH-LITE", ["Reads cleaned transcript →", "structured fields: area,", "scope, timeline, who decides"], False),
    (9, "app", 3, "bottom", "code", "RULES IN CODE, NOT AI", ["qualified · flagged · declined", "deferred · escalation ·", "incomplete (unit-tested)"], False),
    (10, "db", 3, None, "data", None, ["Saves call, fields, decision,", "cost and full audit trail", "(raw transcripts stay here)"], False),
    (11, "app", 5, "bottom", "code", None, ["Queues the CRM write with", "retries: a HubSpot outage", "never loses a call"], False),
    (12, "crm", 5, None, "data", None, ["Contact + deal in 'Aangan", "Enquiries', handoff note,", "tasks, estimated value"], False),
    (13, "design", 5, None, "gate", "HUMAN GATE · PLANNED", ["Email with claim link: first", "designer to claim owns it;", "auto-assign after 15 min"], True),
    (14, "nikhil", 5, None, "human", None, ["Works in HubSpot: every lead,", "escalations, and declines", "kept for review"], False),
    (15, "caller", 5, None, "human", "LIVE, DURING THE CALL", ["Answered at once. Price asked?", "One warm reason, no number,", "free consultation booked"], False),
]
POS = {}
for n, row, col, sub, *_ in BOXES:
    POS[n] = box_xy(row, col, sub)

def L(n): x, y = POS[n]; return x, y + BH / 2
def R(n): x, y = POS[n]; return x + BW, y + BH / 2
def T(n): x, y = POS[n]; return x + BW / 2, y
def B(n): x, y = POS[n]; return x + BW / 2, y + BH

def Ra(n, dy): x, y = POS[n]; return x + BW, y + BH / 2 + dy
ARROWS = [  # points, label, position along path, style
    ([B(1), T(2)], "dials", 0.5),
    ([R(2), L(3)], "", 0.5),
    ([B(3), T(4)], "webhook", 0.5),
    ([R(4), L(5)], "", 0.5),
    ([R(5), L(7)], "", 0.5),
    ([R(6), (L(9)[0] - 22, R(6)[1]), (L(9)[0] - 22, L(9)[1]), L(9)], "dedupe · rates", 0.35),
    ([R(7), (cx(4), R(7)[1]), T(8)], "cleaned text", 0.62),
    ([L(8), (Ra(9, 24)[0] + 34, L(8)[1]), (Ra(9, 24)[0] + 34, Ra(9, 24)[1]), Ra(9, 24)], "fields", 0.62, -4),
    ([B(9), T(10)], "saved + audit", 0.5),
    ([Ra(9, -24), (L(11)[0], Ra(9, -24)[1])], "the decision", 0.8),
    ([B(11), T(12)], "retry-safe sync", 0.5),
    ([B(12), T(13)], "deal opens", 0.5),
    ([L(12), (L(12)[0] - 30, L(12)[1]), (L(12)[0] - 30, L(14)[1]), L(14)], "reports · escalations", 0.5, -118),
]

def label_at(points, t):
    segs = [(points[i], points[i + 1]) for i in range(len(points) - 1)]
    lens = [abs(b[0] - a[0]) + abs(b[1] - a[1]) for a, b in segs]
    target, acc = sum(lens) * t, 0
    for (a, b), l in zip(segs, lens):
        if acc + l >= target:
            f = (target - acc) / l if l else 0
            return a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f
        acc += l
    return points[-1]

def esc(s): return html.escape(s, quote=True)
out = []
add = out.append
H = BODY_END + 260
add(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" font-family="Helvetica Neue, Helvetica, Arial, sans-serif">')
add('<defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="#2b3345"/></marker></defs>')
add(f'<rect width="{W}" height="{H}" fill="#ffffff"/>')
add(f'<rect width="{W}" height="{HEAD - 70}" fill="#14161a"/>')
add(f'<text x="{W/2}" y="58" text-anchor="middle" fill="#fff" font-size="40" font-weight="700" letter-spacing="3">AANGAN STUDIO · AI PHONE RECEPTIONIST · COMPONENTS MAP</text>')
add(f'<text x="{W/2}" y="102" text-anchor="middle" fill="#9aa3b2" font-size="20">MESA Case 03 · incoming phone calls only · Trigger → Input → Context → Processing → AI → Output</text>')
# column headers
add(f'<rect x="0" y="{HEAD-70}" width="{W}" height="70" fill="#f6f7f9"/>')
for i, c in enumerate(COLS):
    add(f'<text x="{cx(i)}" y="{HEAD-30}" text-anchor="middle" font-size="27" font-weight="700" letter-spacing="4" fill="#161a22">{c}</text>')
    add(f'<circle cx="{cx(i)}" cy="{HEAD-6}" r="7" fill="#1f9d55"/>')
# rows
for idx, (k, label, sub, h) in enumerate(ROWS):
    ry, _ = ROW_Y[k]
    add(f'<rect x="0" y="{ry}" width="{W}" height="{h}" fill="{"#ffffff" if idx % 2 == 0 else "#f8f9fb"}"/>')
    add(f'<line x1="0" y1="{ry}" x2="{W}" y2="{ry}" stroke="#dfe3ea"/>')
    add(f'<text x="{LABEL_W/2}" y="{ry + h/2 - 4}" text-anchor="middle" font-size="25" font-weight="700" fill="#161a22">{esc(label)}</text>')
    add(f'<text x="{LABEL_W/2}" y="{ry + h/2 + 24}" text-anchor="middle" font-size="18" fill="#5d6677">{esc(sub)}</text>')
for i in range(len(COLS) + 1):
    x = LABEL_W + i * COL_W
    add(f'<line x1="{x}" y1="{HEAD-70}" x2="{x}" y2="{BODY_END}" stroke="#dfe3ea"/>')
add(f'<line x1="0" y1="{BODY_END}" x2="{W}" y2="{BODY_END}" stroke="#dfe3ea"/>')
# arrows
for pts, label, t, *opt in ARROWS:
    dx = opt[0] if opt else 0
    d = "M " + " L ".join(f"{x:.1f} {y:.1f}" for x, y in pts)
    add(f'<path d="{d}" fill="none" stroke="#2b3345" stroke-width="2.6" stroke-dasharray="9 7" marker-end="url(#ah)"/>')
    if label:
        lx, ly = label_at(pts, t)
        lx += dx
        w = len(label) * 9.2 + 30
        add(f'<rect x="{lx - w/2:.1f}" y="{ly - 17:.1f}" width="{w:.1f}" height="34" rx="17" fill="#fff" stroke="#c9cfda"/>')
        add(f'<text x="{lx:.1f}" y="{ly + 6:.1f}" text-anchor="middle" font-size="16" font-style="italic" fill="#4a5262">{esc(label)}</text>')
# boxes
for n, row, col, sub, typ, title, lines, planned in BOXES:
    x, y0 = POS[n]
    fill, stroke, txt, badge = STYLE[typ]
    dash = ' stroke-dasharray="10 6"' if planned else ""
    add(f'<rect x="{x:.1f}" y="{y0:.1f}" width="{BW}" height="{BH}" rx="16" fill="{fill}" stroke="{stroke}" stroke-width="3"{dash}/>')
    ty = y0 + (58 if title else 42)
    if title:
        add(f'<text x="{x + BW/2:.1f}" y="{y0 + 30}" text-anchor="middle" font-size="15" font-weight="700" letter-spacing="2" fill="{stroke}">{esc(title)}</text>')
    for i, ln in enumerate(lines):
        add(f'<text x="{x + BW/2:.1f}" y="{ty + i*25:.1f}" text-anchor="middle" font-size="17.5" fill="{txt}">{esc(ln)}</text>')
    add(f'<circle cx="{x + 4:.1f}" cy="{y0 + 4:.1f}" r="20" fill="{badge}"/>')
    add(f'<text x="{x + 4:.1f}" y="{y0 + 11:.1f}" text-anchor="middle" font-size="21" font-weight="700" fill="#fff">{n}</text>')
# guardrail + legend
gy = BODY_END + 28
add(f'<rect x="40" y="{gy}" width="{W-80}" height="86" rx="22" fill="#14161a"/>')
add(f'<text x="{W/2}" y="{gy+53}" text-anchor="middle" font-size="25" fill="#ffffff"><tspan fill="#f2c230" font-weight="700">THE CUT · CHECKS 06 + 09 GUARDRAIL</tspan> · The system never quotes a price. Code decides who qualifies; Gemini only reads the transcript. Complaints go straight to Nikhil.</text>')
ly = gy + 130
items = [("human", "Human action", False), ("code", "App logic (code, not AI)", False), ("ai", "AI (Vaani, Gemini)", False), ("data", "Data (Supabase, HubSpot)", False), ("gate", "Human gate", False), ("gate", "Planned (dashed)", True)]
x = 150
for typ, name, dashed in items:
    fill, stroke, *_ = STYLE[typ]
    d = ' stroke-dasharray="8 5"' if dashed else ""
    add(f'<rect x="{x}" y="{ly}" width="56" height="34" rx="8" fill="{fill}" stroke="{stroke}" stroke-width="3"{d}/>')
    add(f'<text x="{x+72}" y="{ly+25}" font-size="20" fill="#2b3345">{esc(name)}</text>')
    x += 72 + len(name) * 11.5 + 70
add(f'<text x="{W/2}" y="{ly+78}" text-anchor="middle" font-size="19" fill="#5d6677">Built and tested: boxes 3 to 12, 14, 15 (the live phone line also needs a Vaani number) · Planned: 13 (designer email and claim) and a live Vaani number</text>')
add("</svg>")
svg = "\n".join(out)
open("components-map-diagram.svg", "w").write(svg)
open("components-map-diagram.html", "w").write(f'<!doctype html><html><head><meta charset="utf-8"><style>html,body{{margin:0;background:#fff}}</style></head><body>{svg}</body></html>')
print("size", W, H)
