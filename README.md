# Residue

A dashboard-driven crime simulation (single player prototype). The city is procedurally generated
from a seed. You are a serial killer with a cover life; the AI-run city and police try to catch you.
There is no 3D world — like *Airline Manager*, everything happens through a dashboard while the
simulation runs underneath.

```bash
npm install
npm run dev        # play at http://localhost:5173
npm run smoke      # headless simulation test: commits one crime and prints the investigation
npm run desktop    # the desktop app (Electron) on the built game
npm run dist       # Windows installer → release/Residue-Setup-<version>.exe
```

### Desktop app and one life per machine

`npm run dist` builds `release/Residue-Setup-<version>.exe`, an NSIS installer for 64-bit Windows. It lets you choose the install folder and adds desktop and Start Menu shortcuts. The unpacked app is in `release/win-unpacked/`. The installer is **not code-signed** (that needs a code-signing certificate), so Windows SmartScreen will warn on first run.

In the desktop app the ending is bound to the machine (`electron/lock.cjs`). When a game ends, a signed record keyed to a hash of the PC's physical MAC addresses (never the addresses themselves) is written to three places:

- the app's data folder, which also holds the full ending
- `%LOCALAPPDATA%\ResidueGame\lock.dat`, which the uninstaller doesn't remove
- the registry key `HKCU\Software\ResidueGame`

If any one copy survives, the game opens on its ending, or on a "this machine has had its life" screen, and missing copies are restored. Reinstalling, clearing app data and deleting saves don't start a new game. Nothing is sent over the network.

Limits: someone who changes their MAC address and deletes all three copies can play again. Enforcing one life for real needs a server or Steam. To reset your own machine while developing, run `npm run unlock-machine` (unpackaged builds only; the installed game ignores it). `node scripts/lock-check.cjs` tests the lock against a throwaway registry key and folder.

Time runs at one fixed pace: **6 game hours per real hour** (one game minute every 10 real seconds; a game day is 4 real hours). It can't be paused: calls ring for 3 game minutes and then go to missed, and choices wait in your messages until they expire. It doesn't run while the game is closed. Tick **Dev: show truth** in the sidebar (which also adds a "+1h" skip button for testing) to see
the hidden state (all evidence, worry levels, police task queue).

**Keyboard:** one letter jumps to a page. H hideout, L calendar, W work, M money, F phone, N news, P people, C city, K kill, S shop, B black market, I stash. Hover the sidebar to see them.

## Core idea: three layers of truth

| Layer | Who sees it |
|---|---|
| **Truth** — every camera, witness, trace, call, timer | Only the simulation (and Dev mode) |
| **Player intel** — what you scouted / researched / tailed | You |
| **Police knowledge** — evidence they've actually uncovered | The case files |

The fun comes from the gap: a camera you never spotted recorded you, the footage exists, and you
won't know whether police pulled it before it was overwritten.

## Code layout

```
src/sim/            pure TypeScript simulation — no React; can later run on a server for multiplayer
  worldgen.ts       seeded city: districts, locations, cameras, residents, jobs, routines, relationships
  calls.ts          hourly phone traffic; unanswered calls to the dead raise "worry"
  bodies.ts         body decay/discovery per disposal type, missing-person reports
  police.ts         case AI: interviews, phone records, CCTV pulls, canvass, autopsy, forensics,
                    tower dumps, purchase checks, questioning, warrants, arrests, cold cases
  actions.ts        player activities (scout, research, tail, shop, dispose, clean car) and the operation
  engine.ts         clock: 10-minute steps, hourly systems, the player's cover job and money
src/ui/             React dashboard
scripts/smoke.ts    headless test run
```

## Systems at a glance

- **Routines** — every NPC has a home, job shift and habits (bar nights, gym, dog walks). `whereIs()` is the truth.
- **Missing persons** — nobody tracks this explicitly. Housemates notice at night, bosses notice missed shifts,
  friends notice unanswered calls. When someone's worry reaches 1.0 they file a report. Loners can go
  unreported for up to 12 days, until the landlord reports them.
- **Evidence** — every action can create evidence with a discovery channel (`cctv_pull`, `canvass`,
  `forensics`, `phone_records`, `tower_dump`, `purchase_check`, `search`). Police only see evidence when a task
  uses that channel. CCTV expires, and witnesses' memories fade.
- **Bodies** — each disposal type has its own discovery curve: unweighted bodies in water float after about 2.5 days,
  dumpsters get emptied every third morning, and construction foundations seal on pour day.
- **Suspicion** — evidence of the same kind adds up with diminishing returns, and different kinds stack.
  Thresholds trigger questioning (prints and DNA taken), then a search warrant, then an arrest. Innocent people
  can be questioned, cleared or wrongly arrested.
- **People you know** — the People view only lists people the player has met: relations and neighbours at the start, then anyone met while hanging out, scouting, tailing or shopping, people found by researching a social circle, and people named in the news. You can only plan operations against people you know.
- **Audio** — everything is synthesized with Web Audio in `src/ui/audio.ts` (city ambience that shifts between day and night, UI clicks, alerts, scanner static, a heartbeat, a game-over sting). There are no audio files, so nothing to license. Recorded assets can replace these functions later.
- **City map** — `src/ui/mapLayout.ts` builds a 2D map from the seed (districts, river, lakes, forests, roads), using its own RNG so it never changes the simulation. Pins show which places you have scouted or visited, and homes of people whose address you know.
- **Portraits** — `src/ui/Face.tsx` draws each resident from a hash of their id: skin tone, hair, facial hair, glasses, signs of age. No image files.
- **Phone** — friends text and invite you out (accepting books a Hang out), your boss texts when you miss a shift, and friends of a missing victim ask if you have heard from them. Detectives **call** you: you pick an alibi, and police check it against what really happened. For example, "I was at home" holds up only if your phone was actually at home. `npm run alibi` tests this headlessly.
- **No hints** — the UI never explains what a choice will lead to. The player learns what gets them caught by getting caught.
- **Two lives** — you start unemployed. The Work tab has a weekly job board: apply, get an interview by message, get hired (or not). Each job pays a fixed weekly salary on Fridays and has set shift hours. Any activity during a shift, even an hour, is an absence: a strike, docked pay, and a record police can pull when they check your employer. You can call in sick, but then you were not at work. `npm run jobs`
- **Agenda & calendar** — plans queue on an agenda instead of one at a time. They can't overlap, and travel time to each place is added either side. Life adds its own entries: family dinners, birthdays, doctor visits, landlord inspections, overtime, dates. Skipping one has consequences (hurt relationships, fees, a strike, or a landlord who sees something). `npm run life`
- **Love** — ask out someone you know. Dates show up on the calendar, and you can propose and marry. A spouse moves in, notices nights out and asks about them, and may cover for you (or not) when police check an "I was at home" alibi.
- **Shops & places** — stores, bars, restaurants, gyms and offices have opening hours, and you can't shop at or meet someone in a closed venue. Shopping uses a basket, and suspicious items bought alongside ordinary groceries draw less attention. You need groceries, or you pay to eat out. Gifts (flowers, wine) help relationships. Important places have CCTV, and you can spray-paint the cameras you've spotted (the ones you missed may film you doing it).
- **The urge** — it builds every hour without a kill (only slowly while a kill is planned). Past about 55% the UI glitches harder and harder (colour split, tearing, shaking, names and intrusive words flashing, a souring drone and heartbeat). At 100% you black out and kill whoever is nearby: bare hands, no gloves or mask, phone on you, body left where it falls. `npm run urge` (scripts/urge-check.ts)
- **The press** — when police link deaths, the killer gets a name based on method, disposal and district ("The Harbor Strangler"). It appears in the news and in the HUD.
- **Surrender** — "Turn yourself in" in the sidebar, or confess when a detective calls. Separate ending.
- **Money** — 28-day months: rent ($1,100), utilities, phone, car insurance, childcare. Autopay, late fees, credit score, loans, overdraft fees, debt collectors. Unpaid rent leads to an eviction notice, then eviction, and the landlord clears out (and sees) your stash. Paying cash leaves ATM records, and police subpoena your bank records once you're a suspect.
- **Car** — fuel, wear, breakdowns, gas stations, servicing. Rent a car for a kill to keep your plate off camera; the rental desk keeps a record, and stains get reported.
- **Weather & seasons** — 112-day year, daily forecast. Rain washes outdoor evidence, snow keeps footprints, fog blinds cameras and witnesses, heat speeds up decay, and nights are longer in winter.
- **Events** — holidays (no work, shops closed), festivals and marathons (crowds, road closures), Night of Masks (a balaclava is just a costume), New Year's Eve fireworks (nobody hears anything), open-air concerts.
- **Kids** — once married, start a family. A baby means night feeds at 2am, checkups, childcare bills, and a spouse who is awake at night.
- **Underworld** — black-market deals at night in alleys, cash only, with a 5% chance of an undercover sting. Fake IDs (cheap: 50% spotted; quality: 95% pass), clean burners, stolen plates, a sedative, an unregistered pistol (loud, ballistics link cases), and the Cleaner (bodies vanish).
- **Trophies** — take one during a kill. Trophies kept at home are near-conclusive evidence in a search. A storage unit in your own name shows up in your bank records and gets searched too; under a fake name it doesn't. The press names the killer once 3 murders are linked. `npm run world`
- **Gender** — every resident is a man, a woman or non-binary (about 4%). First names, portraits (beards, hair), witness descriptions ("a man struggling with…") and your fake-ID alias follow it. Couples can be same-sex.
- **Broke at a deal** — your dealer is a real person who works one alley every night. Show up without the cash and you either get **beaten** (injured 3 days: weaker in a struggle, more DNA left, ER bill), **owe them** (they hand over the goods and take what you have; you owe the rest plus 50% within 7 days; then they smash your car, then beat you, then tip off the police and cut you off for 14 days), or it **turns into a fight** where you may kill them (a real kill: sloppy scene, police case, black market closed for 5 days). A dealer who gets away never calls the police. `npm run dealer`
- **One life** — there is no new game. Get caught or surrender (only possible after your first kill) and the ending is stored permanently (`residue.final.v1`): every time the game opens, it opens on that ending. No abandon button. In dev builds the ending screen has a "Dev: wipe and start over" button; release builds never show it. Enforcing this per Steam account needs Steam Cloud / Steamworks stats, which aren't wired up yet.
- **Commute** — every shift burns fuel to drive to work and back (`commuteFor` in `src/sim/car.ts`; $1 per % of a tank). No car or no gas means the bus ($6/day). The Work page, every job ad and the car panel show the calculation: minutes each way, % per day, $/day, $/week, workdays per tank. `npm run commute`
- **Kill time** — a kill takes as long as the plan: the method (pistol 10 min … bare hands 40), extras (lure wait 30, sedative 10, trophy 15, bleach 45, tarp 15), moving the body, and disposal (proper grave 120, by hand 90, foundation 90, sink 40/20, hide 30, dumpster 15, Cleaner 40). The planner shows the breakdown, and the agenda, calendar and work absences use the real duration.
- **Patrols** — every place has a patrol rate (`src/sim/patrol.ts`): forests and lakes rarely, bars and parking garages often, more at night, more during events and after a task force forms. A found body floods its district with patrols for ~4 days and puts up **roadblocks** for ~36 hours: +15 min to drive in, your plate logged, and a body in the car can be found at the checkpoint (game over). The longer a kill takes, the likelier a patrol interrupts it. Mid-struggle the target escapes. After the kill, the body is abandoned and found on the spot. When it happens you get a system notification, a siren and a full-screen alert, and **10 real minutes** to choose run (better by car), hide (better in the dark) or give up. Do nothing and you're arrested. The clock follows real elapsed time, so it keeps going while the game is in the background.
- **Arrest → court** (`src/sim/legal.ts`) — any arrest (patrol, roadblock, a case the police build) puts you in custody: you can't plan anything and work counts you as absent. Hire a public defender (free), an attorney ($4,000) or a top lawyer ($15,000). Post bail if it was set (denied for multiple victims or a red-handed arrest). The trial is a week later: conviction odds rise with the evidence and fall with the lawyer's skill; your lawyer gives you their honest read. Guilty is game over; acquitted means you go free. Skipping court on bail brings a bench warrant and no bail. `npm run legal`
- **Money on victims** — everyone carries cash and has savings. During a kill you can leave the wallet, take the cash, or take the cash and their card. A stolen card works at grocery, pharmacy and gas station ATMs ($300 a time) until they're reported missing or found. Every use is caught on the ATM camera and shows in the victim's bank records, which point police straight at that ATM. `npm run patrol`, `npm run roadblock`
- **Framing** (`src/sim/frame.ts`) — on someone's dossier, *Take something of theirs* (1h, wherever they are at that hour) bags an item with their DNA: a glass at the bar, a cup from their desk, a cigarette butt from their trash. In the kill planner, *Leave behind* plants it at the scene. *Call the tip line* names anyone for an open case, from a burner (a store-bought one can be traced back to its purchase) or your own phone (police see your number). Police question the person and take their DNA (and do the same for any innocent suspect), so the planted sample then matches. Whether it sticks depends on the truth: a scapegoat who was on shift or out somewhere at the time is cleared, and one at home alone has no alibi. If they saw you take the item, they name you when confronted. If the same killer strikes again while they're in custody, charges are dropped and the case reopens. `npm run frame` (add `-- alibi` for the cleared case)
- **One thing at a time** — from the moment you leave home until you're back, you're busy. Nothing else can start right now: no new activity, tip call, gift, date, proposal or storage rental. You can still put things on the agenda for later. During a kill you can't pick up the phone either, so calls ring out. The HUD shows *Busy until HH:MM*.
- **Families** (`src/sim/population.ts`) — the city has two schools and children. Couples living together have babies (a 21-day pregnancy, announced to you if you know them), and children age by the calendar (one year = 112 days): baby, toddler, then school on weekdays 08:00–15:00, a phone at 12, sometimes the park after school. Kids carry almost no cash. Older saves gain schools and children when loaded. Children never witness crimes or get blamed by mistake, and you can't name a young child on the tip line.
- **Child victims** (`src/sim/anger.ts`) — *don't touch the kids.* Every child you kill makes the game angrier, and it never calms down. A missing child is still reported within hours (an Amber Alert), but the rest scales with how many children you've killed, whether or not police know it was you. Police work every case faster, and suspicion counts for more toward questioning, warrants and arrest. Patrols go up everywhere, permanently, on top of an outrage spike (*MANHUNT* in the HUD). Bystanders notice more. A reward line brings in tips. A child's case stays open longer each time (never closing after the third), and juries lean harder towards conviction. Right after each child is killed, **new cameras go up quietly across the city**, including at places you already scouted, so old scouting can't be trusted. Bail is always denied and the Cleaner won't take the job. A conviction with children among the victims ends with: *"You tried to harm a kid. The game got mad. Don't touch the kids…"* `npm run family`
- **Killing sprees** — the first two kills in any ten days are on you. Each kill beyond that, inside the same ten days, raises the spree level. You get sloppy: more DNA, prints even through gloves, weaker in a struggle. Police get faster, suspicion counts for more, patrols rise and bystanders notice more. The spree wears off as the days pass. When a spree starts, you feel it, and once bodies are turning up the news reports outside investigators joining the hunt. `npm run spree`
- **Permadeath** — the save is deleted when you're arrested. The game-over screen replays the investigation.

## Next ideas

- City map visualization, more location types, weather (rain washes evidence, snow keeps footprints)
- Alibi system (pay a friend, fake receipts), destroying CCTV
- Media / public pressure, detective personalities, multiple detectives with limited capacity
- Multiplayer: move `src/sim` to an authoritative server, with roles (killer, detective, forensics, journalist)
- Steam packaging via Electron or Tauri + steamworks.js
