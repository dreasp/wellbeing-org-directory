/**
 * MH Org Directory API
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3001;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

app.use(cors());
app.use(express.json());

// GET /api/organizations?search=mind&country=UK&category=psychiatric&city=London&visited=true&page=1&limit=50
app.get('/api/organizations', async (req, res) => {
  try {
    const { search, country, category, city, visited, page = 1, limit = 50 } = req.query;
    const conditions = [];
    const values = [];
    let i = 1;

    if (search) {
      conditions.push(`name ILIKE $${i++}`);
      values.push(`%${search}%`);
    }
    if (country) {
      conditions.push(`country = $${i++}`);
      values.push(country);
    }
    if (category) {
      conditions.push(`category ILIKE $${i++}`);
      values.push(`%${category}%`);
    }
    if (city) {
      conditions.push(`city ILIKE $${i++}`);
      values.push(`%${city}%`);
    }
    if (visited !== undefined) {
      conditions.push(`visited = $${i++}`);
      values.push(visited === 'true');
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM organizations ${whereClause}`,
      values
    );
    const total = parseInt(countResult.rows[0].count);

    values.push(parseInt(limit), offset);
    const result = await pool.query(
      `SELECT * FROM organizations ${whereClause}
       ORDER BY name ASC
       LIMIT $${i++} OFFSET $${i++}`,
      values
    );

    res.json({
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / parseInt(limit)),
      organizations: result.rows
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch organizations' });
  }
});

app.get('/api/countries', async (req, res) => {
  try {
    const result = await pool.query('SELECT DISTINCT country FROM organizations ORDER BY country');
    res.json(result.rows.map(r => r.country));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch countries' });
  }
});

app.get('/api/stats', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT country, COUNT(*) as count FROM organizations GROUP BY country ORDER BY count DESC'
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// POST /api/organizations - manually add a company
app.post('/api/organizations', async (req, res) => {
  try {
    const { name, country, city, website, category } = req.body;

    if (!name || !country) {
      return res.status(400).json({ error: 'name and country are required' });
    }

    const syntheticId = `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const result = await pool.query(
      `INSERT INTO organizations (name, country, city, website, category, registry_id, registry_source, status, visited)
       VALUES ($1, $2, $3, $4, $5, $6, 'Manual', 'active', false)
       RETURNING *`,
      [name, country, city || null, website || null, category || null, syntheticId]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to add organization' });
  }
});

// PATCH /api/organizations/:id
app.patch('/api/organizations/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, website, category, city, visited } = req.body;

    const fields = [];
    const values = [];
    let i = 1;

    if (name !== undefined) { fields.push(`name = $${i++}`); values.push(name); }
    if (website !== undefined) { fields.push(`website = $${i++}`); values.push(website); }
    if (category !== undefined) { fields.push(`category = $${i++}`); values.push(category); }
    if (city !== undefined) { fields.push(`city = $${i++}`); values.push(city); }
    if (visited !== undefined) { fields.push(`visited = $${i++}`); values.push(visited); }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No fields provided to update' });
    }

    values.push(id);
    const result = await pool.query(
      `UPDATE organizations SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update organization' });
  }
});

// DELETE /api/organizations/:id
app.delete('/api/organizations/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM organizations WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Organization not found' });
    }
    res.json({ deleted: id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete organization' });
  }
});

// POST /api/organizations/bulk-delete
app.post('/api/organizations/bulk-delete', async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids must be a non-empty array' });
    }
    const result = await pool.query(
      'DELETE FROM organizations WHERE id = ANY($1) RETURNING id',
      [ids]
    );
    res.json({ deletedCount: result.rows.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to bulk delete' });
  }
});

app.listen(PORT, () => {
  console.log(`API running at http://localhost:${PORT}`);
});
