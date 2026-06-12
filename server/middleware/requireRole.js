const supabase = require('../db/supabase');

// requireRole('admin', 'operator') — pass one or more allowed roles
module.exports = function requireRole(...allowedRoles) {
  return async function (req, res, next) {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });

    const { data: { user }, error } = await supabase.auth.getUser(auth.slice(7));
    if (error || !user) return res.status(401).json({ error: 'Invalid token' });

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (!profile || !allowedRoles.includes(profile.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    req.user = user;
    req.userRole = profile.role;
    next();
  };
};
