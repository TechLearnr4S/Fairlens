export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'auditor' | 'viewer';
}

export interface AuthSession {
  user: User | null;
  token: string | null;
}
