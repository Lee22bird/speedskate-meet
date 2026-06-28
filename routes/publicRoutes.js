const express = require('express');

module.exports = function createPublicRoutes(deps = {}) {
  const router = express.Router();
  const { getSessionUser, pageShell, hasRole } = deps;

  if (typeof getSessionUser !== 'function') throw new Error('publicRoutes requires getSessionUser');
  if (typeof pageShell !== 'function') throw new Error('publicRoutes requires pageShell');
  if (typeof hasRole !== 'function') throw new Error('publicRoutes requires hasRole');

  // ── About Page ────────────────────────────────────────────────────────────────
  router.get('/about', (req, res) => {
    const data=getSessionUser(req);
    res.send(pageShell({title:'About', description:'SpeedSkateMeet was built by a skater for the skating community. Learn about our platform for inline speed skating meet management, live scoring, and race day tools.', user:data?.user||null, bodyHtml:`
      <div class="page-header">
        <h1>About SpeedSkateMeet</h1>
        <div class="sub">Built by a skater, for the skating community.</div>
      </div>

      <div class="grid-2" style="margin-bottom:24px">
        <div class="card">
          <h2>The Story</h2>
          <p style="line-height:1.7;color:var(--text)">SpeedSkateMeet was built out of frustration. Anyone who has ever run an inline speed skating meet knows the chaos — spreadsheets flying around, handwritten heat sheets, parents asking "when does my kid race?" every five minutes, and a whiteboard that nobody can read from the stands.</p>
          <p style="line-height:1.7;color:var(--text);margin-top:12px">So we built the platform we always wished existed. One place to build your meet, manage registrations, run race day, display live results on a TV, and keep parents in the loop with text alerts — all from your phone or laptop.</p>
          <p style="line-height:1.7;color:var(--text);margin-top:12px">SpeedSkateMeet is built and maintained by Lee Bird out of Wichita, Kansas. Lee has been involved in inline speed skating for years and built this platform from the ground up specifically for the inline community.</p>
        </div>
        <div class="card">
          <h2>What It Does</h2>
          <div class="stack">
            <div class="toggle-row"><div><div class="toggle-row-label">🏗️ Meet Builder</div><div class="toggle-row-desc">Set up divisions, distances, and registration — all in one place. Inline, Open, Quad, Time Trial, and Relay support.</div></div></div>
            <div class="toggle-row"><div><div class="toggle-row-label">🧱 Block Builder</div><div class="toggle-row-desc">Drag and drop races into blocks. Add breaks, lunch, and awards. Print your race list in one click.</div></div></div>
            <div class="toggle-row"><div><div class="toggle-row-label">🏁 Race Day</div><div class="toggle-row-desc">Director, judges, and announcer panels. Live scoreboard. TV display for AirPlay. Text alerts for parents.</div></div></div>
            <div class="toggle-row"><div><div class="toggle-row-label">📊 Standings</div><div class="toggle-row-desc">Automatic points, tiebreaker support (D2 and SR832), and real-time standings updated as races close.</div></div></div>
            <div class="toggle-row"><div><div class="toggle-row-label">📲 Text Alerts</div><div class="toggle-row-desc">Parents sign up and get a text when their skater is 2 races away, in staging, and when results post.</div></div></div>
          </div>
        </div>
      </div>

      <div class="grid-2" style="margin-bottom:24px">
        <div class="card">
          <h2>Who It's For</h2>
          <div class="stack">
            <div class="toggle-row"><div><div class="toggle-row-label">🎯 Meet Directors</div><div class="toggle-row-desc">Run your entire meet from one platform. No more spreadsheets, no more whiteboard standings.</div></div></div>
            <div class="toggle-row"><div><div class="toggle-row-label">🛡️ Judges</div><div class="toggle-row-desc">Clean, simple judges panel. Post times and places, close races, move on. Works great on a tablet.</div></div></div>
            <div class="toggle-row"><div><div class="toggle-row-label">📣 Announcers</div><div class="toggle-row-desc">Full skater info, team names, coming up next — everything you need to keep the crowd engaged.</div></div></div>
            <div class="toggle-row"><div><div class="toggle-row-label">🏋️ Coaches</div><div class="toggle-row-desc">See your team's upcoming races, lane assignments, recent results, and standings — all in one panel.</div></div></div>
            <div class="toggle-row"><div><div class="toggle-row-label">👨‍👩‍👧 Parents</div><div class="toggle-row-desc">Follow along on the live board or sign up for text alerts so you never miss your skater's race.</div></div></div>
          </div>
        </div>
        <div class="card">
          <h2>Get Involved</h2>
          <p style="line-height:1.7;color:var(--text);margin-bottom:16px">SpeedSkateMeet is growing. If you run meets and want to get your club on the platform, submit your meet and we'll get you set up.</p>
          <div class="stack">
            <a class="btn-orange" href="/submit-meet">Submit Your Meet</a>
            <a class="btn2" href="/meets">Find a Meet</a>
            <a class="btn2" href="/help">Help & FAQ</a>
          </div>
          <div class="hr"></div>
          <p style="line-height:1.7;color:var(--text);margin-bottom:8px">Questions? Feedback? Want to get your club set up with full race management?</p>
          <a href="mailto:LBird@speedskatemeet.com" style="color:var(--orange);font-weight:700">LBird@speedskatemeet.com</a>
        </div>
      </div>
    `}));
  });

  // ── Download (SSM Desktop) ──────────────────────────────────────────────────
  // Unlisted on purpose — not in main nav yet. Direct-link only during the
  // alpha rollout. Update DOWNLOAD_URL/DOWNLOAD_VERSION when cutting a new
  // GitHub Release (see RELEASE.md).
  router.get('/download', (req, res) => {
    const data = getSessionUser(req);
    const DOWNLOAD_URL = 'https://github.com/Lee22bird/speedskate-meet/releases/download/v0.1.0-alpha/SSM.Desktop.dmg';
    const DOWNLOAD_VERSION = '0.1.0-alpha';
    res.send(pageShell({ title: 'Download SSM Desktop', description: 'Download SpeedSkateMeet Desktop for macOS — signed and notarized, runs your meet fully offline.', user: data?.user || null, bodyHtml: `
      <div class="page-header">
        <h1>SpeedSkateMeet Desktop</h1>
        <div class="sub">Run your entire meet offline — no internet required on race day.</div>
      </div>

      <div class="card card-accent" style="margin-bottom:20px">
        <div class="row between center" style="flex-wrap:wrap;gap:16px">
          <div>
            <h2 style="margin:0 0 4px">macOS (Apple Silicon)</h2>
            <div class="note">Version ${DOWNLOAD_VERSION} • Signed &amp; notarized by Apple • ~132 MB</div>
          </div>
          <a class="btn-orange" href="${DOWNLOAD_URL}" style="font-size:16px;padding:14px 28px">⬇ Download for Mac</a>
        </div>
      </div>

      <div class="card" style="margin-bottom:16px;border-left:4px solid var(--orange)">
        <div class="danger" style="font-weight:700">Early alpha build</div>
        <p style="line-height:1.6;color:var(--text);margin-top:6px">This is an early release for testing. Expect rough edges. If something breaks, email <a href="mailto:LBird@speedskatemeet.com" style="color:var(--orange);font-weight:700">LBird@speedskatemeet.com</a>.</p>
      </div>

      <div class="grid-2">
        <div class="card">
          <h2>Installing</h2>
          <ol style="line-height:1.9;color:var(--text);padding-left:20px">
            <li>Click <strong>Download for Mac</strong> above.</li>
            <li>Open the downloaded <strong>SSM Desktop.dmg</strong> file.</li>
            <li>Drag <strong>SpeedSkateMeet</strong> into your <strong>Applications</strong> folder.</li>
            <li>Eject the DMG, then launch SpeedSkateMeet from Applications (not from the mounted DMG).</li>
          </ol>
          <p class="note" style="margin-top:8px">This build is signed and notarized by Apple, so it opens normally — no "unidentified developer" warning.</p>
        </div>
        <div class="card">
          <h2>What you get offline</h2>
          <div class="stack">
            <div class="toggle-row"><div><div class="toggle-row-label">🏗️ Full meet setup</div><div class="toggle-row-desc">Build divisions, registrations, and the race schedule with no internet connection.</div></div></div>
            <div class="toggle-row"><div><div class="toggle-row-label">🏁 Race day</div><div class="toggle-row-desc">Director, tabulator, announcer, and referee panels — all run locally on your laptop.</div></div></div>
            <div class="toggle-row"><div><div class="toggle-row-label">💾 Local data</div><div class="toggle-row-desc">Everything is saved to your Mac automatically, with daily backups.</div></div></div>
          </div>
        </div>
      </div>
    `}));
  });

  // ── Help & FAQ Page ───────────────────────────────────────────────────────────
  router.get('/help', (req, res) => {
    const data=getSessionUser(req);
    const isPortal=data?.user&&(hasRole(data.user,'meet_director')||hasRole(data.user,'super_admin'));
    res.send(pageShell({title:'Help & FAQ', description:'Complete guide to running an inline speed skating meet on SpeedSkateMeet. Learn about meet builder, block builder, race day, text alerts, scoring, and more.', user:data?.user||null, bodyHtml:`
      <div class="page-header">
        <h1>Help & FAQ</h1>
        <div class="sub">Everything you need to know about running a meet on SpeedSkateMeet.</div>
      </div>

      <div class="card" style="margin-bottom:16px">
        <div class="row" style="gap:8px;flex-wrap:wrap">
          <a href="#getting-started" class="chip" style="text-decoration:none">Getting Started</a>
          <a href="#meet-builder" class="chip" style="text-decoration:none">Meet Builder</a>
          <a href="#builders" class="chip" style="text-decoration:none">Open/Quad/TT/Relay</a>
          <a href="#block-builder" class="chip" style="text-decoration:none">Block Builder</a>
          <a href="#registration" class="chip" style="text-decoration:none">Registration</a>
          <a href="#race-day" class="chip" style="text-decoration:none">Race Day</a>
          <a href="#text-alerts" class="chip" style="text-decoration:none">Text Alerts</a>
          <a href="#coach" class="chip" style="text-decoration:none">Coach Portal</a>
          <a href="#scoring" class="chip" style="text-decoration:none">Scoring</a>
        </div>
      </div>

      <!-- Getting Started -->
      <div class="card" style="margin-bottom:16px" id="getting-started">
        <h2 style="margin-bottom:16px">🚀 Getting Started</h2>
        <div class="stack">
          <div><h3>What is SpeedSkateMeet?</h3><p style="line-height:1.7;color:var(--text)">SpeedSkateMeet is an all-in-one platform for running inline speed skating meets. It handles registration, heat assignments, race day management, live scoring, text alerts, and results — all from your browser.</p></div>
          <div class="hr"></div>
          <div><h3>How do I get a meet director account?</h3><p style="line-height:1.7;color:var(--text)">Contact Lee at <a href="mailto:LBird@speedskatemeet.com" style="color:var(--orange)">LBird@speedskatemeet.com</a> or submit your meet at <a href="/submit-meet" style="color:var(--orange)">/submit-meet</a>. Once your listing is approved we'll reach out to get you fully set up.</p></div>
          <div class="hr"></div>
          <div><h3>What's the recommended workflow for a new meet?</h3>
            <ol style="line-height:2;color:var(--text);padding-left:20px">
              <li>Meet Builder — set up divisions, distances, and open registration</li>
              <li>Open/Quad/Relay Builders — enable any special race types</li>
              <li>Skaters register publicly (or you register them in the portal)</li>
              <li>Block Builder — manually create blocks, drag races into place, and add breaks/lunch/awards</li>
              <li>Check-In — mark who showed up on race day</li>
              <li>Block Builder → Rebuild — rebalance heats with actual attendees</li>
              <li>Race Day → Director panel — run the meet</li>
            </ol>
          </div>
        </div>
      </div>

      <!-- Meet Builder -->
      <div class="card" style="margin-bottom:16px" id="meet-builder">
        <h2 style="margin-bottom:16px">🏗️ Meet Builder</h2>
        <div class="stack">
          <div><h3>What does "Save Meet" do?</h3><p style="line-height:1.7;color:var(--text)">Save Meet saves all your settings — name, date, venue, distances, toggles — without touching your races or block assignments. Use this whenever you update meet details.</p></div>
          <div class="hr"></div>
          <div><h3>What does "Rebuild Assignments" do?</h3><p style="line-height:1.7;color:var(--text)">Rebuild recalculates heats, finals, lane assignments, and race membership based on current registrations. Use it after late registrations, scratches, division changes, challenge-up changes, or lane count changes. Your manual Block Builder schedule is preserved.</p></div>
          <div class="hr"></div>
          <div><h3>What are D1, D2, D3?</h3><p style="line-height:1.7;color:var(--text)">D1, D2, and D3 are the three distance races per division per day — short, middle, and long. For example: 300m, 500m, 1000m. All three count toward overall standings points.</p></div>
          <div class="hr"></div>
          <div><h3>What's the difference between Novice and Elite?</h3><p style="line-height:1.7;color:var(--text)">Novice and Elite are skill-based classes within each age group. They race separately and have separate standings. Skaters self-select their class when registering, or the director assigns it.</p></div>
          <div class="hr"></div>
          <div><h3>What is "Challenge Up"?</h3><p style="line-height:1.7;color:var(--text)">Challenge Up allows a skater to race in a higher age division than their own. It's optional and the director controls whether it's available for their meet.</p></div>
          <div class="hr"></div>
          <div><h3>What is the Tiebreaker setting?</h3><p style="line-height:1.7;color:var(--text)">When two skaters are tied on total points, the tiebreaker determines the winner. D2 (default) uses the skater's place in the middle distance race. SR832 uses the full USARS SR832 formula with weighted scores across all three distances.</p></div>
        </div>
      </div>

      <!-- Open/Quad/TT/Relay -->
      <div class="card" style="margin-bottom:16px" id="builders">
        <h2 style="margin-bottom:16px">🏁 Open, Quad, Time Trial & Relay Builders</h2>
        <div class="stack">
          <div><h3>What is an Open race?</h3><p style="line-height:1.7;color:var(--text)">Open races are rolling-start pack finals with no lane cap. Any number of skaters can enter. Results are placement only — no points toward overall inline standings. Great for exhibition races or open divisions.</p></div>
          <div class="hr"></div>
          <div><h3>What is a Quad race?</h3><p style="line-height:1.7;color:var(--text)">Quad races are for quad skates (4-wheel inline). They use 30/20/10/5 point scoring and have their own separate standings bucket. Heat splitting works the same as inline.</p></div>
          <div class="hr"></div>
          <div><h3>What is a Time Trial?</h3><p style="line-height:1.7;color:var(--text)">Time Trials are individual races against the clock. Skaters go one at a time, judges post their time, and the system auto-sorts by fastest time. No lanes — judges just post times as skaters finish. Results show a live top 3 leaderboard.</p></div>
          <div class="hr"></div>
          <div><h3>What is a Relay race?</h3><p style="line-height:1.7;color:var(--text)">Relay races are fully manual — the director creates the race with a name and distance, and judges fill in team names, skater names, and places on race day. Relay results show in their own section and don't count toward individual standings.</p></div>
        </div>
      </div>

      <!-- Block Builder -->
      <div class="card" style="margin-bottom:16px" id="block-builder">
        <h2 style="margin-bottom:16px">🧱 Block Builder</h2>
        <div class="stack">
          <div><h3>How do I build my race schedule?</h3><p style="line-height:1.7;color:var(--text)">Click "+ Add Race Block" to create blocks (groups of races). Drag races from the Unassigned pile on the right into your blocks. Add dividers like Break, Lunch, Awards, and Practice between blocks. Block Builder is manual so meet directors can protect proper race-day flow.</p></div>
          <div class="hr"></div>
          <div><h3>What are the colored tags on races?</h3><p style="line-height:1.7;color:var(--text)">🏁 Orange = Open race. 🛼 Purple = Quad race. ⏱ Blue = Time Trial. 🔄 Blue = Relay. Plain white = standard inline race.</p></div>
          <div class="hr"></div>
          <div><h3>How do I print the race list?</h3><p style="line-height:1.7;color:var(--text)">Click "Print Race List" in the Block Builder toolbar. It opens a clean printable page with all blocks, dividers, and lane assignments. Use your browser's print function (Cmd+P on Mac).</p></div>
          <div class="hr"></div>
          <div><h3>What does "Rebuild" do in Block Builder?</h3><p style="line-height:1.7;color:var(--text)">Rebuild re-splits heats based on current check-ins and reassigns lanes. Your block structure is preserved — races stay in their blocks, only the lane assignments inside each race update. Always confirm after check-in closes before starting race day.</p></div>
        </div>
      </div>

      <!-- Registration -->
      <div class="card" style="margin-bottom:16px" id="registration">
        <h2 style="margin-bottom:16px">📋 Registration & Check-In</h2>
        <div class="stack">
          <div><h3>How do skaters register?</h3><p style="line-height:1.7;color:var(--text)">Once you publish your meet, a public registration page is available at speedskatemeet.com/meet/[id]/register. Share that link with your skaters. Directors can also register skaters manually from the Registered tab in the portal.</p></div>
          <div class="hr"></div>
          <div><h3>How does USARS age work?</h3><p style="line-height:1.7;color:var(--text)">The system uses the USARS SR150.1 rule — a skater's competitive age is calculated as the meet year minus their birth year (January 1 cutoff). So a skater born in 2015 competing in a 2026 meet is age 11, regardless of whether they've had their birthday yet.</p></div>
          <div class="hr"></div>
          <div><h3>Do I have to use Check-In?</h3><p style="line-height:1.7;color:var(--text)">No — Check-In is completely optional. You can go straight from Block Builder to Race Day and everything works fine. All registered skaters appear in the tabulator panel regardless. Check-In is only useful if you want to Rebuild heats after no-shows — it lets the system rebalance with only skaters who actually showed up. If you skip it, empty lanes just get skipped by the judge on race day.</p></div>
          <div class="hr"></div>
          <div><h3>How do I check in skaters on race day?</h3><p style="line-height:1.7;color:var(--text)">Go to the Check-In tab. Find each skater as they arrive and toggle them as checked in. After check-in closes, go to Block Builder and hit Rebuild to rebalance heats with actual attendees.</p></div>
          <div class="hr"></div>
          <div><h3>How do helmet numbers work?</h3><p style="line-height:1.7;color:var(--text)">Helmet numbers are assigned in the Registered tab. You can assign them individually or use the auto-assign button which numbers skaters sequentially. Numbers show on the tabulator panel, live board, coach panel, and text alerts.</p></div>
        </div>
      </div>

      <!-- Race Day -->
      <div class="card" style="margin-bottom:16px" id="race-day">
        <h2 style="margin-bottom:16px">🏁 Race Day</h2>
        <div class="stack">
          <div><h3>What are the Race Day sub-tabs?</h3>
            <ul style="line-height:2;color:var(--text);padding-left:20px">
              <li><strong>Director</strong> — advance races, set current race, pause/resume, open TV display</li>
              <li><strong>Tabulator</strong> — post times and places, close races</li>
              <li><strong>Announcer</strong> — clean view of current race with full skater info for the PA</li>
              <li><strong>Referee</strong> — public scoreboard, same as what parents see</li>
            </ul>
          </div>
          <div class="hr"></div>
          <div><h3>How do I advance to the next race?</h3><p style="line-height:1.7;color:var(--text)">On the Director panel, click "Next →" to move to the next race. You can also use the dropdown to jump to any race directly. The tabulator panel always shows the current race automatically.</p></div>
          <div class="hr"></div>
          <div><h3>How do judges post results?</h3><p style="line-height:1.7;color:var(--text)">On the Tabulator panel, enter places (and times for TT) for each lane. Click "Save" to save without closing, or "Close Race" to finalize the result and trigger text alerts to parents.</p></div>
          <div class="hr"></div>
          <div><h3>How do I set up the TV display?</h3><p style="line-height:1.7;color:var(--text)">On the Director panel, click "📺 TV Display" to open the full-screen scoreboard in a new tab. On your iPad or Mac, use AirPlay to mirror that tab to your Apple TV. The display auto-refreshes every 4 seconds.</p></div>
          <div class="hr"></div>
          <div><h3>What does "Unlock Race" do?</h3><p style="line-height:1.7;color:var(--text)">If a race was closed by mistake, the director can unlock it to re-open it for editing. The race goes back to open status and the director panel moves back to that race.</p></div>
          <div class="hr"></div>
          <div><h3>What is "In Staging"?</h3><p style="line-height:1.7;color:var(--text)">In Staging means the skater is one race away — they should be at the staging area right now getting ready. The system sends a text alert when a skater hits In Staging so parents and coaches know to get them to the line.</p></div>
        </div>
      </div>

      <!-- Text Alerts -->
      <div class="card" style="margin-bottom:16px" id="text-alerts">
        <h2 style="margin-bottom:16px">📲 Text Alerts</h2>
        <div class="stack">
          <div><h3>How do parents sign up for text alerts?</h3><p style="line-height:1.7;color:var(--text)">On the public meet page, click the "📲 Text Alerts" tab. Select the skater from the dropdown (type to search by name), enter a cell phone number, and click Sign Me Up. A confirmation text fires immediately.</p></div>
          <div class="hr"></div>
          <div><h3>What texts do parents receive?</h3>
            <ul style="line-height:2;color:var(--text);padding-left:20px">
              <li><strong>2 Races Away</strong> — heads up, start making your way to the track</li>
              <li><strong>In Staging</strong> — skater should be at the line right now, includes lane number</li>
              <li><strong>Result Posted</strong> — place, points earned, and total points for the day</li>
            </ul>
          </div>
          <div class="hr"></div>
          <div><h3>How do I unsubscribe from texts?</h3><p style="line-height:1.7;color:var(--text)">Reply STOP to any text message. Twilio handles unsubscribes automatically.</p></div>
          <div class="hr"></div>
          <div><h3>When do text alerts fire?</h3><p style="line-height:1.7;color:var(--text)">Alerts fire automatically when the director advances the race using the Next button. Result alerts fire when a judge clicks "Close Race". No manual action needed from the director.</p></div>
        </div>
      </div>

      <!-- Coach Portal -->
      <div class="card" style="margin-bottom:16px" id="coach">
        <h2 style="margin-bottom:16px">🏋️ Coach Portal</h2>
        <div class="stack">
          <div><h3>How does the Coach Portal work?</h3><p style="line-height:1.7;color:var(--text)">Coaches log in and see a portal specific to their team. They can see all meets their skaters are registered for, upcoming races with lane assignments, recent results, and team standings.</p></div>
          <div class="hr"></div>
          <div><h3>How does the system know which skaters are on my team?</h3><p style="line-height:1.7;color:var(--text)">The coach account has a team name assigned to it. Any skater registered with that same team name will appear in the coach's panel automatically.</p></div>
          <div class="hr"></div>
          <div><h3>What does "Racing Soon" show?</h3><p style="line-height:1.7;color:var(--text)">Racing Soon shows your team's upcoming races in order, color-coded by urgency — orange for the current race, red for In Staging, yellow for 2 races away. Lane numbers are shown for each skater. The panel auto-refreshes every 8 seconds during race day.</p></div>
        </div>
      </div>

      <!-- Scoring -->
      <div class="card" style="margin-bottom:16px" id="scoring">
        <h2 style="margin-bottom:16px">📊 Scoring & Standings</h2>
        <div class="stack">
          <div><h3>How are points awarded?</h3>
            <p style="line-height:1.7;color:var(--text)">Standard USARS inline points:</p>
            <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-top:8px;text-align:center">
              ${[['🥇 1st','30'],['🥈 2nd','20'],['🥉 3rd','15'],['4th','10'],['5th','7']].map(([p,pts])=>`<div class="card" style="padding:10px"><div style="font-size:18px">${p}</div><div style="font-weight:700;color:var(--orange)">${pts} pts</div></div>`).join('')}
            </div>
            <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-top:8px;text-align:center">
              ${[['6th','5'],['7th','4'],['8th','3'],['9th','2'],['10th','1']].map(([p,pts])=>`<div class="card" style="padding:10px"><div style="font-size:14px">${p}</div><div style="font-weight:700;color:var(--orange)">${pts} pts</div></div>`).join('')}
            </div>
          </div>
          <div class="hr"></div>
          <div><h3>What counts toward overall standings?</h3><p style="line-height:1.7;color:var(--text)">Only standard inline races (D1, D2, D3) count toward overall standings. Open races, Quad races, Time Trials, and Relay races are all placement-only and have their own separate results sections.</p></div>
          <div class="hr"></div>
          <div><h3>How does the D2 tiebreaker work?</h3><p style="line-height:1.7;color:var(--text)">When two skaters are tied on total points, the system looks at their place in the D2 (middle distance) race. The skater who placed higher in D2 wins the tiebreaker. This is the default and most commonly used method at local meets.</p></div>
          <div class="hr"></div>
          <div><h3>How does the SR832 tiebreaker work?</h3><p style="line-height:1.7;color:var(--text)">SR832 is the full USARS tiebreaker formula. It assigns weighted scores to each place across all three distance races, with different weights for short, middle, and long distances. The skater with the higher weighted total wins. Enable SR832 in Meet Builder under Tiebreaker Settings.</p></div>
          <div class="hr"></div>
          <div><h3>What does the TB badge mean on standings?</h3><p style="line-height:1.7;color:var(--text)">The TB (Tiebreaker) badge on the results page means two or more skaters were tied on points and the tiebreaker was used to determine final placement. If skaters are still tied after the tiebreaker, a run-off race is required.</p></div>
        </div>
      </div>

      <div class="card" style="text-align:center">
        <h2 style="margin-bottom:8px">Still have questions?</h2>
        <p style="color:var(--muted);margin-bottom:16px">Reach out directly — happy to help.</p>
        <a href="mailto:LBird@speedskatemeet.com" class="btn-orange">Email Lee →</a>
      </div>
    `}));
  });

  return router;
};
