export interface Project {
  id: string;
  name: string;
  type: string;
  format: string;
  file_size: number;
  created_at: string;
}

export interface Incompatibility {
  id: string;
  severity: string;
  title: string;
  description: string;
  location: string;
  tags: string[];
}

export interface ChatMessage {
  role: "user" | "agent";
  content: string;
}
