# Aangan Studio: Automation Brief and Nine Checks

MESA AI and its Application · Cohort C4 · Case 03 (Nikhil: Unanswered Enquiries). Scope: incoming phone calls only.
Figures marked *(brief)* come from the case pre-read, *(calls)* from the 20 phone transcripts (T01-T20), and *(derived)* are my own arithmetic on those numbers.

## Part 1: Automation Brief

### Why: Pain, User, Outcome

**Pain.** Aangan's work sells itself, but enquiries are lost after they arrive. About 200 enquiries a month come in, roughly 48% get no
response within 48 hours, and about a third arrive outside the front desk's 10am-7pm hours *(brief)*. Speed matters: an enquiry answered
within an hour converts at four times the rate of one answered the next day *(brief)*. When an enquiry does reach a designer it is
usually a forwarded message with no context, so the designer's first call is spent re-asking what the front desk already asked *(brief)*.

**User.** Three people feel it, in this order:
1. **The caller** (a homeowner with a real project) who wants an answer now, not tomorrow.
2. **The designer**, who needs the enquiry with the answers already captured, and a clear owner.
3. **Nikhil Deshpande, the founder**, who pulled the numbers by hand last month and wants a view that costs him no effort, including what the tool itself costs.

**Outcome.** Every call is answered at once, day or night. The ones worth a designer's time reach a named designer with a handoff note
that already holds location, size, scope, timeline and who decides. The rest are declined kindly with a reason, or escalated to a human.
Nikhil sees what came in, what it cost and what it generated without collecting numbers himself.

### Journey Today (what happens to a phone enquiry now)

| Step | What happens | Where it breaks (evidence) |
|---|---|---|
| 1. Caller dials | The studio phone rings. Two front-desk staff cover 10am-7pm. | A third of enquiries arrive outside those hours and "go unanswered unless staff are present" *(brief, calls)*. T08: missed call at 10:47pm, no voicemail. |
| 2. Front desk answers | The desk asks questions in whatever order it remembers. | Fields go missing: square footage in 2 of the 11 forwarded calls, timeline in 3, decision-maker not confirmed in about 5 *(calls)*. |
| 3. Callback if missed | Someone rings back the next morning. | T08: the 10:15am callback was not answered. The lead is gone. |
| 4. Note and forward | The desk forwards a message to a designer. | No standard note. Designers re-ask the same questions on the first call *(brief)*. T16: a caller rang on Monday, nobody took a note, and he was re-logged on Friday, frustrated. |
| 5. Pricing questions | Callers ask what it will cost. | Two callers asked (T02, T13). The desk deflected with a reason and a next step, and both still booked. |
| 6. Declines | The desk decides alone whether a caller is worth a designer. | Five declines (T03, T04, T10, T18, T19) were handled well, but nothing was logged for Nikhil to review. T18 (180 sq ft) was declined although `services.md` states no minimum. |
| 7. Complaints | An existing client calls upset. | T09 must not be treated as a new enquiry. It relies on the desk spotting it and escalating by hand. |
| 8. Dropped lines | The caller redials. | T17: the line dropped, the caller called back two minutes later, and the system could create two enquiries. |
| 9. Reporting | Nikhil pulls numbers manually. | There is no standing view of volume, response time, cost or pipeline. |

**What this journey costs, in numbers.** About 33% of 200 enquiries arrive after hours *(derived: roughly 66 a month)*, and about half of all
enquiries get no reply in 48 hours *(brief)*. At ₹8-14 lakh per project *(brief)*, even a small share of those becoming projects is worth
more than the whole tool costs to run (see check 08).

## Part 2: Nine Checks

The numbering follows the latest lecture slide (Lecture 4, Case 3): 01 Problem real, 02 Workflow repeated, 03 Input available,
04 Output valuable, 05 Impact measurable, 06 Failure risk OK, 07 Judgment protected, 08 ROI worth it, 09 Owner clear.

| # | Check | Verdict | Evidence from the case |
|---|---|---|---|
| 01 | Problem real | **Yes** | Nikhil's own numbers: about 48% unanswered in 48 hours, 4x conversion within an hour, about a third after hours *(brief)*. T08 and T16 are real lost leads. |
| 02 | Workflow repeated | **Yes** | About 200 enquiries a month. Every phone call needs the same 12 fields (location, building type, carpet area, scope, furniture, storage, structural work, property status, timeline, owner/decision-maker, referral source, budget only if volunteered). The 20 calls show the same shape each time. |
| 03 | Input available | **Yes** | A voice agent produces a full transcript for every call. 40 anonymised transcripts exist (20 phone), plus `services.md`, `qualified.md` and `pricing.md` for the rules. |
| 04 | Output valuable | **Yes** | Designers get a ready handoff note, not a forwarded message. Callers get an instant answer. Nikhil gets a record of every call and every decline. |
| 05 | Impact measurable | **Yes** | We can measure response time, share answered after hours, qualified vs declined vs deferred vs escalated, consultations booked, and cost per call. These come from the data we store, not from anyone's memory. |
| 06 | Failure risk OK | **Yes for answering, capturing and handoff. No for quoting prices.** | A wrong note is caught by the designer's first call. A wrong price becomes a promise to a customer on a ₹8-14 lakh project. `pricing.md` itself says "indicative only, varies by site". |
| 07 | Judgment protected | **Yes** | Designers keep design and pricing. A human takes every complaint (T09, T16). The AI declines only on hard fails, and every decline is logged with its transcript for Nikhil to reverse. |
| 08 | ROI worth it | **Yes, pending Nikhil's baseline** | Running cost is small *(derived)*: at the ₹5.51 per minute voice rate we assume (editable), 200 calls of about 5 minutes is roughly ₹5,500 a month as an upper bound, plus a small model cost. One extra project at ₹8 lakh is worth well over 100 months of that voice cost. The real answer needs Nikhil's current conversion percentage, which is not in the data. The dashboard has an editable conversion-rate input for it. |
| 09 | Owner clear | **Yes for handoff. No for price quotes.** | A designer claims each lead, and HubSpot records the owner. Nobody is accountable for a number the AI quotes, which is the second reason the Cut stands. |

### The Cut

**What Nikhil asked for:** "the system should be able to quote our standard per-square-foot pricing so people don't have to wait for that."

**What we did not build:** price quoting, in any form (no figure, no range, no per-square-foot rate, in the agent, its prompt or any screen).

**Which checks stop it:** check 06 (failure risk) and check 09 (no accountable owner for the number). The pricing guide's own note ("indicative only,
varies by site") agrees.

**What we built instead:** one warm reply with a reason ("it varies a lot with the site and the materials") and a next step (book the free,
no-obligation consultation with a designer). The evidence says this works: in both calls where the caller pushed for a price (T02, T13), they
still booked after the deflection.

### The second risk we designed around

An automatic decline is invisible when it is wrong, because nobody hears from the caller again. So the AI declines only on hard fails: outside
Pune and PCMC, an out-of-scope project type (restaurant, hotel, retail, gym), advice-only, or structural-only. Everything softer (a tight
timeline, an unclear budget, a decision-maker who is not on the call) goes to a designer with a flag. A clearly-too-low budget the caller volunteers is
held for Nikhil's review and not forwarded. Every decline is logged with a reason code and its transcript.

## Open items for Nikhil

- His current enquiry-to-project conversion rate (for check 08).
- Whether a very small commercial job (T18, 180 sq ft) should be forwarded. For now it is forwarded with a flag, because `services.md` states no minimum.
- A real studio phone number for the voice agent. Today the agent can only be tested by calling out to a test phone.
