'use client';

import { useState, useEffect } from 'react';

export function useIsAdmin(): { isAdmin: boolean; loading: boolean } {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/admin/status', { cache: 'no-store' })
      .then(res => (res.ok ? res.json() : { isAdmin: false }))
      .then(data => setIsAdmin(Boolean(data?.isAdmin)))
      .catch(() => setIsAdmin(false))
      .finally(() => setLoading(false));
  }, []);

  return { isAdmin, loading };
}
