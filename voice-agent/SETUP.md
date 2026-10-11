# Setting up the receptionist in Vaani (step by step)

You will make a new agent, paste the prompt and greeting, add the knowledge files, point the webhook at the new agent,
and test. Estimated time: 30 to 45 minutes. Screen names below are the real ones in Vaani (checked 12 Oct 2026); if one
looks different, search the page for its name.

## 0. Before you start
- Open `voice-agent/prompt.md`, `voice-agent/greeting.md` and the five files in `voice-agent/knowledge/`.
- Nothing in these files contains a price, and that must stay true. The studio's pricing guide is NEVER uploaded to Vaani.

## 1. Create the agent
1. Vaani > **Design > Agents** > **New Agent**.
2. Choose **Build from Scratch** (or **Vibe-Code** and then overwrite everything in the next steps).
3. Name: `aangan-receptionist`. Description: `Answers Aangan Studio's calls`.

## 2. Persona tab: identity, voice, language
1. **System prompt:** paste everything below the line in `voice-agent/prompt.md`.
2. **Greeting message:** paste the line from `voice-agent/greeting.md`. Keep **Let user speak first** switched OFF.
3. **Language:** Hindi as the base is fine, because the agent replies in the language the caller uses (English, Hindi or a mix).
   Voice: **Sarvam "priya"** (natural Hindi/English), with **Cartesia "Aarti"** as the backup voice.
4. **Ears (speech-to-text):** if there is a **keyword boosting** box, add these words so place names are heard correctly:
   `Aangan, Kothrud, Baner, Wakad, Aundh, Hinjewadi, Pimple Saudagar, Pimple Nilakh, Koregaon Park, Kalyani Nagar, Viman Nagar, Hadapsar, Magarpatta, Kharadi, Undri, Kondhwa, BHK, carpet area, Nikhil`
5. Leave **Brain** (the language model) and **Mouth** at their defaults. Keep replies short; the prompt already asks for that.
6. Do not add any tools or actions. This agent only talks.

## 3. Training tab: knowledge
1. Left menu **Knowledge Base** > create one called `aangan-knowledge` > upload the five files from `voice-agent/knowledge/`.
2. Back in the agent > **Training > Knowledge** > attach `aangan-knowledge`.
3. **Know-how** (guardrails): add these three, one per line:
   - `Never state any price, range or per-square-foot rate for any reason.`
   - `Never promise a specific callback time: only "during working hours, ten in the morning to seven in the evening".`
   - `Existing-client complaints: apologise once, take name, project area and designer, and say a senior person will call back within fifteen minutes.`

## 4. Experience tab
- Turn **end conversation on idle** on, with a timeout of about 20 to 30 seconds of silence, so abandoned calls end by themselves.
- Leave the rest as it is.

## 5. Analysis tab (optional but useful to look at in Vaani)
Our own system re-reads every transcript, so none of this is required. It only gives Vaani's own dashboard nicer labels.
- **Extractions:** `caller_name`, `location`, `property_type`, `carpet_area_sqft`, `scope`, `furniture_needed`, `storage_needs`, `structural_work`, `property_status`, `timeline`, `owner_or_decision_maker`, `referral_source`, `budget_if_volunteered`.
- **Evaluations / dispositions:** `Enquiry collected`, `Declined: outside area`, `Declined: out of scope`, `Deferred: needs later start`, `Complaint: escalate`, `Incomplete call`.

## 6. Deploy tab: the phone number
- **Call Type: Inbound.** **Inbound Phone Number:** pick the studio's number. A new account has none: ask MESA whether a number is provided,
  or look at Vaani > **Telephony** (do not buy anything without checking the cost). Click **Save Changes**.
- Until there is a number, you can still test with **Start Test** (see step 8). Note: **Start Test rings the phone number you give it**
  (it is an outbound call), so it is a fair rehearsal but not identical to a real inbound call.

## 7. Move the webhook to the new agent (important)
Vaani allows only **one webhook per agent**, and ours is attached to `aangan-test`.
1. Vaani > **Developers > Webhooks** > click the `aangan-receptionist` webhook row.
2. In **Agents**, untick `aangan-test` and tick the new `aangan-receptionist` agent.
3. **Do not change the secret** (a wrong paste breaks everything with 401 errors: see the Secret box).
4. Click **Test Connectivity** (it must say success) and **Save Changes**.

## 8. Test calls (do all of these; each takes about two minutes)
Use **Agents > aangan-receptionist > Start Test > Audio**. After each call wait two minutes, then check the lead in HubSpot (Deals).

| # | You say | You should hear | The lead should be |
|---|---|---|---|
| 1 | A normal enquiry: 3BHK in Baner, about 1,150 sq ft, whole home, by March, you are the owner | One question at a time, repeats the size back, summarises, "designer will call during working hours" | Qualified, in New (qualified) |
| 2 | Same, but ask "how much will it cost?" twice | A reason, then the pricing line, never a number, and the call carries on | Qualified, flag "price asked" |
| 3 | "I'm in Nashik" | A kind decline with the reason and the door left open | Declined (review) |
| 4 | "I'm opening a restaurant in Koregaon Park" | A kind decline, a suggestion to find a hospitality specialist | Declined (review) |
| 5 | "I need it done in three weeks" | Honest, offers a later start, notes it | Deferred, with a revisit date |
| 6 | "My designer hasn't replied in five days" | An apology, asks name and designer, says a senior person will call back within fifteen minutes | Escalation, and an email to Nikhil |
| 7 | Speak Hindi or Hinglish for the whole call | Replies in Hindi/Hinglish, repeats sizes back | Qualified (the details in English) |
| 8 | Stay silent, or hang up after your first sentence | "Hello, are you still there?" at most twice | Incomplete call, with a callback task |

If any test goes wrong, note the minute, the exact words said, and what the agent answered: that is what is needed to fix the prompt.

## 9. Before real callers
- Replace the webhook secret (it appeared in a screenshot during setup): a new value in `.env.local`, in Vercel's Environment Variables, and in the webhook's Secret box in Vaani.
- Move Gemini to its paid tier (the free tier may use call content to improve Google's products).
- Verify a sender domain in Resend so emails reach designers, not only the account owner.
- Tell callers honestly on the call that it is an AI assistant and may be recorded (the greeting already does).
