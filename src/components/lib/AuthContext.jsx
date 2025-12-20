import { createContext, useContext, useState, useEffect } from "react";

/**
 * ANONYMOUS-ONLY AuthContext Override
 * 
 * This file OVERRIDES any Base44 platform AuthContext to prevent /entities/User/me calls.
 * 
 * CRITICAL: This auth provider NEVER calls base44.auth.me() or any endpoint that triggers
 * /entities/User/me. It provides a minimal auth API for compatibility but operates in
 * anonymous-only mode.
 * 
 * Developer-controlled admin pages use sessionStorage.clearquest_admin_auth instead.
 */

const AuthContext = createContext({
  user: null,
  isAuthenticated: false,
  authStatus: "ANONYMOUS",
  login: () => {},
  logout: () => {},
  updateUser: () => {}
});

export function AuthProvider({ children }) {
  const [authState, setAuthState] = useState(() => {
    // Check sessionStorage for admin flag on mount
    try {
      const adminAuth = sessionStorage.getItem("clearquest_admin_auth");
      if (adminAuth) {
        const auth = JSON.parse(adminAuth);
        return {
          user: {
            first_name: auth.username,
            email: `${auth.username.toLowerCase()}@clearquest.ai`,
            role: "SUPER_ADMIN"
          },
          isAuthenticated: true,
          authStatus: "AUTHENTICATED"
        };
      }
    } catch (err) {
      console.error('[AUTH_CONTEXT] Error parsing admin auth:', err);
    }
    
    return {
      user: null,
      isAuthenticated: false,
      authStatus: "ANONYMOUS"
    };
  });

  useEffect(() => {
    const adminFlagPresent = !!sessionStorage.getItem("clearquest_admin_auth");
    console.log(`[AUTH_CONTEXT] mounted auth=DISABLED userMe=BLOCKED adminFlagPresent=${adminFlagPresent}`);
  }, []);

  const contextValue = {
    user: authState.user,
    isAuthenticated: authState.isAuthenticated,
    authStatus: authState.authStatus,
    
    // No-op functions for compatibility
    login: () => {
      console.warn('[AUTH_CONTEXT] login() not supported - use AdminLogin page');
      return Promise.resolve(null);
    },
    
    logout: () => {
      sessionStorage.removeItem("clearquest_admin_auth");
      setAuthState({
        user: null,
        isAuthenticated: false,
        authStatus: "ANONYMOUS"
      });
      console.log('[AUTH_CONTEXT] logout() — cleared sessionStorage');
    },
    
    updateUser: () => {
      console.warn('[AUTH_CONTEXT] updateUser() not supported in anonymous mode');
      return Promise.resolve(null);
    }
  };

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}

export { AuthContext };