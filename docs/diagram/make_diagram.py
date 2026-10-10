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
    ("mail", "RESEND", "(email service)", 178),
    ("design", "DESIGNERS", "(claim in the app)", 178),
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

BOXES = [  # n, row, col, sub, type, title(optional), lines, planned(dashed)
    (1, "caller", 0, None, "human", None, ["Calls the studio number,", "any hour, day or night", "(1 in 3 enquiries come", "after hours)"], False),
    (2, "vaani", 0, None, "ai", "VOICE PACK · PLANNED", ["Answers EVERY call, English", "and Hindi; says it is an AI", "and may record the call"], True),
    (3, "vaani", 1, None, "ai", "TO CONFIRM (TEST CALL)", ["Call ends: sends a webhook", "with transcript, duration", "and summary"], True),
    (4, "app", 1, "top", "code", None, ["Receives the transcript,", "duration and summary", "(5-second reply: planned)"], False),
    (5, "app", 2, "bottom", "code", None, ["Loads the rules: services,", "Nikhil's 5-point rubric,", "ONE price reply, NO prices"], False),
    (6, "db", 2, None, "data", None, ["Earlier calls from same", "number (10-min dedupe),", "cost rates, settings"], False),
    (7, "app", 3, "top", "code", None, ["Verifies the signature,", "stores the call ONCE,", "checks for a redial"], False),
    (8, "app", 3, "bottom", "code", None, ["Strips phone, email and the", "caller's own name BEFORE", "anything goes to AI"], False),
    (9, "gemini", 4, None, "ai", "GEMINI 3.5 FLASH-LITE", ["Reads cleaned transcript →", "structured fields: area,", "scope, timeline, who decides"], False),
    (10, "app", 4, "top", "code", "RULES IN CODE, NOT AI", ["qualified · flagged · declined", "deferred · escalation ·", "incomplete (unit-tested)"], False),
    (11, "app", 5, "top", "code", None, ["Saves the result and queues", "the CRM write: a HubSpot", "outage never loses a call"], False),
    (12, "db", 5, None, "data", None, ["Stores call, fields, decision,", "cost, audit trail and the", "CRM retry queue (outbox)"], False),
    (13, "crm", 5, None, "data", None, ["Contact + deal in 'Aangan", "Enquiries', handoff note,", "tasks, estimated value"], False),
    (14, "mail", 5, None, "ai" if False else "code", "EMAIL · PLANNED", ["Resend emails on-duty designers:", "note + claim link. Unclaimed in", "15 min: auto-assign, alert Nikhil"], True),
    (15, "design", 5, None, "gate", "HUMAN GATE · PLANNED", ["First to claim owns the deal", "(sets the HubSpot owner) and", "confirms the visit; after hours: 10am"], True),
    (16, "nikhil", 5, None, "human", None, ["Works in HubSpot; also emailed", "on VIP, complaint and unclaimed", "leads. Declines kept to review"], False),
    (17, "caller", 5, None, "human", "LIVE CALL · PLANNED", ["Answered at once. Price asked?", "One warm reason, no number,", "free consultation requested"], True),
]
POS = {}
for n, row, col, sub, *_ in BOXES:
    POS[n] = box_xy(row, col, sub)

def L(n): x, y = POS[n]; return x, y + BH / 2
def R(n): x, y = POS[n]; return x + BW, y + BH / 2
def T(n): x, y = POS[n]; return x + BW / 2, y
def B(n): x, y = POS[n]; return x + BW / 2, y + BH

def Ra(n, dy): x, y = POS[n]; return x + BW, y + BH / 2 + dy
def La(n, dy): x, y = POS[n]; return x, y + BH / 2 + dy
GAP = ROW_Y["app"][0] + 180  # channel between the top and bottom boxes of the app lane
ARROWS = [  # points, label, position along path, optional label dx
    ([B(1), T(2)], "dials", 0.5),
    ([R(2), L(3)], "", 0.5),
    ([B(3), T(4)], "webhook", 0.5),
    ([Ra(4, -24), La(7, -24)], "the payload", 0.5),
    ([R(6), (L(7)[0] - 24, R(6)[1]), (L(7)[0] - 24, La(7, 24)[1]), La(7, 24)], "history", 0.3),
    ([T(5), (T(5)[0], GAP), (cx(4), GAP), B(10)], "rules loaded", 0.78),
    ([B(7), T(8)], "", 0.5),
    ([R(8), (cx(4), R(8)[1]), T(9)], "cleaned text", 0.7),
    ([R(9), (Ra(9, 0)[0] + 34, R(9)[1]), (Ra(9, 0)[0] + 34, Ra(10, 24)[1]), Ra(10, 24)], "fields", 0.5),
    ([Ra(10, -24), La(11, -24)], "", 0.5),
    ([B(11), T(12)], "saved + queued", 0.5),
    ([B(12), T(13)], "retry-safe sync", 0.5),
    ([B(13), T(14)], "deal opens", 0.5),
    ([B(14), T(15)], "email + claim link", 0.5),
    ([R(15), (R(15)[0] + 16, R(15)[1]), (R(15)[0] + 16, R(13)[1]), R(13)], "", 0.5),
    ([L(13), (L(13)[0] - 30, L(13)[1]), (L(13)[0] - 30, L(16)[1]), L(16)], "reports · escalations", 0.5, -118),
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
add(f'<text x="{W/2}" y="{gy+53}" text-anchor="middle" font-size="24" fill="#ffffff"><tspan fill="#f2c230" font-weight="700">THE CUT · CHECKS 06, 07, 09 GUARDRAIL</tspan> · No price is ever quoted. Code decides who qualifies; designers own design and price; Gemini only reads. Complaints go straight to Nikhil.</text>')
ly = gy + 130
items = [("human", "Human action", False), ("code", "App logic (code, not AI)", False), ("ai", "AI (Vaani, Gemini)", False), ("data", "Data (Supabase, HubSpot)", False), ("gate", "Human gate", False), ("gate", "Planned (dashed)", True)]
x = 150
for typ, name, dashed in items:
    fill, stroke, *_ = STYLE[typ]
    d = ' stroke-dasharray="8 5"' if dashed else ""
    add(f'<rect x="{x}" y="{ly}" width="56" height="34" rx="8" fill="{fill}" stroke="{stroke}" stroke-width="3"{d}/>')
    add(f'<text x="{x+72}" y="{ly+25}" font-size="20" fill="#2b3345">{esc(name)}</text>')
    x += 72 + len(name) * 11.5 + 70
add(f'<text x="{W/2}" y="{ly+78}" text-anchor="middle" font-size="19" fill="#5d6677">Built and tested: 4 to 13 and 16 (Nikhil\'s HubSpot reports are set up by hand) · Planned or to confirm: 2, 3, 17 (Vaani voice pack and a live number) and 14, 15 (designer email, claim and auto-assign)</text>')
add("</svg>")
svg = "\n".join(out)
open("components-map-diagram.svg", "w").write(svg)
open("components-map-diagram.html", "w").write(f'<!doctype html><html><head><meta charset="utf-8"><style>html,body{{margin:0;background:#fff}}</style></head><body>{svg}</body></html>')
print("size", W, H)
