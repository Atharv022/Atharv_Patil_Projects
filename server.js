// Load environment variables from .env
require('dotenv').config();

const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const multer = require('multer');                 // ⬅️ NEW
const cloudinary = require('cloudinary').v2;      // ⬅️ NEW
const path = require('path');


const app = express();
const port = 3000;
const saltRounds = 10;

// Use JWT secret from .env (fallback kept, but you should set in .env)
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-change-this';

// Core middleware
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use('/images', express.static(path.join(__dirname, 'images')));


// ✅ Global preflight/CORS handler (no wildcard route strings)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ======= DB CONNECTION =======
const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'Atharv0223', // <-- update if needed
  database: 'grocery_db',
  multipleStatements: false
});

db.connect((err) => {
  if (err) {
    console.error('❌ MySQL connection error:', err.stack);
    process.exit(1);
  }
  console.log('✅ Connected to MySQL as id', db.threadId);
});

// ======= CLOUDINARY CONFIG & MULTER (IMAGE UPLOAD) =======
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Multer: keep file in memory (no local uploads folder)
const uploadItemImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 } // 5 MB max
});

// Helper: upload image buffer to Cloudinary and return URL
const uploadBufferToCloudinary = (fileBuffer, folder = 'grocery-items') => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder },
      (error, result) => {
        if (error) return reject(error);
        resolve(result.secure_url); // Cloudinary hosted URL
      }
    );
    stream.end(fileBuffer);
  });
};

// ======= HELPERS =======
const sendError = (res, message, status = 500) => {
  console.error('API Error:', message);
  res.status(status).json({ error: message });
};

const roleMap = { Admin: 3, 'Grocery Keeper': 2, Viewer: 1 };

const authenticateRole = (requiredRoleName) => (req, res, next) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return res.status(401).json({ error: 'Authentication required.' });

  // accept both "token" and "Bearer token"
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      console.error('JWT verify failed:', err.message);
      return res.status(401).json({ error: 'Invalid or expired token.' });
    }

    const required = roleMap[requiredRoleName] ?? 0;
    const have = roleMap[decoded.roleName] ?? 0;

    if (have < required) {
      return res
        .status(403)
        .json({ error: `Access Denied: ${decoded.roleName} cannot perform this action.` });
    }

    req.user = {
      userId: decoded.userId,
      username: decoded.username,
      roleId: decoded.roleId,
      roleName: decoded.roleName
    };
    next();
  });
};

// Convenience: anyone logged in (Viewer and up)
const authenticate = authenticateRole('Viewer');

// ======= HEALTH CHECKS =======
app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'grocery-backend', time: new Date().toISOString() });
});

app.get('/api/db-health', (req, res) => {
  db.ping((err) => {
    if (err) return sendError(res, `DB ping failed: ${err.message}`);
    res.json({ ok: true });
  });
});

// ======= AUTH =======

// Login -> returns JWT
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return sendError(res, 'Username and password are required.', 400);

  const sql = `
    SELECT u.user_id, u.username, u.password_hash, u.is_active,
           r.role_name, r.role_id
    FROM users u
    LEFT JOIN user_access ua ON u.user_id = ua.user_id
    LEFT JOIN roles r ON ua.role_id = r.role_id
    WHERE u.username = ?
    LIMIT 1
  `;

  db.query(sql, [username], async (err, rows) => {
    if (err) return sendError(res, `Database error: ${err.message}`);
    if (!rows.length) return res.status(401).json({ error: 'Invalid username or password.' });

    const user = rows[0];
    if (user.is_active === 0) {
      return res.status(403).json({ error: 'User account is inactive.' });
    }

    try {
      const ok = await bcrypt.compare(password, user.password_hash || '');
      if (!ok) return res.status(401).json({ error: 'Invalid username or password.' });

      const roleName = user.role_name || 'Viewer';
      const roleId = user.role_id || null;
      const payload = { userId: user.user_id, username: user.username, roleId, roleName };
      const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });

      db.query('UPDATE users SET last_login = NOW() WHERE user_id = ?', [user.user_id], (e) => {
        if (e) console.warn('⚠️ Failed to update last_login:', e.message);
      });

      res.json({
        token,
        message: 'Login successful',
        user: { id: user.user_id, username: user.username, role: roleName, roleId }
      });
    } catch (e) {
      return sendError(res, `Auth error: ${e.message}`, 500);
    }
  });
});

// Signup -> Viewer by default
app.post('/api/signup', (req, res) => {
  const { username, password, first_name, last_name, contact, email } = req.body;
  if (!username || !password)
    return sendError(res, 'Username and password are required for signup.', 400);

  db.query('SELECT user_id FROM users WHERE username = ?', [username], async (err, rows) => {
    if (err) return sendError(res, `Database error: ${err.message}`);
    if (rows.length) return sendError(res, 'Username already exists.', 409);

    let hash;
    try {
      hash = await bcrypt.hash(password, saltRounds);
    } catch (e) {
      return sendError(res, `Password hashing failed: ${e.message}`);
    }

    db.query('SELECT role_id FROM roles WHERE role_name = ? LIMIT 1', ['Viewer'], (re, rs) => {
      if (re) return sendError(res, `Failed to fetch default role: ${re.message}`);
      const roleId = rs.length ? rs[0].role_id : null;

      db.beginTransaction((trErr) => {
        if (trErr) return sendError(res, `Transaction start failed: ${trErr.message}`);

        const newUser = {
          username,
          password_hash: hash,
          first_name: first_name || null,
          last_name: last_name || null,
          contact: contact || null,
          email: email || null,
          is_active: 1,
          created_at: new Date()
        };

        db.query('INSERT INTO users SET ?', newUser, (insErr, insRes) => {
          if (insErr) {
            if (insErr.code === 'ER_DUP_ENTRY') {
              return db.rollback(() => sendError(res, 'Username already exists.', 409));
            }
            return db.rollback(() => sendError(res, `Failed to insert user: ${insErr.message}`));
          }

          const uid = insRes.insertId;

          if (!roleId) {
            return db.commit((cErr) => {
              if (cErr)
                return db.rollback(() => sendError(res, `Commit failed: ${cErr.message}`));
              res.status(201).json({
                message: 'User signed up successfully (Viewer role missing in DB).',
                id: uid
              });
            });
          }

          db.query('INSERT INTO user_access (user_id, role_id) VALUES (?, ?)', [uid, roleId], (accErr) => {
            if (accErr) {
              return db.rollback(() =>
                sendError(res, `Failed to link user to role: ${accErr.message}`)
              );
            }
            db.commit((cErr) => {
              if (cErr)
                return db.rollback(() => sendError(res, `Commit failed: ${cErr.message}`));
              res
                .status(201)
                .json({ message: 'User signed up and Viewer role assigned.', id: uid });
            });
          });
        });
      });
    });
  });
});

// Who am I (token -> user info)
app.get('/api/me', authenticate, (req, res) => {
  res.json({
    userId: req.user.userId,
    username: req.user.username,
    roleName: req.user.roleName,
    roleId: req.user.roleId
  });
});

// Change password (auth)
app.post('/api/auth/change-password', authenticate, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword)
    return sendError(res, 'Current password and new password are required.', 400);

  const userId = req.user.userId;

  db.query('SELECT password_hash FROM users WHERE user_id = ?', [userId], async (err, rows) => {
    if (err) return sendError(res, `Database error: ${err.message}`);
    if (!rows.length) return sendError(res, 'User not found.', 404);

    try {
      const ok = await bcrypt.compare(currentPassword, rows[0].password_hash || '');
      if (!ok) return sendError(res, 'Current password is incorrect.', 400);

      const newHash = await bcrypt.hash(newPassword, saltRounds);
      db.query(
        'UPDATE users SET password_hash = ?, password_reset_token = NULL, password_reset_expires = NULL WHERE user_id = ?',
        [newHash, userId],
        (upErr) => {
          if (upErr) return sendError(res, `Failed to update password: ${upErr.message}`);
          res.json({ message: 'Password changed successfully.' });
        }
      );
    } catch (e) {
      return sendError(res, `Password change failed: ${e.message}`);
    }
  });
});

// Forgot password -> generate reset token (no auth)
app.post('/api/auth/forgot-password', (req, res) => {
  const { username } = req.body;
  if (!username) return sendError(res, 'Username is required.', 400);

  db.query('SELECT user_id FROM users WHERE username = ? LIMIT 1', [username], (err, rows) => {
    if (err) return sendError(res, `Database error: ${err.message}`);
    if (!rows.length) return sendError(res, 'User not found.', 404);

    const userId = rows[0].user_id;
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    db.query(
      'UPDATE users SET password_reset_token = ?, password_reset_expires = ? WHERE user_id = ?',
      [token, expires, userId],
      (upErr) => {
        if (upErr) return sendError(res, `Failed to set reset token: ${upErr.message}`);
        // In production, email this token
        res.json({
          message: 'Password reset token generated. (In real app you would email this.)',
          resetToken: token
        });
      }
    );
  });
});

// Reset password using token (no auth)
app.post('/api/auth/reset-password', (req, res) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword)
    return sendError(res, 'Reset token and new password are required.', 400);

  const sql = `
    SELECT user_id
    FROM users
    WHERE password_reset_token = ?
      AND password_reset_expires IS NOT NULL
      AND password_reset_expires > NOW()
    LIMIT 1
  `;

  db.query(sql, [token], async (err, rows) => {
    if (err) return sendError(res, `Database error: ${err.message}`);
    if (!rows.length) return sendError(res, 'Invalid or expired reset token.', 400);

    const userId = rows[0].user_id;
    try {
      const newHash = await bcrypt.hash(newPassword, saltRounds);
      db.query(
        'UPDATE users SET password_hash = ?, password_reset_token = NULL, password_reset_expires = NULL WHERE user_id = ?',
        [newHash, userId],
        (upErr) => {
          if (upErr) return sendError(res, `Failed to update password: ${upErr.message}`);
          res.json({ message: 'Password has been reset successfully.' });
        }
      );
    } catch (e) {
      return sendError(res, `Password reset failed: ${e.message}`);
    }
  });
});

// ======= ROLES =======
app.get('/api/roles', (req, res) => {
  db.query('SELECT role_id, role_name FROM roles ORDER BY role_id ASC', (err, rows) => {
    if (err) return sendError(res, `Database query failed: ${err.message}`);
    res.json(rows);
  });
});

// ======= USERS (ADMIN) =======

// Create user (Admin)
app.post('/api/users', authenticateRole('Admin'), async (req, res) => {
  const { username, password, first_name, last_name, contact, email, role_id } = req.body;
  if (!username || !password || !role_id)
    return sendError(res, 'Missing required fields: username, password, role_id.', 400);

  let hash;
  try {
    hash = await bcrypt.hash(password, saltRounds);
  } catch (e) {
    return sendError(res, `Password hashing failed: ${e.message}`);
  }

  const newUser = {
    username,
    password_hash: hash,
    first_name: first_name || null,
    last_name: last_name || null,
    contact: contact || null,
    email: email || null,
    is_active: 1,
    created_at: new Date()
  };

  db.beginTransaction((trErr) => {
    if (trErr) return sendError(res, `Transaction start failed: ${trErr.message}`);

    db.query('INSERT INTO users SET ?', newUser, (insErr, insRes) => {
      if (insErr) {
        if (insErr.code === 'ER_DUP_ENTRY') {
          return db.rollback(() => sendError(res, 'Username already exists.', 409));
        }
        return db.rollback(() => sendError(res, `Failed to insert user: ${insErr.message}`));
      }

      const uid = insRes.insertId;
      db.query(
        'INSERT INTO user_access (user_id, role_id) VALUES (?, ?)',
        [uid, parseInt(role_id)],
        (accErr) => {
          if (accErr) {
            return db.rollback(() => sendError(res, `Failed to assign role: ${accErr.message}`));
          }

          db.commit((cErr) => {
            if (cErr)
              return db.rollback(() => sendError(res, `Commit failed: ${cErr.message}`));
            res.status(201).json({ message: 'User registered & role assigned.', id: uid });
          });
        }
      );
    });
  });
});

// List users (Admin)
app.get('/api/users', authenticateRole('Admin'), (req, res) => {
  const sql = `
    SELECT u.user_id, u.username, u.first_name, u.last_name, u.contact, u.email,
           u.is_active, u.last_login, u.created_at,
           r.role_name, r.role_id
    FROM users u
    JOIN user_access ua ON u.user_id = ua.user_id
    JOIN roles r ON ua.role_id = r.role_id
    ORDER BY u.created_at DESC
  `;
  db.query(sql, (err, rows) => {
    if (err) return sendError(res, `Database query failed: ${err.message}`);
    res.json(rows);
  });
});

// Toggle/set user status (Admin)
app.put('/api/users/:id/status', authenticateRole('Admin'), (req, res) => {
  const { id } = req.params;
  const { is_active } = req.body; // 0/1, false/true, '0'/'1'

  if (is_active === undefined) return sendError(res, 'Missing body field: is_active', 400);
  const value = is_active === true || is_active === 1 || is_active === '1' ? 1 : 0;

  db.query('UPDATE users SET is_active = ? WHERE user_id = ?', [value, id], (err, r) => {
    if (err) return sendError(res, `Failed to update user status: ${err.message}`);
    if (r.affectedRows === 0) return sendError(res, 'User not found', 404);
    res.json({ message: `User ${value ? 'activated' : 'deactivated'}.`, user_id: Number(id), is_active: value });
  });
});

// ✅ UPDATE user (Admin) — edit profile/role/password
app.put('/api/users/:id', authenticateRole('Admin'), (req, res) => {
  const { id } = req.params;
  const { first_name, last_name, contact, email, is_active, role_id, password } = req.body;

  // Build partial update for users table
  const fields = [];
  const values = [];

  if (first_name !== undefined) { fields.push('first_name = ?'); values.push(first_name || null); }
  if (last_name !== undefined)  { fields.push('last_name = ?');  values.push(last_name || null); }
  if (contact !== undefined)    { fields.push('contact = ?');    values.push(contact || null); }
  if (email !== undefined)      { fields.push('email = ?');      values.push(email || null); }
  if (is_active !== undefined)  { fields.push('is_active = ?');  values.push(is_active ? 1 : 0); }

  db.beginTransaction(async (trErr) => {
    if (trErr) return sendError(res, `Transaction start failed: ${trErr.message}`);

    const updateUser = (cb) => {
      if (!fields.length) return cb(null);
      const sql = `UPDATE users SET ${fields.join(', ')} WHERE user_id = ?`;
      db.query(sql, [...values, id], (e, r) => {
        if (e) return cb(e);
        if (r.affectedRows === 0) return cb(new Error('User not found'));
        cb(null);
      });
    };

    const updatePassword = (cb) => {
      if (!password) return cb(null);
      bcrypt.hash(password, saltRounds)
        .then((hash) => {
          db.query(
            'UPDATE users SET password_hash = ?, password_reset_token = NULL, password_reset_expires = NULL WHERE user_id = ?',
            [hash, id],
            (e, r) => {
              if (e) return cb(e);
              if (r.affectedRows === 0) return cb(new Error('User not found'));
              cb(null);
            }
          );
        })
        .catch(cb);
    };

    const updateRole = (cb) => {
      if (!role_id) return cb(null);
      const rid = parseInt(role_id);
      db.query('UPDATE user_access SET role_id = ? WHERE user_id = ?', [rid, id], (e, r) => {
        if (e) return cb(e);
        if (r.affectedRows > 0) return cb(null);
        // if user_access row missing, insert
        db.query('INSERT INTO user_access (user_id, role_id) VALUES (?, ?)', [id, rid], (e2) => cb(e2));
      });
    };

    updateUser((e1) => {
      if (e1) return db.rollback(() => sendError(res, e1.message.includes('not found') ? 'User not found' : `Failed to update user: ${e1.message}`, e1.message.includes('not found') ? 404 : 500));

      updatePassword((e2) => {
        if (e2) return db.rollback(() => sendError(res, `Failed to update password: ${e2.message}`));

        updateRole((e3) => {
          if (e3) return db.rollback(() => sendError(res, `Failed to update role: ${e3.message}`));

          db.commit((cErr) => {
            if (cErr) return db.rollback(() => sendError(res, `Commit failed: ${cErr.message}`));
            res.json({ message: 'User updated successfully.' });
          });
        });
      });
    });
  });
});

// ✅ DELETE user (Admin)
app.delete('/api/users/:id', authenticateRole('Admin'), (req, res) => {
  const { id } = req.params;

  // Safety: don’t let an admin delete themselves
  if (Number(id) === Number(req.user.userId)) {
    return sendError(res, 'You cannot delete your own account.', 400);
  }

  db.beginTransaction((trErr) => {
    if (trErr) return sendError(res, `Transaction start failed: ${trErr.message}`);

    // If items.user_id has FK to users, set to NULL first
    db.query('UPDATE items SET user_id = NULL WHERE user_id = ?', [id], (e1) => {
      if (e1) return db.rollback(() => sendError(res, `Failed to detach items: ${e1.message}`));

      // Remove role link
      db.query('DELETE FROM user_access WHERE user_id = ?', [id], (e2) => {
        if (e2) return db.rollback(() => sendError(res, `Failed to unlink role: ${e2.message}`));

        // Remove user
        db.query('DELETE FROM users WHERE user_id = ?', [id], (e3, r3) => {
          if (e3) return db.rollback(() => sendError(res, `Failed to delete user: ${e3.message}`));
          if (r3.affectedRows === 0) return db.rollback(() => sendError(res, 'User not found', 404));

          db.commit((cErr) => {
            if (cErr) return db.rollback(() => sendError(res, `Commit failed: ${cErr.message}`));
            res.json({ message: 'User deleted successfully.' });
          });
        });
      });
    });
  });
});

// ======= ITEMS =======

// Read items (Viewer+) - now also returns variants per item
app.get('/api/items', authenticate, (req, res) => {
  const search = req.query.search;
  let sqlItems = `
    SELECT i.*, c.name AS category_name
    FROM items i
    LEFT JOIN categories c ON i.category_id = c.category_id
  `;
  const params = [];

  if (search) {
    sqlItems += ' WHERE i.name LIKE ? OR c.name LIKE ?';
    params.push(`%${search}%`, `%${search}%`);
  }

  sqlItems += ' ORDER BY i.name ASC';

  db.query(sqlItems, params, (err, items) => {
    if (err) return sendError(res, `Database query failed: ${err.message}`);

    if (!items || items.length === 0) {
      if (search) {
        // If search term but no items, mirror old behavior
        return res.status(404).json({ message: 'No items found matching search' });
      }
      return res.json([]);
    }

    const itemIds = items.map(i => i.item_id);

    // Get all variants for these items in one query
    db.query(
      'SELECT variant_id, item_id, quantity_label, price FROM item_variants WHERE item_id IN (?) ORDER BY price ASC',
      [itemIds],
      (vErr, variantRows) => {
        if (vErr) return sendError(res, `Variant query failed: ${vErr.message}`);

        const variantsByItem = {};
        (variantRows || []).forEach(v => {
          if (!variantsByItem[v.item_id]) variantsByItem[v.item_id] = [];
          variantsByItem[v.item_id].push({
            variant_id: v.variant_id,
            label: v.quantity_label,
            price: parseFloat(v.price)
          });
        });

        const enriched = items.map(it => ({
          ...it,
          variants: variantsByItem[it.item_id] || []
        }));

        res.json(enriched);
      }
    );
  });
});

// Create item (Grocery Keeper+) with optional variants
app.post('/api/items', authenticateRole('Grocery Keeper'), (req, res) => {
  const {
    name,
    category_id,
    quantity,
    cost,
    supplier,
    expiration_date,
    min_threshold,
    image_url,
    variants        // optional array of { label, price }
  } = req.body;

  if (!name || !category_id || quantity === undefined || min_threshold === undefined) {
    return sendError(res, 'Missing fields: name, category_id, quantity, min_threshold', 400);
  }

  const expDate = expiration_date ? new Date(expiration_date) : null;
  const newItem = {
    name,
    category_id: parseInt(category_id),
    quantity: parseInt(quantity),
    cost: parseFloat(cost || 0),
    supplier: supplier || null,
    expiration_date: expDate,
    min_threshold: parseInt(min_threshold),
    user_id: req.user.userId,
    image_url: image_url || null
  };

  // 1) Insert item
  db.query('INSERT INTO items SET ?', newItem, (err, r) => {
    if (err) return sendError(res, `Database insert failed: ${err.message}`);

    const itemId = r.insertId;

    // 2) If no variants provided, done
    if (!Array.isArray(variants) || variants.length === 0) {
      return res.status(201).json({ message: 'Item added successfully', id: itemId });
    }

    const variantRows = variants
      .filter(v => v && v.label && v.label.trim() !== '' && v.price !== undefined && v.price !== null)
      .map(v => [
        itemId,
        v.label.trim(),
        parseFloat(v.price)
      ]);

    if (!variantRows.length) {
      return res.status(201).json({ message: 'Item added successfully (no valid variants)', id: itemId });
    }

    db.query(
      'INSERT INTO item_variants (item_id, quantity_label, price) VALUES ?',
      [variantRows],
      (vErr) => {
        if (vErr) {
          return sendError(res, `Variant insert failed: ${vErr.message}`);
        }
        res.status(201).json({ message: 'Item and variants added successfully', id: itemId });
      }
    );
  });
});

// Update item (Grocery Keeper+) AND update variants too
app.put('/api/items/:id', authenticateRole('Grocery Keeper'), (req, res) => {
  const { id } = req.params;
  const {
    name,
    category_id,
    quantity,
    cost,
    supplier,
    expiration_date,
    min_threshold,
    image_url,
    variants   // ✅ now we also accept variants on edit
  } = req.body;

  if (!name || !category_id || quantity === undefined || min_threshold === undefined) {
    return sendError(res, 'Missing fields: name, category_id, quantity, min_threshold', 400);
  }

  const expDate = expiration_date ? new Date(expiration_date) : null;
  const updatedItem = {
    name,
    category_id: parseInt(category_id),
    quantity: parseInt(quantity),
    cost: parseFloat(cost || 0),
    supplier: supplier || null,
    expiration_date: expDate,
    min_threshold: parseInt(min_threshold),
    image_url: image_url || null
  };

  // 1) Update main item row
  db.query('UPDATE items SET ? WHERE item_id = ?', [updatedItem, id], (err, r) => {
    if (err) return sendError(res, `Database update failed: ${err.message}`);
    if (r.affectedRows === 0) return sendError(res, 'Item not found or no changes made', 404);

    // 2) If variants not sent, just finish (only item updated)
    if (!Array.isArray(variants)) {
      return res.json({ message: 'Item updated successfully' });
    }

    // 3) Clean variants → rows for insert
    const variantRows = variants
      .filter(v => v && v.label && v.label.toString().trim() !== '' && v.price !== undefined && v.price !== null)
      .map(v => [
        parseInt(id),
        v.label.toString().trim(),
        parseFloat(v.price)
      ]);

    // 4) First delete old variants for this item
    db.query('DELETE FROM item_variants WHERE item_id = ?', [id], (delErr) => {
      if (delErr) {
        return sendError(res, `Variant delete failed: ${delErr.message}`);
      }

      // If user cleared all variants, done
      if (!variantRows.length) {
        return res.json({ message: 'Item updated successfully (variants cleared)' });
      }

      // 5) Insert new variants
      db.query(
        'INSERT INTO item_variants (item_id, quantity_label, price) VALUES ?',
        [variantRows],
        (vErr) => {
          if (vErr) {
            return sendError(res, `Variant insert failed: ${vErr.message}`);
          }
          res.json({ message: 'Item and variants updated successfully' });
        }
      );
    });
  });
});


// Delete item (Admin)
app.delete('/api/items/:id', authenticateRole('Admin'), (req, res) => {
  const { id } = req.params;
  db.query('DELETE FROM items WHERE item_id = ?', [id], (err, r) => {
    if (err) return sendError(res, `Database delete failed: ${err.message}`);
    if (r.affectedRows === 0) return sendError(res, 'Item not found', 404);
    res.json({ message: 'Item deleted successfully' });
  });
});


// ======= CATEGORIES =======

// Read categories (Viewer+)
app.get('/api/categories', authenticate, (req, res) => {
  db.query('SELECT * FROM categories ORDER BY name ASC', (err, rows) => {
    if (err) return sendError(res, `Database query failed: ${err.message}`);
    res.json(rows);
  });
});

// Create category (Admin)
app.post('/api/categories', authenticateRole('Admin'), (req, res) => {
  const { name, description } = req.body;
  if (!name) return sendError(res, 'Category name is required', 400);

  const cat = { name, description: description || null };
  db.query('INSERT INTO categories SET ?', cat, (err, r) => {
    if (err) return sendError(res, `Database insert failed: ${err.message}`);
    res.status(201).json({ message: 'Category added successfully', id: r.insertId });
  });
});

// Update category (Admin)
app.put('/api/categories/:id', authenticateRole('Admin'), (req, res) => {
  const { id } = req.params;
  const { name, description } = req.body;
  if (!name) return sendError(res, 'Category name is required', 400);

  const cat = { name, description: description || null };
  db.query('UPDATE categories SET ? WHERE category_id = ?', [cat, id], (err, r) => {
    if (err) return sendError(res, `Database update failed: ${err.message}`);
    if (r.affectedRows === 0) return sendError(res, 'Category not found or no changes made', 404);
    res.json({ message: 'Category updated successfully' });
  });
});

// Delete category (Admin) — uncategorize items first
app.delete('/api/categories/:id', authenticateRole('Admin'), (req, res) => {
  const { id } = req.params;

  db.beginTransaction((trErr) => {
    if (trErr) return sendError(res, `Transaction start failed: ${trErr.message}`);

    db.query('UPDATE items SET category_id = NULL WHERE category_id = ?', [id], (uErr, uRes) => {
      if (uErr) return db.rollback(() => sendError(res, `Failed to update items: ${uErr.message}`));

      db.query('DELETE FROM categories WHERE category_id = ?', [id], (dErr, dRes) => {
        if (dErr) return db.rollback(() => sendError(res, `Failed to delete category: ${dErr.message}`));
        if (dRes.affectedRows === 0)
          return db.rollback(() => sendError(res, 'Category not found', 404));

        db.commit((cErr) => {
          if (cErr) return db.rollback(() => sendError(res, `Commit failed: ${cErr.message}`));
          res.json({ message: `Category deleted. ${uRes.affectedRows} item(s) un-categorized.` });
        });
      });
    });
  });
});


// ======================================================
// ===============   BILLING / ORDERS   =================
// ======================================================

// NOTE: Make sure you've created the tables:
// customers, orders, order_items, payments, invoices
// (I can paste the SQL again if you need.)

// Create a DRAFT order
// body: { customer_id?, items:[{item_id, qty, unit_price?}], discount_amount?, tax_percent?, notes? }
app.post('/api/orders', authenticateRole('Grocery Keeper'), (req, res) => {
  const { customer_id, items = [], discount_amount = 0, tax_percent = 0, notes } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return sendError(res, 'Order must contain at least one item.', 400);
  }

  const ids = items.map(i => Number(i.item_id)).filter(Boolean);
  if (ids.length !== items.length) return sendError(res, 'Invalid item_id(s).', 400);

  const placeholders = ids.map(() => '?').join(',');
  db.query(
    `SELECT item_id, name, cost FROM items WHERE item_id IN (${placeholders})`,
    ids,
    (err, rows) => {
      if (err) return sendError(res, `DB error: ${err.message}`);
      if (rows.length !== ids.length) return sendError(res, 'Some items not found.', 400);

      const info = new Map(rows.map(r => [r.item_id, r]));
      let subtotal = 0;

      const lines = items.map(i => {
        const meta = info.get(Number(i.item_id));
        const unit = (i.unit_price != null) ? Number(i.unit_price) : Number(meta.cost || 0);
        const qty = Number(i.qty || 0);
        const line_total = unit * qty;
        subtotal += line_total;
        return {
          item_id: i.item_id,
          item_name_snapshot: meta.name,
          qty,
          unit_price: unit,
          line_total
        };
      });

      const discount = Math.max(0, Number(discount_amount) || 0);
      const taxable = Math.max(0, subtotal - discount);
      const tax_amount = +(taxable * (Number(tax_percent) || 0) / 100).toFixed(2);
      const total_amount = +(taxable + tax_amount).toFixed(2);

      db.beginTransaction(trErr => {
        if (trErr) return sendError(res, `TX start failed: ${trErr.message}`);

        const orderRow = {
          customer_id: customer_id || null,
          cashier_user_id: req.user.userId,
          status: 'DRAFT',
          subtotal: +subtotal.toFixed(2),
          discount_amount: +discount.toFixed(2),
          tax_amount,
          total_amount,
          notes: notes || null
        };

        db.query('INSERT INTO orders SET ?', orderRow, (oErr, oRes) => {
          if (oErr) return db.rollback(() => sendError(res, `Insert order failed: ${oErr.message}`));
          const order_id = oRes.insertId;

          const values = lines.map(l => [order_id, l.item_id, l.item_name_snapshot, l.qty, l.unit_price, l.line_total]);
          db.query(
            'INSERT INTO order_items (order_id, item_id, item_name_snapshot, qty, unit_price, line_total) VALUES ?',
            [values],
            (oiErr) => {
              if (oiErr) return db.rollback(() => sendError(res, `Insert items failed: ${oiErr.message}`));
              db.commit(cErr => {
                if (cErr) return db.rollback(() => sendError(res, `Commit failed: ${cErr.message}`));
                res.status(201).json({ message: 'Order created (DRAFT).', order_id, total_amount });
              });
            }
          );
        });
      });
    }
  );
});

// Get full order (header + lines + payments)
app.get('/api/orders/:id', authenticateRole('Grocery Keeper'), (req, res) => {
  const { id } = req.params;
  db.query('SELECT * FROM orders WHERE order_id = ?', [id], (e1, oRows) => {
    if (e1) return sendError(res, `DB error: ${e1.message}`);
    if (!oRows.length) return sendError(res, 'Order not found', 404);
    db.query('SELECT * FROM order_items WHERE order_id = ?', [id], (e2, iRows) => {
      if (e2) return sendError(res, `DB error: ${e2.message}`);
      db.query('SELECT * FROM payments WHERE order_id = ?', [id], (e3, pRows) => {
        if (e3) return sendError(res, `DB error: ${e3.message}`);
        res.json({ order: oRows[0], items: iRows, payments: pRows });
      });
    });
  });
});

// Add a payment; auto-finalize to PAID when fully paid; decrement inventory
// body: { method:'CASH'|'CARD'|'UPI'|'WALLET', amount:number, txn_ref?, generate_invoice?:boolean }
app.post('/api/orders/:id/pay', authenticateRole('Grocery Keeper'), (req, res) => {
  const { id } = req.params;
  const { method, amount, txn_ref, generate_invoice } = req.body;
  if (!method || amount == null) return sendError(res, 'method and amount are required.', 400);

  db.beginTransaction(trErr => {
    if (trErr) return sendError(res, `TX start failed: ${trErr.message}`);

    db.query('SELECT * FROM orders WHERE order_id = ? FOR UPDATE', [id], (e1, oRows) => {
      if (e1) return db.rollback(() => sendError(res, `DB error: ${e1.message}`));
      if (!oRows.length) return db.rollback(() => sendError(res, 'Order not found', 404));
      const ord = oRows[0];
      if (ord.status === 'PAID') return db.rollback(() => sendError(res, 'Order already PAID.', 400));
      if (ord.status === 'CANCELLED') return db.rollback(() => sendError(res, 'Order is CANCELLED.', 400));

      db.query(
        'INSERT INTO payments (order_id, method, amount, txn_ref) VALUES (?, ?, ?, ?)',
        [id, method, Number(amount), txn_ref || null],
        (e2) => {
          if (e2) return db.rollback(() => sendError(res, `Add payment failed: ${e2.message}`));

          db.query('SELECT SUM(amount) AS paid FROM payments WHERE order_id = ?', [id], (e3, sRows) => {
            if (e3) return db.rollback(() => sendError(res, `Sum payments failed: ${e3.message}`));
            const paid = Number(sRows[0].paid || 0);
            const due = +(Number(ord.total_amount) - paid).toFixed(2);

            const finalizeIfPaid = (cb) => {
              if (due > 0) return cb(null); // still DRAFT with balance
              db.query('UPDATE orders SET status = "PAID" WHERE order_id = ?', [id], (e4) => {
                if (e4) return cb(e4);
                db.query('SELECT item_id, qty FROM order_items WHERE order_id = ?', [id], (e5, items) => {
                  if (e5) return cb(e5);
                  const step = (k) => {
                    if (k >= items.length) return cb(null);
                    const it = items[k];
                    db.query('UPDATE items SET quantity = quantity - ? WHERE item_id = ?', [it.qty, it.item_id], (e6) => {
                      if (e6) return cb(e6);
                      step(k + 1);
                    });
                  };
                  step(0);
                });
              });
            };

            finalizeIfPaid((eFin) => {
              if (eFin) return db.rollback(() => sendError(res, `Finalize failed: ${eFin.message}`));

              const maybeInvoice = () => {
                const now = new Date();
                const ymd = now.toISOString().slice(0,10).replace(/-/g,'');
                const invNo = `INV-${ymd}-${id}`;
                db.query(
                  'INSERT IGNORE INTO invoices (order_id, invoice_number) VALUES (?, ?)',
                  [id, invNo],
                  (e7) => {
                    if (e7) return db.rollback(() => sendError(res, `Invoice failed: ${e7.message}`));
                    db.commit((cErr) => {
                      if (cErr) return db.rollback(() => sendError(res, `Commit failed: ${cErr.message}`));
                      res.json({ message: due > 0 ? 'Payment added (partial).' : 'Paid in full.', paid, due, invoice_number: invNo });
                    });
                  }
                );
              };

              if (generate_invoice && due <= 0) {
                maybeInvoice();
              } else {
                db.commit((cErr) => {
                  if (cErr) return db.rollback(() => sendError(res, `Commit failed: ${cErr.message}`));
                  res.json({ message: due > 0 ? 'Payment added (partial).' : 'Paid in full.', paid, due });
                });
              }
            });
          });
        }
      );
    });
  });
});

// Cancel order (Admin). If it was PAID, restore stock.
app.post('/api/orders/:id/cancel', authenticateRole('Admin'), (req, res) => {
  const { id } = req.params;
  db.beginTransaction(trErr => {
    if (trErr) return sendError(res, `TX start failed: ${trErr.message}`);
    db.query('SELECT status FROM orders WHERE order_id = ? FOR UPDATE', [id], (e1, rows) => {
      if (e1) return db.rollback(() => sendError(res, `DB error: ${e1.message}`));
      if (!rows.length) return db.rollback(() => sendError(res, 'Order not found', 404));
      const prev = rows[0].status;

      const setCancelled = () =>
        db.query('UPDATE orders SET status = "CANCELLED" WHERE order_id = ?', [id], (e5) => {
          if (e5) return db.rollback(() => sendError(res, `Cancel failed: ${e5.message}`));
          db.commit((cErr) => {
            if (cErr) return db.rollback(() => sendError(res, `Commit failed: ${cErr.message}`));
            res.json({ message: 'Order cancelled.' });
          });
        });

      if (prev === 'PAID') {
        db.query('SELECT item_id, qty FROM order_items WHERE order_id = ?', [id], (e2, items) => {
          if (e2) return db.rollback(() => sendError(res, `Fetch lines failed: ${e2.message}`));
          const addBack = (k) => {
            if (k >= items.length) return setCancelled();
            const it = items[k];
            db.query('UPDATE items SET quantity = quantity + ? WHERE item_id = ?', [it.qty, it.item_id], (e3) => {
              if (e3) return db.rollback(() => sendError(res, `Stock restore failed: ${e3.message}`));
              addBack(k + 1);
            });
          };
          addBack(0);
        });
      } else {
        setCancelled();
      }
    });
  });
});

// ======= SERVER START =======
app.listen(port, () => {
  console.log(`✅ Backend server running at http://localhost:${port}`);
});
