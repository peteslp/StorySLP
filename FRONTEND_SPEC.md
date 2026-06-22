# StorySLP Frontend Build Spec (for subagent)

You are building the React frontend for **StorySLP**, a speech-language pathology (SLP) web app.
The backend (Express + Supabase REST) is ALREADY COMPLETE. Do NOT touch `server/`, `shared/schema.ts`,
`tailwind.config.ts`, or `client/src/index.css` (theme already applied). Only build `client/src/`.

Project dir: `/home/user/workspace/storyslp`. This is the website-building/webapp fullstack template.

## What the app does (so your UI is coherent)
A clinician manages **students** + their **IEP goals**, organizes students into therapy **groups**
(students can be in MULTIPLE groups and be MOVED between groups), and generates ONE ~15-min interactive
**story per group that combines the active goals of every member** into a single narrative with per-student
**stop-points**. Then **runs sessions** scene-by-scene, scoring each goal (Correct / Correct w/ prompt / Incorrect).
Tagline: "One story. Every goal."

## HARD RULES (template constraints — follow exactly)
- wouter routing: `<Router hook={useHashLocation}>` already in App.tsx — register every page as a `<Route>`.
- ALL HTTP via `apiRequest(method, url, data?)` from `@/lib/queryClient`. NEVER raw `fetch`. For queries, set an explicit `queryFn` using apiRequest when you need POST or params; for simple GETs the default queryFn joins queryKey with "/" so use string-array keys like `["/api/groups"]` (it fetches `/api/groups`). For nested GETs like `/api/groups/3/coverage`, use a custom queryFn with apiRequest because the default joiner would produce `/api/groups/3/coverage` only if keys are `["/api/groups", 3, "coverage"]` → joined = `/api/groups/3/coverage` ✓ (joining with "/"). Verify each query key joins to the correct URL; when in doubt use a custom queryFn with apiRequest.
- NEVER use localStorage/sessionStorage/cookies/indexedDB (sandbox blocks them → crash). Use React state only.
- TanStack Query v5 object form only: `useQuery({ queryKey: [...] })`. Invalidate after mutations: `queryClient.invalidateQueries({ queryKey: [...] })`.
- `<SelectItem>` MUST have a non-empty `value` prop.
- Do NOT import React explicitly (JSX transform handles it).
- Use `import.meta.env` not `process.env` on frontend.
- Add `data-testid` to every interactive + key display element. Pattern: `button-{action}`, `input-{field}`, `text-{content}`, dynamic: `card-group-${id}`, `chip-student-${id}`.
- Headings max `text-xl` (this is an app, not a landing page). Use `font-display` (Plus Jakarta Sans) for headings/brand, `font-sans` (Nunito) for body — both already wired in tailwind.config.
- Use shadcn components from `@/components/ui/*` and lucide-react icons.
- Each student has `color` (hex). Use it as an identity chip color EVERYWHERE a student appears (inline style `backgroundColor`).

## Types (import from `@shared/schema`)
Student{id,group_id,name,grade,color}, Goal{id,student_id,label,text,goal_type,target_criteria,active},
Group{id,name,schedule,day_of_week}, GroupWithMembers extends Group {members:Student[], studentCount},
Story{id,group_id,title,status:"draft"|"approved",est_minutes,beats:Beat[],stop_points:StopPoint[],target_goal_ids:number[],...},
Beat{id,text}, StopPoint{id,afterBeatId,studentId,goalId,goalType,question,targetResponse,teachingNote,responseType:"open"|"choice",choices?},
Session{id,group_id,story_id,date,notes}, GoalLog{id,session_id,student_id,goal_id,trials,correct,prompted,note}, GoalCoverage{...}.

goal_type values: vocab, artic_s, artic_th, main_idea, restate_active, figurative. Render friendly labels via a map
(e.g. vocab→"Vocabulary / context clues", artic_s→"Articulation /s/", artic_th→"Articulation /th/", main_idea→"Main idea",
restate_active→"Restate (active voice)", figurative→"Figurative language"). Unknown → show raw.

## API (all under same origin /api)
- GET /api/students ; POST /api/students {name,grade?,color?} ; PATCH /api/students/:id ; DELETE /api/students/:id
- GET /api/students/:id/goals ; GET /api/students/:id/groups -> number[] groupIds
- POST /api/students/:id/move {to_group_id, from_group_id?}
- POST /api/goals {student_id,label,text,goal_type,target_criteria,active?} ; PATCH /api/goals/:id ; DELETE /api/goals/:id
- GET /api/groups -> GroupWithMembers[] ; POST /api/groups {name,schedule?,day_of_week?} ; PATCH /api/groups/:id ; DELETE /api/groups/:id
- POST /api/groups/:id/members {student_id} ; DELETE /api/groups/:id/members/:studentId
- GET /api/groups/:id/stories ; GET /api/groups/:id/sessions ; GET /api/groups/:id/coverage
- GET /api/stories -> all ; GET /api/stories/:id ; PATCH /api/stories/:id {status:"approved"} ; DELETE /api/stories/:id
- POST /api/stories/generate {group_id, theme?} -> creates a DRAFT story; returns story. **On 503 (response json {unavailable:true,error})** show a friendly toast: "Story generation runs in the authoring environment. Ask your StorySLP author to generate this story." Do not treat 503 as a crash.
- GET /api/sessions -> all ; GET /api/sessions/:id -> {...session, logs:GoalLog[]}
- POST /api/sessions {group_id,story_id,date?,notes?} -> {id,...} ; POST /api/sessions/:id/logs {student_id,goal_id,trials,correct,prompted,note?}

## Layout: sidebar app shell
Build `client/src/components/AppShell.tsx` (or inline in App.tsx) — a fixed left sidebar + main content area.
Sidebar: StorySLP wordmark + small SVG logo at top (a simple book/speech-bubble mark using currentColor),
tagline "One story. Every goal." in muted text, then nav links (lucide icons):
- Today (/) — CalendarCheck
- Groups (/groups) — Users
- Students & Goals (/students) — GraduationCap
- Story Library (/stories) — BookOpen
- History (/history) — History
Active link highlighted with primary. Add a dark-mode toggle button (Moon/Sun) at sidebar bottom that toggles
`document.documentElement.classList.toggle("dark")` seeded from `window.matchMedia("(prefers-color-scheme: dark)")` (NO storage).
On mobile (<768px) collapse sidebar into a top bar with a Sheet drawer (use @/components/ui/sheet) — keep it simple but not broken.
Run Session (/session/:storyId) is NOT in the sidebar (it's launched from a story); it renders full-width without distractions.

## Pages (client/src/pages/)
### 1. Today.tsx (route "/")
Launchpad. Fetch GET /api/groups. Compute today's weekday (new Date().getDay(), 0=Sun..6=Sat).
- Hero strip: brand + tagline + a one-line "what to do" helper.
- "Scheduled today" section: groups where day_of_week === today. Each as a card: name, schedule chip, member color-chips, and buttons: "Open group" (→/groups, highlight it) and if the group has an APPROVED story, "Run latest" (→/session/:storyId for newest approved). If none scheduled today, friendly empty state ("No groups scheduled today").
- "Quick links" row: cards linking to Groups, Students & Goals, Story Library.
- "At a glance" small stats: # students, # groups, # approved stories (derive from /api/students, /api/groups, /api/stories).

### 2. Groups.tsx (route "/groups")
- Header + "New group" button (Dialog form: name, schedule text, day_of_week Select 0-6 with day names + a "None" option using value="none").
- List each group as a Card: name (font-display), schedule chip + day badge, member chips (colored by student.color, showing initials or first name) with studentCount, and a row of actions: "Manage" (opens detail), "Generate story" (opens generate dialog: theme optional text → POST /api/stories/generate), "Stories (n)".
- **Group detail** (a Dialog or Sheet, opened by Manage): 
  - Members list — each row: color chip + name + grade; "Remove" (DELETE members), "Move…" button.
  - "Add student" — Select of students NOT already in group (filter by group.members) → POST /api/groups/:id/members.
  - **Move student**: in the Move dialog pick a target group (Select of other groups) and whether to keep in current group (checkbox "also keep in this group" — if unchecked, pass from_group_id = this group). POST /api/students/:studentId/move.
  - Stories for the group (GET /api/groups/:id/stories): list with status badge; "Run" (approved → /session/:id), "Approve" (draft → PATCH status approved), "Preview" (→/stories highlight), "Delete".
  - Coverage panel (GET /api/groups/:id/coverage): table of active goals (student chip, label, goal_type, accuracy or "—", last session date). Sort least-targeted first (nulls/low trials on top) so under-practiced goals surface.

### 3. Students.tsx (route "/students")
- Roster table/cards: color swatch, name, grade, and which groups they're in (fetch /api/groups once, derive membership per student). "New student" (Dialog: name, grade, color via a few preset swatches or color input). Edit + Delete (confirm via AlertDialog — deleting removes goals/logs/memberships).
- Click a student → goal manager (Dialog or expandable panel): GET /api/students/:id/goals. Each goal: label, full text, goal_type (friendly label), target_criteria, an active toggle (Switch → PATCH active), Edit, Delete. "Add goal" form (label, text textarea, goal_type Select, target_criteria e.g. "80%", active default true).

### 4. StoryLibrary.tsx (route "/stories")
- GET /api/stories (all) + GET /api/groups (for group names). Group stories under their group name.
- Each story Card: title (font-display), status badge (Draft amber / Approved teal), est_minutes, # beats, # stop-points, # students targeted. Actions: "Preview", "Approve" (if draft), "Run" (if approved → /session/:id), "Delete" (AlertDialog).
- **Preview** (Dialog): show beats in order (b1,b2…) as readable paragraphs; under each beat list its stop-points (afterBeatId === beat.id) as cards: student color-chip + name (look up via /api/students) + goal label + goalType + question + (choices if choice) + targetResponse + collapsible teachingNote.
- "Generate story" control at top: pick a group (Select) + optional theme → POST /api/stories/generate. Handle 503 gracefully (toast as described). On success, invalidate /api/stories and toast "Draft story created — preview and approve it."

### 5. RunSession.tsx (route "/session/:storyId")  ← THE CORE RUNTIME
Full-width, focused. GET /api/stories/:storyId (must be approved; if draft, show a notice + Approve button). Also GET /api/students for names/colors.
Flow state machine (React state only):
- Walk beats in order. For current beat: show beat text large + readable (font-display title "Scene N of M"). 
- Below beat, present that beat's stop-points (filter stop_points where afterBeatId===beat.id) ONE AT A TIME.
  - Each stop-point card: student color-chip + name, goal label + friendly goalType, the question (large), choices as buttons if responseType==="choice", and a collapsible "Clinician view" (default open) showing targetResponse + teachingNote.
  - A trials counter (starts 0) and three score buttons: **Correct** (correct+1, trials+1), **Correct w/ prompt** (correct+1, prompted+1, trials+1), **Incorrect** (trials+1 only). Each tap accumulates into an in-memory tally keyed by (studentId,goalId). Show running tally for the current stop-point (e.g. "2/3 correct, 1 prompted"). A "Next" button advances to the next stop-point, then next beat.
- Aggregate tallies across the whole story per (studentId,goalId): {trials,correct,prompted}.
- At the end (after last beat's last stop-point): a **Summary** screen — per student, per goal: accuracy % (correct/trials), prompted count, with a colored chip. A notes Textarea (optional). A **"Save session"** button: POST /api/sessions {group_id: story.group_id, story_id, notes} → get session id → for each (student,goal) tally POST /api/sessions/:id/logs. On success toast "Session saved" and link to History. Show isPending state on the save button.
- A persistent top bar in the runner: story title, progress (Scene N/M), and a "Quit to Story Library" link.

### 6. History.tsx (route "/history")
- GET /api/sessions (all) + /api/groups + /api/stories for names. Table: date, group name, story title, # goals logged (need per-session logs — fetch /api/sessions/:id lazily on expand, OR just show date/group/story and load logs on row click).
- Click a session → detail (Dialog): GET /api/sessions/:id → list goal_logs: student chip + goal (look up label via student goals or just goal_id) + trials/correct/prompted + accuracy.
- **"Backup (JSON)"** button: fetch /api/students, /api/groups, /api/stories, /api/sessions (and you may skip per-session logs or include them), assemble an object, and trigger a download via a Blob + anchor click (NO file system, NO storage — create `URL.createObjectURL(new Blob([...]))`, click a temp `<a download>`, revoke). Filename `storyslp-backup-YYYY-MM-DD.json`.

## Polish / quality bar
- Loading skeletons (use @/components/ui/skeleton) on every query. Empty states with a friendly line + icon. Error states (toast).
- Cards use `hover-elevate` where clickable. Generous spacing. Consistent rounded-xl. Status badges colored (Draft=amber/secondary, Approved=primary/teal).
- Mobile: pages must not overflow horizontally; tables become stacked cards under ~640px where needed.
- Friendly, warm, clinical-but-approachable tone in copy.

## Build & verify (you MUST do this before reporting done)
1. `cd /home/user/workspace/storyslp && npx tsc --noEmit` — fix ALL type errors.
2. `npm run build` — must succeed (client + server bundle). Fix any build errors.
3. Report: list of files created, confirm tsc clean + build success. Do NOT deploy — the main agent handles QA + deploy.
