# StorySLP Build Spec

A speech-language pathology (SLP) web app. Clinician manages students + IEP goals, organizes
students into therapy groups, and generates ONE ~15-min interactive story per group that
**combines the active goals of every student in that group** into a single narrative with
per-student "stop-points." Then runs sessions scene-by-scene, scoring each goal.

## Brand / Design
- Name: "StorySLP". Tagline: "One story. Every goal."
- Warm, calm, professional clinical-but-friendly. Teal primary + warm coral/amber accent on soft paper bg.
  - primary (teal): `184 60% 36%`  | accent (coral): `14 80% 62%` | warm bg `40 30% 97%`
  - Replace EVERY `red` placeholder in client/src/index.css for BOTH :root and .dark.
  - Fonts: display = "Plus Jakarta Sans", body = "Nunito" (load via <link> in client/index.html).
- Each student has a `color` (hex, already in DB) — use it as the student's identity chip color everywhere.
- Sidebar nav layout (this is an app). Pages: Today (launchpad), Groups, Students & Goals, Story Library, Run Session, History.
- Use lucide-react icons. `data-testid` on all interactive + key display elements.
- wouter with `<Router hook={useHashLocation}>`. apiRequest from @/lib/queryClient for ALL fetches.

## Supabase (EXISTING DATA — wire to these real tables; do NOT recreate)
Project URL: https://jdqdyomxtpzyqiisepfj.supabase.co
Anon key: sb_publishable_4Z0i1Njbxz1p9S5Tnk6z9w_6lHNQ0_g
Access via Supabase REST (PostgREST) using the same fetch-based pattern as the learning-platform
server/storage.ts (apikey + Authorization Bearer headers). Server-side only; client never touches Supabase.
Hardcode URL+anon key as fallbacks (process.env.SUPABASE_URL || "...").

IDs are bigint (numbers), NOT uuids. created_at columns are NOT present on these tables except none — order by id.

### Tables & columns
- students:        id(bigint pk), group_id(bigint, legacy "home" group — keep but membership is via group_members), name(text), grade(text nullable), color(text, hex)
- groups:          id(bigint pk), name(text), schedule(text nullable), day_of_week(int nullable 0=Sun..6=Sat)
- group_members:   id(bigint pk), group_id(bigint fk), student_id(bigint fk), unique(group_id,student_id)  ← NEW join table for multi-group
- goals:           id(bigint pk), student_id(bigint fk), label(text), text(text full goal), goal_type(text e.g. vocab/artic_s/artic_th/main_idea/restate_active/figurative), target_criteria(text e.g. "80%"), active(bool)
- stories:         id(bigint pk), group_id(bigint fk), title(text), status(text: draft|approved), est_minutes(int), beats_json(text), stop_points_json(text), target_goal_ids_json(text), audio_status(text: none|ready), audio_json(text), image_status(text: none|ready), images_json(text)
- sessions:        id(bigint pk), group_id(bigint fk), story_id(bigint fk), date(text ISO), notes(text nullable)
- goal_logs:       id(bigint pk), session_id(bigint fk), student_id(bigint fk), goal_id(bigint fk), trials(int), correct(int), prompted(int), note(text nullable)

### JSON shapes (MATCH EXACTLY — real existing stories use these)
beats_json: `[{ "id":"b1", "text":"..." }, ...]`  (ordered narrative scenes)
stop_points_json: `[{ "id":"s1", "afterBeatId":"b1", "studentId":1, "goalId":1, "goalType":"vocab",
  "question":"...", "targetResponse":"...", "teachingNote":"...", "responseType":"open"|"choice", "choices":["..."]? }, ...]`
target_goal_ids_json: `[1,2,3,...]`
audio_json / images_json: `{}` or arrays — leave `"none"` status + `"[]"`/`"{}"` for now (media is a later enhancement).

## API routes (server/routes.ts — thin, call storage)
GET    /api/health
# Students & goals
GET    /api/students                         -> all students
POST   /api/students {name,grade?,color?}    -> create (assign default color if none); also set group_id to first group or null
PATCH  /api/students/:id {name?,grade?,color?}
DELETE /api/students/:id                      -> permanent delete (cascades goals, group_members, goal_logs via FK)
GET    /api/students/:id/goals
POST   /api/goals {student_id,label,text,goal_type,target_criteria,active?}
PATCH  /api/goals/:id {label?,text?,goal_type?,target_criteria?,active?}
DELETE /api/goals/:id
# Groups & membership (the "switch students between groups" feature)
GET    /api/groups                            -> groups, each with members[] (joined students) and studentCount
POST   /api/groups {name,schedule?,day_of_week?}
PATCH  /api/groups/:id {name?,schedule?,day_of_week?}
DELETE /api/groups/:id
POST   /api/groups/:id/members {student_id}    -> add student to group (insert group_members)
DELETE /api/groups/:id/members/:studentId      -> remove student from group
POST   /api/students/:id/move {from_group_id?, to_group_id}  -> move: remove from from_group_id (if given) + add to to_group_id, atomic-ish
# Stories
GET    /api/groups/:id/stories                 -> stories for a group
GET    /api/stories/:id                          -> single story (parsed beats/stops)
POST   /api/stories {group_id,title,est_minutes,beats,stop_points,target_goal_ids,status?}  -> create (server JSON.stringify the arrays)
PATCH  /api/stories/:id {title?,status?,...}     -> e.g. approve (status:"approved")
DELETE /api/stories/:id
# Sessions & logging
GET    /api/groups/:id/sessions                  -> sessions for a group (with story title)
GET    /api/sessions/:id                          -> session + its goal_logs
POST   /api/sessions {group_id,story_id,date,notes?}  -> create session, returns id
POST   /api/sessions/:id/logs {student_id,goal_id,trials,correct,prompted,note?} -> upsert a goal_log for (session,student,goal)
# Goal coverage
GET    /api/groups/:id/coverage  -> per active goal of group members: total trials, total correct, last session date, accuracy; used to rank under-targeted goals

## Frontend pages
1. Today (/) — launchpad: groups scheduled today (day_of_week === today) with a "Run Session" CTA + quick links.
2. Groups (/groups) — list groups (name, schedule chip, member chips colored by student.color, count). Create group. Click group → group detail drawer/page:
   - members list with remove button; "Add student" picker (students not already in group);
   - "Move student" action: pick student + target group;
   - shows stories for the group + "Generate Story" button + Run/Approve.
3. Students & Goals (/students) — roster (name, grade, color swatch, which groups they're in). Add/edit/delete student. Click student → manage goals (add/edit/toggle active/delete). Each goal: label, full text, goal_type, target_criteria, active.
4. Story Library (/stories) — all stories grouped by group; status badge (Draft/Approved); preview (beats + stop-points by student); Approve; Generate new story for a chosen group.
5. Run Session (/session/:storyId) — runs an APPROVED story scene by scene:
   - show beat text; after each beat, show that beat's stop-points one at a time;
   - each stop-point shows: which student (colored chip) + goal label + question (+ choices if choice type) + targetResponse + teachingNote (collapsible "clinician view");
   - score buttons: Correct / Correct w/ prompt / Incorrect (and a trials counter — default each tap = 1 trial; Correct→correct+1, prompt→correct+1 & prompted+1, Incorrect→trial only);
   - at end, save a session + goal_logs aggregated per (student,goal); show summary with per-goal accuracy.
6. History (/history) — past sessions list (date, group, story, # goals logged); click → per-goal results. Plus a "Backup (JSON)" button that downloads all data as JSON.

## Story Generation (the core feature)
POST /api/stories/generate { group_id, theme?, grade_band? }
- Server gathers all ACTIVE goals of all members of the group (join group_members→students→goals where active).
- Calls an LLM (OpenAI Responses API, model gpt_5_1, via `openai` SDK — creds injected at server start with api_credentials llm-api:website) with a structured prompt to produce JSON: { title, est_minutes:15, beats:[{id,text}], stop_points:[{...as schema...}] }.
- Constraints in prompt: FERPA-safe (fictional character names, never real student names); 5-7 beats; one stop-point per goal minimum, distributed across beats; each stop-point references concrete words/phrases from the beat it follows; age-appropriate to the group's grade band; responseType "open" or "choice".
- Save as status:"draft" with target_goal_ids = all included goalIds. Return the story id.
- If LLM creds unavailable (deployed prod), return 503 with a clear message ("Story generation runs in the authoring environment"). The button should surface this gracefully.

## Tech notes
- ESM "type":"module". Express 5. Vite. Tailwind v3. Build: `npm run build` (tsx script/build.ts).
- queryClient.ts uses __PORT_5000__ placeholder → keep as-is (resolves to "" → same-origin /api on Vercel, proxy on deploy_website).
- Add X-Visitor-Id NOT needed here (data is global to the clinician, no per-visitor partition) — these tables have no user_id column. Just call /api directly.
