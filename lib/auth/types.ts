export interface AuthUser {
  id: string;
  email: string | null;
}

export interface AuthResult {
  user: AuthUser | null;
  error: string | null;
}

export interface AuthProvider {
  name: string;
  signUp(email: string, password: string): Promise<AuthResult>;
  signInWithPassword(email: string, password: string): Promise<AuthResult>;
  signOut(): Promise<void>;
  getUser(): Promise<AuthUser | null>;
}
