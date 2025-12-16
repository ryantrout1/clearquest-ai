import React, { createContext, useContext, useState, useEffect } from "react";

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
  const [authState] = useState({
    user: null,
    isAuthenticated: false,
    authStatus: "ANONYMOUS"
  });

  useEffect(() => {
    console.log('[AUTH_CONTEXT] ANONYMOUS_MODE_ACTIVE — /User/me disabled');
  }, []);

  const contextValue = {
    user: null,
    isAuthenticated: false,
    authStatus: "ANONYMOUS",
    
    // No-op functions for compatibility
    login: () => {
      console.warn('[AUTH_CONTEXT] login() not supported in anonymous mode');
      return Promise.resolve(null);
    },
    
    logout: () => {
      // Clear any sessionStorage keys
      sessionStorage.removeItem("clearquest_admin_auth");
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