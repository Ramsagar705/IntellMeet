export interface User {
  id: string;
  _id?: string;
  name: string;
  email: string;
  role: 'admin' | 'member';
  avatar?: string;
  bio?: string;
  jobTitle?: string;
  department?: string;
  status?: 'online' | 'away' | 'offline';
  createdAt?: string;
  updatedAt?: string;
}

export interface Workspace {
  _id?: string;
  id?: string;
  name: string;
  description?: string;
  owner: string;
  members?: Array<{ user: string; role?: string; joinedAt?: string }>;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Meeting {
  _id?: string;
  id?: string;
  title: string;
  description?: string;
  workspace: string;
  createdBy: string;
  attendees?: string[];
  status?: 'scheduled' | 'live' | 'completed';
  scheduledAt?: string;
  notes?: string;
  transcript?: string;
  summary?: string;
  actionItems?: Array<{ title: string; assignee?: string; status?: string; dueDate?: string }>;
  createdAt?: string;
  updatedAt?: string;
}

export interface DashboardStats {
  workspaces: number;
  meetings: number;
  activeMeetings: number;
  tasks: number;
  engagement: number;
  aiSummaryCoverage: number;
}
