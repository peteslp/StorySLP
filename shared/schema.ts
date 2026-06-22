// StorySLP data model — mirrors existing Supabase tables (bigint ids).
// These are plain TS types (not Drizzle) since we talk to Supabase REST directly.

export interface Student {
  id: number;
  group_id: number | null;
  name: string;
  grade: string | null;
  color: string;
}

export interface Goal {
  id: number;
  student_id: number;
  label: string;
  text: string;
  goal_type: string;
  target_criteria: string;
  active: boolean;
}

export interface Group {
  id: number;
  name: string;
  schedule: string | null;
  day_of_week: number | null; // 0=Sun .. 6=Sat
}

export interface GroupMember {
  id: number;
  group_id: number;
  student_id: number;
}

export interface GroupWithMembers extends Group {
  members: Student[];
  studentCount: number;
}

export interface StopPoint {
  id: string;
  afterBeatId: string;
  studentId: number;
  goalId: number;
  goalType: string;
  question: string;
  targetResponse: string;
  teachingNote: string;
  responseType: "open" | "choice";
  choices?: string[];
}

export interface Beat {
  id: string;
  text: string;
}

export interface Story {
  id: number;
  group_id: number;
  title: string;
  status: "draft" | "approved";
  est_minutes: number;
  beats: Beat[];
  stop_points: StopPoint[];
  target_goal_ids: number[];
  audio_status: string;
  audio_json: string;
  image_status: string;
  images_json: string;
}

export interface Session {
  id: number;
  group_id: number;
  story_id: number;
  date: string;
  notes: string | null;
}

export interface GoalLog {
  id: number;
  session_id: number;
  student_id: number;
  goal_id: number;
  trials: number;
  correct: number;
  prompted: number;
  note: string | null;
}

// Input types
export interface CreateStudentInput {
  name: string;
  grade?: string | null;
  color?: string;
}
export interface CreateGoalInput {
  student_id: number;
  label: string;
  text: string;
  goal_type: string;
  target_criteria: string;
  active?: boolean;
}
export interface CreateGroupInput {
  name: string;
  schedule?: string | null;
  day_of_week?: number | null;
}
export interface CreateStoryInput {
  group_id: number;
  title: string;
  est_minutes: number;
  beats: Beat[];
  stop_points: StopPoint[];
  target_goal_ids: number[];
  status?: "draft" | "approved";
}
export interface CreateSessionInput {
  group_id: number;
  story_id: number;
  date: string;
  notes?: string | null;
}
export interface LogInput {
  student_id: number;
  goal_id: number;
  trials: number;
  correct: number;
  prompted: number;
  note?: string | null;
}

// Coverage row used to rank under-targeted goals
export interface GoalCoverage {
  goal_id: number;
  student_id: number;
  student_name: string;
  label: string;
  goal_type: string;
  target_criteria: string;
  total_trials: number;
  total_correct: number;
  accuracy: number | null; // null when no trials
  last_session_date: string | null;
}
