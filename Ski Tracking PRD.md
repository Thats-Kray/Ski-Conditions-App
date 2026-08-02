Slopes App — Deep Dive Feature Analysis
1. Smart Run Tracking & Automatic Detection
What it does:
Slopes auto-detects the difference between skiing a run, riding a chairlift, and hiking/skinning uphill using GPS + motion data. The user simply hits "Record" at the start of the day and the app handles everything automatically — no manual lap logging required.

Key behaviors:

Detects lift vs. run vs. uphill movement in real time
Works fully offline — no cell service required (GPS only)
Activity type selection at session start: ski, snowboard, monoski, sitski, telemark, etc.
Session continues running passively in the background all day
Editable timeline after the session — users can drag start/end points to correct mis-detected runs
Stats captured per run:

Top speed, average speed
Vertical drop
Run distance
Run duration
Peak altitude
Lift name identification (auto-matched to resort map)
PRD implication for Pow Days:
Auto-detection is the table-stakes differentiator here. Manual check-in works for a social-first app, but if Pow Days ever captures real session data, auto-detection removes the biggest friction point (users forgetting to log).

2. Performance Analytics & Season History
What it does:
Every day logged rolls up into a persistent personal history — by day, by resort, by season, and across a lifetime. This turns the app from a one-session tracker into a training and progress log.

Per-day summary stats:

Total runs, total vertical, total distance
Total time on mountain vs. time on lifts
Longest run, tallest run, fastest run
Calories burned (via Apple Health integration)
Season & lifetime aggregates:

Days skied this season / all-time
Total vertical this season / all-time
Resorts visited (count + list)
Season-over-season comparisons (e.g., "you're 20% more vertical than this time last year")
Premium performance analytics:

Per-run stats breakdown (free version only shows day-level summaries)
Heart rate zones per run (with Apple Watch)
Speed distribution across the day
PRD implication for Pow Days:
This is the core retention driver — users come back because their history is inside the app. A season passport / pow day streak counter on the Pow Days profile page maps directly to this concept.

3. Run Replay & 3D Trail Maps
What it does:
Premium users can replay any recorded run on a 3D interactive map of the mountain, visualizing their exact GPS path laid over the actual terrain.

Key behaviors:

2D and 3D map modes; toggle between Trails and Satellite layers
Run replay is animated — you can scrub through the timeline
AR mode: overlay the 3D mountain model using the phone camera pointed at the actual mountain
Overlay layers: your GPS track, friends' locations, resort facilities
Interactive resort maps for 2,000+ resorts globally (US, Canada, Alps, Australia, NZ, Japan)
Map layers include: ropes, gates, slow zones, restricted areas, on-mountain facilities (bathrooms, food, ski patrol)
PRD implication for Pow Days:
The 3D replay is a premium hook that drives subscription conversion — it's the "wow" feature users demo to friends. A simpler version for Pow Days could be a GPS track overlaid on a resort map shown in the post-session summary.

4. Live Location Sharing & Friends on the Mountain
What it does:
During an active recording session, friends' live locations appear on the map inside the app. This solves the real-time coordination problem on the mountain without needing to text.

Key behaviors:

Privacy-first: location only visible to confirmed friends, not the public
User can toggle their own location sharing on/off at any time
Location visible even when a friend hasn't started recording yet (useful for finding people at the base)
Friends appear as labeled pins on the resort map overlay
Works as long as the friend has the app open
PRD implication for Pow Days:
This is the killer real-time social feature Slopes has that Pow Days doesn't. The "Who's Out Today" concept from our brainstorm is a softer version — showing check-in locations rather than live GPS, which is more privacy-friendly for a social-first product.

5. Friends, Private Leaderboards & Social Graph
What it does:
Slopes has a friends system designed explicitly around privacy — no public profiles, no usernames, no public search. Friends are connected through a private invite link only.

Friend system mechanics:

Add friends via a shareable invite link (share sheet — iMessage, AirDrop, etc.)
Friend request confirmed by both parties before any data is visible
No public profiles, no discover/search feature
Friend count shown on profile but friends list is private
Leaderboards:

8 competitive stats tracked against friends: days skied, total vertical, longest run, top speed, total distance, tallest run, most lifts ridden, total time on mountain
Leaderboards are per-season (resets annually)
Emoji reactions + commenting on leaderboard entries ("high five," tease over fails)
100% private — only visible to your friend group
PRD implication for Pow Days:
Slopes' privacy-first social graph is a deliberate design choice that reduces friction to joining. The crew model in Pow Days is similar but more explicit (named groups vs. a flat friends list). The 8-stat leaderboard is a proven engagement pattern worth replicating.

6. Trip Planning & Crew Coordination
What it does:
Users can create upcoming trips inside Slopes, invite friends, and track who is coming. The trip acts as a shared planning hub tied to the destination resort.

Key behaviors:

Create a trip: set resort, date(s), and invite friends
Friends see trip invitation and confirm attendance (coming / not coming / maybe)
Trip page shows: resort conditions, who's confirmed, invite status
Conditions data (weather forecast, snow report) displayed contextually on the trip
Friends' locations on the mountain auto-activate when a trip is active on that day
PRD implication for Pow Days:
This is almost identical to what Pow Days' Plans/Trips feature already does. Slopes' differentiator here is the tight integration between the trip and the live location feature — when a trip day arrives, the social layer activates automatically. That contextual trigger is worth building toward.

7. Resort Information & Live Conditions
What it does:
Each resort has a detail page inside Slopes with real-time and static data about that mountain.

Data points per resort:

Current snow conditions and weather forecast
Trail count by difficulty (green/blue/black/double-black)
Resort stats: vertical drop, acreage, number of lifts
Live lift & trail open/closed status (50+ North American resorts in real time)
On-mountain facilities: bathrooms, food, ski patrol, rental shops
Expected stats based on other Slopes users (e.g., "avg user logs 14 runs / 12,000 vertical here")
PRD implication for Pow Days:
Pow Days already has powder scoring via Open-Meteo. Slopes adds a layer of crowd-sourced benchmarks ("what do users typically log at this resort?") that makes the resort feel alive with data. Live lift/trail status is a high-effort feature that requires third-party data partnerships.

8. Apple Watch Integration
What it does:
Slopes has a native Apple Watch app that serves as the primary recording interface for many users — 25% of Slopes sessions are started from the wrist.

Watch capabilities:

Start/stop/pause recording from the wrist
Glanceable live stats on the watch face: current speed, vertical, run count
Heart rate data pulled from Watch sensors in real time
Calorie tracking via Apple Health Workout API (uses HK profile data: age, weight + heart rate)
Closes Apple Activity Rings for the ski workout
AirPods 3 heart rate sensor support (latest update)
Smart Stack widget appears at supported resorts automatically
PRD implication for Pow Days:
Apple Watch is a major engagement surface for athletes. It's complex to build but essential for any tracking-first ski app. Not a near-term priority for a social-first app like Pow Days, but a natural evolution once active tracking is added.

9. Sharing & Content Export
What it does:
After a session, Slopes makes it easy to share stats and highlights to social media or directly to friends.

Sharing mechanics:

Share individual runs with standout stats (e.g., "New top speed: 62 mph!")
Share day summary card — a visual recap with total vertical, runs, speed
Export to Instagram Stories, iMessage, Twitter/X
Photo attachment: add a photo from the day to accompany the stat share
Season milestone shares: "I just hit 100,000 vertical feet this season"
PRD implication for Pow Days:
Shareable stat cards are a viral growth mechanic — every share is an organic ad. The post-session recap concept from our brainstorm maps directly here. The key design insight from Slopes: share the achievement, not the raw data. "New top speed" is more compelling than a table of numbers.

10. Monetization Model
Tier	Price	What's Included
Free	$0	Unlimited tracking, key day summary stats, snow conditions, friends + location, season/lifetime overview
Day Pass	$3.99	All premium features for one day
Annual	$29.99/yr	All premium features year-round
Family	$49.99/yr	Annual for up to 5 family members
Premium gates:

Per-run performance analytics (free only gets day totals)
Interactive 2D/3D resort maps
Run replay in 3D/AR
Heart rate analytics
Live lift & trail status
PRD implication for Pow Days:
Slopes' freemium model works because the free tier is genuinely useful (unlimited tracking + social) and the premium gate is aspirational (3D replay + per-run analytics). For Pow Days, the equivalent premium gates could be: powder forecast history, advanced crew analytics, unlimited trip creation.

Summary: What Slopes Does Better Than Anyone
Capability	Slopes Strength
Auto-detection	Best in class — no manual logging ever
Privacy model	Invite-link only, no public profiles — lowers join friction
Hardware integration	Apple Watch as a first-class device (25% of sessions)
Visual replay	3D/AR run replay is the "wow" demo feature
Lifetime history	The cumulative vertical/days data creates deep lock-in
Leaderboard framing	8 specific stats with social reactions keeps it fun, not competitive
Sources:

Slopes: Ski & Snowboard — App Store
Slopes Official Site
Slopes Premium
Slopes Apple Watch
What's New — iOS
Slopes App Redefines the Modern Ski Day — SnowBrains
Slopes: The One App That Actually Works — SnowBrains
Slopes launches 3D maps & trip planning — 9to5Mac
Slopes Review — Baldy Basecamp
Major Update: Find My Friends on the Mountain — Slopes Blog
Cheatsheet: Make the Most of Slopes — Slopes Blog