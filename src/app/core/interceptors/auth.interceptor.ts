import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';

// Optional: you can inject services if needed (e.g. AuthService to check isLoggedIn)
// but for simple token-based auth, localStorage/sessionStorage is enough

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  // 1. Get token from storage
  //    - Try localStorage first (persistent login)
  //    - Or use sessionStorage if you want logout on tab close
  const token = localStorage.getItem('token') || sessionStorage.getItem('token');

  // 2. Skip adding token to certain public endpoints (optional but recommended)
  const isPublicEndpoint = 
    req.url.includes('/login') ||
    req.url.includes('/register') ||
    req.url.includes('/send-otp') ||
    req.url.includes('/verify-otp') ||
    req.url.includes('/forgot') ||
    req.url.includes('/oauth/'); // add more public routes if needed

  // 3. Clone request and add Authorization header only when token exists and it's not public
  if (token && !isPublicEndpoint) {
    const authReq = req.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`
      }
    });
    return next(authReq);
  }

  // 4. Otherwise proceed with original request
  return next(req);
};