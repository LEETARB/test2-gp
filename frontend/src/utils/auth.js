export const getUser = () => {
    try {
      return JSON.parse(localStorage.getItem('user'));
    } catch {
      return null;
    }
  };
  
  export const isAuthenticated = () => {
    return !!getUser();
  };
  
  export const isAdmin = () => {
    const user = getUser();
    return user?.role === 'admin';
  };
  
  export const isUser = () => {
    const user = getUser();
    return user?.role === 'user';
  };
  
  export const logout = () => {
    localStorage.removeItem('user');
  };
  
  export const getAuthHeaders = () => {
    const user = getUser();
    return {
      'Content-Type': 'application/json',
      'X-User-Id': user?.id ? String(user.id) : '',
    };
  };